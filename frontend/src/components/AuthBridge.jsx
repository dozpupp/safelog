import React, { useEffect, useState } from 'react';

const AuthBridge = () => {
    const [status, setStatus] = useState('initializing');
    const [extId, setExtId] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('ext_id');
        setExtId(id);

        if (!id) {
            setStatus('error_no_id');
            return;
        }

        const initGsi = () => {
            if (!window.google) return;
            try {
                // Use env var or fallback (which will likely fail on custom domains)
                const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "277636686001-av155j3451d80d26bdl764k1kdd2862d.apps.googleusercontent.com";

                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleCredentialResponse
                });

                // Check for client_id param override
                const clientIdParam = params.get('client_id');
                if (clientIdParam) {
                    window.google.accounts.id.initialize({
                        client_id: clientIdParam,
                        callback: handleCredentialResponse
                    });
                }

                window.google.accounts.id.renderButton(
                    document.getElementById("buttonDiv"),
                    { theme: "outline", size: "large" }
                );
                setStatus('ready');
                clearInterval(interval);
            } catch (e) {
                console.error("GSI Error:", e);
                setStatus('error_gsi');
                clearInterval(interval);
            }
        };

        // Poll for GSI
        const interval = setInterval(initGsi, 100);
        // Also try immediately
        initGsi();

        // Timeout after 5s
        const timeout = setTimeout(() => {
            clearInterval(interval);
            setStatus(prev => prev === 'initializing' ? 'timeout_gsi' : prev);
        }, 5000);

        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, []);

    const handleCredentialResponse = (response) => {

        // Fix: Read ID directly from URL to avoid stale closure (useEffect captures initial null state)
        const params = new URLSearchParams(window.location.search);
        const currentExtId = params.get('ext_id');

        // Send to Extension
        if (currentExtId && window.chrome && window.chrome.runtime) {
            setStatus('sending');
            window.chrome.runtime.sendMessage(currentExtId, {
                type: "OAUTH_SUCCESS",
                token: response.credential
            }, (res) => {
                // If lastError is set, usage failed
                if (window.chrome.runtime.lastError) {
                    console.error(window.chrome.runtime.lastError);
                    setErrorMessage(window.chrome.runtime.lastError.message || "Unknown Runtime Error");
                    setStatus('send_error');
                }
                // If response has { success: false }
                else if (res && !res.success) {
                    setErrorMessage(res.error || "Extension returned failure");
                    setStatus('send_error');
                }
                else {
                    setStatus('success');
                }
            });

            // Fallback: If chrome.runtime isn't available (e.g. not viewed in same profile?), prompt user to copy.
            // But usually safer to show success and ask to close.
            setStatus('success_sent');
        } else {
            setStatus('error_bridge');
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'sans-serif',
            background: '#1a1a1a',
            color: '#fff'
        }}>
            <h2>SafeLog Auth Bridge</h2>

            {status === 'initializing' && (
                <div style={{ color: '#aaa' }}>
                    <p>Loading Google Sign-In...</p>
                    <p style={{ fontSize: '0.8em' }}>Status: {status}</p>
                </div>
            )}

            {/* Visual Debug for User */}
            {status !== 'initializing' && status !== 'ready' && (
                <div style={{ marginTop: '20px', color: 'yellow', fontSize: '10px' }}>
                    Debug Status: {status}
                </div>
            )}

            {status === 'timeout_gsi' && (
                <div style={{ color: 'orange' }}>
                    <p>Google Script failed to load (Timeout).</p>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px', marginTop: '10px' }}>Retry</button>
                </div>
            )}

            {status === 'ready' && (
                <p>Please sign in to connect.</p>
            )}

            <div id="buttonDiv" style={{ display: status === 'ready' ? 'block' : 'none' }}></div>

            {status === 'success' && (
                <div style={{ textAlign: 'center', color: '#4caf50' }}>
                    <h3>✓ Connection Successful</h3>
                    <p>You have signed in to TrustKeys.</p>
                    <p style={{ fontSize: '0.8em', marginTop: '10px', color: '#aaa' }}>You can now close this tab.</p>
                </div>
            )}

            {status === 'success_sent' && (
                <div style={{ textAlign: 'center', color: '#4caf50' }}>
                    <h3>✓ Connected (Fallback)</h3>
                    <p>Token ready.</p>
                </div>
            )}

            {status === 'send_error' && (
                <div style={{ color: 'orange', textAlign: 'center' }}>
                    <p>Token received, but failed to send to extension.</p>
                    <p style={{ fontSize: '0.8em', marginTop: '10px' }}>Error Details:</p>
                    <pre style={{ background: '#333', padding: '10px', borderRadius: '4px' }}>
                        {errorMessage}
                    </pre>
                </div>
            )}

            {status === 'error_bridge' && (
                <div style={{ color: 'red', textAlign: 'center' }}>
                    <p>Bridge Error: Extension not detected.</p>
                    <p style={{ fontSize: '0.8em' }}>
                        Missing:
                        {!window.chrome ? ' window.chrome' : ''}
                        {window.chrome && !window.chrome.runtime ? ' chrome.runtime' : ''}
                    </p>
                    <p style={{ fontSize: '0.8em', marginTop: '10px' }}>
                        Did you <strong>Reload the Extension</strong> in chrome://extensions?
                    </p>
                </div>
            )}

            {status === 'error_gsi' && (
                <p style={{ color: 'red' }}>Google Initialization Error. Check Console.</p>
            )}

            {extId && <p style={{ marginTop: '20px', fontSize: '0.8em', color: '#666' }}>Extension ID: {extId}</p>}
        </div>
    );
};

export default AuthBridge;
