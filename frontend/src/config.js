const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
    AUTH: {
        NONCE: (address) => `${API_BASE_URL}/auth/nonce/${address}`,
        LOGIN: `${API_BASE_URL}/auth/login`,
    },
    USERS: {
        GET: (address) => `${API_BASE_URL}/users/${address}`,
        LIST: `${API_BASE_URL}/users`,
        UPDATE: (address) => `${API_BASE_URL}/users/${address}`,
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
    }
};

export default API_ENDPOINTS;
