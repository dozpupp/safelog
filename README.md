# SafeLog

A secure secret management and document signing application featuring **Quantum-Proof Security** via the TrustKeys extension.

## Features

- 🔐 **Dual Authentication** - Login with **MetaMask** (Ethereum) or **TrustKeys** (Post-Quantum).
- 🧬 **Quantum-Proof Cryptography** - Integration with **Crystals-Kyber** (ML-KEM) and **Crystals-Dilithium** (ML-DSA).
- 🛡️ **Secure Vault** - Client-side encryption ensures the server never sees your secrets.
- 💾 **Hybrid Encryption** -  
  - Standard Users: ECDH + AES (MetaMask).
  - PQC Users: Kyber-768 Encapsulation + AES-GCM (TrustKeys).
- 🤝 **Advanced Secret Management**
  - **Edit & Delete**: Full control over your stored secrets.
  - **Secure Sharing**: Share encrypted secrets between any user type (Eth ↔ PQC).
  - **File Uploads**: Securely encrypt, store, and share files (Images, PDFs, etc.).
  - **Timebomb**: Share secrets with an automatic expiration timer (5 min, 1 hour, 1 day).
  - **Revocation**: View who has access to your secrets and revoke their access individually.
  - **Access List**: See exact usernames and expiry times for shared secrets.
- 👤 **User Profiles** - Manage usernames and view PQC identities.

## Tech Stack

### Backend (`/backend`)
- **FastAPI** - High-performance Python framework.
- **SQLAlchemy + SQLite** - Robust data persistence.
- **Node.js Bridge** - Interop layer for validating Dilithium signatures.

### Frontend (`/frontend`)
- **React 19 + Vite** - Fast, modern UI.
- **Context Architecture** - Separation of concerns (`AuthContext`, `Web3Context`, `PQCContext`).
- **TailwindCSS** - Responsive dark-mode design.

### TrustKeys Extension (`/trustkeys`)
- **Browser Extension** - Manages PQC keys securely.
- **WASM Cryptography** - High-performance ML-KEM and ML-DSA implementation.
- **Encrypted Vault** - AES-256-GCM protection for private keys.
- **Import/Export** - Backup and restore your quantum-safe identity.

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+
- **TrustKeys Extension** (Included in repo) for PQC features.
- MetaMask (Optional, for standard features).

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/safelog.git
   cd safelog
   ```

2. **Setup Backend**
   ```bash
   cd backend
   # Establish environment
   cp .env.example .env
   pip3 install -r requirements.txt
   
   # Initialize DB
   python3 create_database.py
   ```

3. **Setup Frontend**
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   ```

4. **Install TrustKeys Extension**
   - Navigate to `safelog/trustkeys`.
   - Run `npm install` and `npm run build`.
   - Open Chrome/Brave to `chrome://extensions`.
   - Enable "Developer Mode".
   - Click "Load Unpacked" and select `safelog/trustkeys/dist`.

5. **Run Application**
   - Backend: `uvicorn main:app --reload` (Port 8000)
   - Frontend: `npm run dev` (Port 5173)

## Security Architecture

SafeLog employs a **Zero-Trust** architecture. All data is encrypted client-side before transmission. 

- **Authentication**: Uses digital signatures (ECDSA for Eth, Dilithium-2 for TrustKeys) to prove identity without exchanging passwords.
- **Data Protection**: Secrets are encrypted using a recipient's public key (encryption key) before hitting the database.
- **Post-Quantum Readiness**: Ready for the future with NIST-standardized algorithms (ML-KEM, ML-DSA).
- **Active Cleanup**: Expired shared secrets (Timebomb) are actively purged from the database to enforce access limits.

## Usage

### Login
1. Click "Connect Wallet"
2. Approve MetaMask connection
3. Sign the authentication message
4. Approve encryption public key request

### Create a Secret
1. Click "+ New Secret"
2. Enter a name and content
3. Click "Save Secret"
4. Secret is encrypted client-side and stored

### Upload a File
1. Click "+ New Secret"
2. Toggle content type to **File**
3. Select a file from your device
4. Enter a name and click "Encrypt & Save"
5. **Download**: To retrieve, decrypt the secret and click the "Download" button.

### Share a Secret
1. Click the "Share" icon
2. Search for a user (Standard or PQC)
3. (Optional) Set an Expiry Time (Timebomb)
4. Click "Share Secret"
5. The secret is securely re-encrypted for the recipient

### Managing Access
1. Open the "Manage Access" modal (Share icon).
2. View the list of users with access.
3. Check expiry times (HH:MM:SS format).
4. Click the Trash icon to **Revoke** access for a specific user.

## API Endpoints

### Authentication
- `GET /auth/nonce/{address}` - Get signing nonce
- `POST /auth/login` - Authenticate with signature

### Secrets
- `POST /secrets` - Create encrypted secret
- `GET /secrets/{address}` - List user's secrets
- `PUT /secrets/{secret_id}` - Update secret (Owner only)
- `DELETE /secrets/{secret_id}` - Delete secret (Owner only)
- `GET /secrets/{secret_id}/access` - Get access list (including expiry)

### Sharing
- `POST /secrets/share` - Share secret with another user (supports `expires_in`)
- `GET /secrets/shared-with/{address}` - List secrets shared with user
- `DELETE /secrets/share/{grant_id}` - Revoke access (Owner or Expiry)

### Users
- `GET /users` - Search users (supports pagination `limit` & `offset`)
- `GET /users/{address}` - Get user details
- `PUT /users/{address}` - Update user profile

## Development

### Backend Development
```bash
cd backend
python3 -m uvicorn main:app --reload
```

### Frontend Development
```bash
cd frontend
npm run dev
```

## Future Enhancements

- [x] Secret sharing with other users
- [x] User profiles
- [x] Post-Quantum Cryptography (TrustKeys)
- [x] Time-limited Access (Timebomb)
- [x] Secret Management (Edit/Delete/Revoke)
- [x] File Uploads (Encrypted Storage)
- [ ] Document signing UI
- [ ] Session management with JWT
- [ ] PostgreSQL support
- [ ] Mobile-responsive improvements

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
