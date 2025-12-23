from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
import models, schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(
    prefix="/multisig",
    tags=["multisig"]
)

@router.post("/workflow", response_model=schemas.MultisigWorkflowResponse)
def create_multisig_workflow(workflow: schemas.MultisigWorkflowCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Create the Secret (Owned by Creator)
    new_secret = models.Secret(
        owner_address=current_user.address,
        name=workflow.secret_data.name,
        type=workflow.secret_data.type,
        encrypted_data=workflow.secret_data.encrypted_data
    )
    db.add(new_secret)
    db.commit()
    db.refresh(new_secret)

    # 2. Create Workflow
    new_workflow = models.MultisigWorkflow(
        name=workflow.name,
        owner_address=current_user.address,
        secret_id=new_secret.id,
        status="pending"
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)

    # 3. Add Signers & Their Access
    for signer_addr in workflow.signers:
        s_addr = signer_addr.lower()
        # Verify user exists (optional, or auto-create/fail?)
        # For robustness, we check if user exists. If not, we might fail or create stub.
        # Let's assume frontend ensures users exist or we fail.
        # But we need to add to WorkflowSigner
        # Validate and Store Key directly in Signer Entry (No AccessGrant)
        normalized_keys = {k.lower(): v for k, v in workflow.signer_keys.items()}
        key = normalized_keys.get(s_addr)
        
        signer_entry = models.MultisigWorkflowSigner(
            workflow_id=new_workflow.id,
            user_address=s_addr,
            has_signed=False,
            encrypted_key=key
        )
        db.add(signer_entry)

    # 4. Add Recipients (Access granted only upon completion)
    for recipient_addr in workflow.recipients:
        r_addr = recipient_addr.lower()
        key = workflow.recipient_keys.get(r_addr)
        
        # Always add recipient, even if key is deferred
        recipient_entry = models.MultisigWorkflowRecipient(
            workflow_id=new_workflow.id,
            user_address=r_addr,
            encrypted_key=key # Can be None initially
        )
        db.add(recipient_entry)

    db.commit()
    db.refresh(new_workflow)
    return new_workflow

@router.get("/workflows", response_model=List[schemas.MultisigWorkflowResponse])
def list_multisig_workflows(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Return workflows where I am owner OR signer
    # Using python filtering for simplicity unless perf is issue, OR union query.
    # Simple Union query:
    
    # Owned
    owned = db.query(models.MultisigWorkflow).filter(models.MultisigWorkflow.owner_address == current_user.address).all()
    
    # Helper to fetch workflows where I am signer
    signed_subq = db.query(models.MultisigWorkflowSigner.workflow_id).filter(models.MultisigWorkflowSigner.user_address == current_user.address)
    as_signer = db.query(models.MultisigWorkflow).filter(models.MultisigWorkflow.id.in_(signed_subq)).all()

    # Helper to fetch workflows where I am recipient (ONLY COMPLETED)
    recipient_subq = db.query(models.MultisigWorkflowRecipient.workflow_id).filter(models.MultisigWorkflowRecipient.user_address == current_user.address)
    as_recipient = db.query(models.MultisigWorkflow).filter(
        models.MultisigWorkflow.id.in_(recipient_subq),
        models.MultisigWorkflow.status == 'completed'
    ).all()
    
    # Deduplicate (if I am owner AND signer?)
    all_wf = {w.id: w for w in owned + as_signer + as_recipient}
    return list(all_wf.values())

@router.get("/workflow/{workflow_id}", response_model=schemas.MultisigWorkflowResponse)
def get_multisig_workflow(workflow_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    wf = db.query(models.MultisigWorkflow).filter(models.MultisigWorkflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    # Check permissions (Owner/Signer/Recipient?)
    is_owner = wf.owner_address == current_user.address
    is_signer = db.query(models.MultisigWorkflowSigner).filter(
        models.MultisigWorkflowSigner.workflow_id == wf.id,
        models.MultisigWorkflowSigner.user_address == current_user.address
    ).first() is not None

    is_recipient = db.query(models.MultisigWorkflowRecipient).filter(
        models.MultisigWorkflowRecipient.workflow_id == wf.id,
        models.MultisigWorkflowRecipient.user_address == current_user.address
    ).first() is not None
    
    # Access Logic: Owner/Signer always. Recipient ONLY if completed.
    has_access = is_owner or is_signer or (is_recipient and wf.status == 'completed')

    if not has_access:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    return wf

@router.post("/workflow/{workflow_id}/sign", response_model=schemas.MultisigWorkflowResponse)
def sign_multisig_workflow(workflow_id: int, sig_req: schemas.MultisigSignatureRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    wf = db.query(models.MultisigWorkflow).filter(models.MultisigWorkflow.id == workflow_id).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    signer = db.query(models.MultisigWorkflowSigner).filter(
        models.MultisigWorkflowSigner.workflow_id == wf.id,
        models.MultisigWorkflowSigner.user_address == current_user.address.lower()
    ).first()
    
    if not signer:
        raise HTTPException(status_code=403, detail="You are not a signer for this workflow")
        
    if signer.has_signed:
        raise HTTPException(status_code=400, detail="Already signed")
        
    # Update Signer
    signer.has_signed = True
    signer.signature = sig_req.signature
    signer.signed_at = datetime.now(timezone.utc)
    
    # Store Recipient Keys (Release Mechanism) if provided
    if sig_req.recipient_keys:
        for r_addr, enc_key in sig_req.recipient_keys.items():
            recipient = db.query(models.MultisigWorkflowRecipient).filter(
                models.MultisigWorkflowRecipient.workflow_id == wf.id,
                models.MultisigWorkflowRecipient.user_address == r_addr
            ).first()
            if recipient:
                recipient.encrypted_key = enc_key

    db.commit() # Commit this signature and keys first
    
    # Check if ALL have signed
    all_signers = db.query(models.MultisigWorkflowSigner).filter(models.MultisigWorkflowSigner.workflow_id == wf.id).all()
    all_signed = all(s.has_signed for s in all_signers)
    
    if all_signed:
        wf.status = "completed"
        # Release handled above via Recipient Key updates in table
        db.commit()
    
    db.refresh(wf)
    return wf
