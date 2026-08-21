import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, Business, Completion, AppSettings } from '../types';
import { collection, onSnapshot, query, where, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Trophy, CheckCircle2, MapPin, Store, RefreshCw, Loader2, ExternalLink, Ticket, QrCode, Radio, X, Navigation, Globe, Info, Star } from 'lucide-react';
import { checkBingo, boardIsIncomplete } from '../services/bingoService';
import { Link } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { useModalA11y, prefersReducedMotion } from '../lib/a11y';
import { verifyVisit, ensureBoard, regenerateBoard as regenerateBoardCall, errorMessage, isExpectedError } from '../services/api';

interface DashboardProps {
  user: UserProfile;
  businesses: Business[];
  settings: AppSettings | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, businesses, settings }) => {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const closeBusiness = useCallback(() => setSelectedBusiness(null), []);
  const businessModalRef = useModalA11y(selectedBusiness !== null, closeBusiness);
  const [showBingoFanfare, setShowBingoFanfare] = useState(false);
  const [hasShownFanfare, setHasShownFanfare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  // The mobile sheet and the desktop overlay used to render at the same time,
  // hidden from each other with CSS. That put two elements with id="qr-reader"
  // in the DOM, and Html5Qrcode grabs the first by id, so on desktop the camera
  // attached to the display:none mobile copy and no preview ever appeared.
  // Render exactly one of them instead.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The board now lives in boards/{uid}, written only by Cloud Functions. A
  // player who could rewrite their own board picked nine businesses in one
  // strip mall and finished without leaving the parking lot.
  //
  // users/{uid}.bingoBoard is still read as a fallback so a player mid-game
  // sees their squares during the one release where both shapes exist.
  const [serverBoard, setServerBoard] = useState<{ cells: string[]; size: number; incomplete: boolean } | null>(null);
  const [boardLoaded, setBoardLoaded] = useState(false);
  const ensuringRef = useRef(false);

  // Board ids are scoped to the event, so a new season gives every player a
  // fresh board without destroying last season's. Before the migration has run
  // there is no activeEventId and boards keep their bare uid key.
  const boardDocId = settings?.activeEventId ? `${settings.activeEventId}_${user.uid}` : user.uid;

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'boards', boardDocId),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setServerBoard({
            cells: Array.isArray(d.cells) ? d.cells : [],
            size: d.size || 3,
            incomplete: !!d.incomplete,
          });
        } else {
          setServerBoard(null);
        }
        setBoardLoaded(true);
      },
      (err) => { console.error('Board snapshot error:', err); setBoardLoaded(true); },
    );
    return unsub;
  }, [boardDocId]);

  // Ask the server for a board once, when there genuinely is not one.
  useEffect(() => {
    if (!boardLoaded || serverBoard || ensuringRef.current || !user.town) return;
    ensuringRef.current = true;
    ensureBoard({})
      .catch((err) => {
        console.error('ensureBoard failed:', err);
        setError(errorMessage(err, 'Could not generate your board. Please refresh.'));
      })
      .finally(() => { ensuringRef.current = false; });
  }, [boardLoaded, serverBoard, user.town]);

  const size = serverBoard?.size || user.boardSize || settings?.boardSize || 3;
  const board = serverBoard?.cells || user.bingoBoard || [];

  const hasBingo = checkBingo(board, completions, size);

  // A town with fewer businesses than the board has squares produces 'EMPTY'
  // cells, which render as tiny "TBD" tiles that can never be completed. That
  // silently makes some rows unwinnable, so say so rather than leaving the
  // player to work it out.
  const incomplete = boardIsIncomplete(board);
  const emptyCount = board.filter(c => c === 'EMPTY').length;

  // hasShownFanfare was component state, so the celebration modal reappeared
  // on every single reload once a player had a bingo. The win itself is now
  // recorded server-side in wins/{uid}; this only tracks whether this device
  // has already shown the animation.
  const fanfareKey = `bingoFanfareShown:${user.uid}`;

  useEffect(() => {
    if (!hasBingo || hasShownFanfare) return;
    let alreadySeen = false;
    try { alreadySeen = localStorage.getItem(fanfareKey) === '1'; } catch { /* private mode */ }
    if (!alreadySeen) setShowBingoFanfare(true);
    setHasShownFanfare(true);
    try { localStorage.setItem(fanfareKey, '1'); } catch { /* private mode */ }
  }, [hasBingo, hasShownFanfare, fanfareKey]);

  useEffect(() => {
    const unsubscribeCompletions = onSnapshot(
      query(collection(db, 'completions'), where('userId', '==', user.uid)),
      (snapshot) => {
        const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Completion));
        // A completion from a previous season must not mark a square on this
        // season's board.
        const activeId = settings?.activeEventId;
        setCompletions(activeId ? all.filter(c => (c.eventId || null) === activeId) : all);
        setLoading(false);
      },
      (err) => { console.error('Completions snapshot error:', err); setLoading(false); }
    );
    return () => {
      unsubscribeCompletions();
      if (qrScannerRef.current) qrScannerRef.current.stop().catch(console.error);
    };
  }, [user.uid, settings?.activeEventId]);

  // The QR callback fires at 10fps for as long as the code stays in frame.
  // setVerifying is async, so without a synchronous lock a single scan wrote
  // several duplicate completions before the first one finished.
  const verifyLockRef = useRef(false);

  const stopScanning = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (qrScannerRef.current) {
      try { await qrScannerRef.current.stop(); qrScannerRef.current = null; } catch (err) { console.error(err); }
    }
    setScanning(false);
  };

  /**
   * Fresh fix rather than the cached user.currentLocation, which LocationTracker
   * only refreshes once a minute and only after 30m of movement. Walking into a
   * shop and scanning immediately would otherwise be judged against a position
   * from a block away.
   */
  const currentPosition = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) return resolve(user.currentLocation ?? null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(user.currentLocation ?? null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });

  /**
   * Verification is now entirely server-side.
   *
   * The client no longer resolves the code, checks for duplicates, runs the
   * geofence, or reads the pause switch. It hands the scanned string to
   * verifyVisit and shows whatever comes back.
   *
   * There is deliberately no fallback to the old addDoc path. A fallback would
   * keep the hole open for the entire overlap window, which is the opposite of
   * the point.
   */
  const handleVerify = async (code: string, method: 'qr' | 'nfc' | 'manual' = 'manual') => {
    if (verifyLockRef.current) return;
    verifyLockRef.current = true;
    setVerifying(true);
    setError(null);
    try {
      const pos = await currentPosition();
      const result = await verifyVisit({
        code,
        method,
        ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
      });

      if (!prefersReducedMotion()) {
        confetti({
          particleCount: result.bingo ? 220 : 100,
          spread: result.bingo ? 100 : 70,
          origin: { y: 0.6 },
          colors: ['#141414', '#F27D26', '#FFFFFF'],
        });
      }
      setManualCode('');
      setShowManual(false);
      stopScanning();
    } catch (err) {
      // Server messages are written for the player ("You are 1,240m away"), so
      // show them rather than replacing them with something generic.
      setError(errorMessage(err, 'Verification failed. Please try again.'));
      if (!isExpectedError(err)) console.error('verifyVisit failed:', err);
      stopScanning();
    } finally {
      verifyLockRef.current = false;
      setVerifying(false);
    }
  };

  // The latest-ref pattern: the QR and NFC callbacks are registered once, when
  // the scanner starts, and must not capture a stale closure. No dependency
  // array on purpose -- this should run after every render, which is precisely
  // what keeps the ref current.
  const handleVerifyRef = useRef(handleVerify);
  useEffect(() => { handleVerifyRef.current = handleVerify; });

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
          (decodedText) => { handleVerifyRef.current(decodedText, 'qr'); },
          () => {}
        );
      } catch (err) {
        console.error(err);
        setError('Could not start camera. Please check permissions.');
        setScanning(false);
      }
    }, 300);
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
        handleVerifyRef.current(event.serialNumber, 'nfc');
        setNfcScanning(false);
      };
    } catch (err) {
      console.error(err);
      setError('NFC scan failed. Please try again.');
      setNfcScanning(false);
    }
  };

  const [regenerating, setRegenerating] = useState(false);

  const regenerateBoard = async () => {
    setRegenerating(true);
    setError(null);
    try {
      await regenerateBoardCall({});
    } catch (err) {
      // The server refuses a self-reroll once completions exist, which used to
      // be possible and let a player abandon a hard board while keeping credit
      // for the businesses they had already visited.
      setError(errorMessage(err, 'Could not regenerate your board.'));
      if (!isExpectedError(err)) console.error('regenerateBoard failed:', err);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading || !settings) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-neutral-400" size={32} />
    </div>
  );

  // Verify panel content, shared between the mobile sheet and the desktop overlay.
  //
  // This is a plain JSX value, NOT a component. Declaring it as `const X = () => ...`
  // inside the render made React see a brand new component type on every keystroke,
  // so the manual-code input was unmounted and remounted after every character
  // (losing focus) and an in-progress QR scan was torn down.
  const verifyContent = (
    <div className="flex flex-col gap-6">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <p className="text-red-600 text-xs font-bold uppercase tracking-widest">{error}</p>
        </div>
      )}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
      <div>
        <h3 className="font-bold uppercase tracking-widest text-[10px] md:text-xs mb-4 flex items-center justify-between">
          Scan to Verify
          <a href={window.location.href} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-neutral-400 hover:text-neutral-900 transition-colors flex items-center gap-1">
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
          <button onClick={() => handleVerify(manualCode, 'manual')} disabled={verifying || !manualCode}
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

      {settings?.gamePaused && (
        <div className="fixed top-16 md:top-20 inset-x-0 z-20 bg-red-500 text-white text-center py-2 px-4">
          <p className="text-[10px] font-black uppercase tracking-widest">Game Paused -- Visit verification is temporarily disabled</p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center gap-3 mb-2 md:mb-10 shrink-0">
        <div>
          <h2 className="font-serif italic text-3xl md:text-5xl leading-none mb-0.5">Your Board</h2>
          <p className="text-[9px] md:text-xs text-neutral-400 uppercase tracking-[0.2em] font-bold flex items-center gap-2">
            <MapPin size={10} /> {user.town || 'Global'} Edition
            {completions.length > 0 && (
              <span className="bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full text-[10px] font-black normal-case tracking-normal">{completions.length} done</span>
            )}
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
              disabled={regenerating}
              aria-label="Generate a new board"
              title="Generate a new board"
              className="bg-white border border-neutral-200 text-neutral-900 p-2.5 rounded-2xl hover:border-neutral-900 transition-all shadow-sm disabled:opacity-50">
              <RefreshCw size={14} className={regenerating ? 'animate-spin' : undefined} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {incomplete && (
        <div role="status" className="shrink-0 mb-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5">
          <p className="text-[11px] text-amber-800 leading-snug">
            <span className="font-bold">{emptyCount} {emptyCount === 1 ? 'square is' : 'squares are'} still open.</span>{' '}
            The Chamber is adding more businesses near {user.town || 'you'}. Lines
            through an open square cannot be completed yet, so aim for the filled ones.
          </p>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <div
          role="group"
          aria-label={`Bingo board, ${size} by ${size}. ${completions.length} of ${board.filter(c => c !== 'FREE' && c !== 'EMPTY').length} businesses visited.`}
          className="grid gap-1.5 md:gap-3"
          style={{
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridAutoRows: '1fr',
            width: 'min(calc(100vw - 2rem), calc(100dvh - 16rem))',
            height: 'min(calc(100vw - 2rem), calc(100dvh - 16rem))',
          }}
        >
          {board.map((bizId, idx) => {
            if (bizId === 'FREE') {
              return (
                <div key="free"
                  aria-label={`Free space: ${settings.freeSpaceName}. Already counted.`}
                  className="bg-orange-50 border-2 border-orange-200 rounded-xl md:rounded-3xl flex flex-col items-center justify-center text-center p-1 shadow-sm relative overflow-hidden group">
                  <div className="absolute inset-0 bg-orange-100/50 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                  <Trophy className="text-orange-500 mb-1 relative z-10 w-5 h-5 md:w-8 md:h-8" aria-hidden="true" />
                  <p className="text-[9px] md:text-sm font-black text-orange-900 uppercase tracking-tighter relative z-10 leading-none px-1">{settings.freeSpaceName}</p>
                  <p className="text-[10px] md:text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-0.5 relative z-10 opacity-60 px-1 leading-tight hidden sm:block">{settings.freeSpaceTask}</p>
                </div>
              );
            }

            if (bizId === 'EMPTY') {
              return (
                <div
                  key={idx}
                  className="rounded-xl md:rounded-3xl bg-neutral-50 border border-dashed border-neutral-300 flex items-center justify-center p-1"
                  aria-label="Empty square. Not enough businesses in your town to fill this one, so it cannot be completed."
                >
                  <span className="text-[10px] md:text-xs text-neutral-500 font-bold uppercase tracking-wider text-center leading-tight">
                    Coming<br />soon
                  </span>
                </div>
              );
            }

            const biz = businesses.find(b => b.id === bizId);
            const isDone = completions.some(c => c.businessId === bizId);

            return (
              <button
                key={idx}
                type="button"
                aria-pressed={isDone}
                disabled={!biz}
                aria-label={
                  biz
                    ? `${biz.name}, ${biz.town}. ${isDone ? 'Visited.' : 'Not visited yet.'} Open details.`
                    : 'Loading business'
                }
                onClick={() => {
                  if (biz) { setSelectedBusiness(biz); }
                }}
                className={`rounded-xl md:rounded-3xl flex flex-col items-center justify-center text-center transition-all relative overflow-hidden group cursor-pointer p-1 md:p-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 ${
                  isDone ? 'bg-neutral-900 text-white shadow-lg' : 'bg-white border border-neutral-100 text-neutral-900 hover:border-neutral-300 hover:shadow-sm shadow-sm'
                }`}
              >
                {isDone ? (
                  <>
                    <CheckCircle2 className="text-orange-500 mb-1 w-5 h-5 md:w-8 md:h-8 shrink-0" aria-hidden="true" />
                    <p className="text-[9px] md:text-sm font-bold uppercase tracking-tighter leading-tight line-clamp-2 px-1">{biz?.name || 'Unknown'}</p>
                  </>
                ) : (
                  <>
                    <Store className="text-neutral-200 mb-1 group-hover:text-neutral-400 transition-colors w-5 h-5 md:w-8 md:h-8 shrink-0" aria-hidden="true" />
                    <p className="text-[9px] md:text-sm font-bold uppercase tracking-tighter leading-tight line-clamp-2 px-1">{biz?.name || '...'}</p>
                    <p className="text-[10px] md:text-[10px] text-neutral-500 font-medium uppercase tracking-widest mt-0.5 hidden sm:block">{biz?.town}</p>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Verify -- bottom sheet on mobile, overlay on desktop */}
      <AnimatePresence>
        {showManual && !isDesktop && (
          <>
            {/* Mobile: bottom sheet */}
            <motion.div
              key="mobile-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-white rounded-t-[2rem] shadow-2xl border-t border-neutral-200 p-6 pb-28 mb-safe overflow-y-auto max-h-[85dvh]"
            >
              <div className="w-10 h-1 bg-neutral-200 rounded-full mx-auto mb-6" />
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-serif italic text-2xl">Verify Visit</h3>
                <button onClick={() => { setShowManual(false); stopScanning(); setError(null); }}
                  className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors">
                  <X size={20} />
                </button>
              </div>
              {verifyContent}
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
          </>
        )}

        {/* Desktop: inline overlay on board */}
        {showManual && isDesktop && (
          <motion.div
            key="desktop-overlay"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-8 rounded-[2.5rem] shadow-2xl border border-neutral-200 overflow-y-auto"
          >
            {verifyContent}
          </motion.div>
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
              ref={businessModalRef}
              role="dialog"
              aria-modal="true"
              aria-label={selectedBusiness.name}
              tabIndex={-1}
              initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-t-[2.5rem] md:rounded-[3rem] overflow-hidden shadow-2xl relative focus:outline-none"
              style={{ maxHeight: '90dvh' }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setSelectedBusiness(null)}
                className="absolute top-5 right-5 z-10 bg-white/80 backdrop-blur-md p-2.5 rounded-full text-neutral-900 hover:bg-white transition-all shadow-lg">
                <X size={20} />
              </button>

              <div className="overflow-y-auto" style={{ maxHeight: '90dvh' }}>
                <div className="h-48 md:h-64 relative shrink-0">
                  {selectedBusiness.image ? (
                    <img
                      src={selectedBusiness.image}
                      alt={selectedBusiness.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    // Businesses without a photo previously fell back to a random
                    // picsum.photos image: an unrelated stranger's photograph shown
                    // on a member business's square, fetched from a third party and
                    // broken offline. A branded placeholder is the honest option.
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)' }}
                    >
                      <Store className="text-white/70" size={56} aria-hidden="true" />
                    </div>
                  )}
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

      {/* Bingo raffle banner -- fixed so it never pushes layout */}
      {hasBingo && settings.raffleEnabled && (
        <motion.div
          initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-24 inset-x-4 md:inset-x-auto md:bottom-8 md:right-8 md:left-auto md:w-80 bg-orange-500 text-white p-5 rounded-[2rem] text-center shadow-2xl z-30 overflow-hidden"
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
        <p className="text-center text-[10px] text-neutral-500 uppercase tracking-[0.3em] font-bold">
          {settings?.chamberName || 'Hudson Valley Gateway Chamber of Commerce'}
        </p>
      </footer>
    </div>
  );
};
