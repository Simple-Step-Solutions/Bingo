import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Town, RaffleEntry, AppSettings, Completion, Winner } from '../types';
import { collection, onSnapshot, doc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { UserIcon, ShieldCheck, Gamepad2, Settings as SettingsIcon, Loader2, BarChart3 } from 'lucide-react';
import { AdminMenu } from '../components/admin/AdminMenu';
import { GameMaster } from '../components/admin/GameMaster';
import { ChamberManager } from '../components/admin/ChamberManager';
import { Analytics } from '../components/admin/Analytics';

interface AdminProps {
  user: UserProfile;
}

export const Admin: React.FC<AdminProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<'admin' | 'master' | 'chamber' | 'analytics'>(user.role === 'admin' ? 'admin' : 'chamber');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [raffleEntries, setRaffleEntries] = useState<RaffleEntry[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'chamber')) return;

    const unsubscribeBiz = onSnapshot(collection(db, 'businesses'), (snapshot) => {
      setBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business)));
    });
    
    // Fetch all users for leaderboard and stats
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    });

    const unsubscribeTowns = onSnapshot(collection(db, 'towns'), (snapshot) => {
      setTowns(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Town)));
    });

    const unsubscribeRaffle = onSnapshot(collection(db, 'raffle_entries'), (snapshot) => {
      setRaffleEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RaffleEntry)));
    });

    const unsubscribeWinners = onSnapshot(collection(db, 'winners'), (snapshot) => {
      setWinners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Winner)));
    });

    const unsubscribeCompletions = onSnapshot(collection(db, 'completions'), (snapshot) => {
      setCompletions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Completion)));
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
      if (doc.exists()) setSettings(doc.data() as AppSettings);
      setLoading(false);
    });

    return () => {
      unsubscribeBiz();
      unsubscribeUsers();
      unsubscribeTowns();
      unsubscribeRaffle();
      unsubscribeWinners();
      unsubscribeCompletions();
      unsubscribeSettings();
    };
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h2 className="font-serif italic text-5xl mb-2">Admin Panel</h2>
          <p className="text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">System Management & Oversight</p>
        </div>
        
        <div className="flex bg-neutral-100 p-1.5 rounded-2xl overflow-x-auto w-full md:w-auto shadow-inner">
          {user.role === 'admin' && (
            <button 
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'admin' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
            >
              <UserIcon size={14} /> Admin Menu
            </button>
          )}
          <button 
            onClick={() => setActiveTab('master')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'master' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <ShieldCheck size={14} /> Game Master
          </button>
          <button 
            onClick={() => setActiveTab('chamber')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'chamber' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <Gamepad2 size={14} /> Chamber Manager
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'bg-white shadow-md text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'}`}
          >
            <BarChart3 size={14} /> Analytics
          </button>
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'admin' && user.role === 'admin' && <AdminMenu users={users} businesses={businesses} />}
        {activeTab === 'master' && settings && <GameMaster settings={settings} />}
        {activeTab === 'chamber' && <ChamberManager businesses={businesses} towns={towns} raffleEntries={raffleEntries} winners={winners} />}
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
