import { Request, Response } from 'express';
import { asyncRouter } from './asyncRouter.js';
import crypto from 'node:crypto';
import { db, newId } from './db.js';
import {
  AuthUser, authMiddleware, clientIp, cleanText, hashPassword, rateLimit, recordLoginEvent, signSession,
  toAuthUser, verifyPassword,
} from './auth.js';
import {
  AccountError, DemoPersona, createBusinessOwner, ensureDemoPersona, serializeBusiness, validateOwnerInput,
} from './accounts.js';

export const authRouter = asyncRouter();

const GOOGLE_CLIENT_ID = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
export const superAdminEmail = () => (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();

function sendError(res: Response, err: any, fallback: string) {
  if (err instanceof AccountError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(`[auth] ${fallback}:`, err?.message || err);
  return res.status(500).json({ error: fallback });
}

function tooMany(res: Response, retryAfter: number) {
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({ error: 'Too many attempts. Please wait a moment and try again.' });
}

async function sessionFor(row: any, extra: Record<string, unknown> = {}) {
  const user = toAuthUser(row);
  const business = user.business_id
    ? serializeBusiness(await db.prepare('SELECT * FROM businesses WHERE id = ?').get(user.business_id))
    : null;
  return { user, token: signSession(user.id), business, businessName: business?.name, ...extra };
}

// ---------------------------------------------------------------------------
// Public client configuration (the Google client id is public by design)
// ---------------------------------------------------------------------------
authRouter.get('/auth/config', (_req: Request, res: Response) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID() || null });
});

// ---------------------------------------------------------------------------
// POST /api/auth/register  (business owner sign-up with email + password)
// ---------------------------------------------------------------------------
authRouter.post('/auth/register', async (req: Request, res: Response) => {
  const rl = rateLimit(`register:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  try {
    const fields = validateOwnerInput(
      {
        email: req.body?.email,
        name: req.body?.name,
        phone: req.body?.phone,
        businessName: req.body?.businessName,
        businessCategory: req.body?.businessCategory,
        password: req.body?.password,
      },
      { requirePassword: true }
    );
    const { user, business } = await createBusinessOwner({ ...fields, password: req.body.password });
    await recordLoginEvent({ req, method: 'register', success: true, user });
    res.status(201).json({ user, token: signSession(user.id), business, businessName: business?.name });
  } catch (err) {
    sendError(res, err, 'Registration failed. Please try again.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
authRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const email = cleanText(req.body?.email, 254).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const rl = rateLimit(`login:${clientIp(req)}:${email}`, 8, 10 * 60 * 1000);
    if (!rl.ok) return tooMany(res, rl.retryAfter);

    const row = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email);
    const check = row ? await verifyPassword(password, row.password_hash) : { ok: false, needsRehash: false };

    if (!row || !check.ok) {
      await recordLoginEvent({ req, method: 'password', success: false, email, reason: row ? 'bad_password' : 'unknown_email' });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (check.needsRehash) {
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), row.id);
    }
    await recordLoginEvent({ req, method: row.is_demo ? 'demo' : 'password', success: true, user: toAuthUser(row) });
    res.json(await sessionFor(row));
  } catch (err) {
    sendError(res, err, 'Sign in failed. Please try again.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/demo-login  (one-click personas: no credentials required)
// ---------------------------------------------------------------------------
const PERSONAS: DemoPersona[] = ['OWNER', 'EMPLOYEE', 'CUSTOMER', 'SUPER_ADMIN'];

authRouter.post('/auth/demo-login', async (req: Request, res: Response) => {
  const rl = rateLimit(`demo:${clientIp(req)}`, 40, 10 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  try {
    const requested = String(req.body?.persona || 'OWNER').toUpperCase() as DemoPersona;
    const persona = PERSONAS.includes(requested) ? requested : 'OWNER';
    const { user, business } = await ensureDemoPersona(persona);
    await recordLoginEvent({ req, method: 'demo', success: true, user });
    res.json({ user, token: signSession(user.id), business, businessName: business?.name });
  } catch (err) {
    sendError(res, err, 'Could not start the demo. Please try again.');
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/google  (sign in / sign up with a Google ID token)
// ---------------------------------------------------------------------------
interface GoogleProfile { sub: string; email: string; name: string; picture?: string }

async function verifyGoogleCredential(credential: unknown): Promise<GoogleProfile> {
  const clientId = GOOGLE_CLIENT_ID();
  if (!clientId) throw new AccountError(503, 'Google sign-in is not configured on this server yet.', 'GOOGLE_NOT_CONFIGURED');
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 4096) {
    throw new AccountError(400, 'Missing Google credential.');
  }

  let info: any;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`tokeninfo ${r.status}`);
    info = await r.json();
  } catch (err: any) {
    console.error('[auth] Google token verification failed:', err?.message);
    throw new AccountError(401, 'Google sign-in could not be verified. Please try again.', 'GOOGLE_INVALID');
  }

  const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
  const verified = info.email_verified === true || info.email_verified === 'true';
  if (info.aud !== clientId || !issuerOk || !verified || !info.email || !info.sub || Number(info.exp) < Date.now() / 1000) {
    throw new AccountError(401, 'Google sign-in could not be verified. Please try again.', 'GOOGLE_INVALID');
  }
  const email = String(info.email).toLowerCase();
  return { sub: String(info.sub), email, name: cleanText(info.name, 80) || email.split('@')[0], picture: info.picture };
}

authRouter.post('/auth/google', async (req: Request, res: Response) => {
  const rl = rateLimit(`google:${clientIp(req)}`, 30, 10 * 60 * 1000);
  if (!rl.ok) return tooMany(res, rl.retryAfter);

  const portal = req.body?.portal === 'superadmin' ? 'superadmin' : 'app';
  try {
    const profile = await verifyGoogleCredential(req.body?.credential);

    let row = await db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.sub);
    if (!row) row = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(profile.email);

    // The configured platform owner may always enter the super-admin portal with Google.
    if (portal === 'superadmin' && !row && profile.email === superAdminEmail()) {
      const id = newId('usr');
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, auth_provider, google_id, avatar_url)
         VALUES (?, ?, '!google-only', ?, 'SUPER_ADMIN', 'google', ?, ?)`
      ).run(id, profile.email, profile.name, profile.sub, profile.picture ?? null);
      row = await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    }

    if (portal === 'superadmin') {
      if (!row || row.role !== 'SUPER_ADMIN' || row.is_demo) {
        await recordLoginEvent({ req, method: 'superadmin', success: false, email: profile.email, reason: 'not_super_admin' });
        return res.status(403).json({ error: 'This Google account is not authorised for the Super Admin portal.' });
      }
    }

    if (row) {
      if (!row.google_id) {
        await db.prepare('UPDATE users SET google_id = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?').run(profile.sub, profile.picture ?? null, row.id);
        row.google_id = profile.sub;
      } else if (row.google_id !== profile.sub) {
        await recordLoginEvent({ req, method: 'google', success: false, email: profile.email, reason: 'google_id_mismatch' });
        return res.status(409).json({ error: 'This email is linked to a different Google account.' });
      }
      await recordLoginEvent({ req, method: portal === 'superadmin' ? 'superadmin' : 'google', success: true, user: toAuthUser(row) });
      return res.json(await sessionFor(row));
    }

    // No account yet -> only the registration flow may create one.
    if (req.body?.mode !== 'register') {
      return res.status(404).json({
        error: `No ShopMate account exists for ${profile.email}. Please register your business first.`,
        code: 'NO_ACCOUNT',
        profile: { name: profile.name, email: profile.email },
      });
    }

    const fields = validateOwnerInput(
      { email: profile.email, name: req.body?.name || profile.name, phone: req.body?.phone, businessName: req.body?.businessName, businessCategory: req.body?.businessCategory },
      { requirePassword: false }
    );
    const { user, business } = await createBusinessOwner({ ...fields, googleId: profile.sub, avatarUrl: profile.picture });
    await recordLoginEvent({ req, method: 'register', success: true, user });
    res.status(201).json({ user, token: signSession(user.id), business, businessName: business?.name });
  } catch (err) {
    sendError(res, err, 'Google sign-in failed. Please try again.');
  }
});

// ---------------------------------------------------------------------------
// Session endpoints
// ---------------------------------------------------------------------------
authRouter.post('/auth/logout', authMiddleware, (_req: Request, res: Response) => {
  // Sessions are stateless signed tokens; the client discards its copy.
  res.json({ message: 'Logged out successfully' });
});

authRouter.get('/auth/me', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  const business = user.business_id
    ? serializeBusiness(await db.prepare('SELECT * FROM businesses WHERE id = ?').get(user.business_id))
    : null;
  res.json({ user, business });
});

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
// There is no outbound e-mail provider wired up yet, so a reset token cannot be delivered to its
// owner. It is therefore only echoed back in non-production environments (developer convenience);
// in production the endpoint stays silent and never issues tokens for platform administrators.
const exposeResetToken = () => process.env.NODE_ENV !== 'production' && !process.env.VERCEL;

authRouter.post('/auth/forgot-password', async (req: Request, res: Response) => {
  try {
    const email = cleanText(req.body?.email, 254).toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const rl = rateLimit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
    if (!rl.ok) return tooMany(res, rl.retryAfter);

    const generic = { message: 'If that email exists, password reset instructions have been created.' };
    const user = await db.prepare('SELECT id, role FROM users WHERE LOWER(email) = ?').get(email);
    if (!user || user.role === 'SUPER_ADMIN') return res.json(generic);

    const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await db.prepare('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
      .run(newId('tok'), user.id, resetToken, expiresAt);

    res.json(exposeResetToken() ? { message: 'Password reset token generated successfully.', resetToken } : generic);
  } catch (err) {
    sendError(res, err, 'Could not process the request.');
  }
});

authRouter.post('/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || typeof newPassword !== 'string') return res.status(400).json({ error: 'Token and newPassword are required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long.' });

    const record = await db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(String(token));
    if (!record || new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(newPassword), record.user_id);
    await db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(record.id);
    res.json({ message: 'Password has been updated successfully.' });
  } catch (err) {
    sendError(res, err, 'Could not reset the password.');
  }
});

