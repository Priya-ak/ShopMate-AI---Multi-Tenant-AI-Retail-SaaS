import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Store, Mail, Lock, Phone, ArrowRight, AlertCircle } from 'lucide-react';
import { GoogleAuthButton } from '../components/GoogleAuthButton';

const CATEGORIES = [
  'Clothing & Ethnic Fashion',
  'Saree & Kurti Boutique',
  'Jewellery & Accessories',
  'Footwear Store',
  'Electronics & Gadgets',
  'Wholesale Business',
  'Other Retail',
];

interface RegisterPageProps {
  onSuccess: () => void;
  onGoToLogin: () => void;
  onBack?: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onSuccess, onGoToLogin }) => {
  const { register, googleAuth, pendingGoogle, clearPendingGoogle } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [businessCategory, setBusinessCategory] = useState('Clothing & Ethnic Fashion');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cleanedPhone = phone.trim().replace(/[\s\-\(\)]/g, '');

  // Step 1 (Google): verify the Google account only. Business details are asked afterwards.
  const handleGoogle = async (credential: string) => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const u = await googleAuth({ credential, mode: 'register' });
      if (u) onSuccess(); // this Google account already had a ShopMate account
    } catch (err: any) {
      setErrorMsg(err.message || 'Google registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 (Google): store details for the verified Google account.
  const handleGoogleDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingGoogle) return;
    setErrorMsg(null);
    if (!businessName.trim()) return setErrorMsg('Please enter your store name.');
    if (cleanedPhone.length < 8) return setErrorMsg('A valid phone number with at least 8 digits is required.');
    setIsLoading(true);
    try {
      await googleAuth({
        credential: pendingGoogle.credential,
        mode: 'register',
        name: name.trim() || pendingGoogle.profile.name,
        businessName: businessName.trim(),
        businessCategory,
        phone: cleanedPhone,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not finish registration');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = phone.trim().replace(/[\s\-\(\)]/g, '');
    if (cleanPhone.length < 8) {
      setErrorMsg('A valid phone number with at least 8 digits is required for account security.');
      return;
    }

    setIsLoading(true);
    try {
      await register({
        name,
        email,
        password,
        businessName,
        businessCategory,
        phone: cleanPhone,
      });
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 mx-auto flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Store className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Register Your Retail Business</h1>
          <p className="text-xs text-slate-400">Launch an AI-powered shopping assistant and inventory system.</p>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {pendingGoogle ? (
          <form onSubmit={handleGoogleDetails} className="space-y-4 text-xs">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700">
              {pendingGoogle.profile.picture ? (
                <img src={pendingGoogle.profile.picture} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                  {pendingGoogle.profile.name.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-white font-semibold truncate">{pendingGoogle.profile.name}</div>
                <div className="text-slate-400 truncate">{pendingGoogle.profile.email}</div>
              </div>
              <span className="text-[10px] text-emerald-400 font-semibold">Google verified</span>
            </div>
            <p className="text-slate-400">One last step: tell us about your store to finish creating your account.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Business / Store Name *</label>
                <input type="text" required autoFocus value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Royal Silk Boutique"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Store Category *</label>
                <select value={businessCategory} onChange={(e) => setBusinessCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Owner Full Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={pendingGoogle.profile.name}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Phone / Mobile *</label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. +91 98765 43210"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
              </div>
            </div>
            <button type="submit" disabled={isLoading}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2">
              <span>{isLoading ? 'Creating your store...' : 'Finish Registration'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { clearPendingGoogle(); setErrorMsg(null); }}
              className="w-full text-[11px] text-slate-400 hover:text-white transition">
              Use a different account
            </button>
          </form>
        ) : (
          <>
            <GoogleAuthButton onCredential={handleGoogle} text="signup_with" disabled={isLoading} disabledHint="Please wait..." />
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-500">
              <span className="flex-1 h-px bg-slate-800" />
              <span>or register with email</span>
              <span className="flex-1 h-px bg-slate-800" />
            </div>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Business / Store Name *</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Royal Silk Boutique"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Store Category *</label>
              <select
                value={businessCategory}
                onChange={(e) => setBusinessCategory(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Clothing & Ethnic Fashion">Clothing & Ethnic Fashion</option>
                <option value="Saree & Kurti Boutique">Saree & Kurti Boutique</option>
                <option value="Jewellery & Accessories">Jewellery & Accessories</option>
                <option value="Footwear Store">Footwear Store</option>
                <option value="Electronics & Gadgets">Electronics & Gadgets</option>
                <option value="Wholesale Business">Wholesale Business</option>
                <option value="Other Retail">Other Retail</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Owner Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rajesh Patel"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>Phone / Mobile *</span>
                <span className="text-[10px] text-indigo-400 font-normal">Unique per account</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
              <span>Work Email Address *</span>
              <span className="text-[10px] text-indigo-400 font-normal">Unique per account</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. owner@royalsilk.com"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Password *</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
          >
            <span>{isLoading ? 'Creating Business Tenant...' : 'Complete Business Registration'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
          </>
        )}

        <div className="text-center text-xs text-slate-400 pt-2">
          Already registered?{' '}
          <button onClick={onGoToLogin} className="text-indigo-400 hover:text-indigo-300 font-semibold">
            Sign In here
          </button>
        </div>
      </div>
    </div>
  );
};
