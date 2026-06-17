import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { UserProfile, Town, Completion } from '../types';
import { motion } from 'motion/react';
import { LogOut, RotateCcw, CheckCircle2, Trophy, MapPin, Loader2, ChevronDown } from 'lucide-react';

interface ProfileProps {
  user: UserProfile;
  towns: Town[];
}

export const Profile: React.FC<ProfileProps> = ({ user, towns }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTown, setSelectedTown] = useState(user.town || '');
  const [savingTown, setSavingTown] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [townSaved, setTownSaved] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'completions'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snapshot) => {
      setCompletions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion)));
      setLoading(false);
    });
    return () => unsub();
  }, [user.uid]);

  const initials = (user.displayName || user.email || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const roleBadgeColor: Record<string, string> = {
    player: 'bg-[var(--color-primary)] text-white',
    chamber: 'bg-[var(--color-accent)] text-white',
    admin: 'bg-neutral-900 text-white',
    business: 'bg-emerald-600 text-white',
  };

  const hasBingo = (() => {
    const board = user.bingoBoard || [];
    const size = user.boardSize || 3;
    if (!board.length) return false;
    const completedIds = new Set(completions.map(c => c.businessId));
    const grid: string[][] = [];
    for (let i = 0; i < board.length; i += size) {
      const row = board.slice(i, i + size);
      if (row.length === size) grid.push(row);
    }
    if (grid.length !== size) return false;
    for (let r = 0; r < size; r++) {
      if (grid[r].every(id => id === 'FREE' || completedIds.has(id))) return true;
    }
    for (let c = 0; c < size; c++) {
      if (grid.every(row => row[c] === 'FREE' || completedIds.has(row[c]))) return true;
    }
    if (grid.every((row, i) => row[i] === 'FREE' || completedIds.has(row[i]))) return true;
    if (grid.every((row, i) => row[size - 1 - i] === 'FREE' || completedIds.has(row[size - 1 - i]))) return true;
    return false;
  })();

  const handleTownChange = async (newTown: string) => {
    setSelectedTown(newTown);
    setSavingTown(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { town: newTown });
      setTownSaved(true);
      setTimeout(() => setTownSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update town:', err);
    } finally {
      setSavingTown(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed:', err);
      setSigningOut(false);
    }
  };

  const handleReset = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset your board? This will clear all your progress and send you back to onboarding. This cannot be undone.'
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { bingoBoard: [], onboardingComplete: false }, { merge: true });
    } catch (err) {
      console.error('Reset failed:', err);
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6 pb-16">

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-neutral-900 text-white rounded-[2.5rem] p-10 relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-5 bg-white translate-x-16 -translate-y-16" />

        <div className="flex items-center gap-6 relative z-10">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0"
            style={{ background: 'var(--color-primary)' }}
          >
            {initials}
          </div>

          <div className="min-w-0">
            <h1 className="font-serif italic text-3xl leading-tight truncate">
              {user.displayName || 'Explorer'}
            </h1>
            <p className="text-neutral-400 text-sm mt-1 truncate">{user.email}</p>
            <span className={`inline-block mt-3 text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full ${roleBadgeColor[user.role] ?? 'bg-neutral-700 text-white'}`}>
              {user.role}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Progress card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-neutral-100"
      >
        <h2 className="font-serif italic text-2xl mb-6">Your Progress</h2>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-neutral-300" size={28} />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-neutral-50 rounded-2xl p-5 text-center">
              <CheckCircle2 className="mx-auto mb-2" size={22} style={{ color: 'var(--color-primary)' }} />
              <p className="text-2xl font-bold text-neutral-900">{completions.length}</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">Completed</p>
            </div>

            <div className="bg-neutral-50 rounded-2xl p-5 text-center">
              <Trophy
                className="mx-auto mb-2"
                size={22}
                style={{ color: hasBingo ? 'var(--color-accent)' : undefined }}
                color={hasBingo ? undefined : '#d1d5db'}
              />
              <p className="text-2xl font-bold text-neutral-900">{hasBingo ? 'Yes!' : 'Not yet'}</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">Bingo</p>
            </div>

            <div className="bg-neutral-50 rounded-2xl p-5 text-center">
              <MapPin className="mx-auto mb-2 text-neutral-300" size={22} />
              <p className="text-sm font-bold text-neutral-900 truncate">{user.town || 'None'}</p>
              <p className="text-[10px] uppercase tracking-widest text-neutral-400 mt-1">Town</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Account card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-neutral-100"
      >
        <h2 className="font-serif italic text-2xl mb-6">Account</h2>

        {/* Town selector */}
        <div className="mb-6">
          <label className="block text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">
            Your Town
          </label>
          <div className="relative">
            <select
              value={selectedTown}
              onChange={e => handleTownChange(e.target.value)}
              disabled={savingTown}
              className="w-full appearance-none bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 pr-12 text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-60"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            >
              <option value="">Select a town...</option>
              {towns.map(t => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {savingTown ? (
                <Loader2 className="animate-spin text-neutral-400" size={16} />
              ) : townSaved ? (
                <CheckCircle2 size={16} style={{ color: 'var(--color-primary)' }} />
              ) : (
                <ChevronDown className="text-neutral-400" size={16} />
              )}
            </div>
          </div>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center justify-center gap-3 bg-neutral-900 hover:bg-neutral-800 text-white py-4 rounded-2xl font-bold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="animate-spin" size={18} />
          ) : (
            <LogOut size={18} />
          )}
          Sign Out
        </button>
      </motion.div>

      {/* Danger zone -- players only */}
      {user.role === 'player' && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-red-100"
        >
          <h2 className="font-serif italic text-2xl mb-2 text-red-600">Danger Zone</h2>
          <p className="text-xs text-neutral-400 mb-6">
            Resetting your board clears all progress and returns you to onboarding. This cannot be undone.
          </p>

          <button
            onClick={handleReset}
            disabled={resetting}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-red-50 text-red-600 border-2 border-red-200 hover:border-red-400 py-4 rounded-2xl font-bold text-sm transition-all disabled:opacity-60"
          >
            {resetting ? (
              <Loader2 className="animate-spin" size={18} />
            ) : (
              <RotateCcw size={18} />
            )}
            Reset My Board
          </button>
        </motion.div>
      )}
    </div>
  );
};
