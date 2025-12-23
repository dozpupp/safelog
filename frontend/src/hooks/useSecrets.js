import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import API_ENDPOINTS from '../config';
import { encryptData, decryptData } from '../utils/crypto';

export function useSecrets(authType, encryptionPublicKey, pqcAccount, options = {}) {
    const { token, user } = useAuth();
    const { encrypt: encryptPQC, decrypt: decryptPQC, sign: signPQC } = usePQC();
    const { onProgress } = options;

    const [secrets, setSecrets] = useState([]);
    const [sharedSecrets, setSharedSecrets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [decryptedSecrets, setDecryptedSecrets] = useState({});

    useEffect(() => {
        if (token) {
            fetchSecrets();
            fetchSharedSecrets();
        }
    }, [token]);

    const reportProgress = (percent, msg) => {
        if (onProgress) onProgress(percent, msg);
    };

    const fetchSecrets = async () => {
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.LIST, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSecrets(data);
            }
        } catch (error) {
            console.error("Failed to fetch secrets", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSharedSecrets = async () => {
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.SHARED_WITH, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSharedSecrets(data);
            }
        } catch (error) {
            console.error("Failed to fetch shared secrets", error);
        }
    };

    const secureDecrypt = async (encryptedString) => {
        try {
            // Try parsing as JSON to detect PQC format
            const parsed = JSON.parse(encryptedString);

            // Check for TrustKeys (PQC) format: {kem, iv, content}
            if (parsed.kem && parsed.iv && parsed.content && authType === 'trustkeys') {
                return await decryptPQC(parsed);
            }

            // Fallback to MetaMask decryption
            return decryptData(encryptedString, user.address);
        } catch (e) {
            return decryptData(encryptedString, user.address);
        }
    };

    const secureEncrypt = async (content, pubKey) => {
        if (authType === 'trustkeys') {
            const res = await encryptPQC(content, pubKey);
            return JSON.stringify(res);
        } else {
            return encryptData(content, pubKey);
        }
    };

    const handleDecrypt = async (item, isShared = false) => {
        reportProgress(10, 'Decrypting...');
        try {
            const dataToDecrypt = isShared ? item.encrypted_key : item.encrypted_data;
            const decrypted = await secureDecrypt(dataToDecrypt);
            const key = isShared ? `shared_${item.id}` : item.id;
            setDecryptedSecrets(prev => ({ ...prev, [key]: decrypted }));
            reportProgress(100, 'Decrypted');
            setTimeout(() => reportProgress(0, ''), 500);
            return decrypted;
        } catch (e) {
            reportProgress(0, '');
            throw e;
        }
    };

    const createSecret = async (name, type, rawContent, isSigned = false) => {
        reportProgress(10, 'Preparing...');
        try {
            let payloadToEncrypt = rawContent;
            let secretType = type;

            if (isSigned) {
                reportProgress(30, 'Signing...');
                const signature = await signPQC(rawContent);
                const signedPayload = {
                    content: rawContent,
                    signature: signature,
                    signerPublicKey: pqcAccount
                };
                payloadToEncrypt = JSON.stringify(signedPayload);
                secretType = 'signed_document';
            }

            reportProgress(50, 'Encrypting...');
            const encrypted = await secureEncrypt(payloadToEncrypt, encryptionPublicKey);

            reportProgress(70, 'Saving...');
            const res = await fetch(API_ENDPOINTS.SECRETS.CREATE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    type: secretType,
                    encrypted_data: encrypted
                })
            });

            if (!res.ok) throw new Error(await res.text());
            await fetchSecrets();

            reportProgress(100, 'Saved');
            setTimeout(() => reportProgress(0, ''), 500);
            return true;
        } catch (e) {
            reportProgress(0, '');
            throw e;
        }
    };

    const updateSecret = async (id, name, content) => {
        reportProgress(30, 'Encrypting...');
        try {
            const encrypted = await secureEncrypt(content, encryptionPublicKey);
            reportProgress(60, 'Updating...');
            const res = await fetch(API_ENDPOINTS.SECRETS.UPDATE(id), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    encrypted_data: encrypted
                })
            });

            if (!res.ok) throw new Error("Update failed");

            setDecryptedSecrets(prev => ({ ...prev, [id]: content }));
            await fetchSecrets();
            reportProgress(100, 'Updated');
            setTimeout(() => reportProgress(0, ''), 500);
            return true;
        } catch (e) {
            reportProgress(0, '');
            throw e;
        }
    };

    const deleteSecret = async (id) => {
        const res = await fetch(API_ENDPOINTS.SECRETS.DELETE(id), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            setSecrets(prev => prev.filter(s => s.id !== id));
        }
        return res.ok;
    };

    const shareSecret = async (secretId, originalEncryptedData, recipientAddress, recipientPublicKey, expiry = 0) => {
        // 1. Decrypt Original
        // We assume caller might pass decrypted content OR we decrypt here.
        // Optimization: secureDecrypt reads from cache? No. 
        // We need to decrypt.
        const decrypted = await secureDecrypt(originalEncryptedData);

        // 2. Re-encrypt
        let reEncrypted;
        if (recipientPublicKey && recipientPublicKey.length > 60) {
            try {
                const res = await encryptPQC(decrypted, recipientPublicKey);
                reEncrypted = JSON.stringify(res);
            } catch (e) {
                throw new Error("TrustKeys required to share with this user.");
            }
        } else {
            reEncrypted = encryptData(decrypted, recipientPublicKey);
        }

        // 3. API Call
        const res = await fetch(API_ENDPOINTS.SECRETS.SHARE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                secret_id: secretId,
                grantee_address: recipientAddress,
                encrypted_key: reEncrypted,
                expires_in: expiry > 0 ? expiry : null
            })
        });

        return res.ok;
    };

    const revokeGrant = async (grantId, isSharedView = false) => {
        const res = await fetch(API_ENDPOINTS.SECRETS.REVOKE(grantId), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            if (isSharedView) {
                setSharedSecrets(prev => prev.filter(g => g.id !== grantId));
            }
            // If viewing access list, caller handles update
        }
        return res.ok;
    };

    return {
        secrets,
        sharedSecrets,
        loading,
        decryptedSecrets,
        secureDecrypt, // Exporting for manual usage if needed
        handleDecrypt,
        createSecret,
        updateSecret,
        deleteSecret,
        shareSecret,
        revokeGrant,
        fetchSecrets, // For manual refresh
        fetchSharedSecrets
    };
}
