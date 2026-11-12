import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ImagePlus, LayoutGrid, Loader2, Trash2 } from 'lucide-react';
import { db } from '../../firebase';
import { Town, UserProfile } from '../../types';
import {
  ALL_TOWNS_KEY, FREE_SPACE_LOGOS, logoKeyForTown,
  encodeLogo, saveFreeSpaceLogo, removeFreeSpaceLogo,
} from '../../services/freeSpaceLogos';

interface FreeSpaceLogosProps {
  towns: Town[];
  currentUser: UserProfile;
}

interface Row {
  key: string;
  label: string;
}

/**
 * Chamber control for the logo in the middle of the board. One logo for every
 * board, and optionally one per town that replaces it for players in that
 * town (the Peekskill BID logo, for example).
 */
export const FreeSpaceLogos: React.FC<FreeSpaceLogosProps> = ({ towns, currentUser }) => {
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const targetKey = useRef<string | null>(null);

  useEffect(() => onSnapshot(
    collection(db, FREE_SPACE_LOGOS),
    (snap) => {
      const next: Record<string, string> = {};
      snap.forEach(d => {
        const url = d.data().dataUrl;
        if (typeof url === 'string') next[d.id] = url;
      });
      setLogos(next);
    },
    (err) => {
      console.error('Free space logos snapshot error:', err);
      setError('Could not load the free space logos.');
    },
  ), []);

  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>([ALL_TOWNS_KEY]);
    const townRows: Row[] = [];
    for (const t of [...towns].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = logoKeyForTown(t.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      townRows.push({ key, label: t.name });
    }
    return [{ key: ALL_TOWNS_KEY, label: 'All towns' }, ...townRows];
  }, [towns]);

  const describe = (key: string) => {
    if (key === ALL_TOWNS_KEY) {
      return logos[key] ? 'Shown on every board without its own town logo' : 'No logo, boards show the regular free space';
    }
    if (logos[key]) return 'Shown on boards for players in this town';
    return logos[ALL_TOWNS_KEY] ? 'Using the all towns logo' : 'Regular free space';
  };

  const pick = (key: string) => {
    targetKey.current = key;
    inputRef.current?.click();
  };

  const upload = async (file: File) => {
    const key = targetKey.current;
    if (!key) return;
    setBusyKey(key);
    setError(null);
    try {
      const dataUrl = await encodeLogo(file);
      await saveFreeSpaceLogo(key, dataUrl, currentUser.uid);
    } catch (err) {
      console.error('Free space logo upload failed:', err);
      setError(err instanceof Error && err.message ? err.message : 'Could not save that logo. Try again.');
    } finally {
      setBusyKey(null);
      targetKey.current = null;
    }
  };

  const remove = async (key: string) => {
    setBusyKey(key);
    setError(null);
    try {
      await removeFreeSpaceLogo(key);
    } catch (err) {
      console.error('Free space logo removal failed:', err);
      setError('Could not remove that logo. Try again.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="lg:col-span-3 bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <LayoutGrid className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Free Space Logo</h3>
      </div>
      <p className="text-xs text-neutral-500 mb-6 leading-relaxed">
        The logo in the middle square of the board. A town's own logo replaces the all towns one for players in that town.
        Use a square PNG with a transparent background. It updates on players' boards right away.
      </p>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-xs text-red-600 font-bold">{error}</p>
        </div>
      )}

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(({ key, label }) => {
          const logo = logos[key];
          const busy = busyKey === key;
          return (
            <li key={key} className="flex items-center gap-4 p-3 bg-neutral-50 border border-neutral-100 rounded-2xl">
              <div className="w-14 h-14 shrink-0 rounded-xl bg-orange-50 border-2 border-orange-200 flex items-center justify-center overflow-hidden">
                {busy
                  ? <Loader2 className="animate-spin text-neutral-400" size={18} aria-hidden="true" />
                  : logo
                    ? <img src={logo} alt={`${label} free space logo`} className="w-full h-full object-contain p-1" />
                    : <ImagePlus className="text-neutral-300" size={18} aria-hidden="true" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-neutral-900 truncate">{label}</p>
                <p className="text-[11px] text-neutral-500 leading-snug">{describe(key)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => pick(key)}
                  disabled={busyKey !== null}
                  className="px-3 py-2 bg-white border border-neutral-200 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-900 hover:border-neutral-900 transition-all disabled:opacity-40"
                >
                  {logo ? 'Replace' : 'Upload'}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => remove(key)}
                    disabled={busyKey !== null}
                    aria-label={`Remove the ${label} free space logo`}
                    className="p-2 bg-white border border-neutral-200 rounded-xl text-neutral-500 hover:text-red-600 hover:border-red-300 transition-all disabled:opacity-40"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg,image/svg+xml"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
};
