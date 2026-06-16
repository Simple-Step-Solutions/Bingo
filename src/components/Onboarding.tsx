import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Town, AppSettings, Business, UserProfile } from '../types';
import { generateBingoBoard } from '../services/bingoService';
import { MapPin, QrCode, Trophy, Store, ChevronRight, CheckCircle2 } from 'lucide-react';

interface OnboardingProps {
  user: UserProfile;
  towns: Town[];
  businesses: Business[];
  settings: AppSettings;
  onComplete: () => void;
}

const STEPS = ['welcome', 'howtoplay', 'town'] as const;
type Step = typeof STEPS[number];

export const Onboarding: React.FC<OnboardingProps> = ({ user, towns, businesses, settings, onComplete }) => {
  const [step, setStep] = useState<Step>('welcome');
  const [saving, setSaving] = useState(false);

  const currentIndex = STEPS.indexOf(step);

  const advance = () => {
    const next = STEPS[currentIndex + 1];
    if (next) setStep(next);
  };

  const selectTown = async (townName: string) => {
    setSaving(true);
    try {
      const newBoard = generateBingoBoard(businesses, settings, townName);
      await setDoc(doc(db, 'users', user.uid), {
        town: townName,
        bingoBoard: newBoard,
        boardSize: settings.boardSize || 3,
        onboardingComplete: true,
      }, { merge: true });
      onComplete();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-neutral-900/95 backdrop-blur-xl overflow-y-auto">
      <AnimatePresence mode="wait">

        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="bg-white w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl my-auto"
          >
            <div className="h-3 bg-[#1695B2]" />
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-[#1695B2]/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <div className="grid grid-cols-2 gap-1.5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`w-6 h-6 rounded-md ${i === 3 ? 'bg-[#CC5500]' : 'bg-[#1695B2]'}`} />
                  ))}
                </div>
              </div>

              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1695B2] mb-3">
                Hudson Valley Gateway Chamber of Commerce
              </p>
              <h2 className="font-serif italic text-4xl mb-4 text-neutral-900">Welcome to Chamber Bingo</h2>
              <p className="text-neutral-500 leading-relaxed mb-10">
                Discover local businesses, complete tasks, and win prizes. Every square on your board is a real business in your community.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center">
                    <Store size={22} className="text-neutral-400" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 leading-tight text-center">Visit local<br/>businesses</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center">
                    <QrCode size={22} className="text-neutral-400" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 leading-tight text-center">Scan to<br/>verify</span>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 bg-neutral-50 rounded-2xl flex items-center justify-center">
                    <Trophy size={22} className="text-neutral-400" />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 leading-tight text-center">Get bingo,<br/>win prizes</span>
                </div>
              </div>

              <button
                onClick={advance}
                className="w-full bg-[#1695B2] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[#1282a0] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
              >
                Get Started <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'howtoplay' && (
          <motion.div
            key="howtoplay"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="bg-white w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl my-auto"
          >
            <div className="h-3 bg-[#1695B2]" />
            <div className="p-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1695B2] mb-3 text-center">How It Works</p>
              <h2 className="font-serif italic text-4xl mb-8 text-neutral-900 text-center">Three simple steps</h2>

              <div className="space-y-4 mb-10">
                <div className="flex items-start gap-5 p-5 bg-neutral-50 rounded-3xl border border-neutral-100">
                  <div className="w-10 h-10 bg-[#1695B2] text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0">1</div>
                  <div>
                    <p className="font-bold text-sm mb-1">Visit a business on your board</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">Each square is a local business with a specific task. Tap any square to see the details, get directions, and learn what to do when you arrive.</p>
                  </div>
                </div>

                <div className="flex items-start gap-5 p-5 bg-neutral-50 rounded-3xl border border-neutral-100">
                  <div className="w-10 h-10 bg-[#1695B2] text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0">2</div>
                  <div>
                    <p className="font-bold text-sm mb-1">Complete the task and scan in</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">Once you've completed the task, scan the business's QR code, tap their NFC tag, or enter the code they give you. You need to be at the location to verify.</p>
                  </div>
                </div>

                <div className="flex items-start gap-5 p-5 bg-neutral-50 rounded-3xl border border-neutral-100">
                  <div className="w-10 h-10 bg-[#CC5500] text-white rounded-2xl flex items-center justify-center font-black text-sm shrink-0">3</div>
                  <div>
                    <p className="font-bold text-sm mb-1">Complete a line to win</p>
                    <p className="text-xs text-neutral-500 leading-relaxed">Get a full row, column, or diagonal on your board and you've got bingo. Show your completed board to claim your prize from the Chamber.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={advance}
                className="w-full bg-[#1695B2] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[#1282a0] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
              >
                Choose My Town <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {step === 'town' && (
          <motion.div
            key="town"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="bg-white w-full max-w-md rounded-[3rem] overflow-hidden shadow-2xl my-auto"
          >
            <div className="h-3 bg-[#1695B2]" />
            <div className="p-10">
              <div className="w-16 h-16 bg-[#1695B2]/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <MapPin className="text-[#1695B2]" size={32} />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#1695B2] mb-3 text-center">Last Step</p>
              <h2 className="font-serif italic text-4xl mb-3 text-neutral-900 text-center">Pick your area</h2>
              <p className="text-neutral-500 text-sm leading-relaxed mb-8 text-center">
                Your bingo board is built from businesses in your town. Choose the area you'd like to explore.
              </p>

              <div className="space-y-3 mb-8">
                {towns.length > 0 ? towns.map(town => (
                  <button
                    key={town.id}
                    onClick={() => selectTown(town.name)}
                    disabled={saving}
                    className="w-full p-5 rounded-2xl border-2 border-neutral-100 hover:border-[#1695B2] hover:bg-[#1695B2]/5 transition-all font-bold text-sm flex items-center justify-between group disabled:opacity-50"
                  >
                    <span>{town.name}</span>
                    <ChevronRight size={16} className="text-neutral-300 group-hover:text-[#1695B2] transition-colors" />
                  </button>
                )) : (
                  <div className="p-8 bg-neutral-50 rounded-2xl border border-dashed border-neutral-200 text-center">
                    <p className="text-xs text-neutral-400 italic">No towns are set up yet. Contact your Chamber administrator.</p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <CheckCircle2 size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 font-bold uppercase tracking-widest leading-relaxed">
                  Your town selection is permanent. Your board will be filled with businesses from that area.
                </p>
              </div>
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Step dots */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`rounded-full transition-all duration-300 ${
              i === currentIndex
                ? 'w-6 h-2 bg-white'
                : i < currentIndex
                ? 'w-2 h-2 bg-white/60'
                : 'w-2 h-2 bg-white/20'
            }`}
          />
        ))}
      </div>
    </div>
  );
};
