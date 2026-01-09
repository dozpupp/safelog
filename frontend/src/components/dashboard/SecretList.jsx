import React from 'react';
import { Loader2 } from 'lucide-react';
import SecretItem from './SecretItem';

const SecretList = ({ secrets, sharedSecrets = [], decryptedSecrets, onDecrypt, onEdit, onDelete, onShare, onRevoke, onViewDetails, loading, authType }) => {
    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (secrets.length === 0 && sharedSecrets.length === 0) {
        return (
            <div className="text-center py-16 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🔒</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No secrets found</h3>
                <p className="text-slate-500">Create your first secret to get started.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {secrets.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {secrets.map(secret => (
                        <SecretItem
                            key={secret.id}
                            secret={secret}
                            decryptedContent={decryptedSecrets[secret.id]}
                            onDecrypt={onDecrypt}
                            onEdit={onEdit}
                            onDelete={onDelete}
                            onShare={onShare}
                            onViewDetails={onViewDetails}
                            authType={authType}
                        />
                    ))}
                </div>
            )}

            {sharedSecrets.length > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        <span className="text-xl">📩</span> Shared with me
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sharedSecrets.map(grant => (
                            <SecretItem
                                key={`shared_${grant.id}`}
                                secret={{
                                    ...grant.secret,
                                    id: grant.secret.id, // Ensure ID is preserved for display/keys
                                    isShared: true, // Marker for UI
                                    encrypted_key: grant.encrypted_key // The key for ME (so I can reshare)
                                }}
                                decryptedContent={decryptedSecrets[`shared_${grant.id}`]}
                                onDecrypt={() => onDecrypt(grant, true)} // Pass boolean true for isShared
                                onEdit={(s) => { alert("Cannot edit shared secrets."); }}
                                onDelete={() => onRevoke(grant.id, true)}
                                onShare={() => { /* Re-share logic? */ }}
                                authType={authType}
                                isSharedView={true}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecretList;
