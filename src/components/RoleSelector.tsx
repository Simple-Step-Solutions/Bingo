import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { peekInvite, redeemInvite, errorMessage, isExpectedError } from '../services/api';
import { auth } from '../firebase';
import { Gamepad2, Store, ShieldCheck, Loader2, Lock } from 'lucide-react';

interface RoleSelectorProps {
  user: UserProfile;
}

const ROLE_META = {
  player:   { icon: <Gamepad2 size={22} />, label: 'A Player',               sub: 'Discover local businesses & play bingo' },
  business: { icon: <Store size={22} />,    label: 'A Participating Business', sub: 'Manage my QR code & track visitors' },
  chamber:  { icon: <ShieldCheck size={22} />, label: 'Chamber Staff',        sub: 'Manage the game & participants' },
};

export const RoleSelector: React.FC<RoleSelectorProps> = ({ user }) => {
  const [role, setRole] = useState<'player' | 'business' | 'chamber'>('player');
  // Only what peekInvite is willing to tell an unauthenticated caller. The
  // plaintext token stays in localStorage and is sent back on redemption.
  const [lockedInvite, setLockedInvite] = useState<
    { token: string; role: 'player' | 'business' | 'chamber'; businessName: string | null } | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill and lock from localStorage if they arrived via an invite link.
  //
  // peekInvite returns a whitelisted projection and nothing else. The invites
  // collection is no longer readable by any client, and documents are keyed by
  // the token hash, so there is no query that could enumerate them.
  useEffect(() => {
    const token = localStorage.getItem('pendingInvite');
    if (!token) return;
    peekInvite({ token })
      .then(res => {
        if (!res.valid || !res.role) return;
        setRole(res.role);
        setLockedInvite({ token, role: res.role, businessName: res.businessName ?? null });
      })
      .catch(() => { /* An unreachable server should not block signing up as a player. */ });
  }, []);

  const handleContinue = async () => {
    setError(null);
    setLoading(true);
    try {
      if (lockedInvite) {
        // The server validates the token, sets the role, and moves the custom
        // claim in one transaction. This used to be a client-side setDoc, so
        // the invite requirement could be skipped by writing role directly.
        await redeemInvite({ token: lockedInvite.token });
        localStorage.removeItem('pendingInvite');
        // Pick up the new claim now rather than waiting up to an hour for the
        // token to refresh on its own.
        await auth.currentUser?.getIdToken(true);
        return;
      }

      if (role !== 'player') {
        setError('An invite link is required for this role. Ask your Chamber administrator for one.');
        setLoading(false);
        return;
      }

      await setDoc(doc(db, 'users', user.uid), { role: 'player', roleSelected: true }, { merge: true });
    } catch (err) {
      if (!isExpectedError(err)) console.error(err);
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const meta = ROLE_META[role];

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-neutral-100">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-primary)] mb-2">Welcome{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</p>
            <h2 className="font-serif italic text-4xl mb-2">What brings you here?</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">
              {lockedInvite
                ? 'Your role has been set by your invite. Click Get Started to continue.'
                : 'Select your role to get started. Business and chamber accounts require an invite link from your Chamber administrator.'}
            </p>
          </div>

          {lockedInvite ? (
            // Locked role display
            <div className="mb-6 flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/5">
              <div className="shrink-0 text-[var(--color-primary)]">{meta.icon}</div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[var(--color-primary)]">{meta.label}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{meta.sub}</p>
              </div>
              <Lock size={14} className="text-[var(--color-primary)] shrink-0" />
            </div>
          ) : (
            // Free role selection (player only -- others require invite link)
            <div className="space-y-3 mb-6">
              {(Object.entries(ROLE_META) as [keyof typeof ROLE_META, typeof ROLE_META[keyof typeof ROLE_META]][]).map(([value, opt]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setRole(value); setError(null); }}
                  disabled={value !== 'player'}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed ${
                    role === value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-neutral-100 hover:border-neutral-300 bg-neutral-50'
                  }`}
                >
                  <div className={`shrink-0 transition-colors ${role === value ? 'text-[var(--color-primary)]' : 'text-neutral-500'}`}>
                    {opt.icon}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${role === value ? 'text-[var(--color-primary)]' : 'text-neutral-700'}`}>{opt.label}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{opt.sub}</p>
                  </div>
                  {value !== 'player' && <Lock size={12} className="text-neutral-500 shrink-0" />}
                </button>
              ))}
              <p className="text-[9px] text-neutral-400 text-center pt-1">Business and chamber accounts require an invite link.</p>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-red-600 font-bold">{error}</p>
            </div>
          )}

          <button
            onClick={handleContinue}
            disabled={loading}
            className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
};
