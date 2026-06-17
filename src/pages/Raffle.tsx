import React, { useState, useEffect } from 'react';
import { Trophy, Ticket, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, where, onSnapshot, addDoc, getDocs, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, AppSettings, RaffleEntry, Completion } from '../types';

interface RaffleProps {
  user: UserProfile;
}

export const Raffle: React.FC<RaffleProps> = ({ user }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [userEntries, setUserEntries] = useState<RaffleEntry[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data() as AppSettings);
    });

    const qEntries = query(collection(db, 'raffle_entries'), where('userId', '==', user.uid));
    const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
      setUserEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RaffleEntry)));
    });

    const qCompletions = query(collection(db, 'completions'), where('userId', '==', user.uid));
    const unsubscribeCompletions = onSnapshot(qCompletions, (snapshot) => {
      setCompletions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Completion)));
      setLoading(false);
    });

    return () => {
      unsubscribeSettings();
      unsubscribeEntries();
      unsubscribeCompletions();
    };
  }, [user.uid]);

  const enterRaffle = async () => {
    if (!settings?.raffleEnabled || userEntries.length > 0) return;
    
    const requirement = settings.raffleRequirement || 5;
    if (completions.length < requirement) {
      setError(`You need at least ${requirement} completions to enter. You have ${completions.length}.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'raffle_entries'), {
        userId: user.uid,
        userName: user.displayName || user.email,
        userEmail: user.email,
        timestamp: new Date().toISOString(),
        completionsCount: completions.length
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      console.error('Error entering raffle:', err);
      setError('Failed to enter raffle. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  if (!settings?.raffleEnabled) return (
    <div className="max-w-2xl mx-auto text-center py-20">
      <div className="bg-white rounded-3xl p-12 shadow-sm border border-neutral-100">
        <Trophy className="mx-auto text-neutral-200 mb-6" size={64} />
        <h2 className="font-serif italic text-3xl mb-4">Raffle is Closed</h2>
        <p className="text-neutral-500">The Chamber is currently not running any active raffles. Check back later!</p>
      </div>
    </div>
  );

  const requirement = settings.raffleRequirement || 5;
  const hasAlreadyEntered = userEntries.length > 0;
  const canEnter = completions.length >= requirement && !hasAlreadyEntered;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-neutral-900 text-white p-8 rounded-3xl mb-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Trophy size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <Trophy className="text-yellow-400" size={24} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Active Raffle</span>
          </div>
          
          <h2 className="font-serif italic text-4xl mb-4">Chamber Prize Draw</h2>
          <p className="text-neutral-400 text-lg leading-relaxed mb-8">
            {settings.raffleDescription || "Complete tasks at local businesses to earn entries into our monthly prize draw!"}
          </p>

          <div className="flex flex-wrap gap-4 items-center">
            <div className="bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">Requirement: {requirement} Tasks</span>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">Your Progress: {completions.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-100">
          <h3 className="font-serif italic text-2xl mb-6">Enter Now</h3>
          
          <AnimatePresence mode="wait">
            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-50 text-green-700 p-6 rounded-2xl flex items-center gap-4 mb-6"
              >
                <CheckCircle2 size={24} />
                <p className="text-sm font-medium">Entry submitted successfully!</p>
              </motion.div>
            ) : error ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 text-red-700 p-6 rounded-2xl flex items-center gap-4 mb-6"
              >
                <AlertCircle size={24} />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <button
            onClick={enterRaffle}
            disabled={submitting || !canEnter}
            className={`w-full py-5 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all ${
              canEnter 
                ? 'bg-neutral-900 text-white hover:bg-neutral-800 shadow-lg hover:shadow-xl' 
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {submitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : hasAlreadyEntered ? (
              <>
                <CheckCircle2 size={20} className="text-green-500" />
                Entry Submitted
              </>
            ) : (
              <>
                <Ticket size={20} />
                Submit Entry
              </>
            )}
          </button>
          
          {!canEnter && !hasAlreadyEntered && (
            <p className="text-center text-xs text-neutral-400 mt-4">
              You need {requirement - completions.length} more tasks to qualify.
            </p>
          )}
          {hasAlreadyEntered && (
            <p className="text-center text-xs text-neutral-400 mt-4">
              You've already entered this raffle! Good luck!
            </p>
          )}
        </div>

        <div className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-100">
          <h3 className="font-serif italic text-2xl mb-6">Your Entries</h3>
          <div className="space-y-4">
            {userEntries.length === 0 ? (
              <div className="text-center py-8">
                <Ticket className="mx-auto text-neutral-100 mb-4" size={48} />
                <p className="text-neutral-400 text-sm">No entries yet.</p>
              </div>
            ) : (
              userEntries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                  <div>
                    <p className="text-sm font-bold">Entry #{entry.id.slice(-4).toUpperCase()}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest">
                      {new Date(entry.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-full border border-neutral-200">
                    <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest">Confirmed</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

