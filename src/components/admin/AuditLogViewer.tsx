import React, { useState, useMemo } from 'react';
import { AuditLog } from '../../types';
import { Clock, Search } from 'lucide-react';
import { HelpTip } from './HelpTip';

interface AuditLogViewerProps {
  logs: AuditLog[];
}

const actionBadge = (action: string) => {
  if (action === 'add_completion') return 'bg-green-100 text-green-700';
  if (action === 'remove_completion') return 'bg-red-100 text-red-700';
  if (action.startsWith('reset') || action === 'global_reset') return 'bg-orange-100 text-orange-700';
  if (action === 'change_role' || action === 'set_user_role') return 'bg-blue-100 text-blue-700';
  if (action === 'draw_raffle_winner' || action === 'raffle_draw' || action === 'redeem_win') return 'bg-yellow-100 text-yellow-700';
  if (action === 'rotate_codes' || action.includes('code')) return 'bg-purple-100 text-purple-700';
  return 'bg-neutral-100 text-neutral-600';
};

const LABELS: Record<string, string> = {
  add_completion: 'Credited a visit',
  remove_completion: 'Removed a visit',
  change_role: 'Changed a role',
  set_user_role: 'Changed a role',
  reset_user: 'Reset a player',
  reset_town: 'Reset a player’s town',
  reset_progress: 'Reset a player’s progress',
  reset_board: 'Reset a player’s board',
  reset_everything: 'Reset a player completely',
  global_reset: 'Started the game over',
  draw_raffle_winner: 'Drew a raffle winner',
  raffle_draw: 'Drew raffle winners',
  redeem_win: 'Handed over a prize',
  rotate_codes: 'Rotated every business code',
  create_event: 'Created a season',
  update_event: 'Changed a season',
  set_active_event: 'Made a season live',
  create_invite: 'Created an invite',
  revoke_invite: 'Revoked an invite',
  claim_business: 'Claimed a business',
  bootstrap_admin: 'Claimed the first admin account',
};

/** "reset_town" is not a sentence. Fall back to a readable version of the raw key. */
const label = (action: string) =>
  LABELS[action] ?? action.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ logs }) => {
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    const q = search.toLowerCase().trim();
    const all = [...logs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (!q) return all.slice(0, 200);
    return all
      .filter(l =>
        label(l.action).toLowerCase().includes(q) ||
        (l.actorEmail || '').toLowerCase().includes(q) ||
        (l.targetEmail || '').toLowerCase().includes(q)
      )
      .slice(0, 200);
  }, [logs, search]);

  return (
    <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="bg-neutral-100 p-2 rounded-xl">
          <Clock className="text-neutral-900" size={20} aria-hidden="true" />
        </div>
        <h3 className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-xs text-neutral-400">
          History
          <HelpTip label="the history log">
            <p>Every change anyone made from these tabs: role changes, resets, prize draws, code rotations.</p>
            <p>This is what you point at if a result is ever disputed. It cannot be edited from inside the app.</p>
          </HelpTip>
        </h3>
        <span className="ml-auto text-[10px] text-neutral-400 font-bold uppercase tracking-widest">
          {sorted.length} {search ? 'matching' : 'recent'} entries
        </span>
      </div>
      <p className="text-sm text-neutral-500 leading-relaxed mb-6">
        Who did what, and when. The 200 most recent actions.
      </p>

      {logs.length > 0 && (
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3 mb-6">
          <Search size={16} className="text-neutral-400 shrink-0" aria-hidden="true" />
          <label htmlFor="audit-search" className="sr-only">Search the history</label>
          <input
            id="audit-search"
            type="text"
            placeholder="Search by person or action..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none font-medium placeholder:text-neutral-500"
          />
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="mx-auto text-neutral-200 mb-4" size={48} aria-hidden="true" />
          <p className="text-neutral-500 text-sm font-medium">
            {search ? 'Nothing matches that.' : 'Nothing has happened yet.'}
          </p>
          {!search && (
            <p className="text-xs text-neutral-400 mt-1">
              Changes you make on the other tabs will show up here.
            </p>
          )}
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {sorted.map(log => (
            <div key={log.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${actionBadge(log.action)}`}>
                  {label(log.action)}
                </span>
                <span className="text-xs text-neutral-600">
                  <span className="font-bold text-neutral-800">{log.actorEmail || 'Someone'}</span>
                  {log.targetEmail && log.targetEmail !== log.actorEmail && (
                    <> &rarr; <span className="font-bold text-neutral-800">{log.targetEmail}</span></>
                  )}
                </span>
                <span className="ml-auto font-mono text-[10px] text-neutral-400 shrink-0">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
              </div>
              {log.details && Object.keys(log.details).length > 0 && (
                <details className="mt-1">
                  <summary className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest cursor-pointer hover:text-neutral-700 transition-colors select-none">
                    Details
                  </summary>
                  <pre className="mt-1 text-[9px] text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-xl px-3 py-2 overflow-x-auto font-mono">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
