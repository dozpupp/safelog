import React, { useEffect, useState } from 'react';

const AuthBridge = () => {
    const [status, setStatus] = useState('initializing');
    const [extId, setExtId] = useState(null);

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
                window.google.accounts.id.initialize({
                    client_id: "277636686001-av155j3451d80d26bdl764k1kdd2862d.apps.googleusercontent.com",
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
        console.log("Encoded JWT ID token: " + response.credential);

        // Send to Extension
        if (extId && window.chrome && window.chrome.runtime) {
            setStatus('sending');
            window.chrome.runtime.sendMessage(extId, {
                type: "OAUTH_SUCCESS",
                token: response.credential
            }, (res) => {
                // Callback might not fire if extension is not listening or externally_connectable mismatch
                // accessible from content script? No, sendMessage to specific ID works from web IF externally_connectable.
                if (window.chrome.runtime.lastError) {
                    console.error(window.chrome.runtime.lastError);
                    setStatus('send_error');
                } else {
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

            {status === 'success_sent' && (
                <div style={{ textAlign: 'center', color: '#4caf50' }}>
                    <h3>✓ Connected!</h3>
                </div>
            )}

            {status === 'send_error' && (
                <p style={{ color: 'orange' }}>Token received, but failed to send to extension.</p>
            )}

            {status === 'error_gsi' && (
                <p style={{ color: 'red' }}>Google Initialization Error. Check Console.</p>
            )}

            {extId && <p style={{ marginTop: '20px', fontSize: '0.8em', color: '#666' }}>Extension ID: {extId}</p>}
        </div>
    );
};

export default AuthBridge;
