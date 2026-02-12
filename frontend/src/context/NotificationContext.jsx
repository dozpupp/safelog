import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { API_ENDPOINTS } from '../config';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

const VAPID_PUBLIC_KEY = "BA4DL706bR_1iDyiOTfe52hp4U2_RKgn6KlrU4AiWSdXEvihmM1zS5B-TfYEG_41g-LaBLQ0YjNACz_hJ2d7kAo";

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export const NotificationProvider = ({ children }) => {
    const { user, isAuthenticated } = useAuth();
    const [permission, setPermission] = useState(Notification.permission);
    const [subscription, setSubscription] = useState(null);
    const [error, setError] = useState(null);

    const subscribe = useCallback(async () => {
        setError(null);
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            const msg = 'Push messaging is not supported in this browser.';
            console.warn(msg);
            setError(msg);
            return;
        }

        if (!window.isSecureContext) {
            const msg = 'Push notifications require a secure context (HTTPS) or localhost.';
            console.warn(msg);
            setError(msg);
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const existingSub = await registration.pushManager.getSubscription();

            if (existingSub) {
                await existingSub.unsubscribe();
            }

            const newSub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });

            // Send to backend
            const subData = newSub.toJSON();
            const res = await fetch(API_ENDPOINTS.NOTIFICATIONS.SUBSCRIBE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    endpoint: subData.endpoint,
                    p256dh: subData.keys.p256dh,
                    auth: subData.keys.auth
                })
            });

            if (!res.ok) {
                throw new Error(`Server returned ${res.status} when saving subscription.`);
            }

            setSubscription(newSub);
            setPermission(Notification.permission);
        } catch (error) {
            console.error('Failed to subscribe to push notifications:', error);
            setError(error.message || 'Failed to subscribe.');
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && permission === 'granted') {
            // Check if we already have a subscription on mount
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.pushManager.getSubscription().then(sub => {
                        if (sub) setSubscription(sub);
                    });
                });
            }
        }
    }, [isAuthenticated, permission]);

    const requestPermission = async () => {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result === 'granted' && isAuthenticated) {
            await subscribe();
        }
    };

    const unsubscribe = useCallback(async () => {
        if (!subscription) return;
        setError(null);

        try {
            // Unsubscribe from backend first
            await fetch(`${API_ENDPOINTS.NOTIFICATIONS.UNSUBSCRIBE}?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            // Unsubscribe from browser
            await subscription.unsubscribe();

            setSubscription(null);
            // Permission remains 'granted' in browser, but we clear local subscription state
        } catch (error) {
            console.error('Failed to unsubscribe:', error);
            setError('Failed to unsubscribe.');
        }
    }, [subscription]);

    return (
        <NotificationContext.Provider value={{ permission, subscription, error, requestPermission, subscribe, unsubscribe }}>
            {children}
        </NotificationContext.Provider>
    );
};
