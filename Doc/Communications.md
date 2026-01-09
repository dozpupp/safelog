# Communications Protocols

This document outlines the communication flows between the different components of Safelog.

## 1. Frontend <-> Backend

*   **Protocol**: REST (HTTP/1.1) and WebSockets.
*   **Format**: JSON.
*   **Security**: headers including Authorization (`Bearer <JWT>`).
*   **Key Flow**:
    1.  **Request**: Frontend sends `Address` + `Signature` + `Nonce` to Backend.
    2.  **Verify**: Backend delegates verification to PQC Service.
    3.  **Token**: Backend returns a PQC-signed JWT (Dilithium).
    4.  **Authenticated Requests**: Frontend includes JWT in headers. Backend verifies JWT signature using PQC Service public key.

## 2. Frontend <-> TrustKeys Extension

*   **Protocol**: `window.postMessage`.
*   **Mechanism**:
    *   Content Script (`api_main.js`) injects `window.trustkeys`.
    *   `window.trustkeys` methods send window messages to the Content Script (`content/index.js`).
    *   Content Script relays messages to Background Script (`background/index.js`) via `chrome.runtime.sendMessage`.
*   **Security**:
    *   `externally_connectable` in manifest limits direct connection (not used for main flow, but available).
    *   Origin checks in Background Script.
    *   **Isolation**: Private keys never leave the background process memory/storage.

### Message Format
```javascript
{
    type: "TRUSTKEYS_SIGN",
    message: "Data to sign",
    id: "random_req_id",
    source: "TRUSTKEYS_PAGE"
}
```

## 3. Backend <-> PQC Service

*   **Protocol**: HTTP (Internal).
*   **URL**: `http://127.0.0.1:3002` (Configurable).
*   **Security**: `x-api-key` header containing `PQC_SHARED_SECRET`.
*   **Purpose**: Offload computational heavy lifting of Crystals-Dilithium/Kyber ops.

### Endpoints
*   `GET /server-public-key`: Get the server's PQC identity.
*   `POST /sign`: Sign a message (e.g. JWT) with server key.
*   `POST /verify`: Verify a signature (User login).

## 4. Real-time Updates (WebSockets)

*   **Endpoint**: `/messages/ws`
*   **Auth**: Custom `AUTH` frame sent immediately after connection.
    *   `{"type": "AUTH", "token": "..."}`
*   **Broadcasts**:
    *   The `ConnectionManager` in backend maps `User Address -> WebSocket Connection`.
    *   Events are pushed to specific users (e.g., when a message is received or a secret is shared).
