/**
 * WhatsApp integration (Meta WhatsApp Business Platform, "coexistence").
 *
 * Coexistence lets a business keep using its EXISTING number in the WhatsApp Business app on the phone
 * while the same number is connected to the Cloud API, so existing chats are kept and customer messages
 * show up both on the phone and in ShopMate.
 *
 *   Owner clicks "Connect" -> Meta Embedded Signup (QR scan from the Business app)
 *     -> POST /api/whatsapp/connect {code, phone_number_id, waba_id}   (token exchange, encrypted at rest)
 *   Customer -> WhatsApp -> Meta -> POST /api/webhooks/whatsapp (signed, X-Hub-Signature-256)
 *     -> conversation + message stored per tenant -> (optional) AI auto-reply
 *   Messages typed on the phone arrive as `smb_message_echoes` and are mirrored into ShopMate.
 *
 * Secrets: META_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_ENCRYPTION_KEY are server-side only.
 * The per-business access token is stored AES-256-GCM encrypted and is never sent to the browser.
 */
import crypto from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { asyncRouter } from './asyncRouter.js';
import { db, newId } from './db.js';
import { authMiddleware, requireRole, resolveBusinessId, rateLimit, clientIp, AuthUser } from './auth.js';
import { runGeminiAgent } from './gemini.js';

export const whatsappRouter = asyncRouter();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const env = (k: string) => (process.env[k] || '').trim();
const graphBase = () => (env('META_GRAPH_BASE') || 'https://graph.facebook.com').replace(/\/+$/, '');
const graphVersion = () => env('META_GRAPH_VERSION') || 'v23.0';

export const metaConfig = () => ({
  appId: env('META_APP_ID'),
  configId: env('META_CONFIG_ID'),
  graphVersion: graphVersion(),
  ready: !!(env('META_APP_ID') && env('META_APP_SECRET') && env('META_CONFIG_ID')),
  webhookReady: !!(env('META_APP_SECRET') && env('WHATSAPP_VERIFY_TOKEN')),
});

const AUTO_REPLY_HUMAN_PAUSE_MS = 15 * 60 * 1000; // stay quiet for 15 min after a person replied
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000; // WhatsApp customer-service window

// ---------------------------------------------------------------------------
// Secret encryption (AES-256-GCM)
// ---------------------------------------------------------------------------
function encryptionKey(): Buffer {
  const k = env('WHATSAPP_ENCRYPTION_KEY');
  if (k) return crypto.createHash('sha256').update('shopmate-wa-v1:' + k).digest();
  // Fallback so the feature works with only SESSION_SECRET set; set WHATSAPP_ENCRYPTION_KEY to rotate independently.
  const s = env('SESSION_SECRET') || env('DATABASE_URL') || env('POSTGRES_URL');
  if (!s) throw new WhatsAppError(503, 'WhatsApp is not configured on this server (missing encryption key).', 'WA_NOT_CONFIGURED');
  return crypto.createHash('sha256').update('shopmate-wa-v1-fallback:' + s).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = String(blob || '').split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret format');
  const d = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}

// ---------------------------------------------------------------------------
// Errors + Graph API client
// ---------------------------------------------------------------------------
export class WhatsAppError extends Error {
  constructor(public status: number, message: string, public code = 'WHATSAPP_ERROR') {
    super(message);
  }
}

async function graph(path: string, opts: { method?: string; token?: string; body?: any; query?: Record<string, string> } = {}) {
  const url = new URL(`${graphBase()}/${graphVersion()}/${path.replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(opts.query || {})) url.searchParams.set(k, v);
  let res: any;
  try {
    res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    console.error('[whatsapp] Graph request failed:', path.split('?')[0], err?.name || err?.message);
    throw new WhatsAppError(502, 'Could not reach WhatsApp (Meta). Please try again shortly.', 'META_UNREACHABLE');
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Log Meta's error (never the token); show the user a safe message.
    console.error('[whatsapp] Graph error', res.status, path.split('?')[0], JSON.stringify(json?.error || {}).slice(0, 300));
    const status = res.status;
    if (status === 401 || json?.error?.code === 190) {
      throw new WhatsAppError(401, 'WhatsApp access has expired or was revoked. Please reconnect WhatsApp.', 'META_TOKEN_INVALID');
    }
    throw new WhatsAppError(status === 429 ? 429 : 502, 'WhatsApp rejected the request. Please try again, or reconnect WhatsApp.', 'META_ERROR');
  }
  return json;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const idOk = (v: unknown) => typeof v === 'string' && /^\d{5,30}$/.test(v);
const tsFromUnix = (sec: unknown) => {
  const n = Number(sec);
  const d = Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
  return d.toISOString().replace('T', ' ').slice(0, 19);
};
const isDuplicate = (e: any) => e?.code === '23505' || /UNIQUE constraint failed/i.test(String(e?.message || ''));

async function audit(businessId: string | null, userId: string | null, action: string, entityType: string, entityId: string | null, details?: any) {
  try {
    await db.prepare('INSERT INTO audit_logs (id, business_id, user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(newId('aud'), businessId, userId, action, entityType, entityId, details ? JSON.stringify(details) : null);
  } catch (e: any) {
    console.error('[audit] could not write audit log:', e?.message);
  }
}

interface WaAccount {
  id: string; business_id: string; waba_id: string; phone_number_id: string; display_phone: string | null;
  verified_name: string | null; access_token_enc: string; mode: string; status: string; auto_reply: number;
  history_status: string | null; last_webhook_at: string | null; created_at: string;
}

const getAccount = async (businessId: string) =>
  (await db.prepare('SELECT * FROM whatsapp_accounts WHERE business_id = ?').get(businessId)) as WaAccount | undefined;

const publicAccount = (a: WaAccount) => ({
  display_phone: a.display_phone, verified_name: a.verified_name, mode: a.mode, status: a.status,
  auto_reply: !!a.auto_reply, history_status: a.history_status, last_webhook_at: a.last_webhook_at, connected_at: a.created_at,
});

/** Send a plain text message through the Cloud API; returns Meta's message id. */
export async function sendWhatsAppText(account: WaAccount, toDigits: string, body: string): Promise<string> {
  const token = decryptSecret(account.access_token_enc);
  const out = await graph(`${account.phone_number_id}/messages`, {
    method: 'POST', token,
    body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: toDigits, type: 'text', text: { preview_url: false, body: body.slice(0, 4000) } },
  });
  return String(out?.messages?.[0]?.id || '');
}

// ---------------------------------------------------------------------------
// Conversation storage (shared by the real webhook, history sync and the simulator)
// ---------------------------------------------------------------------------
async function findOrCreateConversation(businessId: string, phoneDigits: string, name: string | undefined, channel: string) {
  const candidates = [`+${phoneDigits}`, phoneDigits];
  for (const phone of candidates) {
    const c = (await db.prepare('SELECT id, customer_name, status FROM conversations WHERE business_id = ? AND customer_phone = ? ORDER BY updated_at DESC LIMIT 1').get(businessId, phone)) as any;
    if (c) {
      if (name && /^\+?\d+$/.test(c.customer_name || '')) {
        await db.prepare('UPDATE conversations SET customer_name = ? WHERE id = ? AND business_id = ?').run(name, c.id, businessId);
      }
      return { id: c.id as string, status: c.status as string, created: false };
    }
  }
  let customerId: string | null = null;
  for (const phone of candidates) {
    const cu = (await db.prepare('SELECT id, name FROM customers WHERE business_id = ? AND phone = ?').get(businessId, phone)) as any;
    if (cu) { customerId = cu.id; name = name || cu.name; break; }
  }
  const id = newId('conv');
  await db.prepare(`INSERT INTO conversations (id, business_id, customer_id, customer_name, customer_phone, status, channel) VALUES (?, ?, ?, ?, ?, 'New', ?)`)
    .run(id, businessId, customerId, name || `+${phoneDigits}`, `+${phoneDigits}`, channel);
  return { id, status: 'New', created: true };
}

/** Stores one message. Returns false when this WhatsApp message id was already processed (webhook retry). */
async function storeMessage(opts: {
  businessId: string; phoneDigits: string; name?: string; waId?: string; senderType: 'CUSTOMER' | 'AI' | 'EMPLOYEE';
  senderName: string; content: string; createdAt?: string; channel?: string; meta?: any; touch?: boolean;
}): Promise<{ stored: boolean; conversationId: string }> {
  const conv = await findOrCreateConversation(opts.businessId, opts.phoneDigits, opts.name, opts.channel || 'WHATSAPP');
  if (opts.waId) {
    try {
      await db.prepare('INSERT INTO whatsapp_message_log (wa_message_id, business_id) VALUES (?, ?)').run(opts.waId, opts.businessId);
    } catch (e: any) {
      if (isDuplicate(e)) return { stored: false, conversationId: conv.id };
      throw e;
    }
  }
  await db.prepare('INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newId('msg'), conv.id, opts.senderType, opts.senderName, opts.content.slice(0, 4096), JSON.stringify({ wa_id: opts.waId || null, ...(opts.meta || {}) }), opts.createdAt || tsFromUnix(Date.now() / 1000));
  if (opts.touch !== false) {
    const reopen = opts.senderType === 'CUSTOMER' && (conv.status === 'Resolved' || conv.status === 'Closed');
    await db.prepare(`UPDATE conversations SET updated_at = CURRENT_TIMESTAMP${reopen ? ", status = 'Open'" : ''} WHERE id = ? AND business_id = ?`).run(conv.id, opts.businessId);
  }
  return { stored: true, conversationId: conv.id };
}

/** Turns any WhatsApp message object into readable text for the CRM. Never throws. */
function messageText(m: any): string {
  const t = m?.type;
  if (t === 'text') return String(m.text?.body ?? '');
  const caption = m?.[t]?.caption ? ` ${m[t].caption}` : '';
  switch (t) {
    case 'image': case 'video': case 'audio': case 'document': case 'sticker':
      return `[${t}]${caption}`;
    case 'location': return `[location] ${m.location?.name || ''} ${m.location?.latitude ?? ''},${m.location?.longitude ?? ''}`.trim();
    case 'button': return String(m.button?.text || '[button reply]');
    case 'interactive': return String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '[interactive reply]');
    case 'reaction': return `[reaction ${m.reaction?.emoji || ''}]`;
    default: return '[unsupported message type]';
  }
}

// ---------------------------------------------------------------------------
// AI auto-reply (guard-railed)
// ---------------------------------------------------------------------------
async function maybeAutoReply(account: WaAccount, conversationId: string, phoneDigits: string, text: string, isText = true) {
  if (!account.auto_reply || !text.trim()) return;
  // Human takeover: if a person answered recently (from the phone or the app), stay quiet.
  const recentHuman = (await db.prepare(`SELECT created_at FROM messages WHERE conversation_id = ? AND sender_type = 'EMPLOYEE' ORDER BY created_at DESC LIMIT 1`).get(conversationId)) as any;
  if (recentHuman?.created_at) {
    const t = Date.parse(String(recentHuman.created_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d(:?\d\d)?$/.test(String(recentHuman.created_at)) ? '' : 'Z'));
    if (Number.isFinite(t) && Date.now() - t < AUTO_REPLY_HUMAN_PAUSE_MS) return;
  }
  if (!rateLimit(`wa-auto:${account.business_id}:${phoneDigits}`, 10, 60 * 60 * 1000).ok) return;
  if (!rateLimit(`wa-auto-biz:${account.business_id}`, 300, 60 * 60 * 1000).ok) return;

  if (!isText) {
    // Photos, voice notes, stickers etc.: the AI reads text only, so ask politely for text instead of staying silent.
    const biz = (await db.prepare('SELECT name, assistant_name FROM businesses WHERE id = ?').get(account.business_id)) as any;
    const reply = `Thanks for your message! I can read text only. Please type what you are looking for (for example a product name, size or budget) and ${biz?.name || 'the store'} will help you right away.`;
    const waId = await sendWhatsAppText(account, phoneDigits, reply);
    await storeMessage({ businessId: account.business_id, phoneDigits, waId: waId || undefined, senderType: 'AI', senderName: biz?.assistant_name || 'ShopMate AI', content: reply, meta: { source: 'auto_reply', kind: 'non_text' } });
    return;
  }
  const history = (await db.prepare('SELECT sender_type, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 8').all(conversationId) as any[])
    .reverse().slice(0, -1) // everything before the message we are answering
    .map((m) => ({ role: m.sender_type === 'CUSTOMER' ? 'user' : 'assistant', content: String(m.content).slice(0, 600) }));
  const ai = await runGeminiAgent(account.business_id, text.slice(0, 1000), history);
  const reply = String(ai.reply || '').trim();
  if (!reply) return;
  const waId = await sendWhatsAppText(account, phoneDigits, reply);
  await storeMessage({
    businessId: account.business_id, phoneDigits, waId: waId || undefined, senderType: 'AI', senderName: ai.assistantName || 'ShopMate AI',
    content: reply, meta: { engine: ai.engine, tool: ai.toolExecuted, source: 'auto_reply' }, touch: true,
  });
}

// ---------------------------------------------------------------------------
// Webhook (Meta -> ShopMate)
// ---------------------------------------------------------------------------
const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

/** Reads the raw request body (needed for the HMAC signature) and parses it. Must run before express.json(). */
export function captureWebhookBody(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST') return next();
  const anyReq = req as any;
  if (anyReq.rawBody) return next();
  const chunks: Buffer[] = [];
  let size = 0;
  const MAX = 2 * 1024 * 1024;
  let done = false;
  const finish = (raw: Buffer, source: string) => {
    if (done) return; done = true;
    anyReq.rawBody = raw; anyReq.rawBodySource = source;
    try { anyReq.body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    anyReq._body = true; // tell body-parser the body is already handled
    next();
  };
  if (!req.readable) {
    // The platform already consumed the stream: fall back to the parsed body (signature may not match; see docs).
    return finish(Buffer.from(JSON.stringify(anyReq.body ?? {})), 'reparsed');
  }
  req.on('data', (c: Buffer) => {
    size += c.length;
    if (size > MAX) { if (!done) { done = true; res.status(413).json({ error: 'Request body too large' }); } req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => finish(Buffer.concat(chunks), 'stream'));
  req.on('error', () => { if (!done) { done = true; res.status(400).json({ error: 'Could not read request body' }); } });
}

function validSignature(req: Request): boolean {
  const secret = env('META_APP_SECRET');
  const header = String(req.headers['x-hub-signature-256'] || '');
  const raw: Buffer | undefined = (req as any).rawBody;
  if (!secret || !raw || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return header.length === expected.length && safeEqual(header, expected);
}

// Meta verification handshake (GET) - configured once per Meta app.
whatsappRouter.get('/webhooks/whatsapp', (req: Request, res: Response) => {
  const verify = env('WHATSAPP_VERIFY_TOKEN');
  if (!verify) return res.status(503).json({ error: 'WhatsApp webhook is not configured on this server.' });
  if (req.query['hub.mode'] === 'subscribe' && typeof req.query['hub.verify_token'] === 'string' && safeEqual(req.query['hub.verify_token'] as string, verify)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(String(req.query['hub.challenge'] ?? ''));
  }
  return res.status(403).json({ error: 'Verification failed' });
});

/** Handles one parsed webhook payload. Exposed for tests. */
export async function processWebhookPayload(payload: any): Promise<{ processed: number; ignored: number }> {
  let processed = 0, ignored = 0;
  for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      const phoneNumberId = String(value?.metadata?.phone_number_id || '');
      const account = phoneNumberId
        ? ((await db.prepare('SELECT * FROM whatsapp_accounts WHERE phone_number_id = ?').get(phoneNumberId)) as WaAccount | undefined)
        : undefined;
      if (!account || account.status === 'Disconnected') { ignored++; continue; } // unknown number: acknowledge, do nothing
      const biz = account.business_id;
      await db.prepare('UPDATE whatsapp_accounts SET last_webhook_at = CURRENT_TIMESTAMP WHERE id = ?').run(account.id);

      switch (change.field) {
        case 'messages': {
          const names = new Map<string, string>();
          for (const c of value.contacts || []) if (c?.wa_id) names.set(String(c.wa_id), String(c.profile?.name || ''));
          for (const m of value.messages || []) {
            const from = digits(m?.from);
            if (!from || !m?.id) { ignored++; continue; }
            const text = messageText(m);
            const name = names.get(from) || undefined;
            const r = await storeMessage({
              businessId: biz, phoneDigits: from, name, waId: String(m.id), senderType: 'CUSTOMER', senderName: name || `+${from}`,
              content: text, createdAt: tsFromUnix(m.timestamp), meta: { type: m.type, source: 'whatsapp' },
            });
            if (!r.stored) { ignored++; continue; }
            processed++;
            if (m.type !== 'reaction') {
              try { await maybeAutoReply(account, r.conversationId, from, text, m.type === 'text'); }
              catch (e: any) { console.error('[whatsapp] auto-reply failed:', e?.message); } // never fail the webhook because the AI failed
            }
          }
          break; // delivery/read "statuses" are intentionally ignored in the MVP
        }
        case 'smb_message_echoes': { // messages the owner typed in the WhatsApp Business app
          for (const m of value.message_echoes || []) {
            const to = digits(m?.to);
            if (!to || !m?.id) { ignored++; continue; }
            const r = await storeMessage({
              businessId: biz, phoneDigits: to, waId: String(m.id), senderType: 'EMPLOYEE', senderName: 'Business App (phone)',
              content: messageText(m), createdAt: tsFromUnix(m.timestamp), meta: { type: m.type, source: 'business_app' },
            });
            r.stored ? processed++ : ignored++;
          }
          break;
        }
        case 'history': { // one-time import of existing chats after onboarding
          let declined = false;
          for (const chunk of value.history || []) {
            if (chunk?.errors?.length) declined = true;
            for (const thread of chunk?.threads || []) {
              const customer = digits(thread?.id);
              if (!customer) continue;
              for (const m of thread?.messages || []) {
                if (!m?.id) continue;
                const fromCustomer = digits(m.from) === customer;
                const r = await storeMessage({
                  businessId: biz, phoneDigits: customer, waId: String(m.id), senderType: fromCustomer ? 'CUSTOMER' : 'EMPLOYEE',
                  senderName: fromCustomer ? `+${customer}` : 'Business App (phone)', content: messageText(m),
                  createdAt: tsFromUnix(m.timestamp), meta: { type: m.type, source: 'history' }, touch: false,
                });
                r.stored ? processed++ : ignored++;
              }
            }
          }
          await db.prepare('UPDATE whatsapp_accounts SET history_status = ? WHERE id = ?').run(declined ? 'declined' : 'imported', account.id);
          break;
        }
        case 'smb_app_state_sync': { // contact names saved on the phone
          for (const s of value.state_sync || []) {
            const phone = digits(s?.contact?.phone_number);
            const full = String(s?.contact?.full_name || '').trim();
            if (!phone || !full || s.action === 'remove') continue;
            for (const p of [`+${phone}`, phone]) {
              await db.prepare('UPDATE conversations SET customer_name = ? WHERE business_id = ? AND customer_phone = ?').run(full.slice(0, 120), biz, p);
            }
            processed++;
          }
          break;
        }
        default: ignored++;
      }
    }
  }
  return { processed, ignored };
}

whatsappRouter.post('/webhooks/whatsapp', async (req: Request, res: Response) => {
  if (!env('META_APP_SECRET')) return res.status(503).json({ error: 'WhatsApp webhook is not configured on this server.' });
  if (!validSignature(req)) {
    console.warn('[whatsapp] rejected webhook: invalid signature (body source:', (req as any).rawBodySource || 'n/a', ')');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  if (req.body?.object !== 'whatsapp_business_account') return res.status(200).json({ status: 'ignored' });
  try {
    const out = await processWebhookPayload(req.body);
    res.status(200).json({ status: 'ok', ...out });
  } catch (err: any) {
    // 500 makes Meta retry; storeMessage de-duplicates, so retries are safe.
    console.error('[whatsapp] webhook processing failed:', err?.stack || err);
    res.status(500).json({ error: 'Processing failed' });
  }
});

// ---------------------------------------------------------------------------
// Tenant-facing API
// ---------------------------------------------------------------------------
const staff = requireRole('BUSINESS_OWNER', 'EMPLOYEE');
const ownerOnly = requireRole('BUSINESS_OWNER');
const user = (req: Request) => (req as any).user as AuthUser;

function waErr(res: Response, err: any) {
  if (err instanceof WhatsAppError) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error('[whatsapp] error:', err?.stack || err);
  return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

whatsappRouter.get('/whatsapp/status', authMiddleware, staff, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const cfg = metaConfig();
  const acc = await getAccount(bizId);
  res.json({
    platform: { manualAvailable: cfg.webhookReady, connectAvailable: cfg.ready, webhookReady: cfg.webhookReady, appId: cfg.ready ? cfg.appId : null, configId: cfg.ready ? cfg.configId : null, graphVersion: cfg.graphVersion },
    connected: !!acc && acc.status === 'Connected',
    account: acc ? publicAccount(acc) : null,
  });
});

whatsappRouter.post('/whatsapp/connect', authMiddleware, ownerOnly, async (req: Request, res: Response) => {
  try {
    const cfg = metaConfig();
    if (!cfg.ready) throw new WhatsAppError(503, 'WhatsApp connection is not enabled on this server yet. Ask the platform administrator to finish the Meta setup.', 'WA_NOT_CONFIGURED');
    const u = user(req);
    if (!rateLimit(`wa-connect:${u.id}`, 10, 10 * 60 * 1000).ok) throw new WhatsAppError(429, 'Too many attempts. Please wait a few minutes.', 'RATE_LIMITED');
    const bizId = await resolveBusinessId(req);
    const { code, phone_number_id: phoneId, waba_id: wabaId } = req.body || {};
    if (typeof code !== 'string' || code.length < 10 || code.length > 2000 || !idOk(phoneId) || !idOk(wabaId)) {
      throw new WhatsAppError(400, 'The WhatsApp sign-up did not finish. Please try connecting again.', 'BAD_REQUEST');
    }
    const taken = (await db.prepare('SELECT business_id FROM whatsapp_accounts WHERE phone_number_id = ?').get(phoneId)) as any;
    if (taken && taken.business_id !== bizId) throw new WhatsAppError(409, 'This WhatsApp number is already connected to another store.', 'ALREADY_CONNECTED');

    // 1. code -> business access token (server-side only; needs the app secret)
    const tok = await graph('oauth/access_token', { query: { client_id: cfg.appId, client_secret: env('META_APP_SECRET'), code } });
    const accessToken = String(tok?.access_token || '');
    if (!accessToken) throw new WhatsAppError(502, 'WhatsApp did not return an access token. Please try again.', 'META_ERROR');

    // 2. Proof of ownership: only someone authorised on this number can read it with this token.
    const phone = await graph(phoneId, { token: accessToken, query: { fields: 'display_phone_number,verified_name' } });

    // 3. Subscribe our app to the customer's WABA so its webhooks reach us.
    await graph(`${wabaId}/subscribed_apps`, { method: 'POST', token: accessToken });

    const enc = encryptSecret(accessToken);
    const existing = await getAccount(bizId);
    if (existing) {
      await db.prepare(`UPDATE whatsapp_accounts SET waba_id=?, phone_number_id=?, display_phone=?, verified_name=?, access_token_enc=?, status='Connected', history_status=NULL, connected_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(wabaId, phoneId, phone?.display_phone_number || null, phone?.verified_name || null, enc, u.id, existing.id);
    } else {
      await db.prepare(`INSERT INTO whatsapp_accounts (id, business_id, waba_id, phone_number_id, display_phone, verified_name, access_token_enc, mode, status, auto_reply, connected_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'COEXISTENCE', 'Connected', 1, ?)`)
        .run(newId('wa'), bizId, wabaId, phoneId, phone?.display_phone_number || null, phone?.verified_name || null, enc, u.id);
    }

    // 4. Coexistence: ask Meta to send contacts + chat history (best effort; must happen shortly after onboarding).
    let history = 'requested';
    for (const sync_type of ['smb_app_state_sync', 'history']) {
      try { await graph(`${phoneId}/smb_app_data`, { method: 'POST', token: accessToken, body: { messaging_product: 'whatsapp', sync_type } }); }
      catch { history = 'not_requested'; }
    }
    await db.prepare('UPDATE whatsapp_accounts SET history_status = ? WHERE business_id = ?').run(history, bizId);

    await audit(bizId, u.id, 'whatsapp.connect', 'whatsapp_account', phoneId, { waba_id: wabaId });
    const fresh = (await getAccount(bizId))!;
    res.status(201).json({ connected: true, account: publicAccount(fresh) });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ error: 'This WhatsApp number is already connected to another store.', code: 'ALREADY_CONNECTED' });
    return waErr(res, err);
  }
});

// Manual connection: the owner pastes the IDs and a System User token from their OWN Meta developer app.
// Works while the platform app is not yet an approved Tech Provider. The token is verified against Meta, then stored encrypted.
whatsappRouter.post('/whatsapp/connect-manual', authMiddleware, ownerOnly, async (req: Request, res: Response) => {
  try {
    const u = user(req);
    if (!rateLimit(`wa-connect:${u.id}`, 10, 10 * 60 * 1000).ok) throw new WhatsAppError(429, 'Too many attempts. Please wait a few minutes.', 'RATE_LIMITED');
    const bizId = await resolveBusinessId(req);
    const { phone_number_id: phoneId, waba_id: wabaId } = req.body || {};
    const accessToken = typeof req.body?.access_token === 'string' ? req.body.access_token.trim() : '';
    if (!idOk(phoneId) || !idOk(wabaId) || accessToken.length < 20 || accessToken.length > 1000 || /\s/.test(accessToken)) {
      throw new WhatsAppError(400, 'Enter the Phone Number ID, the WhatsApp Business Account ID and the access token exactly as shown in Meta.', 'BAD_REQUEST');
    }
    const taken = (await db.prepare('SELECT business_id FROM whatsapp_accounts WHERE phone_number_id = ?').get(phoneId)) as any;
    if (taken && taken.business_id !== bizId) throw new WhatsAppError(409, 'This WhatsApp number is already connected to another store.', 'ALREADY_CONNECTED');

    // 1. The token must be able to read this phone number...
    const phone = await graph(phoneId, { token: accessToken, query: { fields: 'display_phone_number,verified_name' } });
    // 2. ...and that number must belong to the WABA given (stops mixing IDs from different accounts).
    const list = await graph(`${wabaId}/phone_numbers`, { token: accessToken, query: { fields: 'id', limit: '50' } });
    if (!Array.isArray(list?.data) || !list.data.some((p: any) => String(p?.id) === phoneId)) {
      throw new WhatsAppError(400, 'That Phone Number ID does not belong to this WhatsApp Business Account ID.', 'BAD_REQUEST');
    }
    // 3. Deliver this account's webhooks to the platform app.
    await graph(`${wabaId}/subscribed_apps`, { method: 'POST', token: accessToken });

    const enc = encryptSecret(accessToken);
    const existing = await getAccount(bizId);
    if (existing) {
      await db.prepare(`UPDATE whatsapp_accounts SET waba_id=?, phone_number_id=?, display_phone=?, verified_name=?, access_token_enc=?, mode='MANUAL', status='Connected', history_status=NULL, connected_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(wabaId, phoneId, phone?.display_phone_number || null, phone?.verified_name || null, enc, u.id, existing.id);
    } else {
      await db.prepare(`INSERT INTO whatsapp_accounts (id, business_id, waba_id, phone_number_id, display_phone, verified_name, access_token_enc, mode, status, auto_reply, connected_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'MANUAL', 'Connected', 1, ?)`)
        .run(newId('wa'), bizId, wabaId, phoneId, phone?.display_phone_number || null, phone?.verified_name || null, enc, u.id);
    }
    await audit(bizId, u.id, 'whatsapp.connect_manual', 'whatsapp_account', phoneId, { waba_id: wabaId });
    const fresh = (await getAccount(bizId))!;
    res.status(201).json({ connected: true, account: publicAccount(fresh) });
  } catch (err) {
    if (isDuplicate(err)) return res.status(409).json({ error: 'This WhatsApp number is already connected to another store.', code: 'ALREADY_CONNECTED' });
    return waErr(res, err);
  }
});

whatsappRouter.put('/whatsapp/settings', authMiddleware, ownerOnly, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  if (typeof req.body?.auto_reply !== 'boolean') return res.status(400).json({ error: 'auto_reply must be true or false' });
  const r = await db.prepare('UPDATE whatsapp_accounts SET auto_reply = ?, updated_at = CURRENT_TIMESTAMP WHERE business_id = ?').run(req.body.auto_reply ? 1 : 0, bizId);
  if (!r.changes) return res.status(404).json({ error: 'WhatsApp is not connected yet.' });
  await audit(bizId, user(req).id, 'whatsapp.auto_reply', 'whatsapp_account', null, { auto_reply: req.body.auto_reply });
  res.json({ auto_reply: req.body.auto_reply });
});

whatsappRouter.delete('/whatsapp/connection', authMiddleware, ownerOnly, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const acc = await getAccount(bizId);
    if (!acc) return res.status(404).json({ error: 'WhatsApp is not connected.' });
    try { await graph(`${acc.waba_id}/subscribed_apps`, { method: 'DELETE', token: decryptSecret(acc.access_token_enc) }); }
    catch (e: any) { console.warn('[whatsapp] could not unsubscribe on disconnect:', e?.message); } // never block a disconnect
    await db.prepare('DELETE FROM whatsapp_accounts WHERE id = ? AND business_id = ?').run(acc.id, bizId);
    await audit(bizId, user(req).id, 'whatsapp.disconnect', 'whatsapp_account', acc.phone_number_id);
    res.json({ message: 'WhatsApp disconnected. Your chats stay on your phone and in ShopMate.' });
  } catch (err) { return waErr(res, err); }
});

// Reply to a customer from ShopMate; it also appears in the WhatsApp Business app on the owner's phone.
whatsappRouter.post('/whatsapp/conversations/:id/reply', authMiddleware, staff, async (req: Request, res: Response) => {
  try {
    const u = user(req);
    const bizId = await resolveBusinessId(req);
    if (!rateLimit(`wa-reply:${u.id}`, 60, 60 * 1000).ok) throw new WhatsAppError(429, 'You are sending messages too fast. Please slow down.', 'RATE_LIMITED');
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text || text.length > 4000) throw new WhatsAppError(400, 'Message must be between 1 and 4000 characters.', 'BAD_REQUEST');
    const conv = (await db.prepare('SELECT id, customer_phone, channel FROM conversations WHERE id = ? AND business_id = ?').get(req.params.id, bizId)) as any;
    if (!conv) throw new WhatsAppError(404, 'Conversation not found.', 'NOT_FOUND');
    const acc = await getAccount(bizId);
    if (!acc || acc.status !== 'Connected') throw new WhatsAppError(409, 'Connect WhatsApp first to reply to customers on WhatsApp.', 'NOT_CONNECTED');
    const to = digits(conv.customer_phone);
    if (!to) throw new WhatsAppError(409, 'This conversation has no phone number.', 'NO_PHONE');

    const last = (await db.prepare(`SELECT created_at FROM messages WHERE conversation_id = ? AND sender_type = 'CUSTOMER' ORDER BY created_at DESC LIMIT 1`).get(conv.id)) as any;
    const lastMs = last?.created_at ? Date.parse(String(last.created_at).replace(' ', 'T') + (/[zZ]|[+-]\d\d(:?\d\d)?$/.test(String(last.created_at)) ? '' : 'Z')) : NaN;
    if (!Number.isFinite(lastMs) || Date.now() - lastMs > SERVICE_WINDOW_MS) {
      throw new WhatsAppError(409, 'The 24-hour WhatsApp reply window has closed. Ask the customer to message you first, or send an approved template from the WhatsApp Business app.', 'WINDOW_CLOSED');
    }
    const waId = await sendWhatsAppText(acc, to, text);
    await storeMessage({ businessId: bizId, phoneDigits: to, waId: waId || undefined, senderType: 'EMPLOYEE', senderName: u.name || 'Staff', content: text, meta: { source: 'shopmate' } });
    res.status(201).json({ sent: true });
  } catch (err) { return waErr(res, err); }
});

// Authenticated simulator: exercises the same pipeline without Meta (stored in the caller's own store only).
whatsappRouter.post('/whatsapp/simulate', authMiddleware, staff, async (req: Request, res: Response) => {
  try {
    const u = user(req);
    if (!rateLimit(`wa-sim:${u.id}:${clientIp(req)}`, 20, 60 * 1000).ok) throw new WhatsAppError(429, 'Too many test messages. Please wait a minute.', 'RATE_LIMITED');
    const bizId = await resolveBusinessId(req);
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';
    if (!message) throw new WhatsAppError(400, 'Message is required', 'BAD_REQUEST');
    const phone = digits(req.body?.phone) || '15550000001';
    const history = (await db.prepare(`SELECT m.sender_type, m.content FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.business_id = ? AND c.channel = 'WHATSAPP_SIMULATOR' AND c.customer_phone = ? ORDER BY m.created_at DESC LIMIT 6`).all(bizId, `+${phone}`) as any[])
      .reverse().map((m) => ({ role: m.sender_type === 'CUSTOMER' ? 'user' : 'assistant', content: String(m.content).slice(0, 600) }));
    const ai = await runGeminiAgent(bizId, message, history);
    const r = await storeMessage({ businessId: bizId, phoneDigits: phone, senderType: 'CUSTOMER', senderName: 'Simulator customer', content: message, channel: 'WHATSAPP_SIMULATOR', meta: { source: 'simulator' } });
    await storeMessage({ businessId: bizId, phoneDigits: phone, senderType: 'AI', senderName: ai.assistantName || 'ShopMate AI', content: ai.reply, channel: 'WHATSAPP_SIMULATOR', meta: { engine: ai.engine, source: 'simulator' } });
    res.json({ status: 'success', autoReply: ai.reply, engine: ai.engine, conversationId: r.conversationId });
  } catch (err) { return waErr(res, err); }
});
