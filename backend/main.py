from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

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
def list_users(search: str = None, limit: int = 5, db: Session = Depends(get_db)):
    query = db.query(models.User)
    
    if search:
        search_pattern = f"%{search.lower()}%"
        query = query.filter(
            (models.User.address.like(search_pattern)) | 
            (models.User.username.like(search_pattern))
        )
    
    return query.limit(limit).all()

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
        raise HTTPException(status_code=400, detail="Secret already shared with this user")

    new_grant = models.AccessGrant(
        secret_id=grant.secret_id,
        grantee_address=grant.grantee_address.lower(),
        encrypted_key=grant.encrypted_key
    )
    db.add(new_grant)
    db.commit()
    db.refresh(new_grant)
    return new_grant

@app.get("/secrets/shared-with/{address}", response_model=List[schemas.AccessGrantResponse])
def get_shared_secrets(address: str, db: Session = Depends(get_db)):
    return db.query(models.AccessGrant).filter(models.AccessGrant.grantee_address == address.lower()).all()

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
