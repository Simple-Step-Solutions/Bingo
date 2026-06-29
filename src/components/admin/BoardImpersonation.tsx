import React, { useState, useEffect } from 'react';
import { UserProfile, Business, AppSettings, Completion } from '../../types';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { ShieldCheck, X, Trophy, Store, CheckCircle2, Loader2 } from 'lucide-react';
import { logAudit } from '../../services/auditService';

interface BoardImpersonationProps {
  targetUser: UserProfile;
  actingUser: UserProfile;
  businesses: Business[];
  settings: AppSettings;
  onClose: () => void;
}

export const BoardImpersonation: React.FC<BoardImpersonationProps> = ({
  targetUser,
  actingUser,
  businesses,
  settings,
  onClose,
}) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  const board = targetUser.bingoBoard || [];

  useEffect(() => {
    const q = query(collection(db, 'completions'), where('userId', '==', targetUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCompletions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion)));
    });
    return () => unsubscribe();
  }, [targetUser.uid]);

  const addCompletion = async (biz: Business) => {
    setWorking(biz.id);
    try {
      await addDoc(collection(db, 'completions'), {
        userId: targetUser.uid,
        businessId: biz.id,
        timestamp: new Date().toISOString(),
        town: biz.town,
        adminOverride: true,
        overrideBy: actingUser.uid,
      });
      await logAudit(
        actingUser.uid,
        actingUser.email,
        'add_completion',
        targetUser.uid,
        targetUser.email,
        { businessId: biz.id, businessName: biz.name }
      );
    } catch (err) {
      console.error('Error adding completion:', err);
    } finally {
      setWorking(null);
    }
  };

  const removeCompletion = async (biz: Business) => {
    setWorking(biz.id);
    try {
      const completion = completions.find(c => c.businessId === biz.id);
      if (!completion) return;
      await deleteDoc(doc(db, 'completions', completion.id));
      await logAudit(
        actingUser.uid,
        actingUser.email,
        'remove_completion',
        targetUser.uid,
        targetUser.email,
        { businessId: biz.id, businessName: biz.name }
      );
    } catch (err) {
      console.error('Error removing completion:', err);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-neutral-900/95 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-2 rounded-xl">
            <ShieldCheck className="text-white" size={20} />
          </div>
          <div>
            <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest mb-0.5">Admin Override</p>
            <h2 className="font-serif italic text-2xl text-white">{targetUser.displayName || targetUser.email}</h2>
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
              {targetUser.email}
              {targetUser.town && <span className="ml-3">{targetUser.town}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 transition-colors p-2.5 rounded-xl text-white"
        >
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-2">
          {board.map((bizId, idx) => {
            if (bizId === 'FREE') {
              return (
                <div key="free" className="flex items-center gap-4 bg-orange-500/20 border border-orange-500/30 rounded-2xl px-5 py-4">
                  <Trophy className="text-orange-400 shrink-0" size={18} />
                  <div className="flex-1">
                    <p className="text-white font-bold text-sm">{settings.freeSpaceName}</p>
                    <p className="text-[10px] text-orange-300 font-bold uppercase tracking-widest">(Free Space)</p>
                  </div>
                </div>
              );
            }

            if (bizId === 'EMPTY') return null;

            const biz = businesses.find(b => b.id === bizId);
            if (!biz) return null;

            const isDone = completions.some(c => c.businessId === bizId);
            const isWorking = working === bizId;

            return (
              <div
                key={idx}
                className={`flex items-center gap-4 rounded-2xl px-5 py-4 border transition-all ${
                  isDone
                    ? 'bg-neutral-900 border-white/10 text-white'
                    : 'bg-white border-neutral-200 text-neutral-900'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="text-orange-500 shrink-0" size={18} />
                ) : (
                  <Store className="text-neutral-400 shrink-0" size={18} />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm truncate ${isDone ? 'text-white' : 'text-neutral-900'}`}>{biz.name}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isDone ? 'text-neutral-400' : 'text-neutral-400'}`}>{biz.town}</p>
                </div>
                <button
                  disabled={isWorking}
                  onClick={() => isDone ? removeCompletion(biz) : addCompletion(biz)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shrink-0 disabled:opacity-50 ${
                    isDone
                      ? 'bg-white/10 text-white hover:bg-red-500 hover:text-white'
                      : 'bg-neutral-900 text-white hover:bg-neutral-700'
                  }`}
                >
                  {isWorking ? <Loader2 size={12} className="animate-spin" /> : isDone ? 'Remove' : 'Mark Done'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-6 py-4 bg-amber-50 border-t border-amber-200">
        <p className="text-center text-[10px] text-amber-700 font-bold uppercase tracking-widest">
          All changes are logged to the audit trail
        </p>
      </div>
    </div>
  );
};
