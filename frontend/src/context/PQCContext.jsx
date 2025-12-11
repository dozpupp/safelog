import React, { createContext, useContext, useState } from 'react';
import API_ENDPOINTS from '../config';
import { useAuth } from './AuthContext';

const PQCContext = createContext();

export const usePQC = () => {
    const context = useContext(PQCContext);
    if (!context) {
        throw new Error('usePQC must be used within a PQCProvider');
    }
    return context;
};

export const PQCProvider = ({ children }) => {
    const { login: authLogin } = useAuth();
    const [pqcAccount, setPqcAccount] = useState(null); // Dilithium Public Key
    const [kyberKey, setKyberKey] = useState(null);

    const checkAvailability = () => {
        return !!window.trustkeys;
    };

    const loginTrustKeys = async () => {
        if (!window.trustkeys) {
            throw new Error("Unable to access key management - verify your key is unlocked");
        }

        // 1. Connect
        const connected = await window.trustkeys.connect();
        if (!connected) throw new Error("Connection request rejected by user.");

        // 1.5 Security Handshake
        // Verify we are talking to the real extension
        if (window.trustkeys.handshake) {
            const extId = await window.trustkeys.handshake();
            const expectedId = import.meta.env.VITE_TRUSTKEYS_EXTENSION_ID;

            if (expectedId && extId !== expectedId) {
                console.error(`Extension ID Mismatch: Expected ${expectedId}, got ${extId}`);
                throw new Error("Security Error: Extension verification failed. Possible spoofing detected.");
            }
        } else {
            console.warn("TrustKeys Extension too old: Missing handshake.");
        }

        // 2. Get Account (Dilithium PK is our ID)
        const tkAccount = await window.trustkeys.getAccount();
        const accountId = tkAccount.dilithiumPublicKey;
        const encryptionKey = tkAccount.kyberPublicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        // 3. Get Nonce
        const nonceRes = await fetch(API_ENDPOINTS.AUTH.NONCE(accountId));
        if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
        const { nonce } = await nonceRes.json();

        // 4. Sign Nonce (PQC)
        const message = `Sign in to Secure Log App with nonce: ${nonce}`;
        const signature = await window.trustkeys.sign(message); // Signs with Dilithium

        // 5. Verify on Backend
        const loginRes = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: accountId,
                signature,
                nonce,
                encryption_public_key: encryptionKey
            })
        });

        if (loginRes.ok) {
            const data = await loginRes.json();
            authLogin(data.user, 'trustkeys', data.access_token); // Update Global Auth State
            return data.user;
        } else {
            const errText = await loginRes.text();
            throw new Error(`Login failed: ${errText}`);
        }
    };

    const encrypt = async (content, publicKey) => {
        if (!window.trustkeys) throw new Error("Unable to access key management - verify your key is unlocked");
        // Returns { kem, iv, content } object
        return await window.trustkeys.encrypt(content, publicKey || kyberKey);
    };

    const decrypt = async (encryptedObject) => {
        if (!window.trustkeys) throw new Error("Unable to access key management - verify your key is unlocked");
        // encryptedObject must be { kem, iv, content }
        return await window.trustkeys.decrypt(encryptedObject);
    };

    return (
        <PQCContext.Provider value={{
            pqcAccount,
            kyberKey,
            loginTrustKeys,
            checkAvailability,
            encrypt,
            decrypt
        }}>
            {children}
        </PQCContext.Provider>
    );
};
