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

const SettingsModal = ({ onClose, onExport, onImport }) => {
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('menu'); // menu, export
  const [error, setError] = useState('');

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

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="close-btn" onClick={onClose}>×</button>
        <h3>Settings</h3>

        {mode === 'menu' && (
          <div className="settings-menu">
            <button onClick={() => setMode('export')} className="danger-btn">Export Keys</button>
            <label className="primary-btn" style={{ display: 'block', textAlign: 'center', marginTop: '10px', cursor: 'pointer' }}>
              Import Keys
              <input type="file" style={{ display: 'none' }} onChange={handleImport} accept=".json" />
            </label>
          </div>
        )}

        {mode === 'export' && (
          <div className="export-flow">
            <div className="warning-box">
              <strong>⚠️ SECURITY WARNING</strong>
              <p>You are about to export your private keys in plain text. Anyone with this file can access your account.</p>
            </div>
            <p>Enter password to confirm:</p>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              placeholder="Password"
            />
            {error && <div className="error">{error}</div>}
            <button onClick={handleExport} className="danger-btn">Confirm Export</button>
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
