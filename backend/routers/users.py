from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import models, schemas
from database import get_db
from dependencies import get_current_user

router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.put("/me/public-key")
def update_public_key(public_key: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    user = current_user
    user.encryption_public_key = public_key
    db.commit()
    return {"status": "ok"}

@router.put("/{address}", response_model=schemas.UserResponse)
def update_user(address: str, user_update: schemas.UserUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user.address.lower() != address.lower():
        raise HTTPException(status_code=403, detail="Not authorized to update this user")
        
    user = current_user
    
    if user_update.username is not None:
        user.username = user_update.username
        
    db.commit()
    db.refresh(user)
    return user

@router.get("/{address}", response_model=schemas.UserResponse)
def get_user(address: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.address == address.lower()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("", response_model=List[schemas.UserResponse])
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

@router.post("/resolve", response_model=schemas.UserResponse)
def resolve_user(req: UserResolveRequest, db: Session = Depends(get_db)):
    # Helper to resolve user by address (Eth or PQC)
    user = db.query(models.User).filter(models.User.address == req.address).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
