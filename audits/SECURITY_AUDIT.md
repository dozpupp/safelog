# Safelog Security Review

**Date:** 2025-12-19
**Target:** Safelog (Backend, Frontend, TrustKeys Extension)
**Reviewer:** Antigravity (AI Agent)

## 1. Executive Summary

Safelog is a high-security secret management application leveraging Post-Quantum Cryptography (PQC) via the "TrustKeys" browser extension. The architecture effectively implements End-to-End Encryption (E2EE) where the backend acts as a zero-knowledge coordinator. The use of Crystals-Kyber (ML-KEM) and Crystals-Dilithium (ML-DSA) positions the application as "Quantum-Proof".

**Overall Security Posture:** **Strong**
The application adheres to "Secure by Design" principles, particularly in its isolation of private keys within the browser extension and the use of hybrid encryption. However, there are discrepancies between documentation and implementation (PBKDF2 rounds) and some areas where manual cryptographic implementation could be hardened.

## 2. Architecture & Threat Model

### Architecture
- **Backend (FastAPI)**: Manages metadata, encrypted blobs, and user profiles. Uses a Node.js sidecar (`pqc_service.js`) for server-side PQC operations (signing JWTs).
- **Frontend (React)**: Client-side logic, memory-only session management.
- **TrustKeys Extension (Manifest V3)**: Secure vault for PQC keys. Handles signing and decryption in an isolated background service worker (ISOLATED world).

### Threat Considerations
- **Compromised Backend**: The attacker gains access to encrypted blobs (`encrypted_data`, `encrypted_key`). Due to E2EE, they cannot decrypt secrets without user private keys (stored on client).
- **Compromised Client (XSS)**: The frontend memory is transient. The extension requires explicit approval for critical operations (`SIGN`, `DECRYPT`) unless the site is whitelisted. Keys are never exposed to the frontend javascript context.
- **Quantum Attacker**: Protected by Kyber-768 and Dilithium-2.

## 3. Detailed Findings

### 🟢 Strengths
1.  **Zero-Knowledge Architecture**: The backend stores `encrypted_data` and shares keys via `encrypted_key` (wrapped for recipients). It never sees plaintext.
2.  **Extension Isolation**: Private keys are stored in `chrome.storage.local` (encrypted) and managed by the Background Service Worker. The Content Script/Frontend cannot access them directly, only request operations.
3.  **Explicit Permissions**: The extension enforces a permission model where a site must be "connected" to request keys/signatures.
4.  **Memory-Only Frontend Session**: The `AuthContext` does not persist tokens to `localStorage`, mitigating the impact of persistent XSS payloads retrieving tokens after a tab closure.
5.  **Multi-Party Computation (MPC) Recovery**: Implements a Shamir-like split (Share A from password, Share B from random) for recovering keys via Google Auth without trusting Google with the full key.

### 🟠 Medium Risk / Observations

#### 1. PBKDF2 Iteration Discrepancy (FIXED)
- **Observation**: The `README.md` claims "600,000 iterations" for PBKDF2. `trustkeys/src/utils/crypto.js` previously used **100,000** iterations and **SHA-256**.
- **Status**: **RESOLVED**. The implementation has been updated to **SHA-512** with **600,000** iterations.
- **Risk**: *Previously* lower resistance to GPU brute-force attacks. Now aligned with high-security specifications.

#### 2. Manual JWT Handling & Naive Base64
- **Observation**: `backend/auth.py` manually constructs and parses JWTs (`header.payload.signature`) instead of using a standard library for the *verification flow* (due to custom PQC signature requirement).
- **Specific Issue**: The `b64url_decode` function manually handles padding (`=`). While functional, manual implementations often have edge cases.
- **Risk**: Potential parsing errors or malleability issues, though less critical for Dilithium signatures which are effectively non-malleable.
- **Recommendation**: Use a robust `base64` utility or wrapper, and ensure `pqc_service.js` validates input length/types strictly.

#### 3. Deterministic Server Key Generation
- **Observation**: `backend/pqc_service.js` generates the server's Dilithium key deterministically from `SAFELOG_SECRET_KEY` + SHA256.
- **Risk**: If `SAFELOG_SECRET_KEY` is rotated, the server's identity changes, invalidating all issued JWTs immediately. This is a trade-off: good for revocation, bad for rotation flexibility. If the key leaks, the attacker can sign tokens as the server *retroactively*.
- **Recommendation**: Consider persistent key storage (file-based) for the server identity, using `SAFELOG_SECRET_KEY` only to encrypt that file.

#### 4. Extension Origin Validation Fallback
- **Observation**: In `trustkeys/src/background/index.js`, the message handler uses `sender.origin || request.origin`.
- **Risk**: `sender.origin` is the browser-verified origin. `request.origin` is passed by the content script. While the content script is part of the trusted extension, relying on data passed from the simpler context is a minor design smell.
- **Mitigation**: The content script runs in an ISOLATED world, so page scripts cannot modify the message it sends to the background. This risk is low but worth noting.

### 🟡 Low Risk

#### 1. PQC Service Input Validation
- **Observation**: The Node.js sidecar (`pqc_service.js`) parses JSON and passes it to the crypto library.
- **Risk**: Large payloads or malformed JSON could cause the Node process to crash (DoS).
- **Recommendation**: Add body size limits to the `http` server in `pqc_service.js`.

#### 2. Lack of Rate Limiting
- **Observation**: `main.py` does not appear to implement rate limiting on `auth/login` or `PQC` verification endpoints.
- **Risk**: Brute-force attemps on nonces or DoS attacks on the computationally expensive PQC verification (Dilithium verification is fast, but signing is slower; Kyber is fast).
- **Recommendation**: Implement `slowapi` or similar rate-limiting middleware.

## 4. Recommendations

### Immediate Actions
1.  **Fix PBKDF2 Iterations**: **COMPLETED**. Updated to **600,000** and **SHA-512**.
2.  **Harden Node.js Service**: Add a request body size limit (e.g., 10KB) to `pqc_service.js` to prevent memory exhaustion attacks.

### Long-Term Improvements
1.  **Rate Limiting**: Add rate limiting to the `/auth/login` and `/auth/nonce` endpoints.
2.  **Key Rotation Strategy**: Design a mechanism for server key rotation that doesn't invalidate valid sessions instantly, or accept that rotation == logout.
3.  **Content Security Policy (CSP)**: Ensure the Frontend is served with a strict CSP preventing `eval()` and restricting `connect-src` to the API.

## 5. Conclusion

Safelog demonstrates a high level of security competence. The core cryptographic decisions (PQC + Hybrid Encryption) are sound. The browser extension architecture effectively isolates user secrets. The identified issues are primarily implementation details (iteration counts, rate limiting) rather than fundamental architectural flaws.

**Approval**: The codebase is suitable for advanced testing/staging usage, provided the PBKDF2 iteration count is corrected.
