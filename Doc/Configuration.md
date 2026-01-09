# Safelog Configuration Guide

 This document details the configuration options and environment variables required to run the Safelog components.

## 1. Backend Configuration

The backend is configured via environment variables, typically loaded from a `.env` file in the `backend/` directory.

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `PQC_SERVICE_URL` | URL of the internal Node.js PQC sidecar service. | `http://127.0.0.1:3002` | No |
| `PQC_SHARED_SECRET` | Secret key for authenticating internal requests to the PQC service. | None | **Yes** |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (e.g., frontend URL). | None | **Yes** (if accessing from browser) |

### Database
Currently, the database URL is hardcoded to use SQLite in `backend/database.py`:
`sqlite:///./sql_app.db`

To change this (e.g., to PostgreSQL), you would need to modify `backend/database.py` to read `DATABASE_URL` from the environment.

## 2. PQC Service Configuration

The PQC Service (Node.js) should be configured to match the Backend's expectations.

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `PORT` | Port to listen on. | `3002` | No |
| `PQC_SHARED_SECRET` | Must match the Backend's `PQC_SHARED_SECRET`. | None | **Yes** |

## 3. Frontend Configuration

The Frontend uses Vite, so environment variables must be prefixed with `VITE_` to be exposed to the browser. These should be in `frontend/.env`.

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | The URL of the Backend API. | `http://localhost:8000` | No |
| `ALLOWED_HOSTS` | (Vite Config) Hostnames allowed for the dev server. | None | No |

## 4. TrustKeys Extension Configuration

The extension configuration is static and defined in `trustkeys/manifest.json`.
*   **Permissions**: `storage`, `activeTab`.
*   **Host Permissions**: `safelog.hashpar.com`, `localhost`.

To allow the extension to work on other domains, you must modify `externally_connectable` and `content_scripts` matches in `manifest.json`.

## 5. Deployment Example

```bash
# Backend .env
PQC_SERVICE_URL=http://pqc-service:3002
PQC_SHARED_SECRET=super_secret_internal_key_123
ALLOWED_ORIGINS=https://safelog.yourdomain.com

# Frontend .env
VITE_API_BASE_URL=https://api.safelog.yourdomain.com
```
