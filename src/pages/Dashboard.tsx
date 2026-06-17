import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, Business, Completion, AppSettings, Town } from '../types';
import { collection, onSnapshot, query, where, addDoc, setDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Trophy, CheckCircle2, MapPin, Store, RefreshCw, Loader2, ExternalLink, Ticket, QrCode, Radio, X, Navigation, Globe, Info, Star } from 'lucide-react';
import { generateBingoBoard } from '../services/bingoService';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { calculateDistance } from '../lib/utils';
import { trackActivity } from '../services/activityService';
import { Onboarding } from '../components/Onboarding';

interface DashboardProps {
  user: UserProfile;
  businesses: Business[];
  towns: Town[];
  settings: AppSettings | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, businesses, towns, settings }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [showBingoFanfare, setShowBingoFanfare] = useState(false);
  const [hasShownFanfare, setHasShownFanfare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const size = user.boardSize || settings?.boardSize || 3;
  const board = user.bingoBoard || [];

  const isBingo = (board: string[], completions: Completion[]) => {
    if (!board || board.length === 0) return false;
    const completedIds = new Set(completions.map(c => c.businessId));
    const grid: string[][] = [];
    for (let i = 0; i < board.length; i += size) {
      const row = board.slice(i, i + size);
      if (row.length === size) grid.push(row);
    }
    if (grid.length !== size) return false;
    for (let r = 0; r < size; r++) {
      if (grid[r].every(id => id === 'FREE' || completedIds.has(id))) return true;
    }
    for (let c = 0; c < size; c++) {
      let colDone = true;
      for (let r = 0; r < size; r++) {
        if (grid[r][c] !== 'FREE' && !completedIds.has(grid[r][c])) { colDone = false; break; }
      }
      if (colDone) return true;
    }
    let d1 = true, d2 = true;
    for (let i = 0; i < size; i++) {
      if (grid[i][i] !== 'FREE' && !completedIds.has(grid[i][i])) d1 = false;
      if (grid[i][size - 1 - i] !== 'FREE' && !completedIds.has(grid[i][size - 1 - i])) d2 = false;
    }
    return d1 || d2;
  };

  const hasBingo = isBingo(board, completions);

  useEffect(() => {
    if (hasBingo && !hasShownFanfare) {
      setShowBingoFanfare(true);
      setHasShownFanfare(true);
    }
  }, [hasBingo, hasShownFanfare]);

  useEffect(() => {
    const unsubscribeCompletions = onSnapshot(
      query(collection(db, 'completions'), where('userId', '==', user.uid)),
      (snapshot) => {
        setCompletions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion)));
        setLoading(false);
      },
      (err) => { console.error('Completions snapshot error:', err); setLoading(false); }
    );
    return () => {
      unsubscribeCompletions();
      if (qrScannerRef.current) qrScannerRef.current.stop().catch(console.error);
    };
  }, [user.uid]);

  useEffect(() => {
    if (!loading && settings && businesses.length > 0 && user.town && (!user.bingoBoard || user.bingoBoard.length === 0)) {
      const newBoard = generateBingoBoard(businesses, settings, user.town);
      setDoc(doc(db, 'users', user.uid), { bingoBoard: newBoard, boardSize: settings.boardSize || 3 }, { merge: true })
        .catch(err => { console.error('Failed to save bingo board:', err); setError('Could not generate your board. Please refresh.'); });
    }
  }, [loading, settings, businesses, user.bingoBoard, user.uid, user.town]);

  const handleVerify = async (code: string) => {
    setVerifying(true);
    setError(null);
    try {
      const biz = businesses.find(b => b.qrCode === code || b.nfcId === code);
      if (!biz) { setError('Invalid code. Please try again.'); stopScanning(); return; }

      if (completions.some(c => c.businessId === biz.id)) {
        setError(`You already completed ${biz.name}!`); stopScanning(); return;
      }

      if (biz.lat && biz.lng) {
        if (!user.currentLocation) {
          setError('Location required. Enable GPS and wait a moment, then try again.'); stopScanning(); return;
        }
        const distance = calculateDistance(user.currentLocation.lat, user.currentLocation.lng, biz.lat, biz.lng);
        if (distance > 500) {
          setError(`You need to be at ${biz.name} to verify. You are ${Math.round(distance)}m away.`); stopScanning(); return;
        }
      }

      await addDoc(collection(db, 'completions'), {
        userId: user.uid, businessId: biz.id, timestamp: new Date().toISOString(), town: biz.town
      });
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#141414', '#F27D26', '#FFFFFF'] });
      setManualCode('');
      setShowManual(false);
      stopScanning();
    } catch (err) {
      console.error(err);
      setError('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyRef = useRef(handleVerify);
  useEffect(() => { handleVerifyRef.current = handleVerify; }, [handleVerify]);

  const startScanning = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setScanning(true);
    setError(null);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader');
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => { handleVerifyRef.current(decodedText); },
          () => {}
        );
      } catch (err) {
        console.error(err);
        setError('Could not start camera. Please check permissions.');
        setScanning(false);
      }
    }, 300);
  };

  const stopScanning = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (qrScannerRef.current) {
      try { await qrScannerRef.current.stop(); qrScannerRef.current = null; } catch (err) { console.error(err); }
    }
    setScanning(false);
  };

  const startNfcScan = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!('NDEFReader' in window)) { setError('NFC is not supported on this device or browser.'); return; }
    setNfcScanning(true);
    setError(null);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = (event: any) => {
        handleVerifyRef.current(event.serialNumber);
        setNfcScanning(false);
      };
    } catch (err) {
      console.error(err);
      setError('NFC scan failed. Please try again.');
      setNfcScanning(false);
    }
  };

  const regenerateBoard = async () => {
    if (!settings) return;
    const newBoard = generateBingoBoard(businesses, settings, user.town);
    await setDoc(doc(db, 'users', user.uid), { bingoBoard: newBoard, boardSize: settings.boardSize || 3 }, { merge: true });
  };

  if (loading || !settings) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  // Verify panel content -- shared between mobile sheet and desktop overlay
  const VerifyContent = () => (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold uppercase tracking-widest">{error}</p>
        </div>
      )}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
      <div>
        <h3 className="font-bold uppercase tracking-widest text-[10px] md:text-xs mb-4 flex items-center justify-between">
          Scan to Verify
          <a href={window.location.href} target="_blank" rel="noopener noreferrer"
            className="text-[8px] text-neutral-400 hover:text-neutral-900 transition-colors flex items-center gap-1">
            <ExternalLink size={10} /> Open in New Tab
          </a>
        </h3>
        <div className="flex flex-col gap-3">
          {!scanning ? (
            <button onClick={startScanning}
              className="bg-neutral-900 text-white p-5 rounded-2xl font-bold text-xs hover:bg-neutral-800 transition-all flex flex-col items-center gap-2 shadow-xl">
              <QrCode size={28} />
              Scan QR Code
            </button>
          ) : (
            <div className="relative">
              <div id="qr-reader" className="rounded-2xl overflow-hidden border-4 border-neutral-900" />
              <button onClick={stopScanning}
                className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg">
                <X size={16} />
              </button>
            </div>
          )}
          <button onClick={startNfcScan} disabled={nfcScanning}
            className={`p-5 rounded-2xl font-bold text-xs transition-all flex flex-col items-center gap-2 shadow-sm ${
              nfcScanning ? 'bg-orange-100 text-orange-600 animate-pulse' : 'bg-white border-2 border-neutral-200 text-neutral-900 hover:border-neutral-900'
            }`}>
            <Radio size={28} className={nfcScanning ? 'animate-ping' : ''} />
            {nfcScanning ? 'Hold NFC tag to phone...' : 'Scan NFC Tag'}
          </button>
        </div>
      </div>

      <div>
        <h3 className="font-bold uppercase tracking-widest text-[10px] md:text-xs mb-4">Manual Entry</h3>
        <div className="flex flex-col gap-3">
          <input
            placeholder="Enter business code (e.g. CHAMBER_abc123)"
            value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            className="w-full p-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
          />
          <button onClick={() => handleVerify(manualCode)} disabled={verifying || !manualCode}
            className="bg-neutral-900 text-white p-4 rounded-2xl font-bold text-xs hover:bg-neutral-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {verifying ? <Loader2 className="animate-spin" size={16} /> : 'Verify Code'}
          </button>
          <p className="text-[9px] text-neutral-400 leading-relaxed">
            The business code is shown on the QR printout. Ask staff if you need help.
          </p>
        </div>
      </div>
    </div>
    </div>
  );

  return (
    <div className="flex flex-col max-w-4xl mx-auto" style={{ height: 'calc(100dvh - 6rem)', overflow: 'hidden', marginTop: '-2rem', marginBottom: '-2rem', paddingTop: '0.75rem' }}>

      {/* Header */}
      <div className="flex justify-between items-center gap-3 mb-2 md:mb-10 shrink-0">
        <div>
          <h2 className="font-serif italic text-2xl md:text-5xl leading-none mb-0.5">Your Board</h2>
          <p className="text-[9px] md:text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold flex items-center gap-1">
            <MapPin size={10} /> {user.town || 'Global'} Edition
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => { setShowManual(!showManual); setError(null); }}
            className={`px-4 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${
              showManual ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-900 hover:border-neutral-900'
            }`}
          >
            {showManual ? 'Close' : 'Verify Visit'}
          </button>
          {(user.role === 'admin' || user.role === 'chamber') && (
            <button onClick={regenerateBoard}
              className="bg-white border border-neutral-200 text-neutral-900 p-2.5 rounded-2xl hover:border-neutral-900 transition-all shadow-sm">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 flex items-start justify-center relative pt-2">
        <div
          className="grid gap-1.5 md:gap-3"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridAutoRows: '1fr',
            width: 'min(calc(100vw - 2rem), calc(100dvh - 8rem))',
            height: 'min(calc(100vw - 2rem), calc(100dvh - 8rem))',
          }}
        >
          {board.map((bizId, idx) => {
            if (bizId === 'FREE') {
              return (
                <div key="free"
                  className="bg-orange-50 border-2 border-orange-200 rounded-xl md:rounded-3xl flex flex-col items-center justify-center text-center p-1 shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-orange-100/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Trophy className="text-orange-500 mb-0.5 relative z-10 w-4 h-4 md:w-6 md:h-6" />
                  <p className="text-[7px] md:text-[10px] font-black text-orange-900 uppercase tracking-tighter relative z-10 leading-none px-1">{settings.freeSpaceName}</p>
                  <p className="text-[5px] md:text-[8px] text-orange-600 font-bold uppercase tracking-widest mt-0.5 relative z-10 opacity-60 px-1 leading-tight hidden sm:block">{settings.freeSpaceTask}</p>
                </div>
              );
            }

            if (bizId === 'EMPTY') {
              return (
                <div key={idx} className="rounded-xl md:rounded-3xl bg-neutral-50 border border-dashed border-neutral-200 flex items-center justify-center">
                  <span className="text-[7px] text-neutral-300 font-bold uppercase tracking-widest">TBD</span>
                </div>
              );
            }

            const biz = businesses.find(b => b.id === bizId);
            const isDone = completions.some(c => c.businessId === bizId);

            return (
              <div key={idx}
                onClick={() => {
                  if (biz) { setSelectedBusiness(biz); trackActivity(user.uid, 'view_business', { businessId: biz.id, businessName: biz.name }); }
                }}
                className={`rounded-xl md:rounded-3xl flex flex-col items-center justify-center text-center transition-all relative overflow-hidden group cursor-pointer p-1 md:p-3 ${
                  isDone ? 'bg-neutral-900 text-white shadow-xl' : 'bg-white border border-neutral-200 text-neutral-900 hover:border-neutral-900 hover:shadow-md'
                }`}
              >
                {isDone ? (
                  <>
                    <CheckCircle2 className="text-orange-500 mb-0.5 md:mb-1 w-4 h-4 md:w-6 md:h-6 shrink-0" />
                    <p className="text-[7px] md:text-[10px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 px-0.5">{biz?.name || 'Unknown'}</p>
                  </>
                ) : (
                  <>
                    <Store className="text-neutral-200 mb-0.5 md:mb-1 group-hover:text-neutral-400 transition-colors w-3.5 h-3.5 md:w-5 md:h-5 shrink-0" />
                    <p className="text-[7px] md:text-[10px] font-bold uppercase tracking-tighter leading-tight line-clamp-2 px-0.5">{biz?.name || '...'}</p>
                    <p className="text-[5px] md:text-[8px] text-neutral-400 font-medium uppercase tracking-widest mt-0.5 hidden sm:block">{biz?.town}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Verify -- bottom sheet on mobile, overlay on desktop */}
      <AnimatePresence>
        {showManual && (
          <>
            {/* Mobile: bottom sheet */}
            <motion.div
              key="mobile-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white rounded-t-[2rem] shadow-2xl border-t border-neutral-200 p-6 pb-28 overflow-y-auto max-h-[85dvh]"
            >
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif italic text-2xl">Verify Visit</h3>
                <button onClick={() => { setShowManual(false); stopScanning(); setError(null); }}
                  className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                  <X size={20} />
                </button>
              </div>
              <VerifyContent />
            </motion.div>

            {/* Mobile: backdrop */}
            <motion.div
              key="mobile-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="md:hidden fixed inset-0 z-30 bg-neutral-900/40 backdrop-blur-sm"
              onClick={() => { setShowManual(false); stopScanning(); setError(null); }}
            />

            {/* Desktop: inline overlay on board */}
            <motion.div
              key="desktop-overlay"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="hidden md:block absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-y-auto"
            >
              <VerifyContent />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Business Detail Modal */}
      <AnimatePresence>
        {selectedBusiness && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4 bg-neutral-900/90 backdrop-blur-md"
            onClick={() => setSelectedBusiness(null)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-t-[2.5rem] md:rounded-[3rem] overflow-hidden shadow-2xl relative"
              style={{ maxHeight: '90dvh' }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setSelectedBusiness(null)}
                className="absolute top-5 right-5 z-10 bg-white/80 backdrop-blur-md p-2.5 rounded-full text-neutral-900 hover:bg-white transition-all shadow-lg">
                <X size={20} />
              </button>

              <div className="overflow-y-auto" style={{ maxHeight: '90dvh' }}>
                <div className="h-48 md:h-64 relative shrink-0">
                  <img
                    src={selectedBusiness.image || `https://picsum.photos/seed/${selectedBusiness.id}/800/600`}
                    alt={selectedBusiness.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
                </div>

                <div className="p-8 -mt-16 relative bg-white rounded-t-[2.5rem]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-neutral-100 p-2 rounded-xl">
                      <Store className="text-neutral-900" size={18} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">{selectedBusiness.town}</span>
                  </div>

                  <h2 className="font-serif italic text-4xl mb-5">{selectedBusiness.name}</h2>

                  <div className="space-y-6 mb-8">
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
                        <Info size={12} /> Your Task
                      </h4>
                      <p className="text-base text-neutral-700 leading-relaxed">{selectedBusiness.task}</p>
                    </div>

                    {selectedBusiness.description && (
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2">About</h4>
                        <p className="text-sm text-neutral-500 leading-relaxed">{selectedBusiness.description}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedBusiness.address || selectedBusiness.name + ' ' + selectedBusiness.town)}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={() => trackActivity(user.uid, 'click_directions', { businessId: selectedBusiness.id, businessName: selectedBusiness.name })}
                        className="flex items-center justify-center gap-2 bg-neutral-100 p-4 rounded-2xl hover:bg-neutral-200 transition-all group"
                      >
                        <Navigation size={18} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                        <span className="text-xs font-bold uppercase tracking-widest">Directions</span>
                      </a>
                      {selectedBusiness.website && (
                        <a href={selectedBusiness.website} target="_blank" rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 bg-neutral-100 p-4 rounded-2xl hover:bg-neutral-200 transition-all group">
                          <Globe size={18} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                          <span className="text-xs font-bold uppercase tracking-widest">Website</span>
                        </a>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => { setSelectedBusiness(null); setShowManual(true); }}
                    className="w-full bg-neutral-900 text-white py-5 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-xl flex items-center justify-center gap-3"
                  >
                    <QrCode size={18} />
                    Verify Visit Now
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bingo Fanfare Modal */}
      <AnimatePresence>
        {showBingoFanfare && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-neutral-900/95 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 50 }}
              className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500" />
              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-8 relative">
                <Trophy className="text-yellow-600" size={48} />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -top-2 -right-2 bg-orange-500 text-white p-2 rounded-full shadow-lg"
                >
                  <Star size={16} fill="currentColor" />
                </motion.div>
              </div>
              <h2 className="font-serif italic text-5xl mb-4">BINGO!</h2>
              <p className="text-neutral-500 mb-8 leading-relaxed">Congratulations! You've completed a line on your bingo board.</p>
              <div className="bg-neutral-50 rounded-3xl p-8 mb-10 border border-neutral-100">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 block mb-3">Your Prize</span>
                <p className="text-2xl font-serif italic text-neutral-900">{settings.bingoPrize || 'A special reward from the Chamber!'}</p>
                <p className="text-[10px] text-neutral-400 mt-4 uppercase tracking-widest font-bold">Show this screen to a Chamber official to claim.</p>
              </div>
              <button onClick={() => setShowBingoFanfare(false)}
                className="w-full bg-neutral-900 text-white py-6 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-xl">
                Awesome, thanks!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && settings && !user.onboardingComplete && (
        <Onboarding user={user} towns={towns} businesses={businesses} settings={settings} onComplete={() => {}} />
      )}

      {/* Bingo raffle banner -- fixed so it never pushes layout */}
      {hasBingo && settings.raffleEnabled && (
        <motion.div
          initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-24 inset-x-4 md:inset-x-auto md:bottom-8 md:right-8 md:left-auto md:w-80 bg-orange-500 text-white p-5 rounded-[2rem] text-center shadow-2xl z-30 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.3),transparent)]" />
          <Trophy className="mx-auto mb-2 text-white drop-shadow-lg relative z-10" size={32} />
          <h3 className="font-serif italic text-2xl mb-1 relative z-10">BINGO!</h3>
          <p className="text-orange-100 mb-4 text-sm relative z-10">You're eligible for the raffle!</p>
          <Link to="/raffle"
            className="inline-flex items-center gap-2 bg-white text-orange-600 px-6 py-3 rounded-xl font-bold text-xs hover:bg-neutral-100 transition-all shadow-lg relative z-10">
            <Ticket size={16} /> Enter Raffle
          </Link>
        </motion.div>
      )}

      <footer className="hidden md:block mt-16 pt-10 border-t border-neutral-200">
        <p className="text-center text-[10px] text-neutral-300 uppercase tracking-[0.3em] font-bold">
          {settings?.chamberName || 'Hudson Valley Gateway Chamber of Commerce'}
        </p>
      </footer>
    </div>
  );
};
