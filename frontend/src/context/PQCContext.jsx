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

import PasswordModal from '../components/PasswordModal';

export const PQCProvider = ({ children }) => {
    const { login: authLogin, logout: authLogout } = useAuth();
    const [pqcAccount, setPqcAccount] = useState(null); // Dilithium Public Key
    const [kyberKey, setKyberKey] = useState(null);
    const [isExtensionAvailable, setIsExtensionAvailable] = useState(false);
    const [hasLocalVault, setHasLocalVault] = useState(false);

    // Modal State
    const [modalConfig, setModalConfig] = useState({
        isOpen: false,
        message: '',
        resolve: null,
        reject: null
    });

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

    // FIX: Clear state if authType changes away from trustkeys (Logout or Switch)
    const { authType } = useAuth();
    useEffect(() => {
        if (authType !== 'trustkeys') {
            setPqcAccount(null);
            setKyberKey(null);
        }
    }, [authType]);

    // Internal helper to request password via Modal
    const requestPassword = (message = "Please enter your vault password to continue.") => {
        return new Promise((resolve, reject) => {
            setModalConfig({
                isOpen: true,
                message,
                resolve,
                reject
            });
        });
    };

    const handleModalSubmit = (password) => {
        if (modalConfig.resolve) {
            modalConfig.resolve(password);
        }
        setModalConfig({ ...modalConfig, isOpen: false, resolve: null, reject: null });
    };

    const handleModalCancel = () => {
        if (modalConfig.reject) {
            modalConfig.reject(new Error("User cancelled password prompt"));
        }
        setModalConfig({ ...modalConfig, isOpen: false, resolve: null, reject: null });
    };

    const performServerLogin = async (accountId, encryptionKey, signFn, username = null) => {
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
                encryption_public_key: encryptionKey,
                username: username // Send preferred username
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

        const connected = await window.trustkeys.connect();
        if (!connected) throw new Error("Connection request rejected.");

        if (window.trustkeys.handshake) {
            await window.trustkeys.handshake();
        }

        const tkAccount = await window.trustkeys.getAccount();
        const accountId = tkAccount.dilithiumPublicKey;
        const encryptionKey = tkAccount.kyberPublicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        return performServerLogin(accountId, encryptionKey, (msg) => window.trustkeys.sign(msg), tkAccount.name);
    };

    const loginLocalVault = async (password) => {
        const success = await vaultService.unlock(password);
        if (!success) throw new Error("Incorrect password");

        const account = vaultService.getActiveAccount();
        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        // Pass known password
        return performServerLogin(accountId, encryptionKey, (msg) => vaultService.sign(msg, password), account.name);
    };

    const createLocalVault = async (name, password) => {
        const account = await vaultService.setup(name, password);
        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        setHasLocalVault(true);

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        return performServerLogin(accountId, encryptionKey, (msg) => vaultService.sign(msg, password), name);
    };

    const encrypt = async (content, publicKey) => {
        if (isExtensionAvailable && window.trustkeys) {
            return await window.trustkeys.encrypt(content, publicKey || kyberKey);
        } else {
            // Fallback: Use internal library if we have a key
            // This allows MetaMask users to encrypt for PQC users without vault
            if (!publicKey && vaultService.isLocked) {
                // If no public key provided AND vault locked (no kyberKey), we can't encrypt
                throw new Error("PQC Provider not ready (Locked or Missing)");
            }

            const targetKey = publicKey || kyberKey;
            if (!targetKey) throw new Error("No encryption key available");

            const { encryptMessagePQC } = await import('../utils/crypto');
            return await encryptMessagePQC(content, targetKey);
        }
    };

    const sign = async (message) => {
        if (isExtensionAvailable && window.trustkeys) {
            return await window.trustkeys.sign(message);
        } else if (!vaultService.isLocked) {
            const password = await requestPassword("Enter password to sign document:");
            return await vaultService.sign(message, password);
        }
        throw new Error("PQC Provider not ready (Locked or Missing)");
    };

    const decrypt = async (encryptedObject) => {
        if (isExtensionAvailable && window.trustkeys) {
            return await window.trustkeys.decrypt(encryptedObject);
        } else if (!vaultService.isLocked) {
            const password = await requestPassword("Enter password to decrypt data:");
            return await vaultService.decrypt(encryptedObject, password);
        }
        throw new Error("PQC Provider not ready (Locked or Missing)");
    };

    const decryptMany = async (encryptedObjects) => {
        if (isExtensionAvailable && window.trustkeys) {
            // Extension sequential fallback (or assume potential future batch support)
            const results = [];
            for (const obj of encryptedObjects) {
                try {
                    results.push(await window.trustkeys.decrypt(obj));
                } catch (e) {
                    console.error("Decrypt Error", e);
                    results.push("Error: Decryption Failed");
                }
            }
            return results;
        } else if (!vaultService.isLocked) {
            const password = await requestPassword(`Enter password to decrypt ${encryptedObjects.length} messages:`);
            return await vaultService.decryptMany(encryptedObjects, password);
        }
        throw new Error("PQC Provider not ready (Locked or Missing)");
    };

    const getVaultAccounts = () => vaultService.getAccounts();

    const addVaultAccount = async (name) => {
        const password = await requestPassword("Enter password to create new account:");
        const acc = await vaultService.addAccount(name, password);
        return acc;
    };

    const switchVaultAccount = async (id) => {
        const password = await requestPassword("Enter password to switch account:");
        const account = await vaultService.switchAccount(id, password);

        const accountId = account.dilithium.publicKey;
        const encryptionKey = account.kyber.publicKey;

        setPqcAccount(accountId);
        setKyberKey(encryptionKey);

        authLogout();
        // explicit logout forces user to re-login with new identity attempt


        return account;
    };

    const deleteVaultAccount = async (id) => {
        const password = await requestPassword("Enter password to DELETE account:");
        await vaultService.deleteAccount(id, password);

        const current = vaultService.getActiveAccount();
        if (current) {
            setPqcAccount(current.dilithium.publicKey);
            setKyberKey(current.kyber.publicKey);
        }
    };

    const exportVault = async () => {
        const password = await requestPassword("Enter password to EXPORT vault:");
        return vaultService.exportVault(password);
    };

    const importVault = async (json) => {
        const password = await requestPassword("Enter password to IMPORT vault:");
        return vaultService.importVault(json, password);
    };

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
            decryptMany,
            sign,
            getVaultAccounts,
            addVaultAccount,
            switchVaultAccount,
            deleteVaultAccount,
            exportVault,
            importVault
        }}>
            {children}

            <PasswordModal
                isOpen={modalConfig.isOpen}
                message={modalConfig.message}
                onSubmit={handleModalSubmit}
                onCancel={handleModalCancel}
            />
        </PQCContext.Provider>
    );
};
