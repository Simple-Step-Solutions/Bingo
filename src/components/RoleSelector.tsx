import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { getInviteByToken, markInviteUsed } from '../services/inviteService';
import { Gamepad2, Store, ShieldCheck, Loader2, Lock } from 'lucide-react';
import { Invite } from '../types';

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
  const [lockedInvite, setLockedInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill and lock from localStorage if they arrived via an invite link
  useEffect(() => {
    const token = localStorage.getItem('pendingInvite');
    if (!token) return;
    getInviteByToken(token).then(invite => {
      if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) return;
      setRole(invite.role as 'player' | 'business' | 'chamber');
      setLockedInvite(invite);
    }).catch(() => {});
  }, []);

  const handleContinue = async () => {
    setError(null);
    setLoading(true);
    try {
      const updates: Record<string, any> = {
        role,
        roleSelected: true,
        ...(role !== 'player' ? { onboardingComplete: true } : {}),
      };

      if (lockedInvite) {
        if (lockedInvite.businessId) updates.businessId = lockedInvite.businessId;
        await markInviteUsed(lockedInvite.id, user.uid);
        localStorage.removeItem('pendingInvite');
      } else if (role !== 'player') {
        setError('An invite code is required for this role. Please use your invite link.');
        setLoading(false);
        return;
      }

      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
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
                  <div className={`shrink-0 transition-colors ${role === value ? 'text-[var(--color-primary)]' : 'text-neutral-300'}`}>
                    {opt.icon}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${role === value ? 'text-[var(--color-primary)]' : 'text-neutral-700'}`}>{opt.label}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{opt.sub}</p>
                  </div>
                  {value !== 'player' && <Lock size={12} className="text-neutral-300 shrink-0" />}
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
