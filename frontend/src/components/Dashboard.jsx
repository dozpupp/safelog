import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWeb3 } from '../context/Web3Context';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { useSecrets } from '../hooks/useSecrets';
import { useMultisig } from '../hooks/useMultisig';
import { useMessenger } from '../hooks/useMessenger';
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
        shareSecret
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
    const { unreadCount } = useMessenger();

    const handleMultisigCreateSuccess = () => {
        setIsMultisigCreateOpen(false);
        fetchWorkflows();
    };

    // Nav Items
    const navItems = [
        { id: 'secrets', label: 'Secrets', icon: <Lock className="w-4 h-4" /> },
        { id: 'multisig', label: 'Multisig', icon: <FolderGit2 className="w-4 h-4" /> },
    ];

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
            </main>

            {/* Modals */}
            {selectedWorkflow && (
                <MultisigWorkflow
                    workflow={selectedWorkflow}
                    onClose={() => setSelectedWorkflow(null)}
                    onUpdate={handleMultisigUpdate}
                    setUploadProgress={updateProgress}
                    setStatusMessage={(msg) => updateProgress(undefined, msg)}
                />
            )}

            {isMultisigCreateOpen && (
                <MultisigCreateModal
                    isOpen={isMultisigCreateOpen}
                    onClose={() => setIsMultisigCreateOpen(false)}
                    onCreated={handleMultisigCreateSuccess}
                    secrets={secrets}
                />
            )}

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

            {showVaultManager && (
                <VaultManager onClose={() => setShowVaultManager(false)} />
            )}
        </div>
    );
}
