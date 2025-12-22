# SafeLog Codebase Audit Report

## 1. Executive Summary

This audit reviewed the SafeLog application, consisting of a Python/FastAPI backend, a React frontend, and the "TrustKeys" browser extension. The system implements a high-security document signing and sharing platform using Post-Quantum Cryptography (PQC) algorithms (Kyber-768 for encryption, Dilithium2 for signing).

**Overall Assessment:** The security architecture is robust and follows modern best practices, particularly regarding client-side encryption and key management. The "Local Vault" implementation in the frontend is a standout feature, offering near-extension security levels for web users.

**Key Strengths:**
- **Strong Cryptography:** Use of AES-GCM for vault encryption and SHA-512 PBKDF2 (600k iterations) for key derivation.
- **Privacy Design:** Private keys are decrypted only in memory and never persist in storage.
- **Granular Permissions:** The extension implements a "Connect" flow, requiring explicit user approval for sites to access keys.

**Identified Risks:**
- **Performance Bottleneck:** The backend verifies PQC signatures for *every* JWT validation by making an HTTP request to a sidecar Node.js service.
- **Dependency on Deterministic Keys:** The PQC Service generates server keys deterministically from a single environment variable (`SAFELOG_SECRET_KEY`). If this key is weak or leaked, all server signatures are compromised.
- **Frontend Complexity:** The signature verification logic in the frontend `crypto.js` is complex due to handling potential metadata in signature blobs, which could be a source of edge-case bugs.

## 2. Component Analysis

### 2.1 Backend (`backend/`)
- **Framework**: FastAPI (Python) with a Node.js sidecar (`pqc_service.js`) for PQC operations.
- **Authentication**: JWT-based, signed with Dilithium2.
- **Database**: SQLAlchemy with SQLite (for dev/demo).
- **Findings**:
    - **Architecture**: The separation of the PQC oracle (`pqc_service.js`) is clean but introduces latency.
    - **Security**: `auth.py` correctly handles standard auth flows. Implementing an "Authorized" check in `pqc_service.js` via `x-api-key` prevents unauthorized internal usage.
    - **Code Quality**: Clean, modular structure. `schemas.py` enforces reasonable input limits.

### 2.2 Frontend (`frontend/src/`)
- **Framework**: React + Vite.
- **Key Features**: "Local Vault" (software wallet) and "Auth Bridge" (Google Sign-In).
- **Findings**:
    - **Local Vault**: Excellent implementation. Keys are stored encrypted (`AES-GCM`) in `localStorage`. Decryption happens only on-demand in memory.
    - **Auth Bridge**: Uses `window.postMessage` to communicate with the extension. Logic checks `event.source` correctly.
    - **State Management**: `AuthContext` avoids storing tokens in `localStorage`, preferring memory-only persistence. This improves security (token lost on refresh) but might affect UX.

### 2.3 TrustKeys Extension (`trustkeys/`)
- **Manifest**: V3, limited permissions (`storage`, `activeTab`, `externally_connectable`).
- **Findings**:
    - **Permissions**: Correctly restricts external connection logic to trusted domains.
    - **User Confirmation**: Critical actions (`SIGN`, `DECRYPT`) trigger a popup for user confirmation effectively.
    - **Storage**: Uses `state.vault` for in-memory plaintext and `chrome.storage.local` for encrypted ciphertexts.

## 3. Detailed Security Audit

### 3.1 Cryptography (PQC)
- **Algorithms**: Crystals-Kyber (768) and Crystals-Dilithium (2).
- **Implementation**:
    - **Encryption**: Hybrid approach. Kyber is used to exchange a 32-byte shared secret, which then keys AES-GCM for the actual data. This is the correct way to use KEMs.
    - **Signing**: Standard Dilithium signing.
    - **Key Derivation**: `PBKDF2-HMAC-SHA512` with 600,000 iterations for password-based key encryption. This exceeds OWASP recommendations.

### 3.2 Authentication & Authorization
- **JWT**: The backend issues JWTs signed by the server's Dilithium key.
- **Verification**: The backend verifies user signatures (Dilithium) during login.
- **Issue**: `verify_signature` in `auth.py` creates a "message" string (`Sign in to...`). Ensure this format is strictly matched in the frontend to avoid failed logins.

### 3.3 Data Protection
- **Secrets**: Stored as encrypted blobs in the DB (`models.Secret`). The backend *never* sees the plaintext of user secrets; it only acts as a storage store.
- **Access Control**: Sharing involves re-encrypting the secret's key for the recipient's public key (Client-side). This is a secure End-to-End Encrypted (E2EE) sharing model.

### 3.4 Trust & Origins
- **Extension**: Relying on `sender.url` (or `request.origin` fallback) in `background/index.js` is generally safe for Content Scripts in V3, as `sender.origin` for content scripts reflects the page origin.
- **Web**: The `AuthBridge` correctly verifies the origin of messages.

## 4. Recommendations

### High Priority
1.  **Environment Variable Strength**: Ensure `SAFELOG_SECRET_KEY` in the backend environment is a high-entropy random string (at least 32 bytes), as it seeds the server's master key.
2.  **Performance Optimization**: Consider caching PQC verification results for JWT components or implementing a faster in-process PQC verification (e.g., Python C-extension) to remove the HTTP overhead on every request.

### Medium Priority
1.  **Frontend Signature Verification**: Simplify the `verifySignaturePQC` logic in `frontend/src/utils/crypto.js` to strictly enforce one signature format (Attached vs Detached) to reduce code complexity and attack surface.
2.  **Extension ID Handling**: The `AuthBridge` relies on `ext_id` in the URL. If the user visits the page without this param, it falls back to a generic `postMessage`. Ensure the extension (Content Script) injects its ID or handles the fallback robustly.

### Low Priority
1.  **Code Maintenance**: Standardize the naming of `signMessage` vs `signMessagePQC` across the codebase to avoid confusion between Ethereum and Dilithium signing methods.
2.  **UX**: Consider valid `sessionStorage` usage for the JWT to persist logins across page refreshes while maintaining reasonable security, or implement a refresh token flow.

## 5. Conclusion
The SafeLog codebase demonstrates a high standard of security engineering. The use of Post-Quantum Cryptography is integrated correctly using hybrid schemes. The application effectively delegates trust to the client (Extension or Local Vault), ensuring the server remains "blind" to user data. With minor performance optimizations and strict environment configuration, it is ready for deployment.
