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

type ResetType = 'town' | 'progress' | 'board' | 'everything';

interface PendingConfirm {
  uid: string;
  type: ResetType;
}

export const AdminMenu: React.FC<AdminMenuProps> = ({ users, businesses, currentUser, settings }) => {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [expandedResets, setExpandedResets] = useState<Set<string>>(new Set());
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState('');
  const [impersonating, setImpersonating] = useState<UserProfile | null>(null);

  const isAdmin = currentUser.role === 'admin';

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
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

  const updateUserRole = async (u: UserProfile, role: string) => {
    const updates: Record<string, unknown> = { role };
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

  const toggleResets = (uid: string) => {
    setExpandedResets(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const initiateReset = (uid: string, type: ResetType) => {
    setPendingConfirm({ uid, type });
  };

  const cancelConfirm = () => setPendingConfirm(null);

  const executeReset = async (u: UserProfile, type: ResetType) => {
    try {
      if (type === 'progress' || type === 'everything') {
        const q = query(collection(db, 'completions'), where('userId', '==', u.uid));
        const snapshot = await getDocs(q);
        const deletes = snapshot.docs.map(d => deleteDoc(doc(db, 'completions', d.id)));
        await Promise.all(deletes);
      }

      if (type === 'board' || type === 'everything' || type === 'town') {
        const updates: Record<string, unknown> = {
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

    setPendingConfirm(null);
    setExpandedResets(prev => {
      const next = new Set(prev);
      next.delete(u.uid);
      return next;
    });
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

  const resetOptions: { type: ResetType; label: string; icon: React.ReactNode }[] = [
    { type: 'town', label: 'Reset Town', icon: <MapPin size={11} /> },
    { type: 'progress', label: 'Reset Progress', icon: <RefreshCw size={11} /> },
    { type: 'board', label: 'Reset Board', icon: <Gamepad2 size={11} /> },
    { type: 'everything', label: 'Reset All', icon: <RotateCcw size={11} /> },
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

        {/* Search - full width, prominent */}
        <div className="flex items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl px-4 py-3 mb-4">
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
          {pagedUsers.map(u => {
            const isExpanded = expandedResets.has(u.uid);
            const isPending = pendingConfirm?.uid === u.uid;

            return (
              <div key={u.uid} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap justify-between items-start gap-4">
                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-base">{u.displayName || u.email}</p>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest shrink-0 ${
                        u.role === 'admin' ? 'bg-red-50 text-red-600' :
                        u.role === 'chamber' ? 'bg-blue-50 text-blue-600' :
                        u.role === 'business' ? 'bg-orange-50 text-orange-600' :
                        'bg-neutral-100 text-neutral-600'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">{u.email}</p>
                    {u.town && (
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold mt-1">{u.town}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {/* Role + Business selects */}
                    <div className="flex flex-col gap-1.5">
                      <select
                        value={u.role}
                        onChange={(e) => updateUserRole(u, e.target.value as string)}
                        className="text-xs border border-neutral-200 px-3 py-2 rounded-xl bg-neutral-50 font-bold outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
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
                          className="text-[10px] border border-neutral-200 px-3 py-2 rounded-lg bg-white font-bold outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
                        >
                          <option value="">Select Business...</option>
                          {businesses.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Board view + Reset toggle */}
                    <div className="flex items-center gap-2">
                      {u.bingoBoard?.length && u.town ? (
                        <button
                          onClick={() => setImpersonating(u)}
                          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-900 transition-colors"
                        >
                          <LayoutGrid size={11} /> Board
                        </button>
                      ) : null}
                      <button
                        onClick={() => toggleResets(u.uid)}
                        className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                          isExpanded ? 'text-orange-500' : 'text-neutral-400 hover:text-neutral-900'
                        }`}
                      >
                        <UserMinus size={11} /> Resets
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded reset options */}
                {isExpanded && (
                  <div className="mt-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-3">Reset Options for {u.displayName || u.email}</p>
                    {isPending ? (
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-red-700 font-medium">
                          Are you sure? This action cannot be undone.
                        </p>
                        <button
                          onClick={() => executeReset(u, pendingConfirm.type)}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-700 transition-all"
                        >
                          Yes, Reset
                        </button>
                        <button
                          onClick={cancelConfirm}
                          className="px-3 py-1.5 bg-white border border-neutral-200 text-neutral-600 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-neutral-50 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {resetOptions.map(({ type, label, icon }) => (
                          <button
                            key={type}
                            onClick={() => initiateReset(u.uid, type)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border ${
                              type === 'everything'
                                ? 'bg-red-100 border-red-200 text-red-700 hover:bg-red-200'
                                : 'bg-white border-red-100 text-red-500 hover:bg-red-100'
                            }`}
                          >
                            {icon} {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
