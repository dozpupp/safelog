import { useState, useEffect } from 'react'
import './App.css'

// --- Components ---

const SetupScreen = ({ onSetup }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (password.length < 4) return setError("Password too short");
    if (password !== confirm) return setError("Passwords do not match");
    onSetup(password);
  };

  return (
    <div className="auth-screen">
      <h2>Welcome to TrustKeys</h2>
      <p>Create a password to secure your quantum vault.</p>
      <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
      <input type="password" placeholder="Confirm Password" value={confirm} onChange={e => setConfirm(e.target.value)} />
      {error && <div className="error">{error}</div>}
      <button className="primary" onClick={handleSubmit}>Create Vault</button>
    </div>
  );
};

const LoginScreen = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    onUnlock(password, (success) => {
      if (!success) setError("Incorrect password");
    });
  };

  return (
    <div className="auth-screen">
      <h2>Unlock Vault</h2>
      <p>Enter your password to access your keys.</p>
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => { setPassword(e.target.value); setError(''); }}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
      />
      {error && <div className="error">{error}</div>}
      <button className="primary" onClick={handleSubmit}>Unlock</button>
    </div>
  );
};

const ConnectScreen = ({ requestId, requestData, onResolve }) => {
  return (
    <div className="auth-screen">
      <h2>Connection Request</h2>
      <p><strong>{requestData.origin}</strong> wants to connect to your TrustKeys wallet.</p>
      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
        <button className="secondary" onClick={() => onResolve(false)} style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Reject</button>
        <button className="primary" onClick={() => onResolve(true)} style={{ flex: 1 }}>Connect</button>
      </div>
    </div>
  );
};

const SignScreen = ({ requestId, requestData, onResolve }) => {
  return (
    <div className="auth-screen">
      <h2>Signature Request</h2>
      <p><strong>{requestData.origin}</strong> is requesting a signature.</p>
      <div style={{ background: '#111', padding: '10px', borderRadius: '6px', width: '100%', marginBottom: '20px', textAlign: 'left', maxHeight: '100px', overflowY: 'auto' }}>
        <div style={{ fontSize: '0.7em', color: '#888', marginBottom: '4px' }}>MESSAGE</div>
        <code style={{ fontSize: '0.85em', wordBreak: 'break-all' }}>{requestData.message}</code>
      </div>
      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
        <button onClick={() => onResolve(false)} style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Reject</button>
        <button className="primary" onClick={() => onResolve(true)} style={{ flex: 1 }}>Sign</button>
      </div>
    </div>
  );
};

const DecryptScreen = ({ requestId, requestData, onResolve }) => {
  return (
    <div className="auth-screen">
      <h2>Decryption Request</h2>
      <p><strong>{requestData.origin}</strong> is requesting to decrypt data.</p>
      <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
        <button onClick={() => onResolve(false)} style={{ flex: 1, padding: '12px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Reject</button>
        <button className="primary" onClick={() => onResolve(true)} style={{ flex: 1 }}>Decrypt</button>
      </div>
    </div>
  );
};


import { deriveShareA, createShareB, recoverSecret, toHex, fromHex } from './utils/mpc';

const SettingsModal = ({ onClose, onExport, onImport, onGoogleBackup, onGoogleRestore, loading }) => {
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('menu'); // menu, export, backup, restore
  const [error, setError] = useState('');
  const [token, setToken] = useState(''); // Google ID Token (Simulated Input)

  const handleExport = () => {
    if (!password) return setError("Password required");
    onExport(password, (success, err) => {
      if (!success) setError(err || "Export failed");
      else onClose();
    });
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.accounts) throw new Error("Invalid format");
        onImport(data.accounts);
      } catch (err) {
        setError("Invalid file format");
      }
    };
    reader.readAsText(file);
  };

  const handleBackup = () => {
    if (!password || !token) return setError("Password and Token required");
    onGoogleBackup(password, token, (success, err) => {
      if (success) {
        alert("Backup successful!");
        onClose();
      } else {
        setError(err || "Backup failed");
      }
    });
  };

  const handleRestore = () => {
    if (!password || !token) return setError("Password and Token required");
    onGoogleRestore(password, token, (success, err) => {
      if (success) {
        alert("Restore successful!");
        onClose();
      } else {
        setError(err || "Restore failed");
      }
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="close-btn" onClick={onClose}>×</button>
        <h3>Settings</h3>

        {mode === 'menu' && (
          <div className="settings-menu">
            <button onClick={() => setMode('export')} className="danger-btn">Export Keys (JSON)</button>
            <label className="primary-btn" style={{ display: 'block', textAlign: 'center', marginTop: '10px', cursor: 'pointer' }}>
              Import Keys (JSON)
              <input type="file" style={{ display: 'none' }} onChange={handleImport} accept=".json" />
            </label>
            <hr style={{ margin: '15px 0', borderColor: '#333' }} />
            <button onClick={() => setMode('backup')} className="secondary-btn" style={{ background: '#4285F4', color: 'white' }}> Backup to Google (MPC)</button>
            <button onClick={() => setMode('restore')} className="text-btn" style={{ marginTop: '10px' }}>Restore from Google</button>
          </div>
        )}

        {mode === 'export' && (
          <div className="export-flow">
            <div className="warning-box">
              <strong>⚠️ SECURITY WARNING</strong>
              <p>You are about to export your private keys in plain text.</p>
            </div>
            <p>Enter password to confirm:</p>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }} placeholder="Password" />
            {error && <div className="error">{error}</div>}
            <button onClick={handleExport} className="danger-btn">Confirm Export</button>
            <button onClick={() => setMode('menu')} className="text-btn">Back</button>
          </div>
        )}

        {(mode === 'backup' || mode === 'restore') && (
          <div className="export-flow">
            <h3>{mode === 'backup' ? 'Google Backup' : 'Google Restore'}</h3>
            <p>1. Enter your TrustKeys Password.</p>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="TrustKeys Password" />

            <p>2. Enter Google ID Token (For Demo/MVP):</p>
            {/* In production, this would be a "Sign in with Google" button that auto-fills or handles auth internally */}
            <input type="text" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste Google ID Token..." style={{ fontSize: '0.8em' }} />

            {error && <div className="error">{error}</div>}
            <button onClick={mode === 'backup' ? handleBackup : handleRestore} className="primary-btn" disabled={loading}>
              {loading ? 'Processing...' : (mode === 'backup' ? 'Encrypt & Upload' : 'Download & Decrypt')}
            </button>
            <button onClick={() => setMode('menu')} className="text-btn">Back</button>
          </div>
        )}

      </div>
    </div>
  );
};


const Dashboard = () => {
  const [accounts, setAccounts] = useState([]);
  const [activeAccount, setActiveAccount] = useState(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [loading, setLoading] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchActiveAccount();
  }, []);

  const fetchAccounts = () => {
    chrome.runtime.sendMessage({ type: 'GET_ACCOUNTS' }, (response) => {
      if (response && response.success) setAccounts(response.accounts);
    });
  };

  const fetchActiveAccount = () => {
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_ACCOUNT' }, (response) => {
      if (response && response.success) setActiveAccount(response.account);
    });
  };

  const createAccount = () => {
    if (!newAccountName) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: 'CREATE_ACCOUNT', name: newAccountName }, (response) => {
      setLoading(false);
      if (response && response.success) {
        setNewAccountName('');
        fetchAccounts();
        if (!activeAccount) fetchActiveAccount();
      }
    });
  };

  const selectAccount = (id) => {
    chrome.runtime.sendMessage({ type: 'SET_ACTIVE_ACCOUNT', id }, (res) => {
      if (res && res.success) {
        fetchActiveAccount();
        fetchAccounts(); // Refresh list to update highlight
      }
    });
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const lockVault = () => {
    chrome.runtime.sendMessage({ type: 'LOCK' }, () => {
      window.location.reload();
    });
  };

  const handleExportKeys = (password, cb) => {
    chrome.runtime.sendMessage({ type: 'EXPORT_KEYS', password }, (res) => {
      if (res && res.success) {
        // Download JSON
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ accounts: res.accounts }));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "trustkeys_backup.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        cb(true);
      } else {
        cb(false, res.error);
      }
    });
  };

  const handleImportKeys = (newAccounts) => {
    chrome.runtime.sendMessage({ type: 'IMPORT_KEYS', accounts: newAccounts }, (res) => {
      if (res && res.success) {
        alert(`Successfully imported ${res.count} accounts.`);
        fetchAccounts();
        setShowSettings(false);
      } else {
        alert(`Import failed: ${res.error}`);
      }
    });
  };

  const handleGoogleBackup = async (password, token, cb) => {
    // 1. Get Private Key (Reuse Export)
    chrome.runtime.sendMessage({ type: 'EXPORT_KEYS', password }, async (res) => {
      if (!res || !res.success) return cb(false, res.error || "Export failed");

      try {
        // Backup Active Account Only for MVP
        // Find account with same ID as activeAccount (or just first one if only one)
        const account = res.accounts.find(a => a.id === activeAccount?.id) || res.accounts[0];
        if (!account) return cb(false, "No account to backup");

        // We need the Dilithium Private Key (which is the critical identity)
        // Format in export is Hex string usually.
        // Convert to bytes
        const privKeyBytes = fromHex(account.dilithiumPrivateKey);

        // 2. Derive Share A
        const salt = "safelog_mpc_v1";
        const shareA = await deriveShareA(password, salt, privKeyBytes.length);

        // 3. Create Share B
        const shareB = createShareB(privKeyBytes, shareA);
        const shareBHex = toHex(shareB);

        // 4. Upload to Safelog
        const apiRes = await fetch('https://safeapi.hashpar.com/recovery/store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token, share_data: JSON.stringify({
              // Wrap in object to store metadata or other keys later
              type: 'dilithium_mpc',
              shareB: shareBHex,
              name: account.name,
              dilithiumPublicKey: account.dilithiumPublicKey,
              kyberPublicKey: account.kyberPublicKey,
              kyberShareB: toHex(createShareB(fromHex(account.kyberPrivateKey), await deriveShareA(password, salt + "_kyber", fromHex(account.kyberPrivateKey).length)))
            })
          })
        });

        if (apiRes.ok) cb(true);
        else cb(false, "Upload failed: " + apiRes.status);

      } catch (e) {
        console.error(e);
        cb(false, e.message);
      }
    });
  };

  const handleGoogleRestore = async (password, token, cb) => {
    try {
      // 1. Fetch form Safelog
      const apiRes = await fetch('https://safeapi.hashpar.com/recovery/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (!apiRes.ok) return cb(false, "Fetch failed (Check Token)");
      const { share_data } = await apiRes.json();
      const backupData = JSON.parse(share_data);

      // 2. Recover Keys
      const salt = "safelog_mpc_v1";

      // Dilithium
      const dimShareB = fromHex(backupData.shareB);
      const dimShareA = await deriveShareA(password, salt, dimShareB.length);
      const dimPrivKey = recoverSecret(dimShareA, dimShareB);

      // Kyber
      const kybShareB = fromHex(backupData.kyberShareB);
      const kybShareA = await deriveShareA(password, salt + "_kyber", kybShareB.length);
      const kybPrivKey = recoverSecret(kybShareA, kybShareB);

      // 3. Reconstruct Account Objects
      const newAccount = {
        id: Date.now(), // Generate new local ID
        name: backupData.name + " (Recovered)",
        dilithiumPublicKey: backupData.dilithiumPublicKey,
        dilithiumPrivateKey: toHex(dimPrivKey),
        kyberPublicKey: backupData.kyberPublicKey,
        kyberPrivateKey: toHex(kybPrivKey),
        active: true
      };

      // 4. Import
      handleImportKeys([newAccount]);
      cb(true);

    } catch (e) {
      console.error(e);
      cb(false, e.message);
    }
  };

  return (
    <div className="dashboard">
      <div className="header">
        <h2>TrustKeys <span className="highlight">PQC</span></h2>
        <div className="header-actions">
          <button className="small-btn" onClick={() => setShowSettings(true)} title="Settings">⚙️</button>
          <button className="small-btn" onClick={lockVault} title="Lock Vault">🔒</button>
          <div className={`status-indicator ${activeAccount ? 'active' : ''}`}></div>
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onExport={handleExportKeys}
          onImport={handleImportKeys}
        />
      )}

      {activeAccount ? (
        <div className="card active-card">
          <div className="card-header">
            <strong>{activeAccount.name}</strong>
            <span className="badge">ACTIVE</span>
          </div>

          <div className="key-section">
            <div className="key-header">
              <span>ML-KEM (Kyber)</span>
              <button onClick={() => copyToClipboard(activeAccount.kyberPublicKey, 'kyber')} className={copyFeedback === 'kyber' ? 'copied' : ''}>
                {copyFeedback === 'kyber' ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="key-box">{activeAccount.kyberPublicKey}</div>
          </div>

          <div className="key-section">
            <div className="key-header">
              <span>ML-DSA (Dilithium)</span>
              <button onClick={() => copyToClipboard(activeAccount.dilithiumPublicKey, 'dilithium')} className={copyFeedback === 'dilithium' ? 'copied' : ''}>
                {copyFeedback === 'dilithium' ? 'COPIED' : 'COPY'}
              </button>
            </div>
            <div className="key-box">{activeAccount.dilithiumPublicKey}</div>
          </div>
        </div>
      ) : (
        <div className="empty-state">No Active Account</div>
      )}

      <div className="accounts-list">
        <h3>Accounts</h3>
        {accounts.map(acc => (
          <div key={acc.id} className={`account-item ${acc.active ? 'current' : ''}`} onClick={() => selectAccount(acc.id)}>
            <span>{acc.name}</span>
            {acc.active && <span className="check">✓</span>}
          </div>
        ))}

        <div className="create-account">
          <input
            type="text"
            placeholder="New Account Name"
            value={newAccountName}
            onChange={e => setNewAccountName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAccount()}
          />
          <button onClick={createAccount} disabled={loading}>{loading ? '...' : '+'}</button>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

function App() {
  const [status, setStatus] = useState({ loading: true, isLocked: true, hasPassword: false });
  const [pendingRequest, setPendingRequest] = useState(null);

  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const route = params.get('route');
  const requestId = params.get('requestId');

  const checkStatus = () => {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
      if (response && response.success) {
        setStatus({ loading: false, isLocked: response.isLocked, hasPassword: response.hasPassword });
      } else {
        setStatus(prev => ({ ...prev, loading: false }));
      }
    });
  };

  useEffect(() => {
    checkStatus();
    if (requestId) {
      // Fetch request data
      chrome.runtime.sendMessage({ type: 'GET_PENDING_REQUEST', requestId }, (response) => {
        if (response && response.success) {
          setPendingRequest({ id: requestId, ...response.request });
        }
      });
    }
  }, [requestId]);

  const handleSetup = (password) => {
    chrome.runtime.sendMessage({ type: 'SETUP_PASSWORD', password }, (response) => {
      if (response && response.success) {
        checkStatus();
      }
    });
  };

  const handleUnlock = (password, cb) => {
    chrome.runtime.sendMessage({ type: 'UNLOCK', password }, (response) => {
      if (response && response.success) {
        checkStatus();
        cb(true);
      } else {
        cb(false);
      }
    });
  };

  const handleResolve = (approved) => {
    chrome.runtime.sendMessage({ type: 'RESOLVE_REQUEST', requestId, approved }, (response) => {
      if (response && response.success) {
        window.close(); // Close popup context
      }
    });
  };

  if (status.loading) return <div className="loading">Loading...</div>;

  // Global Auth Guard
  if (!status.hasPassword) return <SetupScreen onSetup={handleSetup} />;
  if (status.isLocked) return <LoginScreen onUnlock={handleUnlock} />;

  // Routing
  if (route === 'connect' && pendingRequest) {
    if (pendingRequest.type === 'CONNECT') {
      return <ConnectScreen requestId={requestId} requestData={pendingRequest.data} onResolve={handleResolve} />;
    }
  }
  if (route === 'sign' && pendingRequest) {
    if (pendingRequest.type === 'SIGN') {
      return <SignScreen requestId={requestId} requestData={pendingRequest.data} onResolve={handleResolve} />;
    }
  }
  if (route === 'decrypt' && pendingRequest) {
    if (pendingRequest.type === 'DECRYPT') {
      return <DecryptScreen requestId={requestId} requestData={pendingRequest.data} onResolve={handleResolve} />;
    }
  }

  return <Dashboard />;
}

export default App;
