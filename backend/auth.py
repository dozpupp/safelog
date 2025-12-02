from eth_account.messages import encode_defunct
from eth_account import Account
from web3 import Web3
import secrets

def generate_nonce():
    return secrets.token_hex(16)

def verify_signature(address: str, nonce: str, signature: str) -> bool:
    try:
        # The message that was signed. In a real app, this should be a structured message.
        # For this MVP, we assume the user signed the nonce directly or a message containing the nonce.
        # Let's assume the standard "Sign in to App with nonce: <nonce>" format for better UX.
        message_text = f"Sign in to Secure Log App with nonce: {nonce}"
        encoded_message = encode_defunct(text=message_text)
        
        recovered_address = Account.recover_message(encoded_message, signature=signature)
        
        return recovered_address.lower() == address.lower()
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False
