import React, { useState, useRef, useEffect, useId } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTipProps {
  /** Plain sentences. Each string renders as its own paragraph. */
  children: React.ReactNode;
  /** Accessible name, so the button is not just "question mark". */
  label: string;
  align?: 'left' | 'right';
}

/**
 * The "?" next to a setting.
 *
 * Every one of these exists because a chamber volunteer has to answer the
 * question on their own at 8am on event day. Prefer a worked example over a
 * restatement of the label: "50% means about half the squares on a Peekskill
 * player's board are Peekskill businesses" beats "controls the town mix".
 */
export const HelpTip: React.FC<HelpTipProps> = ({ children, label, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className="text-neutral-400 hover:text-[var(--color-primary)] transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <HelpCircle size={13} aria-hidden="true" />
      </button>

      {open && (
        // A div rather than a span: callers write paragraphs, and a tooltip
        // that is one long run-on sentence is not worth reading.
        <div
          id={id}
          role="note"
          className={`absolute z-50 top-6 w-72 bg-neutral-900 text-white rounded-2xl p-4 shadow-2xl normal-case tracking-normal font-normal text-[11px] leading-relaxed space-y-2 [&>p]:m-0 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      )}
    </span>
  );
};
