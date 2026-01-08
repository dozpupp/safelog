from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone, timedelta
import models, schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(tags=["secrets"]) # Secrets and Documents mixed? Or should I separate? Plan said secrets.py

# Secrets
@router.post("/secrets", response_model=schemas.SecretResponse)
def create_secret(secret: schemas.SecretCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Create Secret (Content)
    new_secret = models.Secret(
        owner_address=current_user.address,
        name=secret.name,
        type=secret.type,
        encrypted_data=secret.encrypted_data
    )
    db.add(new_secret)
    db.flush() # Flush to get ID

    # 2. Create AccessGrant for Owner (Key)
    owner_grant = models.AccessGrant(
        secret_id=new_secret.id,
        grantee_address=current_user.address,
        encrypted_key=secret.encrypted_key
    )
    db.add(owner_grant)
    db.commit()
    db.refresh(new_secret)
    
    # Manually attach encrypted_key for response
    new_secret.encrypted_key = secret.encrypted_key
    return new_secret

@router.get("/secrets", response_model=List[schemas.SecretResponse])
def get_secrets(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Fetch secrets owned by user AND their corresponding AccessGrant key
    # We join AccessGrant to get the key efficiently
    results = db.query(models.Secret, models.AccessGrant.encrypted_key)\
        .join(models.AccessGrant, (models.AccessGrant.secret_id == models.Secret.id) & (models.AccessGrant.grantee_address == current_user.address))\
        .filter(models.Secret.owner_address == current_user.address)\
        .all()
    
    response = []
    for secret, key in results:
        # Pydantic via ORM mode will read attributes. We can attach the key dynamically.
        secret.encrypted_key = key
        response.append(secret)
        
    return response

@router.put("/secrets/{secret_id}", response_model=schemas.SecretResponse)
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

@router.delete("/secrets/{secret_id}")
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

@router.post("/secrets/share", response_model=schemas.AccessGrantResponse)
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

@router.delete("/secrets/share/{grant_id}")
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

@router.get("/secrets/{secret_id}/access", response_model=List[schemas.AccessGrantResponse])
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

@router.get("/secrets/shared-with-me", response_model=List[schemas.AccessGrantResponse])
def get_shared_secrets(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    
    # query grants where grantee is me BUT secret owner is NOT me
    grants = db.query(models.AccessGrant).join(models.Secret).filter(
        models.AccessGrant.grantee_address == current_user.address,
        models.Secret.owner_address != current_user.address
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

# Documents (Keep in secrets router as per plan implication or separate if desired. "Move secrets and sharing endpoints here." Documents are kind of secrets.)
@router.post("/documents", response_model=schemas.DocumentResponse)
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

@router.get("/documents", response_model=List[schemas.DocumentResponse])
def get_documents(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Document).filter(models.Document.owner_address == current_user.address).all()
