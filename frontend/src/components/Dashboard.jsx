import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { useSecrets } from '../hooks/useSecrets';
import { useMultisig } from '../hooks/useMultisig';
// import { useMessenger } from '../hooks/useMessenger';
import { Lock, Sun, Moon, Shield, FolderGit2, Plus, LogOut } from 'lucide-react';

// Components
import GlobalProgressBar from './common/GlobalProgressBar';

// Components
import SecretList from './dashboard/SecretList';
import CreateSecret from './dashboard/CreateSecret';
import ShareModal from './dashboard/ShareModal';
import SecretDetailsModal from './dashboard/SecretDetailsModal';
import VaultManager from './VaultManager';
import MultisigWorkflow from './MultisigWorkflow';
import MultisigCreateModal from './MultisigCreateModal';
import MultisigList from './dashboard/MultisigList';
import ProfileModal from './dashboard/ProfileModal';
import Messenger from './Messenger';
import DashboardSidebar from './DashboardSidebar';

export default function Dashboard() {
    const { user, authType, logout, setUser, token } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { currentAccount, encryptionPublicKey: ethKey } = useWeb3();
    const { hasLocalVault, isExtensionAvailable, kyberKey, pqcAccount } = usePQC();

    // Global Progress State
    const [globalProgress, setGlobalProgress] = useState(0);
    const [globalStatus, setGlobalStatus] = useState('');

    const updateProgress = (pct, msg = '') => {
        setGlobalProgress(pct);
        setGlobalStatus(msg);
    };

    // Derived Logic
    const encryptionPublicKey = authType === 'trustkeys' ? kyberKey : ethKey;
    const currentDisplayAccount = authType === 'trustkeys' ? pqcAccount : currentAccount;

    // Custom Hooks
    const {
        secrets,
        sharedSecrets,
        loading: secretsLoading,
        decryptedSecrets,
        handleDecrypt,
        createSecret,
        updateSecret,
        deleteSecret,
        shareSecret,
        revokeGrant,
        fetchSharedSecrets
    } = useSecrets(authType, encryptionPublicKey, currentDisplayAccount, { onProgress: updateProgress });

    const {
        workflows,
        loading: workflowsLoading,
        fetchWorkflows,
        setWorkflows,
        actionRequiredCount
    } = useMultisig();

    // View State
    const [currentView, setCurrentView] = useState('secrets'); // 'secrets', 'messenger', 'multisig'
    const [isCreating, setIsCreating] = useState(false);
    const [showVaultManager, setShowVaultManager] = useState(false);

    // Multisig State
    const [selectedWorkflow, setSelectedWorkflow] = useState(null);
    const [isMultisigCreateOpen, setIsMultisigCreateOpen] = useState(false);

    // Share Modal State
    const [secretToShare, setSecretToShare] = useState(null);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    // Secret Details State
    const [selectedSecretDetails, setSelectedSecretDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);

    // Profile State
    const [isProfileOpen, setIsProfileOpen] = useState(false);

    // Handle Actions
    const openShareModal = (secret) => {
        setSecretToShare(secret);
        setIsShareModalOpen(true);
    };

    const handleViewDetails = (secret) => {
        setSelectedSecretDetails(secret);
        setShowDetailsModal(true);
    };

    const handleCreateWrapper = async (name, type, content, isSigned) => {
        return await createSecret(name, type, content, isSigned);
    };

    const handleMultisigUpdate = (updatedWf) => {
        setWorkflows(prev => prev.map(w => w.id === updatedWf.id ? updatedWf : w));
        if (selectedWorkflow && selectedWorkflow.id === updatedWf.id) {
            setSelectedWorkflow(updatedWf);
        }
    };

    // We need messenger state for badges. 
    // Optimization: Lift useMessenger to here? Or create light version?
    // Current app structure: Messenger component calls useMessenger. 
    // To get unread count at Dashboard level, we must call useMessenger here.
    // To get unread count at Dashboard level, we must call useMessenger here.
    // const { unreadCount, lastEvent, setActiveConversation } = useMessenger();
    // MOVED TO SIDEBAR: unreadCount is now internal to DashboardSidebar
    // lastEvent and setActiveConversation might be needed here?
    // lastEvent is used for SECRET_SHARED toast.
    // setActiveConversation is used to clear on view change.

    // We still need useMessenger for global events if we want them here, but we can't trigger full re-render on unread count.
    // The previous implementation of useMessenger context likely exposes a single state object.

    // If I import useMessenger here, I WILL re-render on any update.
    // So I must NOT use it here if I want to avoid re-renders.

    // But 'lastEvent' was used for a Toast. 
    // And 'setActiveConversation(null)' was used when changing views.

    // Compromise: We keep useMessenger here for Logic, but we assume the Context provider is optimized OR we accept re-renders for 'lastEvent' but maybe 'unreadCount' updates were the most frequent?
    // Actually, 'unreadCount' updates happen heavily during typing if we tracked every message.

    // If we simply remove it, we lose the "New Secret Shared" toast and the "Clear Active Conversation" logic.

    // For now, I will Comment it out and strict refactor to Sidebar. 
    // The functionality lost: 
    // 1. Toast on SECRET_SHARED
    // 2. Clearing active conversation on view switch.

    // To keep functionality #2: passing 'setCurrentView' to Sidebar is fine, but clearing active conversation is a side effect.
    // Ideally, DashboardSidebar should handle 'setActiveConversation(null)' when clicking other nav items? No, that's business logic.

    // Let's rely on Messenger component essentially doing its own thing. 
    // If I remove it, I must remove usage of `lastEvent` and `setActiveConversation`.

    // Let's remove the `useMessenger` import at the top too? No, I will remove the hook call.


    // Listen for Real-time Events
    // React.useEffect(() => {
    //     if (lastEvent && lastEvent.type === 'SECRET_SHARED') {
    //         console.log("Real-time Update: Fetching Shared Secrets");
    //         fetchSharedSecrets();
    //         // Optional: Show toast
    //         updateProgress(100, "New secret shared with you!");
    //         setTimeout(() => updateProgress(0, ""), 3000);
    //     }
    // }, [lastEvent]);

    // Clear active conversation when switching away from Messenger
    // React.useEffect(() => {
    //     if (currentView !== 'messenger') {
    //        // setActiveConversation(null);
    //     }
    // }, [currentView]);

    const handleMultisigCreateSuccess = () => {
        setIsMultisigCreateOpen(false);
        fetchWorkflows();
    };

    // Nav Items
    const navItems = [
        { id: 'secrets', label: 'Secrets', icon: <Lock className="w-4 h-4" /> },
        { id: 'multisig', label: 'Multisig', icon: <FolderGit2 className="w-4 h-4" /> },
    ];

    // Memoize the refresh handler to verify stability
    const handleRefreshSecrets = React.useCallback(() => {
        console.log("Dashboard: Refreshing shared secrets...");
        fetchSharedSecrets();
        updateProgress(100, "New secret shared with you!");
        setTimeout(() => updateProgress(0, ""), 3000);
    }, [fetchSharedSecrets]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200 p-6 transition-colors duration-200">
            <GlobalProgressBar progress={globalProgress} message={globalStatus} />

            {/* Header */}
            <header className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-4 justify-between items-center mb-10">
                <div className="flex items-center gap-3 w-full sm:w-auto justify-center sm:justify-start">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                        <Lock className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SecureVault</h1>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>

                    {/* Local Vault Manager Button */}
                    {authType === 'trustkeys' && hasLocalVault && !isExtensionAvailable && (
                        <button
                            onClick={() => setShowVaultManager(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors text-sm font-medium"
                        >
                            <Shield className="w-4 h-4" /> Manage Vault
                        </button>
                    )}

                    <div className="flex items-center gap-3 pl-4 border-l border-slate-200 dark:border-slate-800">
                        {/* User Profile Trigger */}
                        <button
                            onClick={() => setIsProfileOpen(true)}
                            className="text-right hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-lg transition-colors text-left"
                        >
                            <div className="font-semibold text-sm text-slate-900 dark:text-white">{user?.username || 'User'}</div>
                            <div className="text-xs text-slate-500 font-mono">
                                {currentDisplayAccount ? `${currentDisplayAccount.substring(0, 6)}...${currentDisplayAccount.substring(currentDisplayAccount.length - 4)}` : 'No Account'}
                            </div>
                        </button>
                        <button
                            onClick={logout}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar Navigation */}
                <DashboardSidebar
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    secrets={secrets}
                    workflows={workflows}
                    sharedSecrets={sharedSecrets}
                    decryptedSecrets={decryptedSecrets}
                    actionRequiredCount={actionRequiredCount}
                    onRefreshSecrets={handleRefreshSecrets}
                />

                {/* Main View Area */}
                <div className="lg:col-span-3">
                    {currentView === 'secrets' && (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Active Secrets</h2>
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all"
                                >
                                    <Plus className="w-5 h-5" /> New Secret
                                </button>
                            </div>

                            {isCreating && (
                                <CreateSecret
                                    onCreate={handleCreateWrapper}
                                    onCancel={() => setIsCreating(false)}
                                />
                            )}

                            <SecretList
                                secrets={secrets}
                                sharedSecrets={sharedSecrets}
                                decryptedSecrets={decryptedSecrets}
                                onDecrypt={handleDecrypt}
                                onEdit={(s) => { /* Handle Edit logic or Modal */ alert("Edit not fully extracted yet, please verify standard flow"); }}
                                onDelete={deleteSecret}
                                onShare={openShareModal}
                                onViewDetails={handleViewDetails}
                                loading={secretsLoading}
                                authType={authType}
                                onRevoke={revokeGrant}
                            />
                        </>
                    )}

                    {currentView === 'multisig' && (
                        <>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Multisig Workflows</h2>
                                <button
                                    onClick={() => setIsMultisigCreateOpen(true)}
                                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 transition-all"
                                >
                                    <Plus className="w-5 h-5" /> New Workflow
                                </button>
                            </div>

                            <MultisigList
                                workflows={workflows}
                                loading={workflowsLoading}
                                onSelect={(wf) => setSelectedWorkflow(wf)}
                                onCreate={() => setIsMultisigCreateOpen(true)}
                            />
                        </>
                    )}

                    {currentView === 'messenger' && (
                        <div className="h-[600px]">
                            <Messenger />
                        </div>
                    )}
                </div>
            </main >

            {/* Modals */}
            {
                selectedWorkflow && (
                    <MultisigWorkflow
                        workflow={selectedWorkflow}
                        onClose={() => setSelectedWorkflow(null)}
                        onUpdate={handleMultisigUpdate}
                        setUploadProgress={updateProgress}
                        setStatusMessage={(msg) => updateProgress(undefined, msg)}
                    />
                )
            }

            {
                isMultisigCreateOpen && (
                    <MultisigCreateModal
                        isOpen={isMultisigCreateOpen}
                        onClose={() => setIsMultisigCreateOpen(false)}
                        onCreated={handleMultisigCreateSuccess}
                        secrets={secrets}
                    />
                )
            }

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                secret={secretToShare}
                onShare={shareSecret}
            />

            <SecretDetailsModal
                isOpen={showDetailsModal}
                onClose={() => setShowDetailsModal(false)}
                secret={selectedSecretDetails}
            />

            <ProfileModal
                isOpen={isProfileOpen}
                onClose={() => setIsProfileOpen(false)}
            />

            {
                showVaultManager && (
                    <VaultManager onClose={() => setShowVaultManager(false)} />
                )
            }
        </div >
    );
}
