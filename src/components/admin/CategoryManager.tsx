import React, { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { AppSettings, Business } from '../../types';
import { Tag, Plus, X } from 'lucide-react';
import { HelpTip } from './HelpTip';
import { ConfirmButton } from './ConfirmButton';

export const DEFAULT_CATEGORIES = ['Retail', 'Restaurant', 'Service', 'Entertainment', 'Other'];

interface CategoryManagerProps {
  settings: AppSettings;
  businesses: Business[];
}

/**
 * Categories are only used for grouping and for the Reports breakdown, but
 * removing one used to silently orphan every business on it: the business kept
 * a category that no longer existed, the edit form showed a mismatched select,
 * and Reports filed it under Other. The confirmation now says so.
 */
export const CategoryManager: React.FC<CategoryManagerProps> = ({ settings, businesses }) => {
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categories = settings.businessCategories ?? DEFAULT_CATEGORIES;
  const countIn = (cat: string) => businesses.filter(b => (b.category || 'Other') === cat).length;

  const save = async (next: string[]) => {
    await setDoc(doc(db, 'settings', 'global'), { businessCategories: next }, { merge: true });
  };

  const addCategory = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (categories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      setError(`${trimmed} is already a category.`);
      return;
    }
    setError(null);
    await save([...categories, trimmed]);
    setNewCategory('');
  };

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <Tag className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
          Business Categories
          <HelpTip label="business categories">
            <p>How you group member businesses: Retail, Restaurant, and so on.</p>
            <p>Categories do not affect how boards are built or who wins. They are for your own filtering and for the category breakdown in Reports.</p>
          </HelpTip>
        </h3>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6">
        Used to group businesses and to break down visits in Reports. The defaults
        cover most chambers, so you can safely leave this alone.
      </p>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        {categories.map(cat => {
          const used = countIn(cat);
          return (
            <span key={cat} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-neutral-100 rounded-xl text-xs font-bold text-neutral-700">
              {cat}
              {used > 0 && <span className="text-[10px] font-bold text-neutral-400">{used}</span>}
              <ConfirmButton
                title={`Remove the ${cat} category?`}
                body={used > 0
                  ? `${used} business${used === 1 ? ' is' : 'es are'} filed under ${cat}. ${used === 1 ? 'It keeps' : 'They keep'} the label but it stops being selectable, and Reports will count ${used === 1 ? 'it' : 'them'} under Other. Re-file ${used === 1 ? 'it' : 'them'} first if that matters.`
                  : 'Nothing is using it, so nothing else changes.'}
                confirmLabel="Remove"
                ariaLabel={`Remove the ${cat} category`}
                onConfirm={() => save(categories.filter(c => c !== cat))}
                className="text-neutral-400 hover:text-red-500 transition-colors p-0.5"
              >
                <X size={12} aria-hidden="true" />
              </ConfirmButton>
            </span>
          );
        })}
      </div>

      <div className="flex gap-3">
        <label htmlFor="new-category" className="sr-only">New category name</label>
        <input
          id="new-category"
          value={newCategory}
          onChange={e => { setNewCategory(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
          placeholder="e.g. Farm Stand"
          className="flex-1 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
        />
        <button
          onClick={addCategory}
          disabled={!newCategory.trim()}
          className="flex items-center gap-2 px-5 py-4 bg-neutral-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-all hover:bg-neutral-700"
        >
          <Plus size={14} aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  );
};
