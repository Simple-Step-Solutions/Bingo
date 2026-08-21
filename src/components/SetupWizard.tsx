import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { AppSettings } from '../types';
import { LayoutGrid, Loader2, Sparkles } from 'lucide-react';
import { bootstrapAdmin, errorMessage, isExpectedError } from '../services/api';

const DEFAULTS: AppSettings = {
  freeSpaceName: 'FREE',
  freeSpaceTask: 'Visit any participating business',
  boardSize: 3,
  difficulty: 30,
  raffleEnabled: false,
  raffleDescription: '',
  raffleRequirement: 5,
  bingoPrize: '',
  showRealtimeMapToChamber: false,
  primaryColor: '#1695B2',
  accentColor: '#CC5500',
  chamberName: 'Hudson Valley Gateway Chamber of Commerce',
};

export const SetupWizard: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const initialize = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'settings', 'global'), DEFAULTS);
      setDone(true);
    } catch (err) {
      console.error('Failed to initialize settings:', err);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <div className="inline-block bg-[var(--color-primary,#1695B2)] p-4 rounded-3xl mb-6 shadow-2xl">
            <LayoutGrid className="text-white" size={48} />
          </div>
          <h1 className="font-serif italic text-5xl mb-2">Chamber Bingo</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--color-primary,#1695B2)]">
            Hudson Valley Gateway
          </p>
        </div>

        <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-neutral-100">
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Sparkles className="text-green-500" size={32} />
              </div>
              <h2 className="font-serif italic text-3xl mb-3">All set!</h2>
              <p className="text-neutral-500 text-sm leading-relaxed">
                The app is initialized. The page will reload automatically.
              </p>
            </div>
          ) : (
            <>
              <h2 className="font-serif italic text-3xl mb-3">First-time setup</h2>
              <p className="text-neutral-500 text-sm leading-relaxed mb-8">
                No configuration exists yet. Click below to initialize the app with default settings. You can adjust everything from the Game Master panel afterward.
              </p>

              <div className="space-y-3 mb-8 text-[11px] font-bold uppercase tracking-widest text-neutral-400">
                <div className="flex justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span>Board size</span><span className="text-neutral-900">3x3</span>
                </div>
                <div className="flex justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span>Difficulty</span><span className="text-neutral-900">30% mixed</span>
                </div>
                <div className="flex justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span>Raffle</span><span className="text-neutral-900">Off</span>
                </div>
                <div className="flex justify-between p-3 bg-neutral-50 rounded-xl border border-neutral-100">
                  <span>Primary color</span>
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full inline-block" style={{ backgroundColor: '#1695B2' }} />
                    #1695B2
                  </span>
                </div>
              </div>

              <button
                onClick={initialize}
                disabled={loading}
                className="w-full bg-[var(--color-primary,#1695B2)] text-white py-5 rounded-2xl font-bold text-sm hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                {loading ? 'Initializing...' : 'Initialize App'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Shown to everyone before the chamber has run setup.
 *
 * The administrator claim used to be a hardcoded email compared in the client
 * and again in the security rules. It is now a server-side check against a
 * function parameter, requiring a verified email and refusing once an admin
 * exists. So this button is safe to show to anyone: pressing it does nothing
 * unless you are the configured address.
 */
export const SetupPending: React.FC = () => {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claimAdmin = async () => {
    setClaiming(true);
    setError(null);
    try {
      await bootstrapAdmin({});
      // The admin claim has to be on the token before the wizard's writes run.
      await auth.currentUser?.getIdToken(true);
    } catch (err) {
      if (!isExpectedError(err)) console.error('bootstrapAdmin failed:', err);
      setError(errorMessage(err, 'This account cannot set up the app.'));
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <div className="max-w-sm w-full text-center">
        <div className="inline-block bg-[var(--color-primary,#1695B2)] p-4 rounded-3xl mb-6 shadow-2xl">
          <LayoutGrid className="text-white" size={48} aria-hidden="true" />
        </div>
        <h1 className="font-serif italic text-4xl mb-3">Coming Soon</h1>
        <p className="text-neutral-500 text-sm leading-relaxed">
          The Hudson Valley Gateway Chamber Bingo app is being set up. Check back shortly.
        </p>

        {error && (
          <div role="alert" className="mt-6 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-red-600 text-xs font-bold">{error}</p>
          </div>
        )}

        <button
          onClick={claimAdmin}
          disabled={claiming}
          className="mt-8 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-50"
        >
          {claiming ? 'Checking...' : 'I am the administrator'}
        </button>
      </div>
    </div>
  );
};
