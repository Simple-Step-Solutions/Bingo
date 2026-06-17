import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Completion } from '../types';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Store, Users, CheckCircle2, Loader2, QrCode, Download, MapPin, Printer, Hash } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

interface BusinessDashboardProps {
  user: UserProfile;
}

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ user }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const printQR = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !business) return;
    const svg = document.getElementById('business-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    printWindow.document.write(`
      <html><head><title>${business.name} - QR Code</title>
      <style>
        body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
        h1 { font-size: 24px; margin-bottom: 8px; text-align: center; }
        p { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 24px; text-align: center; }
        .code { font-size: 18px; font-weight: bold; letter-spacing: 0.2em; margin-top: 16px; color: #333; }
        img { width: 280px; height: 280px; }
      </style></head>
      <body>
        <h1>${business.name}</h1>
        <p>Scan to verify your visit</p>
        <img src="data:image/svg+xml;base64,${btoa(svgData)}" />
        <p class="code">Manual code: ${business.qrCode}</p>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const downloadQR = () => {
    const svg = document.getElementById('business-qr-svg');
    if (!svg || !business) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, 400, 400);
      const link = document.createElement('a');
      link.download = `${business.name.replace(/\s+/g, '_')}_QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

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
    <div className="max-w-2xl mx-auto text-center py-20">
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
    <div className="max-w-4xl mx-auto">
      <div className="bg-neutral-900 text-white p-8 md:p-12 rounded-3xl mb-8 relative overflow-hidden shadow-2xl">
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
          
          <h2 className="font-serif italic text-4xl md:text-6xl mb-4">{business.name}</h2>
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
              <p className="text-4xl font-bold mb-1">{completions.length}</p>
              <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Total Visitors</p>
            </div>
            <div>
              <p className="text-4xl font-bold mb-1">{todayCompletions.length}</p>
              <p className="text-xs text-neutral-500 uppercase tracking-widest font-bold">Visitors Today</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 bg-white rounded-3xl p-8 shadow-sm border border-neutral-100">
          <h3 className="font-serif italic text-2xl mb-6">Recent Activity</h3>
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
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 text-center">
            <h3 className="font-bold uppercase tracking-widest text-xs text-neutral-400 mb-6">Your QR Code</h3>

            <div className="flex justify-center mb-4">
              <div className="bg-white border-2 border-neutral-200 rounded-2xl p-3">
                <QRCodeSVG
                  id="business-qr-svg"
                  value={business.qrCode}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </div>
            </div>

            <p className="text-[10px] text-neutral-400 mb-6 italic leading-relaxed">
              Display this at your checkout. Players scan it to verify their visit.
            </p>

            <div className="flex gap-3">
              <button
                onClick={printQR}
                className="flex-1 bg-neutral-900 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <Printer size={15} /> Print
              </button>
              <button
                onClick={downloadQR}
                className="flex-1 bg-white border border-neutral-200 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:border-neutral-900 transition-all flex items-center justify-center gap-2"
              >
                <Download size={15} /> Save
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3 overflow-hidden">
              <Hash size={14} className="text-neutral-400 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Manual code</p>
                <p className="text-sm font-mono font-bold text-neutral-900 tracking-widest truncate">{business.qrCode}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
