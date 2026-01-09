import { generateAccount, decryptVault, encryptVault } from '../../utils/crypto.js';
import { state, getSessionPassword } from '../state.js';
import { saveVault } from '../utils.js';

export const createAccount = async (name) => {
    if (state.isLocked) throw new Error("Locked");

    const account = await generateAccount(name);
    state.vault.accounts.push(account);
    if (!state.vault.activeAccountId) state.vault.activeAccountId = account.id;

    await saveVault(getSessionPassword());
    return { id: account.id, name: account.name };
};

export const getAccounts = () => {
    if (state.isLocked) throw new Error("Locked");

    return state.vault.accounts.map(a => ({
        id: a.id,
        name: a.name,
        active: a.id === state.vault.activeAccountId
    }));
};

export const setActiveAccount = async (id) => {
    if (state.isLocked) throw new Error("Locked");
    state.vault.activeAccountId = id;
    await saveVault(getSessionPassword());
};

export const getActiveAccount = (checkOrigin) => {
    if (state.isLocked) throw new Error("Locked");

    if (checkOrigin) {
        if (!state.vault.permissions[checkOrigin]) {
            return { success: false, error: "Not Connected" }; // Special case handling?
            // Or throw?
            throw new Error("Not Connected");
        }
    }

    const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
    if (!account) throw new Error("No active account");

    return {
        name: account.name,
        kyberPublicKey: account.kyber.publicKey,
        dilithiumPublicKey: account.dilithium.publicKey
    };
};

export const exportVault = async (password) => {
    const { vaultData } = await chrome.storage.local.get('vaultData');
    if (!vaultData) throw new Error("No vault found");

    // Verify password by attempting to decrypt
    // This throws if password is wrong
    await decryptVault(vaultData, password);

    // Return the raw encrypted vault data
    return vaultData;
};

export const importVault = async (vaultObj, password) => {
    // Determine format: is vaultObj a string (serialized) or object?
    // Storage returns object { salt, iv, data }
    let vault = vaultObj;
    if (typeof vault === 'string') {
        try {
            vault = JSON.parse(vault);
        } catch (e) {
            throw new Error("Invalid import format (not JSON)");
        }
    }

    // Check if it's already encrypted (has salt) or plaintext (has accounts)
    let decrypted;
    if (vault && !vault.salt && Array.isArray(vault.accounts)) {
        // Plaintext import (Migration or Manual JSON)
        decrypted = vault;

        // Ensure migration logic: add empty permissions if missing
        if (!decrypted.permissions) decrypted.permissions = {};

        // We will encrypt it below when saving
    } else {
        // Assume encrypted
        decrypted = await decryptVault(vault, password);
    }

    // If successful, replace state
    state.vault = decrypted;
    if (!state.vault.permissions) state.vault.permissions = {};

    state.hasPassword = true;
    state.isLocked = false;

    // Save cleanly (re-encrypts with same password to ensure consistency)
    await saveVault(password);

    return true;
};
