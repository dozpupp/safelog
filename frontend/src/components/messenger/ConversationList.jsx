import React from 'react';
import { MessageSquare, Plus, Lock } from 'lucide-react';

const ConversationList = ({ conversations, activeConversation, onSelect, onNewChat }) => {

    // De-dupe conversations by address to avoid rendering issues
    const uniqueConversations = conversations.reduce((acc, current) => {
        const x = acc.find(item => item.user.address === current.user.address);
        if (!x) return acc.concat([current]);
        return acc;
    }, []);

    return (
        <div className={`${activeConversation ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900`}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <h2 className="font-bold text-lg dark:text-white flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" /> Messages
                </h2>
                <button
                    onClick={onNewChat}
                    className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
                    title="New Chat"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {uniqueConversations.length === 0 ? (
                    <div className="p-4 text-center text-slate-500 text-sm">No conversations yet.</div>
                ) : (
                    uniqueConversations.map(c => (
                        <button
                            key={c.user.address}
                            onClick={() => onSelect(c.user)}
                            className={`w-full p-3 mb-1 rounded-xl text-left transition-all flex items-center gap-3 relative overflow-hidden group ${activeConversation?.user.address === c.user.address
                                ? 'bg-indigo-600 shadow-md shadow-indigo-500/20'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            <div className="relative shrink-0">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-sm transition-transform group-hover:scale-105 ${activeConversation?.user.address === c.user.address
                                    ? 'bg-white/20 text-white backdrop-blur-sm'
                                    : 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white'
                                    }`}>
                                    {(c.user.username || c.user.address).substring(0, 1).toUpperCase()}
                                </div>
                                {c.unread_count > 0 && (
                                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center animate-in zoom-in">
                                        <span className="text-[10px] font-bold text-white leading-none">
                                            {c.unread_count > 9 ? '9+' : c.unread_count}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-hidden">
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className={`font-semibold truncate text-sm ${activeConversation?.user.address === c.user.address
                                        ? 'text-white'
                                        : 'text-slate-900 dark:text-white'
                                        }`}>
                                        {c.user.username || `${c.user.address.substring(0, 8)}...`}
                                    </span>
                                    {c.last_message && (
                                        <span className={`text-[10px] ${activeConversation?.user.address === c.user.address
                                            ? 'text-indigo-200'
                                            : 'text-slate-400'
                                            }`}>
                                            {new Date(c.last_message.created_at).toLocaleDateString()}
                                        </span>
                                    )}
                                </div>
                                <div className={`text-xs truncate flex items-center gap-1 ${activeConversation?.user.address === c.user.address
                                    ? 'text-indigo-100'
                                    : c.unread_count > 0 ? 'text-slate-900 dark:text-white font-semibold' : 'text-slate-500'
                                    }`}>
                                    {c.last_message?.plainText ? (
                                        <span className="truncate">{c.last_message.plainText}</span>
                                    ) : (
                                        <span className="flex items-center gap-1 opacity-80">
                                            <Lock className="w-3 h-3" /> Encrypted Message
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
};

export default ConversationList;
