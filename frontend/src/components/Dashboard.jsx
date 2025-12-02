import React, { useState, useEffect } from 'react';
import { useWeb3 } from '../context/Web3Context';
import { encryptData, decryptData, getEncryptionPublicKey } from '../utils/crypto';
import { Plus, Lock, Unlock, Copy, Check, FileText, Share2, LogOut, RefreshCw } from 'lucide-react';

export default function Dashboard() {
    const { user, encryptionPublicKey, currentAccount } = useWeb3();
    const [secrets, setSecrets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newSecretName, setNewSecretName] = useState('');
    const [newSecretContent, setNewSecretContent] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [decryptedSecrets, setDecryptedSecrets] = useState({}); // id -> content

    useEffect(() => {
        fetchSecrets();
    }, [user]);

    const fetchSecrets = async () => {
        if (!user) return;
        try {
            const res = await fetch(`http://localhost:8000/secrets/${user.address}`);
            const data = await res.json();
            setSecrets(data);
        } catch (error) {
            console.error("Failed to fetch secrets", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSecret = async (e) => {
        e.preventDefault();
        if (!newSecretName || !newSecretContent) return;

        try {
            // Encrypt content
            // We need the public key. If we don't have it in context, we might need to ask again or fail.
            // Ideally we got it during login.
            if (!encryptionPublicKey) {
                alert("Encryption public key missing. Please reconnect.");
                return;
            }

            const encrypted = encryptData(newSecretContent, encryptionPublicKey);

            const res = await fetch('http://localhost:8000/secrets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newSecretName,
                    encrypted_data: encrypted
                })
            }, {
                // We need to pass owner_address param? No, the schema says body is SecretCreate.
                // Wait, the endpoint is: create_secret(secret: schemas.SecretCreate, owner_address: str, ...)
                // So we need to pass owner_address as query param!
            });

            // Wait, let's check the endpoint definition in main.py
            // @app.post("/secrets", response_model=schemas.SecretResponse)
            // def create_secret(secret: schemas.SecretCreate, owner_address: str, db: Session = Depends(get_db)):

            // So we need to call POST /secrets?owner_address=...

            const createRes = await fetch(`http://localhost:8000/secrets?owner_address=${user.address}`, {
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

    const handleDecrypt = async (secret) => {
        try {
            const decrypted = await decryptData(secret.encrypted_data, currentAccount);
            setDecryptedSecrets(prev => ({ ...prev, [secret.id]: decrypted }));
        } catch (error) {
            console.error("Decryption failed", error);
            alert("Decryption failed. Ensure you are the owner.");
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
                    <div className="px-4 py-2 bg-slate-900 rounded-lg border border-slate-800 text-sm font-mono text-slate-400">
                        {user?.address.slice(0, 6)}...{user?.address.slice(-4)}
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

                {isCreating && (
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
                )}

                {loading ? (
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
                                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                                        title="Share (Coming Soon)"
                                    >
                                        <Share2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
