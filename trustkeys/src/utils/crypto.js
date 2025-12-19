import KyberPkg from 'crystals-kyber';
import { createDilithium } from 'dilithium-crystals-js';
import { Buffer } from 'buffer';

const { KeyGen768, Encrypt768, Decrypt768 } = KyberPkg;

// Ensure initialization
let dilithium = null;
const initDilithium = async () => {
    if (!dilithium) {
        dilithium = await createDilithium();
    }
    return dilithium;
};

// Helper: Uint8Array/Array <-> Hex
const toHex = (arr) => Buffer.from(arr).toString('hex');
const fromHex = (hex) => new Uint8Array(Buffer.from(hex, 'hex'));

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

export const signMessage = async (message, privateKeyHex) => {
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

export const verifySignature = async (message, signatureHex, publicKeyHex) => {
    const mod = await initDilithium();
    const signature = fromHex(signatureHex);
    const publicKey = fromHex(publicKeyHex);
    const msgBytes = new TextEncoder().encode(message);

    // Correct signature: verify(signature, message, publicKey, kind)
    // Returns object { result, ... } where result 0 is success
    const resultObj = mod.verify(signature, msgBytes, publicKey, 2);

    return resultObj && resultObj.result === 0;
};

export const encryptMessage = async (message, publicKeyHex) => {
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

export const decryptMessage = async (encryptedData, privateKeyHex) => {
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
            iterations: 600000,
            hash: "SHA-512"
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
