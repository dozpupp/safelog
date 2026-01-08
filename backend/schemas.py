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
    encrypted_key: str = Field(..., max_length=52_500_000) # Key encrypted for Owner (or Viewer in Response)

class SecretCreate(SecretBase):
    pass

class SecretResponse(SecretBase):
    id: int
    owner_address: str
    created_at: datetime
    encrypted_key: Optional[str] # The specific key for the requesting user (joined from AccessGrant)
    owner: UserResponse

    class Config:
        orm_mode = True

class AccessGrantCreate(BaseModel):
    secret_id: int
    grantee_address: str = Field(..., max_length=20000)
    encrypted_key: str = Field(..., max_length=52_500_000) # Full content is temporarily stored here in current architecture
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
    signature: str = Field(..., max_length=52_500_000)

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
    signature: str = Field(..., max_length=52_500_000)
    nonce: str = Field(..., max_length=200)
    encryption_public_key: Optional[str] = Field(None, max_length=20000)
    username: Optional[str] = Field(None, max_length=200)

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
    encrypted_key: Optional[str]
    user: Optional[UserResponse]

    class Config:
        orm_mode = True

class MultisigWorkflowRecipientResponse(BaseModel):
    user_address: str
    encrypted_key: Optional[str]
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
    secret: SecretResponse # Include Secret Data so signers can access encrypted_data
    owner_encrypted_key: Optional[str] = None # Explicitly pass owner key here to avoid nesting issues
    signers: List[MultisigWorkflowSignerResponse]
    recipients: List[MultisigWorkflowRecipientResponse]

    class Config:
        orm_mode = True

class MultisigSignatureRequest(BaseModel):
    # Reverting to 50MB. Empirical evidence shows 64KB is exceeded in some user scenarios.
    # This suggests the signature payload might include attached content or metadata in some flows.
    signature: str = Field(..., max_length=52_500_000)
    recipient_keys: Optional[dict[str, str]] = None # Only provided by the last signer

class MessageBase(BaseModel):
    recipient_address: str = Field(..., max_length=20000)
    content: str = Field(..., max_length=52_500_000) # Encrypted Blob

class MessageCreate(MessageBase):
    pass

class MessageResponse(MessageBase):
    id: int
    sender_address: str
    is_read: bool = False
    created_at: datetime
    sender: Optional[UserResponse]
    recipient: Optional[UserResponse]

    class Config:
        orm_mode = True

class ConversationResponse(BaseModel):
    user: UserResponse
    last_message: MessageResponse
    unread_count: int = 0

    class Config:
        orm_mode = True

class HistoryRequest(BaseModel):
    partner_address: str
    limit: int = Field(50, ge=1, le=100) # Default 50, Max 100
    offset: int = Field(0, ge=0)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

