import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api, WhatsAppStatus } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Share2, Smartphone, CheckCircle, Send, Terminal, AlertCircle, Loader2, Link2, Unplug, ShieldCheck, Info } from 'lucide-react';

interface IntegrationsPageProps {
  onBack?: () => void;
}

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const META_ORIGINS = ['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com'];

/** Loads Meta's JavaScript SDK on demand (only when the owner clicks "Connect"). */
function loadFacebookSdk(appId: string, version: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const init = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    if (window.FB) return init();
    window.fbAsyncInit = init;
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Could not load the Meta sign-in. Check your connection or ad-blocker and try again.'));
    document.body.appendChild(s);
  });
}

const formatWhen = (v?: string | null) => (v ? v.replace('T', ' ').slice(0, 16) : '—');

export const IntegrationsPage: React.FC<IntegrationsPageProps> = () => {
  const { user, business } = useAuth();
  const isOwner = user?.role === 'BUSINESS_OWNER';

  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [togglingAuto, setTogglingAuto] = useState(false);

  const [testMessage, setTestMessage] = useState('Show me available products');
  const [testResponse, setTestResponse] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const signup = useRef<{ code?: string; phone_number_id?: string; waba_id?: string; done?: boolean }>({});

  const load = useCallback(async () => {
    try {
      setStatus(await api.getWhatsAppStatus());
      setLoadError(null);
    } catch (err: any) {
      setLoadError(err.message || 'Could not load WhatsApp status');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Embedded Signup reports the new number/WABA through a postMessage from Meta's popup.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!META_ORIGINS.includes(event.origin)) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event?.startsWith('FINISH')) {
          signup.current.phone_number_id = String(data.data?.phone_number_id || '');
          signup.current.waba_id = String(data.data?.waba_id || '');
          tryFinish();
        } else if (data.event === 'CANCEL') {
          setConnecting(false);
          setConnectError('WhatsApp sign-up was cancelled before it finished.');
        }
      } catch {
        /* not a message for us */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tryFinish = async () => {
    const s = signup.current;
    if (s.done || !s.code || !s.phone_number_id || !s.waba_id) return;
    s.done = true;
    try {
      await api.connectWhatsApp({ code: s.code, phone_number_id: s.phone_number_id, waba_id: s.waba_id });
      setNotice('WhatsApp is connected. Your existing chats stay on your phone and new messages now appear here.');
      await load();
    } catch (err: any) {
      setConnectError(err.message || 'Could not finish connecting WhatsApp.');
    } finally {
      setConnecting(false);
    }
  };

  const handleConnect = async () => {
    if (!status?.platform.connectAvailable || !status.platform.appId || !status.platform.configId) return;
    setConnectError(null);
    setNotice(null);
    setConnecting(true);
    signup.current = {};
    try {
      await loadFacebookSdk(status.platform.appId, status.platform.graphVersion);
      window.FB.login(
        (response: any) => {
          const code = response?.authResponse?.code;
          if (!code) {
            setConnecting(false);
            setConnectError('WhatsApp sign-up was not completed.');
            return;
          }
          signup.current.code = code;
          tryFinish();
        },
        {
          config_id: status.platform.configId,
          response_type: 'code',
          override_default_response_type: true,
          // Coexistence: onboard an existing WhatsApp Business app number (scan a QR code with the phone).
          extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' },
        }
      );
    } catch (err: any) {
      setConnecting(false);
      setConnectError(err.message || 'Could not start WhatsApp sign-up.');
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    setDisconnectError(null);
    try {
      await api.disconnectWhatsApp();
      setConfirmDisconnect(false);
      setNotice('WhatsApp disconnected. Your chats remain on your phone and in ShopMate.');
      await load();
    } catch (err: any) {
      setDisconnectError(err.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleAuto = async () => {
    if (!status?.account) return;
    setTogglingAuto(true);
    try {
      await api.setWhatsAppAutoReply(!status.account.auto_reply);
      await load();
    } catch (err: any) {
      setConnectError(err.message || 'Could not change the setting');
    } finally {
      setTogglingAuto(false);
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessage) return;
    setIsTesting(true);
    setTestResponse(null);
    try {
      setTestResponse(await api.simulateWhatsAppWebhook(testMessage));
    } catch (err: any) {
      setTestResponse({ error: err.message || 'Simulator failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const connected = !!status?.connected && !!status.account;
  const acc = status?.account;

  return (
    <div className="space-y-6">
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
          <Share2 className="w-6 h-6 text-emerald-400" />
          <span>WhatsApp Business</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Use the WhatsApp number you already have. Customer messages show on your phone and in ShopMate, and you can answer from either.
        </p>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {(connectError || loadError) && (
        <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{connectError || loadError}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Connection */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-sm text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Your WhatsApp number</span>
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                connected ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {connected ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>

          {!status && !loadError && (
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          )}

          {status && connected && acc && (
            <div className="space-y-3 text-xs">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-slate-400">Number</dt>
                <dd className="text-white font-mono">{acc.display_phone || '—'}</dd>
                <dt className="text-slate-400">Business name</dt>
                <dd className="text-white">{acc.verified_name || business?.name || '—'}</dd>
                <dt className="text-slate-400">Mode</dt>
                <dd className="text-white">Phone app + ShopMate (coexistence)</dd>
                <dt className="text-slate-400">Old chats import</dt>
                <dd className="text-white capitalize">{(acc.history_status || 'waiting for Meta').replace('_', ' ')}</dd>
                <dt className="text-slate-400">Last message received</dt>
                <dd className="text-white font-mono">{formatWhen(acc.last_webhook_at)}</dd>
              </dl>

              {isOwner && (
                <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div>
                    <div className="font-semibold text-slate-200">AI auto-reply</div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                      Switched on automatically: when a customer messages your number, your store's AI assistant answers product, stock and order questions using your own catalogue. It pauses for 15 minutes whenever you reply yourself from the phone.
                    </p>
                  </div>
                  <button
                    onClick={handleToggleAuto}
                    disabled={togglingAuto}
                    role="switch"
                    aria-checked={acc.auto_reply}
                    className={`relative w-10 h-5 rounded-full shrink-0 transition ${acc.auto_reply ? 'bg-emerald-600' : 'bg-slate-700'} disabled:opacity-50`}
                    title="Toggle AI auto-reply"
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${acc.auto_reply ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
              )}

              {isOwner && (
                <button
                  onClick={() => { setDisconnectError(null); setConfirmDisconnect(true); }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 font-semibold flex items-center gap-1.5"
                >
                  <Unplug className="w-3.5 h-3.5" />
                  <span>Disconnect WhatsApp</span>
                </button>
              )}
            </div>
          )}

          {status && !connected && (
            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 leading-relaxed">
                <div className="font-semibold text-slate-300">Before you start</div>
                <p>1. Your number must be on the <b className="text-slate-200">WhatsApp Business app</b> (the green "B" app), not regular WhatsApp. Switching is free and keeps your chats.</p>
                <p>2. Update the Business app and keep your phone with you. You will scan a QR code with it.</p>
                <p>3. Keep using the app as usual afterwards. Open it at least once every 13 days and do not uninstall it, or the link stops.</p>
              </div>

              {!status.platform.connectAvailable && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-[11px] flex gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>WhatsApp connection is not switched on for this platform yet. The administrator needs to finish the Meta setup (see docs/WHATSAPP.md).</span>
                </div>
              )}

              {isOwner ? (
                <button
                  onClick={handleConnect}
                  disabled={connecting || !status.platform.connectAvailable}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  <span>{connecting ? 'Waiting for WhatsApp...' : 'Connect my WhatsApp number'}</span>
                </button>
              ) : (
                <p className="text-slate-400">Ask the store owner to connect WhatsApp.</p>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 text-[11px] text-slate-500 pt-1">
            <ShieldCheck className="w-4 h-4 text-slate-500 shrink-0" />
            <span>Your WhatsApp access key is encrypted on our server and is never shown in the browser.</span>
          </div>
        </div>

        {/* Simulator */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Test the AI assistant (no real WhatsApp needed)</span>
          </h2>
          <p className="text-xs text-slate-400">
            Sends a pretend customer message through the same pipeline. The chat appears under Conversations as a simulator chat and nothing is sent to anyone.
          </p>

          <form onSubmit={handleTestWebhook} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Customer message</label>
              <input
                type="text"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                maxLength={1000}
                placeholder="e.g. Show me red kurtis below 1500"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isTesting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{isTesting ? 'Sending...' : 'Send test message'}</span>
            </button>
          </form>

          {testResponse && (
            <div className="space-y-2 pt-2">
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Assistant reply</span>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                {testResponse.error ? testResponse.error : testResponse.autoReply}
              </div>
            </div>
          )}
        </div>
      </div>

      {confirmDisconnect && (
        <ConfirmDialog
          title="Disconnect WhatsApp?"
          message="ShopMate stops receiving and sending WhatsApp messages. Your phone keeps working normally and no chats are deleted. You can reconnect any time."
          confirmLabel="Disconnect"
          busy={disconnecting}
          error={disconnectError}
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
};
