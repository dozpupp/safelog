import KyberPkg from 'crystals-kyber';
import { createDilithium } from 'dilithium-crystals-js';
import { Buffer } from 'buffer';
import { encrypt } from '@metamask/eth-sig-util';

const { KeyGen768, Encrypt768, Decrypt768 } = KyberPkg;

// Polyfill for dilithium-crystals-js WASM loading
if (!window.chrome) window.chrome = {};
if (!window.chrome.runtime) window.chrome.runtime = {};
if (!window.chrome.runtime.getURL) {
    window.chrome.runtime.getURL = (path) => {
        // Remove leading ./ and return path relative to root
        return '/' + path.replace(/^\.\//, '');
    };
}

// Ensure initialization
let dilithium = null;
const initDilithium = async () => {
    if (!dilithium) {
        dilithium = await createDilithium();
    }
    return dilithium;
};

// Helper: Uint8Array/Array <-> Hex
export const toHex = (arr) => Buffer.from(arr).toString('hex');
export const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

// --- Web3 / MetaMask Helpers (Restored) ---

export const connectWallet = async () => {
    if (!window.ethereum) {
        throw new Error("MetaMask not found. Please install it.");
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts[0];
};

export const getEncryptionPublicKey = async (address) => {
    if (!window.ethereum) {
        throw new Error("MetaMask not found.");
    }
    try {
        const key = await window.ethereum.request({
            method: 'eth_getEncryptionPublicKey',
            params: [address],
        });
        return key;
    } catch (error) {
        if (error.code === 4001) {
            throw new Error("User rejected public key request");
        }
        throw error;
    }
};

export const encryptData = (data, publicKey) => {
    const encrypted = encrypt({
        publicKey: publicKey,
        data: data,
        version: 'x25519-xsalsa20-poly1305',
    });
    return JSON.stringify(encrypted);
};

export const decryptData = async (encryptedDataStr, address) => {
    if (!window.ethereum) {
        throw new Error("MetaMask not found.");
    }
    try {
        const hexEncoded = '0x' + Array.from(encryptedDataStr)
            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('');

        const decrypted = await window.ethereum.request({
            method: 'eth_decrypt',
            params: [hexEncoded, address],
        });
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        throw error;
    }
};

// Renamed to avoid collision or checks? 
// Web3Context uses `signMessage`.
// Our PQC `signMessage` uses different params (message, privateKey).
// Web3 `signMessage` uses (message, address) -> calls MetaMask.
// PROBLEM: Collision.
// PQC: export const signMessage = async (message, privateKeyHex)
// Web3: export const signMessage = async (message, address)
// 
// I must rename one or handle generic.
// PQC uses `export const signMessage` in Step 53.
// Web3Context imports `signMessage` from `crypto`.
//
// Solution: Rename PQC implementation to `signMessagePQC` or similar? 
// But PQCContext probably imports it or VaultService.
// VaultService imports `signMessage`. 
// I will rename the PQC one to `signMessagePQC` and the Web3 one to `signMessageMetaMask` and `signMessage` can be a router? Or better, separate them.
// But `crypto.js` was originally just for Web3.
// 
// Let's check usages.
// VaultService: `import { signMessage ... } from '../utils/crypto';` -> calls `signMessage(message, privKey)`
// Web3Context: `import { ... signMessage } from '../utils/crypto';` -> calls `signMessage(message, accountAddress)`
//
// They are incompatible in signature. One takes a Private Key, the other an Address (and uses window.ethereum).
//
// I will export:
// `signMessage` (as the PQC one, matching VaultService)
// `signMessageWeb3` (for Web3Context) -> I need to update Web3Context too.
// OR
// keep `signMessage` for Web3 (legacy support) and rename PQC one.
// VaultService I just created, checking usages...
// VaultService calls `signMessage(message, account.dilithium.privateKey)`.
// Web3Context calls `signMessage(message, account)`.
//
// I will keep `signMessage` as the original Web3 one to minimize breakage in existing code (Dashboard etc might use it?).
// And rename PQC one to `signMessagePQC`.
// Then I update `VaultService` and `PQCContext` (if it uses it directly).
// `PQCContext` uses `window.trustkeys.sign` or `vaultService.sign`.
// `VaultService` imports `signMessage`.

// Revised Plan:
// 1. Rename PQC `signMessage` -> `signMessagePQC`.
// 2. Add `signMessage` (Web3 version).
// 3. Update `VaultService` to import/use `signMessagePQC`.

// --- PQC Implementations ---

export const generateKyberKeyPair = async () => {
    try {
        const [pk, sk] = KeyGen768();
        return {
            publicKey: toHex(pk), // Array of numbers
            privateKey: toHex(sk), // Array of numbers
        };
    } catch (e) {
        console.error("Kyber keygen failed", e);
        throw e;
    }
};

export const generateDilithiumKeyPair = async () => {
    try {
        const mod = await initDilithium();
        // Use level 2 (matches standard expectation in library apparently)
        const { publicKey, privateKey } = mod.generateKeys(2);
        return {
            publicKey: toHex(publicKey),
            privateKey: toHex(privateKey),
        };
    } catch (e) {
        console.error("Dilithium keygen failed", e);
        throw e;
    }
};

export const generateAccount = async (name) => {
    const kyber = await generateKyberKeyPair();
    const dilithium = await generateDilithiumKeyPair();

    return {
        id: crypto.randomUUID(),
        name,
        kyber,
        dilithium,
        createdAt: Date.now(),
    };
};

export const signMessagePQC = async (message, privateKeyHex) => {
    const mod = await initDilithium();
    const privateKey = fromHex(privateKeyHex);
    const msgBytes = new TextEncoder().encode(message);

    // Correct signature: sign(message, privateKey, kind)
    // Returns object { result, signature, ... }
    const sigResult = mod.sign(msgBytes, privateKey, 2);

    if (!sigResult || !sigResult.signature) {
        throw new Error("Signing failed: invalid response from library");
    }

    return toHex(sigResult.signature);
};

export const verifySignaturePQC = async (message, signatureHex, publicKeyHex) => {
    const mod = await initDilithium();
    const signature = fromHex(signatureHex);
    const publicKey = fromHex(publicKeyHex);
    const msgBytes = new TextEncoder().encode(message);

    // Correct signature: verify(signature, message, publicKey, kind)
    // Returns object { result, ... } where result 0 is success
    const resultObj = mod.verify(signature, msgBytes, publicKey, 2);

    return resultObj && resultObj.result === 0;
};

export const encryptMessagePQC = async (message, publicKeyHex) => {
    // Hybrid Encryption (KEM + AES-GCM):
    // 1. Kyber KEM Encapsulate -> Shared Secret (ss) + Ciphertext (ct)
    // 2. Use ss as AES key
    // 3. Encrypt message with ss (AES-GCM) -> content, iv

    const publicKey = fromHex(publicKeyHex);

    // Encrypt768(pk) returns [ct, ss]
    // ct: Ciphertext (1088 bytes)
    // ss: Shared Secret (32 bytes)
    const kemResult = Encrypt768(publicKey);
    const ct = kemResult[0];
    const ss = kemResult[1];

    // Use ss as AES key
    const seed = new Uint8Array(ss); // Shared secret is 32 bytes

    // AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
        "raw",
        seed,
        "AES-GCM",
        false,
        ["encrypt"]
    );

    const enc = new TextEncoder();
    const encodedMsg = enc.encode(message);

    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedMsg
    );

    return {
        kem: toHex(ct), // Just send the KEM ciphertext (hex)
        iv: toHex(iv),
        content: toHex(new Uint8Array(encryptedContent))
    };
};

export const decryptMessagePQC = async (encryptedData, privateKeyHex) => {
    // encryptedData: { kem: hexString, iv, content }
    const privateKey = fromHex(privateKeyHex);

    // Parse KEM ciphertext
    const ct = fromHex(encryptedData.kem);

    // Decrypt768(ct, sk) -> returns shared secret (ss)
    const ss = Decrypt768(ct, privateKey);
    const seed = new Uint8Array(ss);

    const iv = fromHex(encryptedData.iv);
    const content = fromHex(encryptedData.content);

    const key = await crypto.subtle.importKey(
        "raw",
        seed,
        "AES-GCM",
        false,
        ["decrypt"]
    );

    const decryptedContent = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        content
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedContent);
};


// --- Vault Security ---

// Helper to derive key
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypts a data object (vault) with a password.
 */
export const encryptVault = async (data, password) => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const enc = new TextEncoder();
    const encodedData = enc.encode(JSON.stringify(data));

    const encryptedContent = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
    );

    return {
        salt: toHex(salt),
        iv: toHex(iv),
        data: toHex(new Uint8Array(encryptedContent))
    };
};

/**
 * Decrypts a vault using a password.
 */
export const decryptVault = async (encryptedVault, password) => {
    const salt = fromHex(encryptedVault.salt);
    const iv = fromHex(encryptedVault.iv);
    const data = fromHex(encryptedVault.data);

    const key = await deriveKey(password, salt);

    try {
        const decryptedContent = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            data
        );

        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decryptedContent));
    } catch (e) {
        throw new Error("Incorrect password or corrupted data");
    }
};

// --- Web3 Signature (Legacy Name) ---
export const signMessage = async (message, address) => {
    const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
    });
    return signature;
}
