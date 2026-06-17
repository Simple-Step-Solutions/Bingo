import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const InstallPrompt: React.FC = () => {
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!prompt || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 bg-neutral-900 text-white rounded-3xl p-5 shadow-2xl flex items-center gap-4"
      >
        <div className="bg-white/10 p-3 rounded-2xl shrink-0">
          <Download size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm leading-tight">Add to Home Screen</p>
          <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-0.5">Install for the best experience</p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={async () => {
              prompt.prompt();
              await prompt.userChoice;
              setPrompt(null);
            }}
            className="bg-white text-neutral-900 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neutral-100 transition-all"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-neutral-500 hover:text-white transition-colors text-center"
          >
            <X size={14} className="mx-auto" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
