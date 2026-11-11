import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';

declare global {
  interface Window {
    google?: any;
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let gsiPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gsiPromise) {
    gsiPromise = new Promise<void>((resolve, reject) => {
      const el = document.createElement('script');
      el.src = GSI_SRC;
      el.async = true;
      el.defer = true;
      el.onload = () => resolve();
      el.onerror = () => {
        gsiPromise = null;
        reject(new Error('Could not load Google sign-in'));
      };
      document.head.appendChild(el);
    });
  }
  return gsiPromise;
}

interface GoogleAuthButtonProps {
  /** Called with the Google ID token (a JWT). The backend verifies it. */
  onCredential: (credential: string) => void;
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  /** Disable the button (e.g. while required form fields are still empty). */
  disabled?: boolean;
  /** Shown instead of the button when `disabled` is set. */
  disabledHint?: string;
}

export const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  onCredential,
  text = 'continue_with',
  disabled,
  disabledHint,
}) => {
  const holder = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getAuthConfig().then((c) => alive && setClientId(c.googleClientId));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!clientId || disabled) return;
    let alive = true;
    loadGoogleScript()
      .then(() => {
        if (!alive || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp: { credential?: string }) => {
            if (resp?.credential) callbackRef.current(resp.credential);
          },
          ux_mode: 'popup',
        });
        holder.current.innerHTML = '';
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text,
          width: Math.min(Math.max(holder.current.clientWidth || 320, 200), 400),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [clientId, disabled, text]);

  const label =
    text === 'signup_with' ? 'Sign up with Google' : text === 'signin_with' ? 'Sign in with Google' : 'Continue with Google';

  // The visible button is ours (matches the dark UI). Google's official button is rendered on top,
  // fully transparent, so the click still goes through Google's secure popup flow.
  const face = (muted: boolean) => (
    <span
      className={`w-full h-11 rounded-xl border flex items-center justify-center gap-3 text-sm font-semibold transition ${
        muted
          ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed'
          : 'bg-slate-800 border-slate-600 text-slate-100 group-hover:bg-slate-700 group-hover:border-indigo-400/60 group-focus-within:border-indigo-400 shadow-sm'
      }`}
    >
      <GoogleMark />
      <span>{label}</span>
    </span>
  );

  const fallback = (hint: string) => (
    <div className="space-y-1.5">
      <button type="button" disabled aria-disabled className="w-full block">
        {face(true)}
      </button>
      <p className="text-[10px] text-slate-500 text-center">{hint}</p>
    </div>
  );

  if (clientId === undefined) return <div className="h-11 rounded-xl bg-slate-800/50 animate-pulse" aria-hidden />;
  if (!clientId) return fallback('Google sign-in is not configured for this deployment yet.');
  if (failed) return fallback('Google sign-in could not be loaded. Check your connection and refresh.');
  if (disabled) return fallback(disabledHint || 'Please wait...');

  return (
    <div className="group relative w-full h-11 rounded-xl overflow-hidden" style={{ colorScheme: 'light' }}>
      {face(false)}
      <div
        ref={holder}
        aria-label={label}
        className="absolute inset-0 flex items-center justify-center opacity-[0.01] [&_iframe]:!w-full [&_iframe]:!h-11 [&>div]:!w-full"
      />
    </div>
  );
};

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden>
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.9 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);
