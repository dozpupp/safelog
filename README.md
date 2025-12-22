# SafeLog

A secure secret management and document signing application featuring **Quantum-Proof Security** via the TrustKeys extension.

## Features

- 🔐 **Dual Authentication** - Login with **MetaMask** (Ethereum) or **TrustKeys** (Post-Quantum) using secure **Dilithium-Signed JWTs**.
- 🧬 **Quantum-Proof Cryptography** - Integration with **Crystals-Kyber** (ML-KEM) and **Crystals-Dilithium** (ML-DSA).
- 🛡️ **Hardened Secure Vault** - AES-256 + SHA-512 KDF (600k iterations) ensures locally stored keys are safe from quantum/brute-force attacks.
- 📂 **File Vault** - Securely upload, encrypt, and share files (Images, PDFs, etc.).
- 💣 **Timebomb Access** - Share secrets with self-destruct timers (Ephemeral Access).
- ☁️ **MPC Recovery** - Backup your PQC identity using **Google ID** (Multi-Party Computation) without entrusting your full key to any single party.
- 💾 **Hybrid Encryption** -  
  - Standard Users: ECDH + AES (MetaMask).
  - PQC Users: Kyber-768 Encapsulation + AES-GCM (TrustKeys).
- 🤝 **Secure Sharing** - Share encrypted secrets between any user type (Eth ↔ PQC).
- ✍️ **Signed Documents** - Create, share, and verify digitally signed documents (Sign-then-Encrypt) to prove authorship.
- 📝 **Multisignature Workflows** - Create approval chains requiring multiple signatures (`M-of-N` or `N-of-N`) before secrets are cryptographically released to recipients.
- 💬 **Encrypted Messenger** - End-to-End Encrypted (E2EE) instant messaging. Messages are double-encrypted (for sender and recipient) using Kyber-768, ensuring privacy even from the server.
- 👤 **User Profiles** - Manage usernames and view PQC identities.

## 📝 Multisignature Workflows

Safelog implements a robust **Zero-Trust Multisignature** system designed for high-security approvals (e.g., launch codes, sensitive disclosures).

### Core Principles
1.  **Release-on-Completion**: Recipients **cannot** access the content until **ALL** required signers have signed. The encryption keys for recipients are literally not generated until the final signature is applied.
2.  **End-to-End Encryption**: The backend serves as a coordinator but **never** has access to the secret content or the keys.
    *   **Creator** encrypts for Signers.
    *   **Last Signer** encrypts for Recipients.
3.  **Isolated Workflows**: Signers access requests via a dedicated "Workflows" interface, preventing clutter in their standard "Shared Secrets" vault.
4.  **Attached Signatures**: Supports large post-quantum signatures (Dilithium) attached directly to the payload, ensuring the exact viewed content is what is cryptographically signed.

### The Flow
1.  **Create**: A Creator defines a secret, selects **Signers**, and optionally **Recipients**.
2.  **Sign**: Signers review the content and cryptographically sign it.
3.  **Release**: When the **Last Signer** submits their signature, their client automatically generates and encrypts access keys for the Recipients.
4.  **Access**: Only then does the workflow status flip to `COMPLETED`, allowing Recipients to decrypt and view the result.

## ⚠️ Security Notices

> [!WARNING]
> **Local Vault Usage (Extension-less Mode)**
> When using the Local Vault, your PQC keys are encrypted and stored in your browser's `localStorage`.
> - **Data Loss Risk**: Clearing your browser cache or site data **will permanently delete your keys**, resulting in total loss of account access.
> - **Security Trade-off**: While keys are encrypted with your password, browser storage is generally less secure than a dedicated extension sandbox.
> - **Recommendation**: **Regularly export your vault** (Manage Vault -> Export) and store the backup safely. Use the TrustKeys Extension for maximum security.
> - **Encryption**: We use **AES-256-GCM** derived via **PBKDF2-SHA-512** (600,000 iterations) for maximum resistance against GPU/Quantum cracking.

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
- **MPC Recovery** - Google-authenticated key reconstruction. (not active yet)

## Getting Started
 
 ### Prerequisites
 - **Python 3.11+**
 - **Node.js 22.13.1**
 - **TrustKeys Extension** (Included in repo) for PQC features.
 - MetaMask (Optional, for standard features).
 
 ### Installation & Setup
 
 1. **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/safelog.git
    cd safelog
    ```
 
 2. **Setup Backend**
    The backend consists of a Python FastAPI server and a Node.js microservice for PQC operations.
 
    ```bash
    cd backend
    
    # 1. Environment Setup
    cp .env.example .env
    # CRITICAL: Edit .env and set a random SAFELOG_SECRET_KEY
    # The application will fail to start if this key is missing.
    # ALSO: Ensure PQC_SHARED_SECRET is set (check .env.example) to secure backend<->service communication.
    
    # 2. Install Python Dependencies
    pip3 install -r requirements.txt
    
    # 3. Install Node.js Dependencies (for PQC Service)
    npm install
    
    # 4. Initialize Database
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
    - Install dependencies and build:
      ```bash
      cd trustkeys
      npm install
      npm run build
      ```
    - Open Chrome/Brave to `chrome://extensions`.
    - Enable **Developer Mode** (toggle in top right).
    - Click **Load Unpacked** and select the `safelog/trustkeys/dist` folder.
    - Note the Extension ID (you might need it for specific configurations), but generally, it works out of the box for local dev.
 
 ---
 
 ## 🏃‍♂️ Running the Application
 
 Safelog requires **3 separate terminal processes** to run locally.
 
 ### Terminal 1: PQC Microservice
 *This service handles the heavy lifting for Post-Quantum Cryptography (Dilithium/Kyber).*
 
 ```bash
 cd backend
 # Ensure the .env file has SAFELOG_SECRET_KEY set!
 node pqc_service.js
 ```
 *Expected Output:* `[PQC Service] Ready on http://127.0.0.1:3002`
 
 ### Terminal 2: Backend API
 *The main FastAPI server.*
 
 ```bash
 cd backend
 ./run_dev.sh
 ```
 *Expected Output:* `Uvicorn running on http://127.0.0.1:8000`
 
 ### Terminal 3: Frontend
 *The React application.*
 
 ```bash
 cd frontend
 npm run dev
 ```
 *Expected Output:* `Local: http://localhost:5173/`
 
 ---
 
 ## 🛠️ Configuration & Security Notes
 
 ### Environment Variables
 - **backend/.env**:
   - `SAFELOG_SECRET_KEY`: **Mandatory**. Used to deterministically generate server PQC keys.
   - `PQC_SHARED_SECRET`: **Mandatory**. Shared secret / API Key for authenticating the PQC Microservice.
   - `PQC_SERVICE_URL`: **Optional**. URL of the PQC Microservice (default: `http://127.0.0.1:3002`).
   - `ALLOWED_ORIGINS`: CORS settings (default includes localhost).
   - `GOOGLE_CLIENT_ID`: (Disabled) Previously used for MPC Recovery.
 
 ### Disabled Features
 - **Google MPC Recovery**: The "Restore from Google" functionality is currently **disabled** in the code to prevent security risks associated with unstable Extension IDs in development mode.
 
 ### Nginx / Production Notes
 Post-Quantum Cryptography signatures (Dilithium2) are significantly larger (~2-3KB) than standard signatures.
 **You must increase the buffer size in your Nginx configuration** to avoid `431 Request Header Fields Too Large` errors when passing JWTs.
 
 ```nginx
 http {
    client_header_buffer_size 4k;
    large_client_header_buffers 4 16k;
    client_max_body_size 64M; # Increased to support large attached PQC signatures
 }
 ```

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
