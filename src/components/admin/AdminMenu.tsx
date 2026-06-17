import React, { useState, useMemo } from 'react';
import { UserProfile, Business } from '../../types';
import { doc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, Trash2, RotateCcw, UserMinus, Gamepad2, MapPin, Store, Search, ChevronLeft, ChevronRight } from 'lucide-react';

const USER_PAGE_SIZE = 25;

interface AdminMenuProps {
  users: UserProfile[];
  businesses: Business[];
}

export const AdminMenu: React.FC<AdminMenuProps> = ({ users, businesses }) => {
  const [confirmAction, setConfirmAction] = useState<{ uid: string; type: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(0);

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      (u.displayName || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.town || '').toLowerCase().includes(q) ||
      (u.role || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const userPageCount = Math.ceil(filteredUsers.length / USER_PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(userPage * USER_PAGE_SIZE, (userPage + 1) * USER_PAGE_SIZE);

  const updateUserRole = async (uid: string, role: string) => {
    const updates: any = { role };
    if (role !== 'business') {
      updates.businessId = null;
    }
    await setDoc(doc(db, 'users', uid), updates, { merge: true });
  };

  const updateBusinessId = async (uid: string, businessId: string) => {
    await setDoc(doc(db, 'users', uid), { businessId }, { merge: true });
  };

  const handleReset = async (uid: string, type: 'town' | 'progress' | 'board' | 'everything') => {
    if (confirmAction?.uid !== uid || confirmAction?.type !== type) {
      setConfirmAction({ uid, type });
      setTimeout(() => setConfirmAction(null), 3000);
      return;
    }

    try {
      if (type === 'progress' || type === 'everything') {
        const q = query(collection(db, 'completions'), where('userId', '==', uid));
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
        await setDoc(doc(db, 'users', uid), updates, { merge: true });
      }
    } catch (err) {
      console.error('Error resetting user:', err);
    }
    
    setConfirmAction(null);
  };

  const resetAllUsers = async () => {
    if (!window.confirm("Are you sure you want to reset EVERYTHING for ALL users? This cannot be undone.")) return;
    
    // This is a heavy operation, but for a small user base it's fine.
    // In production, you'd use a cloud function or batching.
    for (const user of users) {
      await handleReset(user.uid, 'everything'); // Note: this will trigger confirmation logic if not careful
      // Wait, handleReset has confirmation logic. Let's make a direct version.
    }
  };

  const performGlobalReset = async () => {
    if (!window.confirm("DANGER: This will reset town, board, and progress for ALL users. Continue?")) return;
    
    try {
      // Reset all users' profiles
      const userPromises = users.map(u => 
        setDoc(doc(db, 'users', u.uid), { 
          town: '', 
          bingoBoard: [], 
          boardSize: 0 
        }, { merge: true })
      );
      
      // Reset all completions
      const completionsSnapshot = await getDocs(collection(db, 'completions'));
      const completionDeletes = completionsSnapshot.docs.map(d => deleteDoc(doc(db, 'completions', d.id)));
      
      await Promise.all([...userPromises, ...completionDeletes]);
      alert("System-wide reset complete.");
    } catch (err) {
      console.error(err);
      alert("Error during global reset.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-neutral-200 p-8 rounded-3xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400">User Management</h3>
          <button
            onClick={performGlobalReset}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all"
          >
            <RotateCcw size={12} /> Reset All Users
          </button>
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
            {filteredUsers.length} of {users.length}
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
                  <button 
                    onClick={() => handleReset(u.uid, 'town')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'town' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Town & Board"
                  >
                    <MapPin size={10} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'town' ? 'Confirm Reset Town?' : 'Town'}
                  </button>
                  <button 
                    onClick={() => handleReset(u.uid, 'progress')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Progress Only"
                  >
                    <RefreshCw size={10} className={confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'animate-spin' : ''} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'progress' ? 'Confirm?' : 'Progress'}
                  </button>
                  <button 
                    onClick={() => handleReset(u.uid, 'board')}
                    className={`text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1 ${
                      confirmAction?.uid === u.uid && confirmAction?.type === 'board' ? 'text-red-600' : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                    title="Reset Board Only"
                  >
                    <Gamepad2 size={10} />
                    {confirmAction?.uid === u.uid && confirmAction?.type === 'board' ? 'Confirm?' : 'Board'}
                  </button>
                  <button 
                    onClick={() => handleReset(u.uid, 'everything')}
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
                    onChange={(e) => updateUserRole(u.uid, e.target.value as any)}
                    className="text-xs border border-neutral-200 p-3 rounded-xl bg-neutral-50 font-bold outline-none focus:ring-2 focus:ring-neutral-900 transition-all"
                  >
                    <option value="player">Player</option>
                    <option value="business">Participating Business</option>
                    <option value="chamber">Chamber Manager</option>
                    <option value="admin">System Admin</option>
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
    </div>
  );
};
