import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { messaging, db } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export function usePushNotifications(uid: string | undefined) {
  useEffect(() => {
    if (!uid || !VAPID_KEY || !('Notification' in window) || !('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const msg = await messaging;
        if (!msg) return;

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Use the existing vite-plugin-pwa service worker registration
        const swReg = await navigator.serviceWorker.ready;

        // Get FCM token
        const token = await getToken(msg, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          // Store token in user's Firestore doc (arrayUnion prevents duplicates)
          await updateDoc(doc(db, 'users', uid), {
            fcmTokens: arrayUnion(token),
          });
        }

        // Handle foreground messages
        onMessage(msg, (payload) => {
          const { title = 'Chamber Bingo', body = '' } = payload.notification || {};
          if (Notification.permission === 'granted') {
            new Notification(title, {
              body,
              icon: '/icons/icon-192.png',
            });
          }
        });
      } catch (err) {
        // Non-fatal -- push notifications are an enhancement
        console.warn('Push notification setup failed:', err);
      }
    };

    register();
  }, [uid]);
}
