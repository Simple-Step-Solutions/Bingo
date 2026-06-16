import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Activity } from '../types';

// Writing back to the users collection from here creates a feedback loop
// (snapshot fires -> trackActivity -> writes user doc -> snapshot fires again).
// Activity events are append-only to the activities collection only.
export const trackActivity = async (userId: string, type: Activity['type'], metadata: any = {}) => {
  try {
    await addDoc(collection(db, 'activities'), {
      userId,
      type,
      timestamp: new Date().toISOString(),
      metadata
    });
  } catch (error) {
    console.error('Error tracking activity:', error);
  }
};
