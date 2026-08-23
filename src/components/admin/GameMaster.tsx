import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppSettings, GameEvent, UserProfile } from '../../types';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Gamepad2, Trophy, ToggleLeft, ToggleRight, Lock, ArrowUp } from 'lucide-react';
import { HelpTip } from './HelpTip';

interface GameMasterProps {
  settings: AppSettings;
  user: UserProfile;
  /** The live season, when one exists. It owns board size, town mix, prize and pause. */
  activeEvent: GameEvent | null;
}

/**
 * A read-only value with the reason it is read-only.
 *
 * These four fields exist on both settings/global and on the event. Once a
 * season is live the server reads them from the event
 * (functions/lib/events.js), so editing them here changed nothing while the
 * control still moved and still looked saved. The Pause toggle was the worst of
 * it: staff freezing the game mid-event would flip this one, watch it turn red,
 * and verifications would carry on succeeding.
 *
 * Rather than quietly writing to a document nobody reads, show the live value
 * and point at the control that actually works.
 */
const SeasonOwned: React.FC<{
  label: string;
  value: React.ReactNode;
  seasonName: string;
  help?: React.ReactNode;
}> = ({ label, value, seasonName, help }) => (
  <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
    <div className="flex items-center justify-between gap-3 mb-1">
      <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
        {label}
        {help}
      </span>
      <Lock size={12} className="text-neutral-400 shrink-0" aria-hidden="true" />
    </div>
    <p className="text-sm font-bold text-neutral-900">{value}</p>
    <p className="flex items-center gap-1 text-[10px] text-neutral-500 mt-2 leading-relaxed">
      <ArrowUp size={10} className="shrink-0" aria-hidden="true" />
      Set on the <span className="font-bold">{seasonName}</span> season above.
    </p>
  </div>
);

export const GameMaster: React.FC<GameMasterProps> = ({ settings, user, activeEvent }) => {
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

  const updateSettings = (field: keyof AppSettings, value: unknown, immediate = false) => {
    setDraft(d => ({ ...d, [field]: value }));
    pendingRef.current = { ...pendingRef.current, [field]: value };
    if (timerRef.current) clearTimeout(timerRef.current);
    if (immediate) { void flush(); return; }
    timerRef.current = setTimeout(() => { void flush(); }, 500);
  };

  /** Current value: the local draft if the admin is mid-edit, else the snapshot. */
  const val = <K extends keyof AppSettings>(key: K): AppSettings[K] =>
    (draft[key] !== undefined ? draft[key] : settings[key]) as AppSettings[K];

  const seasonName = activeEvent?.name ?? '';
  const seasonOwns = Boolean(activeEvent);
  const paused = activeEvent ? activeEvent.status === 'paused' : Boolean(val('gamePaused'));

  return (
    <div className="flex flex-col gap-8">
      {saveError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-xs text-red-600 font-bold">{saveError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* --- Board rules ------------------------------------------------- */}
        <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-neutral-100 p-2 rounded-xl">
              <Gamepad2 className="text-neutral-900" size={20} aria-hidden="true" />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">Board Rules</h3>
          </div>
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
            {seasonOwns
              ? `Board size, town mix and the bingo prize belong to the ${seasonName} season, so they are shown here and edited above.`
              : 'How every player’s board is built, and what they win for filling one.'}
          </p>

          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <label htmlFor="free-space-name" className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                    Free Space Name
                  </label>
                  <HelpTip label="the free space name">
                    <p>The middle square of the board, which every player starts with already filled.</p>
                    <p>Most chambers leave this as FREE. Some use their own name, so the board reads as theirs at a glance.</p>
                  </HelpTip>
                </div>
                <input
                  id="free-space-name"
                  value={val('freeSpaceName') || ''}
                  onChange={(e) => updateSettings('freeSpaceName', e.target.value)}
                  className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                />
              </div>
              <div>
                <label htmlFor="free-space-task" className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">
                  Free Space Task
                </label>
                <input
                  id="free-space-task"
                  value={val('freeSpaceTask') || ''}
                  onChange={(e) => updateSettings('freeSpaceTask', e.target.value)}
                  className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                />
              </div>
            </div>

            {seasonOwns ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SeasonOwned
                  label="Board Size"
                  seasonName={seasonName}
                  value={`${activeEvent?.boardSize || 3} x ${activeEvent?.boardSize || 3}`}
                  help={
                    <HelpTip label="board size">
                      <p>How many squares a player has to fill. A 3x3 needs 8 businesses plus the free space, a 4x4 needs 15, a 5x5 needs 24.</p>
                      <p>Bigger boards take longer and need many more member businesses. Most chambers start at 3x3.</p>
                    </HelpTip>
                  }
                />
                <SeasonOwned
                  label="Out-of-town Mix"
                  seasonName={seasonName}
                  value={`${activeEvent?.difficulty ?? 50}%`}
                  help={
                    <HelpTip label="the out-of-town mix">
                      <p>How much of a board comes from towns other than the player&rsquo;s own.</p>
                      <p>At 0% a Peekskill player only gets Peekskill shops. At 50% about half their squares are elsewhere, which means more driving and sends traffic to smaller towns.</p>
                    </HelpTip>
                  }
                />
              </div>
            ) : (
              <>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                      Board Size
                      <HelpTip label="board size">
                        <p>How many squares a player has to fill. A 3x3 needs 8 businesses plus the free space, a 4x4 needs 15, a 5x5 needs 24.</p>
                        <p>Bigger boards take longer and need many more member businesses. Most chambers start at 3x3.</p>
                      </HelpTip>
                    </span>
                    <span className="text-xs font-bold bg-neutral-900 text-white px-3 py-1 rounded-full">
                      {val('boardSize')}x{val('boardSize')}
                    </span>
                  </div>
                  <input
                    type="range" min="3" max="6" step="1"
                    aria-label="Board size"
                    value={val('boardSize')}
                    onChange={(e) => updateSettings('boardSize', parseInt(e.target.value))}
                    className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
                    <span>3x3</span><span>4x4</span><span>5x5</span><span>6x6</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                    Needs {(val('boardSize') || 3) ** 2 - 1} participating businesses.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                      Out-of-town Mix
                      <HelpTip label="the out-of-town mix">
                        <p>How much of a board comes from towns other than the player&rsquo;s own.</p>
                        <p>At 0% a Peekskill player only gets Peekskill shops. At 50% about half their squares are elsewhere, which means more driving and sends traffic to smaller towns.</p>
                        <p>If a town does not have enough businesses of its own, the app fills the gap from elsewhere regardless.</p>
                      </HelpTip>
                    </span>
                    <span className="text-xs font-bold bg-orange-100 text-orange-600 px-3 py-1 rounded-full">{val('difficulty')}%</span>
                  </div>
                  <input
                    type="range" min="0" max="100" step="5"
                    aria-label="Out-of-town mix"
                    value={val('difficulty')}
                    onChange={(e) => updateSettings('difficulty', parseInt(e.target.value))}
                    className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
                    <span>Home town only</span><span>Half and half</span><span>Anywhere</span>
                  </div>
                </div>
              </>
            )}

            {seasonOwns ? (
              <SeasonOwned
                label="Bingo Prize"
                seasonName={seasonName}
                value={activeEvent?.bingoPrize || 'Not set'}
                help={
                  <HelpTip label="the bingo prize">
                    <p>What a player gets for filling a line. Shown to them the moment they win, and recorded against the win so you know what you owe.</p>
                  </HelpTip>
                }
              />
            ) : (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <label htmlFor="bingo-prize" className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                    Bingo Completion Prize
                  </label>
                  <HelpTip label="the bingo prize">
                    <p>What a player gets for filling a line. Shown to them the moment they win, and recorded against the win so you know what you owe.</p>
                  </HelpTip>
                </div>
                <input
                  id="bingo-prize"
                  value={val('bingoPrize') || ''}
                  onChange={(e) => updateSettings('bingoPrize', e.target.value)}
                  placeholder="e.g. A $25 gift card to any member business"
                  className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                />
              </div>
            )}

            <div className="pt-6 border-t border-neutral-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                      Pause the game
                      <HelpTip label="pausing the game">
                        <p>Stops every check-in immediately. Players can still open the app and look at their board, but scanning a code politely refuses.</p>
                        <p>Use it if a code leaks, if a business drops out mid-day, or while you sort out a dispute.</p>
                      </HelpTip>
                    </span>
                    {paused && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-[9px] font-black uppercase tracking-widest">Paused</span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed max-w-sm">
                    {seasonOwns
                      ? `Pausing belongs to the ${seasonName} season. Use the Pause button on it above, which is the one the game actually listens to.`
                      : 'Freezes all visit verification. Players can still view their boards.'}
                  </p>
                </div>
                {seasonOwns ? (
                  <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 shrink-0 pt-1">
                    <Lock size={12} aria-hidden="true" />
                    {paused ? 'Paused' : 'Running'}
                  </span>
                ) : (
                  <button
                    onClick={() => updateSettings('gamePaused', !val('gamePaused'), true)}
                    aria-pressed={Boolean(val('gamePaused'))}
                    aria-label="Pause the game"
                    className={`flex items-center gap-2 transition-colors shrink-0 ${val('gamePaused') ? 'text-red-500' : 'text-neutral-500'}`}
                  >
                    {val('gamePaused') ? <ToggleRight size={32} aria-hidden="true" /> : <ToggleLeft size={32} aria-hidden="true" />}
                  </button>
                )}
              </div>
            </div>

            {user.role === 'admin' && (
              <div className="pt-6 border-t border-neutral-100">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest mb-1 font-bold">
                      Show the live player map to chamber staff
                      <HelpTip label="the live player map">
                        <p>Reports can show a map of where players are right now, updated as they move.</p>
                        <p>That is real location data about members of the public. Off by default: turn it on only if your chamber is comfortable with staff seeing it, and say so in your privacy notice.</p>
                      </HelpTip>
                    </span>
                    <p className="text-[11px] text-neutral-500 leading-relaxed max-w-sm">
                      Admins always see it. This decides whether Chamber Manager accounts do too.
                    </p>
                  </div>
                  <button
                    onClick={() => updateSettings('showRealtimeMapToChamber', !val('showRealtimeMapToChamber'), true)}
                    aria-pressed={Boolean(val('showRealtimeMapToChamber'))}
                    aria-label="Show the live player map to chamber staff"
                    className={`flex items-center gap-2 transition-colors shrink-0 ${val('showRealtimeMapToChamber') ? 'text-neutral-900' : 'text-neutral-500'}`}
                  >
                    {val('showRealtimeMapToChamber') ? <ToggleRight size={32} aria-hidden="true" /> : <ToggleLeft size={32} aria-hidden="true" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- Raffle -------------------------------------------------------- */}
        <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-50 p-2 rounded-xl">
                <Trophy className="text-yellow-600" size={20} aria-hidden="true" />
              </div>
              <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
                Raffle
                <HelpTip label="the raffle">
                  <p>A second way to win that does not need a full board. Players who reach a set number of visits can enter their name, and you draw from the pool at the end.</p>
                  <p>It keeps people playing who will never fill a whole board, which is most of them.</p>
                </HelpTip>
              </h3>
            </div>
            <button
              onClick={() => updateSettings('raffleEnabled', !val('raffleEnabled'), true)}
              aria-pressed={Boolean(val('raffleEnabled'))}
              aria-label="Enable the raffle"
              className={`flex items-center gap-2 transition-colors shrink-0 ${val('raffleEnabled') ? 'text-green-600' : 'text-neutral-500'}`}
            >
              {val('raffleEnabled') ? <ToggleRight size={32} aria-hidden="true" /> : <ToggleLeft size={32} aria-hidden="true" />}
            </button>
          </div>
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
            {val('raffleEnabled')
              ? 'Switched on. Players see the raffle once they qualify, and you draw from the Prizes tab.'
              : 'Switched off. Players will not see a raffle at all.'}
          </p>

          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <label htmlFor="raffle-prize" className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                  Raffle Prize
                </label>
                <HelpTip label="the raffle prize" align="right">
                  <p>Recorded against each name you draw, so the winners list says what they actually won.</p>
                  <p>Leave it blank and the record is blank, which is awkward to explain a month later.</p>
                </HelpTip>
              </div>
              <input
                id="raffle-prize"
                value={val('rafflePrize') || ''}
                onChange={(e) => updateSettings('rafflePrize', e.target.value)}
                placeholder="e.g. A weekend at the Peekskill Inn"
                className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
              />
            </div>

            <div>
              <label htmlFor="raffle-desc" className="block text-[10px] text-neutral-400 uppercase tracking-widest mb-2 font-bold">
                Raffle Description
              </label>
              <textarea
                id="raffle-desc"
                value={val('raffleDescription') || ''}
                onChange={(e) => updateSettings('raffleDescription', e.target.value)}
                placeholder="Explain the prizes, when the draw happens and how winners are told..."
                rows={3}
                className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none resize-none"
              />
              <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                Shown to players on the raffle screen. This is the only place they are
                told when the draw happens, so say.
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-4">
                <span className="flex items-center gap-1.5 text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                  Visits Needed to Enter
                  <HelpTip label="the entry requirement" align="right">
                    <p>How many verified visits a player needs before they can put their name in the raffle.</p>
                    <p>Set it below a full board so people who will not finish still have something to play for. On a 3x3 board, four or five is a good target.</p>
                  </HelpTip>
                </span>
                <span className="text-xs font-bold bg-neutral-100 text-neutral-600 px-3 py-1 rounded-full">
                  {val('raffleRequirement') || 5} visits
                </span>
              </div>
              <input
                type="range" min="1" max="25" step="1"
                aria-label="Visits needed to enter the raffle"
                value={val('raffleRequirement') || 5}
                onChange={(e) => updateSettings('raffleRequirement', parseInt(e.target.value))}
                className="w-full h-2 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-neutral-900"
              />
              <div className="flex justify-between text-[10px] text-neutral-400 mt-2 font-bold">
                <span>1</span><span>12</span><span>25</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
