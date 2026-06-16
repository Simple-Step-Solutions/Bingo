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
          className="inline-block bg-[var(--color-primary,#1695B2)] p-6 rounded-[2.5rem] mb-8 shadow-2xl"
        >
          <LayoutGrid className="text-white" size={48} />
        </motion.div>
        <h2 className="font-serif italic text-3xl mb-1">Chamber Bingo</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-primary,#1695B2)] mb-4">Hudson Valley Gateway</p>
        <div className="flex items-center justify-center gap-3 mb-8">
          <Loader2 className="animate-spin text-neutral-400" size={20} />
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-neutral-400">Loading...</span>
        </div>
        <a
          href="https://www.simplestepsolutions.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 group"
        >
          <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Powered by</span>
          <img src="/sss-logo.png" alt="Simple Step Solutions" className="h-4 w-auto opacity-50 group-hover:opacity-100 transition-opacity" />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#1695B2' }}>Simple Step Solutions</span>
        </a>
      </div>
    </div>
  );
};
