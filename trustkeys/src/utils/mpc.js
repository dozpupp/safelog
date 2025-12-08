
// MPC Utilities for 2-of-2 XOR Split

// 1. Derive Share A from Password
// uses PBKDF2 to deterministically generate a key-length buffer from the password
export const deriveShareA = async (password, salt, lengthBytes) => {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: enc.encode(salt),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        lengthBytes * 8
    );

    return new Uint8Array(bits);
};

// 2. XOR Split (Create Share B)
// Share B = Secret ^ Share A
export const createShareB = (secretBytes, shareA) => {
    if (secretBytes.length !== shareA.length) {
        throw new Error("Length mismatch during MPC Split");
    }
    const shareB = new Uint8Array(secretBytes.length);
    for (let i = 0; i < secretBytes.length; i++) {
        shareB[i] = secretBytes[i] ^ shareA[i];
    }
    return shareB;
};

// 3. XOR Combine (Recover Secret)
// Secret = Share A ^ Share B
export const recoverSecret = (shareA, shareB) => {
    if (shareA.length !== shareB.length) {
        throw new Error("Length mismatch during MPC Recover");
    }
    const secret = new Uint8Array(shareA.length);
    for (let i = 0; i < shareA.length; i++) {
        secret[i] = shareA[i] ^ shareB[i];
    }
    return secret;
};

// Helper: Hex/Bytes conversion
export const toHex = (bytes) => {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const fromHex = (hexString) => {
    return new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
};
