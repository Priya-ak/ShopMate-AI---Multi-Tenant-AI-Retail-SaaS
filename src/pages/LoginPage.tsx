import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Store, Lock, Mail, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { GoogleAuthButton } from '../components/GoogleAuthButton';

interface LoginPageProps {
  onSuccess: (loggedInUser?: any) => void;
  onGoToRegister: () => void;
  onGoToForgotPassword: () => void;
  onBack?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onSuccess,
  onGoToRegister,
  onGoToForgotPassword,
}) => {
  const { login, switchDemoRole, googleAuth } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const loggedInUser = await login(email, password);
      onSuccess(loggedInUser);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const u = await googleAuth({ credential, mode: 'login' });
      onSuccess(u);
    } catch (err: any) {
      setErrorMsg(err.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoClick = async (role: 'OWNER' | 'EMPLOYEE' | 'CUSTOMER' | 'SUPER_ADMIN') => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const u = await switchDemoRole(role);
      onSuccess(u);
    } catch (err: any) {
      setErrorMsg(err.message || 'Demo persona login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Store className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Sign In to ShopMate AI</h1>
          <p className="text-xs text-slate-400">Access your store dashboard, inventory ledger, and AI assistant.</p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-medium">Password</label>
              <button
                type="button"
                onClick={onGoToForgotPassword}
                className="text-indigo-400 hover:text-indigo-300 text-[11px]"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
          >
            <span>{isLoading ? 'Verifying...' : 'Sign In to Store'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Google sign-in */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
            <span className="flex-1 h-px bg-slate-800" />
            <span>or</span>
            <span className="flex-1 h-px bg-slate-800" />
          </div>
          <GoogleAuthButton onCredential={handleGoogle} text="signin_with" />
        </div>

        {/* Demo Fast Logins */}
        <div className="pt-2 border-t border-slate-800 space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>One-Click Demo Personas</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleDemoClick('OWNER')}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-left transition border border-slate-700/60 hover:border-indigo-500/50 flex flex-col gap-0.5"
            >
              <span className="font-semibold text-white">👑 Store Owner</span>
              <span className="text-[10px] text-slate-400">Full catalog & POS controls</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleDemoClick('EMPLOYEE')}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-left transition border border-slate-700/60 hover:border-indigo-500/50 flex flex-col gap-0.5"
            >
              <span className="font-semibold text-white">👔 Store Employee</span>
              <span className="text-[10px] text-slate-400">Billing & order dispatch</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleDemoClick('CUSTOMER')}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-left transition border border-slate-700/60 hover:border-indigo-500/50 flex flex-col gap-0.5"
            >
              <span className="font-semibold text-white">🛍️ Customer</span>
              <span className="text-[10px] text-slate-400">AI chat shopping & cart</span>
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => handleDemoClick('SUPER_ADMIN')}
              className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 font-medium text-left transition border border-slate-700/60 hover:border-indigo-500/50 flex flex-col gap-0.5"
            >
              <span className="font-semibold text-white">⚡ Platform Admin</span>
              <span className="text-[10px] text-slate-400">Multi-tenant management</span>
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 pt-2">
          Don't have a registered business?{' '}
          <button
            onClick={onGoToRegister}
            className="text-indigo-400 hover:text-indigo-300 font-semibold"
          >
            Register your shop
          </button>
        </div>
      </div>
    </div>
  );
};
