import React, { useState } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '../firebase';
import { ShieldCheck, Gamepad2, Store, LayoutGrid, Loader2, Mail, Lock, User, ChevronRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthProps {
  onAuthSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'social' | 'email-signin' | 'email-signup' | 'forgot-password' | 'verify-email'>('social');
  const [resetSent, setResetSent] = useState(false);
  
  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  // Mobile browsers handle popups poorly; desktop Chrome has storage-partitioning
  // issues with signInWithRedirect. Use popup on mobile, redirect on desktop.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      if (isMobile) {
        await signInWithPopup(auth, provider);
        // onAuthStateChanged in App.tsx handles the rest
      } else {
        sessionStorage.setItem('authRedirectPending', '1');
        await signInWithRedirect(auth, provider);
      }
    } catch (err: any) {
      console.error('Google Auth error:', err);
      sessionStorage.removeItem('authRedirectPending');
      setError(err.message || 'Failed to sign in with Google.');
      setLoading(false);
    }
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new OAuthProvider('microsoft.com');
      if (isMobile) {
        await signInWithPopup(auth, provider);
      } else {
        sessionStorage.setItem('authRedirectPending', '1');
        await signInWithRedirect(auth, provider);
      }
    } catch (err: any) {
      console.error('Microsoft Auth error:', err);
      sessionStorage.removeItem('authRedirectPending');
      setError(err.message || 'Failed to sign in with Microsoft.');
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged in App.tsx handles navigation
    } catch (err: any) {
      console.error('Email sign in error:', err);
      setError('Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email.');
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
      await sendEmailVerification(result.user);
      setAuthMode('verify-email');
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
          <div className="inline-block bg-[var(--color-primary)] p-4 rounded-3xl mb-6 shadow-2xl">
            <LayoutGrid className="text-white" size={48} />
          </div>
          <h1 className="font-serif italic text-6xl mb-3">Chamber Bingo</h1>
          <p className="text-[var(--color-primary)] uppercase tracking-[0.2em] font-bold text-[10px] mb-1">Hudson Valley Gateway</p>
          <p className="text-neutral-400 uppercase tracking-[0.3em] font-bold text-[10px]">Chamber of Commerce</p>
        </div>

        <div className="bg-white rounded-[3rem] p-10 shadow-xl border border-neutral-100">
          <AnimatePresence mode="wait">
            {authMode === 'verify-email' ? (
              <motion.div
                key="verify-email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-center"
              >
                <div className="inline-block bg-[var(--color-primary)] p-4 rounded-3xl mb-6">
                  <Mail className="text-white" size={32} />
                </div>

                <h2 className="font-serif italic text-3xl mb-3">Check your inbox</h2>
                <p className="text-neutral-500 mb-8 text-sm leading-relaxed">
                  We sent a verification link to <span className="font-semibold text-neutral-700">{email}</span>. Click the link then come back and sign in.
                </p>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest mb-6">{error}</div>
                )}

                <div className="space-y-4">
                  <button
                    onClick={async () => {
                      setError(null);
                      try {
                        const currentUser = auth.currentUser;
                        if (currentUser) await sendEmailVerification(currentUser);
                      } catch (err: any) {
                        setError(err.message || 'Failed to resend verification email.');
                      }
                    }}
                    className="w-full bg-[var(--color-primary)] text-white py-5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
                  >
                    Resend Email
                  </button>

                  <button
                    onClick={() => { setAuthMode('email-signin'); setError(null); }}
                    className="w-full text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:text-neutral-900 transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              </motion.div>
            ) : authMode === 'forgot-password' ? (
              <motion.div
                key="forgot"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <button
                  onClick={() => { setAuthMode('email-signin'); setError(null); setResetSent(false); }}
                  className="flex items-center gap-2 text-neutral-400 hover:text-neutral-900 transition-colors mb-8 group"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                </button>

                <h2 className="font-serif italic text-3xl mb-2">Reset Password</h2>
                <p className="text-neutral-500 mb-8 text-sm">Enter your email and we'll send you a reset link.</p>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest mb-6">{error}</div>
                )}

                {resetSent ? (
                  <div className="bg-green-50 text-green-700 p-6 rounded-2xl text-center">
                    <p className="font-bold text-sm mb-1">Check your inbox</p>
                    <p className="text-[10px] uppercase tracking-widest font-bold">A reset link has been sent to {email}</p>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset} className="space-y-4">
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
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-[var(--color-primary)] text-white py-5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="animate-spin" size={20} /> : 'Send Reset Link'}
                    </button>
                  </form>
                )}
              </motion.div>
            ) : authMode === 'social' ? (
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
                    className="w-full bg-[var(--color-primary)] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[var(--color-primary)] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
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
                    className="w-full bg-[var(--color-primary)] text-white py-5 rounded-2xl font-bold text-sm hover:bg-[var(--color-primary)] transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : (
                      <>
                        {authMode === 'email-signin' ? 'Sign In' : 'Create Account'}
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setAuthMode(authMode === 'email-signin' ? 'email-signup' : 'email-signin');
                      setError(null);
                    }}
                    className="w-full text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:text-neutral-900 transition-colors"
                  >
                    {authMode === 'email-signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </button>
                  {authMode === 'email-signin' && (
                    <button
                      onClick={() => { setAuthMode('forgot-password'); setError(null); setResetSent(false); }}
                      className="w-full text-[10px] font-bold text-neutral-300 uppercase tracking-widest hover:text-neutral-600 transition-colors"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
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

        <a
          href="https://www.simplestepsolutions.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-12 group"
        >
          <span className="text-[10px] text-neutral-400 uppercase tracking-[0.2em] font-bold group-hover:text-neutral-600 transition-colors">Powered by</span>
          <img src="/sss-logo.png" alt="Simple Step Solutions" className="h-5 w-auto opacity-60 group-hover:opacity-100 transition-opacity" />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] group-hover:text-neutral-600 transition-colors" style={{ color: '#1695B2' }}>Simple Step Solutions</span>
        </a>
      </div>
    </div>
  );
};
