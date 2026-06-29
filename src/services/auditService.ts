import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

export const logAudit = async (
  actorUid: string,
  actorEmail: string,
  action: string,
  targetUid: string,
  targetEmail: string,
  details: Record<string, any>
) => {
  try {
    await addDoc(collection(db, 'audit_log'), {
      actorUid, actorEmail, action, targetUid, targetEmail, details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
};
