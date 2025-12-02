# SafeLog

A secure secret management and document signing application using MetaMask for authentication and encryption.

## Features

- 🔐 **MetaMask Authentication** - Login with your Ethereum wallet
- 🔒 **Client-Side Encryption** - Secrets encrypted with your MetaMask encryption keys
- 💾 **Secure Storage** - Encrypted data stored server-side
- 🔓 **On-Demand Decryption** - Decrypt secrets only when needed via MetaMask
- 🎨 **Modern UI** - Dark-themed interface with TailwindCSS
- 📝 **Document Signing** - Sign documents with your wallet (backend ready)

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **SQLAlchemy** - ORM for database management
- **SQLite** - Lightweight database
- **eth-account** - Ethereum signature verification

### Frontend
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Styling
- **@metamask/eth-sig-util** - Encryption utilities
- **ethers.js** - Ethereum library

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 20+
- MetaMask browser extension

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/safelog.git
   cd safelog
   ```

2. **Setup Backend**
   ```bash
   cd backend
   pip3 install -r requirements.txt
   ```

3. **Setup Frontend**
   ```bash
   cd frontend
   npm install
   ```

### Running the Application

1. **Start Backend** (in `backend/` directory)
   ```bash
   python3 -m uvicorn main:app --reload --port 8000
   ```

2. **Start Frontend** (in `frontend/` directory)
   ```bash
   npm run dev
   ```

3. **Access the application**
   - Open http://localhost:5173 in your browser
   - Make sure MetaMask is installed

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
    │   └── App.jsx
    ├── package.json
    └── vite.config.js
```

## API Endpoints

- `GET /auth/nonce/{address}` - Get signing nonce
- `POST /auth/login` - Authenticate with signature
- `POST /secrets` - Create encrypted secret
- `GET /secrets/{address}` - List user's secrets
- `GET /users/{address}` - Get user details

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

- [ ] Secret sharing with other users
- [ ] Document signing UI
- [ ] Session management with JWT
- [ ] PostgreSQL support
- [ ] Mobile-responsive improvements

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
