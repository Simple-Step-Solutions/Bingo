import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { ClaimRequest } from '../../types';
import { decideClaimRequest, errorMessage, isExpectedError } from '../../services/api';
import { KeyRound, Loader2, Check, X } from 'lucide-react';

/**
 * People asking to manage a business when their email is not the login email
 * on file. Approving grants the business role, so it goes through a callable.
 */
export const ClaimRequests: React.FC = () => {
  const [requests, setRequests] = useState<ClaimRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'claim_requests'), where('status', '==', 'pending'));
    return onSnapshot(q,
      snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }) as ClaimRequest)),
      err => { if (!isExpectedError(err)) console.error('claim_requests listener:', err); });
  }, []);

  const decide = async (r: ClaimRequest, approve: boolean) => {
    setBusy(r.id);
    setError(null);
    try {
      await decideClaimRequest({ requestId: r.id, approve });
    } catch (err) {
      if (!isExpectedError(err)) console.error('decideClaimRequest failed:', err);
      setError(errorMessage(err, 'Could not save that decision. Try again.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="lg:col-span-3 bg-white border border-neutral-200 p-6 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <KeyRound className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Claim Requests</h3>
        {requests.length > 0 && (
          <span className="text-[10px] bg-[var(--color-accent)] text-white px-3 py-1 rounded-full font-bold uppercase tracking-widest">
            {requests.length} waiting
          </span>
        )}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-neutral-500">No requests waiting. Owners who sign in with the email on file get their business automatically.</p>
      ) : (
        <>
          <p className="text-xs text-neutral-600 mb-4 leading-relaxed">
            These people signed in with a different email than the one on file for the business. The code on the poster is
            public, so call the business to confirm it's really them before approving.
          </p>
          <ul className="divide-y divide-neutral-100">
            {requests.map(r => (
              <li key={r.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-neutral-900">{r.businessName}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {r.displayName ? `${r.displayName}, ` : ''}{r.email}
                    {' '}&bull;{' '}
                    {r.source === 'invite' ? 'had the emailed invite link' : 'typed the poster code'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => decide(r, true)}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                  >
                    {busy === r.id ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                    Approve
                  </button>
                  <button
                    onClick={() => decide(r, false)}
                    disabled={busy !== null}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-200 text-neutral-700 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:border-red-300 hover:text-red-600 disabled:opacity-40"
                  >
                    <X size={12} aria-hidden="true" />
                    Deny
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert" className="mt-3 text-xs text-red-600 font-bold">{error}</p>}
    </div>
  );
};
