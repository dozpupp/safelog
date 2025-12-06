# TrustKeys - Quantum-Proof Key Management

A browser extension module for secure key management using Post-Quantum Cryptography (PQC).

## Features
- **PQC/Quantum-Proof**: Uses Crystals-Kyber for encryption and Crystals-Dilithium for signing.
- **Secure Storage**: Keys stored in local extension storage.
- **Web API**: Injects API for websites to request operations.

## Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Build or Watch
To build once:
```bash
npm run build
```

To watch for changes (HMR):
```bash
npm run dev
```

## Installation in Chrome/Brave/Edge

1. Open your browser and navigate to `chrome://extensions`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist` folder inside this project directory (`safelog/trustkeys/dist`).
   - *Note: If you are running `npm run dev`, you can select the `dist` folder created by Vite.*

## Usage

Click the extension icon in the toolbar to open the popup interface.
