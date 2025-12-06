from eth_account.messages import encode_defunct
from eth_account import Account
from web3 import Web3
import secrets

import subprocess
import json
import os

def generate_nonce():
    return secrets.token_hex(16)

def verify_pqc_signature(public_key: str, nonce: str, signature: str) -> bool:
    try:
        # Message format must match frontend
        message_text = f"Sign in to Secure Log App with nonce: {nonce}"
        
        # Call Node.js bridge
        # Assuming node is available in environment
        # Path to script:
        script_path = os.path.join(os.path.dirname(__file__), "verify_pqc.js")
        
        payload = json.dumps({
            "message": message_text,
            "signature": signature,
            "publicKey": public_key
        })
        
        result = subprocess.run(
            ["node", script_path],
            input=payload,
            text=True,
            capture_output=True
        )
        
        if result.returncode != 0:
            print(f"PQC verification process failed: {result.stderr}")
            return False
            
        output = json.loads(result.stdout)
        return output.get("valid", False)
        
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
