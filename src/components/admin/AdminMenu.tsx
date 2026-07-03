import React, { useState, useMemo } from 'react';
import { UserProfile, Business, AppSettings } from '../../types';
import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Trash2, RotateCcw, UserMinus, Gamepad2, MapPin, Store, Search, ChevronLeft, ChevronRight, LayoutGrid, AlertTriangle } from 'lucide-react';
import { BoardImpersonation } from './BoardImpersonation';
import { InviteManager } from './InviteManager';
import { logAudit } from '../../services/auditService';

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
  }, [users, userSearch, roleFilter]);

  const userPageCount = Math.ceil(filteredUsers.length / USER_PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(userPage * USER_PAGE_SIZE, (userPage + 1) * USER_PAGE_SIZE);

  const updateUserRole = async (u: UserProfile, role: string) => {
    const updates: any = { role };
    if (role !== 'business') {
      updates.businessId = null;
    }
    await setDoc(doc(db, 'users', u.uid), updates, { merge: true });
    await logAudit(
      currentUser.uid,
      currentUser.email,
      'change_role',
      u.uid,
      u.email,
      { previousRole: u.role, newRole: role }
    );
  };

  const updateBusinessId = async (uid: string, businessId: string) => {
    await setDoc(doc(db, 'users', uid), { businessId }, { merge: true });
  };

  const handleReset = async (u: UserProfile, type: 'town' | 'progress' | 'board' | 'everything') => {
    if (confirmAction?.uid !== u.uid || confirmAction?.type !== type) {
      setConfirmAction({ uid: u.uid, type });
      setTimeout(() => setConfirmAction(null), 3000);
      return;
    }

    try {
      if (type === 'progress' || type === 'everything') {
        const q = query(collection(db, 'completions'), where('userId', '==', u.uid));
        const snapshot = await getDocs(q);
        const deletes = snapshot.docs.map(d => deleteDoc(doc(db, 'completions', d.id)));
        await Promise.all(deletes);
      }

      if (type === 'board' || type === 'everything' || type === 'town') {
        const updates: any = {
          bingoBoard: [],
          boardSize: 0
        };
        if (type === 'town' || type === 'everything') {
          updates.town = '';
          updates.onboardingComplete = false;
        }
        await setDoc(doc(db, 'users', u.uid), updates, { merge: true });
      }

      await logAudit(
        currentUser.uid,
        currentUser.email,
        `reset_${type}`,
        u.uid,
        u.email,
        { resetType: type }
      );
    } catch (err) {
      console.error('Error resetting user:', err);
    }

    setConfirmAction(null);
  };

  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clearTestData = async () => {
    setClearing(true);
    setClearConfirm(false);
    try {
      const collections = ['completions', 'raffle_entries', 'winners', 'notifications'];
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

  const performGlobalReset = async () => {
    if (!window.confirm("DANGER: This will reset town, board, and progress for ALL users. Continue?")) return;

    try {
      const userPromises = users.map(u =>
        setDoc(doc(db, 'users', u.uid), {
          town: '',
          bingoBoard: [],
          boardSize: 0,
          onboardingComplete: false
        }, { merge: true })
      );

      const completionsSnapshot = await getDocs(collection(db, 'completions'));
      const completionDeletes = completionsSnapshot.docs.map(d => deleteDoc(doc(db, 'completions', d.id)));

      await Promise.all([...userPromises, ...completionDeletes]);
      alert("System-wide reset complete.");
    } catch (err) {
      console.error(err);
      alert("Error during global reset.");
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
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">User Management</h3>
          {isAdmin && (
            <button
              onClick={performGlobalReset}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
            >
              <RotateCcw size={12} /> Reset All Users
            </button>
          )}
        </div>

        {/* Search -- full width and prominent */}
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 mb-4">
          <Search size={18} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, town, or role..."
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
            className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-neutral-300"
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
                    title="View / Edit Board"
                  >
                    <LayoutGrid size={10} />
                    Board
                  </button>
                ) : null}
                <button
                  onClick={() => handleReset(u, 'town')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'town'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset Town and Board"
                >
                  <MapPin size={10} />
                  Town
                </button>
                <button
                  onClick={() => handleReset(u, 'progress')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'progress'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset Progress Only"
                >
                  <RefreshCw size={10} className={confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'animate-spin' : ''} />
                  Progress
                </button>
                <button
                  onClick={() => handleReset(u, 'board')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'board'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900'
                  }`}
                  title="Reset Board Only"
                >
                  <Gamepad2 size={10} />
                  Board
                </button>
                <button
                  onClick={() => handleReset(u, 'everything')}
                  className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 px-2 py-1 rounded-lg ${
                    confirmAction?.uid === u.uid && confirmAction?.type === 'everything'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-red-500'
                  }`}
                  title="Reset Town, Board and Progress"
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
        <p className="text-sm text-neutral-500 mb-6">
          Clear all test data and start fresh. This deletes all users (except you), completions, raffle entries, winners, and notifications. Businesses, towns, and settings are kept.
        </p>
        {clearConfirm ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-red-600 flex-1">Are you sure? This cannot be undone.</span>
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
