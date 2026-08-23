import React, { useState } from 'react';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Business, Town } from '../../types';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { HelpTip } from './HelpTip';
import { ConfirmButton } from './ConfirmButton';

interface TownManagerProps {
  towns: Town[];
  businesses: Business[];
}

/**
 * Towns come first in setup: the Add Business form gets its dropdown from this
 * list, and a player picks a home town during sign-up. Previously this card sat
 * at the bottom of the Chamber Manager tab, below the form that depends on it.
 */
export const TownManager: React.FC<TownManagerProps> = ({ towns, businesses }) => {
  const [newTown, setNewTown] = useState('');
  const [error, setError] = useState<string | null>(null);

  const countIn = (name: string) => businesses.filter(b => b.town === name).length;

  const addTown = async () => {
    const name = newTown.trim();
    if (!name) return;
    if (towns.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already on the list.`);
      return;
    }
    setError(null);
    await addDoc(collection(db, 'towns'), { name });
    setNewTown('');
  };

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <MapPin className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
          Towns
          <HelpTip label="towns">
            <p>The towns your member businesses sit in. Players choose one as their home town when they sign up.</p>
            <p>Add these before you add businesses: the Add Business form picks its town from this list.</p>
          </HelpTip>
        </h3>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6">
        Add every town you have member businesses in. Players pick one of these as
        their home town, and their board is built mostly from businesses in it.
      </p>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      <div className="flex gap-3 mb-6">
        <label htmlFor="new-town" className="sr-only">New town name</label>
        <input
          id="new-town"
          placeholder="e.g. Peekskill"
          value={newTown}
          onChange={e => { setNewTown(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') addTown(); }}
          className="flex-1 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
        />
        <button
          onClick={addTown}
          disabled={!newTown.trim()}
          aria-label="Add town"
          className="bg-neutral-900 text-white p-4 rounded-2xl hover:bg-neutral-800 transition-all shadow-md disabled:opacity-40"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>

      {towns.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-neutral-200 rounded-2xl">
          <MapPin className="mx-auto text-neutral-200 mb-3" size={36} aria-hidden="true" />
          <p className="text-sm text-neutral-500 font-medium">No towns yet.</p>
          <p className="text-xs text-neutral-400 mt-1">Add your first one above to start adding businesses.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {towns.map(t => {
            const used = countIn(t.name);
            return (
              <div key={t.id} className="flex justify-between items-center p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                <div className="min-w-0">
                  <span className="text-sm font-bold">{t.name}</span>
                  <span className="ml-3 text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
                    {used} business{used === 1 ? '' : 'es'}
                  </span>
                </div>
                <ConfirmButton
                  title={`Remove ${t.name}?`}
                  body={used > 0
                    ? `${used} business${used === 1 ? ' stays' : 'es stay'} on the ${t.name} town, which will no longer be selectable. Reassign them first, or players from ${t.name} will not be able to sign up.`
                    : 'It disappears from the sign-up and Add Business dropdowns. Nothing else changes.'}
                  confirmLabel="Remove"
                  ariaLabel={`Remove ${t.name}`}
                  onConfirm={() => deleteDoc(doc(db, 'towns', t.id))}
                  className="p-2 text-neutral-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </ConfirmButton>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
