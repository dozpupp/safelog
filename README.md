# SafeLog

A secure secret management and document signing application featuring **Quantum-Proof Security** via the TrustKeys extension.

## Features

- 🔐 **Dual Authentication** - Login with **MetaMask** (Ethereum) or **TrustKeys** (Post-Quantum) using secure JWT sessions.
- 🧬 **Quantum-Proof Cryptography** - Integration with **Crystals-Kyber** (ML-KEM) and **Crystals-Dilithium** (ML-DSA).
- 🛡️ **Secure Vault** - Client-side encryption ensures the server never sees your secrets.
- 📂 **File Vault** - Securely upload, encrypt, and share files (Images, PDFs, etc.).
- 💣 **Timebomb Access** - Share secrets with self-destruct timers (Ephemeral Access).
- ☁️ **MPC Recovery** - Backup your PQC identity using **Google ID** (Multi-Party Computation) without entrusting your full key to any single party.
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
- **PyJWT** - Secure session management.

### Frontend (`/frontend`)
- **React 19 + Vite** - Fast, modern UI.
- **Context Architecture** - Separation of concerns (`AuthContext`, `Web3Context`, `PQCContext`).
- **TailwindCSS** - Responsive dark-mode design.

### TrustKeys Extension (`/trustkeys`)
- **Browser Extension** - Manages PQC keys securely.
- **WASM Cryptography** - High-performance ML-KEM and ML-DSA implementation.
- **Encrypted Vault** - AES-256-GCM protection for private keys.
- **MPC Recovery** - Google-authenticated key reconstruction.

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
   
   # Install Python Dependencies
   pip3 install -r requirements.txt
   
   # Install Node.js Dependencies (Crucial for PQC Verification)
   npm install
   
   # Initialize DB
   python3 create_database.py
   ```
   **Configuration (`.env`):**
   - `SECRET_KEY`: Set a strong random string for JWT signing.
   - `GOOGLE_CLIENT_ID`: Required for secure MPC recovery (matches Extension ID).

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
   - **Important**: If you update the code, you must reload the extension here and refresh the app page.

5. **Run Application**
   - Backend: `uvicorn main:app --reload` (Port 8000)
   - Frontend: `npm run dev` (Port 5173)

## Security Architecture

SafeLog employs a **Zero-Trust** architecture. All data is encrypted client-side before transmission. 

- **Session Management**: 
  - Login uses digital signatures (ECDSA/Dilithium) to verify identity.
  - Returns a **JWT** (JSON Web Token) for stateless, secure session management.
  - All sensitive endpoints require `Authorization: Bearer <token>`.
- **Data Protection**: Secrets are encrypted using a recipient's public key (encryption key) before hitting the database.
- **Post-Quantum Readiness**: Ready for the future with NIST-standardized algorithms (ML-KEM, ML-DSA).
- **Access Control**: Backend enforces strict ownership checks derived from the authenticated JWT, preventing IDOR attacks.

### Configuration

1. **Configure Backend URL (Frontend)**:
   Edit `frontend/.env` and set `VITE_API_BASE_URL` to the public URL of your backend.
   ```
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```

2. **Configure CORS (Backend)**:
   The backend restricts access to known origins. To allow your frontend domain to make requests, set `ALLOWED_ORIGINS` environment variable when running the backend.
   ```bash
   export ALLOWED_ORIGINS="http://yourdomain.com,http://another-domain.com"
   python3 -m uvicorn main:app --reload --port 8000
   ```
   *Note: `localhost:5173` is allowed by default.*

## Usage

### Login
1. Click "Connect Wallet"
2. Approve MetaMask connection or TrustKeys Unlock
3. Sign the authentication message
4. Approve encryption public key request

### Create a Secret
1. Click "+ New Secret"
2. Enter a name and content OR Upload a file (Image/PDF)
3. (Optional) Set an Expiry Time (Timebomb)
4. Click "Encrypt & Save"

### Share a Secret
1. Click the Share icon on a secret
2. Search for a user by username or address
3. Select the user and click "Share"
4. The secret is securely re-encrypted for the recipient

## Design Decisions & Future Work
- **Database**: Currently uses SQLite for simplicity. **Production Deployment MUST use PostgreSQL**.
- **Nonce Storage**: Currently in-memory. **Production MUST use Redis** for scalability.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
