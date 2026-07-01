import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { Business, UserProfile, Invite } from '../../types';
import { createInvite } from '../../services/inviteService';
import { Link2, Copy, Check, Loader2, ExternalLink } from 'lucide-react';

interface InviteManagerProps {
  businesses: Business[];
  currentUser: UserProfile;
}

export const InviteManager: React.FC<InviteManagerProps> = ({ businesses, currentUser }) => {
  const [role, setRole] = useState<'chamber' | 'business' | 'player'>('player');
  const [businessId, setBusinessId] = useState('');
  const [emailHint, setEmailHint] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'invites'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, snap => {
      setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() } as Invite)));
    }, err => console.error('Invites snapshot error:', err));
    return unsub;
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedToken(null);
    try {
      const selectedBusiness = businesses.find(b => b.id === businessId);
      const token = await createInvite(
        currentUser.uid,
        role,
        role === 'business' ? businessId || undefined : undefined,
        role === 'business' ? selectedBusiness?.name : undefined,
        emailHint.trim() || undefined
      );
      setGeneratedToken(token);
    } catch (err) {
      console.error('Error creating invite:', err);
    } finally {
      setLoading(false);
    }
  };

  const inviteUrl = generatedToken
    ? `${window.location.origin}/?invite=${generatedToken}&role=${role}${emailHint.trim() ? `&hint=${encodeURIComponent(emailHint.trim())}` : ''}`
    : null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getInviteStatus = (invite: Invite): 'used' | 'expired' | 'pending' => {
    if (invite.used) return 'used';
    if (new Date(invite.expiresAt) < new Date()) return 'expired';
    return 'pending';
  };

  const statusStyles: Record<string, string> = {
    used: 'bg-green-50 text-green-700',
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
          <Link2 className="text-white" size={14} />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Invite Users</h3>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Role</label>
          <select
            value={role}
            onChange={e => { setRole(e.target.value as 'chamber' | 'business' | 'player'); setBusinessId(''); }}
            className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
          >
            <option value="player">Player</option>
            <option value="chamber">Chamber Staff</option>
            <option value="business">Business Owner</option>
          </select>
        </div>

        {role === 'business' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Business (optional)</label>
            <select
              value={businessId}
              onChange={e => setBusinessId(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
            >
              <option value="">Select a business...</option>
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Email hint (optional)</label>
          <input
            type="email"
            placeholder="person@example.com"
            value={emailHint}
            onChange={e => setEmailHint(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm font-medium bg-neutral-50 outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
          />
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
        <div className="mb-8 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Shareable Link</p>
          <code className="block text-xs text-neutral-700 break-all mb-3 font-mono leading-relaxed">{inviteUrl}</code>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              copied
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-white border border-neutral-200 text-neutral-700 hover:border-neutral-900'
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      {invites.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-4">Recent Invites</p>
          <div className="space-y-3">
            {invites.map(invite => {
              const status = getInviteStatus(invite);
              const expires = new Date(invite.expiresAt);
              const url = `${window.location.origin}/?invite=${invite.token}&role=${invite.role}${invite.emailHint ? `&hint=${encodeURIComponent(invite.emailHint)}` : ''}`;
              const isCopied = copiedId === invite.id;
              return (
                <div key={invite.id} className="p-3 bg-neutral-50 rounded-2xl space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${roleStyles[invite.role]}`}>
                        {invite.role === 'chamber' ? 'Chamber' : invite.role === 'business' ? 'Business' : 'Player'}
                      </span>
                      {invite.businessName && (
                        <span className="text-[10px] text-neutral-500 font-medium truncate">{invite.businessName}</span>
                      )}
                      {invite.emailHint && (
                        <span className="text-[10px] text-neutral-400 truncate">{invite.emailHint}</span>
                      )}
                      <span className="text-[9px] text-neutral-300 font-medium shrink-0">
                        {status === 'used' ? `Used ${invite.usedAt ? new Date(invite.usedAt).toLocaleDateString() : ''}` : `Expires ${expires.toLocaleDateString()}`}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest shrink-0 ${statusStyles[status]}`}>
                      {status}
                    </span>
                  </div>
                  {status === 'pending' && (
                    <button
                      onClick={async () => {
                        await navigator.clipboard.writeText(url);
                        setCopiedId(invite.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                        isCopied
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-900'
                      }`}
                    >
                      {isCopied ? <Check size={11} /> : <Copy size={11} />}
                      {isCopied ? 'Copied!' : 'Copy Invite Link'}
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
