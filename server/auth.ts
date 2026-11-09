import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { db, newId } from './db.js';

export type Role = 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'EMPLOYEE' | 'CUSTOMER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  business_id: string | null;
  phone?: string;
  is_demo?: boolean;
  auth_provider?: string;
}

/** The shared sandbox tenant behind the one-click demo personas. */
export const DEMO_BUSINESS_ID = 'biz_demo_store_001';

// ---------------------------------------------------------------------------
// Passwords (scrypt). Legacy unsalted SHA-256 hashes are still accepted and are
// upgraded transparently on the next successful login.
// ---------------------------------------------------------------------------
const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

/** Marker stored for accounts that can only sign in with Google. Never matches a password. */
export const NO_PASSWORD = '!google-only';

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function legacySha256(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!stored || stored === NO_PASSWORD) return { ok: false, needsRehash: false };
  if (stored.startsWith('s1$')) {
    const [, saltHex, hashHex] = stored.split('$');
    if (!saltHex || !hashHex) return { ok: false, needsRehash: false };
    const hash = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
    return { ok: safeEqual(hash.toString('hex'), hashHex), needsRehash: false };
  }
  const ok = safeEqual(legacySha256(password), stored);
  return { ok, needsRehash: ok };
}

// ---------------------------------------------------------------------------
// Stateless session tokens (HMAC-SHA256). Serverless instances share no memory,
// so the old in-process session Map cannot work on Vercel.
// ---------------------------------------------------------------------------
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
let secretCache: Buffer | null = null;

function sessionSecret(): Buffer {
  if (secretCache) return secretCache;
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    secretCache = Buffer.from(fromEnv);
  } else if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
    console.warn('[auth] SESSION_SECRET is not set - deriving a stable secret from the database URL. Set SESSION_SECRET (16+ chars) in your environment.');
    secretCache = crypto.createHash('sha256').update('shopmate-session-v1:' + (process.env.DATABASE_URL || process.env.POSTGRES_URL)).digest();
  } else {
    secretCache = crypto.randomBytes(32); // local dev: sessions end when the process restarts
  }
  return secretCache;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function signSession(userId: string, ttlSeconds = SESSION_TTL_SECONDS): string {
  const body = b64url(JSON.stringify({ uid: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = b64url(crypto.createHmac('sha256', sessionSecret()).update(body).digest());
  return `shp.${body}.${sig}`;
}

export function verifySession(token: string): { uid: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'shp') return null;
  const expected = b64url(crypto.createHmac('sha256', sessionSecret()).update(parts[1]).digest());
  if (!safeEqual(expected, parts[2])) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.uid !== 'string' || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------
export function clientIp(req: Request): string {
  const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return (fwd || req.socket?.remoteAddress || '').slice(0, 64);
}

/** Trim, strip control characters and cap the length of user supplied text. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;

export const normalizePhone = (p: unknown) => (typeof p === 'string' ? p.replace(/[\s\-().]/g, '') : '');

// Best-effort, per-instance limiter (serverless instances do not share memory).
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count++;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

// ---------------------------------------------------------------------------
// Users, sessions & middleware
// ---------------------------------------------------------------------------
export function toAuthUser(row: any): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    business_id: row.business_id ?? null,
    phone: row.phone ?? undefined,
    is_demo: !!row.is_demo,
    auth_provider: row.auth_provider || 'password',
  };
}

const tsCutoff = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace('T', ' ').slice(0, 19);

export async function loadUserFromRequest(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const session = verifySession(header.substring(7));
  if (!session) return null;

  const row = await db.prepare(
    'SELECT id, email, name, role, business_id, phone, is_demo, auth_provider, last_seen_at FROM users WHERE id = ?'
  ).get(session.uid);
  if (!row) return null;

  // Presence tracking for the super-admin panel (at most one write per user every 5 minutes).
  if (!row.last_seen_at || row.last_seen_at < tsCutoff(5 * 60 * 1000)) {
    await db.prepare('UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
  }
  return toAuthUser(row);
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await loadUserFromRequest(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
    (req as any).user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Auth that never fails: used by the public catalogue / shopping endpoints. */
export async function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await loadUserFromRequest(req);
    if (user) (req as any).user = user;
  } catch {
    // an unreadable token simply means "anonymous"
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as AuthUser | undefined;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden: you do not have permission for this action' });
    }
    next();
  };
}

/** Super-admin portal access: a real (non-demo) SUPER_ADMIN only. */
export function requireRealSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user as AuthUser | undefined;
  if (!user || user.role !== 'SUPER_ADMIN' || user.is_demo) {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }
  next();
}

// ---------------------------------------------------------------------------
// Login / activity history (feeds the Super Admin panel)
// ---------------------------------------------------------------------------
export type LoginMethod = 'password' | 'google' | 'demo' | 'register' | 'superadmin';

export async function recordLoginEvent(opts: {
  req: Request;
  method: LoginMethod;
  success: boolean;
  user?: Pick<AuthUser, 'id' | 'email' | 'name' | 'role' | 'business_id'> | null;
  email?: string;
  reason?: string;
}) {
  try {
    const { req, method, success, user, reason } = opts;
    await db.prepare(
      `INSERT INTO login_events (id, user_id, email, name, role, business_id, method, success, failure_reason, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId('log'),
      user?.id ?? null,
      (user?.email ?? opts.email ?? '').slice(0, 254) || null,
      user?.name ?? null,
      user?.role ?? null,
      user?.business_id ?? null,
      method,
      success ? 1 : 0,
      reason ? reason.slice(0, 200) : null,
      clientIp(req) || null,
      ((req.headers['user-agent'] as string) || '').slice(0, 255) || null
    );
    if (success && user) {
      await db.prepare(
        `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, last_seen_at = CURRENT_TIMESTAMP,
                login_count = COALESCE(login_count, 0) + 1 WHERE id = ?`
      ).run(user.id);
    }
  } catch (err: any) {
    // History is best-effort: never block a sign-in because logging failed.
    console.error('[auth] could not record login event:', err?.message);
  }
}

// ---------------------------------------------------------------------------
// Tenant resolution (unchanged behaviour, hardened for header spoofing)
// ---------------------------------------------------------------------------
export async function resolveBusinessId(req: Request): Promise<string> {
  const user = (req as any).user as AuthUser | undefined;
  if (user && user.business_id) return user.business_id;

  const headerBiz = req.headers['x-business-id'] as string | undefined;
  // A signed-in account without a tenant (e.g. a plain customer) must not be able to
  // reach another tenant's data by sending a header. Only super admins may.
  const headerAllowed = !user || user.role === 'SUPER_ADMIN';
  if (headerBiz && headerAllowed) return headerBiz;

  const firstBiz = await db.prepare('SELECT id FROM businesses WHERE is_active = 1 ORDER BY COALESCE(is_demo, 0) DESC, created_at ASC LIMIT 1').get();
  return firstBiz?.id || '';
}
