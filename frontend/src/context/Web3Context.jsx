import React, { createContext, useState, useEffect, useContext } from 'react';
import API_ENDPOINTS from '../config';
import { connectWallet, getEncryptionPublicKey, signMessage } from '../utils/crypto';

const Web3Context = createContext();

export const useWeb3 = () => useContext(Web3Context);

export const Web3Provider = ({ children }) => {
    const [currentAccount, setCurrentAccount] = useState(null);
    const [encryptionPublicKey, setEncryptionPublicKey] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null); // Backend user object

    const checkWalletConnection = async () => {
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                setCurrentAccount(accounts[0]);
                // If we have an account, we might be "connected" but not "logged in" to our backend yet.
                // We'll handle login separately.
            }
        }
    };

    useEffect(() => {
        checkWalletConnection();

        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    setCurrentAccount(accounts[0]);
                    setIsAuthenticated(false); // Reset auth on account change
                    setUser(null);
                } else {
                    setCurrentAccount(null);
                    setIsAuthenticated(false);
                    setUser(null);
                }
            });
        }
    }, []);

    const login = async () => {
        // Ensure we have an account
        let account = currentAccount;
        if (!account) {
            account = await connectWallet();
            setCurrentAccount(account);
        }

        // 1. Get Nonce
        const nonceRes = await fetch(API_ENDPOINTS.AUTH.NONCE(account));
        const { nonce } = await nonceRes.json();

        // 2. Sign Nonce
        const message = `Sign in to Secure Log App with nonce: ${nonce}`;
        const signature = await signMessage(message, account);

        // 3. Get Encryption Public Key (if not already known, but good to ask now)
        // We need this to create the user properly on backend
        let pubKey = encryptionPublicKey;
        if (!pubKey) {
            try {
                pubKey = await getEncryptionPublicKey(account);
                setEncryptionPublicKey(pubKey);
            } catch (e) {
                console.warn("User rejected public key request, proceeding without it (some features may fail)", e);
            }
        }

        // 4. Verify on Backend
        const loginRes = await fetch(API_ENDPOINTS.AUTH.LOGIN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: account,
                signature,
                nonce,
                encryption_public_key: pubKey
            })
        });

        if (loginRes.ok) {
            const userData = await loginRes.json();
            setUser(userData);
            setIsAuthenticated(true);
            return userData;
        } else {
            throw new Error("Login failed");
        }
    };

    return (
        <Web3Context.Provider value={{
            currentAccount,
            encryptionPublicKey,
            isAuthenticated,
            user,
            connect: connectWallet,
            login,
            setUser
        }}>
            {children}
        </Web3Context.Provider>
    );
};
