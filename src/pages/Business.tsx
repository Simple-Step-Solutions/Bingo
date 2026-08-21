import React, { useState, useEffect } from 'react';
import { UserProfile, Business, Completion } from '../types';
import { collection, onSnapshot, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { claimBusiness, errorMessage, isExpectedError } from '../services/api';
import { useBusinessSecret } from '../services/secrets';
import { Store, Users, CheckCircle2, Loader2, Download, MapPin, Printer, Hash, KeyRound } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { svgToDataUrl } from '../lib/utils';

interface BusinessDashboardProps {
  user: UserProfile;
}

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({ user }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimCode, setClaimCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const printQR = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow || !business) return;
    const svg = document.getElementById('business-qr-svg');
    if (!svg) return;

    // Built with DOM APIs rather than document.write with template literals.
    // business.name is chamber-entered and also arrives via CSV import, so a
    // name like `<img src=x onerror=...>` used to execute in this window, which
    // is same-origin with the app and therefore holds the Firebase session.
    // textContent escapes by construction.
    const doc = printWindow.document;
    doc.title = `${business.name} - QR Code`;

    const style = doc.createElement('style');
    style.textContent = `
      body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif; }
      h1 { font-size: 24px; margin-bottom: 8px; text-align: center; }
      p { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.15em; margin-bottom: 24px; text-align: center; }
      .code { font-size: 18px; font-weight: bold; letter-spacing: 0.2em; margin-top: 16px; color: #333; }
      img { width: 280px; height: 280px; }
    `;
    doc.head.appendChild(style);

    const heading = doc.createElement('h1');
    heading.textContent = business.name;

    const caption = doc.createElement('p');
    caption.textContent = 'Scan to verify your visit';

    const img = doc.createElement('img');
    img.src = svgToDataUrl(svg);
    img.alt = `QR code for ${business.name}`;

    const code = doc.createElement('p');
    code.className = 'code';
    code.textContent = `Manual code: ${manualCode}`;

    doc.body.append(heading, caption, img, code);

    // Wait for the QR image to decode, otherwise the print dialog can open on
    // a blank page.
    const go = () => { printWindow.focus(); printWindow.print(); };
    if (img.complete) go();
    else { img.onload = go; img.onerror = go; }
  };

  const downloadQR = () => {
    const svg = document.getElementById('business-qr-svg');
    if (!svg || !business) return;
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
    img.src = svgToDataUrl(svg);
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
    if (!business) return;
    // Visitor names come from the completion itself. This used to fan out one
    // getDoc(users/{uid}) per visitor, which a business account is not allowed
    // to read, so every one of those reads was denied, the names never appeared,
    // and the failures were swallowed by an empty catch on each snapshot.
    const q = query(collection(db, 'completions'), where('businessId', '==', business.id));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setCompletions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion))),
      (err) => console.error('Completions snapshot error:', err),
    );
    return () => unsubscribe();
  }, [business]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  /**
   * Claiming is server-side now.
   *
   * This was a privilege escalation path: codes were CHAMBER_<documentId> and
   * every document id was readable from the public businesses collection, so
   * any business-role account could claim any business in the game along with
   * its visitor list. The server resolves the code from a hash index the client
   * cannot read, and refuses a business that already has an owner.
   */
  // The code is no longer on the business document. It comes from
  // business_secrets, which only the chamber and this owner can read.
  const { secret, error: secretError } = useBusinessSecret(business?.id);
  const manualCode = secret?.code ?? '';

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimCode.trim()) return;
    setClaiming(true);
    setClaimError(null);
    try {
      await claimBusiness({ code: claimCode.trim() });
      // Refresh the token so the new business claim is present before the next
      // Firestore read runs against it.
      await auth.currentUser?.getIdToken(true);
    } catch (err) {
      if (!isExpectedError(err)) console.error(err);
      setClaimError(errorMessage(err, 'Could not claim that business.'));
    } finally {
      setClaiming(false);
    }
  };

  if (!business) return (
    <div className="max-w-md mx-auto py-20">
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-neutral-100">
        <div className="h-1.5 bg-[var(--color-primary)]" />
        <div className="p-10 text-center">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <KeyRound className="text-[var(--color-primary)]" size={28} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-primary)] mb-2">Business Setup</p>
          <h2 className="font-serif italic text-3xl mb-3">Claim your business</h2>
          <p className="text-neutral-500 text-sm leading-relaxed mb-8">
            Enter the claim code your Chamber administrator gave you. It's the same as the manual code on your setup sheet.
          </p>
          <form onSubmit={handleClaim} className="space-y-4 text-left">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Claim Code</label>
              <input
                type="text"
                placeholder="e.g. CHAMBER_abc123"
                value={claimCode}
                onChange={e => setClaimCode(e.target.value)}
                className="w-full px-4 py-4 bg-neutral-50 border border-neutral-200 rounded-2xl text-sm font-mono font-bold focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
              />
            </div>
            {claimError && (
              <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <p className="text-xs text-red-600 font-bold">{claimError}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={claiming || !claimCode.trim()}
              className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-95"
            >
              {claiming ? <Loader2 className="animate-spin" size={16} /> : <KeyRound size={16} />}
              Claim Business
            </button>
          </form>
          <p className="text-[9px] text-neutral-400 mt-6 leading-relaxed">
            Don't have a code? Contact your Chamber administrator to get set up.
          </p>
        </div>
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
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">{business.town}</span>
            </div>
            <div className="bg-white/10 px-4 py-2 rounded-full backdrop-blur-sm border border-white/10">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">{business.task}</span>
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
                      <p className="font-bold text-sm">{c.userName || `Visitor #${c.userId.slice(-4).toUpperCase()}`}</p>
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
                  value={manualCode || 'pending'}
                  size={180}
                  level="H"
                  includeMargin={false}
                />
              </div>
            </div>

            <p className="text-[10px] text-neutral-400 mb-6 italic leading-relaxed">
              Display this at your checkout. Players scan it to verify their visit.
            </p>

            {secretError && (
              <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                <p className="text-red-600 text-[11px] font-bold">{secretError}</p>
              </div>
            )}

            {secret === undefined && !secretError && (
              <div role="alert" className="mb-4 bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-3">
                <p className="text-yellow-800 text-[11px] font-bold leading-relaxed">
                  No code has been issued for your business yet. Ask the Chamber to generate one.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={printQR}
                disabled={!manualCode}
                className="flex-1 bg-neutral-900 text-white py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-neutral-800 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Printer size={15} aria-hidden="true" /> Print
              </button>
              <button
                onClick={downloadQR}
                disabled={!manualCode}
                className="flex-1 bg-white border border-neutral-200 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest hover:border-neutral-900 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
              >
                <Download size={15} aria-hidden="true" /> Save
              </button>
            </div>

            <div className="mt-6 flex items-center gap-3 bg-neutral-50 border border-neutral-100 rounded-2xl px-4 py-3 overflow-hidden">
              <Hash size={14} className="text-neutral-400 shrink-0" />
              <div className="text-left min-w-0">
                <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Manual code</p>
                <p className="text-sm font-mono font-bold text-neutral-900 tracking-widest truncate">
                  {manualCode || (secret === null ? 'Loading...' : 'Not issued yet')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
