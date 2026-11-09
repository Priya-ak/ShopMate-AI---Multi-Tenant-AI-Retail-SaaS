import { db, ensureDatabase, newId } from './db.js';
import { hashPassword, verifyPassword, NO_PASSWORD } from './auth.js';

/**
 * One-time (per process) application bootstrap: make sure the schema exists and that the platform
 * owner account configured through SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD exists.
 * The credentials come only from environment variables - nothing is hard-coded or logged.
 */
async function provisionSuperAdmin() {
  const email = (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;
  const password = process.env.SUPERADMIN_PASSWORD || '';
  if (password && password.length < 8) {
    console.warn('[bootstrap] SUPERADMIN_PASSWORD is shorter than 8 characters and was ignored.');
  }
  const usePassword = password.length >= 8;

  const existing = await db.prepare('SELECT id, role, password_hash, is_demo FROM users WHERE email = ?').get(email);
  if (!existing) {
    await db.prepare(
      `INSERT INTO users (id, email, password_hash, name, role, auth_provider)
       VALUES (?, ?, ?, 'Platform Owner', 'SUPER_ADMIN', ?)`
    ).run(newId('usr'), email, usePassword ? await hashPassword(password) : NO_PASSWORD, usePassword ? 'password' : 'google');
    console.log('[bootstrap] Super admin account created.');
    return;
  }
  if (existing.role !== 'SUPER_ADMIN' || existing.is_demo) {
    console.warn('[bootstrap] SUPERADMIN_EMAIL belongs to a non-admin account; it was NOT promoted.');
    return;
  }
  // Keep the stored password in sync with the environment variable (lets the owner rotate it).
  if (usePassword && !(await verifyPassword(password, existing.password_hash)).ok) {
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), existing.id);
    console.log('[bootstrap] Super admin password updated from environment.');
  }
}

let ready: Promise<void> | null = null;

export function ensureApp(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await ensureDatabase();
      await provisionSuperAdmin();
    })().catch((err) => {
      ready = null; // allow a retry on the next request (e.g. DATABASE_URL fixed, transient outage)
      throw err;
    });
  }
  return ready;
}
