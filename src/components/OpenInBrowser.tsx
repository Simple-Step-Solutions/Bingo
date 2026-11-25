import React, { useState } from 'react';
import { Compass, Copy, Check, MoreHorizontal, ExternalLink } from 'lucide-react';
import { androidChromeIntent, currentBrowser } from '../lib/browserEnv';

/**
 * Shown when the page is running inside Facebook, Instagram, Messenger and the
 * like. Google will not sign anyone in there and the app cannot be installed
 * from there, so the only real fix is getting the player into Safari or Chrome.
 *
 * The link handed over carries the pending invite. Auth.tsx moves the token out
 * of the address bar into localStorage, and the in-app browser's storage does
 * not travel to Safari, so without this a business owner would arrive in Safari
 * with no invite.
 */

const linkToShare = () => {
  const url = new URL(window.location.origin + window.location.pathname);
  try {
    const invite = localStorage.getItem('pendingInvite');
    if (invite) url.searchParams.set('invite', invite);
  } catch { /* storage blocked */ }
  return url.toString();
};

interface Props {
  /** The reason the player is being sent out, in a few words. */
  why?: string;
  className?: string;
}

export const OpenInBrowser: React.FC<Props> = ({ why = 'Google sign-in and installing the app do not work in here.', className = '' }) => {
  const b = currentBrowser();
  const [copied, setCopied] = useState(false);
  const browserName = b.platform === 'ios' ? 'Safari' : b.platform === 'android' ? 'Chrome' : 'your browser';
  const appName = b.inApp && b.inApp !== 'app' ? b.inApp : 'another app';

  const copy = async () => {
    const link = linkToShare();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Older WebViews have no async clipboard. Fall back to a selection copy.
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      try { document.execCommand('copy'); } catch { /* nothing more to try */ }
      el.remove();
    }
    setCopied(true);
  };

  return (
    <div className={`bg-[#CC5500]/10 border border-[#CC5500]/30 rounded-2xl p-5 text-left ${className}`} role="alert">
      <div className="flex items-center gap-2 mb-2">
        <Compass size={18} className="text-[#CC5500] shrink-0" aria-hidden="true" />
        <p className="font-bold text-sm text-neutral-900">Open this page in {browserName}</p>
      </div>
      <p className="text-xs text-neutral-600 leading-relaxed">
        You opened this link inside {appName}. {why}
      </p>

      {b.platform === 'android' ? (
        <a
          href={androidChromeIntent(linkToShare())}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white"
          style={{ background: '#CC5500' }}
        >
          <ExternalLink size={16} aria-hidden="true" />
          Open in Chrome
        </a>
      ) : (
        <ol className="mt-3 space-y-2 text-xs text-neutral-700">
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#CC5500] text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
            <span className="flex items-center gap-1.5 flex-wrap">
              Tap <MoreHorizontal size={14} className="inline" aria-hidden="true" /> <span className="font-semibold">the menu</span>, usually at the top right
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#CC5500] text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
            <span>Choose <span className="font-semibold">Open in {b.platform === 'ios' ? 'Safari' : 'browser'}</span> or <span className="font-semibold">Open in external browser</span></span>
          </li>
        </ol>
      )}

      <button
        type="button"
        onClick={copy}
        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-xs bg-white border border-neutral-200 text-neutral-700"
      >
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? `Copied. Paste it into ${browserName}.` : 'Or copy the link'}
      </button>
    </div>
  );
};
