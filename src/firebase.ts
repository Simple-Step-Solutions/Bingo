import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// This project uses a NAMED Firestore database, not (default). Anything that
// touches Firestore (client, Cloud Functions, rules deploys) has to say so
// explicitly or it silently reads and writes an empty (default) database.
const databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

const app = initializeApp(firebaseConfig);

/**
 * Offline persistence.
 *
 * Without a local cache every onSnapshot just hangs when the device is offline,
 * so a cold launch with no signal sat on the loading spinner forever even though
 * the service worker had served the app shell. Players use this walking around
 * town on patchy cell service, so the cache is doing real work.
 *
 * persistentMultipleTabManager keeps the cache coherent when someone has the
 * PWA installed and the site open in a browser tab at the same time.
 */
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  },
  databaseId,
);

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence,
  popupRedirectResolver: browserPopupRedirectResolver,
});
/**
 * Callables live in us-east1. This region argument is not optional: the default
 * is us-central1, and calling a function that is not there fails with a bare
 * 404 that looks like the function does not exist at all.
 */
export const functions = getFunctions(app, 'us-east1');

export const storage = getStorage(app);
export const messaging = isSupported().then(yes => yes ? getMessaging(app) : null);
