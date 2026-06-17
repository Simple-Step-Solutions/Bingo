import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
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
import { trackActivity } from './services/activityService';
import { SetupWizard, SetupPending } from './components/SetupWizard';
import { InstallPrompt } from './components/InstallPrompt';

const DEFAULT_PRIMARY = '#1695B2';
const DEFAULT_ACCENT = '#CC5500';

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsExist, setSettingsExist] = useState<boolean | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [towns, setTowns] = useState<Town[]>([]);
  const [loading, setLoading] = useState(true);

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
      // Always clean up previous listeners on auth change
      cleanupListeners();

      if (firebaseUser) {
        // Show loading screen immediately while snapshots resolve
        setLoading(true);
        trackActivity(firebaseUser.uid, 'open_app');

        let profileReady = false;
        let settingsReady = false;
        const checkReady = () => {
          if (profileReady && settingsReady) setLoading(false);
        };

        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), async (docSnap) => {
          if (docSnap.exists()) {
            setUser(docSnap.data() as UserProfile);
            if (!profileReady) {
              profileReady = true;
              checkReady();
            }
          } else if (!profileReady) {
            // New user -- create profile, then wait for the next snapshot fire
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || '',
              role: 'player',
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

  if (loading) return <LoadingScreen />;

  if (!user) return <Auth onAuthSuccess={() => {}} />;

  // Settings doc missing -- admin sees setup wizard, everyone else sees holding screen
  if (settingsExist === false) {
    return (user.role === 'admin' || user.email === 'logan@simplestepsolutions.com')
      ? <SetupWizard />
      : <SetupPending />;
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

        <footer className="container mx-auto px-6 py-10 border-t border-neutral-200 mt-12 mb-24 md:mb-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col items-center md:items-start gap-1">
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                {settings?.chamberName || 'Hudson Valley Gateway Chamber of Commerce'}
              </p>
              <p className="text-[10px] text-neutral-300 uppercase tracking-widest font-bold">
                &copy; 2026 All Rights Reserved
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
      </div>
    </Router>
  );
}

export default App;
