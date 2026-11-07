import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { BackButton } from '../components/BackButton';
import { Share2, Smartphone, CheckCircle, RefreshCw, Send, Sparkles, Terminal, Copy, Check } from 'lucide-react';

interface IntegrationsPageProps {
  onBack?: () => void;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ onBack }) => {
  const { business } = useAuth();
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [testMessage, setTestMessage] = useState('Show me available products');
  const [testResponse, setTestResponse] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const data = await api.getIntegrations();
      setIntegrations(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage) return;
    setIsTesting(true);
    setTestResponse(null);
    try {
      const res = await api.simulateWhatsAppWebhook(testMessage);
      setTestResponse(res);
    } catch (err: any) {
      setTestResponse({ error: err.message || 'Webhook failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const webhookUrl = `${window.location.origin}/webhooks/whatsapp`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Share2 className="w-6 h-6 text-indigo-400" />
          <span>Meta WhatsApp Cloud API & Webhook Simulator</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Automate customer conversation routing via Meta WhatsApp Webhooks with direct database-backed auto-replies.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Status & Webhook Configuration */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp Cloud API Connection</span>
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
              SIMULATOR ACTIVE
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Live Webhook Endpoint (POST / GET)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]"
                />
                <button
                  onClick={copyWebhook}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copy URL"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Webhook Verify Token</label>
              <input
                type="text"
                readOnly
                value="shopmate_verify_token_2026"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-indigo-300 font-mono text-[11px]"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Registered Business Phone</label>
              <input
                type="text"
                readOnly
                value={business?.phone ? `${business.phone} (${business.name})` : (business?.name || 'Store Not Configured')}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]"
              />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
            <div className="font-semibold text-slate-300">Production Integration Architecture:</div>
            <p>1. In the Meta Business Suite, configure the webhook callback to the URL above.</p>
            <p>2. Enter verify token: <code className="text-indigo-300">shopmate_verify_token_2026</code>.</p>
            <p>3. Subscribe to <code className="text-slate-300">messages</code> webhook event.</p>
            <p>4. ShopMate AI automatically authenticates incoming payloads and dispatches tool executions.</p>
          </div>
        </div>

        {/* Live Simulator Tester */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Interactive Webhook Simulator</span>
          </h2>
          <p className="text-xs text-slate-400">
            Send a mock WhatsApp customer message to <code className="text-indigo-300">/webhooks/whatsapp</code> and observe the backend response.
          </p>

          <form onSubmit={handleTestWebhook} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Incoming Message Body</label>
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="e.g. Show me red kurtis below 1500"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isTesting}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isTesting ? 'Sending Webhook...' : 'Simulate Incoming WhatsApp Message'}</span>
            </button>
          </form>

          {/* Response Payload */}
          {testResponse && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                Webhook Server Response:
              </span>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {JSON.stringify(testResponse, null, 2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
