import { generateAccount } from '../../utils/crypto.js';
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
