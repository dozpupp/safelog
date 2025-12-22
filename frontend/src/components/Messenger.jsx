import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { Send, Lock, Shield, User, Loader2, ArrowLeft, MessageSquare, Plus, Search, Check, X } from 'lucide-react';
import API_ENDPOINTS from '../config';

export default function Messenger() {
    const { user, token } = useAuth();
    const { encrypt, decrypt, decryptMany, pqcAccount } = usePQC();
    const { isRetro } = useTheme();

    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null); // { user, messages: [] }
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef(null);

    // New Chat State
    const [isNewChatOpen, setIsNewChatOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);

    // Initial Load
    useEffect(() => {
        fetchConversations();
    }, []);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeConversation?.messages]);

    const fetchConversations = async () => {
        try {
            const res = await fetch(`${API_ENDPOINTS.BASE}/messages/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Decrypt last messages? Optional for list view, maybe just show "Encrypted Message"
                // For better UX, let's try to decrypt them asynchronously or just show "Encrypted"
                setConversations(data);
            }
        } catch (e) {
            console.error("Failed to load conversations", e);
        } finally {
            setLoading(false);
        }
    };

    const loadConversation = async (partnerUser) => {
        setActiveConversation({ user: partnerUser, messages: [] });
        setMessagesLoading(true);
        try {
            const res = await fetch(`${API_ENDPOINTS.BASE}/messages/history`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ partner_address: partnerUser.address })
            });
            if (res.ok) {
                const encryptedMsgs = await res.json();

                // Decrypt all messages using batch method to avoid multiple prompts
                // Extract proper encrypted contents first based on who I am
                const contents = encryptedMsgs.map(msg => {
                    try {
                        const payload = JSON.parse(msg.content);
                        if (payload.recipient && payload.sender) {
                            // If I am sender, use sender blob. Else use recipient blob.
                            return (msg.sender_address === user.address) ? payload.sender : payload.recipient;
                        }
                        return payload;
                    } catch (e) {
                        // Fallback
                        return msg.content;
                    }
                });

                try {
                    const plainTexts = await decryptMany(contents);

                    const decryptedMsgs = encryptedMsgs.map((msg, idx) => ({
                        ...msg,
                        plainText: plainTexts[idx]
                    }));

                    setActiveConversation({ user: partnerUser, messages: decryptedMsgs });
                } catch (e) {
                    console.error("Batch decryption failed", e);
                    // Fallback: show errors
                    const failedMsgs = encryptedMsgs.map(msg => ({ ...msg, plainText: "Decryption Failed" }));
                    setActiveConversation({ user: partnerUser, messages: failedMsgs });
                }
            }
        } catch (e) {
            console.error("Failed to load messages", e);
        } finally {
            setMessagesLoading(false);
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !activeConversation) return;

        setSending(true);
        try {
            const recipientKey = activeConversation.user.encryption_public_key;
            if (!recipientKey) throw new Error("Recipient has no public key");

            // Encrypt for Recipient
            const blobForRecipient = await encrypt(inputText, recipientKey);

            // Encrypt for Info (Sender)
            // We need our own public key. 
            // If using TrustKeys, we can get it from pqcAccount (if matches) or we might need to store it in session.
            // But wait, pqcAccount is the ID (Dilithium). We need Kyber key.
            // In PQCContext, we assume 'kyberKey' is available in state if logged in via PQC.
            // Checked PQCContext: 'kyberKey' value is exported. We need to import it. (Done in previous step? No, need to destructure it)
            // Wait, I only destructured { encrypt, decrypt, decryptMany, pqcAccount }. I need kyberKey.

            // Actually, let's assume we can get it. For now, let's add kyberKey to destructuring at top of component.
            // Oh wait, I can just use `encrypt(inputText, null)`? 
            // PQCContext.jsx says: `encrypt(content, publicKey || kyberKey)`. 
            // So if I pass null as second arg, it encrypts for ME (kyberKey).
            const blobForSender = await encrypt(inputText, null);

            const contentPayload = JSON.stringify({
                recipient: blobForRecipient,
                sender: blobForSender
            });

            // Send
            const res = await fetch(`${API_ENDPOINTS.BASE}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient_address: activeConversation.user.address,
                    content: contentPayload
                })
            });

            if (res.ok) {
                const newMsg = await res.json();
                // Add to UI immediately
                const uiMsg = { ...newMsg, plainText: inputText };
                setActiveConversation(prev => ({
                    ...prev,
                    messages: [...prev.messages, uiMsg]
                }));
                setInputText('');
                // Update conversation list sort?
                fetchConversations();
            }
        } catch (e) {
            console.error("Send failed", e);
            alert("Failed to send: " + e.message);
        } finally {
            setSending(false);
        }
    };

    const searchUsers = async (query) => {
        setSearching(true);
        try {
            const res = await fetch(`${API_ENDPOINTS.USERS.LIST}?search=${encodeURIComponent(query)}&limit=10`);
            const data = await res.json();
            // Filter out current user
            const filtered = data.filter(u => u.address !== user.address);
            setSearchResults(filtered);
        } catch (e) {
            console.error("Search failed", e);
        } finally {
            setSearching(false);
        }
    };

    // Debounce search
    useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            return;
        }
        const timer = setTimeout(() => searchUsers(searchQuery), 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const startNewChat = (partnerUser) => {
        // checks if conversation exists
        loadConversation(partnerUser);
        setIsNewChatOpen(false);
        setSearchQuery('');
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
            {/* Sidebar List */}
            <div className={`${activeConversation ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900`}>
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                    <h2 className="font-bold text-lg dark:text-white flex items-center gap-2">
                        <MessageSquare className="w-5 h-5" /> Messages
                    </h2>
                    <button
                        onClick={() => setIsNewChatOpen(true)}
                        className="p-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
                        title="New Chat"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {conversations.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-sm">No conversations yet.</div>
                    ) : (
                        conversations.map(c => (
                            <button
                                key={c.user.address}
                                onClick={() => loadConversation(c.user)}
                                className={`w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 ${activeConversation?.user.address === c.user.address ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                            >
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                                    {(c.user.username || c.user.address).substring(0, 1).toUpperCase()}
                                </div>
                                <div className="overflow-hidden">
                                    <div className="font-medium text-slate-900 dark:text-white truncate">
                                        {c.user.username || `${c.user.address.substring(0, 6)}...`}
                                    </div>
                                    <div className="text-xs text-slate-500 truncate flex items-center gap-1">
                                        <Lock className="w-3 h-3" /> Encrypted Message
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className={`${!activeConversation ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-slate-50 dark:bg-slate-950`}>
                {activeConversation ? (
                    <>
                        {/* Header */}
                        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm z-10">
                            <button
                                onClick={() => setActiveConversation(null)}
                                className="md:hidden p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
                            >
                                <ArrowLeft className="w-5 h-5 dark:text-white" />
                            </button>
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-sm">
                                {(activeConversation.user.username || activeConversation.user.address).substring(0, 1).toUpperCase()}
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white">
                                    {activeConversation.user.username || `${activeConversation.user.address.substring(0, 8)}...`}
                                </h3>
                                <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                    <Shield className="w-3 h-3" /> End-to-End Encrypted
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messagesLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                                </div>
                            ) : (
                                activeConversation.messages.map(msg => {
                                    const isMe = msg.sender_address === user.address;
                                    return (
                                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`
                                                max-w-[80%] rounded-2xl px-4 py-3 shadow-sm
                                                ${isMe
                                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'}
                                            `}>
                                                <p className="text-sm">{msg.plainText}</p>
                                                <div className={`text-[10px] mt-1 opacity-70 ${isMe ? 'text-indigo-100' : 'text-slate-400'}`}>
                                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                            <form onSubmit={sendMessage} className="flex gap-2">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Type a secure message..."
                                    className="flex-1 bg-slate-100 dark:bg-slate-800 border-0 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 dark:text-white outline-none transition-all"
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || sending}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white p-3 rounded-xl transition-all disabled:opacity-50 disabled:scale-95 shadow-lg shadow-indigo-500/20"
                                >
                                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8">
                        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                            <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p>Select a conversation to start chatting</p>
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {isNewChatOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 w-full max-w-md animate-in fade-in zoom-in-95 flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">New Chat</h3>
                            <button onClick={() => setIsNewChatOpen(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="mb-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    placeholder="Search by username or address..."
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto min-h-[200px]">
                            {searching ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="text-center py-8 text-slate-500 text-sm">
                                    {searchQuery ? "No users found" : "Type to search users"}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {searchResults.map(u => (
                                        <button
                                            key={u.address}
                                            onClick={() => startNewChat(u)}
                                            className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shrink-0">
                                                {(u.username || u.address).substring(0, 1).toUpperCase()}
                                            </div>
                                            <div className="overflow-hidden">
                                                <div className="font-medium text-slate-900 dark:text-white truncate">
                                                    {u.username || `${u.address.substring(0, 8)}...`}
                                                </div>
                                                <div className="text-xs text-slate-500 font-mono truncate">
                                                    {u.address}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
