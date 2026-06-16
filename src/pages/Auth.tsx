import React, { useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  OAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ShieldCheck, Gamepad2, Store, LayoutGrid, Loader2, Mail, Lock, User, ChevronRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthProps {
  onAuthSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'social' | 'email-signin' | 'email-signup'>('social');
  
  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleAuthResult = async (user: any) => {
    // Check if user exists in Firestore
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Create new user profile
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || displayName,
        role: 'player',
        town: '' // Let them select town on first login
      });
    }
    onAuthSuccess();
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await handleAuthResult(result.user);
    } catch (err: any) {
      console.error('Google Auth error:', err);
      setError(err.message || 'Failed to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new OAuthProvider('microsoft.com');
      // Optional: Add scopes for M365
      provider.addScope('mail.read');
      provider.addScope('calendars.read');
      const result = await signInWithPopup(auth, provider);
      await handleAuthResult(result.user);
    } catch (err: any) {
      console.error('Microsoft Auth error:', err);
      setError(err.message || 'Failed to sign in with Microsoft.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthResult(result.user);
    } catch (err: any) {
      console.error('Email sign in error:', err);
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) {
      setError('Please enter your name.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(result.user, { displayName });
      await handleAuthResult(result.user);
    } catch (err: any) {
      console.error('Email sign up error:', err);
      setError(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <div className="max-w-md w-full">
        <div className="text-center mb-12">
          <div className="inline-block bg-[#1695B2] p-4 rounded-3xl mb-6 shadow-2xl">
            <LayoutGrid className="text-white" size={48} />
          </div>
          <h1 className="font-serif italic text-6xl mb-3">Chamber Bingo</h1>
          <p className="text-[#1695B2] uppercase tracking-[0.2em] font-bold text-[10px] mb-1">Hudson Valley Gateway</p>
          <p className="text-neutral-400 uppercase tracking-[0.3em] font-bold text-[10px]">Chamber of Commerce</p>
        </div>

        <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-neutral-100">
          <AnimatePresence mode="wait">
            {authMode === 'social' ? (
              <motion.div
                key="social"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="text-center"
              >
                <h2 className="font-serif italic text-3xl mb-4">Welcome</h2>
                <p className="text-neutral-500 mb-10 leading-relaxed text-sm">
                  Join the community and support local businesses while playing bingo!
                </p>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest mb-6">
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <button
                    onClick={signInWithGoogle}
                    disabled={loading}
                    className="w-full bg-white border border-neutral-200 text-neutral-900 py-5 rounded-2xl font-bold text-sm hover:border-neutral-900 transition-all shadow-sm flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                    Continue with Google
                  </button>

                  <button
                    onClick={signInWithMicrosoft}
                    disabled={loading}
                    className="w-full bg-white border border-neutral-200 text-neutral-900 py-5 rounded-2xl font-bold text-sm hover:border-neutral-900 transition-all shadow-sm flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    <img src="https://www.microsoft.com/favicon.ico" alt="Microsoft" className="w-5 h-5" />
                    Continue with Microsoft
                  </button>

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[8px] uppercase tracking-[0.3em] font-black">
                      <span className="bg-white px-4 text-neutral-300">Or</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setAuthMode('email-signin')}
                    className="w-full bg-[#1695B2] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[#1282a0] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Mail size={18} />
                    Continue with Email
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <button 
                  onClick={() => {
                    setAuthMode('social');
                    setError(null);
                  }}
                  className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors mb-8 group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                </button>

                <h2 className="font-serif italic text-3xl mb-2">
                  {authMode === 'email-signin' ? 'Sign In' : 'Create Account'}
                </h2>
                <p className="text-neutral-500 mb-8 text-sm">
                  {authMode === 'email-signin' ? 'Enter your details to continue playing.' : 'Join the community and start playing.'}
                </p>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest mb-6">
                    {error}
                  </div>
                )}

                <form onSubmit={authMode === 'email-signin' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                  {authMode === 'email-signup' && (
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                      <input 
                        type="text"
                        placeholder="Full Name"
                        required
                        value={displayName}
                        onChange={e => setDisplayName(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                      />
                    </div>
                  )}
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                    <input 
                      type="email"
                      placeholder="Email Address"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                    />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300" size={18} />
                    <input 
                      type="password"
                      placeholder="Password"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-neutral-50 border border-neutral-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-neutral-900 transition-all outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#1695B2] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[#1282a0] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : (
                      <>
                        {authMode === 'email-signin' ? 'Sign In' : 'Create Account'}
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </form>

                <button 
                  onClick={() => {
                    setAuthMode(authMode === 'email-signin' ? 'email-signup' : 'email-signin');
                    setError(null);
                  }}
                  className="w-full mt-6 text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:text-neutral-900 transition-colors"
                >
                  {authMode === 'email-signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-2">
              <div className="bg-neutral-50 p-3 rounded-2xl text-neutral-400">
                <Gamepad2 size={20} />
              </div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">Play</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-neutral-50 p-3 rounded-2xl text-neutral-400">
                <Store size={20} />
              </div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">Visit</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="bg-neutral-50 p-3 rounded-2xl text-neutral-400">
                <ShieldCheck size={20} />
              </div>
              <span className="text-[8px] font-bold uppercase tracking-widest text-neutral-400">Win</span>
            </div>
          </div>
        </div>

        <p className="text-center mt-12 text-[10px] text-neutral-400 uppercase tracking-[0.2em] font-bold">
          A Hudson Valley Gateway Chamber Initiative
        </p>
      </div>
    </div>
  );
};
