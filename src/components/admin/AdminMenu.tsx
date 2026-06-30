import React, { useState, useMemo } from 'react';
import { UserProfile, Business, AppSettings } from '../../types';
import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Trash2, RotateCcw, UserMinus, Gamepad2, MapPin, Store, Search, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
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

  const performGlobalReset = async () => {
    if (!window.confirm("DANGER: This will reset town, board, and progress for ALL users. Continue?")) return;

    try {
      const userPromises = users.map(u =>
        setDoc(doc(db, 'users', u.uid), {
          town: '',
          bingoBoard: [],
          boardSize: 0
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

        {/* Role filter pills */}
        <div className="flex flex-wrap gap-2 mb-4">
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

        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3 mb-6">
          <Search size={16} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            placeholder="Search by name, email, town, or role..."
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setUserPage(0); }}
            className="flex-1 bg-transparent text-sm outline-none font-medium placeholder:text-neutral-300"
          />
          <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest shrink-0">
            {filteredUsers.length} of {isAdmin ? users.length : users.filter(u => u.role !== 'admin').length}
          </span>
        </div>

        <div className="divide-y divide-neutral-100">
          {pagedUsers.map(u => (
            <div key={u.uid} className="flex justify-between items-center py-6 first:pt-0 last:pb-0">
              <div>
                <p className="font-bold text-lg">{u.displayName || u.email}</p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs text-neutral-400 uppercase tracking-widest">{u.email}</p>
                  {u.town && (
                    <span className="text-[10px] bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600 font-bold uppercase tracking-widest">
                      {u.town}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 border-r border-neutral-100 pr-4 mr-2">
                  {u.bingoBoard?.length && u.town ? (
                    <button
                      onClick={() => setImpersonating(u)}
                      className="text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 text-neutral-400 hover:text-neutral-900"
                      title="View / Edit Board"
                    >
                      <LayoutGrid size={10} />
                      Board
                    </button>
                  ) : null}
                  <button
                    onClick={() => handleReset(u, 'town')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'town' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Town & Board"
                  >
                    <MapPin size={10} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'town' ? 'Confirm Reset Town?' : 'Town'}
                  </button>
                  <button
                    onClick={() => handleReset(u, 'progress')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Progress Only"
                  >
                    <RefreshCw size={10} className={confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'animate-spin' : ''} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'Confirm?' : 'Progress'}
                  </button>
                  <button
                    onClick={() => handleReset(u, 'board')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'board' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Board Only"
                  >
                    <Gamepad2 size={10} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'board' ? 'Confirm?' : 'Board'}
                  </button>
                  <button
                    onClick={() => handleReset(u, 'everything')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'everything' ? 'text-red-600' : 'text-neutral-400 hover:text-red-500'
                    }`}
                    title="Reset Town, Board & Progress"
                  >
                    <RotateCcw size={10} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'everything' ? 'Confirm Reset All?' : 'Reset All'}
                  </button>
                </div>

                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  u.role === 'admin' ? 'bg-red-50 text-red-600' :
                  u.role === 'chamber' ? 'bg-blue-50 text-blue-600' :
                  u.role === 'business' ? 'bg-orange-50 text-orange-600' :
                  'bg-neutral-100 text-neutral-600'
                }`}>
                  {u.role}
                </span>
                <div className="flex flex-col gap-2">
                  <select
                    value={u.role}
                    onChange={(e) => updateUserRole(u, e.target.value as any)}
                    className="text-xs border border-neutral-200 p-3 rounded-xl bg-neutral-50 font-bold outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
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
                      className="text-[10px] border border-neutral-200 p-2 rounded-lg bg-white font-bold outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
                    >
                      <option value="">Select Business...</option>
                      {businesses.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>
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
    </div>
  );
};
