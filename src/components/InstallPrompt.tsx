import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Share, SquarePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const DISMISSED_KEY = 'installPromptDismissedAt';
// Ask again after a couple of weeks rather than never, and rather than on
// every single page load as it did before.
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export const isStandalone = () =>
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

interface Props {
  /** Render regardless of snooze, for the manual "Install this app" entry. */
  force?: boolean;
  onClose?: () => void;
}

export const InstallPrompt: React.FC<Props> = ({ force = false, onClose }) => {
  const [deferred, setDeferred] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return; // Already installed, nothing to offer.

    setIos(isIosSafari());

    try {
      const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      setSnoozed(Boolean(at) && Date.now() - at < SNOOZE_MS);
    } catch {
      setSnoozed(false); // Private mode or storage disabled: just show it.
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const close = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
    onClose?.();
  }, [onClose]);

  if (dismissed) return null;
  if (isStandalone()) return null;
  if (!force && snoozed) return null;
  // Android and desktop: only once the browser says it is installable.
  // iOS: there is no such signal, so offer the manual instructions instead.
  if (!force && !deferred && !ios) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        role="dialog"
        aria-label="Install Chamber Bingo"
        className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-neutral-900 text-white rounded-3xl p-5 shadow-2xl mb-safe"
      >
        <div className="flex items-start gap-4">
          <div className="bg-white/10 p-3 rounded-2xl shrink-0">
            <Download size={20} aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm leading-tight">Add to Home Screen</p>
            {ios && !deferred ? (
              <>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  Chamber Bingo works best installed. It opens full screen and keeps
                  your board available when signal is patchy.
                </p>
                <ol className="mt-3 space-y-2 text-xs text-neutral-500">
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black shrink-0">1</span>
                    <span className="flex items-center gap-1.5">
                      Tap <Share size={13} className="inline shrink-0" aria-hidden="true" />
                      <span className="font-semibold">Share</span> in the toolbar
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black shrink-0">2</span>
                    <span className="flex items-center gap-1.5">
                      Choose <SquarePlus size={13} className="inline shrink-0" aria-hidden="true" />
                      <span className="font-semibold">Add to Home Screen</span>
                    </span>
                  </li>
                </ol>
              </>
            ) : (
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                Install Chamber Bingo for a full screen board and faster access
                while you are out visiting businesses.
              </p>
            )}
          </div>
          <button
            onClick={close}
            aria-label="Dismiss install prompt"
            className="text-neutral-500 hover:text-white transition-colors p-2 -m-1 shrink-0"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {deferred && (
          <button
            onClick={async () => {
              deferred.prompt();
              await deferred.userChoice;
              setDeferred(null);
              close();
            }}
            className="mt-4 w-full bg-white text-neutral-900 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all"
          >
            Install
          </button>
        )}

        {force && !deferred && !ios && (
          <p className="mt-4 text-[11px] text-neutral-400 leading-relaxed">
            Your browser handles installing from its own menu. Look for
            &ldquo;Install app&rdquo; or &ldquo;Add to Home Screen&rdquo; there.
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
