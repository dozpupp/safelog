

const callBackground = (type, payload) => {
    return new Promise((resolve, reject) => {
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            console.error("TrustKeys Content Script: chrome.runtime is invalid", typeof chrome);
            reject(new Error("Extension context invalid (reload page?)"));
            return;
        }
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else if (response && response.success) {
                resolve(response);
            } else {
                reject(new Error(response?.error || "Unknown error"));
            }
        });
    });
};



// No script injection needed anymore, managed by Manifest V3 "world" property.

// Listen for messages from the page
window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data.source !== 'TRUSTKEYS_PAGE') return;

    const { type, id, ...payload } = event.data;

    try {
        let result;
        switch (type) {
            case 'TRUSTKEYS_GET_ACCOUNT':
                const accRes = await callBackground('GET_ACTIVE_ACCOUNT');
                result = accRes.account;
                break;
            case 'TRUSTKEYS_SIGN':
                const signRes = await callBackground('SIGN', { message: payload.message });
                result = signRes.signature;
                break;
            case 'TRUSTKEYS_VERIFY':
                const verifyRes = await callBackground('VERIFY', {
                    message: payload.message,
                    signature: payload.signature,
                    publicKey: payload.publicKey
                });
                result = verifyRes.isValid;
                break;
            case 'TRUSTKEYS_ENCRYPT':
                const encRes = await callBackground('ENCRYPT', { message: payload.message, publicKey: payload.publicKey });
                result = encRes.result;
                break;
            case 'TRUSTKEYS_DECRYPT':
                // Payload from API is { data }
                const decRes = await callBackground('DECRYPT', { data: payload.data });
                result = decRes.decrypted;
                break;
            case 'TRUSTKEYS_CONNECT':
                const connRes = await callBackground('CONNECT', { origin: window.location.origin });
                result = connRes.success;
                break;
            case 'TRUSTKEYS_CHECK_CONNECTION':
                const checkRes = await callBackground('CHECK_CONNECTION', { origin: window.location.origin });
                result = checkRes.connected;
                break;
            default:
                return; // Ignore unknown types
        }
        window.postMessage({ id, source: 'TRUSTKEYS_CONTENT', success: true, result }, '*');
    } catch (error) {
        window.postMessage({ id, source: 'TRUSTKEYS_CONTENT', success: false, error: error.message }, '*');
    }
});
