# Safelog API Reference

Base URL: `http://localhost:8000` (Default)

## Authentication

### Get Nonce
`GET /auth/nonce/{address}`
*   **Description**: Request a random nonce for a given address to initiate login.
*   **Response**: `{"nonce": "hex_string"}`

### Login
`POST /auth/login`
*   **Body**:
    ```json
    {
      "address": "0x...",
      "signature": "dilithium_signature_bytes",
      "nonce": "hex_string",
      "encryption_public_key": "kyber_public_key",
      "username": "optional_name"
    }
    ```
*   **Response**: `{"access_token": "...", "token_type": "bearer", "user": {...}}`

## Users

### Get User
`GET /users/{address}`
*   **Description**: Fetch public profile (username, encryption key).

### Search Users
`GET /users`
*   **Query Params**: `search` (string), `limit` (int), `offset` (int).

### Resolve User
`POST /users/resolve`
*   **Body**: `{"address": "0x..."}`
*   **Description**: Helper to ensure a user exists or fetch details.

## Secrets & Documents

### Create Secret
`POST /secrets`
*   *Authenticated*
*   **Body**: `{"name": "...", "type": "standard", "encrypted_data": "...", "encrypted_key": "..."}`
*   **Description**: Create a new secret. `encrypted_key` is for the owner.

### List Secrets
`GET /secrets`
*   *Authenticated*
*   **Description**: List all secrets owned by the current user.

### Share Secret
`POST /secrets/share`
*   *Authenticated*
*   **Body**: `{"secret_id": 123, "grantee_address": "0x...", "encrypted_key": "...", "expires_in": 3600}`
*   **Description**: Grant access to a secret.

### List Shared Secrets
`GET /secrets/shared-with-me`
*   *Authenticated*
*   **Description**: View secrets shared with the current user.

## Multisig Workflows

### Create Workflow
`POST /multisig/workflow`
*   *Authenticated*
*   **Body**: Details about the secret, signers, and initial keys.

### Sign Workflow
`POST /multisig/workflow/{id}/sign`
*   *Authenticated*
*   **Body**: `{"signature": "...", "recipient_keys": {"addr": "key"}}`
*   **Description**: Submit a signature. If it's the final signature, the workflow completes.

## Messaging

### Send Message
`POST /messages`
*   *Authenticated*
*   **Body**: `{"recipient_address": "...", "content": "encrypted_blob"}`

### Get Conversations
`GET /messages/conversations`
*   *Authenticated*
*   **Description**: Get latest message for each active conversation.

### Get History
`POST /messages/history`
*   *Authenticated*
*   **Body**: `{"partner_address": "...", "limit": 20, "offset": 0}`

### Mark Read
`POST /messages/mark-read/{partner_address}`
*   *Authenticated*

## WebSocket

### Connect
`WS /messages/ws`
*   **Handshake**: Client must send `{"type": "AUTH", "token": "JWT_TOKEN"}` immediately.
*   **Events**:
    *   `NEW_MESSAGE`: Incoming message.
    *   `SECRET_SHARED`: Notification of a new shared secret.
