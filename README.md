# SafeLog

A secure secret management and document signing application featuring **Quantum-Proof Security** via the TrustKeys extension.

## Features

- 🔐 **Dual Authentication** - Login with **MetaMask** (Ethereum) or **TrustKeys** (Post-Quantum).
- 🧬 **Quantum-Proof Cryptography** - Integration with **Crystals-Kyber** (ML-KEM) and **Crystals-Dilithium** (ML-DSA).
- 🛡️ **Secure Vault** - Client-side encryption ensures the server never sees your secrets.
- 💾 **Hybrid Encryption** -  
  - Standard Users: ECDH + AES (MetaMask).
  - PQC Users: Kyber-768 Encapsulation + AES-GCM (TrustKeys).
- 🤝 **Secure Sharing** - Share encrypted secrets between any user type (Eth ↔ PQC).
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

1. **Configure Backend URL (Frontend)**:
   Edit `frontend/.env` and set `VITE_API_BASE_URL` to the public URL of your backend.
   ```
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```

2. **Configure Allowed Hosts (Frontend)**:
   If accessing via a specific domain (e.g. `safelog.hashpar.com`), add it to `ALLOWED_HOSTS` in `frontend/.env` to prevent "Blocked request" errors from Vite.
   ```
   ALLOWED_HOSTS=safelog.hashpar.com
   ```

3. **Configure CORS (Backend)**:
   The backend restricts access to known origins. To allow your frontend domain to make requests, set `ALLOWED_ORIGINS` environment variable when running the backend.
   ```bash
   export ALLOWED_ORIGINS="http://yourdomain.com,http://another-domain.com"
   python3 -m uvicorn main:app --reload --port 8000
   ```
   *Note: `localhost:5173` is allowed by default.*

4. **Run with Host Exposure**:
   By default, Vite only listens on localhost. To access it externally, run:
   ```bash
   npm run dev -- --host
   ```

### Production Build

For production deployment:

1. **Set Environment Variable**:
   ```bash
   export VITE_API_BASE_URL=https://api.yourdomain.com
   ```

2. **Build the Application**:
   ```bash
   npm run build
   ```
   This creates a `dist/` folder with static files.

3. **Serve the Application**:
   You can serve the `dist/` folder using Nginx, Apache, or a static file server like `serve`:
   ```bash
   npx serve -s dist
   ```

## Usage

### Login
1. Click "Connect Wallet"
2. Approve MetaMask connection
3. Sign the authentication message
4. Approve encryption public key request

### Create a Secret
1. Click "+ New Secret"
2. Enter a name and content
3. Click "Encrypt & Save"
4. Secret is encrypted client-side and stored

### Share a Secret
1. Click the Share icon on a secret
2. Search for a user by username or address
3. Select the user and click "Share"
4. The secret is securely re-encrypted for the recipient

### View a Secret
1. Click the unlock 🔓 button
2. Approve decryption in MetaMask
3. Decrypted content appears below

## Security

- **No Plain Text Storage** - All secrets are encrypted before leaving your browser
- **Private Keys Never Exposed** - Encryption/decryption happens via MetaMask
- **Client-Side Encryption** - Server never sees your plain text data
- **Signature-Based Auth** - No passwords, uses Ethereum signatures

## Project Structure

```
safelog/
├── backend/
│   ├── main.py           # API routes
│   ├── models.py         # Database models
│   ├── schemas.py        # Pydantic schemas
│   ├── auth.py           # Authentication logic
│   ├── database.py       # Database setup
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── components/   # React components
    │   ├── context/      # Web3 context
    │   ├── utils/        # Crypto utilities
    │   ├── config.js     # API configuration
    │   └── App.jsx
    ├── package.json
    └── vite.config.js
```

## API Endpoints

- `GET /auth/nonce/{address}` - Get signing nonce
- `POST /auth/login` - Authenticate with signature
- `POST /secrets` - Create encrypted secret
- `GET /secrets/{address}` - List user's secrets
- `POST /secrets/share` - Share secret with another user
- `GET /secrets/shared-with/{address}` - List secrets shared with user
- `GET /users` - Search users
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
- [ ] Document signing UI
- [ ] Session management with JWT
- [ ] PostgreSQL support
- [ ] Mobile-responsive improvements

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
