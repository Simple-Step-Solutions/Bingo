import React, { useState, useEffect } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { getInviteByToken, markInviteUsed } from '../services/inviteService';
import { Gamepad2, Store, ShieldCheck, Loader2, KeyRound } from 'lucide-react';

interface RoleSelectorProps {
  user: UserProfile;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ user }) => {
  const [role, setRole] = useState<'player' | 'business' | 'chamber'>('player');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill from localStorage if they arrived via an invite link
  useEffect(() => {
    const token = localStorage.getItem('pendingInvite');
    if (!token) return;
    getInviteByToken(token).then(invite => {
      if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) return;
      if (invite.role !== 'player') {
        setRole(invite.role);
        setInviteCode(token);
      }
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

      if (role !== 'player') {
        if (!inviteCode.trim()) {
          setError('Please enter the invite code from your Chamber administrator.');
          setLoading(false);
          return;
        }
        const invite = await getInviteByToken(inviteCode.trim());
        if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) {
          setError('Invalid or expired invite code. Contact your Chamber administrator.');
          setLoading(false);
          return;
        }
        if (invite.role !== role) {
          setError(`This code is for a ${invite.role} account. Please select the correct role.`);
          setRole(invite.role);
          setLoading(false);
          return;
        }
        if (invite.businessId) updates.businessId = invite.businessId;
        await markInviteUsed(invite.id, user.uid);
        localStorage.removeItem('pendingInvite');
      }

      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const options = [
    {
      value: 'player' as const,
      icon: <Gamepad2 size={22} />,
      label: 'A Player',
      sub: 'Discover local businesses & play bingo',
    },
    {
      value: 'business' as const,
      icon: <Store size={22} />,
      label: 'A Participating Business',
      sub: 'Manage my QR code & track visitors',
    },
    {
      value: 'chamber' as const,
      icon: <ShieldCheck size={22} />,
      label: 'Chamber Staff',
      sub: 'Manage the game & participants',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-neutral-100">
          <div className="mb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-primary)] mb-2">Welcome{user.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}</p>
            <h2 className="font-serif italic text-4xl mb-2">What brings you here?</h2>
            <p className="text-neutral-400 text-sm leading-relaxed">Select your role to get started. Business and chamber accounts require an invite code.</p>
          </div>

          <div className="space-y-3 mb-6">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setRole(opt.value); setError(null); }}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left ${
                  role === opt.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                    : 'border-neutral-100 hover:border-neutral-300 bg-neutral-50'
                }`}
              >
                <div className={`shrink-0 transition-colors ${role === opt.value ? 'text-[var(--color-primary)]' : 'text-neutral-300'}`}>
                  {opt.icon}
                </div>
                <div>
                  <p className={`text-sm font-bold ${role === opt.value ? 'text-[var(--color-primary)]' : 'text-neutral-700'}`}>{opt.label}</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {role !== 'player' && (
            <div className="mb-6">
              <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                Invite Code <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={16} />
                <input
                  type="text"
                  placeholder="Paste your invite code..."
                  value={inviteCode}
                  onChange={e => { setInviteCode(e.target.value); setError(null); }}
                  className="w-full pl-11 pr-4 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-[var(--color-primary)] outline-none transition-all"
                />
              </div>
              <p className="text-[9px] text-neutral-400 mt-1.5">Get this from your Chamber administrator.</p>
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
