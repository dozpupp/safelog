import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { encryptData, decryptData, getEncryptionPublicKey } from '../utils/crypto';
import { Plus, Lock, Unlock, Copy, Check, FileText, Share2, LogOut, RefreshCw, User, X, Search, Trash2, Edit2, Clock, Upload, Download, Sun, Moon } from 'lucide-react';
import API_ENDPOINTS from '../config';

const DisplayField = ({ label, value }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        if (!value) return;
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Force truncation logic
    const shouldTruncate = value && value.length > 20;
    const displayValue = shouldTruncate
        ? `${value.substring(0, 8)}...${value.substring(value.length - 8)}`
        : value;

    return (
        <div>
            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
            <div className="flex gap-2">
                <div className="flex-1 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-600 dark:text-slate-500 font-mono text-xs break-all flex items-center">
                    {displayValue || "Not set"}
                </div>
                <button
                    type="button"
                    onClick={handleCopy}
                    className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    title="Copy to clipboard"
                >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
};

export default function Dashboard() {
    const { user, setUser, authType, token, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { currentAccount, encryptionPublicKey: ethKey } = useWeb3();
    const { kyberKey, encrypt: encryptPQC, decrypt: decryptPQC } = usePQC();

    // Unify state based on Auth Type
    const encryptionPublicKey = authType === 'trustkeys' ? kyberKey : ethKey;

    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSecretName, setNewSecretName] = useState('');
    const [newSecretContent, setNewSecretContent] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [decryptedSecrets, setDecryptedSecrets] = useState({}); // id -> content
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [usernameInput, setUsernameInput] = useState('');
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [secretToShare, setSecretToShare] = useState(null);
    const [users, setUsers] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);
    const [sharedSecrets, setSharedSecrets] = useState([]);

    // New State for V1.3
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [secretToEdit, setSecretToEdit] = useState(null);
    const [editName, setEditName] = useState('');
    const [editContent, setEditContent] = useState('');
    const [accessList, setAccessList] = useState([]);
    const [expiry, setExpiry] = useState(0);
    const [userOffset, setUserOffset] = useState(0);
    const [hasMoreUsers, setHasMoreUsers] = useState(true);

    // File Upload State
    const [contentType, setContentType] = useState('text'); // 'text' | 'file'
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    useEffect(() => {
        if (user?.username) {
            setUsernameInput(user.username);
        }
    }, [user]);

    useEffect(() => {
        fetchSecrets();
        fetchSharedSecrets();
    }, [user]);

    const fetchSecrets = async () => {
        if (!user || !token) return;
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
        if (!user || !token) return;
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

    const searchUsers = async (query, offset = 0) => {
        try {
            const limit = 10;
            const url = query
                ? `${API_ENDPOINTS.USERS.LIST}?search=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`
                : `${API_ENDPOINTS.USERS.LIST}?limit=${limit}&offset=${offset}`;
            const res = await fetch(url);
            const data = await res.json();

            // Filter out current user
            const filteredUsers = data.filter(u => u.address !== user.address);

            if (offset === 0) {
                setUsers(filteredUsers);
            } else {
                setUsers(filteredUsers); // Replace list for simple pagination, or append? Request says "load the 10 next", implies paging.
                // Let's replace for now as "Next" usually implies paging.
            }

            setHasMoreUsers(data.length === limit);
            setUserOffset(offset);
        } catch (error) {
            console.error("Failed to search users", error);
        }
    };

    const loadNextUsers = () => {
        searchUsers(searchQuery, userOffset + 10);
    };

    const handleOpenShareModal = async (secret) => {
        setSecretToShare(secret);
        setIsShareModalOpen(true);
        setSearchQuery('');
        setSelectedUser(null);
        setAccessList([]); // Clear previous list
        setAccessList([]); // Clear previous list
        await searchUsers('', 0);
        await fetchAccessList(secret.id); // Fetch access list immediately
    };

    // Helper to decrypt any secret (Standard or PQC)
    const secureDecrypt = async (encryptedString) => {
        try {
            // Try parsing as JSON to detect PQC format
            const parsed = JSON.parse(encryptedString);

            // Check for TrustKeys (PQC) format: { kem, iv, content }
            if (parsed.kem && parsed.iv && parsed.content && authType === 'trustkeys') {
                return await decryptPQC(parsed);
            }

            // Fallback to MetaMask decryption
            return decryptData(encryptedString, currentAccount);
        } catch (e) {
            // If parse fails or other error, try standard decrypt
            return decryptData(encryptedString, currentAccount);
        }
    };

    // Helper to encrypt
    const secureEncrypt = async (content, pubKey) => {
        if (authType === 'trustkeys') {
            const res = await encryptPQC(content, pubKey);
            return JSON.stringify(res);
        } else {
            return encryptData(content, pubKey);
        }
    };

    const fetchAccessList = async (secretId) => {
        if (!user || !secretId || !token) return;
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.ACCESS(secretId), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAccessList(data);
            }
        } catch (error) {
            console.error("Failed to fetch access list", error);
        }
    };

    const handleOpenEditModal = async (secret) => {
        // Must decrypt first to edit
        if (!decryptedSecrets[secret.id]) {
            await handleDecrypt(secret);
        }
        // Ideally we wait for state, but we can just grab the value or re-decrypt
        // For simplicity, let's just use what we have or re-decrypt
        try {
            const content = await secureDecrypt(secret.encrypted_data);
            if (!content) return;
            setEditContent(content);
            setSecretToEdit(secret);
            setEditName(secret.name);
            setIsEditModalOpen(true);
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteSecret = async (id) => {
        if (!confirm("Are you sure? This will delete the secret for everyone.")) return;
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.DELETE(id), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                // Instant UI Update
                setSecrets(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error("Delete failed", error);
        }
    };

    const handleRevokeGrant = async (grantId) => {
        if (!confirm("Are you sure you want to revoke access?")) return;
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.REVOKE(grantId), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                // Instant UI Update
                if (secretToShare) {
                    setAccessList(prev => prev.filter(g => g.id !== grantId));
                } else {
                    setSharedSecrets(prev => prev.filter(g => g.id !== grantId));
                }
            }
        } catch (error) {
            console.error("Revoke failed", error);
        }
    };

    const handleUpdateSecret = async (e) => {
        e.preventDefault();
        try {
            // Re-encrypt
            const encrypted = await secureEncrypt(editContent, encryptionPublicKey);

            const res = await fetch(API_ENDPOINTS.SECRETS.UPDATE(secretToEdit.id), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: editName,
                    encrypted_data: encrypted
                })
            });

            if (res.ok) {
                setIsEditModalOpen(false);
                setSecretToEdit(null);
                setDecryptedSecrets(prev => ({ ...prev, [secretToEdit.id]: editContent })); // Update local view
                fetchSecrets();
            }
        } catch (error) {
            console.error("Update failed", error);
            alert("Update failed");
        }
    };

    const handleShareSecret = async () => {
        if (!selectedUser || !secretToShare) return;

        try {
            // 1. Decrypt the secret first (Smart Decrypt)
            const encryptedSource = secretToShare.encrypted_data; // Original owner's data
            // NOTE: If we are sharing a "Shared Secret" (re-sharing), logic might be different?
            // For now, let's assume we are the owner sharing our own secret.

            const decrypted = await secureDecrypt(encryptedSource);

            // 2. Re-encrypt with recipient's public key
            let reEncrypted;
            const recipientKey = selectedUser.encryption_public_key;

            if (recipientKey && recipientKey.length > 60) {
                // Assume PQC Key (Dilithium/Kyber keys are long)
                // Note: We use the hook here, assuming we are logged in as PQC user to share?
                // Actually, if we are sharing TO a PQC user, we need to use PQC encrypt even if we are standard user?
                // No, only PQC users have the TrustKeys extension typically. 
                // But mixed usage is complex. Let's assume if target is PQC, we try to use encryptPQC.
                try {
                    const res = await encryptPQC(decrypted, recipientKey);
                    reEncrypted = JSON.stringify(res);
                } catch (e) {
                    // If we are not PQC user but try to share to PQC, we might need window.trustkeys if available?
                    // Or logic dictates we must be PQC to share to PQC?
                    // For now, let's stick to using the context which wraps the window check.
                    throw new Error("TrustKeys required to share with this user.");
                }
            } else {
                // Standard MetaMask Encryption
                reEncrypted = encryptData(decrypted, recipientKey);
            }

            // 3. Share via API
            const res = await fetch(API_ENDPOINTS.SECRETS.SHARE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    secret_id: secretToShare.id,
                    grantee_address: selectedUser.address,
                    encrypted_key: reEncrypted,
                    expires_in: expiry > 0 ? expiry : null
                })
            });

            if (res.ok) {
                alert(`Secret shared with ${selectedUser.username || selectedUser.address}!`);
                setIsShareModalOpen(false);
                setSecretToShare(null);
                setSelectedUser(null);
            } else {
                const errorData = await res.json();
                alert(`Failed to share secret: ${errorData.detail || 'Unknown error'}`);
            }
        } catch (error) {
            console.error("Failed to share secret", error);
            alert('Failed to share secret: ' + error.message);
        }
    };

    const handleCreateSecret = async (e) => {
        e.preventDefault();

        // Validation
        if (!newSecretName) {
            alert("Please enter a name for the secret.");
            return;
        }
        if (contentType === 'text' && !newSecretContent) {
            alert("Please enter secret text or switch to File upload.");
            return;
        }
        if (contentType === 'file') {
            if (!selectedFile) {
                alert("Please select a file to upload.");
                return;
            }
            if (selectedFile.size > MAX_FILE_SIZE) {
                alert(`File content is too large. Limit is 5MB.`);
                return;
            }
        }

        try {
            if (!encryptionPublicKey) {
                alert("Encryption public key missing. Please reconnect.");
                return;
            }

            setUploadProgress(10);
            setStatusMessage("Reading...");

            let dataToEncrypt;
            if (contentType === 'file') {
                // Convert file to Base64
                const base64 = await readFileAsBase64(selectedFile);
                dataToEncrypt = JSON.stringify({
                    type: 'file',
                    name: selectedFile.name,
                    mime: selectedFile.type,
                    content: base64
                });
            } else {
                dataToEncrypt = newSecretContent;
            }

            setUploadProgress(40);
            setStatusMessage("Encrypting...");

            // Artificial delay for small files so user sees the UI? 
            // optional, but helpful for UX feel. Let's not force it too much.
            await new Promise(r => setTimeout(r, 200));

            let encrypted;
            if (authType === 'trustkeys') {
                // PQC Encryption
                const res = await encryptPQC(dataToEncrypt, encryptionPublicKey);
                encrypted = JSON.stringify(res);
            } else {
                // Standard Encryption
                encrypted = encryptData(dataToEncrypt, encryptionPublicKey);
            }

            setUploadProgress(70);
            setStatusMessage("Saving...");

            const createRes = await fetch(API_ENDPOINTS.SECRETS.CREATE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newSecretName,
                    encrypted_data: encrypted
                })
            });

            if (createRes.ok) {
                setUploadProgress(100);
                setStatusMessage("Done!");
                await new Promise(r => setTimeout(r, 500)); // Show 100% briefly

                setNewSecretName('');
                setNewSecretContent('');
                setSelectedFile(null);
                setContentType('text');
                setIsCreating(false);
                setUploadProgress(0);
                setStatusMessage('');
                fetchSecrets();
            } else {
                setUploadProgress(0);
                setStatusMessage('');
                const err = await createRes.text();
                alert("Failed to save: " + err);
            }
        } catch (error) {
            console.error("Failed to create secret", error);
            alert("Failed to create secret");
            setUploadProgress(0);
            setStatusMessage('');
        }
    };

    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result); // Returns data:mime;base64,...
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleDownload = (jsonContent) => {
        try {
            const fileData = JSON.parse(jsonContent);
            if (fileData.type !== 'file') return;

            // Create Blob from Base64
            // Data URL format: "data:image/png;base64,....."
            const link = document.createElement('a');
            link.href = fileData.content;
            link.download = fileData.name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Download failed", e);
        }
    };

    const renderDecryptedContent = (content) => {
        try {
            // Check if it's a file payload
            const parsed = JSON.parse(content);
            if (parsed && parsed.type === 'file' && parsed.content) {
                return (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-indigo-300">
                            <FileText className="w-4 h-4" />
                            <span className="font-medium">{parsed.name}</span>
                            <span className="text-xs text-slate-500">({parsed.mime})</span>
                        </div>
                        <button
                            onClick={() => handleDownload(content)}
                            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm w-fit transition-colors"
                        >
                            <Download className="w-4 h-4" /> Download File
                        </button>
                    </div>
                );
            }
        } catch (e) {
            // Not JSON or Not File -> Text
        }
        return content;
    };

    const handleDecrypt = async (item, isShared = false) => {
        try {
            const dataToDecrypt = isShared ? item.encrypted_key : item.encrypted_data;
            const decrypted = await secureDecrypt(dataToDecrypt);

            const key = isShared ? `shared_${item.id}` : item.id;
            setDecryptedSecrets(prev => ({ ...prev, [key]: decrypted }));
        } catch (error) {
            console.error("Decryption failed", error);
            alert("Decryption failed. Ensure you have the right key.");
        }
    };

    const handleUpdateProfile = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(API_ENDPOINTS.USERS.UPDATE(user.address), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    username: usernameInput
                })
            });

            if (res.ok) {
                const updatedUser = await res.json();
                setUser(updatedUser);
                setIsProfileOpen(false);
            }
        } catch (error) {
            console.error("Failed to update profile", error);
            alert("Failed to update profile");
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 p-6 transition-colors duration-200">
            <header className="max-w-5xl mx-auto flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                        <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SecureVault</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors text-slate-600 dark:text-slate-400"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <div
                        onClick={() => setIsProfileOpen(true)}
                        className="px-4 py-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors flex items-center gap-2"
                    >
                        <User className="w-4 h-4" />
                        {user?.username || `${user?.address?.slice(0, 6)}...${user?.address?.slice(-4)}`}
                    </div>
                    <button
                        onClick={logout}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Your Secrets</h2>
                    <button
                        onClick={() => setIsCreating(!isCreating)}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        New Secret
                    </button>
                </div>

                {
                    isProfileOpen && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Edit Profile</h3>
                                    <button onClick={() => setIsProfileOpen(false)} className="text-slate-400 hover:text-white">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <form onSubmit={handleUpdateProfile} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                                        <input
                                            type="text"
                                            value={usernameInput}
                                            onChange={(e) => setUsernameInput(e.target.value)}
                                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            placeholder="Set a username"
                                        />
                                    </div>

                                    <DisplayField
                                        label={authType === 'trustkeys' ? "ML-DSA (Dilithium) / User ID" : "Wallet Address"}
                                        value={user?.address}
                                    />

                                    <DisplayField
                                        label={authType === 'trustkeys' ? "ML-KEM (Kyber) / Encryption Key" : "Public Key"}
                                        value={user?.encryption_public_key}
                                    />

                                    <div className="flex justify-end gap-3 mt-6">
                                        <button
                                            type="button"
                                            onClick={() => setIsProfileOpen(false)}
                                            className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )
                }

                {isShareModalOpen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Manage Access</h3>
                                <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mb-4 shrink-0">
                                <p className="text-sm text-slate-400 mb-2">Secret: <span className="text-white font-medium">{secretToShare?.name}</span></p>
                            </div>

                            <div className="overflow-y-auto flex-1 pr-2">
                                {/* Access List - Visible at Top if exists */}
                                <div className="mb-6">
                                    <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                                        <User className="w-4 h-4 text-indigo-400" />
                                        Who has access ({accessList.length})?
                                    </h4>
                                    <div className="space-y-2">
                                        {accessList.length === 0 ? (
                                            <div className="text-sm text-slate-500 italic p-3 bg-slate-950/50 rounded-lg border border-slate-800/50">
                                                No one yet. Only you have access.
                                            </div>
                                        ) : (
                                            accessList.map(grant => (
                                                <div key={grant.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <User className="w-3 h-3 text-slate-400" />
                                                            <p className="text-sm text-white font-medium truncate w-40">
                                                                {grant.grantee?.username ? (
                                                                    <span>{grant.grantee.username} <span className="text-slate-500 text-xs">({grant.grantee_address.slice(0, 6)}...)</span></span>
                                                                ) : (
                                                                    <span>{grant.grantee_address.slice(0, 10)}...{grant.grantee_address.slice(-4)}</span>
                                                                )}
                                                            </p>
                                                        </div>
                                                        {grant.expires_at ? (
                                                            <p className="text-xs text-orange-400 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" /> Expires: {new Date(grant.expires_at).toLocaleString()}
                                                            </p>
                                                        ) : (
                                                            <p className="text-xs text-emerald-400/70 flex items-center gap-1">
                                                                <Check className="w-3 h-3" /> Permanent Details
                                                            </p>
                                                        )}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRevokeGrant(grant.id)}
                                                        className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                        title="Revoke Access"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="border-t border-slate-800 my-4"></div>

                                {/* Add New Share */}
                                <h4 className="text-sm font-medium text-white mb-3">Add Person</h4>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Search Users</label>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => {
                                                setSearchQuery(e.target.value);
                                                searchUsers(e.target.value);
                                            }}
                                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                            placeholder="Username or address..."
                                        />
                                    </div>
                                </div>

                                {/* User Results */}
                                {users.length > 0 && (
                                    <div className="mb-4 border border-slate-800 rounded-lg p-2 bg-slate-950 max-h-32 overflow-y-auto">
                                        {users.map(u => (
                                            <div
                                                key={u.address}
                                                onClick={() => setSelectedUser(u)}
                                                className={`p-2 rounded cursor-pointer flex justify-between items-center ${selectedUser?.address === u.address ? 'bg-indigo-900/50' : 'hover:bg-slate-800'}`}
                                            >
                                                <span className="text-sm text-white">{u.username || u.address.slice(0, 10)}</span>
                                                {selectedUser?.address === u.address && <Check className="w-3 h-3 text-indigo-400" />}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {hasMoreUsers && users.length > 0 && (
                                    <button
                                        onClick={loadNextUsers}
                                        className="w-full text-center text-sm text-indigo-400 hover:text-indigo-300 py-2 border-t border-slate-800 mt-2 hover:bg-slate-800/50 transition-colors"
                                    >
                                        Next
                                    </button>
                                )}

                                {/* Expiry / Timebomb */}
                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                                        <Clock className="w-3 h-3" /> Expiry (Timebomb)
                                    </label>
                                    <select
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white outline-none"
                                        value={expiry}
                                        onChange={(e) => setExpiry(Number(e.target.value))}
                                    >
                                        <option value={0}>Never expire</option>
                                        <option value={300}>5 Minutes</option>
                                        <option value={3600}>1 Hour</option>
                                        <option value={86400}>1 Day</option>
                                        <option value={604800}>1 Week</option>
                                    </select>
                                </div>

                                <button
                                    onClick={handleShareSecret}
                                    disabled={!selectedUser}
                                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                                >
                                    Share Secret
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Edit Modal */}
                {isEditModalOpen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                            <h3 className="text-xl font-semibold text-white mb-4">Edit Secret</h3>
                            <form onSubmit={handleUpdateSecret} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Content</label>
                                    <textarea
                                        value={editContent}
                                        onChange={(e) => setEditContent(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white outline-none h-24"
                                    />
                                </div>
                                <div className="flex justify-end gap-3 px-0">
                                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Create Form */}
                {isCreating && (
                    <div className="mb-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
                        <form onSubmit={handleCreateSecret} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={newSecretName}
                                    onChange={(e) => setNewSecretName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    placeholder="e.g. WiFi Password"
                                />
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-slate-400 mb-1">Content Type</label>
                                <div className="flex gap-4 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setContentType('text')}
                                        className={`flex-1 py-2 rounded-lg text-sm border ${contentType === 'text' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-indigo-500'}`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <FileText className="w-4 h-4" /> Text
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setContentType('file')}
                                        className={`flex-1 py-2 rounded-lg text-sm border ${contentType === 'file' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-indigo-500'}`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <Upload className="w-4 h-4" /> File
                                        </div>
                                    </button>
                                </div>

                                {contentType === 'text' ? (
                                    <>
                                        <label className="block text-sm font-medium text-slate-400 mb-1">Secret Content</label>
                                        <textarea
                                            value={newSecretContent}
                                            onChange={(e) => setNewSecretContent(e.target.value)}
                                            className="w-full h-32 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-sm"
                                            placeholder="Enter sensitive data..."
                                        />
                                    </>
                                ) : (
                                    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50">
                                        <input
                                            type="file"
                                            id="file-upload"
                                            className="hidden"
                                            onChange={(e) => setSelectedFile(e.target.files[0])}
                                        />
                                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                                            <Upload className="w-8 h-8 text-indigo-400 mb-2" />
                                            <span className="text-sm text-slate-300 font-medium">Click to upload file</span>
                                            <span className="text-xs text-slate-500 mt-1">{selectedFile ? selectedFile.name : "Any file type allowed"}</span>
                                        </label>
                                    </div>
                                )}
                            </div>
                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={uploadProgress > 0}
                                    className="relative bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-all overflow-hidden disabled:cursor-not-allowed min-w-[140px]"
                                >
                                    {uploadProgress > 0 ? (
                                        <>
                                            <div
                                                className="absolute left-0 top-0 bottom-0 bg-emerald-500 transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                            <span className="relative z-10 flex items-center justify-center gap-2">
                                                {uploadProgress < 100 && <RefreshCw className="w-4 h-4 animate-spin" />}
                                                {statusMessage}
                                            </span>
                                        </>
                                    ) : (
                                        "Encrypt & Save"
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                )
                }

                {
                    loading ? (
                        <div className="flex justify-center py-12">
                            <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                        </div>
                    ) : secrets.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
                            <p className="text-slate-500">No secrets found. Create one to get started.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {secrets.map(secret => (
                                <div key={secret.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <h3 className="font-medium text-slate-900 dark:text-white">{secret.name}</h3>
                                            <span className="text-xs text-slate-500">
                                                {new Date(secret.created_at).toLocaleDateString()}
                                            </span>
                                        </div>

                                        {decryptedSecrets[secret.id] ? (
                                            <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-200 font-mono text-sm break-all">
                                                {renderDecryptedContent(decryptedSecrets[secret.id])}
                                            </div>
                                        ) : (
                                            <div className="mt-3 text-sm text-slate-500 italic flex items-center gap-2">
                                                <Lock className="w-3 h-3" />
                                                Encrypted Content
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 ml-4">
                                        {!decryptedSecrets[secret.id] && (
                                            <button
                                                onClick={() => handleDecrypt(secret)}
                                                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                                title="Decrypt"
                                            >
                                                <Unlock className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleOpenShareModal(secret)}
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                            title="Manage Access & Share"
                                        >
                                            <User className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleOpenEditModal(secret)}
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                            title="Edit"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteSecret(secret.id)}
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }

                <div className="mt-12 mb-6">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Shared with You</h2>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                    </div>
                ) : sharedSecrets.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
                        <p className="text-slate-500">No secrets shared with you yet.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {sharedSecrets.map(grant => (
                            <div key={`shared-${grant.id}`} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex items-start justify-between group hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                        </div>
                                        <h3 className="font-medium text-slate-900 dark:text-white">{grant.secret?.name || 'Unknown Secret'}</h3>
                                        <span className="text-xs text-slate-500">
                                            {new Date(grant.created_at).toLocaleDateString()}
                                        </span>
                                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                                            Shared by {grant.secret?.owner?.username || grant.secret?.owner?.address?.slice(0, 6) + '...'}
                                        </span>
                                    </div>

                                    {decryptedSecrets[`shared_${grant.id}`] ? (
                                        <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-200 font-mono text-sm break-all">
                                            {renderDecryptedContent(decryptedSecrets[`shared_${grant.id}`])}
                                        </div>
                                    ) : (
                                        <div className="mt-3 text-sm text-slate-500 italic flex items-center gap-2">
                                            <Lock className="w-3 h-3" />
                                            Encrypted Content
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 ml-4">
                                    {!decryptedSecrets[`shared_${grant.id}`] && (
                                        <button
                                            onClick={() => handleDecrypt(grant, true)}
                                            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                            title="Decrypt"
                                        >
                                            <Unlock className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleRevokeGrant(grant.id)}
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                                        title="Remove"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main >
        </div >
    );
}
