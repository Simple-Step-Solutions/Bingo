import React, { useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { calculateDistance } from '../lib/utils';

interface LocationTrackerProps {
  user: UserProfile | null;
}

const MIN_WRITE_INTERVAL_MS = 60_000; // at most one write per minute
const MIN_DISTANCE_M = 30;            // only write if moved more than 30 meters

export const LocationTracker: React.FC<LocationTrackerProps> = ({ user }) => {
  const lastWriteRef = useRef<number>(0);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!user) return;

    const writeLocation = async (lat: number, lng: number) => {
      const now = Date.now();
      const last = lastPositionRef.current;

      // Skip if not enough time has passed
      if (now - lastWriteRef.current < MIN_WRITE_INTERVAL_MS) return;

      // Skip if position hasn't changed enough
      if (last) {
        const moved = calculateDistance(last.lat, last.lng, lat, lng);
        if (moved < MIN_DISTANCE_M && lastWriteRef.current > 0) return;
      }

      lastWriteRef.current = now;
      lastPositionRef.current = { lat, lng };

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          currentLocation: { lat, lng },
          lastActive: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Error updating location:', err);
      }
    };

    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => writeLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error('Geolocation error:', err)
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => writeLocation(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error('Geolocation error:', err),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.uid]);

  return null;
};
