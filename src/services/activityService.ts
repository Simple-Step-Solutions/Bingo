import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { Activity } from '../types';

export const trackActivity = async (userId: string, type: Activity['type'], metadata: any = {}) => {
  try {
    // Log granular activity
    await addDoc(collection(db, 'activities'), {
      userId,
      type,
      timestamp: new Date().toISOString(),
      metadata
    });

    // Update user metadata for quick analytics
    const userRef = doc(db, 'users', userId);
    const updateData: any = {};

    if (type === 'click_directions') {
      updateData['metadata.hasClickedDirections'] = true;
      updateData['metadata.directionsClickCount'] = increment(1);
    }
    
    if (type === 'open_app') {
      updateData['metadata.openCount'] = increment(1);
      updateData['lastActive'] = new Date().toISOString();
    }

    if (Object.keys(updateData).length > 0) {
      await updateDoc(userRef, updateData);
    }
  } catch (error) {
    console.error('Error tracking activity:', error);
  }
};
