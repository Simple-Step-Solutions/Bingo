import React from 'react';

interface Props { children: React.ReactNode }
interface State { error: Error | null }

/**
 * Catches render-time exceptions so a single bad component cannot blank the
 * whole app. Before this existed, any thrown error left the user staring at a
 * white screen with no way to recover short of clearing site data.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // No error reporting service is wired up yet. Until one is, the console is
    // the only trail, so log both the error and the component stack.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-8 shadow-xl border border-neutral-100 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
            </svg>
          </div>
          <h2 className="font-serif italic text-3xl mb-3">Something went wrong</h2>
          <p className="text-sm text-neutral-500 leading-relaxed mb-8">
            The app hit an unexpected error. Reloading usually fixes it. If it keeps
            happening, let the Chamber know what you were doing at the time.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-neutral-900 text-white py-4 rounded-2xl font-bold text-sm transition-all active:scale-95"
          >
            Reload the app
          </button>
          <p className="text-[9px] text-neutral-500 uppercase tracking-widest mt-6 break-words">
            {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
