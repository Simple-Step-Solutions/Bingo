import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, AppSettings } from './types';

// Pages
import { Dashboard } from './pages/Dashboard';
import { Admin } from './pages/Admin';
import { Raffle } from './pages/Raffle';
import { Map } from './pages/Map';
import { BusinessDashboard } from './pages/Business';
import { Auth } from './pages/Auth';

// Components
import { Navbar } from './components/layout/Navbar';
import { LoadingScreen } from './components/layout/LoadingScreen';
import { LocationTracker } from './components/LocationTracker';
import { trackActivity } from './services/activityService';

function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Listen to user profile changes
        const userRef = doc(db, 'users', firebaseUser.uid);
        const unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserProfile;
            setUser(userData);
            // Track app open once per session or periodically
            trackActivity(firebaseUser.uid, 'open_app');
          } else {
            setUser(null);
          }
        });

        // Listen to global settings
        const settingsRef = doc(db, 'settings', 'global');
        const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
          if (docSnap.exists()) {
            setSettings(docSnap.data() as AppSettings);
          }
          setLoading(false);
        });

        return () => {
          unsubscribeProfile();
          unsubscribeSettings();
        };
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) return <LoadingScreen />;

  if (!user) return <Auth onAuthSuccess={() => {}} />;

  return (
    <Router>
      <div className="min-h-screen bg-[#F5F5F0] pb-24 md:pb-0 md:pt-20">
        <LocationTracker user={user} />
        <Navbar user={user} settings={settings} />
        
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
            <Route path="/map" element={<Map user={user} />} />
            {settings?.raffleEnabled && (
              <Route path="/raffle" element={<Raffle user={user} />} />
            )}
            
            {/* Role-protected routes */}
            {(user.role === 'admin' || user.role === 'chamber') && (
              <Route path="/admin/*" element={<Admin user={user} />} />
            )}
            
            {(user.role === 'chamber' || user.role === 'business') && (
              <Route path="/business" element={<BusinessDashboard user={user} />} />
            )}
            
            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="container mx-auto px-6 py-12 border-t border-neutral-200 mt-12 mb-24 md:mb-0">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-neutral-200 rounded-2xl flex items-center justify-center text-neutral-400 font-bold text-[10px] uppercase tracking-widest">Logo</div>
              <div className="w-12 h-12 bg-neutral-200 rounded-2xl flex items-center justify-center text-neutral-400 font-bold text-[10px] uppercase tracking-widest">Logo</div>
              <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-4">Official Partners</p>
            </div>
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
              © 2026 Chamber of Commerce • All Rights Reserved
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
