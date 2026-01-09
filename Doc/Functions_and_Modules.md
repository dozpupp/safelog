# Safelog Functions and Modules Guide

This document highlights critical modules, classes, and functions within the Safelog codebase.

## Backend (`/backend`)

### `auth.py`
Core authentication logic.
*   `verify_pqc_signature(public_key, nonce, signature)`: Validates a user's login signature by instigating a call to the PQC Service.
*   `create_access_token(data)`: Mint a JWT signed by the server's Dilithium key (via PQC Service sidecar).
*   `decode_access_token(token)`: Verifies and decodes the JWT.

### `routers/secrets.py`
Manages secret lifecycle.
*   `create_secret`: Handles logic for storing the secret blob and creating the initial `AccessGrant` for the owner.
*   `share_secret`: Logic for adding a new `AccessGrant` (shared key) for another user using their public key.

### `routers/multisig.py`
Complex workflow logic.
*   `create_multisig_workflow`: Orchestrates creating the underlying Secret, the Workflow entity, and initial Signer/Recipient entries.
*   `sign_multisig_workflow`: Updates signer status and checks if the quorum (currently "all") is met to mark the workflow as `completed`.

## Frontend (`/frontend/src`)

### `services/vault.js` (`VaultService`)
The local keystore manager.
*   `unlock(password)`: Decrypts the full vault from `localStorage`, loads sanitized keys (public only) into memory, and keeps the vault ready for on-demand signing.
*   `sign(message, password)`: Temporarily decrypts the full vault to access the private key, signs the message, and clears the private key from scope immediately.
*   `decrypt(ciphertext, password)`: Similar to `sign`, but uses the Kyber private key to decrypt data.

### `context/PQCContext.jsx`
The bridge between UI and Crypto.
*   `loginTrustKeys()`: Initiates the handshake and login flow with the Browser Extension.
*   `loginLocalVault()`: Initiates login using `VaultService`.
*   `performServerLogin()`: Generic helper that takes a signing function (Extension or Local) and handles the Nonce -> Sign -> Verify API loop.

## TrustKeys Extension (`/trustkeys/src`)

### `background/index.js`
The central controller.
*   `chrome.runtime.onMessage`: Dispatches messages to specific handlers.
*   `session state`: Manages the memory-only session password to keep the wallet unlocked during active use.

### `background/handlers/crypto.js`
*   `handleSignAsync`: Prompts the user (if required, though currently silent if unlocked) and performs the Dilithium signature.
*   `handleDecryptAsync`: Performs Kyber decryption.

### `background/handlers/accounts.js`
*   `createAccount`: Generates new Dilithium/Kyber keypairs.
*   `exportVault`: Exports the encrypted vault data for backup.
