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

    // Check rows
    for (let r = 0; r < size; r++) {
      if (grid[r].every(id => id === 'FREE' || completedIds.has(id))) return true;
    }
    // Check cols
    for (let c = 0; c < size; c++) {
      let colDone = true;
      for (let r = 0; r < size; r++) {
        const id = grid[r][c];
        if (id !== 'FREE' && !completedIds.has(id)) {
          colDone = false;
          break;
        }
      }
      if (colDone) return true;
    }
    // Check diags
    let d1 = true, d2 = true;
    for (let i = 0; i < size; i++) {
      const id1 = grid[i][i];
      const id2 = grid[i][size - 1 - i];
      if (id1 !== 'FREE' && !completedIds.has(id1)) d1 = false;
      if (id2 !== 'FREE' && !completedIds.has(id2)) d2 = false;
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
      (err) => {
        console.error('Completions snapshot error:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeCompletions();
      if (qrScannerRef.current) {
        qrScannerRef.current.stop().catch(console.error);
      }
    };
  }, [user.uid]);

  // Auto-generate board if missing
  useEffect(() => {
    if (!loading && settings && businesses.length > 0 && user.town && (!user.bingoBoard || user.bingoBoard.length === 0)) {
      const newBoard = generateBingoBoard(businesses, settings, user.town);
      setDoc(doc(db, 'users', user.uid), {
        bingoBoard: newBoard,
        boardSize: settings.boardSize || 3
      }, { merge: true }).catch(err => {
        console.error('Failed to save bingo board:', err);
        setError('Could not generate your board. Please refresh the page.');
      });
    }
  }, [loading, settings, businesses, user.bingoBoard, user.uid, user.town]);

  const handleVerify = async (code: string) => {
    console.log("Verifying code:", code);
    setVerifying(true);
    setError(null);
    try {
      const biz = businesses.find(b => b.qrCode === code || b.nfcId === code);
      if (!biz) {
        setError("Invalid code. Please try again.");
        stopScanning();
        return;
      }

      const alreadyDone = completions.some(c => c.businessId === biz.id);
      if (alreadyDone) {
        setError(`You already completed ${biz.name}!`);
        stopScanning();
        return;
      }

      // GPS Check
      if (biz.lat && biz.lng) {
        if (!user.currentLocation) {
          setError("Location required to verify. Enable GPS and wait a moment, then try again.");
          stopScanning();
          return;
        }

        const distance = calculateDistance(
          user.currentLocation.lat,
          user.currentLocation.lng,
          biz.lat,
          biz.lng
        );

        if (distance > 500) {
          setError(`You need to be at ${biz.name} to verify. You are ${Math.round(distance)}m away.`);
          stopScanning();
          return;
        }
      }

      console.log("Adding completion for:", biz.id);
      await addDoc(collection(db, 'completions'), {
        userId: user.uid,
        businessId: biz.id,
        timestamp: new Date().toISOString(),
        town: biz.town
      });
      
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#141414', '#F27D26', '#FFFFFF']
      });
      
      setManualCode('');
      setShowManual(false);
      stopScanning();
    } catch (err) {
      console.error(err);
      setError("Verification failed. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyRef = useRef(handleVerify);

  useEffect(() => {
    handleVerifyRef.current = handleVerify;
  }, [handleVerify]);

  const startScanning = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setScanning(true);
    setError(null);
    
    // Small delay to ensure UI has updated and container is ready
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode("qr-reader");
        qrScannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            handleVerifyRef.current(decodedText);
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
        setError("Could not start camera. Please check permissions.");
        setScanning(false);
      }
    }, 300);
  };

  const stopScanning = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop();
        qrScannerRef.current = null;
      } catch (err) {
        console.error(err);
      }
    }
    setScanning(false);
  };

  const startNfcScan = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!('NDEFReader' in window)) {
      setError("NFC is not supported on this device/browser.");
      return;
    }

    setNfcScanning(true);
    setError(null);
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      ndef.onreading = (event: any) => {
        const { serialNumber } = event;
        handleVerifyRef.current(serialNumber);
        setNfcScanning(false);
      };
    } catch (err) {
      console.error(err);
      setError("NFC Scan failed. Please try again.");
      setNfcScanning(false);
    }
  };

  const regenerateBoard = async () => {
    if (!settings) return;
    const newBoard = generateBingoBoard(businesses, settings, user.town);
    await setDoc(doc(db, 'users', user.uid), { 
      bingoBoard: newBoard,
      boardSize: settings.boardSize || 3 
    }, { merge: true });
  };

  if (loading || !settings) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto flex flex-col p-4 md:p-6 min-h-[calc(100dvh-160px)] md:min-h-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-6 mb-6 md:mb-12 shrink-0">
        <div>
          <h2 className="font-serif italic text-3xl md:text-5xl mb-1 md:mb-2">Your Board</h2>
          <p className="text-[10px] md:text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
            <MapPin size={12} /> {user.town || 'Global'} Edition
          </p>
        </div>
        
        <div className="flex gap-2 md:gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowManual(!showManual)}
            className={`flex-1 md:flex-none px-4 md:px-6 py-2 md:py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm ${
              showManual ? 'bg-neutral-900 text-white' : 'bg-white border border-neutral-200 text-neutral-900 hover:border-neutral-900'
            }`}
          >
            {showManual ? 'Close Scanner' : 'Verify Visit'}
          </button>
          {(user.role === 'admin' || user.role === 'chamber') && (
            <button 
              onClick={regenerateBoard}
              className="bg-white border border-neutral-200 text-neutral-900 px-4 md:px-6 py-2 md:py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:border-neutral-900 transition-all shadow-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> <span className="hidden md:inline">New Board</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center relative min-h-0">
        <AnimatePresence>
          {showManual && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-4 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-y-auto"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div>
                  <h3 className="font-bold uppercase tracking-widest text-[10px] md:text-xs mb-4 md:mb-6 flex items-center justify-between">
                    Scan to Verify
                    <a 
                      href={window.location.href} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[8px] text-neutral-400 hover:text-neutral-900 transition-colors flex items-center gap-1"
                    >
                      <ExternalLink size={10} /> <span className="hidden sm:inline">Open in New Tab</span>
                    </a>
                  </h3>
                  <div className="flex flex-col gap-3 md:gap-4">
                    {!scanning ? (
                      <button 
                        onClick={startScanning}
                        className="bg-neutral-900 text-white p-4 md:p-6 rounded-2xl md:rounded-3xl font-bold text-xs md:text-sm hover:bg-neutral-800 transition-all flex flex-col items-center gap-2 md:gap-3 shadow-xl"
                      >
                        <QrCode className="w-6 h-6 md:w-8 md:h-8" />
                        Scan QR Code
                      </button>
                    ) : (
                      <div className="relative">
                        <div id="qr-reader" className="rounded-2xl md:rounded-3xl overflow-hidden border-4 border-neutral-900" />
                        <button 
                          onClick={stopScanning}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full shadow-lg"
                        >
                          <RefreshCw size={16} className="rotate-45" />
                        </button>
                      </div>
                    )}

                    <button 
                      onClick={startNfcScan}
                      disabled={nfcScanning}
                      className={`p-4 md:p-6 rounded-2xl md:rounded-3xl font-bold text-xs md:text-sm transition-all flex flex-col items-center gap-2 md:gap-3 shadow-xl ${
                        nfcScanning ? 'bg-orange-100 text-orange-600 animate-pulse' : 'bg-white border-2 border-neutral-900 text-neutral-900 hover:bg-neutral-50'
                      }`}
                    >
                      <Radio className={`w-6 h-6 md:w-8 md:h-8 ${nfcScanning ? 'animate-ping' : ''}`} />
                      {nfcScanning ? 'Ready to Scan...' : 'Scan NFC Tag'}
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="font-bold uppercase tracking-widest text-[10px] md:text-xs mb-4 md:mb-6">Manual Entry</h3>
                  <div className="flex flex-col gap-3 md:gap-4">
                    <input 
                      placeholder="Enter 6-digit code"
                      value={manualCode}
                      onChange={e => setManualCode(e.target.value)}
                      className="w-full p-3 md:p-4 bg-neutral-50 border border-neutral-100 rounded-xl md:rounded-2xl text-xs md:text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                    />
                    <button 
                      onClick={() => handleVerify(manualCode)}
                      disabled={verifying || !manualCode}
                      className="bg-neutral-900 text-white p-3 md:p-4 rounded-xl md:rounded-2xl font-bold text-xs md:text-sm hover:bg-neutral-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {verifying ? <Loader2 className="animate-spin" size={16} /> : 'Verify Code'}
                    </button>
                  </div>
                  {error && <p className="text-red-500 text-[8px] md:text-[10px] mt-3 md:mt-4 font-bold uppercase tracking-widest text-center">{error}</p>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div 
          className="grid gap-2 md:gap-3 w-full max-w-md aspect-square" 
          style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
        >
          {board.map((bizId, idx) => {
            if (bizId === 'FREE') {
              return (
                <div key="free" className="aspect-square bg-orange-50 border-2 border-orange-200 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center text-center p-1 md:p-2 shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-orange-100/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Trophy className="text-orange-500 mb-0.5 md:mb-1 relative z-10 w-4 h-4 md:w-6 md:h-6" />
                  <p className="text-[8px] md:text-[10px] font-black text-orange-900 uppercase tracking-tighter relative z-10 leading-none">{settings.freeSpaceName}</p>
                  <p className="text-[6px] md:text-[8px] text-orange-600 font-bold uppercase tracking-widest mt-0.5 md:mt-1 relative z-10 opacity-60">{settings.freeSpaceTask}</p>
                </div>
              );
            }
            
            if (bizId === 'EMPTY') {
              return (
                <div key={idx} className="aspect-square rounded-2xl md:rounded-3xl bg-neutral-50 border border-dashed border-neutral-200 flex items-center justify-center">
                  <span className="text-[8px] text-neutral-300 font-bold uppercase tracking-widest">TBD</span>
                </div>
              );
            }

            const biz = businesses.find(b => b.id === bizId);
            const isDone = completions.some(c => c.businessId === bizId);

            return (
              <div
                key={idx}
                onClick={() => {
                  if (biz) {
                    setSelectedBusiness(biz);
                    trackActivity(user.uid, 'view_business', { businessId: biz.id, businessName: biz.name });
                  }
                }}
                className={`aspect-square rounded-2xl md:rounded-3xl p-1.5 md:p-3 flex flex-col items-center justify-center text-center transition-all relative overflow-hidden group cursor-pointer ${
                  isDone
                    ? 'bg-neutral-900 text-white shadow-xl scale-[0.98]'
                    : 'bg-white border border-neutral-200 text-neutral-900 hover:border-neutral-900 hover:shadow-md'
                }`}
              >
                {isDone ? (
                  <>
                    <CheckCircle2 className="text-orange-500 mb-1 md:mb-2 w-4 h-4 md:w-6 md:h-6" />
                    <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-tighter leading-tight line-clamp-2">{biz?.name || 'Unknown'}</p>
                  </>
                ) : (
                  <>
                    <Store className="text-neutral-200 mb-1 md:mb-2 group-hover:text-neutral-400 transition-colors w-3.5 h-3.5 md:w-5 md:h-5" />
                    <p className="text-[8px] md:text-[10px] font-bold uppercase tracking-tighter leading-tight line-clamp-2">{biz?.name || '...'}</p>
                    <p className="text-[6px] md:text-[8px] text-neutral-400 font-medium uppercase tracking-widest mt-0.5 md:mt-1">{biz?.town}</p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Business Detail Modal */}
      <AnimatePresence>
        {selectedBusiness && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/90 backdrop-blur-md overflow-y-auto"
            onClick={() => setSelectedBusiness(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl relative my-auto"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setSelectedBusiness(null)}
                className="absolute top-6 right-6 z-10 bg-white/80 backdrop-blur-md p-3 rounded-full text-neutral-900 hover:bg-white transition-all shadow-lg"
              >
                <X size={24} />
              </button>

              <div className="h-64 relative">
                <img 
                  src={selectedBusiness.image || `https://picsum.photos/seed/${selectedBusiness.id}/800/600`} 
                  alt={selectedBusiness.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent" />
              </div>

              <div className="p-10 -mt-20 relative bg-white rounded-t-[3rem]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-neutral-100 p-2 rounded-xl">
                    <Store className="text-neutral-900" size={20} />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">{selectedBusiness.town}</span>
                </div>

                <h2 className="font-serif italic text-5xl mb-6">{selectedBusiness.name}</h2>
                
                <div className="space-y-8 mb-10">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3 flex items-center gap-2">
                      <Info size={12} /> Your Task
                    </h4>
                    <p className="text-lg text-neutral-700 leading-relaxed">{selectedBusiness.task}</p>
                  </div>

                  {selectedBusiness.description && (
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-3">About</h4>
                      <p className="text-sm text-neutral-500 leading-relaxed">{selectedBusiness.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <a 
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedBusiness.address || selectedBusiness.name + ' ' + selectedBusiness.town)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackActivity(user.uid, 'click_directions', { businessId: selectedBusiness.id, businessName: selectedBusiness.name })}
                      className="flex items-center justify-center gap-3 bg-neutral-100 p-5 rounded-2xl hover:bg-neutral-200 transition-all group"
                    >
                      <Navigation size={20} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                      <span className="text-xs font-bold uppercase tracking-widest">Get Directions</span>
                    </a>
                    {selectedBusiness.website && (
                      <a 
                        href={selectedBusiness.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-3 bg-neutral-100 p-5 rounded-2xl hover:bg-neutral-200 transition-all group"
                      >
                        <Globe size={20} className="text-neutral-400 group-hover:text-neutral-900 transition-colors" />
                        <span className="text-xs font-bold uppercase tracking-widest">Visit Website</span>
                      </a>
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setSelectedBusiness(null);
                    setShowManual(true);
                  }}
                  className="w-full bg-neutral-900 text-white py-6 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-xl flex items-center justify-center gap-3"
                >
                  <QrCode size={20} />
                  Verify Visit Now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bingo Fanfare Modal */}
      <AnimatePresence>
        {showBingoFanfare && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-neutral-900/95 backdrop-blur-xl overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.8, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 50 }}
              className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl text-center my-auto relative overflow-hidden"
            >
              {/* Confetti-like background elements */}
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

              <h2 className="font-serif italic text-5xl mb-4 text-neutral-900">BINGO!</h2>
              <p className="text-neutral-500 mb-8 leading-relaxed">
                Congratulations! You've completed a line on your bingo board.
              </p>

              <div className="bg-neutral-50 rounded-3xl p-8 mb-10 border border-neutral-100">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400 block mb-3">Your Prize</span>
                <p className="text-2xl font-serif italic text-neutral-900">
                  {settings.bingoPrize || "A special reward from the Chamber!"}
                </p>
                <p className="text-[10px] text-neutral-400 mt-4 uppercase tracking-widest font-bold">
                  Show this screen to a Chamber official to claim.
                </p>
              </div>

              <button 
                onClick={() => setShowBingoFanfare(false)}
                className="w-full bg-neutral-900 text-white py-6 rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-xl"
              >
                Awesome, thanks!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!loading && settings && !user.onboardingComplete && (
        <Onboarding
          user={user}
          towns={towns}
          businesses={businesses}
          settings={settings}
          onComplete={() => {}}
        />
      )}

      {hasBingo && settings.raffleEnabled && (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-orange-500 text-white p-10 rounded-[3rem] text-center shadow-2xl relative overflow-hidden mb-12"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,rgba(255,255,255,0.3),transparent)]" />
          <Trophy className="mx-auto mb-6 text-white drop-shadow-lg" size={64} />
          <h3 className="font-serif italic text-5xl mb-4">BINGO!</h3>
          <p className="text-orange-100 text-lg mb-8 max-w-md mx-auto">You've completed a line! You're now eligible for the Chamber Raffle.</p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              to="/raffle"
              className="bg-white text-orange-600 px-10 py-5 rounded-2xl font-bold text-sm hover:bg-neutral-100 transition-all shadow-xl flex items-center justify-center gap-2"
            >
              <Ticket size={20} />
              Enter Raffle
            </Link>
          </div>
        </motion.div>
      )}

      <footer className="mt-20 pt-12 border-t border-neutral-200">
        <p className="text-center text-[10px] text-neutral-300 uppercase tracking-[0.3em] font-bold">
          {settings?.chamberName || 'Hudson Valley Gateway Chamber of Commerce'}
        </p>
      </footer>
    </div>
  );
};
