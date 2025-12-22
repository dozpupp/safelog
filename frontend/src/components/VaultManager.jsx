import React, { useState, useEffect } from 'react';
import { usePQC } from '../context/PQCContext';
import { useAuth } from '../context/AuthContext';
import { X, Plus, Trash2, Download, Upload, User, Check, RefreshCw } from 'lucide-react';

export default function VaultManager({ onClose }) {
    const {
        getVaultAccounts,
        addVaultAccount,
        switchVaultAccount,
        deleteVaultAccount,
        exportVault,
        importVault,
        pqcAccount
    } = usePQC();

    const [accounts, setAccounts] = useState([]);
    const [view, setView] = useState('list'); // list | create | import
    const [newName, setNewName] = useState('');
    const [importJson, setImportJson] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        refresh();
    }, [pqcAccount]); // access/refresh when active account changes

    const refresh = () => {
        setAccounts(getVaultAccounts());
    };

    const handleCreate = async () => {
        try {
            if (!newName) return;
            await addVaultAccount(newName);
            setMsg({ type: 'success', text: 'Account created' });
            setNewName('');
            setView('list');
            refresh();
        } catch (e) {
            setMsg({ type: 'error', text: e.message });
        }
    };

    const handleSwitch = async (id) => {
        try {
            await switchVaultAccount(id);
            setMsg({ type: 'success', text: 'Switched. Logging out...' });
            setTimeout(onClose, 500);

        } catch (e) {
            setMsg({ type: 'error', text: e.message });
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Are you sure? This cannot be undone.")) return;
        try {
            await deleteVaultAccount(id);
            setMsg({ type: 'success', text: 'Account deleted' });
            refresh();
        } catch (e) {
            setMsg({ type: 'error', text: e.message });
        }
    };

    const handleExport = async () => {
        try {
            const data = await exportVault();
            // Trigger download
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `safelog-vault-${Date.now()}.json`;
            a.click();
            setMsg({ type: 'success', text: 'Vault exported' });
        } catch (e) {
            setMsg({ type: 'error', text: e.message });
        }
    };

    const handleImport = async () => {
        try {
            const count = await importVault(importJson);
            setMsg({ type: 'success', text: `Imported ${count} accounts` });
            setView('list');
            refresh();
        } catch (e) {
            setMsg({ type: 'error', text: e.message });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh] mx-4">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <User className="w-5 h-5" /> Local Vault Manager
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {msg.text && (
                        <div className={`mb-4 p-3 rounded-lg text-sm ${msg.type === 'error' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {msg.text}
                        </div>
                    )}

                    {view === 'list' && (
                        <div className="space-y-3">
                            {accounts.map(acc => (
                                <div key={acc.id} className={`p-4 rounded-xl border flex items-center justify-between group transition-all ${acc.isActive ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                                    <div>
                                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                            {acc.name}
                                            {acc.isActive && <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full">Active</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono mt-1">ID: {acc.id.substring(0, 8)}...</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!acc.isActive && (
                                            <button
                                                onClick={() => handleSwitch(acc.id)}
                                                className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                                                title="Switch to Account"
                                            >
                                                <RefreshCw className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDelete(acc.id)}
                                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            title="Delete Account"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {view === 'create' && (
                        <div className="space-y-4">
                            <h3 className="font-semibold dark:text-white">Create New Account</h3>
                            <input
                                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
                                placeholder="Account Name"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button onClick={handleCreate} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-500">Create</button>
                                <button onClick={() => setView('list')} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg font-medium">Cancel</button>
                            </div>
                        </div>
                    )}

                    {view === 'import' && (
                        <div className="space-y-4">
                            <h3 className="font-semibold dark:text-white">Import Vault (JSON)</h3>
                            <textarea
                                className="w-full h-32 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono dark:text-white"
                                placeholder="Paste JSON content here..."
                                value={importJson}
                                onChange={e => setImportJson(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button onClick={handleImport} className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-medium hover:bg-emerald-500">Import</button>
                                <button onClick={() => setView('list')} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 py-2 rounded-lg font-medium">Cancel</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl flex justify-between gap-2">
                    {view === 'list' && (
                        <>
                            <button onClick={() => setView('create')} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:border-emerald-500 transition-colors dark:text-white">
                                <Plus className="w-4 h-4 text-emerald-500" /> New Account
                            </button>
                            <div className="flex gap-2">
                                <button onClick={handleExport} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:border-indigo-500 transition-colors dark:text-white" title="Export Vault">
                                    <Download className="w-4 h-4 text-indigo-500" />
                                </button>
                                <button onClick={() => setView('import')} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:border-indigo-500 transition-colors dark:text-white" title="Import Vault">
                                    <Upload className="w-4 h-4 text-indigo-500" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
