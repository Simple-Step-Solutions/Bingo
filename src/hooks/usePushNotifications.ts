import { useEffect, useState } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { messaging, db } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

async function registerFcmToken(uid: string) {
  const msg = await messaging;
  if (!msg) return;

  const fcmReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/fcm-push/',
  });

  const token = await getToken(msg, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: fcmReg,
  });

  if (token) {
    await updateDoc(doc(db, 'users', uid), {
      fcmTokens: arrayUnion(token),
    });
  }

  // Handle foreground messages
  onMessage(msg, (payload) => {
    const { title = 'Chamber Bingo', body = '' } = payload.notification || {};
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.png' });
    }
  });
}

export function usePushNotifications(uid: string | undefined) {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!uid || !VAPID_KEY || !('Notification' in window) || !('serviceWorker' in navigator)) return;

    if (Notification.permission === 'granted') {
      registerFcmToken(uid).catch(err => console.warn('Push notification setup failed:', err));
    } else if (Notification.permission === 'default') {
      setShowPrompt(true);
    }
  }, [uid]);

  const requestPermission = async () => {
    setShowPrompt(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted' && uid) {
        await registerFcmToken(uid);
      }
    } catch (err) {
      console.warn('Push notification setup failed:', err);
    }
  };

  return { showPrompt, requestPermission, dismissPrompt: () => setShowPrompt(false) };
}
