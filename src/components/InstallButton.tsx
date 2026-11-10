import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { InstallPrompt } from './InstallPrompt';
import { promptInstall, useInstallState } from '../lib/installPrompt';

interface Props {
  /**
   * `full`: a wide button, for the sign-in page and Profile.
   * `compact`: a small pill that fits beside other header buttons.
   */
  variant?: 'full' | 'compact';
  className?: string;
}

/**
 * The one-tap "get the app" button.
 *
 * Where the browser supports it (Chrome, Edge, Samsung Internet on Android
 * and desktop) this opens the native install dialog directly, no menus.
 * iPhone and iPad do not let any website install itself, so there it opens
 * the two-step Share > Add to Home Screen walkthrough instead. Hidden once
 * the app is already running installed.
 */
export const InstallButton: React.FC<Props> = ({ variant = 'full', className = '' }) => {
  const { canPrompt, standalone } = useInstallState();
  const [showHelp, setShowHelp] = useState(false);

  if (standalone) return null;

  const onClick = async () => {
    if (canPrompt) {
      await promptInstall();
      return;
    }
    setShowHelp(true);
  };

  return (
    <>
      {variant === 'compact' ? (
        <button
          type="button"
          onClick={onClick}
          aria-label="Get the Chamber Bingo app"
          className={`flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white shadow-sm transition-all hover:opacity-90 ${className}`}
          style={{ background: 'var(--color-primary)' }}
        >
          <Download size={13} aria-hidden="true" />
          App
        </button>
      ) : (
        <button
          type="button"
          onClick={onClick}
          className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-sm text-white shadow-sm hover:shadow-md transition-all active:scale-95 ${className}`}
          style={{ background: 'var(--color-primary)' }}
        >
          <Download size={18} aria-hidden="true" />
          Get the app
        </button>
      )}
      {showHelp && <InstallPrompt force onClose={() => setShowHelp(false)} />}
    </>
  );
};
