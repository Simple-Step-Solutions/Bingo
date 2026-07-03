import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';

export interface TourStep {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  title: string;
  body: string;
}

interface TourModalProps {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

export const TourModal: React.FC<TourModalProps> = ({
  steps, currentStep, onNext, onBack, onSkip, onDone,
}) => {
  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;

  return (
    <div className="fixed inset-0 z-[85] flex items-end md:items-center justify-center md:p-4 bg-neutral-900/50">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className="bg-white w-full max-w-md rounded-t-[2rem] md:rounded-[2rem] overflow-hidden shadow-2xl"
        >
          {/* Top accent bar */}
          <div className="h-1.5 bg-[var(--color-primary)]" />

          <div className="p-8">
            {/* Skip button */}
            <div className="flex justify-end mb-6">
              <button
                onClick={onSkip}
                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-neutral-300 hover:text-neutral-500 transition-colors"
              >
                <X size={12} /> Skip Tour
              </button>
            </div>

            {/* Icon */}
            <div
              className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6"
              style={{ background: step.iconBg }}
            >
              {step.icon}
            </div>

            {/* Label + title */}
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-center mb-2" style={{ color: 'var(--color-primary)' }}>
              {step.label}
            </p>
            <h2 className="font-serif italic text-3xl text-center text-neutral-900 mb-4 leading-tight">
              {step.title}
            </h2>
            <p className="text-sm text-neutral-500 leading-relaxed text-center mb-8">
              {step.body}
            </p>

            {/* Progress dots */}
            <div className="flex justify-center gap-1.5 mb-8">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`rounded-full transition-all duration-300 ${
                    i === currentStep
                      ? 'w-6 h-2 bg-neutral-900'
                      : i < currentStep
                      ? 'w-2 h-2 bg-neutral-300'
                      : 'w-2 h-2 bg-neutral-100'
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              {!isFirst && (
                <button
                  onClick={onBack}
                  className="flex items-center justify-center gap-2 px-5 py-4 rounded-2xl border border-neutral-200 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:border-neutral-900 hover:text-neutral-900 transition-all"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <button
                onClick={isLast ? onDone : onNext}
                className="flex-1 bg-neutral-900 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-neutral-700 transition-all active:scale-95 shadow-lg"
              >
                {isLast ? "Let's go!" : (
                  <>Next <ChevronRight size={16} /></>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
