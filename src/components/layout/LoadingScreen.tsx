import React from 'react';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block bg-neutral-900 p-6 rounded-[2.5rem] mb-8 shadow-2xl"
        >
          <LayoutGrid className="text-white" size={48} />
        </motion.div>
        <h2 className="font-serif italic text-3xl mb-4">Chamber Bingo</h2>
        <div className="flex items-center justify-center gap-3">
          <Loader2 className="animate-spin text-neutral-400" size={20} />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">Initializing...</span>
        </div>
      </div>
    </div>
  );
};
