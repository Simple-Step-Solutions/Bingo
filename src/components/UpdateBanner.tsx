import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const UpdateBanner: React.FC = () => {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) setWaitingWorker(reg.waiting);
    };

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return;
      checkForWaiting(reg);
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setDismissed(false);
          }
        });
      });
    });
  }, []);

  const applyUpdate = () => {
    if (!waitingWorker) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  };

  const show = !!waitingWorker && !dismissed;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed top-0 inset-x-0 z-[100] flex items-center justify-between gap-4 bg-neutral-900 text-white px-4 py-3 shadow-xl"
        >
          <div className="flex items-center gap-3">
            <RefreshCw size={14} className="text-neutral-400 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Update available</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={applyUpdate}
              className="bg-white text-neutral-900 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-neutral-100 transition-all"
            >
              Refresh
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-1.5 text-neutral-500 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
