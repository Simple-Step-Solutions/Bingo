import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc, deleteDoc, serverTimestamp, DocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Logos shown in the free space of the bingo board.
 *
 * One document per town, keyed by town name, plus ALL_TOWNS_KEY for a logo
 * every board gets. A town's own logo wins over the all-towns one, which is
 * what lets Peekskill boards carry the BID logo while everyone else keeps the
 * Chamber's.
 *
 * The image is stored as a small data URL on the document rather than in
 * Cloud Storage. Storage rules can only read the (default) database, so they
 * cannot tell who is chamber staff in this project, and the existing branding
 * uploads fail for exactly that reason. A logo resized to 256px fits
 * comfortably inside a Firestore document, and players only ever fetch the
 * one or two documents that apply to them.
 */

export const FREE_SPACE_LOGOS = 'free_space_logos';
export const ALL_TOWNS_KEY = '_all';

/** Keep in step with the size check in firestore.rules. */
export const MAX_LOGO_DATA_URL_LENGTH = 250_000;

/**
 * Document id for a town. Firestore ids cannot contain '/', and '.', '..' and
 * '__name__'-style ids are reserved. Returns '' for anything unusable so
 * callers skip it rather than throw.
 */
export const logoKeyForTown = (town: string | null | undefined): string => {
  const key = (town ?? '').trim().replace(/\//g, '-');
  if (!key || key === '.' || key === '..' || /^__.*__$/.test(key)) return '';
  return key;
};

const readLogo = (snap: DocumentSnapshot): string | null => {
  const url = snap.exists() ? snap.data().dataUrl : null;
  return typeof url === 'string' && url.startsWith('data:image/') ? url : null;
};

/** The logo for a player's free space: their town's, else the all-towns one. */
export const useFreeSpaceLogo = (town: string | null | undefined): string | null => {
  // Tagged with the key it was read for, so a stale logo from a previous town
  // is ignored without having to clear state inside the effect.
  const [townLogo, setTownLogo] = useState<{ key: string; url: string | null }>({ key: '', url: null });
  const [allLogo, setAllLogo] = useState<string | null>(null);

  useEffect(() => onSnapshot(
    doc(db, FREE_SPACE_LOGOS, ALL_TOWNS_KEY),
    snap => setAllLogo(readLogo(snap)),
    () => setAllLogo(null),
  ), []);

  const key = logoKeyForTown(town);
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      doc(db, FREE_SPACE_LOGOS, key),
      snap => setTownLogo({ key, url: readLogo(snap) }),
      () => setTownLogo({ key, url: null }),
    );
  }, [key]);

  const ownLogo = key && townLogo.key === key ? townLogo.url : null;
  return ownLogo ?? allLogo;
};

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be opened as an image.')); };
  img.src = url;
});

/**
 * Shrink a logo to fit a board square and encode it as a data URL. WebP keeps
 * transparency at a fraction of PNG's size; browsers that cannot encode WebP
 * quietly hand back PNG, which is also fine.
 */
export const encodeLogo = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file. A PNG with a transparent background works best.');
  const img = await loadImage(file);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) throw new Error('That image looks empty.');

  for (const max of [256, 192, 128]) {
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize images.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let url = canvas.toDataURL('image/webp', 0.9);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/png');
    if (url.length <= MAX_LOGO_DATA_URL_LENGTH) return url;
  }
  throw new Error('That image is too detailed to fit. Try a simpler PNG.');
};

export const saveFreeSpaceLogo = (key: string, dataUrl: string, uid: string) =>
  setDoc(doc(db, FREE_SPACE_LOGOS, key), { dataUrl, updatedBy: uid, updatedAt: serverTimestamp() });

export const removeFreeSpaceLogo = (key: string) => deleteDoc(doc(db, FREE_SPACE_LOGOS, key));
