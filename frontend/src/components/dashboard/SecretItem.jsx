import React, { useState } from 'react';
import { Lock, Unlock, Copy, Check, FileText, Share2, Trash2, Edit2, FileSignature, BadgeCheck, AlertTriangle, Download } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { verifySignaturePQC } from '../../utils/crypto';
import API_ENDPOINTS from '../../config';

const SecretItem = ({ secret, decryptedContent, onDecrypt, onEdit, onDelete, onShare, authType }) => {
    const { theme } = useTheme();
    const [verificationResult, setVerificationResult] = useState(null);
    const [verifying, setVerifying] = useState(false);

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        // Toast logic handled by parent or simplified here (could add local 'copied' state)
        alert("Copied to clipboard!");
    };

    const handleVerify = async (docData) => {
        setVerifying(true);
        try {
            if (!docData.signature || !docData.signerPublicKey) {
                alert("Invalid document format for verification.");
                setVerifying(false);
                return;
            }

            const isValid = await verifySignaturePQC(docData.content, docData.signature, docData.signerPublicKey);

            // Resolve User (Optional)
            let signerInfo = null;
            try {
                const res = await fetch(API_ENDPOINTS.USERS.RESOLVE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: docData.signerPublicKey })
                });
                if (res.ok) signerInfo = await res.json();
            } catch (e) { }

            setVerificationResult({
                valid: isValid,
                signer: signerInfo,
                publicKey: docData.signerPublicKey
            });
        } catch (e) {
            alert("Verification failed: " + e.message);
        } finally {
            setVerifying(false);
        }
    };

    const handleDownload = (jsonContent) => {
        try {
            const fileData = JSON.parse(jsonContent);
            if (fileData.type !== 'file') return;
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

    // Render Logic
    let content = decryptedContent;
    let isSignedDoc = false;
    let signedPayload = null;

    if (content) {
        try {
            const parsed = JSON.parse(content);
            if (parsed.signature && parsed.signerPublicKey && parsed.content) {
                isSignedDoc = true;
                signedPayload = parsed;
                content = parsed.content;
            }
        } catch (e) { }
    }

    // Inner Content (File/Text)
    let innerDisplay = content;
    let isFile = false;
    let fileData = null;

    if (content) {
        try {
            const parsed = JSON.parse(content);
            if (parsed && parsed.type === 'file' && parsed.content) {
                isFile = true;
                fileData = parsed;
                innerDisplay = (
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
        } catch (e) { }
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${secret.type === 'file'
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                            : secret.type === 'signed_document'
                                ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                                : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                        }`}>
                        {secret.type === 'file' ? <FileText className="w-5 h-5" /> :
                            secret.type === 'signed_document' ? <FileSignature className="w-5 h-5" /> :
                                <Lock className="w-5 h-5" />}
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{secret.name}</h3>
                        <p className="text-xs text-slate-500 capitalize">{secret.type.replace('_', ' ')}</p>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={() => onShare(secret)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-500 transition-colors" title="Share">
                        <Share2 className="w-4 h-4" />
                    </button>
                    {!decryptedContent && (
                        <button onClick={() => onEdit(secret)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-500 transition-colors" title="Edit (Must Decrypt first)">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                    {/* If decrypted, edit button usually triggers modal with content, handled by parent logic */}
                    {decryptedContent && (
                        <button onClick={() => onEdit(secret)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-500 transition-colors" title="Edit">
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={() => onDelete(secret.id)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-500 transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {decryptedContent ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    {isSignedDoc && (
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-between">
                            <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
                                <FileSignature className="w-5 h-5" />
                                <span className="font-medium text-sm">Digitally Signed Document</span>
                            </div>
                            <button
                                onClick={() => handleVerify(signedPayload)}
                                disabled={verifying}
                                className="text-xs px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors disabled:opacity-50"
                            >
                                {verifying ? "Verifying..." : "Verify Signature"}
                            </button>
                        </div>
                    )}

                    {verificationResult && isSignedDoc && verificationResult.publicKey === signedPayload.signerPublicKey && (
                        <div className={`p-3 rounded-lg border ${verificationResult.valid ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                            <div className="flex items-start gap-3">
                                {verificationResult.valid ? (
                                    <BadgeCheck className="w-5 h-5 text-emerald-500 mt-0.5" />
                                ) : (
                                    <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                                )}
                                <div>
                                    <h4 className={`text-sm font-semibold ${verificationResult.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                        {verificationResult.valid ? "Signature Valid" : "Signature Invalid"}
                                    </h4>
                                    {verificationResult.valid && (
                                        <div className="text-xs text-emerald-600 dark:text-emerald-500 mt-1 space-y-1">
                                            <p>Signed by: <span className="font-semibold">{verificationResult.signer ? verificationResult.signer.username : "Unknown User"}</span></p>
                                            <p className="font-mono opacity-80 break-all">{verificationResult.publicKey}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div
                        style={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#f8fafc', borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0', color: theme === 'dark' ? '#cbd5e1' : '#1e293b' }}
                        className="p-4 rounded-lg border font-mono text-sm whitespace-pre-wrap break-all relative group"
                    >
                        {innerDisplay}
                        {!isFile && (
                            <button
                                onClick={() => handleCopy(content)}
                                className="absolute top-2 right-2 p-1.5 bg-slate-200 dark:bg-slate-800 rounded hover:bg-slate-300 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy content"
                            >
                                <Copy className="w-3 h-3 text-slate-500" />
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mt-4">
                    <button
                        onClick={() => onDecrypt(secret)}
                        className="w-full py-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-slate-400 hover:text-indigo-500 hover:border-indigo-300 dark:hover:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition-all flex flex-col items-center justify-center gap-2 group"
                    >
                        <Lock className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">Click to Decrypt</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default SecretItem;
