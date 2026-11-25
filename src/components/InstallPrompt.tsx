import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Share, SquarePlus, MoreHorizontal, ArrowDown, ArrowUp, EllipsisVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isIosSafari, isStandalone, promptInstall, useInstallState } from '../lib/installPrompt';
import { currentBrowser } from '../lib/browserEnv';
import { OpenInBrowser } from './OpenInBrowser';

export { isIosSafari, isStandalone };

const DISMISSED_KEY = 'installPromptDismissedAt';
// Ask again after a couple of weeks rather than never, and rather than on
// every single page load as it did before.
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

interface Props {
  /** Render regardless of snooze, for the manual "Install this app" entry. */
  force?: boolean;
  onClose?: () => void;
}

const Step: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <li className="flex items-center gap-2">
    <span className="w-6 h-6 rounded-full bg-[#1695B2] text-white flex items-center justify-center text-[11px] font-black shrink-0">{n}</span>
    <span className="text-[13px] leading-snug text-neutral-200 [&_svg]:inline [&_svg]:align-[-3px] [&_svg]:mx-0.5">{children}</span>
  </li>
);

/**
 * Apple does not let any website install itself, so this is as close to one
 * tap as iPhone gets. Safari 26 moved Share behind the ••• button, so the steps
 * follow the version. Chrome on iPhone keeps Share in its address bar.
 */
const IosSteps: React.FC = () => {
  const b = currentBrowser();
  const safari = b.safariMajor;
  const S = <Share size={15} aria-hidden="true" />;
  const plus = <SquarePlus size={15} aria-hidden="true" />;
  return (
    <ol className="mt-3 space-y-2.5">
      {safari !== null && safari >= 26 ? (
        <>
          <Step n={1}>Tap <MoreHorizontal size={15} aria-hidden="true" /> <b>next to the address bar</b></Step>
          <Step n={2}>Tap {S} <b>Share</b></Step>
          <Step n={3}>Tap {plus} <b>Add to Home Screen</b> <span className="text-neutral-400">(under More if you don&rsquo;t see it)</span></Step>
          <Step n={4}>Tap <b>Add</b></Step>
        </>
      ) : safari !== null ? (
        <>
          <Step n={1}>Tap {S} <b>Share</b> at the bottom of the screen</Step>
          <Step n={2}>Scroll down, tap {plus} <b>Add to Home Screen</b></Step>
          <Step n={3}>Tap <b>Add</b></Step>
        </>
      ) : (
        <>
          <Step n={1}>Tap {S} <b>Share</b> in the address bar</Step>
          <Step n={2}>Tap {plus} <b>Add to Home Screen</b></Step>
          <Step n={3}>Tap <b>Add</b></Step>
        </>
      )}
    </ol>
  );
};

/**
 * A bouncing arrow at the edge of the screen, pointing at where step 1 is on an
 * iPhone. iPad puts its toolbar elsewhere, so it gets the steps only.
 */
const IosPointer: React.FC = () => {
  const b = currentBrowser();
  if (!/iPhone|iPod/.test(b.ua)) return null;
  const safari = b.safariMajor;
  const top = safari === null; // Chrome and Edge on iPhone: Share is top right.
  const pos = top ? 'top-2 right-4' : safari >= 26 ? 'bottom-1 right-5' : 'bottom-1 left-1/2 -translate-x-1/2';
  const Arrow = top ? ArrowUp : ArrowDown;
  return (
    <motion.div
      aria-hidden="true"
      className={`fixed ${pos} z-[60] pointer-events-none`}
      animate={{ y: top ? [0, -10, 0] : [0, 10, 0] }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="bg-[#CC5500] text-white rounded-full p-2 shadow-xl">
        <Arrow size={22} strokeWidth={3} />
      </div>
    </motion.div>
  );
};

export const InstallPrompt: React.FC<Props> = ({ force = false, onClose }) => {
  const { canPrompt: deferred, standalone } = useInstallState();
  const [dismissed, setDismissed] = useState(false);
  const [ios, setIos] = useState(false);
  const [inApp, setInApp] = useState<string | null>(null);
  const [snoozed, setSnoozed] = useState(true);

  useEffect(() => {
    if (isStandalone()) return; // Already installed, nothing to offer.

    // Every iOS browser installs the same way, from Share. Chrome and Edge on
    // iPhone have had Add to Home Screen since iOS 16.4, so this is not just
    // Safari any more.
    const b = currentBrowser();
    setIos(b.platform === 'ios');
    setInApp(b.inApp);

    try {
      const at = Number(localStorage.getItem(DISMISSED_KEY) || 0);
      setSnoozed(Boolean(at) && Date.now() - at < SNOOZE_MS);
    } catch {
      setSnoozed(false); // Private mode or storage disabled: just show it.
    }
  }, []);

  const close = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, String(Date.now())); } catch { /* ignore */ }
    onClose?.();
  }, [onClose]);

  if (dismissed) return null;
  if (standalone) return null;
  if (!force && snoozed) return null;
  // Android and desktop: only once the browser says it is installable.
  // iOS: there is no such signal, so offer the manual instructions instead.
  if (!force && !deferred && !ios) return null;
  // Inside Facebook or Instagram the steps would not work; the sign-in page
  // already shows how to get out.
  if (!force && inApp) return null;

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
            {inApp && !deferred ? (
              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                This page is open inside another app, which cannot install anything.
              </p>
            ) : ios && !deferred ? (
              <>
                <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                  iPhone installs from the Share menu. It takes about ten seconds.
                </p>
                <IosSteps />
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
              await promptInstall();
              close();
            }}
            className="mt-4 w-full bg-white text-neutral-900 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neutral-100 transition-all"
          >
            Install
          </button>
        )}

        {inApp && !deferred && (
          <OpenInBrowser className="mt-4" why="Open it in a real browser to add it to your home screen." />
        )}

        {force && !deferred && !ios && !inApp && (
          <p className="mt-4 text-[11px] text-neutral-400 leading-relaxed flex items-center gap-1 flex-wrap">
            Tap <EllipsisVertical size={13} className="inline" aria-hidden="true" /> in your browser&rsquo;s
            toolbar, then <span className="font-semibold text-neutral-200">Install app</span> or
            <span className="font-semibold text-neutral-200">Add to Home screen</span>.
          </p>
        )}
      </motion.div>
      {ios && !deferred && !inApp && <IosPointer />}
    </AnimatePresence>
  );
};
