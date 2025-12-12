import React, { createContext, useContext, useState, useEffect } from 'react';
import API_ENDPOINTS from '../config';
import { useAuth } from './AuthContext';
import { vaultService } from '../services/vault';

const PQCContext = createContext();

export const usePQC = () => {
    const context = useContext(PQCContext);
    if (!context) {
        throw new Error('usePQC must be used within a PQCProvider');
    }
    return context;
};

export const PQCProvider = ({ children }) => {
    const { login: authLogin, logout: authLogout } = useAuth();
    const [pqcAccount, setPqcAccount] = useState(null); // Dilithium Public Key
    const [kyberKey, setKyberKey] = useState(null);
    const [isExtensionAvailable, setIsExtensionAvailable] = useState(false);
    const [hasLocalVault, setHasLocalVault] = useState(false);

    useEffect(() => {
        // Check availability on mount and slightly after (for injection delay)
        const check = () => {
            setIsExtensionAvailable(!!window.trustkeys);
            setHasLocalVault(vaultService.hasVault());
        };
        check();
        const t = setTimeout(check, 500);
        return () => clearTimeout(t);
    }, []);

    const performServerLogin = async (accountId, encryptionKey, signFn) => {
        // 1. Get Nonce
        const nonceRes = await fetch(API_ENDPOINTS.AUTH.NONCE(accountId));
        if (!nonceRes.ok) throw new Error("Failed to fetch nonce");
        const { nonce } = await nonceRes.json();

        // 2. Sign Nonce
        const message = `Sign in to Secure Log App with nonce: ${nonce}`;
        const signature = await signFn(message);

        // 3. Verify on Backend
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
            authLogin(data.user, 'trustkeys', data.access_token);
            return data.user;
        } else {
            const errText = await loginRes.text();
            throw new Error(`Login failed: ${errText}`);
        }
    };

    const loginTrustKeys = async () => {
        if (!window.trustkeys) {
            throw new Error("Extension not found");
        }

        // 1. Connect
        const connected = await window.trustkeys.connect();
        if (!connected) throw new Error("Connection request rejected.");

        // Handshake skipped for brevity/compatibility, or keep it if needed
        if (window.trustkeys.handshake) {
            await window.trustkeys.handshake();
            // Ignore ID check for now to allow flexible dev
        }

        // 2. Get Account
        const tkAccount = await window.trustkeys.getAccount();
        const accountId = tkAccount.dilithiumPublicKey;
        const encryptionKey = tkAccount.kyberPublicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        return performServerLogin(accountId, encryptionKey, (msg) => window.trustkeys.sign(msg));
    };

    const loginLocalVault = async (password) => {
        const success = await vaultService.unlock(password);
        if (!success) throw new Error("Incorrect password");

        const account = vaultService.getActiveAccount();
        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        return performServerLogin(accountId, encryptionKey, (msg) => vaultService.sign(msg));
    };

    const createLocalVault = async (name, password) => {
        const account = await vaultService.setup(name, password);
        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        // Refresh state
        setHasLocalVault(true);

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        return performServerLogin(accountId, encryptionKey, (msg) => vaultService.sign(msg));
    };

    const encrypt = async (content, publicKey) => {
        if (isExtensionAvailable && window.trustkeys) {
            return await window.trustkeys.encrypt(content, publicKey || kyberKey);
        } else if (!vaultService.isLocked) {
            // Local encrypt (note: encryptMessage in crypto.js is stateless, doesn't need unlock, but nice to have consistent API)
            // Actually encrypt uses Public Key, so it doesn't strictly require unlock, 
            // but our `encryptMessage` import is available.
            // VaultService doesn't expose `encrypt` directly? 
            // Let's import it or add it to VaultService.
            // Actually, `vaultService` should helper methods.
            const { encryptMessagePQC } = await import('../utils/crypto');
            return await encryptMessagePQC(content, publicKey || kyberKey);
        }
        throw new Error("PQC Provider not ready (Locked or Missing)");
    };

    const decrypt = async (encryptedObject) => {
        if (isExtensionAvailable && window.trustkeys) {
            return await window.trustkeys.decrypt(encryptedObject);
        } else if (!vaultService.isLocked) {
            return await vaultService.decrypt(encryptedObject);
        }
        throw new Error("PQC Provider not ready (Locked or Missing)");
    };

    const getVaultAccounts = () => vaultService.getAccounts();

    const addVaultAccount = async (name) => {
        const acc = await vaultService.addAccount(name);
        return acc;
    };

    const switchVaultAccount = async (id) => {
        const account = await vaultService.switchAccount(id);

        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        // Force re-login with the new account to sync backend session
        try {
            authLogout(); // Clear previous session first
            await performServerLogin(accountId, encryptionKey, (msg) => vaultService.sign(msg));
        } catch (e) {
            console.error("PQCContext: Auto-login failed after switch", e);
            throw new Error("Switched account but login failed: " + e.message);
        }

        return account;
    };

    const deleteVaultAccount = async (id) => {
        await vaultService.deleteAccount(id);
        // If the deleted account was active, vaultService auto-switches.
        // We need to sync state.
        const current = vaultService.getActiveAccount();
        if (current) {
            setPqcAccount(current.dilithium.publicKey);
            setKyberKey(current.kyber.publicKey);
        }
    };

    const exportVault = async () => vaultService.exportVault();
    const importVault = async (json) => vaultService.importVault(json);

    return (
        <PQCContext.Provider value={{
            pqcAccount,
            kyberKey,
            isExtensionAvailable,
            hasLocalVault,
            loginTrustKeys,
            loginLocalVault,
            createLocalVault,
            encrypt,
            decrypt,
            getVaultAccounts,
            addVaultAccount,
            switchVaultAccount,
            deleteVaultAccount,
            exportVault,
            importVault
        }}>

            {children}
        </PQCContext.Provider>
    );
};
