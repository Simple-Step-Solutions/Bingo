import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, MapPin, Store, Settings as SettingsIcon, LogOut, Ticket, UserCircle, Bell, X, Info, Trophy, Ticket as TicketIcon, Gamepad2, ChevronRight } from 'lucide-react';
import { UserProfile, AppSettings, Notification } from '../../types';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { NotificationBell } from '../NotificationBell';
import { collection, query, limit, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

interface NavbarProps {
  user: UserProfile;
  settings: AppSettings | null;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  info: <Info size={14} />,
  win: <Trophy size={14} />,
  raffle: <TicketIcon size={14} />,
  game: <Gamepad2 size={14} />,
};

const TYPE_COLOR: Record<string, string> = {
  info: 'text-blue-500 bg-blue-50',
  win: 'text-yellow-600 bg-yellow-50',
  raffle: 'text-purple-600 bg-purple-50',
  game: 'text-green-600 bg-green-50',
};

const MobileAccountMenu: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const lastReadAt = user.lastReadAt || '1970-01-01T00:00:00.000Z';

  useEffect(() => {
    const q = query(collection(db, 'notifications'), limit(100));
    return onSnapshot(q, snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Notification))
        .filter(n => n.userId === 'all' || n.userId === user.uid)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 50);
      setNotifications(all);
    }, err => console.error('Notification snapshot error:', err));
  }, [user.uid]);

  const unread = notifications.filter(n => n.timestamp > lastReadAt).length;

  const openMenu = () => {
    if (unread > 0) {
      updateDoc(doc(db, 'users', user.uid), { lastReadAt: new Date().toISOString() }).catch(console.error);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={openMenu}
        className={`flex flex-col items-center gap-1 relative transition-all duration-300 ${open ? 'text-neutral-900 scale-110' : 'text-neutral-400 hover:text-neutral-600'}`}
      >
        <div className={`relative p-2 rounded-xl transition-all ${open ? 'bg-neutral-100' : 'bg-transparent'}`}>
          <UserCircle size={20} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--color-accent,#CC5500)] text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${open ? 'opacity-100' : 'opacity-0'}`}>
          Account
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[2rem] shadow-2xl border-t border-neutral-200 pb-10 overflow-y-auto max-h-[85dvh]"
            >
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mt-4 mb-6" />
              <div className="flex items-center justify-between px-6 mb-5">
                <h3 className="font-serif italic text-2xl">Account</h3>
                <button onClick={() => setOpen(false)} className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                  <X size={20} />
                </button>
              </div>

              {/* Profile row */}
              <div className="px-6 mb-6">
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-4 p-4 bg-neutral-50 rounded-2xl hover:bg-neutral-100 transition-colors"
                >
                  <div className="w-10 h-10 bg-neutral-900 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {user.displayName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">{user.displayName || user.email.split('@')[0]}</p>
                    <p className="text-[10px] text-neutral-400 uppercase tracking-widest mt-0.5">{user.role}</p>
                  </div>
                  <ChevronRight className="text-neutral-300 shrink-0" size={16} />
                </Link>
              </div>

              {/* Notifications */}
              <div className="px-6">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
                  <Bell size={12} /> Notifications
                </h4>
                <div className="rounded-2xl overflow-hidden border border-neutral-100 divide-y divide-neutral-50">
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center">
                      <Bell className="mx-auto text-neutral-100 mb-2" size={24} />
                      <p className="text-xs text-neutral-400 italic">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const isRead = n.timestamp <= lastReadAt;
                      return (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3 ${isRead ? 'bg-white' : 'bg-blue-50/40'}`}
                        >
                          <div className={`shrink-0 p-1.5 rounded-lg mt-0.5 ${TYPE_COLOR[n.type] || TYPE_COLOR.info}`}>
                            {TYPE_ICON[n.type] || TYPE_ICON.info}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug text-neutral-900">{n.message}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-widest">
                              {new Date(n.timestamp).toLocaleString()}
                            </p>
                          </div>
                          {!isRead && (
                            <div className="shrink-0 w-2 h-2 rounded-full bg-[var(--color-accent,#CC5500)] mt-2" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Sign out */}
              <div className="px-6 mt-5">
                <button
                  onClick={() => signOut(auth)}
                  className="w-full flex items-center justify-center gap-2 p-4 text-red-500 hover:bg-red-50 rounded-2xl transition-colors text-sm font-bold border border-red-100"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-neutral-900/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export const Navbar: React.FC<NavbarProps> = ({ user, settings }) => {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: LayoutGrid, label: 'Bingo' },
    { to: '/map', icon: MapPin, label: 'Map' },
  ];

  if (settings?.raffleEnabled) {
    navItems.push({ to: '/raffle', icon: Ticket, label: 'Raffle' });
  }

  if (user.role === 'chamber' || user.role === 'business') {
    navItems.push({ to: '/business', icon: Store, label: 'Store' });
  }

  if (user.role === 'admin' || user.role === 'chamber') {
    navItems.push({ to: '/admin', icon: SettingsIcon, label: 'Admin' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-neutral-200 px-6 py-4 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:border-t-0 md:border-b shadow-2xl md:shadow-sm">
      <div className="hidden md:flex items-center gap-3 mr-8">
        {settings?.chamberLogoUrl ? (
          <img src={settings.chamberLogoUrl} alt="Chamber" className="h-8 w-auto" />
        ) : (
          <div className="bg-neutral-900 p-2 rounded-xl">
            <LayoutGrid className="text-white" size={18} />
          </div>
        )}
        <span className="font-serif italic text-xl leading-tight">
          {settings?.chamberName
            ? settings.chamberName.replace(/chamber of commerce/i, '').replace(/chamber/i, '').trim() || 'Chamber Bingo'
            : 'Chamber Bingo'}
        </span>
      </div>

      <div className="flex flex-1 justify-around md:justify-start md:gap-8 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                isActive ? 'text-neutral-900 scale-110' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <div className={`p-2 rounded-xl transition-all ${isActive ? 'bg-neutral-100' : 'bg-transparent'}`}>
                <Icon size={20} />
              </div>
              <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isActive ? 'opacity-100' : 'opacity-0'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Desktop: notification bell + profile pill + sign out */}
      <div className="hidden md:flex items-center gap-4 ml-8">
        <NotificationBell user={user} />
        <Link to="/profile" className="flex items-center gap-3 px-4 py-2 bg-neutral-50 hover:bg-neutral-100 rounded-2xl border border-neutral-100 transition-colors">
          <div className="w-8 h-8 bg-neutral-900 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
            {user.displayName?.charAt(0) || user.email.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-neutral-900 leading-none">{user.displayName || user.email.split('@')[0]}</span>
            <span className="text-[8px] font-bold text-neutral-400 uppercase tracking-widest mt-1">{user.role}</span>
          </div>
        </Link>
        <button
          onClick={() => signOut(auth)}
          className="p-3 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-2xl transition-all"
          title="Sign Out"
        >
          <LogOut size={20} />
        </button>
      </div>

      {/* Mobile: single account icon that opens a sheet with notifications + profile + sign out */}
      <div className="md:hidden flex items-center">
        <MobileAccountMenu user={user} />
      </div>
    </nav>
  );
};
