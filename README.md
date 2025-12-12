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

## ⚠️ Security Notices

> [!WARNING]
> **Local Vault Usage (Extension-less Mode)**
> When using the Local Vault, your PQC keys are encrypted and stored in your browser's `localStorage`.
> - **Data Loss Risk**: Clearing your browser cache or site data **will permanently delete your keys**, resulting in total loss of account access.
> - **Security Trade-off**: While keys are encrypted with your password, browser storage is generally less secure than a dedicated extension sandbox.
> - **Recommendation**: **Regularly export your vault** (Manage Vault -> Export) and store the backup safely. Use the TrustKeys Extension for maximum security.

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
- **Python 3.11+**
- **Node.js 22.13.1**
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
   - `SAFELOG_SECRET_KEY`: **REQUIRED**. Set a strong random string for JWT signing.
     ```bash
     export SAFELOG_SECRET_KEY="your-secure-random-key"
     ```
   - `ALLOWED_ORIGINS`: (Optional) Comma-separated list of allowed CORS origins.
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
   Safelog requires **3 separate processes** to run locally.

   **Terminal 1: Backend (FastAPI)**
   ```bash
   cd backend
   # Helper script handles reload exclusions for SQLite
   ./run_dev.sh
   ```

   **Terminal 2: PQC Microservice (Node.js)**
   *Required for TrustKeys Login*
   ```bash
   cd backend
   # Ensure correct Node version
   nvm use
   node pqc_service.js
   ```

   **Terminal 3: Frontend (Vite)**
   ```bash
   cd frontend
   npm run dev
   ```
   Access the app at `http://localhost:5173`.

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
