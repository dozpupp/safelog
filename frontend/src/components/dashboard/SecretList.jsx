import React from 'react';
import { Loader2 } from 'lucide-react';
import SecretItem from './SecretItem';

const SecretList = ({ secrets, decryptedSecrets, onDecrypt, onEdit, onDelete, onShare, loading, authType }) => {
    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (secrets.length === 0) {
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
                    authType={authType}
                />
            ))}
        </div>
    );
};

export default SecretList;
