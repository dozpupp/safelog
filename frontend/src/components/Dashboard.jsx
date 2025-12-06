import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { usePQC } from '../context/PQCContext';
import { encryptData, decryptData, getEncryptionPublicKey } from '../utils/crypto';
import { Plus, Lock, Unlock, Copy, Check, FileText, Share2, LogOut, RefreshCw, User, X, Search } from 'lucide-react';
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
            <label className="block text-sm font-medium text-slate-400 mb-1">{label}</label>
            <div className="flex gap-2">
                <div className="flex-1 bg-slate-950/50 border border-slate-800 rounded-lg px-4 py-2 text-slate-500 font-mono text-xs break-all flex items-center">
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
    const { user, setUser, authType } = useAuth();
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
        if (!user) return;
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.LIST(user.address));
            const data = await res.json();
            setSecrets(data);
        } catch (error) {
            console.error("Failed to fetch secrets", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSharedSecrets = async () => {
        if (!user) return;
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.SHARED_WITH(user.address));
            const data = await res.json();
            setSharedSecrets(data);
        } catch (error) {
            console.error("Failed to fetch shared secrets", error);
        }
    };

    const searchUsers = async (query) => {
        try {
            const url = query
                ? `${API_ENDPOINTS.USERS.LIST}?search=${encodeURIComponent(query)}&limit=5`
                : `${API_ENDPOINTS.USERS.LIST}?limit=5`;
            const res = await fetch(url);
            const data = await res.json();
            // Filter out current user
            setUsers(data.filter(u => u.address !== user.address));
        } catch (error) {
            console.error("Failed to search users", error);
        }
    };

    const handleOpenShareModal = async (secret) => {
        setSecretToShare(secret);
        setIsShareModalOpen(true);
        setSearchQuery('');
        setSelectedUser(null);
        await searchUsers('');
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
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret_id: secretToShare.id,
                    grantee_address: selectedUser.address,
                    encrypted_key: reEncrypted
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
        if (!newSecretName || !newSecretContent) return;

        try {
            if (!encryptionPublicKey) {
                alert("Encryption public key missing. Please reconnect.");
                return;
            }

            let encrypted;
            if (authType === 'trustkeys') {
                // PQC Encryption
                const res = await encryptPQC(newSecretContent, encryptionPublicKey);
                encrypted = JSON.stringify(res);
            } else {
                // Standard Encryption
                encrypted = encryptData(newSecretContent, encryptionPublicKey);
            }

            const createRes = await fetch(`${API_ENDPOINTS.SECRETS.CREATE}?owner_address=${user.address}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newSecretName,
                    encrypted_data: encrypted
                })
            });

            if (createRes.ok) {
                setNewSecretName('');
                setNewSecretContent('');
                setIsCreating(false);
                fetchSecrets();
            }
        } catch (error) {
            console.error("Failed to create secret", error);
            alert("Failed to create secret");
        }
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
                headers: { 'Content-Type': 'application/json' },
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
        <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
            <header className="max-w-5xl mx-auto flex justify-between items-center mb-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                        <Lock className="w-5 h-5 text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">SecureVault</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div
                        onClick={() => setIsProfileOpen(true)}
                        className="px-4 py-2 bg-slate-900 rounded-lg border border-slate-800 text-sm font-mono text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer transition-colors flex items-center gap-2"
                    >
                        <User className="w-4 h-4" />
                        {user?.username || `${user?.address.slice(0, 6)}...${user?.address.slice(-4)}`}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
            </header>

            <main className="max-w-5xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">Your Secrets</h2>
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
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-semibold text-white">Edit Profile</h3>
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
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
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
                                            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
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
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-semibold text-white">Share Secret</h3>
                                <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="mb-4">
                                <p className="text-sm text-slate-400 mb-2">Sharing: <span className="text-white font-medium">{secretToShare?.name}</span></p>
                            </div>

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
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        placeholder="Search by username or address..."
                                    />
                                </div>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 mb-6">
                                {users.length === 0 ? (
                                    <p className="text-sm text-slate-500 text-center py-4">No users found</p>
                                ) : (
                                    users.map(u => (
                                        <div
                                            key={u.address}
                                            onClick={() => setSelectedUser(u)}
                                            className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedUser?.address === u.address
                                                ? 'bg-indigo-500/20 border-indigo-500'
                                                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-slate-400" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-medium truncate">
                                                        {u.username || 'Anonymous'}
                                                    </p>
                                                    <p className="text-slate-500 text-xs font-mono truncate">
                                                        {u.address.slice(0, 8)}...{u.address.slice(-6)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsShareModalOpen(false)}
                                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleShareSecret}
                                    disabled={!selectedUser}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Share
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {
                    isCreating && (
                        <div className="mb-8 bg-slate-900 border border-slate-800 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
                            <form onSubmit={handleCreateSecret} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={newSecretName}
                                        onChange={(e) => setNewSecretName(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                        placeholder="e.g. WiFi Password"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-1">Content</label>
                                    <textarea
                                        value={newSecretContent}
                                        onChange={(e) => setNewSecretContent(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none h-24"
                                        placeholder="Secret content..."
                                    />
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                                    >
                                        Encrypt & Save
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
                        <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                            <p className="text-slate-500">No secrets found. Create one to get started.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {secrets.map(secret => (
                                <div key={secret.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start justify-between group hover:border-slate-700 transition-all">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-slate-800 rounded-lg">
                                                <FileText className="w-4 h-4 text-indigo-400" />
                                            </div>
                                            <h3 className="font-medium text-white">{secret.name}</h3>
                                            <span className="text-xs text-slate-500">
                                                {new Date(secret.created_at).toLocaleDateString()}
                                            </span>
                                        </div>

                                        {decryptedSecrets[secret.id] ? (
                                            <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-200 font-mono text-sm break-all">
                                                {decryptedSecrets[secret.id]}
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
                                            title="Share"
                                        >
                                            <Share2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }

                <div className="mt-12 mb-6">
                    <h2 className="text-xl font-semibold text-white">Shared with You</h2>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <RefreshCw className="w-6 h-6 animate-spin text-slate-500" />
                    </div>
                ) : sharedSecrets.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                        <p className="text-slate-500">No secrets shared with you yet.</p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {sharedSecrets.map(grant => (
                            <div key={`shared-${grant.id}`} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-start justify-between group hover:border-slate-700 transition-all">
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-slate-800 rounded-lg">
                                            <FileText className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <h3 className="font-medium text-white">{grant.secret?.name || 'Unknown Secret'}</h3>
                                        <span className="text-xs text-slate-500">
                                            {new Date(grant.created_at).toLocaleDateString()}
                                        </span>
                                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs rounded-full">
                                            Shared by {grant.secret?.owner?.username || grant.secret?.owner?.address?.slice(0, 6) + '...'}
                                        </span>
                                    </div>

                                    {decryptedSecrets[`shared_${grant.id}`] ? (
                                        <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-200 font-mono text-sm break-all">
                                            {decryptedSecrets[`shared_${grant.id}`]}
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
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main >
        </div >
    );
}
