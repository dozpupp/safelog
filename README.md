# SafeLog

A secure secret management and document signing application using MetaMask for authentication and encryption.

## Features

- 🔐 **MetaMask Authentication** - Login with your Ethereum wallet
- 🔒 **Client-Side Encryption** - Secrets encrypted with your MetaMask encryption keys
- 💾 **Secure Storage** - Encrypted data stored server-side
- 🔓 **On-Demand Decryption** - Decrypt secrets only when needed via MetaMask
- 🤝 **Secret Sharing** - Share encrypted secrets with other users securely
- 👤 **User Profiles** - Manage your username and profile
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

3. **Initialize Database**
   Before running the backend for the first time, initialize the database:
   ```bash
   # This script creates the SQLite database and necessary tables
   python3 create_database.py
   ```

4. **Create Test Users (Optional)**
   If you want to populate the database with test users for development:
   ```bash
   python3 create_test_users.py
   ```

5. **Setup Frontend**
   ```bash
   cd frontend
   npm install
   ```

### Configuration

The frontend API URL can be configured using environment variables.

1. Copy the example environment file:
   ```bash
   cd frontend
   cp .env.example .env
   ```

2. Edit `.env` and set your backend URL:
   ```
   VITE_API_BASE_URL=http://your-backend-host:8000
   ```

   *If not set, it defaults to `http://localhost:8000`.*

### Running on a Remote Server

If you are running the frontend on a remote server (e.g., a VPS) and want to access it from your local browser:

1. **Configure Backend URL**:
   Edit `.env` and set `VITE_API_BASE_URL` to the public IP or domain of your backend.
   ```
   VITE_API_BASE_URL=http://your-server-ip:8000
   ```

2. **Run with Host Exposure**:
   By default, Vite only listens on localhost. To access it externally, run:
   ```bash
   npm run dev -- --host
   ```
   This will listen on `0.0.0.0`, allowing access via `http://your-server-ip:5173`.

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
