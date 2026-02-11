/**
 * Chunked file upload/download utilities.
 * Splits files into 512KB chunks, encrypts each individually with AES-GCM,
 * and uploads/downloads them via the /secrets/chunks API.
 */
import { encryptChunk, decryptChunk } from './crypto';

export const CHUNK_SIZE = 512 * 1024; // 512KB per chunk

/**
 * Read a File as an ArrayBuffer and return Uint8Array.
 */
const readFileAsArrayBuffer = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Upload a file in encrypted chunks.
 *
 * @param {File} file - The File object to upload
 * @param {number} secretId - The secret ID that owns these chunks
 * @param {string} fileKey - AES-256 key (hex) for encryption
 * @param {string} token - Auth bearer token
 * @param {string} apiBaseUrl - Base URL for the chunks endpoint
 * @param {function} onProgress - Callback(percent, message)
 * @returns {{ totalChunks: number, totalSize: number, chunkSize: number }}
 */
export async function uploadChunkedFile(file, secretId, fileKey, token, apiBaseUrl, onProgress) {
    const fileBytes = await readFileAsArrayBuffer(file);
    const totalSize = fileBytes.length;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkData = fileBytes.slice(start, end);

        // Encrypt chunk
        const { iv, ciphertext } = await encryptChunk(chunkData, fileKey);

        // Upload
        const res = await fetch(`${apiBaseUrl}/secrets/chunks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                secret_id: secretId,
                chunk_index: i,
                iv: iv,
                encrypted_data: ciphertext
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Chunk ${i} upload failed: ${errText}`);
        }

        if (onProgress) {
            const percent = Math.round(((i + 1) / totalChunks) * 100);
            onProgress(percent, `Uploading chunk ${i + 1}/${totalChunks}`);
        }
    }

    return { totalChunks, totalSize, chunkSize: CHUNK_SIZE };
}

/**
 * Download and decrypt all chunks for a secret, returning a Blob.
 *
 * @param {number} secretId - The secret ID
 * @param {string} fileKey - AES-256 key (hex) for decryption
 * @param {string} token - Auth bearer token
 * @param {string} apiBaseUrl - Base URL for the chunks endpoint
 * @param {number} totalChunks - Number of chunks to fetch
 * @param {string} mimeType - MIME type for the resulting Blob
 * @param {function} onProgress - Callback(percent, message)
 * @returns {Blob}
 */
export async function downloadChunkedFile(secretId, fileKey, token, apiBaseUrl, totalChunks, mimeType, onProgress) {
    const decryptedChunks = [];

    for (let i = 0; i < totalChunks; i++) {
        const res = await fetch(`${apiBaseUrl}/secrets/${secretId}/chunks/${i}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error(`Chunk ${i} download failed: ${res.status}`);
        }

        const chunkData = await res.json();
        const decryptedBytes = await decryptChunk(chunkData.iv, chunkData.encrypted_data, fileKey);
        decryptedChunks.push(decryptedBytes);

        if (onProgress) {
            const percent = Math.round(((i + 1) / totalChunks) * 100);
            onProgress(percent, `Downloading chunk ${i + 1}/${totalChunks}`);
        }
    }

    return new Blob(decryptedChunks, { type: mimeType || 'application/octet-stream' });
}
