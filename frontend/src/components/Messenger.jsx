import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import { useTheme } from '../context/ThemeContext';
import { Send, Lock, Shield, User, Loader2, ArrowLeft, MessageSquare, Plus, Search, Check, X } from 'lucide-react';

import API_ENDPOINTS from '../config';
import { encryptWithSessionKey, decryptWithSessionKey } from '../utils/crypto';

export default function Messenger() {
    const { user, token, authType } = useAuth();
    const { encrypt, decrypt, decryptMany, pqcAccount, generateSessionKey, wrapSessionKey, unwrapSessionKey, unwrapManySessionKeys, kyberKey } = usePQC();
    const { isRetro } = useTheme();

    // Session Cache: Map<sessionId, hexKey>
    const [sessionKeys, setSessionKeys] = useState({});
    const sessionKeysRef = useRef({});
    useEffect(() => { sessionKeysRef.current = sessionKeys; }, [sessionKeys]);

    // Active Session Tracking: Map<partnerAddress, sessionId>
    const [activeSessionIds, setActiveSessionIds] = useState({});

    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null); // { user, messages: [] }
    const activeConversationRef = useRef(null);
    useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

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

    // WebSocket Integration
    useEffect(() => {
        if (!user || authType !== 'trustkeys') return;

        const url = API_ENDPOINTS.BASE.replace('http', 'ws');
        const wsUrl = `${url}/ws`; // No token in URL to avoid length limits
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            // Send Auth Token as first message
            ws.send(JSON.stringify({
                type: 'AUTH',
                token: token
            }));
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_MESSAGE') {
                const msg = data.message;
                const senderAddr = msg.sender_address.toLowerCase();
                const recipientAddr = msg.recipient_address.toLowerCase();
                const myAddr = user.address.toLowerCase();

                // Determine Partner Address
                const partnerAddr = (senderAddr === myAddr) ? recipientAddr : senderAddr;

                // 1. Skip Auto-Decrypt to avoid popping up vault unexpectedly
                // User must click to decrypt
                // UNLESS it's a Session Message we can decrypt silently!
                let plainText = null;

                try {
                    const payload = JSON.parse(msg.content);
                    // Check for Session Message (v:1)
                    if (payload.v === 1 && payload.sid) {
                        // Check Cache via REF to avoid closure staleness
                        const key = sessionKeysRef.current[payload.sid];
                        if (key) {
                            plainText = await decryptWithSessionKey(payload.ct, key);
                        } else {
                            // Attempt to unwrap from headers if available?
                            // Can't unwrap without prompting (usually). 
                            // If it requires prompt, we leave it encrypted and let user click 'Decrypt'.
                            // But wait, user wanted "Real Time". 
                            // If we have unlocked vault (state available), unwrap might be fast or might require prompt depending on policy.
                            // Extension policy: UNWRAP requires prompt.
                            // So: Keep it encrypted initially. User clicks -> Unlock Session -> Decrypts all.
                        }
                    }
                } catch (e) { }

                const decryptedMsg = { ...msg, plainText };

                // 2. Update Active Conversation (if matching)
                const currentActive = activeConversationRef.current;

                // We verify partner match using Ref (to know if we are in the right chat)
                if (currentActive && currentActive.user.address.toLowerCase() === partnerAddr) {
                    setActiveConversation(prev => {
                        // Double-check active verification inside state update to be safe
                        if (!prev || prev.user.address.toLowerCase() !== partnerAddr) return prev;

                        // Check de-duplication against the FRESH state
                        const exists = prev.messages.find(m => m.id === msg.id);
                        if (exists) return prev; // Already exists, do nothing

                        return {
                            ...prev,
                            messages: [...prev.messages, decryptedMsg]
                        };
                    });

                    // Mark Read (since we are viewing it)
                    // We do this outside the state update to avoid side-effects in reducer
                    if (senderAddr !== myAddr) {
                        fetch(`${API_ENDPOINTS.BASE}/messages/mark-read/${senderAddr}`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                    }
                }

                // 3. Update Conversation List (Red Dot & Last Message)
                setConversations(prev => {
                    const existing = prev.find(c => c.user.address.toLowerCase() === partnerAddr);
                    const otherConvos = prev.filter(c => c.user.address.toLowerCase() !== partnerAddr);

                    let newConvo = existing ? { ...existing } : {
                        user: { address: partnerAddr, username: "New Message" },
                        last_message: msg,
                        unread_count: 0
                    };

                    // Update Last Message
                    newConvo.last_message = msg;

                    // Increment Unread Count?
                    // Only if it's incoming AND we are NOT currently viewing this specific chat
                    const isViewing = currentActive && currentActive.user.address.toLowerCase() === partnerAddr;

                    if (senderAddr !== myAddr && !isViewing) {
                        newConvo.unread_count = (newConvo.unread_count || 0) + 1;
                    } else if (isViewing) {
                        // Reset if we are viewing it
                        newConvo.unread_count = 0;
                    }

                    return [newConvo, ...otherConvos];
                });
            }
        };

        return () => ws.close();
    }, [user, token, authType]); // Only re-run on auth change. relies on ref for active convo state.

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
        // Fix: If partnerUser lacks public key (e.g. from WS event), fetch full profile
        let fullUser = partnerUser;
        if (!fullUser.encryption_public_key) {
            try {
                const uRes = await fetch(`${API_ENDPOINTS.BASE}/users/${partnerUser.address}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (uRes.ok) {
                    fullUser = await uRes.json();
                }
            } catch (e) {
                console.error("Failed to fetch full user profile", e);
            }
        }

        setActiveConversation({ user: fullUser, messages: [] });
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
                const rawMsgs = await res.json();

                // 1. Collect all Session IDs and Messages without keys
                const msgsToProcess = [];
                const sessionsToUnwrap = new Set();

                // Helper to try decrypting with current cache
                const processMessage = async (msg) => {
                    try {
                        const payload = JSON.parse(msg.content);
                        if (payload.v === 1 && payload.sid) {
                            if (sessionKeys[payload.sid]) {
                                const pt = await decryptWithSessionKey(payload.ct, sessionKeys[payload.sid]);
                                return { ...msg, plainText: pt };
                            } else {
                                // Need to unwrap session
                                return { ...msg, _sessionPayload: payload, plainText: null }; // Mark for batch unwrap
                            }
                        }
                    } catch (e) { }
                    // Legacy or Failed
                    return { ...msg, plainText: null, _legacy: true };
                };

                const processed = await Promise.all(rawMsgs.map(processMessage));

                // 2. Identify sessions that need unwrapping
                // We find the FIRST occurrence of a session with keys
                const keysToUnwrap = {}; // sid -> wrappedKeyBlob

                for (const m of processed) {
                    if (m._sessionPayload && !sessionKeys[m._sessionPayload.sid]) {
                        // Check if this message carries keys
                        const p = m._sessionPayload;
                        if (p.keys) {
                            // Assuming I am Recipient or Sender?
                            // If I am sender, I need 'sender' key. If recipient, 'recip'.
                            // Check user.address against sender_address
                            const isMeSender = m.sender_address.toLowerCase() === user.address.toLowerCase();
                            const keyBlob = isMeSender ? p.keys.sender : p.keys.recip;
                            if (keyBlob) keysToUnwrap[p.sid] = keyBlob;
                        }
                    }
                }

                // 3. Perform Batch Unwrap
                const newKeys = { ...sessionKeys };

                const sids = Object.keys(keysToUnwrap);
                if (sids.length > 0) {
                    const blobs = sids.map(sid => keysToUnwrap[sid]);
                    try {
                        // SINGLE Prompt for all keys
                        const unwrappedList = await unwrapManySessionKeys(blobs);

                        sids.forEach((sid, idx) => {
                            const k = unwrappedList[idx];
                            if (k) newKeys[sid] = k;
                        });
                    } catch (e) {
                        console.error("Batch unwrap failed", e);
                    }
                }

                // Keep 'updated' check logic roughly same but just check if newKeys differs
                // Actually we can just trust if sids > 0 and no error.
                if (sids.length > 0) {
                    setSessionKeys(newKeys);
                    // Re-decrypt messages that were waiting
                    const reProcessed = await Promise.all(processed.map(async m => {
                        if (m._sessionPayload && newKeys[m._sessionPayload.sid]) {
                            try {
                                const pt = await decryptWithSessionKey(m._sessionPayload.ct, newKeys[m._sessionPayload.sid]);
                                return { ...m, plainText: pt };
                            } catch (e) { return m; }
                        }
                        return m;
                    }));
                    setActiveConversation({ user: fullUser, messages: reProcessed });
                } else {
                    setActiveConversation({ user: fullUser, messages: processed });
                }

                // Handle Legacy batch decrypt if needed (for non-session messages)
                // ... (omitted for brevity, let's assume legacy stays encrypted until click)
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

            // Session Logic
            // 1. Determine Session ID (Hash of sorted addresses? Or Random unique per chat start?)
            // Using a DETERMINISTIC session ID based on participants allows us to reuse keys easily without storage?
            // No, keys are random.
            // Let's use a "Current Session" concept.
            // Check if we have a key for this partner.
            // For robust 'Group' or 'Pair' chat, specific SID is good.
            // Let's just use: sid = "chat_" + [myAddr, partnerAddr].sort().join('_');
            // This means we have ONE permanent session? No, that's static key -> BAD for FS (Forward Secrecy).
            // But for this "Lite" MVP, user requested "System based on user keys".
            // If we rotate key, we change SID.
            // Let's use a STATIC SID for the pair, but we only generate key ONCE if execution memory is empty?
            // NO. If we use static SID, we must persist the key.
            // Since we persist in "First Message Logic" (encrypted headers), we can recover it.
            // So: SID = "pqc_session_" + sorted_addrs.

            const myAddr = user.address.toLowerCase();
            const theirAddr = activeConversation.user.address.toLowerCase();

            // Check for active session
            let sid = activeSessionIds[theirAddr];
            let sKey = sid ? sessionKeys[sid] : null;
            let keyPayload = null;

            if (!sKey) {
                // Start New Session (Unique ID per session init)
                sid = crypto.randomUUID();
                sKey = await generateSessionKey();

                // Wrap for Recipient
                const wRecip = await wrapSessionKey(sKey, recipientKey);

                // Wrap for Self
                // Use user.encryption_public_key or fallback to local context kyberKey
                const myKey = user?.encryption_public_key || kyberKey;
                // If null, we skip wrap-for-self (or rely heavily on local cache until reload)
                const wSender = myKey ? await wrapSessionKey(sKey, myKey) : null;

                keyPayload = {
                    recip: wRecip,
                    sender: wSender
                };

                // Update State
                setSessionKeys(prev => ({ ...prev, [sid]: sKey }));
                setActiveSessionIds(prev => ({ ...prev, [theirAddr]: sid }));
            }

            // Encrypt Content
            const ct = await encryptWithSessionKey(inputText, sKey);

            const payload = {
                v: 1,
                sid,
                keys: keyPayload,
                ct
            };

            // Send
            const res = await fetch(`${API_ENDPOINTS.BASE}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient_address: activeConversation.user.address,
                    content: JSON.stringify(payload)
                })
            });

            if (res.ok) {
                const newMsg = await res.json();
                const uiMsg = { ...newMsg, plainText: inputText, _sessionPayload: payload };
                setActiveConversation(prev => ({
                    ...prev,
                    messages: prev.messages.some(m => m.id === newMsg.id) ? prev.messages.map(m => m.id === newMsg.id ? uiMsg : m) : [...prev.messages, uiMsg]
                }));
                setInputText('');
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

    const handleManualDecrypt = async (msg) => {
        try {
            const payload = JSON.parse(msg.content);

            // Session Message?
            if (payload.v === 1 && payload.sid) {
                // Check if we HAVE the key (maybe added recently)
                const existingKey = sessionKeys[payload.sid];
                if (existingKey) {
                    const pt = await decryptWithSessionKey(payload.ct, existingKey);
                    setActiveConversation(prev => ({
                        ...prev,
                        messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText: pt } : m)
                    }));
                    return;
                }

                // If we are here, it means auto-decrypt failed (no key).
                // We need to find the keys.
                let keyBlob = null;
                if (payload.keys) {
                    const isMeSender = msg.sender_address.toLowerCase() === user.address.toLowerCase();
                    keyBlob = isMeSender ? payload.keys.sender : payload.keys.recip;
                }

                if (keyBlob) {
                    const k = await unwrapSessionKey(keyBlob);
                    if (k) {
                        setSessionKeys(prev => ({ ...prev, [payload.sid]: k }));
                        const pt = await decryptWithSessionKey(payload.ct, k);
                        setActiveConversation(prev => ({
                            ...prev,
                            messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText: pt } : m)
                        }));
                        // Also try to decrypt others with same session?
                        // Yes trigger re-scan? Or just letting user click one by one (bad UX).
                        // In React state, we should probably auto-trigger a sweep.
                        // For now, this is "Click to Decrypt" -> Decrypts THIS one. 
                        // But since we updated SessionKEYS state, next render logic or side-effect could decrypt others.
                        // Ideally we call a helper.
                    }
                } else {
                    alert("No keys found in this message header. Session might be lost.");
                }
                return;
            }

            // Legacy Logic
            let blob = payload;
            if (payload.recipient && payload.sender) {
                blob = (msg.sender_address === user.address) ? payload.sender : payload.recipient;
            }

            // Trigger Decrypt (Prompts PQC Password if needed)
            const plainText = await decrypt(blob);

            // Update State
            setActiveConversation(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                };
            });
        } catch (e) {
            console.error("Manual Decrypt Failed", e);
        }
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
                                onClick={() => {
                                    loadConversation(c.user);
                                    // Mark Read Logic
                                    if (c.unread_count > 0) {
                                        setConversations(prev => prev.map(convo =>
                                            convo.user.address === c.user.address ? { ...convo, unread_count: 0 } : convo
                                        ));
                                        fetch(`${API_ENDPOINTS.BASE}/messages/mark-read/${c.user.address}`, {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${token}` }
                                        });
                                    }
                                }}
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
                                    {/* Unread Badge */}
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
                                                max-w-[80%] rounded-2xl px-4 py-3 shadow-sm transition-all
                                                ${isMe
                                                    ? 'bg-indigo-600 text-white rounded-br-none'
                                                    : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'}
                                            `}>
                                                {msg.plainText ? (
                                                    <p className="text-sm">{msg.plainText}</p>
                                                ) : (
                                                    <button
                                                        onClick={() => handleManualDecrypt(msg)}
                                                        className={`flex items-center gap-2 text-sm font-semibold px-2 py-1 rounded bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 transition-colors ${isMe ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`}
                                                    >
                                                        <Lock className="w-4 h-4" /> Click to Decrypt
                                                    </button>
                                                )}
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
