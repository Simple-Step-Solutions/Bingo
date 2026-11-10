import { useSyncExternalStore } from 'react';

/**
 * One app-wide holder for the browser's install offer.
 *
 * Chrome, Edge and Samsung Internet fire `beforeinstallprompt` ONCE per page
 * load, often before React has mounted anything. Each InstallPrompt used to
 * register its own listener, so only whichever instance happened to be mounted
 * at that moment ever saw the event. The "Install this app" button on Profile
 * mounted later, never received it, and fell back to "look in your browser
 * menu" on exactly the phones where a one-tap install was available.
 *
 * Capturing it here, at import time from main.tsx, means every button in the
 * app can trigger the real install dialog.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Suppress Chrome's own mini-infobar; we offer install on our terms.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

export const isStandalone = () =>
  installed ||
  window.matchMedia('(display-mode: standalone)').matches ||
  // iOS Safari does not implement display-mode, it sets navigator.standalone.
  (window.navigator as unknown as { standalone?: boolean }).standalone === true;

/** iOS Safari, where beforeinstallprompt does not and will not fire. */
export const isIosSafari = () => {
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac; the touch points check separates them.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  // Chrome and Firefox on iOS cannot install to the home screen at all.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
};

/**
 * Show the browser's native install dialog. Resolves true if the player
 * accepted. The event is single use, so it is cleared either way.
 */
export const promptInstall = async (): Promise<boolean> => {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
};

export const useInstallState = () => {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const standalone = useSyncExternalStore(subscribe, isStandalone, () => false);
  return { canPrompt, standalone };
};
