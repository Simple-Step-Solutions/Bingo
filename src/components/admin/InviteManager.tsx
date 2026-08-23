import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Business, UserProfile, Invite } from '../../types';
import { createInvite, revokeInvite, errorMessage, isExpectedError } from '../../services/api';
import { Link2, Copy, Check, Loader2, Ban } from 'lucide-react';
import { HelpTip } from './HelpTip';

interface InviteManagerProps {
  businesses: Business[];
  currentUser: UserProfile;
}

export const InviteManager: React.FC<InviteManagerProps> = ({ businesses, currentUser }) => {
  // Chamber invites are admin-only on the server: a chamber account that can
  // mint more chamber accounts is a root of trust for the whole system. Hide
  // the option rather than letting the request fail with permission-denied.
  const canInviteChamber = currentUser.role === 'admin';

  const [role, setRole] = useState<'chamber' | 'business' | 'player'>('player');
  const [businessId, setBusinessId] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'invites'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, snap => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite)));
    }, err => console.error('Invites snapshot error:', err));
    return unsub;
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setGeneratedToken(null);
    try {
      const selectedBusiness = businesses.find(b => b.id === businessId);
      const res = await createInvite({
        role,
        ...(role === 'business' && businessId ? { businessId } : {}),
        ...(role === 'business' && selectedBusiness ? { businessName: selectedBusiness.name } : {}),
        ...(emailHint.trim() ? { emailHint: emailHint.trim() } : {}),
      });
      // The only moment this token exists in readable form. It is stored as a
      // hash, so if this link is lost the invite has to be reissued.
      setGeneratedToken(res.token);
    } catch (err) {
      if (!isExpectedError(err)) console.error('createInvite failed:', err);
      setError(errorMessage(err, 'Could not create that invite.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setRevoking(inviteId);
    setError(null);
    try {
      await revokeInvite({ inviteId });
    } catch (err) {
      if (!isExpectedError(err)) console.error('revokeInvite failed:', err);
      setError(errorMessage(err, 'Could not revoke that invite.'));
    } finally {
      setRevoking(null);
    }
  };

  const inviteUrl = generatedToken
    ? `${window.location.origin}/?invite=${generatedToken}`
    : null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getInviteStatus = (invite: Invite): 'used' | 'revoked' | 'expired' | 'pending' => {
    if (invite.used) return 'used';
    if (invite.revoked) return 'revoked';
    if (new Date(invite.expiresAt) < new Date()) return 'expired';
    return 'pending';
  };

  const statusStyles: Record<string, string> = {
    used: 'bg-green-50 text-green-700',
    revoked: 'bg-red-50 text-red-600',
    expired: 'bg-neutral-100 text-neutral-400',
    pending: 'bg-yellow-50 text-yellow-700',
  };

  const roleStyles: Record<string, string> = {
    player: 'bg-neutral-100 text-neutral-600',
    chamber: 'bg-blue-50 text-blue-700',
    business: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
          <Link2 className="text-white" size={14} aria-hidden="true" />
        </div>
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
          Invite Users
          <HelpTip label="invites">
            <p>Creates a one-time sign-in link. Whoever opens it and signs in gets the role you picked, so send it to one person and do not post it anywhere public.</p>
            <p>Each link works once and expires 48 hours after you create it. If it goes stale, revoke it and make a new one.</p>
            <p>The link is shown only at the moment you create it. It is stored scrambled, so nobody, including us, can look it up again afterwards.</p>
          </HelpTip>
        </h3>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6">
        Players do not need an invite: they can just sign up. Use these to give a
        shop owner or a member of your staff their extra access.
      </p>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      <div className="space-y-4 mb-6">
        <div>
          <label htmlFor="invite-role" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Role</label>
          <select
            id="invite-role"
            value={role}
            onChange={e => { setRole(e.target.value as 'chamber' | 'business' | 'player'); setBusinessId(''); }}
            className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
          >
            <option value="player">Player</option>
            {canInviteChamber && <option value="chamber">Chamber Staff</option>}
            <option value="business">Business Owner</option>
          </select>
        </div>

        {role === 'business' && (
          <div>
            <label htmlFor="invite-business" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Which business</label>
            <select
              id="invite-business"
              value={businessId}
              onChange={e => setBusinessId(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
            >
              <option value="">Select a business...</option>
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
              Pick the shop so the owner lands on their own dashboard. Leave it blank
              and they can claim their business themselves with the code on its poster.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="invite-email" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Their email (optional)</label>
          <input
            id="invite-email"
            type="email"
            placeholder="person@example.com"
            value={emailHint}
            onChange={e => setEmailHint(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
          />
          <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
            Only a label, so you can tell your pending invites apart in the list below.
            It does not send anything or restrict who can use the link.
          </p>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-[var(--color-primary)] text-white py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 shadow-lg"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Link2 size={16} />}
          Generate Invite
        </button>
      </div>

      {inviteUrl && (
        <div className="mb-8 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Their sign-in link</p>
          <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed">
            <span className="font-bold text-neutral-700">Copy this now and send it.</span>{' '}
            It is shown once and cannot be recovered, and it stops working 48 hours from
            now. If you lose it, revoke the invite below and make another.
          </p>
          <div className="flex items-start gap-3">
            <p className="font-mono text-sm break-all text-neutral-700 flex-1 leading-relaxed">{inviteUrl}</p>
            <button
              onClick={handleCopy}
              className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                copied
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-900'
              }`}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">Recent Invites</p>
          <div className="space-y-2">
            {invites.map(invite => {
              const status = getInviteStatus(invite);
              const expires = new Date(invite.expiresAt);
              return (
                <div
                  key={invite.id}
                  className={`flex items-center gap-3 py-3 px-4 bg-neutral-50 rounded-2xl border border-neutral-100 transition-opacity ${
                    status === 'expired' || status === 'used' ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${roleStyles[invite.role]}`}>
                      {invite.role === 'chamber' ? 'Chamber' : invite.role === 'business' ? 'Business' : 'Player'}
                    </span>
                    {invite.emailHint && (
                      <span className="text-[10px] text-neutral-500 font-medium truncate">{invite.emailHint}</span>
                    )}
                    {invite.businessName && (
                      <span className="text-[10px] text-neutral-400 truncate">{invite.businessName}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${statusStyles[status]}`}>
                      {status}
                    </span>
                    <span className="text-[9px] text-neutral-500 font-medium shrink-0">
                      {status === 'used'
                        ? `Used ${invite.usedAt ? new Date(invite.usedAt).toLocaleDateString() : ''}`
                        : `Expires ${expires.toLocaleDateString()}`}
                    </span>
                  </div>
                  {status === 'pending' && (
                    <button
                      onClick={() => handleRevoke(invite.id)}
                      disabled={revoking === invite.id}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest bg-white border border-neutral-200 text-neutral-600 hover:border-red-500 hover:text-red-600 transition-all disabled:opacity-50"
                    >
                      {revoking === invite.id
                        ? <Loader2 size={11} className="animate-spin" aria-hidden="true" />
                        : <Ban size={11} aria-hidden="true" />}
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
