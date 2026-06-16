import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Completion } from '../types';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Store, Users, CheckCircle2, Loader2, QrCode, Download, MapPin, ExternalLink } from 'lucide-react';
import { QRModal } from '../components/QRModal';

interface BusinessDashboardProps {
  user: UserProfile;
}

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ user }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    const fetchBusiness = async () => {
      // 1. Try direct link via businessId
      if (user.businessId) {
        const directDoc = await getDoc(doc(db, 'businesses', user.businessId));
        if (directDoc.exists()) {
          setBusiness({ id: directDoc.id, ...directDoc.data() } as Business);
          setLoading(false);
          return;
        }
      }

      // 2. Fallback to name matching (legacy/demo)
      const q = query(collection(db, 'businesses'), where('name', '==', user.displayName || ''));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setBusiness({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Business);
      } else {
        // 3. Fallback to checking by UID
        const directDoc = await getDoc(doc(db, 'businesses', user.uid));
        if (directDoc.exists()) {
          setBusiness({ id: directDoc.id, ...directDoc.data() } as Business);
        }
      }
      setLoading(false);
    };
    fetchBusiness();
  }, [user]);

  useEffect(() => {
    if (business) {
      const q = query(collection(db, 'completions'), where('businessId', '==', business.id));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setCompletions(snapshot.docs.map(doc => doc.data() as Completion));
      });
      return () => unsubscribe();
    }
  }, [business]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  if (!business) return (
    <div className="max-w-2xl mx-auto p-6 text-center py-20">
      <div className="bg-white rounded-3xl p-12 shadow-sm border border-neutral-100">
        <Store className="mx-auto text-neutral-200 mb-6" size={64} />
        <h2 className="font-serif italic text-3xl mb-4">No Business Profile</h2>
        <p className="text-neutral-500 mb-8">Your account is not currently linked to a participating business profile.</p>
        <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Contact the Chamber to link your store.</p>
      </div>
    </div>
  );

  const todayCompletions = completions.filter(c => new Date(c.timestamp).toDateString() === new Date().toDateString());

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-neutral-900 text-white p-12 rounded-[3rem] mb-12 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <Store size={160} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
              <Store className="text-white" size={24} />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Store Dashboard</span>
          </div>
          
          <h2 className="font-serif italic text-6xl mb-4">{business.name}</h2>
          <div className="flex flex-wrap gap-4 items-center mb-10">
            <div className="bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10 flex items-center gap-2">
              <MapPin size={14} className="text-neutral-400" />
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">{business.town}</span>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-300">{business.task}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 border-t border-white/10 pt-10">
            <div>
              <p className="text-5xl font-bold mb-2">{completions.length}</p>
              <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Total Visitors</p>
            </div>
            <div>
              <p className="text-5xl font-bold mb-2">{todayCompletions.length}</p>
              <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Visitors Today</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 bg-white rounded-[2.5rem] p-10 shadow-sm border border-neutral-100">
          <h3 className="font-serif italic text-3xl mb-8">Recent Activity</h3>
          <div className="space-y-6">
            {completions.length === 0 ? (
              <div className="text-center py-12">
                <Users className="mx-auto text-neutral-100 mb-4" size={48} />
                <p className="text-neutral-400 text-sm italic">No visitors yet.</p>
              </div>
            ) : (
              completions.slice().reverse().slice(0, 10).map(c => (
                <div key={c.id} className="flex items-center justify-between p-6 bg-neutral-50 rounded-3xl border border-neutral-100 group hover:border-neutral-900 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 transition-colors shadow-sm">
                      <CheckCircle2 size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-sm">Visitor #{c.userId.slice(-4).toUpperCase()}</p>
                      <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                        {new Date(c.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="bg-white px-3 py-1 rounded-full border border-neutral-200">
                    <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-widest font-bold">Verified</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-neutral-100 text-center">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400 mb-8">Your QR Code</h3>
            <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100 inline-block mb-8 shadow-inner">
              <QrCode size={120} className="text-neutral-900" />
            </div>
            <button 
              onClick={() => setShowQR(true)}
              className="w-full bg-neutral-900 text-white py-5 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <QrCode size={18} />
              Show Full QR
            </button>
            <p className="text-[10px] text-neutral-400 mt-6 italic leading-relaxed">
              Display this QR code at your checkout for players to scan and verify their visit.
            </p>
          </div>

          <div className="bg-neutral-50 rounded-[2.5rem] p-10 border border-neutral-100 text-center">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400 mb-6">Need Help?</h3>
            <p className="text-sm text-neutral-600 mb-8 leading-relaxed">
              Having trouble with NFC or QR verification? Contact the Chamber support team.
            </p>
            <button className="w-full bg-white border border-neutral-200 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:border-neutral-900 transition-all flex items-center justify-center gap-2">
              <ExternalLink size={14} /> Contact Support
            </button>
          </div>
        </div>
      </div>

      <QRModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        value={business.qrCode}
        title={business.name}
      />
    </div>
  );
};
