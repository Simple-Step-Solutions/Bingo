import React, { useState, useEffect, useRef } from 'react';
import { collection, query, limit, onSnapshot, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Notification, UserProfile } from '../types';
import { Bell, X, Info, Trophy, Ticket, Gamepad2, Plus, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface NotificationBellProps {
  user: UserProfile;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  info: <Info size={14} />,
  win: <Trophy size={14} />,
  raffle: <Ticket size={14} />,
  game: <Gamepad2 size={14} />,
};

const TYPE_COLOR: Record<string, string> = {
  info: 'text-blue-500 bg-blue-50',
  win: 'text-yellow-600 bg-yellow-50',
  raffle: 'text-purple-600 bg-purple-50',
  game: 'text-green-600 bg-green-50',
};

export const NotificationBell: React.FC<NotificationBellProps> = ({ user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // lastReadAt comes from the user profile (passed as prop, updated by App.tsx snapshot)
  const lastReadAt = user.lastReadAt || '1970-01-01T00:00:00.000Z';
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [newType, setNewType] = useState<Notification['type']>('info');
  const [sending, setSending] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const canCompose = user.role === 'admin' || user.role === 'chamber';

  useEffect(() => {
    // No orderBy -- sort client-side to avoid needing a Firestore index
    const q = query(collection(db, 'notifications'), limit(100));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as Notification))
        .filter(n => n.userId === 'all' || n.userId === user.uid)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 50);
      setNotifications(all);
    }, err => console.error('Notification snapshot error:', err));
    return unsub;
  }, [user.uid]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = notifications.filter(n => n.timestamp > lastReadAt).length;

  const markAllRead = () => {
    const now = new Date().toISOString();
    updateDoc(doc(db, 'users', user.uid), { lastReadAt: now }).catch(console.error);
  };

  const sendNotification = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: 'all',
        message: newMsg.trim(),
        type: newType,
        timestamp: new Date().toISOString(),
        createdBy: user.uid,
      });
      setNewMsg('');
      setComposing(false);
    } catch (err) {
      console.error('Failed to send notification:', err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen(o => {
            if (!o) markAllRead();
            return !o;
          });
        }}
        className="relative p-2 rounded-xl text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
        title="Notifications"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[var(--color-accent,#CC5500)] text-white text-[9px] font-black rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            className="absolute right-0 top-12 w-80 bg-white rounded-[1.5rem] shadow-2xl border border-neutral-100 overflow-hidden z-50"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
              <span className="text-[10px] font-black uppercase tracking-widest">Notifications</span>
              <div className="flex items-center gap-2">
                {canCompose && (
                  <button
                    onClick={() => setComposing(c => !c)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                    title="Send notification"
                  >
                    <Plus size={14} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-neutral-300 hover:text-neutral-900 hover:bg-neutral-100 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <AnimatePresence>
              {composing && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-neutral-50 border-b border-neutral-100 space-y-3">
                    <select
                      value={newType}
                      onChange={e => setNewType(e.target.value as Notification['type'])}
                      className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-xs font-bold outline-none"
                    >
                      <option value="info">Info</option>
                      <option value="win">Win</option>
                      <option value="raffle">Raffle</option>
                      <option value="game">Game</option>
                    </select>
                    <textarea
                      value={newMsg}
                      onChange={e => setNewMsg(e.target.value)}
                      placeholder="Message to all players..."
                      rows={2}
                      className="w-full p-2.5 bg-white border border-neutral-200 rounded-xl text-sm font-medium outline-none resize-none focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                    <button
                      onClick={sendNotification}
                      disabled={sending || !newMsg.trim()}
                      className="w-full bg-neutral-900 text-white py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {sending ? <Loader2 className="animate-spin" size={14} /> : 'Send to All Players'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
              {notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto text-neutral-100 mb-3" size={32} />
                  <p className="text-xs text-neutral-400 italic">No notifications yet</p>
                </div>
              ) : (
                notifications.map(n => {
                  const isRead = n.timestamp <= lastReadAt;
                  return (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-5 py-4 transition-colors ${isRead ? 'bg-white' : 'bg-blue-50/40'}`}
                    >
                      <div className={`shrink-0 p-2 rounded-xl mt-0.5 ${TYPE_COLOR[n.type] || TYPE_COLOR.info}`}>
                        {TYPE_ICON[n.type] || TYPE_ICON.info}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug text-neutral-900">{n.message}</p>
                        <p className="text-[10px] text-neutral-400 mt-1 font-bold uppercase tracking-widest">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
