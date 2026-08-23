import React, { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface ConfirmButtonProps {
  /** What the button looks like before it is armed. */
  children: React.ReactNode;
  /** Headline of the confirmation, e.g. "Delete Main Street Bakery?" */
  title: string;
  /** What actually happens. Say the consequence, not "are you sure". */
  body: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
  ariaLabel?: string;
  align?: 'left' | 'right';
}

/**
 * Two-step destructive confirm.
 *
 * Deleting a business, town, raffle entry or winner used to be a single
 * unconfirmed click, while resetting one player took two. The chamber runs this
 * alone, so every irreversible action gets the same treatment and every
 * confirmation states the consequence rather than asking "are you sure".
 */
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  children, title, body, confirmLabel = 'Delete', onConfirm, className = '',
  ariaLabel, align = 'right',
}) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!armed) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setArmed(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmed(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [armed]);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setArmed(v => !v)}
        aria-label={ariaLabel}
        aria-expanded={armed}
        className={className}
      >
        {children}
      </button>

      {armed && (
        <div
          role="alertdialog"
          aria-label={title}
          className={`absolute z-50 top-full mt-2 w-72 bg-white border border-red-200 rounded-2xl p-4 shadow-2xl text-left normal-case tracking-normal ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="text-xs font-bold text-neutral-900 mb-1">{title}</p>
          <p className="text-[11px] text-neutral-500 leading-relaxed mb-3">{body}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 text-white px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {busy && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
              {confirmLabel}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-neutral-200 text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
};
