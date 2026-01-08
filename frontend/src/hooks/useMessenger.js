import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePQC } from '../context/PQCContext';
import API_ENDPOINTS from '../config';
import { encryptWithSessionKey, decryptWithSessionKey } from '../utils/crypto';

export function useMessenger() {
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

    // WebSocket Setup
    useEffect(() => {
        if (!user || authType !== 'trustkeys') return;

        const url = API_ENDPOINTS.BASE.replace('http', 'ws');
        const wsUrl = `${url}/ws`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            ws.send(JSON.stringify({ type: 'AUTH', token }));
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_MESSAGE') {
                handleIncomingMessage(data.message);
            }
        };

        return () => ws.close();
    }, [user, token, authType]);

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
                const key = sessionKeysRef.current[payload.sid];
                if (key) {
                    plainText = await decryptWithSessionKey(payload.ct, key);
                }
            }
        } catch (e) { }

        const decryptedMsg = { ...msg, plainText };

        // Update Active Chat
        const currentActive = activeConversationRef.current;
        if (currentActive && currentActive.user.address.toLowerCase() === partnerAddr) {
            setActiveConversation(prev => {
                if (!prev || prev.user.address.toLowerCase() !== partnerAddr) return prev;
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

                // Batch Decrypt Logic
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
                    if (sessionKeys[payload.sid]) {
                        const pt = await decryptWithSessionKey(payload.ct, sessionKeys[payload.sid]);
                        return { ...msg, plainText: pt };
                    }
                    return { ...msg, _sessionPayload: payload };
                }
            } catch (e) { }
            return { ...msg, plainText: null };
        }));

        // 2. Identify missing keys
        const keysToUnwrap = {};
        for (const m of processed) {
            if (m._sessionPayload && !sessionKeys[m._sessionPayload.sid]) {
                const p = m._sessionPayload;
                if (p.keys) {
                    const isMeSender = m.sender_address.toLowerCase() === user.address.toLowerCase();
                    const keyBlob = isMeSender ? p.keys.sender : p.keys.recip;
                    if (keyBlob) keysToUnwrap[p.sid] = keyBlob;
                }
            }
        }

        // 3. Batch Unwrap
        const sids = Object.keys(keysToUnwrap);
        if (sids.length > 0) {
            const blobs = sids.map(sid => keysToUnwrap[sid]);
            try {
                const unwrappedList = await unwrapManySessionKeys(blobs);
                const newKeys = { ...sessionKeys };
                sids.forEach((sid, idx) => {
                    const k = unwrappedList[idx];
                    if (k) newKeys[sid] = k;
                });
                setSessionKeys(newKeys);

                // Update Active Session ID if we found a key for the current partner
                // We pick the session from the *latest* message from this partner ideally
                // For now, simpler: just use this one.
                const recentMsg = processed.find(m => m._sessionPayload && sids.includes(m._sessionPayload.sid));
                if (recentMsg) {
                    const pid = recentMsg.sender_address.toLowerCase() === user.address.toLowerCase()
                        ? recentMsg.recipient_address.toLowerCase()
                        : recentMsg.sender_address.toLowerCase();
                    const sid = recentMsg._sessionPayload.sid;
                    setActiveSessionIds(prev => ({ ...prev, [pid]: sid }));
                }

                // Re-process
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
            // If we didn't unwrap, maybe we already had keys? Check processed messages for session IDs
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
            const myAddr = user.address.toLowerCase();
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
                    // Check for duplicates (WebSocket might have added it already)
                    if (prev.messages.some(m => m.id === newMsg.id)) {
                        return prev;
                    }
                    return {
                        ...prev,
                        messages: [...prev.messages, uiMsg]
                    };
                });
                fetchConversations(); // Update list order
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
        try {
            const payload = JSON.parse(msg.content);
            if (payload.v === 1 && payload.sid) {
                // Check if we have the key, if so decrypt
                if (sessionKeysRef.current[payload.sid]) {
                    const plainText = await decryptWithSessionKey(payload.ct, sessionKeysRef.current[payload.sid]);
                    setActiveConversation(prev => ({
                        ...prev,
                        messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                    }));
                    return;
                }

                // If no key, try to unwrap from this message's payload
                if (payload.keys) {
                    const isMeSender = msg.sender_address.toLowerCase() === user.address.toLowerCase();
                    const keyBlob = isMeSender ? payload.keys.sender : payload.keys.recip;

                    if (keyBlob) {
                        try {
                            const sessionKey = await unwrapSessionKey(keyBlob);
                            if (sessionKey) {
                                // Save key to state
                                setSessionKeys(prev => ({ ...prev, [payload.sid]: sessionKey }));

                                // Decrypt
                                const plainText = await decryptWithSessionKey(payload.ct, sessionKey);
                                setActiveConversation(prev => ({
                                    ...prev,
                                    messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                                }));
                            }
                        } catch (unwrapError) {
                            console.error("Failed to unwrap session key", unwrapError);
                            alert("Failed to decrypt message key. You may not be the intended recipient.");
                        }
                    } else {
                        alert("No key found for you in this message.");
                    }
                } else {
                    alert("Key not found in this message. Please refresh to sync keys.");
                }
            } else {
                // Legacy
                const plainText = await decrypt(payload);
                setActiveConversation(prev => ({
                    ...prev,
                    messages: prev.messages.map(m => m.id === msg.id ? { ...m, plainText } : m)
                }));
            }
        } catch (e) {
            console.error(e);
            alert("Decryption failed: " + e.message);
        }
    };


    return {
        conversations,
        activeConversation,
        loading,
        messagesLoading,
        sending,
        loadConversation,
        sendMessage,
        setActiveConversation, // Expose for closing chat
        handleManualDecrypt,
        unreadCount: conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0)
    };
}
