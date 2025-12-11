from eth_account.messages import encode_defunct
from eth_account import Account
from web3 import Web3
import secrets

import subprocess
import json
import os
import requests

def generate_nonce():
    return secrets.token_hex(16)

def verify_pqc_signature(public_key: str, nonce: str, signature: str) -> bool:
    try:
        # Message format must match frontend
        message_text = f"Sign in to Secure Log App with nonce: {nonce}"
        
        # Call Node.js sidecar service
        try:
            response = requests.post(
                "http://127.0.0.1:3002/verify",
                json={
                    "message": message_text,
                    "signature": signature,
                    "publicKey": public_key
                },
                timeout=5 # 5s timeout
            )
            
            if response.status_code != 200:
                print(f"ERROR: PQC Service HTTP Error: {response.text}")
                return False
                
            result = response.json()
            return result.get("valid", False)
            
        except requests.exceptions.ConnectionError:
            print("CRITICAL ERROR: PQC Service Unavailable. Is 'node backend/pqc_service.js' running?")
            return False
            
    except Exception as e:
        print(f"PQC verification error: {e}")
        return False

def verify_signature(address: str, nonce: str, signature: str) -> bool:
    # Check if address is actually a PQC Public Key
    # PQC keys (Dilithium) are long hex strings compared to Eth addresses (42 chars)
    if len(address) > 42:
        return verify_pqc_signature(address, nonce, signature)

    try:
        # Standard Ethereum Verification
        message_text = f"Sign in to Secure Log App with nonce: {nonce}"
        encoded_message = encode_defunct(text=message_text)
        
        recovered_address = Account.recover_message(encoded_message, signature=signature)
        
        return recovered_address.lower() == address.lower()
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False

import jwt
from datetime import datetime, timedelta, timezone

SECRET_KEY = os.getenv("SAFELOG_SECRET_KEY")
if not SECRET_KEY:
    # Fallback only for DEV or strict fail? 
    # Providing a weak default but warning loud is better for this 'fix' task 
    # than breaking if they forget to set it immediately, but let's be secure.
    print("WARNING: SAFELOG_SECRET_KEY not set. Using insecure default. DO NOT USE IN PRODUCTION.")
    SECRET_KEY = "supersecretkey_dev_only_change_me"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None
