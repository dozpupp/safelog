import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { usePQC } from './PQCContext';
import API_ENDPOINTS from '../config';
import { encryptWithSessionKey, decryptWithSessionKey } from '../utils/crypto';

const MessengerContext = createContext();

export const useMessengerContext = () => {
    const context = useContext(MessengerContext);
    if (!context) {
        throw new Error('useMessengerContext must be used within a MessengerProvider');
    }
    return context;
};

export const MessengerProvider = ({ children }) => {
    const { user, token, authType } = useAuth();
    const { encrypt, decrypt, generateSessionKey, wrapSessionKey, unwrapSessionKey, unwrapManySessionKeys, kyberKey } = usePQC();

    const [conversations, setConversations] = useState([]);
    const [activeConversation, setActiveConversation] = useState(null); // { user, messages: [] }
    const activeConversationRef = useRef(null);
    useEffect(() => { activeConversationRef.current = activeConversation; }, [activeConversation]);

    const [sessionKeys, setSessionKeys] = useState({});
    const sessionKeysRef = useRef({});
    useEffect(() => { sessionKeysRef.current = sessionKeys; }, [sessionKeys]);

    const [activeSessionIds, setActiveSessionIds] = useState({});
    const [loading, setLoading] = useState(true);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [sending, setSending] = useState(false);

    // Event Listeners (e.g. for Dashboard to refresh secrets)
    const [lastEvent, setLastEvent] = useState(null);

    // WebSocket Ref to prevent re-renders
    const wsRef = useRef(null);

    // WebSocket Setup
    useEffect(() => {
        if (!user || user.authType === 'metamask') return; // TrustKeys only for now? Or both? Original code checked authType === 'trustkeys'

        // Close existing if user changes (rare)
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        const url = API_ENDPOINTS.BASE.replace('http', 'ws');
        const wsUrl = `${url}/ws`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WS Connected via Context");
            ws.send(JSON.stringify({ type: 'AUTH', token }));
        };

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'NEW_MESSAGE') {
                    await handleIncomingMessage(data.message);
                } else if (data.type === 'SECRET_SHARED') {
                    // Signal to listeners
                    console.log("WS Event: SECRET_SHARED");
                    setLastEvent({ type: 'SECRET_SHARED', timestamp: Date.now(), data: data });
                }
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        ws.onclose = () => {
            console.log("WS Disconnected");
        };

        return () => {
            if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
                wsRef.current.close();
            }
            wsRef.current = null;
        };
    }, [user?.address, token]); // Only re-connect if user actually changes

    // Initial Load
    useEffect(() => {
        if (token) fetchConversations();
    }, [token]);

    const handleIncomingMessage = async (msg) => {
        const senderAddr = msg.sender_address.toLowerCase();
        const myAddr = user.address.toLowerCase();
        const partnerAddr = (senderAddr === myAddr) ? msg.recipient_address.toLowerCase() : senderAddr;

        let plainText = null;
        try {
            const payload = JSON.parse(msg.content);
            if (payload.v === 1 && payload.sid) {
                // Try to find key
                const key = sessionKeysRef.current[payload.sid];
                if (key) {
                    plainText = await decryptWithSessionKey(payload.ct, key);
                }
                // If no key, we might need to queue it or wait for manual open logic which unwraps. 
                // Auto-unwrap could be added here if we want background unwrapping.
            }
        } catch (e) { }

        const decryptedMsg = { ...msg, plainText };

        // Update Active Chat if open
        const currentActive = activeConversationRef.current;
        if (currentActive && currentActive.user.address.toLowerCase() === partnerAddr) {
            setActiveConversation(prev => {
                if (!prev || prev.user.address.toLowerCase() !== partnerAddr) return prev;
                // Avoid dupes
                const exists = prev.messages.find(m => m.id === msg.id);
                if (exists) return prev;
                return { ...prev, messages: [...prev.messages, decryptedMsg] };
            });

            if (senderAddr !== myAddr) {
                markRead(senderAddr);
            }
        }

        // Update Conversations List
        setConversations(prev => {
            const existing = prev.find(c => c.user.address.toLowerCase() === partnerAddr);
            const otherConvos = prev.filter(c => c.user.address.toLowerCase() !== partnerAddr);

            let newConvo = existing ? { ...existing } : {
                user: { address: partnerAddr, username: "New Message" },
                last_message: msg,
                unread_count: 0
            };

            newConvo.last_message = msg;

            const isViewing = currentActive && currentActive.user.address.toLowerCase() === partnerAddr;
            if (senderAddr !== myAddr && !isViewing) {
                newConvo.unread_count = (newConvo.unread_count || 0) + 1;
            } else if (isViewing) {
                newConvo.unread_count = 0;
            }

            return [newConvo, ...otherConvos];
        });
    };

    const fetchConversations = async () => {
        try {
            const res = await fetch(`${API_ENDPOINTS.BASE}/messages/conversations`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConversations(data);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const loadConversation = async (partnerUser) => {
        let fullUser = partnerUser;
        if (!fullUser.encryption_public_key) {
            try {
                const uRes = await fetch(`${API_ENDPOINTS.BASE}/users/${partnerUser.address}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (uRes.ok) fullUser = await uRes.json();
            } catch (e) { }
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
                const processed = await processMessages(rawMsgs, fullUser);
                setActiveConversation({ user: fullUser, messages: processed });
            }
        } catch (e) { console.error(e); }
        finally { setMessagesLoading(false); }
    };

    const processMessages = async (rawMsgs, partnerUser) => {
        // 1. Try local cache
        const processed = await Promise.all(rawMsgs.map(async msg => {
            try {
                const payload = JSON.parse(msg.content);
                if (payload.v === 1 && payload.sid) {
                    if (sessionKeysRef.current[payload.sid]) {
                        const pt = await decryptWithSessionKey(payload.ct, sessionKeysRef.current[payload.sid]);
                        return { ...msg, plainText: pt };
                    }
                    return { ...msg, _sessionPayload: payload };
                }
            } catch (e) { }
            return { ...msg, plainText: null };
        }));

        // 2. Identify missing keys and Batch Unwrap
        const keysToUnwrap = {};
        for (const m of processed) {
            if (m._sessionPayload && !sessionKeysRef.current[m._sessionPayload.sid]) {
                const p = m._sessionPayload;
                if (p.keys) {
                    const isMeSender = m.sender_address.toLowerCase() === user.address.toLowerCase();
                    const keyBlob = isMeSender ? p.keys.sender : p.keys.recip;
                    if (keyBlob) keysToUnwrap[p.sid] = keyBlob;
                }
            }
        }

        const sids = Object.keys(keysToUnwrap);
        if (sids.length > 0) {
            const blobs = sids.map(sid => keysToUnwrap[sid]);
            try {
                const unwrappedList = await unwrapManySessionKeys(blobs);
                const newKeys = { ...sessionKeysRef.current };
                sids.forEach((sid, idx) => {
                    const k = unwrappedList[idx];
                    if (k) newKeys[sid] = k;
                });
                setSessionKeys(newKeys);

                // Update Active Session
                const recentMsg = processed.find(m => m._sessionPayload && sids.includes(m._sessionPayload.sid));
                if (recentMsg) {
                    const pid = recentMsg.sender_address.toLowerCase() === user.address.toLowerCase()
                        ? recentMsg.recipient_address.toLowerCase()
                        : recentMsg.sender_address.toLowerCase();
                    setActiveSessionIds(prev => ({ ...prev, [pid]: recentMsg._sessionPayload.sid }));
                }

                // Re-process with new keys
                return await Promise.all(processed.map(async m => {
                    if (m._sessionPayload && newKeys[m._sessionPayload.sid]) {
                        try {
                            const pt = await decryptWithSessionKey(m._sessionPayload.ct, newKeys[m._sessionPayload.sid]);
                            return { ...m, plainText: pt };
                        } catch (e) { }
                    }
                    return m;
                }));
            } catch (e) { console.error("Batch unwrap failed", e); }
        } else {
            // Check if we already have a session ID active from cache
            const validMsg = processed.find(m => m.plainText && m._sessionPayload);
            if (validMsg) {
                const pid = validMsg.sender_address.toLowerCase() === user.address.toLowerCase()
                    ? validMsg.recipient_address.toLowerCase()
                    : validMsg.sender_address.toLowerCase();
                setActiveSessionIds(prev => ({ ...prev, [pid]: validMsg._sessionPayload.sid }));
            }
        }

        return processed;
    };

    const sendMessage = async (text, partnerUser) => {
        setSending(true);
        try {
            const recipientKey = partnerUser.encryption_public_key;
            if (!recipientKey) throw new Error("Recipient has no public key");

            // Session Logic
            const theirAddr = partnerUser.address.toLowerCase();
            let sid = activeSessionIds[theirAddr];
            let sKey = sid ? sessionKeys[sid] : null;
            let keyPayload = null;

            if (!sKey) {
                sid = crypto.randomUUID();
                sKey = await generateSessionKey();
                const wRecip = await wrapSessionKey(sKey, recipientKey);
                const myKey = user?.encryption_public_key || kyberKey;
                const wSender = myKey ? await wrapSessionKey(sKey, myKey) : null;
                keyPayload = { recip: wRecip, sender: wSender };
                setSessionKeys(prev => ({ ...prev, [sid]: sKey }));
                setActiveSessionIds(prev => ({ ...prev, [theirAddr]: sid }));
            }

            const ct = await encryptWithSessionKey(text, sKey);
            const payload = { v: 1, sid, keys: keyPayload, ct };

            const res = await fetch(`${API_ENDPOINTS.BASE}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient_address: partnerUser.address,
                    content: JSON.stringify(payload)
                })
            });

            if (res.ok) {
                const newMsg = await res.json();
                const uiMsg = { ...newMsg, plainText: text };
                setActiveConversation(prev => {
                    if (!prev || prev.messages.some(m => m.id === newMsg.id)) return prev;
                    return { ...prev, messages: [...prev.messages, uiMsg] };
                });
                // Sort conversation list to top
                fetchConversations();
            }
        } catch (e) {
            console.error(e);
            alert("Send failed: " + e.message);
        } finally {
            setSending(false);
        }
    };

    const markRead = async (partnerAddr) => {
        try {
            await fetch(`${API_ENDPOINTS.BASE}/messages/mark-read/${partnerAddr}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setConversations(prev => prev.map(c =>
                c.user.address.toLowerCase() === partnerAddr.toLowerCase() ? { ...c, unread_count: 0 } : c
            ));
        } catch (e) { }
    };

    const handleManualDecrypt = async (msg) => {
        // Logic similar to useMessenger...
        // Simplified for brevity, assume keys are synced or managed by batch process primarily.
        // Copying relevant bits:
        try {
            const payload = JSON.parse(msg.content);
            if (payload.v === 1 && payload.sid) {
                if (sessionKeysRef.current[payload.sid]) {
                    const plainText = await decryptWithSessionKey(payload.ct, sessionKeysRef.current[payload.sid]);
                    setActiveConversation(prev => ({
                        ...prev,
                        messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                    }));
                    return;
                }
                if (payload.keys) {
                    const isMeSender = msg.sender_address.toLowerCase() === user.address.toLowerCase();
                    const keyBlob = isMeSender ? payload.keys.sender : payload.keys.recip;
                    if (keyBlob) {
                        const sessionKey = await unwrapSessionKey(keyBlob);
                        if (sessionKey) {
                            setSessionKeys(prev => ({ ...prev, [payload.sid]: sessionKey }));
                            const plainText = await decryptWithSessionKey(payload.ct, sessionKey);
                            setActiveConversation(prev => ({
                                ...prev,
                                messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                            }));
                        }
                    }
                }
            }
        } catch (e) { console.error("Manual decrypt failed", e); }
    };

    return (
        <MessengerContext.Provider value={{
            conversations,
            activeConversation,
            loading,
            messagesLoading,
            sending,
            loadConversation,
            sendMessage,
            setActiveConversation,
            handleManualDecrypt,
            unreadCount: conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0),
            lastEvent // Expose for listeners
        }}>
            {children}
        </MessengerContext.Provider>
    );
};
