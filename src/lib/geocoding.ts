/**
 * Geocoding helper using Nominatim (OpenStreetMap)
 * This is used to translate addresses to coordinates for map plotting, and
 * those coordinates are also the centre of the 500 m geofence in verifyVisit.
 */
import { acceptMatch, addressCandidates } from './businessImport';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Nominatim's usage policy is at most one request per second. */
const NOMINATIM_GAP_MS = 1100;

async function search(query: string) {
  const response = await fetch(
    // countrycodes=us: without it "ONLINE" resolved to a street in France.
    `https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`,
    {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ChamberBingoApp/1.0'
      }
    }
  );
  if (!response.ok) throw new Error('Geocoding failed');
  const data = await response.json();
  return Array.isArray(data) ? data[0] : undefined;
}

/**
 * Tries the address as written, then simpler forms of it (no suite, no floor,
 * street plus state and ZIP), and only accepts a simplified hit that lands on
 * the house in the right ZIP. Returns null rather than a guess: a pin on the
 * wrong street puts the shop outside its own geofence.
 *
 * Waits between its own lookups. A caller looping over many addresses still
 * has to wait between calls.
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const candidates = addressCandidates(address);
  for (let i = 0; i < candidates.length; i++) {
    if (i > 0) await sleep(NOMINATIM_GAP_MS);
    try {
      const hit = acceptMatch(await search(candidates[i]), candidates[i], i > 0);
      if (hit) return hit;
    } catch (error) {
      console.error('Error geocoding address:', error);
      return null;
    }
  }
  return null;
}
