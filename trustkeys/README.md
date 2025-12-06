# TrustKeys - Post-Quantum Cryptography (PQC) Extension

TrustKeys is a quantum-resistant browser extension designed to secure Web3 interactions against future quantum computing threats. It implements the **Module-Lattice-based Key Encapsulation Mechanism (ML-KEM)** and **Digital Signature Algorithm (ML-DSA)** standards.

> **Status**: Integrated & Functional
> **Algorithms**: Crystals-Kyber-768 (ML-KEM) & Crystals-Dilithium-2 (ML-DSA)
> **Role**: Primary PQC Authentication Provider for SafeLog.

---

## 🔐 Architecture & Security

### 1. Quantum-Proof Algorithms
TrustKeys utilizes the NIST multi-round selected algorithms for post-quantum security:
- **Encryption**: [Crystals-Kyber-768](https://pq-crystals.org/kyber/) (ML-KEM)
  - Used for securely establishing shared secrets (Key Encapsulation).
  - Hybrid Encryption: Kyber derives a shared secret, which is then used to encrypt messages via **AES-256-GCM**.
- **Signing**: [Crystals-Dilithium-2](https://pq-crystals.org/dilithium/) (ML-DSA)
  - Used for generating unforgeable digital signatures.

### 2. The Secure Vault
- **Zero-Knowledge Architecture**: Your private keys never leave the extension.
- **Encryption**: The vault is encrypted at rest using **AES-GCM (256-bit)**.
- **Key Derivation**: Your password derives the encryption key using **PBKDF2** (SHA-256, 100,000 iterations).
- **Memory-Only Decryption**: Private keys are decrypted into memory *only* when the vault is unlocked and are cleared immediately upon locking.

### 3. Authorization Model
TrustKeys enforces a strict "User Consent" model similar to Ethereum wallets:
- **Connection**: Websites cannot access your account or public keys until you explicitly approve a `connect()` request.
- **Transaction Approval**: Every usage of a private key (Signing or Decrypting) triggers a popup requiring your manual confirmation.
- **Internal Whitelist**: The extension's own Dashboard and Popup have privileged access for management.

---

## 🚀 Getting Started

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   cd trustkeys
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load into Chrome/Brave/Edge:
   - Go to `chrome://extensions`
   - Enable **Developer Mode**
   - Click **Load Unpacked**
   - Select the `trustkeys/dist` folder.

### Usage
1. **Setup**: Click the extension icon. You will be prompted to create a password on first run.
2. **Dashboard**: Once unlocked, you can view your **ML-KEM** and **ML-DSA** public keys.
3. **Account Management**: You can generate multiple PQC accounts inside the vault.

---

## 💻 Web API Reference

TrustKeys injects a `window.trustkeys` object into authorized web pages.

### 1. Connect
Request access to the user's wallet. **Required** before any other method.
```javascript
const success = await window.trustkeys.connect();
// Triggers popup. Returns true if approved.
```

### 2. Get Account
Get the active account's public keys.
```javascript
const account = await window.trustkeys.getAccount();
// Returns { 
//   name: "My PQC Key", 
//   kyberPublicKey: "hex...", 
//   dilithiumPublicKey: "hex..." 
// }
```

### 3. Sign Message (ML-DSA)
Sign a message using the active account's Dilithium private key.
```javascript
const signature = await window.trustkeys.sign("Login Nonce: 12345");
// Triggers Approval Popup. Returns hex-encoded signature.
```

### 4. Encrypt (ML-KEM + AES)
Encrypt data for a target recipient (using their Kyber Public Key).
```javascript
const encrypted = await window.trustkeys.encrypt("My Secret", recipientKyberKey);
// Returns { kem: "hex", iv: "hex", content: "hex" }
```

### 5. Decrypt
Decrypt data intended for the active user.
```javascript
const plaintext = await window.trustkeys.decrypt(encryptedObject);
// Triggers Approval Popup. Returns original string.
```

---

## 🔗 Integration Roadmap

TrustKeys is being developed as a core security module for **SafeLog**.
- **Current**: Standalone Browser Extension (Proof of Concept).
- **Phase 2**: Integration with SafeLog Web App.

### 🛠️ Key Management Features
- **Export Keys**:
  - Accessible via Settings (⚙️).
  - Requires Vault Password.
  - Generates a JSON backup of all accounts (Private + Public Keys).
  - **Security Warning**: Backup file is unencrypted (Plain Text). Store securely!
- **Import Keys**:
  - Restores accounts from a JSON backup.
  - Merges new accounts into the existing vault.

### 🔗 Integration Roadmap
- [x] **Export Keys**: Secure password-gated export.
- [x] **Import Keys**: Restore from JSON.
- [x] **SafeLog Integration**: Fully integrated with frontend.

---

## ⚠️ Disclaimer
This software uses experimental cryptographic standards. While Kyber and Dilithium are NIST-selected, this specific implementation has not undergone a formal security audit. Use for testing and development purposes only.
