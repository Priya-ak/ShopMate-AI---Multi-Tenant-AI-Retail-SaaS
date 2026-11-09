import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BackButton } from '../components/BackButton';
import { Settings, Building2, Bot, CheckCircle, AlertCircle, Save } from 'lucide-react';

interface SettingsPageProps {
  onBack?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const { business, refreshBusiness } = useAuth();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [currency, setCurrency] = useState('₹');
  const [aiGreeting, setAiGreeting] = useState('');
  const [assistantName, setAssistantName] = useState('ShopMate AI');
  const [questionsText, setQuestionsText] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (business) {
      setName(business.name || '');
      setCategory(business.category || '');
      setPhone(business.phone || '');
      setEmail(business.email || '');
      setAddress(business.address || '');
      setCurrency(business.currency || '₹');
      setAiGreeting(business.ai_greeting || '');
      setAssistantName(business.assistant_name || 'ShopMate AI');
      setQuestionsText((business.suggested_questions || []).join('\n'));
    }
  }, [business]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSavedSuccess(false);
    setErrorMsg(null);
    const questions = questionsText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean);
    if (!assistantName.trim()) {
      setErrorMsg('Please give your assistant a name.');
      setIsLoading(false);
      return;
    }
    if (questions.length > 8 || questions.some((q) => q.length > 80)) {
      setErrorMsg('Use at most 8 suggested questions, each up to 80 characters.');
      setIsLoading(false);
      return;
    }
    try {
      await api.updateBusiness({
        name,
        phone,
        email,
        address,
        currency,
        ai_greeting: aiGreeting,
        assistant_name: assistantName.trim(),
        suggested_questions: questions,
      });
      await refreshBusiness();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">

      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          <span>Business Profile & AI Configuration</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Customize your store branding, currency, contact channels, and AI shopping assistant persona.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Store settings and AI assistant configuration saved successfully!</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSave} className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 text-xs shadow-xl">
        <div className="border-b border-slate-800 pb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-400" />
          <h2 className="font-bold text-sm text-white">Store Identity & Contact</h2>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Business Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Industry / Category</label>
            <input
              type="text"
              readOnly
              value={category}
              className="w-full px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 font-medium mb-1">Official WhatsApp Phone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">Support Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">Store Physical Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="border-b border-slate-800 pb-3 pt-3 flex items-center gap-2">
          <Bot className="w-4 h-4 text-emerald-400" />
          <h2 className="font-bold text-sm text-white">AI Assistant Behaviour</h2>
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">Currency Symbol</label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-24 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-bold"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">Assistant Name *</label>
          <input
            type="text"
            required
            maxLength={40}
            value={assistantName}
            onChange={(e) => setAssistantName(e.target.value)}
            placeholder="e.g. Priya from Royal Silk"
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
          <span className="text-[10px] text-slate-500 mt-1 block">
            Shown to your shoppers as the name of your store's AI assistant.
          </span>
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">AI Assistant Opening Greeting</label>
          <textarea
            rows={3}
            value={aiGreeting}
            onChange={(e) => setAiGreeting(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
          />
          <span className="text-[10px] text-slate-500 mt-1 block">
            This message is sent when a customer opens the shopping simulator or initiates a WhatsApp conversation.
          </span>
        </div>

        <div>
          <label className="block text-slate-300 font-medium mb-1">Suggested Questions</label>
          <textarea
            rows={5}
            value={questionsText}
            onChange={(e) => setQuestionsText(e.target.value)}
            placeholder={'One question per line, e.g.\nShow me new arrivals\nDo you have size M available?'}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
          />
          <span className="text-[10px] text-slate-500 mt-1 block">
            One per line (up to 8, 80 characters each). Shoppers see these as tap-to-ask chips under the chat.
          </span>
        </div>

        <div className="flex justify-end pt-3">
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 transition shadow-md shadow-indigo-600/20"
          >
            <Save className="w-4 h-4" />
            <span>{isLoading ? 'Saving...' : 'Save Store Changes'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
