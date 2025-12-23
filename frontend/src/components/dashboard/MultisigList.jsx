import React from 'react';
import { Loader2, FolderGit2, Check, Clock, AlertTriangle } from 'lucide-react';

const MultisigList = ({ workflows, onSelect, onCreate, loading }) => {
    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (workflows.length === 0) {
        return (
            <div className="text-center py-16 px-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FolderGit2 className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Workflows</h3>
                <p className="text-slate-500 mb-4">Create a multisig workflow to require multiple approvals.</p>
                <button
                    onClick={onCreate}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
                >
                    Create Workflow
                </button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map(wf => {
                const completed = wf.signers.filter(s => s.has_signed).length;
                const total = wf.signers.length;
                const progress = (completed / total) * 100;

                return (
                    <button
                        key={wf.id}
                        onClick={() => onSelect(wf)}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm hover:shadow-md transition-all text-left group"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">{wf.name}</h3>
                                <p className="text-xs text-slate-500">ID: {wf.id}</p>
                            </div>
                            {wf.status === 'completed' ? (
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Done
                                </span>
                            ) : wf.status === 'failed' ? (
                                <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Failed
                                </span>
                            ) : (
                                <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Pending
                                </span>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>Progress</span>
                                <span>{completed}/{total} Signatures</span>
                            </div>
                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${wf.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                            <span>Created {new Date(wf.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{wf.signers.length} Signers</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};

export default MultisigList;
