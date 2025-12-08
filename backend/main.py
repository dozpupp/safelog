from fastapi import FastAPI, Depends, HTTPException, status
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
origins = [
    "http://localhost:5173", # Vite default port
    "http://127.0.0.1:5173",
    "https://safelog.hashpar.com", # Production Frontend
    "https://safeapi.hashpar.com", # Production Backend (Self)
]

# Add allowed origins from environment variable
env_origins = os.getenv("ALLOWED_ORIGINS")
if env_origins:
    origins.extend([origin.strip() for origin in env_origins.split(",")])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory nonce storage for simplicity (use Redis in production)
nonces = {}

@app.get("/auth/nonce/{address}")
def get_nonce(address: str):
    nonce = auth.generate_nonce()
    nonces[address.lower()] = nonce
    return {"nonce": nonce}

@app.post("/auth/login", response_model=schemas.UserResponse)
def login(request: schemas.LoginRequest, db: Session = Depends(get_db)):
    address = request.address.lower()
    expected_nonce = nonces.get(address)
    
    if not expected_nonce:
        raise HTTPException(status_code=400, detail="Nonce not found. Request a nonce first.")
    
    # Verify that the nonce matches what we sent (simple check)
    # In a stricter implementation, we'd verify the signature covers this nonce.
    # The auth.verify_signature function reconstructs the message with the nonce.
    if request.nonce != expected_nonce:
         raise HTTPException(status_code=400, detail="Invalid nonce.")

    if not auth.verify_signature(address, request.nonce, request.signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Cleanup nonce
    del nonces[address]
    
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
    
    return user

@app.put("/users/{address}", response_model=schemas.UserResponse)
def update_user(address: str, user_update: schemas.UserUpdate, db: Session = Depends(get_db)):
    # In a real app, we'd need to authenticate this request with a token/session.
    # For this MVP, we'll accept the address param but this is insecure.
    # TODO: Add JWT or session middleware.
    user = db.query(models.User).filter(models.User.address == address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user_update.username is not None:
        user.username = user_update.username
        
    db.commit()
    db.refresh(user)
    return user

@app.put("/users/me/public-key")
def update_public_key(public_key: str, address: str, db: Session = Depends(get_db)):
    # Keeping this for backward compatibility if needed, but we can also use the new endpoint
    user = db.query(models.User).filter(models.User.address == address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
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

@app.post("/secrets", response_model=schemas.SecretResponse)
def create_secret(secret: schemas.SecretCreate, owner_address: str, db: Session = Depends(get_db)):
    # Again, need auth.
    user = db.query(models.User).filter(models.User.address == owner_address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    new_secret = models.Secret(
        owner_address=owner_address.lower(),
        name=secret.name,
        encrypted_data=secret.encrypted_data
    )
    db.add(new_secret)
    db.commit()
    db.refresh(new_secret)
    return new_secret

@app.get("/secrets/{address}", response_model=List[schemas.SecretResponse])
def get_secrets(address: str, db: Session = Depends(get_db)):
    # Returns secrets owned by address
    return db.query(models.Secret).filter(models.Secret.owner_address == address.lower()).all()

@app.put("/secrets/{secret_id}", response_model=schemas.SecretResponse)
def update_secret(secret_id: int, secret_update: schemas.SecretCreate, owner_address: str, db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
    # Check ownership
    if secret.owner_address.lower() != owner_address.lower():
         raise HTTPException(status_code=403, detail="Not authorized")

    secret.name = secret_update.name
    secret.encrypted_data = secret_update.encrypted_data
    db.commit()
    db.refresh(secret)
    return secret

@app.delete("/secrets/{secret_id}")
def delete_secret(secret_id: int, owner_address: str, db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
    if secret.owner_address.lower() != owner_address.lower():
         raise HTTPException(status_code=403, detail="Not authorized")
    
    # Cascade delete grants
    db.query(models.AccessGrant).filter(models.AccessGrant.secret_id == secret_id).delete()
    db.delete(secret)
    db.commit()
    return {"status": "ok"}

@app.post("/secrets/share", response_model=schemas.AccessGrantResponse)
def share_secret(grant: schemas.AccessGrantCreate, db: Session = Depends(get_db)):
    # Verify secret exists and caller is owner (skip auth for MVP but assume caller is owner)
    # In real app: check current_user.address == secret.owner_address
    secret = db.query(models.Secret).filter(models.Secret.id == grant.secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
    
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
        # If trying to share again, maybe update expiration? For now just error or update.
        # Let's delete old and create new to reset state/expiry
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
def revoke_grant(grant_id: int, caller_address: str, db: Session = Depends(get_db)):
    grant = db.query(models.AccessGrant).filter(models.AccessGrant.id == grant_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")
    
    # Check permissions: Caller must be Secret Owner OR Grantee
    secret = db.query(models.Secret).filter(models.Secret.id == grant.secret_id).first()
    
    is_owner = secret and secret.owner_address.lower() == caller_address.lower()
    is_grantee = grant.grantee_address.lower() == caller_address.lower()
    
    if not (is_owner or is_grantee):
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(grant)
    db.commit()
    return {"status": "ok"}

@app.get("/secrets/{secret_id}/access", response_model=List[schemas.AccessGrantResponse])
def get_secret_access(secret_id: int, caller_address: str, db: Session = Depends(get_db)):
    secret = db.query(models.Secret).filter(models.Secret.id == secret_id).first()
    if not secret:
        raise HTTPException(status_code=404, detail="Secret not found")
        
    if secret.owner_address.lower() != caller_address.lower():
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

@app.get("/secrets/shared-with/{address}", response_model=List[schemas.AccessGrantResponse])
def get_shared_secrets(address: str, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    
    grants = db.query(models.AccessGrant).filter(
        models.AccessGrant.grantee_address == address.lower()
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
def create_document(doc: schemas.DocumentCreate, owner_address: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.address == owner_address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_doc = models.Document(
        owner_address=owner_address.lower(),
        name=doc.name,
        content_hash=doc.content_hash,
        signature=doc.signature
    )
    db.add(new_doc)
    db.commit()
    db.refresh(new_doc)
    return new_doc

@app.get("/documents/{address}", response_model=List[schemas.DocumentResponse])
def get_documents(address: str, db: Session = Depends(get_db)):
    return db.query(models.Document).filter(models.Document.owner_address == address.lower()).all()

# --- MPC Recovery Endpoints ---

import requests

def verify_google_token(token: str) -> str:
    # Verify ID token via Google's introspection endpoint
    try:
        # NOTE: For production, verify 'aud' matches your Google Client ID
        res = requests.get(f"https://oauth2.googleapis.com/tokeninfo?id_token={token}")
        if res.status_code != 200:
            return None
        data = res.json()
        return data.get('sub') # Return Google User ID
    except Exception:
        return None

@app.post("/recovery/store", response_model=schemas.RecoveryShareResponse)
def store_recovery_share(share: schemas.RecoveryShareStore, db: Session = Depends(get_db)):
    google_id = verify_google_token(share.token)
    if not google_id:
        raise HTTPException(status_code=401, detail="Invalid Google Token")
    
    # Check if exists
    existing = db.query(models.RecoveryShare).filter(models.RecoveryShare.google_id == google_id).first()
    if existing:
        existing.share_data = share.share_data
        db.commit()
        db.refresh(existing)
        return {"share_data": existing.share_data}
    else:
        new_share = models.RecoveryShare(
            google_id=google_id,
            share_data=share.share_data
        )
        db.add(new_share)
        db.commit()
        db.refresh(new_share)
        return {"share_data": new_share.share_data}

@app.post("/recovery/fetch", response_model=schemas.RecoveryShareResponse)
def fetch_recovery_share(req: schemas.RecoveryShareFetch, db: Session = Depends(get_db)):
    google_id = verify_google_token(req.token)
    if not google_id:
        raise HTTPException(status_code=401, detail="Invalid Google Token")
        
    share = db.query(models.RecoveryShare).filter(models.RecoveryShare.google_id == google_id).first()
    if not share:
        raise HTTPException(status_code=404, detail="No recovery share found")
        
    return {"share_data": share.share_data}

