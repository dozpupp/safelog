from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class UserBase(BaseModel):
    address: str = Field(..., max_length=20000)

class UserCreate(UserBase):
    encryption_public_key: str = Field(..., max_length=20000)

class UserUpdate(BaseModel):
    username: Optional[str] = Field(None, max_length=200)

class UserResponse(UserBase):
    username: Optional[str]
    encryption_public_key: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True

class SecretBase(BaseModel):
    name: str = Field(..., max_length=200)
    type: str = Field("standard") # 'standard' | 'signed_document'
    # 50MB limit for encrypted files (50 * 1024 * 1024 approx 52 million chars)
    # Base64 overhead typically 33%, so a 35MB file becomes ~48MB text.
    encrypted_data: str = Field(..., max_length=52_500_000)

class SecretCreate(SecretBase):
    pass

class SecretResponse(SecretBase):
    id: int
    owner_address: str
    created_at: datetime
    owner: UserResponse

    class Config:
        orm_mode = True

class AccessGrantCreate(BaseModel):
    secret_id: int
    grantee_address: str = Field(..., max_length=20000)
    encrypted_key: str = Field(..., max_length=52_500_000)
    expires_in: Optional[int] = None # Seconds

class AccessGrantResponse(BaseModel):
    id: int
    secret_id: int
    grantee_address: str
    encrypted_key: str
    created_at: datetime
    expires_at: Optional[datetime]
    secret: SecretResponse
    grantee: Optional[UserResponse]

    class Config:
        orm_mode = True

class DocumentBase(BaseModel):
    name: str = Field(..., max_length=200)
    content_hash: str = Field(..., max_length=500)
    signature: str = Field(..., max_length=20000)

class DocumentCreate(DocumentBase):
    pass

class DocumentResponse(DocumentBase):
    id: int
    owner_address: str
    created_at: datetime

    class Config:
        orm_mode = True

class LoginRequest(BaseModel):
    address: str = Field(..., max_length=20000)
    signature: str = Field(..., max_length=20000)
    nonce: str = Field(..., max_length=200)
    encryption_public_key: Optional[str] = Field(None, max_length=20000)

class RecoveryShareStore(BaseModel):
    token: str = Field(..., max_length=50000) # Google Tokens can be long-ish
    share_data: str = Field(..., max_length=50000) # MPC share checks

class RecoveryShareFetch(BaseModel):
    token: str = Field(..., max_length=50000)

class RecoveryShareResponse(BaseModel):
    share_data: str


class MultisigWorkflowBase(BaseModel):
    name: str = Field(..., max_length=200)

class MultisigWorkflowCreate(MultisigWorkflowBase):
    secret_data: SecretCreate # Embedded secret creation
    signers: List[str] # List of addresses
    recipients: List[str] # List of addresses
    signer_keys: dict[str, str] # map address -> encrypted_key
    recipient_keys: dict[str, str] # map address -> encrypted_key

class MultisigWorkflowSignerResponse(BaseModel):
    user_address: str
    has_signed: bool
    signature: Optional[str] = None
    signed_at: Optional[datetime]
    user: Optional[UserResponse]

    class Config:
        orm_mode = True

class MultisigWorkflowRecipientResponse(BaseModel):
    user_address: str
    user: Optional[UserResponse]

    class Config:
        orm_mode = True

class MultisigWorkflowResponse(MultisigWorkflowBase):
    id: int
    secret_id: int
    owner_address: str
    status: str
    created_at: datetime
    owner: UserResponse
    signers: List[MultisigWorkflowSignerResponse]
    recipients: List[MultisigWorkflowRecipientResponse]

    class Config:
        orm_mode = True

class MultisigSignatureRequest(BaseModel):
    signature: str = Field(..., max_length=52_500_000)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

