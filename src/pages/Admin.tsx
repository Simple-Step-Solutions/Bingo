import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserProfile, Business, Town, RaffleEntry, AppSettings, Completion, Winner, AuditLog } from '../types';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { UserIcon, ShieldCheck, Gamepad2, BarChart3, Clock, Loader2 } from 'lucide-react';
import { AdminMenu } from '../components/admin/AdminMenu';
import { GameMaster } from '../components/admin/GameMaster';
import { ChamberManager } from '../components/admin/ChamberManager';
import { Analytics } from '../components/admin/Analytics';
import { AuditLogViewer } from '../components/admin/AuditLogViewer';

interface AdminProps {
  user: UserProfile;
  businesses: Business[];
  towns: Town[];
  settings: AppSettings | null;
}

const tabs = [
  { id: 'admin', label: 'Users', icon: UserIcon },
  { id: 'master', label: 'Game Master', icon: ShieldCheck },
  { id: 'chamber', label: 'Chamber', icon: Gamepad2 },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'audit', label: 'Audit', icon: Clock },
] as const;

type TabId = typeof tabs[number]['id'];

export const Admin: React.FC<AdminProps> = ({ user, businesses, towns, settings }) => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam || (user.role === 'admin' ? 'admin' : 'chamber')
  );

  useEffect(() => {
    if (tabParam) setActiveTab(tabParam);
  }, [tabParam]);

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [raffleEntries, setRaffleEntries] = useState<RaffleEntry[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
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

    const unsubscribeAudit = onSnapshot(collection(db, 'audit_log'), (snapshot) => {
      setAuditLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
    }, (err) => console.error('Audit log snapshot error:', err));

    return () => {
      unsubscribeUsers();
      unsubscribeRaffle();
      unsubscribeWinners();
      unsubscribeCompletions();
      unsubscribeAudit();
    };
  }, [user]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16 md:pb-0">
      <div className="mb-8">
        <h2 className="font-serif italic text-5xl mb-2">Admin Panel</h2>
        <p className="text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">System Management &amp; Oversight</p>
      </div>

      {/* Tab bar: underline style, horizontally scrollable on mobile */}
      <div className="border-b border-neutral-200 mb-8 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-neutral-900 text-neutral-900'
                  : 'border-transparent text-neutral-400 hover:text-neutral-600 hover:border-neutral-300'
              }`}
            >
              <Icon size={13} className="hidden sm:block" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'admin' && (
          <AdminMenu users={users} businesses={businesses} currentUser={user} settings={settings!} />
        )}
        {activeTab === 'master' && settings && <GameMaster settings={settings} user={user} />}
        {activeTab === 'chamber' && settings && (
          <ChamberManager businesses={businesses} towns={towns} raffleEntries={raffleEntries} winners={winners} settings={settings} />
        )}
        {activeTab === 'analytics' && settings && (
          <Analytics users={users} completions={completions} businesses={businesses} settings={settings} currentUser={user} />
        )}
        {activeTab === 'audit' && <AuditLogViewer logs={auditLogs} />}
      </div>
    </div>
  );
};
