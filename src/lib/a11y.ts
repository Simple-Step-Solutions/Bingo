import { useEffect, useRef } from 'react';

/**
 * True when the user has asked for reduced motion.
 *
 * The CSS media query in index.css handles animations and transitions, but
 * canvas-confetti draws to a canvas on a rAF loop and is completely unaffected
 * by it. A full-screen particle burst is exactly the kind of thing the setting
 * exists to prevent, so callers check this before firing one.
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Focus management for a modal or bottom sheet.
 *
 * Gives a dialog the three things none of this app's five modals had: focus
 * moves into it when it opens, Tab cannot escape it while it is open, and
 * focus returns to whatever opened it on close. Escape closes.
 *
 * Without this a screen reader or keyboard user opening a dialog stays parked
 * on the page behind it, tabbing through content that is visually covered.
 *
 * Attach the returned ref to the dialog container.
 */
export const useModalA11y = (isOpen: boolean, onClose: () => void) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    if (node) {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      // Fall back to the container so the reader announces the dialog itself
      // rather than leaving focus on the page behind it.
      (first ?? node).focus({ preventScroll: true });
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;

      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    // The page behind a modal should not scroll under it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, onClose]);

  return ref;
};
