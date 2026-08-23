import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  UserProfile, Business, Town, RaffleEntry, AppSettings, Completion, Winner, AuditLog, GameEvent,
} from '../types';
import { collection, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Users as UsersIcon, Gamepad2, Store, BarChart3, Clock, Sparkles, Trophy, Loader2, HelpCircle,
} from 'lucide-react';
import { AdminMenu } from '../components/admin/AdminMenu';
import { GameMaster } from '../components/admin/GameMaster';
import { Analytics } from '../components/admin/Analytics';
import { AuditLogViewer } from '../components/admin/AuditLogViewer';
import { EventManager } from '../components/admin/EventManager';
import { BrandingPanel } from '../components/admin/BrandingPanel';
import { TownManager } from '../components/admin/TownManager';
import { CategoryManager } from '../components/admin/CategoryManager';
import { BusinessManager } from '../components/admin/BusinessManager';
import { PrizeCenter } from '../components/admin/PrizeCenter';
import { SetupChecklist } from '../components/admin/SetupChecklist';
import { SuspiciousActivity } from '../components/admin/SuspiciousActivity';
import { ADMIN_TABS, AdminTab, resolveTab } from '../components/admin/tabs';

interface AdminProps {
  user: UserProfile;
  businesses: Business[];
  towns: Town[];
  settings: AppSettings | null;
}

const TAB_ICONS: Record<AdminTab, React.ReactNode> = {
  setup: <Sparkles size={14} aria-hidden="true" />,
  businesses: <Store size={14} aria-hidden="true" />,
  game: <Gamepad2 size={14} aria-hidden="true" />,
  people: <UsersIcon size={14} aria-hidden="true" />,
  prizes: <Trophy size={14} aria-hidden="true" />,
  reports: <BarChart3 size={14} aria-hidden="true" />,
  activity: <Clock size={14} aria-hidden="true" />,
};

export const Admin: React.FC<AdminProps> = ({ user, businesses, towns, settings }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the tab, rather than state kept in step with the URL by an
  // effect. The chamber tour drives this panel by navigating, and deep links
  // still arrive with the old tab names, which resolveTab maps forward.
  const activeTab: AdminTab = resolveTab(searchParams.get('tab')) ?? 'setup';

  const goTo = (tab: AdminTab) => {
    setSearchParams({ tab }, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [raffleEntries, setRaffleEntries] = useState<RaffleEntry[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
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

    // Subscribed here rather than inside the seasons panel, because Game Master
    // and the setup checklist both need to know which season is live and what
    // it says. Two components reading the same document twice is how they drift.
    const unsubscribeEvents = onSnapshot(
      query(collection(db, 'events'), orderBy('createdAt', 'desc')),
      (snapshot) => setEvents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as GameEvent))),
      (err) => console.error('Events snapshot error:', err),
    );

    return () => {
      unsubscribeUsers();
      unsubscribeRaffle();
      unsubscribeWinners();
      unsubscribeCompletions();
      unsubscribeAudit();
      unsubscribeEvents();
    };
  }, [user]);

  const activeEvent = useMemo(
    () => events.find(e => e.id === settings?.activeEventId) ?? null,
    [events, settings?.activeEventId],
  );

  const boardSize = activeEvent?.boardSize || settings?.boardSize || 3;
  const currentTab = ADMIN_TABS.find(t => t.id === activeTab);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} aria-hidden="true" />
      <span className="sr-only">Loading the admin panel</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto pb-16 md:pb-0">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h2 className="font-serif italic text-5xl mb-2">Chamber Admin</h2>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold">
                {settings?.chamberName || 'Run the game'}
              </p>
              {/*
                The tour used to run once and could only be replayed from a
                buried control on the Profile page. Somebody coming back to this
                panel a year later, for next season, needs it in reach.
              */}
              <button
                onClick={() => setDoc(doc(db, 'users', user.uid), { tourCompleted: false }, { merge: true })}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-[var(--color-primary)] transition-colors"
              >
                <HelpCircle size={12} aria-hidden="true" /> Show me around
              </button>
            </div>
          </div>

          <nav
            aria-label="Admin sections"
            className="flex bg-neutral-100 p-1.5 rounded-2xl overflow-x-auto w-full md:w-auto shadow-inner gap-1"
          >
            {ADMIN_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => goTo(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${
                  activeTab === tab.id
                    ? 'bg-white shadow-md text-neutral-900'
                    : 'text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {TAB_ICONS[tab.id]}
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.short}</span>
              </button>
            ))}
          </nav>
        </div>

        {currentTab && (
          <p className="text-sm text-neutral-500 leading-relaxed max-w-2xl">{currentTab.blurb}</p>
        )}
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        {activeTab === 'setup' && settings && (
          <div className="space-y-8">
            <SetupChecklist
              settings={settings}
              businesses={businesses}
              towns={towns}
              users={users}
              activeEvent={activeEvent}
              onGoTo={goTo}
            />
            <BrandingPanel settings={settings} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              <TownManager towns={towns} businesses={businesses} />
              <CategoryManager settings={settings} businesses={businesses} />
            </div>
          </div>
        )}

        {activeTab === 'businesses' && settings && (
          <BusinessManager
            businesses={businesses}
            towns={towns}
            settings={settings}
            boardSize={boardSize}
          />
        )}

        {activeTab === 'game' && settings && (
          <div className="space-y-8">
            <EventManager settings={settings} currentUser={user} />
            <GameMaster settings={settings} user={user} activeEvent={activeEvent} />
          </div>
        )}

        {activeTab === 'people' && settings && (
          <AdminMenu users={users} businesses={businesses} currentUser={user} settings={settings} />
        )}

        {activeTab === 'prizes' && settings && (
          <PrizeCenter
            raffleEntries={raffleEntries}
            winners={winners}
            settings={settings}
            activeEvent={activeEvent}
          />
        )}

        {activeTab === 'reports' && settings && (
          <Analytics
            users={users}
            completions={completions}
            businesses={businesses}
            settings={settings}
            currentUser={user}
          />
        )}

        {activeTab === 'activity' && (
          <div className="space-y-8">
            <SuspiciousActivity users={users} businesses={businesses} />
            <AuditLogViewer logs={auditLogs} />
          </div>
        )}
      </div>
    </div>
  );
};
