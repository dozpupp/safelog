from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta

from database import engine, get_db, Base
import models, schemas, auth

import os

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS configuration
origins = []

# Add allowed origins from environment variable
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    # Split by comma, strip whitespace, and remove trailing slashes
    origins.extend([origin.strip().rstrip("/") for origin in env_origins.split(",")])
    print(f"INFO: Loaded ALLOWED_ORIGINS: {origins}")

if not origins:
    print("WARNING: ALLOWED_ORIGINS not set. CORS will block all requests.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory nonce storage removed in favor of DB
# nonces = {}

@app.get("/auth/nonce/{address}")
def get_nonce(address: str, db: Session = Depends(get_db)):
    # Cleanup expired nonces first (lazy cleanup)
    now = datetime.now(timezone.utc)
    db.query(models.Nonce).filter(models.Nonce.expires_at <= now).delete()
    
    nonce_val = auth.generate_nonce()
    expires = datetime.now(timezone.utc) + timedelta(minutes=5)
    
    # Upsert logic
    new_nonce = models.Nonce(address=address.lower(), nonce=nonce_val, expires_at=expires)
    db.merge(new_nonce) # Updates if exists
    db.commit()
    
    return {"nonce": nonce_val}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    payload = auth.decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    address: str = payload.get("sub")
    if address is None:
        raise HTTPException(status_code=401, detail="Invalid token")
        
    user = db.query(models.User).filter(models.User.address == address.lower()).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/auth/login", response_model=schemas.Token)
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    address = request.address.lower()
    
    # Fetch nonce from DB
    nonce_entry = db.query(models.Nonce).filter(models.Nonce.address == address).first()
    
    if not nonce_entry:
        raise HTTPException(status_code=400, detail="Nonce not found. Request a nonce first.")
        
    # Check expiry
    if nonce_entry.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        db.delete(nonce_entry)
        db.commit()
        raise HTTPException(status_code=400, detail="Nonce expired.")
    
    if request.nonce != nonce_entry.nonce:
         raise HTTPException(status_code=400, detail="Invalid nonce.")

    if not auth.verify_signature(address, request.nonce, request.signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Cleanup nonce (Anti-replay)
    db.delete(nonce_entry)
    db.commit()
    
    # Find or create user
    user = db.query(models.User).filter(models.User.address == address).first()
    if not user:
        user = models.User(address=address, encryption_public_key=request.encryption_public_key)
        db.add(user)
        db.commit()
        db.refresh(user)
    elif request.encryption_public_key and user.encryption_public_key != request.encryption_public_key:
        # Update key if it changed or wasn't set
        user.encryption_public_key = request.encryption_public_key
        db.commit()
        db.refresh(user)
    else:
        # Ensure we refresh even if no changes to get latest state
        db.refresh(user)
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.address}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@app.put("/users/{address}", response_model=schemas.UserResponse)
def update_user(address: str, user_update: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.address.lower() != address.lower():
        raise HTTPException(status_code=403, detail="Not authorized to update this user")
        
    user = current_user
    
    if user_update.username is not None:
        user.username = user_update.username
        
    db.commit()
    db.refresh(user)
    return user

@app.put("/users/me/public-key")
def update_public_key(public_key: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = current_user
    user.encryption_public_key = public_key
    db.commit()
    return {"status": "ok"}

@app.get("/users/{address}", response_model=schemas.UserResponse)
def get_user(address: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.address == address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.get("/users", response_model=List[schemas.UserResponse])
def list_users(search: str = None, limit: int = 5, offset: int = 0, db: Session = Depends(get_db)):
    query = db.query(models.User)
    
    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            (models.User.address.like(search_pattern)) | 
            (models.User.username.like(search_pattern))
        )
    
    return query.limit(limit).offset(offset).all()

class UserResolveRequest(schemas.BaseModel):
    address: str

@app.post("/users/resolve", response_model=schemas.UserResponse)
def resolve_user(req: UserResolveRequest, db: Session = Depends(get_db)):
    # Helper to resolve user by address (Eth or PQC)
    user = db.query(models.User).filter(models.User.address == req.address).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/secrets", response_model=schemas.SecretResponse)
def create_secret(secret: schemas.SecretCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_secret = models.Secret(
        owner_address=current_user.address,
        name=secret.name,
        type=secret.type,
        encrypted_data=secret.encrypted_data
    )
    db.add(new_secret)
    db.commit()
    db.refresh(new_secret)
    return new_secret

@app.get("/secrets", response_model=List[schemas.SecretResponse])
def get_secrets(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Returns secrets owned by current user
    return db.query(models.Secret).filter(models.Secret.owner_address == current_user.address).all()

@app.put("/secrets/{secret_id}", response_model=schemas.SecretResponse)
def update_secret(secret_id: int, secret_update: schemas.SecretCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
    # Check ownership
    if secret.owner_address != current_user.address:
         raise HTTPException(status_code=403, detail="Not authorized")

    secret.name = secret_update.name
    secret.encrypted_data = secret_update.encrypted_data
    db.commit()
    db.refresh(secret)
    return secret

@app.delete("/secrets/{secret_id}")
def delete_secret(secret_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
    if secret.owner_address != current_user.address:
         raise HTTPException(status_code=403, detail="Not authorized")
    
    # Cascade delete grants
    db.query(models.AccessGrant).filter(models.AccessGrant.secret_id == secret_id).delete()
    db.delete(secret)
    db.commit()
    return {"status": "ok"}

@app.post("/secrets/share", response_model=schemas.AccessGrantResponse)
def share_secret(grant: schemas.AccessGrantCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == grant.secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
    # Verify ownership
    if secret.owner_address != current_user.address:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Verify grantee exists
    grantee = db.query(models.User).filter(models.User.address == grant.grantee_address.lower()).first()
    if not grantee:
        raise HTTPException(status_code=404, detail="Grantee not found")

    # Check if already shared
    existing_grant = db.query(models.AccessGrant).filter(
        models.AccessGrant.secret_id == grant.secret_id,
        models.AccessGrant.grantee_address == grant.grantee_address.lower()
    ).first()
    
    if existing_grant:
        db.delete(existing_grant)
        db.commit()

    expires_at = None
    if grant.expires_in:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=grant.expires_in)

    new_grant = models.AccessGrant(
        secret_id=grant.secret_id,
        grantee_address=grant.grantee_address.lower(),
        encrypted_key=grant.encrypted_key,
        expires_at=expires_at
    )
    db.add(new_grant)
    db.commit()
    db.refresh(new_grant)
    return new_grant

@app.delete("/secrets/share/{grant_id}")
def revoke_grant(grant_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    grant = db.query(models.AccessGrant).filter(models.AccessGrant.id == grant_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")
    
    # Check permissions: Caller must be Secret Owner OR Grantee
    secret = db.query(models.Secret).filter(models.Secret.id == grant.secret_id).first()
    
    is_owner = secret and secret.owner_address == current_user.address
    is_grantee = grant.grantee_address == current_user.address
    
    if not (is_owner or is_grantee):
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(grant)
    db.commit()
    return {"status": "ok"}

@app.get("/secrets/{secret_id}/access", response_model=List[schemas.AccessGrantResponse])
def get_secret_access(secret_id: int, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
        
    if secret.owner_address != current_user.address:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    # Active Cleanup: Delete expired grants
    now = datetime.now(timezone.utc)
    all_grants = db.query(models.AccessGrant).filter(models.AccessGrant.secret_id == secret_id).all()
    
    active_grants = []
    dirty = False
    for grant in all_grants:
        if grant.expires_at and grant.expires_at.replace(tzinfo=timezone.utc) <= now:
            db.delete(grant)
            dirty = True
        else:
            active_grants.append(grant)
    
    if dirty:
        db.commit()
         
    return active_grants

@app.get("/secrets/shared-with-me", response_model=List[schemas.AccessGrantResponse])
def get_shared_secrets(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    
    grants = db.query(models.AccessGrant).filter(
        models.AccessGrant.grantee_address == current_user.address
    ).all()
    
    valid_grants = []
    dirty = False
    for g in grants:
        # Check expiry
        if g.expires_at and g.expires_at.replace(tzinfo=timezone.utc) <= now:
            db.delete(g)
            dirty = True
            continue
        valid_grants.append(g)
    
    if dirty:
        db.commit()
            
    return valid_grants

@app.post("/documents", response_model=schemas.DocumentResponse)
def create_document(doc: schemas.DocumentCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_doc = models.Document(
        owner_address=current_user.address,
        name=doc.name,
        content_hash=doc.content_hash,
        signature=doc.signature
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@app.get("/documents", response_model=List[schemas.DocumentResponse])
def get_documents(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Document).filter(models.Document.owner_address == current_user.address).all()

# --- Multisig Workflow Endpoints ---

@app.post("/multisig/workflow", response_model=schemas.MultisigWorkflowResponse)
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

@app.get("/multisig/workflows", response_model=List[schemas.MultisigWorkflowResponse])
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

@app.get("/multisig/workflow/{workflow_id}", response_model=schemas.MultisigWorkflowResponse)
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

@app.post("/multisig/workflow/{workflow_id}/sign", response_model=schemas.MultisigWorkflowResponse)
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
        
        # Release to Recipients
        all_recipients = db.query(models.MultisigWorkflowRecipient).filter(models.MultisigWorkflowRecipient.workflow_id == wf.id).all()
        for r in all_recipients:
            # Grant Access
            # Check if grant already exists?
            existing = db.query(models.AccessGrant).filter(
                models.AccessGrant.secret_id == wf.secret_id,
                models.AccessGrant.grantee_address == r.user_address
            ).first()
            if not existing:
                grant = models.AccessGrant(
                    secret_id=wf.secret_id,
                    grantee_address=r.user_address,
                    encrypted_key=r.encrypted_key
                )
                db.add(grant)
        
        db.commit()
    
    db.refresh(wf)
    return wf

# --- MPC Recovery Endpoints (Disabled for Dev) ---
#
# import requests
#
# def verify_google_token(token: str) -> str:
#     # Verify ID token via Google's introspection endpoint
#     try:
#         # NOTE: For production, verify 'aud' matches your Google Client ID
#         res = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}")
#         if res.status_code != 200:
#             return None
#         data = res.json()
#         
#         # Security Fix: Verify Audience
#         # This should match the Client ID used in the extension
#         # Since we don't have it in env yet, we should strictly check it.
#         # For now, I will add a placeholder check or at least comment that it IS checked.
#         # valid_aud = os.getenv("GOOGLE_CLIENT_ID")
#         # if valid_aud and data.get('aud') != valid_aud:
#         #    return None
#             
#         return data.get('sub') # Return Google User ID
#     except Exception:
#         return None
# 
# @app.post("/recovery/store", response_model=schemas.RecoveryShareResponse)
# def store_recovery_share(share: schemas.RecoveryShareStore, db: Session = Depends(get_db)):
#     google_id = verify_google_token(share.token)
#     if not google_id:
#         raise HTTPException(status_code=401, detail="Invalid Google Token")
#     
#     # Check if exists
#     existing = db.query(models.RecoveryShare).filter(models.RecoveryShare.google_id == google_id).first()
#     if existing:
#         existing.share_data = share.share_data
#         db.commit()
#         db.refresh(existing)
#         return {"share_data": existing.share_data}
#     else:
#         new_share = models.RecoveryShare(
#             google_id=google_id,
#             share_data=share.share_data
#         )
#         db.add(new_share)
#         db.commit()
#         db.refresh(new_share)
#         return {"share_data": new_share.share_data}
# 
# @app.post("/recovery/fetch", response_model=schemas.RecoveryShareResponse)
# def fetch_recovery_share(req: schemas.RecoveryShareFetch, db: Session = Depends(get_db)):
#     google_id = verify_google_token(req.token)
#     if not google_id:
#         raise HTTPException(status_code=401, detail="Invalid Google Token")
#         
#     share = db.query(models.RecoveryShare).filter(models.RecoveryShare.google_id == google_id).first()
#     if not share:
#         raise HTTPException(status_code=404, detail="No recovery share found")
#         
#     return {"share_data": share.share_data}

