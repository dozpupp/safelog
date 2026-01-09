import React from 'react';
import { useMessenger } from '../hooks/useMessenger';
import { Lock, FolderGit2 } from 'lucide-react';

export default function DashboardSidebar({
    currentView,
    setCurrentView,
    secrets,
    workflows,
    sharedSecrets,
    decryptedSecrets,
    actionRequiredCount,
    onRefreshSecrets // New prop
}) {
    // Only this component will re-render when messenger events occur (typing, new message)
    const { unreadCount, lastEvent } = useMessenger();

    // Listen for Real-time Events safely within this isolated component
    const lastProcessedEventId = React.useRef(null);

    React.useEffect(() => {
        if (lastEvent && lastEvent.type === 'SECRET_SHARED') {
            // Prevent infinite loop: Only process if this is a NEW event
            // Assuming lastEvent has a unique 'id' or 'timestamp'. 
            // If not, we can use the object reference itself if it's immutable, but ID is safer.
            // Let's check the context file, but usually events have IDs.
            // Based on context below, message events have IDs. generic events might not?
            // If explicit ID missing, we can use timestamp or just JSON.stringify as a fallback key
            const eventId = lastEvent.message?.id || lastEvent.timestamp || JSON.stringify(lastEvent);

            if (lastProcessedEventId.current !== eventId) {
                console.log("Real-time Update: Secret Shared event received in Sidebar");
                lastProcessedEventId.current = eventId;
                if (onRefreshSecrets) {
                    onRefreshSecrets();
                }
            }
        }
    }, [lastEvent, onRefreshSecrets]);

    const navItems = [
        { id: 'secrets', label: 'Secrets', icon: <Lock className="w-4 h-4" /> },
        { id: 'multisig', label: 'Multisig', icon: <FolderGit2 className="w-4 h-4" /> },
    ];

    return (
        <div className="lg:col-span-1 space-y-6">
            <nav className="space-y-1">
                {navItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setCurrentView(item.id)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium ${currentView === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'}`}
                    >
                        <div className="flex items-center gap-3">
                            {item.icon}
                            {item.label}
                        </div>
                        {item.id === 'multisig' && actionRequiredCount > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                {actionRequiredCount}
                            </span>
                        )}
                        {item.id === 'secrets' && (
                            (() => {
                                const unreadSecrets = sharedSecrets.filter(s => !decryptedSecrets[`shared_${s.id}`]).length;
                                return unreadSecrets > 0 ? (
                                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                        {unreadSecrets}
                                    </span>
                                ) : null;
                            })()
                        )}
                    </button>
                ))}
                {/* Messenger Tab */}
                <button
                    onClick={() => setCurrentView('messenger')}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all font-medium ${currentView === 'messenger' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-900'}`}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-lg">💬</span> Messenger
                    </div>
                    {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {unreadCount}
                        </span>
                    )}
                </button>
            </nav>

            {/* Quick Stats or Info */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800">
                <h4 className="font-bold text-slate-900 dark:text-white mb-4 text-sm uppercase tracking-wider">Storage</h4>
                <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Secrets</span>
                        <span className="font-medium text-slate-900 dark:text-white">{secrets.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Multisig</span>
                        <span className="font-medium text-slate-900 dark:text-white">{workflows.length}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
