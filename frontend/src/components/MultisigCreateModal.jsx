import React, { useState, useEffect } from 'react';
import { X, Search, Plus, Trash2, Check, Lock, Users, FileText, ArrowRight, ArrowLeft, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import { useWeb3 } from '../context/Web3Context';
import { encryptData, getEncryptionPublicKey } from '../utils/crypto';
import API_ENDPOINTS from '../config';

export default function MultisigCreateModal({ isOpen, onClose, onCreated }) {
    const { user, token, authType } = useAuth();
    const { pqcAccount, encrypt: encryptPQC, kyberKey, sign: signPQC } = usePQC(); // PQC Hook
    const { currentAccount, encryptionPublicKey: ethKey } = useWeb3(); // Metamask Hook

    // Step 0: Secret Content
    // Step 1: Add Signers
    // Step 2: Add Recipients
    // Step 3: Review & Create
    const [step, setStep] = useState(0);

    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [contentType, setContentType] = useState('text'); // 'text' | 'file'
    const [selectedFile, setSelectedFile] = useState(null);

    const [signers, setSigners] = useState([]); // List of user objects
    const [recipients, setRecipients] = useState([]); // List of user objects

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);

    const [isCreating, setIsCreating] = useState(false);
    const [progress, setProgress] = useState(0);

    // Reset on open
    useEffect(() => {
        if (isOpen) {
            setStep(0);
            setName('');
            setContent('');
            setContentType('text');
            setSelectedFile(null);
            setSigners([]);
            setRecipients([]);
            setIsCreating(false);
            setProgress(0);
        }
    }, [isOpen]);

    const readFileAsBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleSearch = async (query) => {
        if (!query) return;
        try {
            const res = await fetch(`${API_ENDPOINTS.USERS.LIST}?search=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            // Filter out self and already added
            const added = step === 1 ? signers : recipients;
            setSearchResults(data.filter(u => u.address !== user.address && !added.find(a => a.address === u.address)));
        } catch (e) {
            console.error(e);
        }
    };

    const handleAddUser = (u) => {
        if (step === 1) {
            setSigners([...signers, u]);
        } else {
            setRecipients([...recipients, u]);
        }
        setSearchResults([]);
        setSearchQuery('');
    };

    const handleRemoveUser = (addr) => {
        if (step === 1) {
            setSigners(signers.filter(u => u.address !== addr));
        } else {
            setRecipients(recipients.filter(u => u.address !== addr));
        }
    };

    const secureEncrypt = async (content, pubKey) => {
        try {
            // Check if pubKey is PQC (long) or Eth (starts with 0x? No, keys are bases64 or hex usually, but PQC keys are huge)
            if (pubKey.length > 200) { // Dil/Kyber keys are big
                // Use PQC Encrypt
                const res = await encryptPQC(content, pubKey);
                return JSON.stringify(res);
            } else {
                return encryptData(content, pubKey);
            }
        } catch (e) {
            console.error("Encryption failed for key", pubKey, e);
            throw e;
        }
    };

    const handleCreate = async () => {
        if (!name || (contentType === 'text' && !content) || (contentType === 'file' && !selectedFile) || signers.length === 0) {
            alert("Please complete all fields. Use must have at least one signer.");
            return;
        }

        setIsCreating(true);
        try {
            // PREPARE CONTENT
            let rawContent;
            if (contentType === 'file') {
                if (!selectedFile) throw new Error("No file selected");
                const base64 = await readFileAsBase64(selectedFile);
                rawContent = JSON.stringify({
                    type: 'file',
                    name: selectedFile.name,
                    mime: selectedFile.type,
                    content: base64
                });
            } else {
                rawContent = content;
            }

            // CREATOR SIGNATURE
            // We MUST sign the content to prove origin.
            setProgress(5);
            let payloadToEncrypt = rawContent;
            let secretType = 'standard';

            if (pqcAccount) { // Assuming PQC active
                const signature = await signPQC(rawContent);
                payloadToEncrypt = JSON.stringify({
                    content: rawContent,
                    signature: signature,
                    signerPublicKey: pqcAccount
                });
                secretType = 'signed_document';
            } else {
                throw new Error("You must be logged in with TrustKeys (PQC) to create a multisig workflow.");
            }

            // 1. Encrypt Content for Creator (Self)
            setProgress(10);
            const encryptionPublicKey = authType === 'trustkeys' ? kyberKey : ethKey;
            const encryptedForMe = await secureEncrypt(payloadToEncrypt, encryptionPublicKey);

            // 2. Encrypt Content for Signers
            setProgress(20);
            const signerKeys = {};
            for (const s of signers) {
                if (!s.encryption_public_key) continue;
                signerKeys[s.address] = await secureEncrypt(payloadToEncrypt, s.encryption_public_key);
            }

            // 3. Encrypt Content for Recipients
            setProgress(50);
            const recipientKeys = {};
            // NOTE: Recipient keys are now generated by the LAST signer to ensure "release upon completion"
            // So we send empty map here. The backend will store empty keys until completion.

            setProgress(80);
            const payload = {
                name: name,
                secret_data: {
                    name: name,
                    type: secretType,
                    encrypted_data: encryptedForMe
                },
                signers: signers.map(s => s.address),
                recipients: recipients.map(r => r.address),
                signer_keys: signerKeys,
                recipient_keys: recipientKeys
            };

            const res = await fetch(`${API_ENDPOINTS.SECRETS.LIST}/../multisig/workflow`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                setProgress(100);
                setTimeout(() => {
                    onCreated();
                    onClose();
                }, 500);
            } else {
                alert("Failed to create workflow");
            }

        } catch (e) {
            console.error("Creation failed", e);
            alert("Error: " + e.message);
        } finally {
            setIsCreating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-2xl h-[600px] flex flex-col">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Create Multisig Workflow</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
                </div>

                {/* Stepper */}
                <div className="flex items-center mb-8 px-4">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`flex-1 h-2 rounded-full mx-1 ${i <= step ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`} />
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto px-1">
                    {step === 0 && (
                        <div className="space-y-4">
                            <h4 className="text-lg font-medium">1. Secret Content</h4>
                            <input
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2"
                                placeholder="Workflow Name / Subject"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />

                            <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 mb-4">
                                <button
                                    className={`pb-2 text-sm font-medium transition-colors ${contentType === 'text' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    onClick={() => setContentType('text')}
                                >
                                    Text Secret
                                </button>
                                <button
                                    className={`pb-2 text-sm font-medium transition-colors ${contentType === 'file' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                    onClick={() => setContentType('file')}
                                >
                                    File Upload
                                </button>
                            </div>

                            {contentType === 'text' ? (
                                <textarea
                                    className="w-full h-40 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-4 py-2 resize-none"
                                    placeholder="Enter secret content..."
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                />
                            ) : (
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950/50">
                                    <input
                                        type="file"
                                        id="file-upload"
                                        className="hidden"
                                        onChange={(e) => setSelectedFile(e.target.files[0])}
                                    />
                                    <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                                        <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {selectedFile ? selectedFile.name : "Click to upload a file"}
                                        </span>
                                        {selectedFile && (
                                            <span className="text-xs text-slate-500">
                                                {(selectedFile.size / 1024).toFixed(1)} KB
                                            </span>
                                        )}
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {(step === 1 || step === 2) && (
                        <div className="space-y-4">
                            <h4 className="text-lg font-medium">{step === 1 ? '2. Add Signers' : '3. Add Recipients'}</h4>
                            <p className="text-sm text-slate-500">{step === 1 ? 'Users who must sign to release the secret.' : 'Users who will receive the secret once signed.'}</p>

                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-10 pr-4 py-2"
                                    placeholder="Search users..."
                                    value={searchQuery}
                                    onChange={e => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg mt-1 shadow-lg z-10 max-h-40 overflow-y-auto">
                                        {searchResults.map(u => (
                                            <button key={u.address} onClick={() => handleAddUser(u)} className="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex justify-between items-center">
                                                <span>{u.username || u.address.substring(0, 8)}</span>
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 mt-4">
                                {(step === 1 ? signers : recipients).map(u => (
                                    <div key={u.address} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs">
                                                {u.username?.[0] || 'U'}
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium">{u.username || 'User'}</div>
                                                <div className="text-xs text-slate-500 font-mono">{u.address.substring(0, 10)}...</div>
                                            </div>
                                        </div>
                                        <button onClick={() => handleRemoveUser(u.address)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {(step === 1 ? signers : recipients).length === 0 && (
                                    <div className="text-center py-8 text-slate-400">No users added yet.</div>
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <h4 className="text-lg font-medium">4. Review</h4>
                            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Name</span>
                                    <span className="font-medium">{name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Signers</span>
                                    <span className="font-medium">{signers.length} users</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Recipients</span>
                                    <span className="font-medium">{recipients.length} users</span>
                                </div>
                            </div>

                            {isCreating && (
                                <div className="space-y-2">
                                    <div className="text-sm text-center text-slate-500">Creating Workflow... {progress}%</div>
                                    <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex justify-between mt-6 pt-6 border-t border-slate-200 dark:border-slate-800">
                    <button
                        onClick={() => setStep(step - 1)}
                        disabled={step === 0 || isCreating}
                        className="px-4 py-2 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                    >
                        Back
                    </button>
                    {step < 3 ? (
                        <button
                            onClick={() => setStep(step + 1)}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg flex items-center gap-2"
                        >
                            Next <ArrowRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={handleCreate}
                            disabled={isCreating}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                        >
                            <Check className="w-4 h-4" /> Create Workflow
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
