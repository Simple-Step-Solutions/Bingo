import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const UpdateBanner: React.FC = () => {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW();

  const dismiss = () => setNeedRefresh(false);

  return (
    <AnimatePresence>
      {needRefresh && (
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
              onClick={() => updateServiceWorker(true)}
              className="bg-white text-neutral-900 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-neutral-100 transition-all"
            >
              Refresh
            </button>
            <button
              onClick={dismiss}
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
