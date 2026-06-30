import { collection, addDoc, doc, updateDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const generateToken = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export const createInvite = async (
  createdBy: string,
  role: 'player' | 'chamber' | 'business',
  businessId?: string,
  businessName?: string,
  emailHint?: string
) => {
  const token = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  await addDoc(collection(db, 'invites'), {
    token, role,
    businessId: businessId || null,
    businessName: businessName || null,
    emailHint: emailHint || null,
    createdBy,
    createdAt: now.toISOString(),
    expiresAt,
    used: false,
  });
  return token;
};

export const getInviteByToken = async (token: string) => {
  const q = query(collection(db, 'invites'), where('token', '==', token));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
};

export const markInviteUsed = async (inviteId: string, usedBy: string) => {
  await updateDoc(doc(db, 'invites', inviteId), {
    used: true,
    usedBy,
    usedAt: new Date().toISOString(),
  });
};
