import { generateAccount, signMessage, verifySignature, encryptMessage, decryptMessage, encryptVault, decryptVault } from '../utils/crypto';

// Types
// Account: { id, name, kyber: {publicKey, privateKey}, dilithium: {publicKey, privateKey}, createdAt }
// Vault: { accounts: [], activeAccountId: null, permissions: {} }

// State (In-Memory Only)
let state = {
    isLocked: true,
    hasPassword: false,
    vault: null
};

let sessionPassword = null;
const pendingRequests = new Map(); // ID -> { resolve, reject, type, data }

const initializeStorage = async () => {
    const { vaultData } = await chrome.storage.local.get('vaultData');
    state.hasPassword = !!vaultData;

};
initializeStorage();

const saveVault = async (password) => {
    if (!state.vault) return;
    const encryptionResult = await encryptVault(state.vault, password);
    await chrome.storage.local.set({ vaultData: encryptionResult });
    state.hasPassword = true;
};

// --- Helpers ---

const launchPopup = async (route, params = {}) => {
    const queryString = new URLSearchParams({ route, ...params }).toString();

    // Check if popup already exists? For now, just create new.
    // Calculate center of screen
    const width = 360;
    const height = 600;

    // Get current window to center against? 
    // Just default position or let browser decide.

    await chrome.windows.create({
        url: `index.html?${queryString}`,
        type: 'popup',
        width,
        height,
        focused: true
    });
};

// --- Actions ---

const setupPassword = async (password) => {
    if (state.hasPassword) throw new Error("Password already set");

    state.vault = { accounts: [], activeAccountId: null, permissions: {} };
    await saveVault(password);
    state.isLocked = false;
    return true;
};

const unlock = async (password) => {
    const { vaultData } = await chrome.storage.local.get('vaultData');
    if (!vaultData) throw new Error("No vault found");

    try {
        state.vault = await decryptVault(vaultData, password);
        // Migration: Ensure permissions object exists
        if (!state.vault.permissions) state.vault.permissions = {};

        state.isLocked = false;
        return true;
    } catch (e) {
        console.error("Unlock failed", e);
        return false;
    }
};

const lock = () => {
    state.vault = null;
    state.isLocked = true;
};

const unlockWithSession = async (password) => {
    const success = await unlock(password);
    if (success) {
        sessionPassword = password;
    }
    return success;
};

const lockWithSession = () => {
    lock();
    sessionPassword = null;
};

// Message Handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.type) {
                // --- Security ---
                case 'GET_STATUS': {
                    sendResponse({
                        success: true,
                        isLocked: state.isLocked,
                        hasPassword: state.hasPassword
                    });
                    break;
                }
                case 'SETUP_PASSWORD': {
                    await setupPassword(request.password);
                    sessionPassword = request.password;
                    sendResponse({ success: true });
                    break;
                }
                case 'UNLOCK': {
                    const success = await unlockWithSession(request.password);
                    sendResponse({ success });
                    break;
                }
                case 'LOCK': {
                    lockWithSession();
                    sendResponse({ success: true });
                    break;
                }

                // --- Connection & Permissions ---
                case 'CHECK_CONNECTION': {
                    // Origin from sender
                    if (state.isLocked) {
                        sendResponse({ success: true, connected: false, error: "Locked" });
                        break;
                    }
                    const origin = request.origin; // passed from content script or sender.origin?
                    // sender.origin is reliable for extension pages, but for content scripts it's the page url.
                    // request.origin is explicit.
                    const isConnected = !!state.vault.permissions[origin];
                    sendResponse({ success: true, connected: isConnected });
                    break;
                }
                case 'CONNECT': {
                    if (state.isLocked) {
                        // Launch popup to prompt login (no specific route, just open)
                        await launchPopup();
                        sendResponse({ success: false, error: "Locked - Please unlock extension" });
                        break;
                    }

                    const origin = request.origin;
                    if (state.vault.permissions[origin]) {
                        sendResponse({ success: true });
                        break;
                    }

                    // Request Approval
                    const reqId = Math.random().toString(36).substr(2, 9);

                    pendingRequests.set(reqId, {
                        resolve: () => {
                            // On approve
                            state.vault.permissions[origin] = true;
                            saveVault(sessionPassword);
                            sendResponse({ success: true });
                        },
                        reject: (err) => {
                            sendResponse({ success: false, error: err || "Rejected" });
                        },
                        type: 'CONNECT',
                        data: { origin }
                    });

                    // Launch Popup
                    await launchPopup('connect', { requestId: reqId, origin });
                    return true; // Keep channel open
                }

                // --- Approval Handling (from Popup) ---
                case 'GET_PENDING_REQUEST': {
                    const req = pendingRequests.get(request.requestId);
                    if (!req) {
                        sendResponse({ success: false, error: "Request not found" });
                    } else {
                        sendResponse({ success: true, request: { type: req.type, data: req.data } });
                    }
                    break;
                }
                case 'RESOLVE_REQUEST': {
                    const req = pendingRequests.get(request.requestId);
                    if (!req) return sendResponse({ success: false });

                    if (request.approved) {
                        req.resolve();
                    } else {
                        req.reject();
                    }
                    pendingRequests.delete(request.requestId);
                    // Close popup? handled by popup itself usually.
                    sendResponse({ success: true });
                    break;
                }

                // --- Accounts ---
                case 'CREATE_ACCOUNT': {
                    if (state.isLocked) throw new Error("Locked");
                    // Only allow internal creation
                    if (!sender.url || !sender.url.includes('index.html')) {
                        throw new Error("Unauthorized: Internal use only");
                    }

                    const account = await generateAccount(request.name);
                    state.vault.accounts.push(account);
                    if (!state.vault.activeAccountId) state.vault.activeAccountId = account.id;

                    await saveVault(sessionPassword);
                    sendResponse({ success: true, account: { id: account.id, name: account.name } });
                    break;
                }
                case 'GET_ACCOUNTS': {
                    if (state.isLocked) throw new Error("Locked");
                    // Only allow internal
                    if (!sender.url || !sender.url.includes('index.html')) {
                        throw new Error("Unauthorized: Internal use only");
                    }

                    sendResponse({
                        success: true,
                        accounts: state.vault.accounts.map(a => ({
                            id: a.id,
                            name: a.name,
                            active: a.id === state.vault.activeAccountId
                        }))
                    });
                    break;
                }
                case 'SET_ACTIVE_ACCOUNT': {
                    if (state.isLocked) throw new Error("Locked");
                    if (!sender.url || !sender.url.includes('index.html')) {
                        throw new Error("Unauthorized: Internal use only");
                    }
                    state.vault.activeAccountId = request.id;
                    await saveVault(sessionPassword);
                    sendResponse({ success: true });
                    break;
                }
                case 'GET_ACTIVE_ACCOUNT': {
                    if (state.isLocked) throw new Error("Locked");

                    const isInternal = sender.url && sender.url.includes('index.html') && sender.id === chrome.runtime.id;
                    if (!isInternal) {
                        // External: Check Permissions
                        const checkOrigin = sender.origin || request.origin; // From content script
                        // If call comes from content script, sender.origin is valid.
                        if (!state.vault.permissions[checkOrigin]) {
                            // Instead of failing silently or throwing, return error so they know to Connect.
                            sendResponse({ success: false, error: "Not Connected" });
                            break;
                        }
                    }

                    const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
                    if (!account) {
                        sendResponse({ success: false, error: "No active account" });
                    } else {
                        sendResponse({
                            success: true,
                            account: {
                                name: account.name,
                                kyberPublicKey: account.kyber.publicKey,
                                dilithiumPublicKey: account.dilithium.publicKey
                            }
                        });
                    }
                    break;
                }

                case 'EXPORT_KEYS': {
                    if (state.isLocked) throw new Error("Locked");
                    if (!sender.url || !sender.url.includes('index.html')) {
                        throw new Error("Unauthorized: Internal use only");
                    }

                    // 1. Verify Password by attempting to decrypt stored vault
                    const { vaultData } = await chrome.storage.local.get('vaultData');
                    try {
                        const verifiedVault = await decryptVault(vaultData, request.password);
                        // Password correct.
                        // 2. Return accounts with private keys
                        sendResponse({ success: true, accounts: verifiedVault.accounts });
                    } catch (e) {
                        console.error("Export failed: Invalid password", e);
                        // Intentionally generic error
                        sendResponse({ success: false, error: "Invalid Password" });
                    }
                    break;
                }

                case 'IMPORT_KEYS': {
                    if (state.isLocked) throw new Error("Locked");
                    if (!sender.url || !sender.url.includes('index.html')) {
                        throw new Error("Unauthorized: Internal use only");
                    }

                    try {
                        const newAccounts = request.accounts;
                        if (!Array.isArray(newAccounts)) throw new Error("Invalid format");

                        // Merge logic
                        let addedCount = 0;
                        for (const acc of newAccounts) {
                            if (!acc.id || !acc.kyber || !acc.dilithium) continue; // Basic validation

                            // Check for duplicates by ID
                            if (!state.vault.accounts.find(a => a.id === acc.id)) {
                                state.vault.accounts.push(acc);
                                addedCount++;
                            }
                        }

                        if (addedCount > 0) {
                            await saveVault(sessionPassword);
                        }

                        sendResponse({ success: true, count: addedCount });
                    } catch (e) {
                        sendResponse({ success: false, error: e.message });
                    }
                    break;
                }

                // --- Crypto Operations ---
                case 'SIGN': {
                    if (state.isLocked) throw new Error("Locked");
                    const origin = request.origin; // We need sender origin!
                    // In background script, sender.url is available if from extension or content script (usually url)
                    const caller = sender.url ? new URL(sender.url).origin : request.origin; // Trust sender.url over request.origin
                    // Actually, for content script, sender.origin might be the extension ID or page?
                    // sender.origin in MV3 content script message:
                    // If sent from content script, sender.origin is the page origin.
                    // If sent from extension page (popup), sender.origin is chrome-extension://...

                    // We need to allow popup/dashboard to sign without double approval? probably yes.
                    // If sender.id === chrome.runtime.id, it's internal.
                    if (sender.id === chrome.runtime.id && sender.url && sender.url.includes('index.html')) {
                        // Internal request (e.g. from test page inside extension? wait, test page is external)
                        // Internal dashboard usually doesn't sign messages via message bus, but if it did, we'd allow it.
                        // Direct execution (Internal)
                        const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
                        if (!account) throw new Error("No active account");

                        const signature = await signMessage(request.message, account.dilithium.privateKey);
                        sendResponse({ success: true, signature });
                        break;
                    } else {
                        // External request
                        // Fallback to request.origin if sender origin is ambiguous or testing. 
                        // But security-wise, we must trust the channel.
                        // sender.origin is the Origin of the frame that opened the connection.
                        // For now, let's use sender.origin || request.origin as the check.
                        const checkOrigin = sender.origin || request.origin;
                        if (!state.vault.permissions[checkOrigin]) {
                            throw new Error("Site not connected");
                        }

                        // Request Approval
                        const reqId = Math.random().toString(36).substr(2, 9);
                        pendingRequests.set(reqId, {
                            resolve: async () => {
                                // On approve -> Execute logic
                                const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
                                if (!account) return sendResponse({ success: false, error: "No active account" });
                                const signature = await signMessage(request.message, account.dilithium.privateKey);
                                sendResponse({ success: true, signature });
                            },
                            reject: (err) => sendResponse({ success: false, error: err || "Rejected" }),
                            type: 'SIGN',
                            data: { origin: checkOrigin, message: request.message }
                        });

                        await launchPopup('sign', { requestId: reqId });
                        return true; // Keep channel open
                    }
                }
                case 'VERIFY': {
                    const isValid = await verifySignature(request.message, request.signature, request.publicKey);
                    sendResponse({ success: true, isValid });
                    break;
                }
                case 'ENCRYPT': {
                    // Logic similar to previous, but needs permissions?
                    // Typically encryption with public key is safe to allow without prompt.
                    // But requirement says "When interaction with private keys, user must accept". Encryption uses Public Key.
                    // Decryption uses Private Key.
                    let pubKey = request.publicKey;
                    if (!pubKey) {
                        if (state.isLocked) throw new Error("Locked");
                        const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
                        if (!account) throw new Error("No active account");
                        pubKey = account.kyber.publicKey;
                    }

                    const result = await encryptMessage(request.message, pubKey);
                    sendResponse({ success: true, result });
                    break;
                }
                case 'DECRYPT': {
                    if (state.isLocked) throw new Error("Locked");

                    const checkOrigin = sender.origin || request.origin;
                    if (!state.vault.permissions[checkOrigin]) throw new Error("Site not connected");

                    const reqId = Math.random().toString(36).substr(2, 9);
                    pendingRequests.set(reqId, {
                        resolve: async () => {
                            const account = state.vault.accounts.find(a => a.id === state.vault.activeAccountId);
                            if (!account) return sendResponse({ success: false, error: "No active account" });
                            const decrypted = await decryptMessage(request.data, account.kyber.privateKey);
                            sendResponse({ success: true, decrypted });
                        },
                        reject: (err) => sendResponse({ success: false, error: err || "Rejected" }),
                        type: 'DECRYPT',
                        data: { origin: checkOrigin } // Don't show data? or show hash?
                    });

                    await launchPopup('decrypt', { requestId: reqId });
                    return true; // Keep channel open
                }

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Background error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true; // Keep channel open
});
