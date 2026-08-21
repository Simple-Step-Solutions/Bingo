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

    // GPS is only relevant for on-site verification, so skip real desktops.
    //
    // The old check was a user-agent regex for Android|iPhone|iPad|iPod, which
    // missed Android tablets entirely and missed iPadOS, which reports itself
    // as a Mac. Those users got no location at all and then failed every
    // verification with "Location required" and no way to work out why.
    //
    // Touch capability plus a coarse pointer is the property that actually
    // matters, and it does not need updating when a new device ships.
    const isLikelyMobile =
      navigator.maxTouchPoints > 0
      || window.matchMedia('(pointer: coarse)').matches;
    if (!isLikelyMobile) return;

    if (!('geolocation' in navigator)) return;

    let watchId: number | null = null;
    let cancelled = false;

    /**
     * Only track once permission has ALREADY been granted.
     *
     * This used to call getCurrentPosition on load, which fires the browser's
     * permission prompt the moment the app opens -- before the player has any
     * idea why it wants their location. Most people deny a cold prompt, and a
     * denial here is close to unrecoverable: verification stops working and the
     * app cannot re-prompt, because browsers only ask once.
     *
     * So the prompt now happens at the moment it makes sense, when the player
     * taps Verify standing inside a shop. This tracker just piggybacks on the
     * grant.
     */
    const startIfPermitted = async () => {
      // Safari did not support permissions.query for geolocation until 16.4,
      // so treat an unavailable API as "do not prompt" rather than assuming.
      if (!navigator.permissions?.query) return;

      let status: PermissionStatus;
      try {
        status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      } catch {
        return;
      }

      const begin = () => {
        if (cancelled || watchId !== null || status.state !== 'granted') return;
        navigator.geolocation.getCurrentPosition(
          (pos) => writeLocation(pos.coords.latitude, pos.coords.longitude),
          (err) => console.error('Geolocation error:', err),
        );
        watchId = navigator.geolocation.watchPosition(
          (pos) => writeLocation(pos.coords.latitude, pos.coords.longitude),
          (err) => console.error('Geolocation error:', err),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
        );
      };

      begin();
      // Start tracking the moment the player grants it during a verification,
      // without making them reload.
      status.addEventListener('change', begin);
    };

    startIfPermitted();

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
    // Deliberately keyed on the uid alone. writeLocation updates users/{uid},
    // which produces a new `user` object, which would tear down and restart the
    // geolocation watch on every single write. Only a different player should
    // restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  return null;
};
