import React, { useState, useMemo } from 'react';
import { UserProfile, Business, AppSettings } from '../../types';
import { collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Trash2, RotateCcw, Gamepad2, MapPin, Search, ChevronLeft, ChevronRight, LayoutGrid, AlertTriangle, Loader2 } from 'lucide-react';
import { BoardImpersonation } from './BoardImpersonation';
import { InviteManager } from './InviteManager';
import { HelpTip } from './HelpTip';
import { setUserRole, adminResetUser, adminGlobalReset, errorMessage, isExpectedError } from '../../services/api';

const USER_PAGE_SIZE = 25;

interface AdminMenuProps {
  users: UserProfile[];
  businesses: Business[];
  currentUser: UserProfile;
  settings: AppSettings;
}

export const AdminMenu: React.FC<AdminMenuProps> = ({ users, businesses, currentUser, settings }) => {
  const [confirmAction, setConfirmAction] = useState<{ uid: string; type: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [impersonating, setImpersonating] = useState<UserProfile | null>(null);

  const isAdmin = currentUser.role === 'admin';

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    // Chamber users cannot see or manage admin accounts
    let result = isAdmin ? users : users.filter(u => u.role !== 'admin');
    if (roleFilter) {
      result = result.filter(u => u.role === roleFilter);
    }
    if (!q) return result;
    return result.filter(u =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.town || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  }, [users, userSearch, roleFilter, isAdmin]);

  const userPageCount = Math.ceil(filteredUsers.length / USER_PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(userPage * USER_PAGE_SIZE, (userPage + 1) * USER_PAGE_SIZE);

  const [roleError, setRoleError] = useState<string | null>(null);

  /**
   * Role changes are admin-only and go through a callable.
   *
   * Two reasons this is no longer a direct write. The rules refuse role edits
   * from every client, because a self-write was the original privilege
   * escalation. And the custom claim has to move in the same operation, or the
   * token and the document disagree until the token happens to refresh.
   *
   * The server also refuses to remove the last admin and revokes refresh tokens
   * on demotion, which rules cannot do.
   */
  const updateUserRole = async (u: UserProfile, role: string) => {
    setRoleError(null);
    try {
      await setUserRole({
        uid: u.uid,
        role: role as 'player' | 'business' | 'chamber' | 'admin',
        ...(role === 'business' && u.businessId ? { businessId: u.businessId } : {}),
      });
    } catch (err) {
      if (!isExpectedError(err)) console.error('setUserRole failed:', err);
      setRoleError(errorMessage(err, 'Could not change that role.'));
    }
  };

  const updateBusinessId = async (uid: string, businessId: string) => {
    setRoleError(null);
    try {
      await setUserRole({ uid, role: 'business', businessId });
    } catch (err) {
      if (!isExpectedError(err)) console.error('setUserRole failed:', err);
      setRoleError(errorMessage(err, 'Could not assign that business.'));
    }
  };

  const handleReset = async (u: UserProfile, type: 'town' | 'progress' | 'board' | 'everything') => {
    if (confirmAction?.uid !== u.uid || confirmAction?.type !== type) {
      setConfirmAction({ uid: u.uid, type });
      setTimeout(() => setConfirmAction(null), 3000);
      return;
    }

    // Resets are a callable now. The board moved to boards/{uid}, which no
    // client can write, so clearing users/{uid}.bingoBoard from here stopped
    // actually resetting anything while still appearing to succeed. The server
    // also deletes completions in batches and writes its own audit entry.
    setRoleError(null);
    try {
      await adminResetUser({ userId: u.uid, type });
    } catch (err) {
      if (!isExpectedError(err)) console.error('adminResetUser failed:', err);
      setRoleError(errorMessage(err, 'Could not reset that player.'));
    }

    setConfirmAction(null);
  };

  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clearTestData = async () => {
    setClearing(true);
    setClearConfirm(false);
    try {
      // completions, boards, wins and verification_attempts are server-written
      // and closed to every client, so the callable clears those first.
      await adminGlobalReset({});

      const collections = ['raffle_entries', 'winners', 'notifications'];
      for (const col of collections) {
        const snap = await getDocs(collection(db, col));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      }
      // Delete all user docs except current admin
      const usersSnap = await getDocs(collection(db, 'users'));
      await Promise.all(
        usersSnap.docs
          .filter(d => d.id !== currentUser.uid)
          .map(d => deleteDoc(d.ref))
      );
    } catch (err) {
      console.error('Clear failed:', err);
    } finally {
      setClearing(false);
    }
  };

  // Previously a window.confirm followed by an alert, the only two of either in
  // the app. A browser dialog gives no room to say what is about to happen, and
  // "DANGER" is not a description.
  const [globalResetArmed, setGlobalResetArmed] = useState(false);
  const [globalResetting, setGlobalResetting] = useState(false);
  const [globalResetNotice, setGlobalResetNotice] = useState<string | null>(null);

  const performGlobalReset = async () => {
    setGlobalResetting(true);
    setGlobalResetArmed(false);
    setRoleError(null);
    setGlobalResetNotice(null);
    try {
      const res = await adminGlobalReset({});
      setGlobalResetNotice(
        `Done. ${res.users} player${res.users === 1 ? '' : 's'}, ${res.completions} visit${res.completions === 1 ? '' : 's'} and ${res.boards} board${res.boards === 1 ? '' : 's'} cleared. Accounts and businesses were kept.`
      );
    } catch (err) {
      if (!isExpectedError(err)) console.error('adminGlobalReset failed:', err);
      setRoleError(errorMessage(err, 'The reset did not finish. Some players may have been cleared already.'));
    } finally {
      setGlobalResetting(false);
    }
  };

  const rolePills = [
    { label: 'All', value: '' },
    { label: 'Player', value: 'player' },
    { label: 'Business', value: 'business' },
    { label: 'Chamber', value: 'chamber' },
    ...(isAdmin ? [{ label: 'Admin', value: 'admin' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">People</h3>
          {isAdmin && (
            <button
              onClick={() => { setGlobalResetArmed(true); setGlobalResetNotice(null); }}
              disabled={globalResetting}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all disabled:opacity-50"
            >
              {globalResetting
                ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                : <RotateCcw size={12} aria-hidden="true" />}
              Start the game over
            </button>
          )}
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed mb-6">
          Everyone with an account. Change what someone is allowed to do, look at a
          player&rsquo;s board, or clear their progress if something has gone wrong.
        </p>

        {globalResetArmed && (
          <div role="alertdialog" aria-label="Start the game over" className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-sm font-bold text-red-900 mb-1">
              Clear every player&rsquo;s progress?
            </p>
            <p className="text-xs text-red-800 leading-relaxed mb-4">
              Every board, every recorded visit and every bingo win is deleted, for
              everyone. Accounts, businesses, towns and your settings are kept, and
              players get a fresh board next time they open the app. There is no undo.
              This is for starting a new run of the game, not for fixing one player.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={performGlobalReset}
                className="bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-red-600 transition-all"
              >
                Yes, clear all progress
              </button>
              <button
                onClick={() => setGlobalResetArmed(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-red-200 text-red-800 hover:bg-red-100 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {globalResetNotice && (
          <div role="status" className="mb-6 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
            <p className="text-green-700 text-xs font-bold leading-relaxed">{globalResetNotice}</p>
          </div>
        )}

        {/* Search -- full width and prominent */}
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 mb-4">
          <Search size={18} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, town, or role..."
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-neutral-500"
          />
          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest shrink-0">
            {filteredUsers.length} of {isAdmin ? users.length : users.filter(u => u.role !== 'admin').length}
          </span>
        </div>

        {/* Role filter pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {rolePills.map(pill => (
            <button
              key={pill.value}
              onClick={() => { setRoleFilter(pill.value); setUserPage(0); }}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                roleFilter === pill.value
                  ? 'bg-neutral-900 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-400 hover:text-neutral-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {roleError && (
          <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            <p className="text-red-600 text-xs font-bold">{roleError}</p>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl bg-neutral-50 border border-neutral-100 px-5 py-4">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            What the roles mean
            <HelpTip label="the roles">
              <p><strong>Player</strong> gets a board and visits businesses. This is everyone by default.</p>
              <p><strong>Participating Business</strong> is a shop owner. They see who visited their own shop and can show their code, and nothing else.</p>
              <p><strong>Chamber Manager</strong> is your staff and volunteers. They can do everything on these tabs except create other chamber accounts or start the game over.</p>
              <p><strong>System Admin</strong> can do all of that plus manage chamber accounts. Keep this to one or two people.</p>
              <p>A change takes effect at once, but someone already signed in may need up to an hour, or a sign out and back in, before it reaches them.</p>
            </HelpTip>
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            What the reset buttons do
            <HelpTip label="the reset buttons">
              <p><strong>Town</strong> clears their home town and their board, so they choose a town again next time they open the app.</p>
              <p><strong>Progress</strong> deletes their recorded visits but keeps the same board. Use this if they were credited for a shop by mistake.</p>
              <p><strong>Board</strong> deals them a fresh set of squares and keeps their visits.</p>
              <p><strong>Reset all</strong> does all three for that one person.</p>
              <p>None of these touch anybody else. Every reset is recorded on the Activity tab with your name on it.</p>
            </HelpTip>
          </span>
        </div>

        <div className="divide-y divide-neutral-100">
          {pagedUsers.map(u => (
            <div key={u.uid} className="py-4 px-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Identity */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-neutral-900 truncate">{u.displayName || u.email}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-xs text-neutral-400 truncate">{u.email}</p>
                    {u.town && (
                      <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600 font-bold uppercase tracking-widest shrink-0">
                        {u.town}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest shrink-0 ${
                      u.role === 'admin' ? 'bg-red-50 text-red-600' :
                      u.role === 'chamber' ? 'bg-blue-50 text-blue-600' :
                      u.role === 'business' ? 'bg-orange-50 text-orange-600' :
                      'bg-neutral-100 text-neutral-600'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                </div>

                {/* Role selects */}
                <div className="flex flex-col gap-2 shrink-0">
                  <select
                    value={u.role}
                    onChange={(e) => updateUserRole(u, e.target.value as any)}
                    className="text-xs border border-neutral-200 px-3 py-2 rounded-xl bg-neutral-50 font-bold outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
                  >
                    <option value="player">Player</option>
                    <option value="business">Participating Business</option>
                    <option value="chamber">Chamber Manager</option>
                    {isAdmin && <option value="admin">System Admin</option>}
                  </select>

                  {u.role === 'business' && (
                    <select
                      value={u.businessId || ''}
                      onChange={(e) => updateBusinessId(u.uid, e.target.value)}
                      className="text-[10px] border border-neutral-200 px-3 py-2 rounded-lg bg-neutral-50 font-bold outline-none focus:ring-2 focus:ring-[var(--color-primary)] transition-all"
                    >
                      <option value="">Select Business...</option>
                      {businesses.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {u.bingoBoard?.length && u.town ? (
                  <button
                    onClick={() => setImpersonating(u)}
                    className="text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900"
                    title="View / edit this player's board"
                  >
                    <LayoutGrid size={10} />
                    View
                  </button>
                ) : null}
                <button
                  onClick={() => handleReset(u, 'town')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'town'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset town and board"
                >
                  <MapPin size={10} />
                  Reset Town
                </button>
                <button
                  onClick={() => handleReset(u, 'progress')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'progress'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset progress only"
                >
                  <RefreshCw size={10} className={confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'animate-spin' : ''} />
                  Reset Progress
                </button>
                <button
                  onClick={() => handleReset(u, 'board')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'board'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset board only"
                >
                  <Gamepad2 size={10} />
                  Reset Board
                </button>
                <button
                  onClick={() => handleReset(u, 'everything')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'everything'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-red-500'
                  }`}
                  title="Reset town, board and progress"
                >
                  <RotateCcw size={10} />
                  Reset All
                </button>
                {confirmAction?.uid === u.uid && (
                  <span className="text-[10px] text-red-500 font-bold italic">Click again to confirm</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {userPageCount > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-neutral-100">
            <button
              onClick={() => setUserPage(p => Math.max(0, p - 1))}
              disabled={userPage === 0}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              Page {userPage + 1} of {userPageCount}
            </span>
            <button
              onClick={() => setUserPage(p => Math.min(userPageCount - 1, p + 1))}
              disabled={userPage >= userPageCount - 1}
              className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 disabled:opacity-30 transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {impersonating && (
        <BoardImpersonation
          targetUser={impersonating}
          actingUser={currentUser}
          businesses={businesses}
          settings={settings}
          onClose={() => setImpersonating(null)}
        />
      )}

      <InviteManager businesses={businesses} currentUser={currentUser} />

      {/* Danger Zone */}
      <div className="bg-white border border-red-200 p-8 rounded-3xl shadow-sm">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle className="text-red-500" size={18} />
          <h3 className="font-bold uppercase tracking-widest text-xs text-red-400">Danger Zone</h3>
        </div>
        <p className="text-sm text-neutral-500 leading-relaxed mb-2">
          For clearing out a practice run before you go live. This deletes{' '}
          <span className="font-bold text-neutral-700">every account except yours</span>,
          along with all visits, boards, raffle entries, winners and notifications.
          Businesses, towns and your settings are kept.
        </p>
        <p className="text-[11px] text-neutral-500 leading-relaxed mb-6">
          Not the same as <span className="font-bold">Start the game over</span> above,
          which clears progress but leaves everybody&rsquo;s account intact. If real
          players have already signed up, you almost certainly want that one instead.
        </p>
        {clearConfirm ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-red-600 flex-1">
              Delete every other account and all game data? There is no undo.
            </span>
            <button
              onClick={() => setClearConfirm(false)}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest border border-neutral-200 rounded-xl hover:border-neutral-400 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={clearTestData}
              disabled={clearing}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all disabled:opacity-50"
            >
              {clearing ? 'Clearing...' : 'Yes, Clear Everything'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setClearConfirm(true)}
            className="flex items-center gap-2 px-5 py-3 border border-red-200 text-red-500 rounded-2xl text-sm font-bold hover:bg-red-50 transition-all"
          >
            <Trash2 size={16} />
            Clear All Test Data
          </button>
        )}
      </div>
    </div>
  );
};
