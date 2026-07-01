import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '../firebase';
import { getInviteByToken } from '../services/inviteService';
import { ShieldCheck, Gamepad2, Store, LayoutGrid, Loader2, Mail, Lock, User, ChevronRight, ArrowLeft, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthProps {
  onAuthSuccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'social' | 'email-signin' | 'email-signup' | 'forgot-password' | 'verify-email'>('social');
  const [resetSent, setResetSent] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<'player' | 'business' | 'chamber' | null>(null);
  const [registerAs, setRegisterAs] = useState<'player' | 'business' | 'chamber'>('player');
  const [inviteCode, setInviteCode] = useState('');

  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get('invite');
    const token = urlToken || localStorage.getItem('pendingInvite');
    if (!token) return;

    if (urlToken) {
      localStorage.setItem('pendingInvite', urlToken);
      // Strip the invite param from the URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    }
    setInviteToken(token);

    // Pre-fill and lock role, email, and code from the invite
    getInviteByToken(token).then(invite => {
      if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) return;
      setInviteRole(invite.role);
      setRegisterAs(invite.role);
      setInviteCode(token);
      if (invite.emailHint) setEmail(invite.emailHint);
    }).catch(() => {});
  }, []);

  const validateInviteCode = async (): Promise<boolean> => {
    // If no invite token at all and registering as player, no validation needed
    if (registerAs === 'player' && !inviteToken && !inviteCode.trim()) return true;
    // Non-player roles always require a code
    if (registerAs !== 'player' && !inviteCode.trim()) {
      setError('Please enter the invite code you received from the Chamber.');
      return false;
    }
    const codeToCheck = inviteCode.trim() || inviteToken;
    if (!codeToCheck) return true;
    const invite = await getInviteByToken(codeToCheck);
    if (!invite || invite.used || new Date(invite.expiresAt) < new Date()) {
      setError('Invalid or expired invite code. Contact your Chamber administrator.');
      return false;
    }
    if (invite.role !== registerAs) {
      // Force the correct role rather than erroring -- the invite is authoritative
      setRegisterAs(invite.role);
    }
    // Store validated invite so App.tsx can process it post-auth
    localStorage.setItem('pendingInvite', codeToCheck);
    return true;
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const valid = await validateInviteCode();
    if (!valid) { setLoading(false); return; }
    if (registerAs !== 'player') localStorage.setItem('pendingBusinessRole', registerAs);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged in App.tsx handles navigation
    } catch (err: any) {
      console.error('Google Auth error:', err);
      setError(err.message || 'Failed to sign in with Google.');
      setLoading(false);
    }
  };

  const signInWithMicrosoft = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new OAuthProvider('microsoft.com');
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Microsoft Auth error:', err);
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
    const valid = await validateInviteCode();
    if (!valid) { setLoading(false); return; }
    if (registerAs !== 'player') localStorage.setItem('pendingBusinessRole', registerAs);
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

        <div className="bg-white rounded-[3rem] p-8 shadow-xl border border-neutral-100">
          {inviteToken && (
            <div className="bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 rounded-2xl p-4 mb-6 flex items-center gap-3">
              <div className="w-8 h-8 bg-[var(--color-primary)] rounded-xl flex items-center justify-center shrink-0">
                <Link2 className="text-white" size={14} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]">You've been invited</p>
                <p className="text-xs text-neutral-600 mt-0.5">Sign in or create an account to accept your invitation.</p>
              </div>
            </div>
          )}
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
                    onClick={() => setAuthMode('email-signin')}
                    className="w-full bg-neutral-900 text-white py-5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Mail size={18} />
                    Continue with Email
                  </button>

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[8px] uppercase tracking-[0.3em] font-black">
                      <span className="bg-white px-4 text-neutral-300">Or</span>
                    </div>
                  </div>

                  <button
                    onClick={signInWithGoogle}
                    disabled={loading}
                    className="w-full bg-white border border-neutral-200 text-neutral-600 py-4 rounded-2xl font-bold text-sm hover:border-neutral-400 transition-all shadow-sm flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                    Continue with Google
                  </button>

                  {/* Role selector */}
                  <div className="border border-neutral-100 rounded-2xl p-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3">I am registering as...</p>
                    {([
                      { value: 'player', label: 'A Player', sub: 'Discover local businesses & play bingo' },
                      { value: 'business', label: 'A Participating Business', sub: 'Manage my QR code & track visitors' },
                      { value: 'chamber', label: 'Chamber Staff', sub: 'Manage the game & participants' },
                    ] as const).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => { if (!inviteRole) setRegisterAs(opt.value); }}
                        disabled={!!inviteRole && inviteRole !== opt.value}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left disabled:opacity-30 disabled:cursor-not-allowed ${
                          registerAs === opt.value
                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                            : 'border-transparent hover:border-neutral-200'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                          registerAs === opt.value ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-neutral-300'
                        }`}>
                          {registerAs === opt.value && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        <div>
                          <p className={`text-xs font-bold ${registerAs === opt.value ? 'text-[var(--color-primary)]' : 'text-neutral-700'}`}>{opt.label}</p>
                          <p className="text-[9px] text-neutral-400">{opt.sub}</p>
                        </div>
                      </button>
                    ))}

                    {registerAs !== 'player' && (
                      <div className="pt-3 border-t border-neutral-100 mt-2">
                        <label className="block text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-2">
                          Invite Code <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Paste your invite code..."
                          value={inviteCode}
                          onChange={e => setInviteCode(e.target.value)}
                          className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-neutral-900 outline-none transition-all"
                        />
                        <p className="text-[9px] text-neutral-400 mt-1.5">Get this from your Chamber administrator.</p>
                      </div>
                    )}
                  </div>
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

          <div className="mt-8 pt-8 border-t border-neutral-100">
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 bg-neutral-900 rounded-2xl flex items-center justify-center">
                  <Gamepad2 className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-900">Play</p>
                  <p className="text-[8px] text-neutral-400 leading-tight mt-0.5">Fill your board</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                  <Store className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-900">Visit</p>
                  <p className="text-[8px] text-neutral-400 leading-tight mt-0.5">Local shops</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-accent)' }}>
                  <ShieldCheck className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-900">Win</p>
                  <p className="text-[8px] text-neutral-400 leading-tight mt-0.5">Chamber prizes</p>
                </div>
              </div>
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
