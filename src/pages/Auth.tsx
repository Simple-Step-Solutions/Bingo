import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification
} from 'firebase/auth';
import { auth } from '../firebase';
import { ShieldCheck, Gamepad2, Store, LayoutGrid, Loader2, Mail, Lock, User, ChevronRight, ArrowLeft, Link2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InstallButton } from '../components/InstallButton';
import { OpenInBrowser } from '../components/OpenInBrowser';
import { currentBrowser } from '../lib/browserEnv';
import { reportIssue, errorParts, type IssueKind, type IssueDetails } from '../lib/clientLog';
import { friendlyAuthError, shouldRetryWithRedirect, emailAuthError, type EmailAuthError } from '../lib/authErrors';

interface AuthProps {
  onAuthSuccess: () => void;
}

interface ErrorInfo { ref: string; code?: string; switchTo?: EmailAuthError['switchTo'] }

export const Auth: React.FC<AuthProps> = () => {
  const [loading, setLoading] = useState(false);
  const [error, setErrorText] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [browser] = useState(currentBrowser);
  const [authMode, setAuthMode] = useState<'social' | 'email-signin' | 'email-signup' | 'forgot-password' | 'verify-email'>('social');

  /** Plain messages (validation) carry no reference. */
  const setError = (text: string | null) => { setErrorText(text); setErrorInfo(null); };

  /**
   * A real failure: record it, then show the message with a reference and the
   * error code, so a screenshot sent to the Chamber pins down the log entry.
   */
  const fail = (kind: IssueKind, err: unknown, text: string | null, extra: IssueDetails = {}, switchTo?: EmailAuthError['switchTo']) => {
    const parts = errorParts(err);
    console.error(`${kind} error:`, err);
    const ref = reportIssue(kind, { ...parts, ...extra });
    setErrorText(text);
    setErrorInfo(text ? { ref, code: parts.code, switchTo } : null);
  };

  /** Email and password failures, with a one-tap way to the other form. */
  const failEmail = (err: unknown, mode: 'signin' | 'signup') => {
    const { text, switchTo } = emailAuthError(errorParts(err).code, mode);
    fail('auth_email', err, text, { method: mode }, switchTo);
  };

  const errorNote = error ? (
    <div className="bg-red-50 text-red-600 p-4 rounded-2xl mb-6 text-left">
      <p className="text-xs font-bold leading-relaxed">{error}</p>
      {errorInfo?.switchTo && (
        <button
          type="button"
          onClick={() => { setAuthMode(errorInfo.switchTo!); setError(null); }}
          className="mt-3 w-full bg-white border border-red-200 text-[var(--color-primary)] py-3 rounded-xl font-bold text-xs active:scale-95 transition-all"
        >
          {errorInfo.switchTo === 'email-signup' ? 'Create an account' : 'Go to Sign In'}
        </button>
      )}
      {errorInfo && (
        <p className="text-[10px] text-red-500/80 mt-2 leading-relaxed">
          If this keeps happening, take a screenshot and send it to the Chamber.
          <span className="block font-mono mt-1">Ref {errorInfo.ref}{errorInfo.code ? ` · ${errorInfo.code}` : ''}</span>
        </p>
      )}
    </div>
  ) : null;
  const [resetSent, setResetSent] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  // Email/Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('invite');
    const urlHint = params.get('hint');
    const token = urlToken || localStorage.getItem('pendingInvite');
    if (!token) return;

    if (urlToken) {
      localStorage.setItem('pendingInvite', urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    }
    setInviteToken(token);
    if (urlHint) setEmail(urlHint);
  }, []);

  // Opened inside Facebook, Instagram and the like: record it once, so the logs
  // show how many first visits land somewhere Google sign-in cannot work.
  useEffect(() => {
    if (browser.inApp) reportIssue('in_app_browser');
  }, [browser.inApp]);

  // A redirect sign-in (the fallback below) finishes on a fresh page load, and
  // its failure only surfaces here. Without this it would fail silently.
  useEffect(() => {
    getRedirectResult(auth).catch(err => {
      const { code } = errorParts(err);
      fail('auth_google', err, friendlyAuthError(code), { method: 'redirect' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    setError(null);

    if (browser.inApp) {
      // Google answers "disallowed_useragent" inside these. Do not send the
      // player into a dead end; tell them what will work.
      fail(
        'auth_google',
        { code: 'in-app-browser', message: `Google sign-in tried inside ${browser.inApp}` },
        `Google does not allow signing in inside ${browser.inApp === 'app' ? 'this app' : browser.inApp}. Open this page in ${browser.platform === 'android' ? 'Chrome' : 'Safari'} (see above), or continue with email.`,
        { method: 'blocked' },
      );
      return;
    }

    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const { code } = errorParts(err);
      if (shouldRetryWithRedirect(code)) {
        // The popup could not open or could not report back (blocked pop-ups,
        // some installed-app and private modes). A full-page redirect gets
        // past all of those. Record the popup failure first so we can see how
        // often this happens.
        reportIssue('auth_google', { ...errorParts(err), method: 'popup' });
        try {
          await signInWithRedirect(auth, provider);
          return; // The page is navigating away.
        } catch (err2) {
          fail('auth_google', err2, friendlyAuthError(errorParts(err2).code), { method: 'redirect' });
          setLoading(false);
          return;
        }
      }
      fail('auth_google', err, friendlyAuthError(code), { method: 'popup' });
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
    } catch (err) {
      failEmail(err, 'signin');
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
    } catch (err) {
      fail('auth_email', err, errorParts(err).message || 'Failed to send reset email.');
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
    } catch (err) {
      failEmail(err, 'signup');
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
                <p className="text-xs text-neutral-600 mt-0.5">
                  {authMode === 'email-signin'
                    ? 'Sign in to accept your invitation.'
                    : 'Create your account to accept your invitation. Already have one? Sign in instead.'}
                </p>
              </div>
            </div>
          )}
          {browser.inApp && (
            <OpenInBrowser
              className="mb-6"
              why={inviteToken
                ? 'Google sign-in does not work in here, and your invite needs to open in a real browser.'
                : 'Google sign-in and installing the app do not work in here.'}
            />
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

                {errorNote}

                <div className="space-y-4">
                  <button
                    onClick={async () => {
                      setError(null);
                      try {
                        const currentUser = auth.currentUser;
                        if (currentUser) await sendEmailVerification(currentUser);
                      } catch (err) {
                        fail('auth_email', err, errorParts(err).message || 'Failed to resend verification email.');
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

                {errorNote}

                {resetSent ? (
                  <div className="bg-green-50 text-green-700 p-6 rounded-2xl text-center">
                    <p className="font-bold text-sm mb-1">Check your inbox</p>
                    <p className="text-[10px] uppercase tracking-widest font-bold">A reset link has been sent to {email}</p>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordReset} className="space-y-4">
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
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

                {errorNote}

                <div className="space-y-4">
                  {/* An invite goes to someone who has no account yet, so the
                      email button opens Create Account, not Sign In. */}
                  <button
                    onClick={() => setAuthMode(inviteToken ? 'email-signup' : 'email-signin')}
                    className="w-full bg-neutral-900 text-white py-5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Mail size={18} />
                    {inviteToken ? 'Create Account with Email' : 'Continue with Email'}
                  </button>
                  {inviteToken && (
                    <button
                      onClick={() => setAuthMode('email-signin')}
                      className="w-full text-[11px] font-bold text-[var(--color-primary)] uppercase tracking-widest"
                    >
                      Already have an account? Sign In
                    </button>
                  )}

                  <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-neutral-100"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-[0.3em] font-black">
                      <span className="bg-white px-4 text-neutral-500">Or</span>
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

                {errorNote}

                <form onSubmit={authMode === 'email-signin' ? handleEmailSignIn : handleEmailSignUp} className="space-y-4">
                  {authMode === 'email-signup' && (
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
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
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
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
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
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
                    className="w-full text-[11px] font-bold text-[var(--color-primary)] uppercase tracking-widest hover:text-neutral-900 transition-colors py-2"
                  >
                    {authMode === 'email-signin' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                  </button>
                  {authMode === 'email-signin' && (
                    <button
                      onClick={() => { setAuthMode('forgot-password'); setError(null); setResetSent(false); }}
                      className="w-full text-[10px] font-bold text-neutral-500 uppercase tracking-widest hover:text-neutral-600 transition-colors"
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
                  <p className="text-[10px] text-neutral-400 leading-tight mt-0.5">Fill your board</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-primary)' }}>
                  <Store className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-900">Visit</p>
                  <p className="text-[10px] text-neutral-400 leading-tight mt-0.5">Local shops</p>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--color-accent)' }}>
                  <ShieldCheck className="text-white" size={16} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-neutral-900">Win</p>
                  <p className="text-[10px] text-neutral-400 leading-tight mt-0.5">Chamber prizes</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Install before signing in. On iPhone the home screen app does not
            share Safari's login, so installing first means signing in once. */}
        <div className="mt-6">
          <InstallButton />
          <p className="text-[10px] text-neutral-400 text-center mt-2 leading-relaxed">
            Adds Chamber Bingo to your home screen. Free, no app store needed.
          </p>
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
