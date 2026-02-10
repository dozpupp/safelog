import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import API_ENDPOINTS from '../config';
import { encryptData, decryptData, generateSymmetricKey, encryptSymmetric, decryptSymmetric } from '../utils/crypto';
import { uploadChunkedFile, downloadChunkedFile, CHUNK_SIZE } from '../utils/fileChunks';

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
        reportProgress(10, 'Decrypting Key...');
        try {
            // Envelope Encryption Flow
            const encKeyBlob = isShared ? item.encrypted_key : item.encrypted_key;
            // Note: For 'secrets' list (owned), item.encrypted_key comes from the join in get_secrets.
            // For 'shared' list, item is AccessGrant, so item.encrypted_key is direct.

            if (!encKeyBlob) {
                throw new Error("Missing encryption key. Legacy secrets are not supported.");
            }

            // 1. Decrypt AES Key
            const fileKey = await secureDecrypt(encKeyBlob);

            // 2. Decrypt Content
            reportProgress(50, 'Decrypting Content...');
            // encrypted_data is now a JSON string: {iv, ciphertext}
            const encDataObj = JSON.parse(isShared ? item.secret.encrypted_data : item.encrypted_data);

            const decrypted = await decryptSymmetric(encDataObj, fileKey);

            // Check if this is a chunked file (metadata-only in encrypted_data)
            try {
                const meta = JSON.parse(decrypted);
                if (meta.total_chunks && meta.total_chunks > 0 && meta.file_name) {
                    // Chunked file — download and reassemble
                    reportProgress(60, 'Downloading file chunks...');
                    const blob = await downloadChunkedFile(
                        isShared ? item.secret.id : item.id,
                        fileKey,
                        token,
                        API_ENDPOINTS.BASE,
                        meta.total_chunks,
                        meta.mime_type,
                        (pct, msg) => reportProgress(60 + Math.round(pct * 0.35), msg)
                    );
                    const blobUrl = URL.createObjectURL(blob);
                    // Store as a JSON string so SecretItem can detect and render it
                    const result = JSON.stringify({
                        type: 'file',
                        name: meta.file_name,
                        mime: meta.mime_type,
                        content: blobUrl,
                        chunked: true,
                        size: meta.total_size
                    });
                    const key = isShared ? `shared_${item.id}` : item.id;
                    setDecryptedSecrets(prev => ({ ...prev, [key]: result }));
                    reportProgress(100, 'Decrypted');
                    setTimeout(() => reportProgress(0, ''), 500);
                    return result;
                }
            } catch (_) {
                // Not JSON or not chunked — proceed with normal flow
            }

            // Check for legacy file format (base64 in JSON) -> Convert to Blob URL for consistency
            try {
                const parsed = JSON.parse(decrypted);
                if (parsed && parsed.type === 'file' && parsed.content && parsed.content.startsWith('data:')) {
                    // Convert data URI to Blob
                    const byteString = atob(parsed.content.split(',')[1]);
                    const mimeString = parsed.content.split(',')[0].split(':')[1].split(';')[0];
                    const ab = new ArrayBuffer(byteString.length);
                    const ia = new Uint8Array(ab);
                    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                    const blob = new Blob([ab], { type: mimeString });
                    const blobUrl = URL.createObjectURL(blob);

                    const result = JSON.stringify({
                        ...parsed,
                        content: blobUrl, // Replace base64 with blob URL
                        chunked: false // Explicitly mark as not chunked (legacy)
                    });

                    const key = isShared ? `shared_${item.id}` : item.id;
                    setDecryptedSecrets(prev => ({ ...prev, [key]: result }));
                    reportProgress(100, 'Decrypted');
                    setTimeout(() => reportProgress(0, ''), 500);
                    return result;
                }
            } catch (_) { }

            const key = isShared ? `shared_${item.id}` : item.id;
            setDecryptedSecrets(prev => ({ ...prev, [key]: decrypted }));
            reportProgress(100, 'Decrypted');
            setTimeout(() => reportProgress(0, ''), 500);
            return decrypted;
        } catch (e) {
            console.error(e);
            reportProgress(0, '');
            throw new Error("Decryption failed: " + e.message);
        }
    };

    const createSecret = async (name, type, rawContent, isSigned = false, file = null) => {
        reportProgress(10, 'Preparing Envelope...');
        try {
            // 1. Generate AES-256 Key
            const fileKey = await generateSymmetricKey();

            // 2. Prepare Payload (Signed or Raw)
            let payloadToEncrypt = rawContent;
            let secretType = type;

            if (isSigned) {
                reportProgress(20, 'Signing...');
                const signature = await signPQC(rawContent);
                const signedPayload = {
                    content: rawContent,
                    signature: signature,
                    signerPublicKey: pqcAccount
                };
                payloadToEncrypt = JSON.stringify(signedPayload);
                secretType = 'signed_document';
            }

            // 3. Encrypt Content with AES Key
            reportProgress(40, 'Encrypting Content (AES)...');

            let encryptedDataStr;
            const isChunkedFile = (file && !isSigned && secretType === 'file');

            if (isChunkedFile) {
                // For chunked files: store only metadata in encrypted_data
                const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
                const metadata = JSON.stringify({
                    file_name: file.name,
                    mime_type: file.type || 'application/octet-stream',
                    total_chunks: totalChunks,
                    total_size: file.size,
                    chunk_size: CHUNK_SIZE
                });
                const encryptedMeta = await encryptSymmetric(metadata, fileKey);
                encryptedDataStr = JSON.stringify(encryptedMeta);
            } else {
                const encryptedContentIdx = await encryptSymmetric(payloadToEncrypt, fileKey);
                encryptedDataStr = JSON.stringify(encryptedContentIdx);
            }

            // 4. Encrypt AES Key for Owner (Me)
            reportProgress(50, 'Encrypting Key...');
            let encryptedKeyForMe;
            if (authType === 'trustkeys') {
                const res = await encryptPQC(fileKey, encryptionPublicKey);
                encryptedKeyForMe = JSON.stringify(res);
            } else {
                encryptedKeyForMe = encryptData(fileKey, encryptionPublicKey);
            }

            // 5. Send to API (creates the secret record)
            reportProgress(60, 'Creating secret...');
            const res = await fetch(API_ENDPOINTS.SECRETS.CREATE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    type: secretType,
                    encrypted_data: encryptedDataStr,
                    encrypted_key: encryptedKeyForMe
                })
            });

            if (!res.ok) throw new Error(await res.text());
            const createdSecret = await res.json();

            // 6. Upload chunks if it's a chunked file
            if (isChunkedFile) {
                reportProgress(65, 'Uploading encrypted chunks...');
                await uploadChunkedFile(
                    file,
                    createdSecret.id,
                    fileKey,
                    token,
                    API_ENDPOINTS.BASE,
                    (pct, msg) => reportProgress(65 + Math.round(pct * 0.30), msg)
                );
            }

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

    const shareSecret = async (secretId, originalEncryptedKey, recipientAddress, recipientPublicKey, expiry = 0) => {
        // 1. Decrypt the File Key (AES)
        // We need the key, not the content.
        // The UI might pass 'originalEncryptedKey' (which is the key for ME).
        // Wait, the function signature passed 'originalEncryptedData' in old version.
        // We likely need to pass the encrypted_key now.
        // Assuming the UI calls this with the Owner's 'encrypted_key'.

        const fileKey = await secureDecrypt(originalEncryptedKey);

        // 2. Re-encrypt the File Key for Recipient
        let reEncryptedKey;
        if (recipientPublicKey && recipientPublicKey.length > 60) {
            try {
                const res = await encryptPQC(fileKey, recipientPublicKey);
                reEncryptedKey = JSON.stringify(res);
            } catch (e) {
                throw new Error("TrustKeys required to share with this user.");
            }
        } else {
            reEncryptedKey = encryptData(fileKey, recipientPublicKey);
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
                encrypted_key: reEncryptedKey,
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
