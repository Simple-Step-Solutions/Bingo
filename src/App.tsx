import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, sendEmailVerification } from 'firebase/auth';
import { doc, collection, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, AppSettings, Business, Town } from './types';

// Pages
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { Raffle } from './pages/Raffle';
import { Map } from './pages/Map';
import { BusinessDashboard } from './pages/Business';
import { Auth } from './pages/Auth';
import { Profile } from './pages/Profile';

// Components
import { Navbar } from './components/layout/Navbar';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { LocationTracker } from './components/LocationTracker';
import { SetupWizard, SetupPending } from './components/SetupWizard';
import { InstallPrompt } from './components/InstallPrompt';
import { ChamberTour } from './components/tour/ChamberTour';
import { BusinessTour } from './components/tour/BusinessTour';
import { RoleSelector } from './components/RoleSelector';
import { usePushNotifications } from './hooks/usePushNotifications';

const DEFAULT_PRIMARY = '#1695B2';
const DEFAULT_ACCENT = '#CC5500';

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsExist, setSettingsExist] = useState<boolean | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTour, setShowTour] = useState(false);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const verifyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { showPrompt: showNotifPrompt, requestPermission, dismissPrompt } = usePushNotifications(user?.uid);

  useEffect(() => {
    const primary = settings?.primaryColor || DEFAULT_PRIMARY;
    const accent = settings?.accentColor || DEFAULT_ACCENT;
    document.documentElement.style.setProperty('--color-primary', primary);
    document.documentElement.style.setProperty('--color-accent', accent);
  }, [settings?.primaryColor, settings?.accentColor]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    let unsubscribeSettings: (() => void) | null = null;
    let unsubscribeBusinesses: (() => void) | null = null;
    let unsubscribeTowns: (() => void) | null = null;

    const cleanupListeners = () => {
      unsubscribeProfile?.();
      unsubscribeSettings?.();
      unsubscribeBusinesses?.();
      unsubscribeTowns?.();
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      cleanupListeners();

      if (firebaseUser) {
        setLoading(true);
        // Gate email/password users until they verify their address
        const isEmailUser = firebaseUser.providerData.some(p => p.providerId === 'password');
        if (isEmailUser && !firebaseUser.emailVerified) {
          setNeedsEmailVerification(true);
          setLoading(false);
          // Poll every 4 seconds until verified
          verifyPollRef.current = setInterval(async () => {
            await firebaseUser.reload();
            if (auth.currentUser?.emailVerified) {
              clearInterval(verifyPollRef.current!);
              window.location.reload();
            }
          }, 4000);
          return;
        }
        setNeedsEmailVerification(false);

        let profileReady = false;
        let settingsReady = false;
        const checkReady = () => {
          if (profileReady && settingsReady) setLoading(false);
        };

        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;
            setUser(profile);
            if (!profileReady) {
              profileReady = true;
              checkReady();
              // Show tour for chamber/business users who just selected their role (roleSelected just became true)
              // or existing users who haven't completed the tour
              if ((profile.role === 'chamber' || profile.role === 'business') && !profile.tourCompleted && profile.roleSelected) {
                setShowTour(true);
              }
            }
          } else if (!profileReady) {
            // New user -- create minimal profile, RoleSelector will handle role assignment
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || '',
              role: 'player',
              roleSelected: false,
              town: '',
            }).catch(err => {
              console.error('Failed to create user profile:', err);
              profileReady = true;
              checkReady();
            });
          }
        }, (err) => {
          console.error('User profile snapshot error:', err);
          profileReady = true;
          checkReady();
        });

        unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
          if (docSnap.exists()) {
            setSettings(docSnap.data() as AppSettings);
            setSettingsExist(true);
          } else {
            setSettingsExist(false);
          }
          settingsReady = true;
          checkReady();
        }, (err) => {
          console.error('Settings snapshot error:', err);
          settingsReady = true;
          checkReady();
        });

        unsubscribeBusinesses = onSnapshot(collection(db, 'businesses'), (snap) => {
          setBusinesses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Business)));
        }, (err) => console.error('Businesses snapshot error:', err));

        unsubscribeTowns = onSnapshot(collection(db, 'towns'), (snap) => {
          setTowns(snap.docs.map(d => ({ id: d.id, ...d.data() } as Town)));
        }, (err) => console.error('Towns snapshot error:', err));
      } else {
        if (verifyPollRef.current) clearInterval(verifyPollRef.current);
        setNeedsEmailVerification(false);
        setUser(null);
        setSettings(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupListeners();
    };
  }, []);

  // When roleSelected flips to true, trigger tour for non-player roles
  useEffect(() => {
    if (user?.roleSelected && (user.role === 'chamber' || user.role === 'business') && !user.tourCompleted) {
      setShowTour(true);
    }
  }, [user?.roleSelected]);

  if (loading) return <LoadingScreen />;

  if (needsEmailVerification) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-8 shadow-xl border border-neutral-100 text-center">
          <div className="w-16 h-16 bg-[var(--color-primary)]/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[var(--color-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--color-primary)] mb-2">Almost there</p>
          <h2 className="font-serif italic text-3xl mb-3">Check your email</h2>
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
            We sent a verification link to <strong className="text-neutral-900">{auth.currentUser?.email}</strong>. Click the link to activate your account. If you don't see it, check your spam folder.
          </p>
          <div className="space-y-3">
            <button
              onClick={async () => {
                if (auth.currentUser) await sendEmailVerification(auth.currentUser);
              }}
              className="w-full border border-neutral-200 text-neutral-700 py-3 rounded-2xl text-sm font-bold hover:border-neutral-400 transition-all"
            >
              Resend verification email
            </button>
            <button
              onClick={() => { if (verifyPollRef.current) clearInterval(verifyPollRef.current); auth.signOut(); }}
              className="w-full text-neutral-400 py-2 text-xs font-bold uppercase tracking-widest hover:text-neutral-600 transition-colors"
            >
              Sign out
            </button>
          </div>
          <p className="text-[9px] text-neutral-300 uppercase tracking-widest mt-6">This page will update automatically once verified</p>
        </div>
      </div>
    );
  }

  if (!user) return <Auth onAuthSuccess={() => {}} />;

  // Settings doc missing -- admin sees setup wizard, everyone else sees holding screen
  if (settingsExist === false) {
    return (user.role === 'admin' || user.email === 'logan@simplestepsolutions.com')
      ? <SetupWizard />
      : <SetupPending />;
  }

  // New user hasn't selected their role yet
  if (user.roleSelected === false) {
    return <RoleSelector user={user} />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-[#F5F5F0] pb-24 md:pb-0 md:pt-20">
        <LocationTracker user={user} />
        <Navbar user={user} settings={settings} />

        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} businesses={businesses} towns={towns} settings={settings} />} />
            <Route path="/map" element={<Map user={user} businesses={businesses} />} />
            {settings?.raffleEnabled && (
              <Route path="/raffle" element={<Raffle user={user} />} />
            )}

            {/* Role-protected routes */}
            {(user.role === 'admin' || user.role === 'chamber') && (
              <Route path="/admin/*" element={<Admin user={user} businesses={businesses} towns={towns} settings={settings} />} />
            )}

            {(user.role === 'chamber' || user.role === 'business') && (
              <Route path="/business" element={<BusinessDashboard user={user} />} />
            )}

            <Route path="/profile" element={<Profile user={user} />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="hidden md:block container mx-auto px-6 py-10 border-t border-neutral-200 mt-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-1">
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                {settings?.chamberName || 'Hudson Valley Gateway Chamber of Commerce'}
              </p>
              <p className="text-[10px] text-neutral-300 uppercase tracking-widest font-bold">
                &copy; 2026 All Rights Reserved
              </p>
              <p className="text-[9px] text-neutral-300 uppercase tracking-widest font-bold">
                v{__APP_VERSION__}
              </p>
            </div>
            <a
              href="https://www.simplestepsolutions.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 group shrink-0"
            >
              <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold group-hover:text-neutral-600 transition-colors">Powered by</span>
              <img src="/sss-logo.png" alt="Simple Step Solutions" className="h-5 w-auto opacity-50 group-hover:opacity-100 transition-opacity" />
              <span className="text-[10px] font-bold uppercase tracking-widest group-hover:opacity-80 transition-opacity" style={{ color: '#1695B2' }}>Simple Step Solutions</span>
            </a>
          </div>
        </footer>
        <InstallPrompt />
{showNotifPrompt && (
          <div className="fixed bottom-24 md:bottom-6 inset-x-0 mx-4 md:mx-auto md:max-w-sm z-[90] bg-neutral-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-widest leading-tight">Enable notifications to stay updated</p>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={requestPermission} className="bg-white text-neutral-900 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-neutral-100 transition-all">Enable</button>
              <button onClick={dismissPrompt} className="text-neutral-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest">Later</button>
            </div>
          </div>
        )}
        {showTour && user?.role === 'chamber' && (
          <ChamberTour
            chamberName={settings?.chamberName}
            onComplete={async () => {
              setShowTour(false);
              await setDoc(doc(db, 'users', user.uid), { tourCompleted: true }, { merge: true });
            }}
          />
        )}
        {showTour && user?.role === 'business' && (
          <BusinessTour
            businessName={businesses.find(b => b.id === user.businessId)?.name}
            onComplete={async () => {
              setShowTour(false);
              await setDoc(doc(db, 'users', user.uid), { tourCompleted: true }, { merge: true });
            }}
          />
        )}
      </div>
    </Router>
  );
}

export default App;
