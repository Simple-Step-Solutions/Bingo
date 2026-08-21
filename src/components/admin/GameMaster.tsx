import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, UserProfile } from '../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Gamepad2, Trophy, ToggleLeft, ToggleRight, Tag, X, Plus } from 'lucide-react';

const DEFAULT_CATEGORIES = ['Retail', 'Restaurant', 'Service', 'Entertainment', 'Other'];

interface GameMasterProps {
  settings: AppSettings;
  user: UserProfile;
}

export const GameMaster: React.FC<GameMasterProps> = ({ settings, user }) => {
  const [newCategory, setNewCategory] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Every field here used to write to settings/global straight from onChange,
  // so typing a prize name produced one document write per character on a
  // document every connected client subscribes to. Keep a local draft for
  // responsiveness and coalesce the writes.
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const pendingRef = useRef<Partial<AppSettings>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(payload).length === 0) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), payload, { merge: true });
      // Snapshot is authoritative again, so stop shadowing these fields.
      setDraft(d => {
        const next = { ...d };
        for (const k of Object.keys(payload)) delete next[k as keyof AppSettings];
        return next;
      });
      setSaveError(null);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveError('Could not save your changes. Check your connection and try again.');
    }
  }, []);

  // Do not lose a half-typed value when the admin switches tabs.
  useEffect(() => () => { void flush(); }, [flush]);

  const updateSettings = (field: keyof AppSettings, value: any, immediate = false) => {
    setDraft(d => ({ ...d, [field]: value }));
    pendingRef.current = { ...pendingRef.current, [field]: value };
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) { void flush(); return; }
    timerRef.current = setTimeout(() => { void flush(); }, 500);
  };

  /** Current value: the local draft if the admin is mid-edit, else the snapshot. */
  const val = <K extends keyof AppSettings>(key: K): AppSettings[K] =>
    (draft[key] !== undefined ? draft[key] : settings[key]) as AppSettings[K];

  const categories = (val('businessCategories') ?? DEFAULT_CATEGORIES) as string[];

  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    updateSettings('businessCategories', [...categories, trimmed], true);
    setNewCategory('');
  };

  const removeCategory = (cat: string) => {
    updateSettings('businessCategories', categories.filter(c => c !== cat), true);
  };

  return (
    <div className="flex flex-col gap-8">
      {saveError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-red-600 font-bold">{saveError}</p>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      {/* Bingo Configuration */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-neutral-100 p-2 rounded-xl">
            <Gamepad2 className="text-neutral-900" size={20} />
          </div>
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Bingo Configuration</h3>
        </div>
        
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Free Space Name</label>
              <input 
                value={val('freeSpaceName')}
                onChange={(e) => updateSettings('freeSpaceName', e.target.value)}
                className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Free Space Task</label>
              <input 
                value={val('freeSpaceTask')}
                onChange={(e) => updateSettings('freeSpaceTask', e.target.value)}
                className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Board Size</label>
              <span className="text-xs font-bold bg-neutral-900 text-white px-3 py-1 rounded-full">{val('boardSize')}x{val('boardSize')}</span>
            </div>
            <input 
              type="range" min="3" max="5" step="1"
              value={val('boardSize')}
              onChange={(e) => updateSettings('boardSize', parseInt(e.target.value))}
              className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
              <span>3x3</span>
              <span>4x4</span>
              <span>5x5</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Difficulty Meter</label>
              <span className="text-xs font-bold bg-orange-100 text-orange-600 px-3 py-1 rounded-full">{val('difficulty')}%</span>
            </div>
            <p className="text-[10px] text-neutral-400 mb-4 italic leading-relaxed">
              Higher difficulty increases the ratio of businesses from other towns on player boards.
            </p>
            <input 
              type="range" min="0" max="100" step="5"
              value={val('difficulty')}
              onChange={(e) => updateSettings('difficulty', parseInt(e.target.value))}
              className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
              <span>Local Only</span>
              <span>Mixed</span>
              <span>Global</span>
            </div>
          </div>

          <div>
            <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Bingo Completion Prize</label>
            <input 
              value={val('bingoPrize') || ''}
              onChange={(e) => updateSettings('bingoPrize', e.target.value)}
              placeholder="e.g., Free Coffee at Main St Cafe"
              className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
            />
            <p className="text-[10px] text-neutral-400 mt-2 italic leading-relaxed">
              This prize is displayed to the user when they complete a bingo.
            </p>
          </div>

          <div className="pt-6 border-t border-neutral-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Pause Game</label>
                  {val('gamePaused') && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[9px] font-black uppercase tracking-widest">Paused</span>
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 italic">Temporarily freeze all visit verifications. Players can still view their boards.</p>
              </div>
              <button
                onClick={() => updateSettings('gamePaused', !val('gamePaused'), true)}
                className={`flex items-center gap-2 transition-colors ${val('gamePaused') ? 'text-red-500' : 'text-neutral-300'}`}
              >
                {val('gamePaused') ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
              </button>
            </div>
          </div>

          {user.role === 'admin' && (
            <div className="pt-6 border-t border-neutral-100">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">Real-time Map for Chamber</label>
                  <p className="text-[10px] text-neutral-400 italic">Allow Chamber users to see the live player map in Analytics.</p>
                </div>
                <button
                  onClick={() => updateSettings('showRealtimeMapToChamber', !val('showRealtimeMapToChamber'), true)}
                  className={`flex items-center gap-2 transition-colors ${val('showRealtimeMapToChamber') ? 'text-neutral-900' : 'text-neutral-300'}`}
                >
                  {val('showRealtimeMapToChamber') ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Raffle Configuration */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-yellow-50 p-2 rounded-xl">
              <Trophy className="text-yellow-600" size={20} />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Raffle Settings</h3>
          </div>
          <button 
            onClick={() => updateSettings('raffleEnabled', !val('raffleEnabled'), true)}
            className={`flex items-center gap-2 transition-colors ${val('raffleEnabled') ? 'text-green-600' : 'text-neutral-300'}`}
          >
            {val('raffleEnabled') ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">Raffle Description</label>
            <textarea 
              value={val('raffleDescription') || ''}
              onChange={(e) => updateSettings('raffleDescription', e.target.value)}
              placeholder="Explain the raffle prizes and rules..."
              rows={3}
              className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none resize-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <label className="block text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Entry Requirement</label>
              <span className="text-xs font-bold bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full">{val('raffleRequirement') || 5} Tasks</span>
            </div>
            <input 
              type="range" min="1" max="25" step="1"
              value={val('raffleRequirement') || 5}
              onChange={(e) => updateSettings('raffleRequirement', parseInt(e.target.value))}
              className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
              <span>1 Task</span>
              <span>12 Tasks</span>
              <span>25 Tasks</span>
            </div>
            <p className="text-[10px] text-neutral-400 mt-4 italic leading-relaxed">
              Number of business visits required to submit a raffle entry.
            </p>
          </div>
        </div>
      </div>
      </div>{/* end 2-col grid */}
      {/* Business Categories */}
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="bg-neutral-100 p-2 rounded-xl">
            <Tag className="text-neutral-900" size={20} />
          </div>
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Business Categories</h3>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {categories.map(cat => (
            <span key={cat} className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 rounded-xl text-xs font-bold text-neutral-700">
              {cat}
              <button onClick={() => removeCategory(cat)} className="text-neutral-400 hover:text-red-500 transition-colors">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="New category..."
            className="flex-1 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
          />
          <button
            onClick={addCategory}
            disabled={!newCategory.trim()}
            className="flex items-center gap-2 px-5 py-4 bg-neutral-900 text-white rounded-2xl text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-all hover:bg-neutral-700"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
    </div>
  );
};
