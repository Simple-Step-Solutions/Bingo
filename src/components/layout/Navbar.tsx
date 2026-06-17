import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutGrid, MapPin, Store, Settings as SettingsIcon, LogOut, Ticket, UserCircle } from 'lucide-react';
import { UserProfile, AppSettings } from '../../types';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { NotificationBell } from '../NotificationBell';

interface NavbarProps {
  user: UserProfile;
  settings: AppSettings | null;
}

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
      <div className="hidden md:flex items-center gap-4 mr-8">
        <div className="bg-neutral-900 p-2 rounded-xl">
          <LayoutGrid className="text-white" size={18} />
        </div>
        <span className="font-serif italic text-xl">Chamber Bingo</span>
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

      {/* Mobile: notification bell + profile */}
      <div className="md:hidden flex items-center gap-1">
        <NotificationBell user={user} />
        <Link
          to="/profile"
          className={`flex flex-col items-center gap-1 transition-all duration-300 ${
            location.pathname === '/profile' ? 'text-neutral-900 scale-110' : 'text-neutral-400 hover:text-neutral-600'
          }`}
        >
          <div className={`p-2 rounded-xl transition-all ${location.pathname === '/profile' ? 'bg-neutral-100' : 'bg-transparent'}`}>
            <UserCircle size={20} />
          </div>
          <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${location.pathname === '/profile' ? 'opacity-100' : 'opacity-0'}`}>
            Profile
          </span>
        </Link>
      </div>
    </nav>
  );
};
