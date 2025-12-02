from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime, timezone

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    address = Column(String, primary_key=True, index=True) # Ethereum address (lowercase)
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
