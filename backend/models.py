from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone

Base = declarative_base()

class Nonce(Base):
    __tablename__ = "nonces"

    address = Column(String, primary_key=True, index=True) # Address associated with nonce
    nonce = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)

class User(Base):
    __tablename__ = "users"

    address = Column(String, primary_key=True, index=True) # Ethereum address (lowercase)
    username = Column(String, nullable=True)
    encryption_public_key = Column(String, nullable=True) # For eth_decrypt
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    secrets = relationship("Secret", back_populates="owner")
    access_grants = relationship("AccessGrant", back_populates="grantee")

class Secret(Base):
    __tablename__ = "secrets"

    id = Column(Integer, primary_key=True, index=True)
    owner_address = Column(String, ForeignKey("users.address"))
    name = Column(String, index=True)
    type = Column(String, default="standard") # 'standard' or 'signed_document'
    encrypted_data = Column(Text) # JSON blob: {version, nonce, ephemPublicKey, ciphertext}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="secrets")
    access_grants = relationship("AccessGrant", back_populates="secret")

class AccessGrant(Base):
    __tablename__ = "access_grants"

    id = Column(Integer, primary_key=True, index=True)
    secret_id = Column(Integer, ForeignKey("secrets.id"))
    grantee_address = Column(String, ForeignKey("users.address"))
    encrypted_key = Column(Text) # The secret's key, encrypted for the grantee's public key
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)

    secret = relationship("Secret", back_populates="access_grants")
    grantee = relationship("User", back_populates="access_grants")

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    owner_address = Column(String, ForeignKey("users.address"))
    name = Column(String)
    content_hash = Column(String) # Hash of the document content
    signature = Column(String) # The user's signature of the hash
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="documents")


class MultisigWorkflow(Base):
    __tablename__ = "multisig_workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    owner_address = Column(String, ForeignKey("users.address"))
    secret_id = Column(Integer, ForeignKey("secrets.id"))
    status = Column(String, default="pending") # 'pending', 'completed', 'rejected'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="workflows")
    secret = relationship("Secret")
    signers = relationship("MultisigWorkflowSigner", back_populates="workflow")
    recipients = relationship("MultisigWorkflowRecipient", back_populates="workflow")

class MultisigWorkflowSigner(Base):
    __tablename__ = "multisig_workflow_signers"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("multisig_workflows.id"))
    user_address = Column(String, ForeignKey("users.address"))
    has_signed = Column(Boolean, default=False) # 0=False, 1=True
    # SQLite/Some DBs are tricky with bools, but SQLAlchemy handles it. Let's stick to Boolean or Integer.
    # Existing code doesn't show much Bool usage, let's use Boolean if possible, or Integer.
    # We'll use Boolean from sqlalchemy? Imported? No, not imported. Let's use Boolean.
    signature = Column(Text, nullable=True)
    signed_at = Column(DateTime, nullable=True)
    encrypted_key = Column(Text, nullable=True) # Key for this signer, isolated from AccessGrant

    workflow = relationship("MultisigWorkflow", back_populates="signers")
    user = relationship("User")

class MultisigWorkflowRecipient(Base):
    __tablename__ = "multisig_workflow_recipients"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("multisig_workflows.id"))
    user_address = Column(String, ForeignKey("users.address"))
    encrypted_key = Column(Text) # Key encrypted for THIS recipient, held until release

    workflow = relationship("MultisigWorkflow", back_populates="recipients")
    user = relationship("User")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_address = Column(String, ForeignKey("users.address"))
    recipient_address = Column(String, ForeignKey("users.address"))
    content = Column(Text) # Encrypted Blob
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    sender = relationship("User", foreign_keys=[sender_address], back_populates="sent_messages")
    recipient = relationship("User", foreign_keys=[recipient_address], back_populates="received_messages")

# Update User relationship
User.documents = relationship("Document", back_populates="owner")
User.workflows = relationship("MultisigWorkflow", back_populates="owner")
User.sent_messages = relationship("Message", foreign_keys=[Message.sender_address], back_populates="sender")
User.received_messages = relationship("Message", foreign_keys=[Message.recipient_address], back_populates="recipient")

__tablename__ = "recovery_shares"

id = Column(Integer, primary_key=True, index=True)
google_id = Column(String, index=True, unique=True) # The 'sub' from Google ID Token
share_data = Column(Text) # Encrypted share blob (Share B)
created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

