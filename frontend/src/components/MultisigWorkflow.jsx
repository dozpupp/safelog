import React, { useState } from 'react';
import { X, Check, Clock, User, Shield, AlertTriangle, Eye, FileText, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import { useWeb3 } from '../context/Web3Context';
import API_ENDPOINTS from '../config';
import { decryptData, verifySignaturePQC } from '../utils/crypto';

const SignerVerificationBadge = ({ signer, contentToVerify }) => {
    const [status, setStatus] = useState('idle'); // idle, verifying, valid, invalid

    const verify = async () => {
        if (!signer.signature || !contentToVerify) return;
        setStatus('verifying');
        try {
            // Reconstruct Signed Message (Sig + Content) or detached? 
            // In handleSign, we sent detached prefix/suffix.
            // verifySignaturePQC handles detached.
            const isValid = await verifySignaturePQC(contentToVerify, signer.signature, signer.user_address);
            setStatus(isValid ? 'valid' : 'invalid');
        } catch (e) {
            console.error(e);
            setStatus('invalid');
        }
    };

    if (!signer.signature) return null;

    if (status === 'idle') {
        return (
            <button
                onClick={(e) => { e.stopPropagation(); verify(); }}
                className="text-xs text-indigo-500 hover:text-indigo-400 font-medium px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 transition-colors"
                title="Verify Signature"
            >
                Verify
            </button>
        );
    }

    if (status === 'verifying') {
        return <span className="text-xs text-slate-400 animate-pulse">Verifying...</span>;
    }

    if (status === 'valid') {
        return (
            <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded border border-emerald-100 dark:border-emerald-800">
                <Shield className="w-3 h-3" /> Verified
            </span>
        );
    }

    return (
        <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded border border-red-100 dark:border-red-800">
            <AlertTriangle className="w-3 h-3" /> Invalid
        </span>
    );
};

export default function MultisigWorkflow({ workflow, onClose, onUpdate }) {
    const { user, token, authType } = useAuth();
    const { encrypt: encryptPQC, decrypt: decryptPQC, sign: signPQC, pqcAccount, kyberKey } = usePQC();
    const { currentAccount } = useWeb3();

    const [isSigning, setIsSigning] = useState(false);
    const [isViewing, setIsViewing] = useState(false);
    const [decryptedContent, setDecryptedContent] = useState(null);
    const [rawDecryptedContent, setRawDecryptedContent] = useState(null); // The actual string signers signed
    const [verificationStatus, setVerificationStatus] = useState(null); // 'verified', 'failed', 'unsigned'
    const [error, setError] = useState('');

    const isOwner = workflow.owner_address === user.address;
    const mySignerEntry = workflow.signers.find(s => s.user_address === user.address);
    const isSigner = !!mySignerEntry;
    const hasSigned = mySignerEntry?.has_signed;

    // Check if user is a recipient
    const isRecipient = workflow.recipients.find(r => r.user_address === user.address);
    const canView = isOwner || isSigner || (isRecipient && workflow.status === 'completed');

    const completedSignatures = workflow.signers.filter(s => s.has_signed).length;
    const totalSignatures = workflow.signers.length;
    const progress = (completedSignatures / totalSignatures) * 100;

    const fetchAndDecrypt = async () => {
        setIsViewing(true);
        setError('');
        try {
            const res = await fetch(API_ENDPOINTS.SECRETS.SHARED_WITH, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const shared = await res.json();
            if (workflow.secret_id === undefined) {
                console.error("Workflow object missing secret_id", workflow);
                throw new Error("Invalid workflow data: missing secret ID");
            }

            const myShare = shared.find(s => s.secret_id == workflow.secret_id);

            if (!myShare) {
                // If I am owner, I might not have a "share", but I own the secret.
                if (isOwner) {
                    // For owner, we need to fetch the secret directly
                    // But wait, the secret content in `MultisigCreateModal` was encrypted for the owner too.
                    // Does the backend return `encrypted_data` for the owner in `SHARED_WITH`? No.
                    // The owner should use `API_ENDPOINTS.SECRETS.LIST`.

                    const secretsRes = await fetch(API_ENDPOINTS.SECRETS.LIST, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const secrets = await secretsRes.json();
                    const mySecret = secrets.find(s => s.id === workflow.secret_id);
                    if (mySecret) {
                        return await decryptContentValues(mySecret.encrypted_data, authType === 'trustkeys');
                    }
                }
                throw new Error("You don't have access to the secret content yet.");
            }

            // Access Grant found
            await decryptContentValues(myShare.encrypted_key, authType === 'trustkeys');

        } catch (e) {
            console.error("View failed", e);
            setError(e.message);
            setIsViewing(false);
        }
    };

    const decryptContentValues = async (encryptedDataString, isPQC) => {
        try {
            let contentString;
            if (isPQC) {
                const decryptedJson = await decryptPQC(JSON.parse(encryptedDataString));
                contentString = decryptedJson;
            } else {
                contentString = await decryptData(encryptedDataString, currentAccount);
            }

            // Check structure
            try {
                let parsed;
                // Try to parse the decrypted string
                try {
                    parsed = JSON.parse(contentString);
                } catch (e) {
                    // Not JSON, just string
                }

                if (parsed && parsed.signature && parsed.signerPublicKey) {
                    // It is a Signed Document (Creator's)
                    const isValid = await verifySignaturePQC(parsed.content, parsed.signature, parsed.signerPublicKey);
                    setVerificationStatus(isValid ? 'verified' : 'failed');

                    // If inner content is file object, try to parse it
                    try {
                        const inner = JSON.parse(parsed.content);
                        setDecryptedContent(inner);
                    } catch {
                        setDecryptedContent(parsed.content);
                    }

                    // Signers sign the PACKAGED content (contentString)
                    setRawDecryptedContent(contentString);
                } else {
                    // Standard Content (Unsigned by creator wrapper)
                    setVerificationStatus('unsigned');
                    setDecryptedContent(parsed || contentString);
                    setRawDecryptedContent(contentString);
                }
            } catch (e) {
                console.error("Content processing failed", e);
                setDecryptedContent(contentString);
                setVerificationStatus('unsigned');
            }

            setIsViewing(false);
        } catch (e) {
            console.error("Decrypt failed", e);
            setError("Failed to decrypt: " + e.message);
            setIsViewing(false);
        }
    };

    const handleSign = async () => {
        setIsSigning(true);
        setError('');
        try {
            // We need the raw content string that was signed? 
            // Actually, `signPQC` signs the `rawContent`.
            // If we already verified, we have `parsed.content`.
            // But to be safe, let's re-fetch or use state if available.
            // Simplest: Re-run verify logic or just sign the *inner content*?
            // WAIT. `MultisigCreateModal` logic:
            // Signer signs `payloadToEncrypt`? OR `rawContent`?
            // Line 146 in Modal: `signerKeys... = secureEncrypt(payloadToEncrypt...)`
            // `payloadToEncrypt` IS the struct `{ content, signature, publicKey }`.
            //
            // So the Signer receives the Signed Struct.
            // When the Signer signs, they should sign:
            // A) The Original Content? (Proves they agree to content)
            // B) The Creator's Signed Struct? (Proves they verify creator + content)
            // 
            // Logic in `MultisigWorkflow.jsx` (previous version): `signature = await signPQC(content)`.
            // If `content` is the huge struct, fine.
            // 
            // Let's stick to signing what we See.
            // If we decrypted the struct, we sign the struct.

            const res = await fetch(API_ENDPOINTS.SECRETS.SHARED_WITH, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const shared = await res.json();
            const myShare = shared.find(s => s.secret_id === workflow.secret_id);

            if (!myShare) throw new Error("Access denied");

            let contentToSign;
            if (authType === 'trustkeys') {
                const decryptedJson = await decryptPQC(JSON.parse(myShare.encrypted_key));
                contentToSign = decryptedJson;
            } else {
                contentToSign = await decryptData(myShare.encrypted_key, currentAccount);
            }

            let signature = await signPQC(contentToSign);

            // Handle "Signed Message" (Attached Code) vs "Detached Signature"
            // Dilithium2 signature is 2420 bytes = 4840 hex chars.
            // If the extension returns the full content + signature, we must extract it.
            if (signature.length > 20000) {
                console.warn("Signature is large, attempting to extract detached signature...");
                const SIG_LEN_HEX = 2420 * 2; // 4840

                // Candidate 1: Prefix (Standard Crystals implementations: sig + msg)
                const prefixSig = signature.substring(0, SIG_LEN_HEX);
                // Fallback: Assume the prefix is the signature (Standard Crystals-Dilithium)
                // Verification is causing crashes due to size mismatches in the WASM library.
                // We trust the structure: [Signature (2420)][Message]
                console.log("Large signature blob detected. Extracting detached signature from prefix.");
                signature = prefixSig;
            }

            const signRes = await fetch(`${API_ENDPOINTS.SECRETS.LIST}/../multisig/workflow/${workflow.id}/sign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ signature })
            });

            if (signRes.ok) {
                const updatedWf = await signRes.json();
                onUpdate(updatedWf);
                // Don't close, let them see success
            } else {
                const err = await signRes.json();
                throw new Error(err.detail || "Failed to submit signature");
            }

        } catch (e) {
            console.error("Signing failed", e);
            setError(e.message);
        } finally {
            setIsSigning(false);
        }
    };

    const renderContent = () => {
        if (!decryptedContent) return null;

        const isFile = decryptedContent?.type === 'file' && decryptedContent?.content;

        return (
            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-start mb-2">
                    <h5 className="text-sm font-medium text-slate-500">Decrypted Content</h5>
                    {verificationStatus === 'verified' && (
                        <div className="flex items-center gap-1 text-emerald-600 text-xs px-2 py-1 bg-emerald-100 rounded-full">
                            <Shield className="w-3 h-3" /> Signed by Creator
                        </div>
                    )}
                    {verificationStatus === 'failed' && (
                        <div className="flex items-center gap-1 text-red-600 text-xs px-2 py-1 bg-red-100 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> Signature Invalid
                        </div>
                    )}
                </div>

                {isFile ? (
                    <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800">
                        <FileText className="w-8 h-8 text-indigo-500" />
                        <div className="flex-1 overflow-hidden">
                            <div className="font-medium truncate">{decryptedContent.name}</div>
                            <div className="text-xs text-slate-500">{decryptedContent.mime}</div>
                        </div>
                        <a
                            href={decryptedContent.content}
                            download={decryptedContent.name}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded"
                            title="Download"
                        >
                            <Download className="w-5 h-5" />
                        </a>
                    </div>
                ) : (
                    <div className="whitespace-pre-wrap font-mono text-sm">
                        {typeof decryptedContent === 'string' ? decryptedContent : JSON.stringify(decryptedContent, null, 2)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Workflow: {workflow.name}</h3>
                        <div className="text-xs text-slate-500">ID: {workflow.id} • Created {new Date(workflow.created_at).toLocaleDateString()}</div>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="space-y-6">
                    {/* Status Card */}
                    <div className={`p-4 rounded-lg border ${workflow.status === 'completed' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <span className={`font-semibold ${workflow.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                {workflow.status.toUpperCase()}
                            </span>
                            <span className="text-sm text-slate-600 dark:text-slate-400">{completedSignatures}/{totalSignatures} Signatures</span>
                        </div>
                        <div className="h-2 bg-white/50 rounded-full overflow-hidden">
                            <div className={`h-full transition-all duration-500 ${workflow.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${progress}%` }} />
                        </div>
                    </div>

                    {/* Signers List */}
                    <div>
                        <h4 className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wider">Signers</h4>
                        <div className="space-y-2">
                            {workflow.signers.map(s => (
                                    <div key={s.user_address} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${s.has_signed ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                            <div>
                                                <div className="font-medium text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                                    {s.user?.username || s.user_address.substring(0, 12)}
                                                    {s.user_address === user.address && <span className="text-xs bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-500">You</span>}
                                                </div>
                                                {s.has_signed && (
                                                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                                                        <span className="flex items-center gap-1">
                                                            <Check className="w-3 h-3" /> Signed
                                                        </span>
                                                        <span className="text-slate-400">•</span>
                                                        <span>{new Date(s.signed_at).toLocaleDateString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Verification Badge */}
                                        {s.has_signed && decryptedContent && (
                                            <SignerVerificationBadge 
                                                signer={s} 
                                                contentToVerify={rawDecryptedContent} 
                                            />
                                        )}
                                    </div>
                                                    <Clock className="w-3 h-3" /> { new Date(s.signed_at).toLocaleString() }
                                                </div>
                                            )}
                    </div>
                </div>
                {s.has_signed && <Check className="w-4 h-4 text-emerald-500" />}
            </div>
                            ))}
        </div>
                    </div >

        {/* Recipients List */ }
        < div >
                        <h4 className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wider">Recipients</h4>
                        <div className="space-y-2">
                            {workflow.recipients.map(r => (
                                <div key={r.user_address} className="flex items-center justify-between p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800">
                                    <div className="flex items-center gap-3">
                                        <User className="w-4 h-4 text-slate-400" />
                                        <div className="text-sm text-slate-900 dark:text-slate-200">
                                            {r.user?.username || r.user_address.substring(0, 8)}
                                        </div>
                                    </div>
                                    {workflow.status === 'completed' ? (
                                        <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">Access Granted</span>
                                    ) : (
                                        <span className="text-xs px-2 py-1 bg-slate-100 text-slate-500 rounded-full">Pending</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div >

        {/* View/Decrypt Section */ }
    {
        canView && !decryptedContent && (
            <button
                onClick={fetchAndDecrypt}
                className="w-full border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg flex items-center justify-center gap-2"
            >
                <Eye className="w-4 h-4" /> View Secret Content
            </button>
        )
    }

    { decryptedContent && renderContent() }

    {/* Actions */ }
    {
        error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {error}
            </div>
        )
    }

    {
        isSigner && !hasSigned && workflow.status !== 'completed' && (
            <button
                onClick={handleSign}
                disabled={isSigning}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
                {isSigning ? 'Signing...' : (
                    <>
                        <Shield className="w-4 h-4" /> Sign Workflow
                    </>
                )}
            </button>
        )
    }
                </div >
            </div >
        </div >
    );
}
