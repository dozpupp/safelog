import { state, getSessionPassword } from '../state.js';
import { saveVault, launchPopup } from '../utils.js';

export const handleCheckConnection = (origin) => {
    if (state.isLocked) {
        return { success: true, connected: false, error: "Locked" };
    }
    const isConnected = !!state.vault.permissions[origin];
    return { success: true, connected: isConnected };
};

export const handleConnect = async (origin) => {
    if (state.isLocked) {
        await launchPopup();
        return { success: false, error: "Locked - Please unlock extension" };
    }

    if (state.vault.permissions[origin]) {
        return { success: true };
    }

    // Request Approval
    const reqId = Math.random().toString(36).substr(2, 9);

    const promise = new Promise((resolve) => {
        state.pendingRequests.set(reqId, {
            resolve: () => {
                // On approve
                state.vault.permissions[origin] = true;
                saveVault(getSessionPassword());
                resolve({ success: true });
            },
            reject: (err) => {
                resolve({ success: false, error: err || "Rejected" });
            },
            type: 'CONNECT',
            data: { origin }
        });
    });

    // Launch Popup
    await launchPopup('connect', { requestId: reqId, origin });
    return promise; // Wait for resolving in Popup
    // NOTE: The architecture in index.js returned `true` (keep channel open).
    // Here we return a Promise that resolves when the user interacts? 
    // Wait, the sendResponse callback in index.js needs to be called later.
    // If we return a Promise here, the caller (index.js) should await it?
    // BUT the pendingRequest maps resolve function to the sendResponse?
    // Original code: pendingRequests.set(..., { resolve: () => { ... sendResponse(...) } })
    // We need to pass sendResponse to this handler OR return a special object indicating "async wait".
    // Let's refactor: This function will return nothing, but set up the pendingRequest state.
    // The caller (index.js) should NOT awaiting a result to send immediately if it's async.
    // Actually, passing `sendResponse` to these handlers is easiest.
};

// Refined handleConnect accepting sendResponse
export const handleConnectAsync = async (origin, sendResponse) => {
    if (state.isLocked) {
        await launchPopup();
        sendResponse({ success: false, error: "Locked - Please unlock extension" });
        return;
    }

    if (state.vault.permissions[origin]) {
        sendResponse({ success: true });
        return;
    }

    const reqId = Math.random().toString(36).substr(2, 9);
    state.pendingRequests.set(reqId, {
        resolve: () => {
            state.vault.permissions[origin] = true;
            saveVault(getSessionPassword());
            sendResponse({ success: true });
        },
        reject: (err) => {
            sendResponse({ success: false, error: err || "Rejected" });
        },
        type: 'CONNECT',
        data: { origin }
    });

    await launchPopup('connect', { requestId: reqId, origin });
};
