from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    address: str

class UserCreate(UserBase):
    encryption_public_key: str

class UserUpdate(BaseModel):
    username: Optional[str] = None

class UserResponse(UserBase):
    username: Optional[str]
    encryption_public_key: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True

class SecretBase(BaseModel):
    name: str
    encrypted_data: str

class SecretCreate(SecretBase):
    pass

class SecretResponse(SecretBase):
    id: int
    owner_address: str
    created_at: datetime

    class Config:
        orm_mode = True

class AccessGrantCreate(BaseModel):
    secret_id: int
    grantee_address: str
    encrypted_key: str

class AccessGrantResponse(BaseModel):
    id: int
    secret_id: int
    grantee_address: str
    encrypted_key: str
    created_at: datetime

    class Config:
        orm_mode = True

class DocumentBase(BaseModel):
    name: str
    content_hash: str
    signature: str

class DocumentCreate(DocumentBase):
    pass

class DocumentResponse(DocumentBase):
    id: int
    owner_address: str
    created_at: datetime

    class Config:
        orm_mode = True

class LoginRequest(BaseModel):
    address: str
    signature: str
    nonce: str
    encryption_public_key: Optional[str] = None
