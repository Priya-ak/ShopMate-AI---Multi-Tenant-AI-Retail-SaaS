import React, { useState } from 'react';
import { api } from '../services/api';
import { KeyRound, Mail, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onBackToLogin }) => {
  const [email, setEmail] = useState('');
  const [tokenReceived, setTokenReceived] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setTokenReceived(res.resetToken || 'demo_token');
      setStep('reset');
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenReceived || !newPassword) return;
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenReceived, newPassword }),
      });
      if (!res.ok) throw new Error('Reset failed');
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Password reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-700/60 mx-auto flex items-center justify-center text-indigo-400 shadow-md">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Password Recovery</h1>
          <p className="text-xs text-slate-400">
            {step === 'request' && 'Enter your store email to receive password reset instructions.'}
            {step === 'reset' && 'Reset token verified. Set your new secure password.'}
            {step === 'done' && 'Your password has been successfully updated.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestToken} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Registered Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. owner@shopmate.com"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/25"
            >
              {isLoading ? 'Generating token...' : 'Send Recovery Token'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Recovery Token</label>
              <input
                type="text"
                readOnly
                value={tokenReceived || ''}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-indigo-300 font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
            >
              {isLoading ? 'Updating...' : 'Update Password & Sign In'}
            </button>
          </form>
        )}

        {step === 'done' && (
          <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-950 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-800">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-xs text-slate-300">
              Your password has been changed. You can now log into your store.
            </p>
            <button
              onClick={onBackToLogin}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs"
            >
              Proceed to Sign In
            </button>
          </div>
        )}

        <div className="text-center pt-2">
          <button onClick={onBackToLogin} className="text-xs text-slate-400 hover:text-white">
            &larr; Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};
