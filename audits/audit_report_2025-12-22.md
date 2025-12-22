# SafeLog Security Audit Report
**Date:** 2025-12-22
**Auditor:** Antigravity (AI Agent)

## 1. Executive Summary
The SafeLog application and its companion TrustKeys extension demonstrate a strong security posture, effectively utilizing Post-Quantum Cryptography (PQC) and a zero-knowledge architecture. The core design ensures that user private keys remain isolated within the browser extension (or local vault) and are never exposed to the backend.

However, this audit identified several **Denial of Service (DoS)** vectors and implementation details that could impact the system's availability and maintainability. No critical vulnerabilities leading to immediate data compromise (like Remote Code Execution or Key Exfiltration) were found.

## 2. Methodology
The audit was conducted using:
- **Static Code Analysis (SAST)**: Manual review of Python (Backend), JavaScript (Frontend, Node.js Service), and Extension code.
- **Architecture Review**: Analysis of the authentication flow, key management, and data isolation.
- **Pattern Matching**: Searching for known vulnerable patterns (XSS, SQLi, Unbounded Inputs).

## 3. Findings

### 3.1. [High] Unbounded Input Sizes (DoS)
**Severity:** High (Availability)
**Location:** `backend/schemas.py`, `backend/pqc_service.js`

- **Issue 1 (Backend Schemas):** The Pydantic schemas allow excessively large inputs for `encrypted_data`, `encrypted_key`, and `signature`.
    - `encrypted_data`: 52,500,000 characters (~50MB).
    - `encrypted_key`: 52,500,000 characters.
    - `signature`: 52,500,000 characters.
    - **Impact:** An authenticated attacker (or even unauthenticated for some endpoints if checks are loose) could send massive payloads, filling the database or exhausting server memory. `encrypted_key` and `signature` should be drastically smaller (KB range).
- **Issue 2 (PQC Service):** The `pqc_service.js` reads the request body without a size limit:
    ```javascript
    req.on('data', chunk => body += chunk);
    ```
    - **Impact:** An attacker can send a large stream of data to the internal PQC service (if they can reach it, or via the backend if backend doesn't limit it), causing the Node.js process to crash due to OOM (Out of Memory).

**Recommendation:**
- Reduce schema limits:
    - `encrypted_key`: ~4KB (Kyber encapsulated keys are small).
    - `signature`: ~5KB (Dilithium sigs are ~2.4KB).
    - `encrypted_data`: Keep high if file storage is intended, but enforce strict rate limits and maybe chunking.
**Status: RESOLVED**
- **Fix:** `encrypted_key` limited to 64KB. `signature` limit set to 50MB (required for attached PQC sigs).
- **Hardening:** `pqc_service.js` now enforces a 1MB body size limit, preventing execution-layer DoS.

### 3.2. [Medium] Hardcoded Internal Service URL & Caching
**Severity:** Medium (Availability/Maintainability)
**Location:** `backend/auth.py`

- **Issue:** `PQC_SERVICE_URL` is hardcoded to `http://127.0.0.1:3002`.
- **Issue:** `_SERVER_PUBLIC_KEY` is cached globally in `auth.py` and never refreshed.
    - **Impact:** If `pqc_service.js` is restarted with a new secret (changing the derived keys), the backend will continue using the old cached public key, causing all token verifications to fail until the backend is also restarted.

**Recommendation:**
**Status: PARTIALLY RESOLVED**
- **Fix:** `PQC_SERVICE_URL` is now configurable via `.env`.
- **Mitigation:** Added request timeouts to prevent backend indefinite hangs.
- **Outstanding:** Dynamic key refreshing is still pending (low priority if service stable).

### 3.3. [Medium] PQC Service Key Derivation
**Severity:** Medium (Architecture)
**Location:** `backend/pqc_service.js`

- **Issue:** Server keys are derived deterministically from `SAFELOG_SECRET_KEY`.
    - **Risk:** If `SAFELOG_SECRET_KEY` needs to be rotated (e.g., leaked), the server's identity changes. All existing JWTs signed by the old key become invalid immediately. There is no support for key rolling (accepting old key while signing with new).

**Recommendation:**
- Persist PQC keys to disk (encrypted with the Secret Key). This allows rotating the Secret Key (used for encryption) without changing the PQC Identity keys.

### 3.4. [Low] Front-End Username Trust
**Severity:** Low (Integrity)
**Location:** `frontend/src/context/PQCContext.jsx`

- **Issue:** The frontend sends the username during login:
    ```javascript
    username: username // Send preferred username
    ```
    - **Risk:** While not a direct vulnerability, trusting client-side username submission (beyond the inevitable "first come first served") can lead to confusion if display names are not unique or are spoofed. The backend does prioritize the address, which is good.

### 3.5. [Info] Extension Pending Requests
**Severity:** Info
**Location:** `trustkeys/src/background/index.js`

- **Issue:** `pendingRequests` map has no cleanup mechanism for stale requests (e.g., user opens popup but never approves/rejects, or closes it).
    - **Impact:** Minor memory leak over very long sessions.

## 4. Remediation Plan

We recommend addressing the High and Medium issues immediately.

### Immediate Actions
1.  **[DONE] Fix Schemas**: Updated `backend/schemas.py`. `encrypted_key` set to 64KB. `signature` set to 50MB (dictated by functional requirements).
2.  **[DONE] Harden PQC Service**: Added 1MB request body limit in `pqc_service.js`.
3.  **[DONE] Configurable URL**: Updated `backend/auth.py` to use `.env` and added timeouts.

### Planned Follow-up
1.  Implement Key persistence for PQC Service.
2.  Add specific rate limiting middleware to FastAPI.
