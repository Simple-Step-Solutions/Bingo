import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface BusinessSecret {
  businessId: string;
  code: string;
  nfcId?: string | null;
}

/**
 * The printable verification code for a business.
 *
 * Codes used to live on the public `businesses` document as
 * `qrCode: 'CHAMBER_<documentId>'`, which meant every player holding a board
 * already held every code in the game. They now live in `business_secrets`,
 * which the rules restrict to the chamber and the owning business, and the
 * code itself is random rather than derived from anything readable.
 *
 * Returns `null` while loading and `undefined` for a business that has no code
 * provisioned yet, so a caller can tell "not loaded" from "not issued".
 */
export const useBusinessSecret = (businessId: string | undefined) => {
  const [secret, setSecret] = useState<BusinessSecret | null | undefined>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) { setSecret(undefined); return; }
    setSecret(null);
    setError(null);

    const unsub = onSnapshot(
      doc(db, 'business_secrets', businessId),
      (snap) => setSecret(snap.exists() ? (snap.data() as BusinessSecret) : undefined),
      (err) => {
        console.error('Business secret snapshot error:', err);
        setError('Could not load your code. Refresh, or contact the Chamber.');
        setSecret(undefined);
      },
    );
    return unsub;
  }, [businessId]);

  return { secret, error, loading: secret === null };
};
