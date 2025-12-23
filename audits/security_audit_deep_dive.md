# Deep Dive Security Audit Report
**Date:** 2025-12-23
**Auditor:** Antigravity (AI Agent)
**Scope:** Backend (FastAPI), Frontend (React), TrustKeys Extension

## 1. Executive Summary
This in-depth audit focused on logical vulnerabilities, denial-of-service (DoS) vectors, and access control mechanisms. While the application's core Zero-Knowledge architecture remains robust, we identified a **Critical Denial of Service (DoS)** vulnerability in the messaging backend and a **High Severity** weakness in the Frontend's Content Security Policy (CSP).

## 2. Critical Findings

### 2.1. [Critical] Backend Memory Exhaustion (DoS)
**Location**: `backend/main.py` (Endpoints: `get_conversations`, `get_message_history`)

**Status: FIXED**

**Vulnerability**: The application allowed messages to contain up to **50MB** of encrypted content, loading all messages into RAM.
**Remediation Applied**:
- **`get_conversations`**: Added `defer(models.Message.content)` to the query to lazy-load content only when needed.
- **`get_message_history`**: Implemented `limit` and `offset` pagination to prevent fetching unbounded histories.

### 2.2. [High] Weak Content Security Policy (CSP)
**Location**: `frontend/index.html`

**Status: FIXED**

**Vulnerability**: The CSP included `'unsafe-inline'` and `'unsafe-eval'`.
**Remediation Applied**:
- Removed `'unsafe-inline'` and `'unsafe-eval'`.
- Added `'wasm-unsafe-eval'` to `script-src` to strictly allow WebAssembly compilation (required for PQC) without enabling general JS evaluation.
- Defined strict allowlists for `connect-src`, `img-src`, and `style-src`.

## 3. Medium & Low Findings

### 3.1. [Medium] Code Duplication & Maintainability
**Location**: `backend/main.py` vs `backend/messenger_endpoints.py`

**Observation**: `backend/main.py` contains the implementation of messenger endpoints directly, but a separate `backend/messenger_endpoints.py` file also exists with similar code.
**Impact**: Fixes applied to one file (e.g., the DoS fix) might be missed in the active file if the developer is confused about which one is running. `main.py` appears to be the active entry point.

### 3.2. [Low] Extension Origin Validation
**Location**: `trustkeys/src/background/index.js`

**Observation**: The extension's message handler allows falling back to `request.origin` if `sender.origin` or `sender.url` is not definitive.
```javascript
const checkOrigin = sender.origin || request.origin;
```
**Impact**: While currently safe for Content Scripts (where `sender.url` is reliable), relying on the request payload for origin information is generally discouraged.
**Mitigation**: The permission model (Popup approval) mitigates the risk of unauthorized keys usage.

## 4. Remediation Log
- **2025-12-23**: Fixed Backend DoS (Optimized Queries & Pagination).
- **2025-12-23**: Hardened CSP (Removed `unsafe-inline`, added `wasm-unsafe-eval`).
- **2025-12-22**: Fixed PQC Service DoS (Body Limits).

## 5. Recommendations

1.  **Fix `get_conversations` immediately**: usage of `defer('content')` is mandatory.
2.  **Harden CSP**: Tighten the policy in `index.html`.
3.  **Clean up Codebase**: Delete or integrate `messenger_endpoints.py`.
