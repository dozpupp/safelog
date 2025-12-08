from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone

Base = declarative_base()

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


# Update User relationship
User.documents = relationship("Document", back_populates="owner")

class RecoveryShare(Base):
    __tablename__ = "recovery_shares"

    id = Column(Integer, primary_key=True, index=True)
    google_id = Column(String, index=True, unique=True) # The 'sub' from Google ID Token
    share_data = Column(Text) # Encrypted share blob (Share B)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

