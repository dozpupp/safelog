import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../hooks/useMessenger';
import { Loader2 } from 'lucide-react';

// Components
import ConversationList from './messenger/ConversationList';
import ChatArea from './messenger/ChatArea';
import NewChatModal from './messenger/NewChatModal';

export default function Messenger() {
    const {
        conversations,
        activeConversation,
        loading,
        messagesLoading,
        sending,
        loadConversation,
        sendMessage,
        setActiveConversation,
        handleManualDecrypt
    } = useMessenger();

    const [isNewChatOpen, setIsNewChatOpen] = useState(false);

    const handleStartNewChat = (partnerUser) => {
        loadConversation(partnerUser);
        setIsNewChatOpen(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    return (
        <div className="flex h-full bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <ConversationList
                conversations={conversations}
                activeConversation={activeConversation}
                onSelect={(user) => loadConversation(user)}
                onNewChat={() => setIsNewChatOpen(true)}
            />

            <ChatArea
                activeConversation={activeConversation}
                onBack={() => setActiveConversation(null)}
                onSend={sendMessage}
                loadingMessages={messagesLoading}
                sending={sending}
                onDecrypt={handleManualDecrypt}
            />

            <NewChatModal
                isOpen={isNewChatOpen}
                onClose={() => setIsNewChatOpen(false)}
                onStartChat={handleStartNewChat}
            />
        </div>
    );
}
