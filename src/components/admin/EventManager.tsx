import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { GameEvent, AppSettings, UserProfile } from '../../types';
import {
  createEvent, updateEvent, setActiveEvent, migrateToEvents, rotateAllCodes,
  errorMessage, isExpectedError,
} from '../../services/api';
import {
  CalendarDays, Play, Pause, Archive, Plus, Loader2, AlertTriangle,
  RotateCw, Copy, Check, Download,
} from 'lucide-react';

interface EventManagerProps {
  settings: AppSettings;
  currentUser: UserProfile;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  draft: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  paused: 'bg-orange-50 text-orange-700 border-orange-200',
  archived: 'bg-neutral-100 text-neutral-500 border-neutral-200',
};

/** `2026-09-15T18:00` for a datetime-local input, in the browser's timezone. */
const toLocalInput = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (value: string): string | null =>
  (value ? new Date(value).toISOString() : null);

const formatWindow = (e: GameEvent): string => {
  const fmt = (v?: string | null) =>
    (v ? new Date(v).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }) : null);
  const start = fmt(e.startsAt);
  const end = fmt(e.endsAt);
  if (start && end) return `${start} to ${end}`;
  if (start) return `Opens ${start}`;
  if (end) return `Closes ${end}`;
  return 'No scheduled window';
};

export const EventManager: React.FC<EventManagerProps> = ({ settings, currentUser }) => {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Which event's window is being edited, and the draft values for it.
  const [editing, setEditing] = useState<string | null>(null);
  const [editWindow, setEditWindow] = useState({ startsAt: '', endsAt: '' });

  const isAdmin = currentUser.role === 'admin';
  const activeId = settings.activeEventId;

  const [form, setForm] = useState({
    name: '', startsAt: '', endsAt: '', boardSize: 3, difficulty: 50,
    bingoPrize: '', rafflePrize: '',
  });

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'events'), orderBy('createdAt', 'desc')),
      snap => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as GameEvent))),
      err => console.error('Events snapshot error:', err),
    );
    return unsub;
  }, []);

  const run = async (key: string, fn: () => Promise<void>, success?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
    } catch (err) {
      if (!isExpectedError(err)) console.error(`${key} failed:`, err);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () => run('create', async () => {
    await createEvent({
      name: form.name.trim(),
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
      boardSize: Number(form.boardSize),
      difficulty: Number(form.difficulty),
      ...(form.bingoPrize.trim() ? { bingoPrize: form.bingoPrize.trim() } : {}),
      ...(form.rafflePrize.trim() ? { rafflePrize: form.rafflePrize.trim() } : {}),
    } as never);
    setShowForm(false);
    setForm({ name: '', startsAt: '', endsAt: '', boardSize: 3, difficulty: 50, bingoPrize: '', rafflePrize: '' });
  }, 'Event created as a draft. Activate it when you are ready.');

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <p className="text-green-700 text-xs font-bold">{notice}</p>
        </div>
      )}

      {/*
        Before the migration there is no event document at all. The game still
        runs -- the server falls back to a synthetic event built from
        settings/global -- but nothing can be scheduled until this is done.
      */}
      {!activeId && (
        <div className="bg-white border-2 border-[var(--color-primary)] rounded-3xl p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <AlertTriangle className="text-[var(--color-primary)] shrink-0 mt-0.5" size={20} aria-hidden="true" />
            <div className="flex-1">
              <h3 className="font-bold text-base mb-2">Set up seasons</h3>
              <p className="text-sm text-neutral-600 leading-relaxed mb-4">
                The game is running on its original single-season settings. Converting
                to an event lets you schedule a start and end, and run the game again
                next year without wiping this year&rsquo;s results. Your existing
                visits, boards and raffle entries are kept and attached to it.
              </p>
              <button
                onClick={() => run('migrate', async () => {
                  const res = await migrateToEvents({});
                  setNotice(res.migrated
                    ? 'Converted. Your current game is now an event you can schedule.'
                    : res.reason || 'Already converted.');
                })}
                disabled={busy === 'migrate' || !isAdmin}
                className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy === 'migrate' && <Loader2 className="animate-spin" size={14} aria-hidden="true" />}
                Convert to an event
              </button>
              {!isAdmin && (
                <p className="text-[11px] text-neutral-500 mt-3">
                  An admin has to run this one.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Events -------------------------------------------------------- */}
      <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
              <CalendarDays className="text-white" size={14} aria-hidden="true" />
            </div>
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-500">Seasons</h3>
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            aria-expanded={showForm}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-all"
          >
            <Plus size={13} aria-hidden="true" /> New season
          </button>
        </div>

        {showForm && (
          <div className="mb-8 bg-neutral-50 border border-neutral-200 rounded-2xl p-6 space-y-4">
            <div>
              <label htmlFor="evt-name" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                Name
              </label>
              <input
                id="evt-name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Fall Bingo 2026"
                className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="evt-start" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Opens
                </label>
                <input
                  id="evt-start" type="datetime-local" value={form.startsAt}
                  onChange={e => setForm({ ...form, startsAt: e.target.value })}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label htmlFor="evt-end" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Closes
                </label>
                <input
                  id="evt-end" type="datetime-local" value={form.endsAt}
                  onChange={e => setForm({ ...form, endsAt: e.target.value })}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>
            <p className="text-[11px] text-neutral-500 leading-relaxed">
              Leave either blank for an open-ended season. Verification stops on its
              own outside this window, so you do not have to remember to switch it off.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="evt-size" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Board size
                </label>
                <select
                  id="evt-size" value={form.boardSize}
                  onChange={e => setForm({ ...form, boardSize: Number(e.target.value) })}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                >
                  {[3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} x {n} ({n * n - 1} businesses)</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="evt-diff" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Out-of-town mix: {form.difficulty}%
                </label>
                <input
                  id="evt-diff" type="range" min={0} max={100} step={5}
                  value={form.difficulty}
                  onChange={e => setForm({ ...form, difficulty: Number(e.target.value) })}
                  className="w-full mt-3"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="evt-bingo" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Bingo prize
                </label>
                <input
                  id="evt-bingo" value={form.bingoPrize}
                  onChange={e => setForm({ ...form, bingoPrize: e.target.value })}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div>
                <label htmlFor="evt-raffle" className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                  Raffle prize
                </label>
                <input
                  id="evt-raffle" value={form.rafflePrize}
                  onChange={e => setForm({ ...form, rafflePrize: e.target.value })}
                  className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={busy === 'create' || !form.name.trim()}
                className="bg-[var(--color-primary)] text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                {busy === 'create' && <Loader2 className="animate-spin" size={14} aria-hidden="true" />}
                Create as draft
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest border border-neutral-200 hover:border-neutral-900 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {events.length === 0 ? (
          <p className="text-sm text-neutral-500 italic py-4">
            No seasons yet.
          </p>
        ) : (
          <div className="space-y-3">
            {events.map(evt => {
              const isActive = evt.id === activeId;
              return (
                <div
                  key={evt.id}
                  className={`rounded-2xl border p-5 ${isActive ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-neutral-200 bg-neutral-50'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-bold text-sm">{evt.name}</p>
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${STATUS_STYLES[evt.status] || STATUS_STYLES.draft}`}>
                          {evt.status}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest bg-[var(--color-primary)] text-white">
                            Live
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 font-medium">{formatWindow(evt)}</p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        {evt.boardSize || 3} x {evt.boardSize || 3} board
                        {evt.bingoPrize ? ` - ${evt.bingoPrize}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {evt.status !== 'archived' && !isActive && (
                        <button
                          onClick={() => run(`activate-${evt.id}`, async () => {
                            await setActiveEvent({ eventId: evt.id });
                          }, `${evt.name} is now the live season.`)}
                          disabled={busy !== null}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-green-500 hover:text-green-700 transition-all disabled:opacity-50"
                        >
                          {busy === `activate-${evt.id}`
                            ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                            : <Play size={12} aria-hidden="true" />}
                          Make live
                        </button>
                      )}

                      {isActive && (
                        <button
                          onClick={() => run(`toggle-${evt.id}`, async () => {
                            await updateEvent({
                              eventId: evt.id,
                              status: evt.status === 'paused' ? 'active' : 'paused',
                            });
                          })}
                          disabled={busy !== null}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-neutral-900 transition-all disabled:opacity-50"
                        >
                          {evt.status === 'paused'
                            ? <><Play size={12} aria-hidden="true" /> Resume</>
                            : <><Pause size={12} aria-hidden="true" /> Pause</>}
                        </button>
                      )}

                      {evt.status !== 'archived' && (
                        <button
                          onClick={() => {
                            setEditing(editing === evt.id ? null : evt.id);
                            setEditWindow({
                              startsAt: toLocalInput(evt.startsAt),
                              endsAt: toLocalInput(evt.endsAt),
                            });
                          }}
                          aria-expanded={editing === evt.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-neutral-900 transition-all"
                        >
                          <CalendarDays size={12} aria-hidden="true" /> Dates
                        </button>
                      )}

                      {evt.status !== 'archived' && (
                        <button
                          onClick={() => run(`archive-${evt.id}`, async () => {
                            await updateEvent({ eventId: evt.id, status: 'archived' });
                          }, `${evt.name} archived. Its results are kept.`)}
                          disabled={busy !== null}
                          title="Archiving keeps every result. It cannot be undone."
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-neutral-900 transition-all disabled:opacity-50"
                        >
                          <Archive size={12} aria-hidden="true" /> Archive
                        </button>
                      )}
                    </div>
                  </div>

                  {editing === evt.id && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <label htmlFor={`start-${evt.id}`} className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                          Opens
                        </label>
                        <input
                          id={`start-${evt.id}`} type="datetime-local" value={editWindow.startsAt}
                          onChange={e => setEditWindow({ ...editWindow, startsAt: e.target.value })}
                          className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                        />
                      </div>
                      <div>
                        <label htmlFor={`end-${evt.id}`} className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2">
                          Closes
                        </label>
                        <input
                          id={`end-${evt.id}`} type="datetime-local" value={editWindow.endsAt}
                          onChange={e => setEditWindow({ ...editWindow, endsAt: e.target.value })}
                          className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-neutral-900"
                        />
                      </div>
                      <button
                        onClick={() => run(`window-${evt.id}`, async () => {
                          await updateEvent({
                            eventId: evt.id,
                            startsAt: fromLocalInput(editWindow.startsAt),
                            endsAt: fromLocalInput(editWindow.endsAt),
                          });
                          setEditing(null);
                        }, 'Window updated.')}
                        disabled={busy !== null}
                        className="bg-neutral-900 text-white px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {busy === `window-${evt.id}` && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                        Save window
                      </button>
                      <p className="sm:col-span-3 text-[11px] text-neutral-500 leading-relaxed">
                        Clearing a field removes that boundary. Extending a running
                        season takes effect immediately, so this is how you give
                        players another weekend.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && <CodeRotation />}
    </div>
  );
};

/**
 * Rotate every business code at once.
 *
 * Run this the morning of the event. Codes leak during setup -- they get
 * photographed, emailed, and posted in group chats while businesses are testing
 * their posters -- and rotating invalidates every one of those before the first
 * real player scans.
 *
 * The new codes are shown once and offered as a CSV, because that is the only
 * moment they exist in one place; after this they live in business_secrets,
 * one per business.
 */
const CodeRotation: React.FC = () => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ businessId: string; name: string; code: string }[] | null>(null);
  const [copied, setCopied] = useState(false);

  const rotate = async () => {
    setBusy(true);
    setError(null);
    setConfirming(false);
    try {
      const res = await rotateAllCodes({});
      setResults(res.results);
      if (res.failed > 0) {
        setError(`${res.failed} business${res.failed === 1 ? '' : 'es'} could not be rotated. Check the logs.`);
      }
    } catch (err) {
      if (!isExpectedError(err)) console.error('rotateAllCodes failed:', err);
      setError(errorMessage(err, 'Could not rotate the codes.'));
    } finally {
      setBusy(false);
    }
  };

  const csv = () => {
    if (!results) return;
    const rows = [
      'Business,Code',
      ...results.map(r => `"${r.name.replace(/"/g, '""')}","${r.code}"`),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chamber-bingo-codes.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-3xl p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-[var(--color-accent,#CC5500)] rounded-xl flex items-center justify-center shrink-0">
          <RotateCw className="text-white" size={14} aria-hidden="true" />
        </div>
        <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-500">Event day</h3>
      </div>

      <p className="text-sm text-neutral-600 leading-relaxed mb-4">
        Rotating issues a fresh code for every business and immediately stops the
        old ones working. Do this the morning the game opens: codes get
        photographed and shared around while businesses are testing their posters,
        and rotating kills every one of those before the first real player scans.
      </p>
      <p className="text-[11px] text-neutral-500 leading-relaxed mb-6">
        Every printed poster has to be replaced afterwards. The new codes are
        shown once, here.
      </p>

      {error && (
        <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold">{error}</p>
        </div>
      )}

      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-[var(--color-accent,#CC5500)] hover:text-[var(--color-accent,#CC5500)] transition-all disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <RotateCw size={13} aria-hidden="true" />}
          Rotate every code
        </button>
      ) : (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-orange-900 mb-1">
            Every poster currently in the field stops working.
          </p>
          <p className="text-xs text-orange-800 leading-relaxed mb-4">
            Players cannot verify a visit at any business until the new codes are
            printed and put up. Only do this if you are ready to reprint.
          </p>
          <div className="flex gap-3">
            <button
              onClick={rotate}
              className="bg-[var(--color-accent,#CC5500)] text-white px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest"
            >
              Yes, rotate everything
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-orange-200 text-orange-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              {results.length} new code{results.length === 1 ? '' : 's'} - shown once
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    results.map(r => `${r.name}\t${r.code}`).join('\n'),
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-white border border-neutral-200 hover:border-neutral-900 transition-all"
              >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                onClick={csv}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-800 transition-all"
              >
                <Download size={12} aria-hidden="true" /> CSV
              </button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-neutral-200 divide-y divide-neutral-100">
            {results.map(r => (
              <div key={r.businessId} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-xs font-medium truncate">{r.name}</span>
                <span className="text-xs font-mono font-bold tracking-wider shrink-0">{r.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
