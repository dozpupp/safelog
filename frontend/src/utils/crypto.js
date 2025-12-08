import { encrypt } from '@metamask/eth-sig-util';


export const connectWallet = async () => {
    if (!window.ethereum) {
        throw new Error("Unable to access key management - verify your key is unlocked");
    }
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    return accounts[0];
};

export const getEncryptionPublicKey = async (address) => {
    if (!window.ethereum) {
        throw new Error("Unable to access key management - verify your key is unlocked");
    }
    try {
        const key = await window.ethereum.request({
            method: 'eth_getEncryptionPublicKey',
            params: [address],
        });
        return key;
    } catch (error) {
        if (error.code === 4001) {
            // EIP-1193 userRejectedRequest error
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

    // Convert to hex string or JSON string that backend expects
    // The backend expects a JSON blob string
    return JSON.stringify(encrypted);
};

export const decryptData = async (encryptedDataStr, address) => {
    if (!window.ethereum) {
        throw new Error("Unable to access key management - verify your key is unlocked");
    }

    try {
        // eth_decrypt expects a hex-encoded string of the encrypted message
        // We stored the encrypted object as JSON string, need to convert to hex
        // The format should be 0x + hex(JSON.stringify(encryptedObject))

        // Convert the JSON string to hex
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

export const signMessage = async (message, address) => {
    // For auth, we sign a simple string
    // We use personal_sign usually for simple text
    const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, address],
    });
    return signature;
}
