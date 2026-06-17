import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Town, RaffleEntry, AppSettings, Completion, Winner } from '../types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserIcon, ShieldCheck, Gamepad2, Settings as SettingsIcon, Loader2, BarChart3 } from 'lucide-react';
import { AdminMenu } from '../components/admin/AdminMenu';
import { GameMaster } from '../components/admin/GameMaster';
import { ChamberManager } from '../components/admin/ChamberManager';
import { Analytics } from '../components/admin/Analytics';

interface AdminProps {
  user: UserProfile;
  businesses: Business[];
  towns: Town[];
  settings: AppSettings | null;
}

export const Admin: React.FC<AdminProps> = ({ user, businesses, towns, settings }) => {
  const [activeTab, setActiveTab] = useState<'admin' | 'master' | 'chamber' | 'analytics'>(user.role === 'admin' ? 'admin' : 'chamber');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [raffleEntries, setRaffleEntries] = useState<RaffleEntry[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'chamber')) return;

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    }, (err) => console.error('Users snapshot error:', err));

    const unsubscribeRaffle = onSnapshot(collection(db, 'raffle_entries'), (snapshot) => {
      setRaffleEntries(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RaffleEntry)));
    }, (err) => console.error('Raffle entries snapshot error:', err));

    const unsubscribeWinners = onSnapshot(collection(db, 'winners'), (snapshot) => {
      setWinners(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Winner)));
    }, (err) => console.error('Winners snapshot error:', err));

    const unsubscribeCompletions = onSnapshot(collection(db, 'completions'), (snapshot) => {
      setCompletions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion)));
      setLoading(false);
    }, (err) => {
      console.error('Completions snapshot error:', err);
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeRaffle();
      unsubscribeWinners();
      unsubscribeCompletions();
    };
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h2 className="font-serif italic text-5xl mb-2">Admin Panel</h2>
          <p className="text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">System Management & Oversight</p>
        </div>
        
        <div className="flex bg-neutral-100 p-1.5 rounded-2xl overflow-x-auto w-full md:w-auto shadow-inner gap-1">
          {user.role === 'admin' && (
            <button
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === 'admin' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
            >
              <UserIcon size={14} />
              <span className="hidden sm:inline">Admin Menu</span>
              <span className="sm:hidden">Admin</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('master')}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === 'master' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <ShieldCheck size={14} />
            <span className="hidden sm:inline">Game Master</span>
            <span className="sm:hidden">Game</span>
          </button>
          <button
            onClick={() => setActiveTab('chamber')}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === 'chamber' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <Gamepad2 size={14} />
            <span className="hidden sm:inline">Chamber Manager</span>
            <span className="sm:hidden">Chamber</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${activeTab === 'analytics' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <BarChart3 size={14} />
            <span>Analytics</span>
          </button>
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'admin' && user.role === 'admin' && <AdminMenu users={users} businesses={businesses} />}
        {activeTab === 'master' && settings && <GameMaster settings={settings} user={user} />}
        {activeTab === 'chamber' && settings && <ChamberManager businesses={businesses} towns={towns} raffleEntries={raffleEntries} winners={winners} settings={settings} />}
        {activeTab === 'analytics' && settings && (
          <Analytics 
            users={users} 
            completions={completions} 
            businesses={businesses} 
            settings={settings}
            currentUser={user}
          />
        )}
      </div>
    </div>
  );
};
