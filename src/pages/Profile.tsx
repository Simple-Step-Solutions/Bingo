import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, db } from '../firebase';
import { UserProfile, Completion } from '../types';
import { motion } from 'motion/react';
import { LogOut, RotateCcw, CheckCircle2, Trophy, MapPin, Loader2, Lock, Eye, EyeOff, PlayCircle } from 'lucide-react';

interface ProfileProps {
  user: UserProfile;
}

const isEmailUser = () => {
  const currentUser = auth.currentUser;
  return currentUser?.providerData.some(p => p.providerId === 'password') ?? false;
};

export const Profile: React.FC<ProfileProps> = ({ user }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match.'); return; }
    if (newPassword.length < 6) { setPwError('Password must be at least 6 characters.'); return; }
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) return;
    setPwLoading(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect.');
      } else {
        setPwError('Failed to update password. Please try again.');
      }
    } finally {
      setPwLoading(false);
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
    <div className="max-w-2xl mx-auto space-y-5 pb-16">

      {/* Header card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-neutral-900 text-white rounded-3xl p-8 relative overflow-hidden shadow-2xl"
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
        className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-100"
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
        className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-100"
      >
        <h2 className="font-serif italic text-2xl mb-6">Account</h2>

        {/* Town -- read only */}
        <div className="mb-6">
          <label className="block text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">
            Your Town
          </label>
          <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4">
            <MapPin size={16} className="text-neutral-300 shrink-0" />
            <span className="text-sm font-medium text-neutral-900">{user.town || 'Not set'}</span>
          </div>
          <p className="text-[10px] text-neutral-400 mt-2 ml-1">Your town is assigned by the chamber. Contact them to make changes.</p>
        </div>

        {/* Change password -- email users only */}
        {isEmailUser() && (
          <form onSubmit={handleChangePassword} className="mb-6 space-y-3">
            <label className="block text-[10px] uppercase tracking-widest text-neutral-400 font-bold mb-3">
              Change Password
            </label>

            <div className="relative">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                placeholder="Current password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 pr-12 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
              />
              <button type="button" onClick={() => setShowCurrentPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <div className="relative">
              <input
                type={showNewPw ? 'text' : 'password'}
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 pr-12 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
              />
              <button type="button" onClick={() => setShowNewPw(v => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl px-5 py-4 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />

            {pwError && <p className="text-xs text-red-500 ml-1">{pwError}</p>}
            {pwSuccess && <p className="text-xs ml-1" style={{ color: 'var(--color-primary)' }}>Password updated successfully.</p>}

            <button
              type="submit"
              disabled={pwLoading}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-sm transition-all shadow-sm hover:shadow-md disabled:opacity-60 text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              {pwLoading ? <Loader2 className="animate-spin" size={18} /> : <Lock size={18} />}
              Update Password
            </button>
          </form>
        )}

        {/* Replay tour -- chamber and business only */}
        {(user.role === 'chamber' || user.role === 'business') && (
          <button
            onClick={async () => {
              await setDoc(doc(db, 'users', user.uid), { tourCompleted: false }, { merge: true });
              window.location.reload();
            }}
            className="w-full flex items-center justify-center gap-3 bg-neutral-50 hover:bg-neutral-100 text-neutral-700 border border-neutral-200 py-4 rounded-2xl font-bold text-sm transition-all mb-3"
          >
            <PlayCircle size={18} />
            Replay Tour
          </button>
        )}

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
          className="bg-white rounded-3xl p-8 shadow-sm border border-red-100"
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
