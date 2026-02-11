const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export const API_ENDPOINTS = {
    BASE: API_BASE_URL,
    AUTH: {
        NONCE: (address) => `${API_BASE_URL}/auth/nonce/${address}`,
        LOGIN: `${API_BASE_URL}/auth/login`,
    },
    USERS: {
        GET: (address) => `${API_BASE_URL}/users/${address}`,
        LIST: `${API_BASE_URL}/users`,
        UPDATE: (address) => `${API_BASE_URL}/users/${address}`,
        RESOLVE: `${API_BASE_URL}/users/resolve`,
    },
    SECRETS: {
        LIST: `${API_BASE_URL}/secrets`,
        CREATE: `${API_BASE_URL}/secrets`,
        SHARE: `${API_BASE_URL}/secrets/share`,
        SHARED_WITH: `${API_BASE_URL}/secrets/shared-with-me`,
        ACCESS: (secretId) => `${API_BASE_URL}/secrets/${secretId}/access`,
        UPDATE: (secretId) => `${API_BASE_URL}/secrets/${secretId}`,
        DELETE: (secretId) => `${API_BASE_URL}/secrets/${secretId}`,
        REVOKE: (grantId) => `${API_BASE_URL}/secrets/share/${grantId}`,
        CHUNKS_UPLOAD: `${API_BASE_URL}/secrets/chunks`,
        CHUNKS_LIST: (secretId) => `${API_BASE_URL}/secrets/${secretId}/chunks`,
        CHUNK: (secretId, index) => `${API_BASE_URL}/secrets/${secretId}/chunks/${index}`,
    },
    GROUPS: {
        LIST: `${API_BASE_URL}/groups`,
        CREATE: `${API_BASE_URL}/groups`,
        GET: (channelId) => `${API_BASE_URL}/groups/${channelId}`,
        MESSAGES: (channelId) => `${API_BASE_URL}/groups/${channelId}/messages`,
        HISTORY: (channelId) => `${API_BASE_URL}/groups/${channelId}/history`,
        MEMBERS: (channelId) => `${API_BASE_URL}/groups/${channelId}/members`,
        REMOVE_MEMBER: (channelId, addr) => `${API_BASE_URL}/groups/${channelId}/members/${addr}`,
        MARK_READ: (channelId) => `${API_BASE_URL}/groups/${channelId}/mark-read`,
    }
};

export default API_ENDPOINTS;
