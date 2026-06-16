import React, { useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

interface LocationTrackerProps {
  user: UserProfile | null;
}

export const LocationTracker: React.FC<LocationTrackerProps> = ({ user }) => {
  useEffect(() => {
    if (!user) return;

    let watchId: number;

    const updateLocation = async (position: GeolocationPosition) => {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          lastActive: new Date().toISOString(),
          currentLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
        });
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };

    if ('geolocation' in navigator) {
      // Update once immediately
      navigator.geolocation.getCurrentPosition(updateLocation);
      
      // Then watch for changes
      watchId = navigator.geolocation.watchPosition(
        updateLocation,
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }

    // Also update lastActive on a timer if location doesn't change
    const intervalId = setInterval(async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          lastActive: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error updating activity:', error);
      }
    }, 60000); // Every minute

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      clearInterval(intervalId);
    };
  }, [user?.uid]);

  return null;
};
