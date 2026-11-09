import { Request, Response } from 'express';
import { asyncRouter } from './asyncRouter.js';
import { db } from './db.js';
import {
  authMiddleware, requireRealSuperAdmin, verifyPassword, hashPassword, signSession, toAuthUser,
  recordLoginEvent, rateLimit, clientIp, cleanText, isValidEmail,
} from './auth.js';

/**
 * Super Admin portal API (mounted at /api/superadmin). Read-only platform analytics: who signed in,
 * who registered, buyers across stores, businesses and orders. Real (non-demo) super admins only.
 */
export const superAdminRouter = asyncRouter();

const ts = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace('T', ' ').slice(0, 19);
const DAY = 24 * 60 * 60 * 1000;
const num = (v: any) => Number(v) || 0;

function includeDemo(req: Request): boolean {
  return req.query.include_demo === '1' || req.query.include_demo === 'true';
}

function paging(req: Request) {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '25'), 10) || 25, 1), 100);
  const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
}

const like = (q: unknown) => `%${cleanText(q, 80).replace(/[%_\\]/g, '')}%`;

// --- Sign in (separate from the store login so failures never reveal whether an account exists) ---
superAdminRouter.post('/login', async (req: Request, res: Response) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const rl = rateLimit(`sa-login:${clientIp(req)}`, 8, 10 * 60 * 1000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }
  const generic = { error: 'Invalid super admin credentials' };
  if (!isValidEmail(email) || !password) return res.status(401).json(generic);

  const row = await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const allowed = row && row.role === 'SUPER_ADMIN' && !row.is_demo;
  const check = allowed ? await verifyPassword(password, row.password_hash) : { ok: false, needsRehash: false };
  if (!allowed || !check.ok) {
    await recordLoginEvent({ req, method: 'superadmin', success: false, email, reason: 'bad credentials' });
    return res.status(401).json(generic);
  }
  if (check.needsRehash) {
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), row.id);
  }
  const user = toAuthUser(row);
  await recordLoginEvent({ req, method: 'superadmin', success: true, user });
  res.json({ user, token: signSession(user.id, 12 * 60 * 60) });
});

superAdminRouter.use(authMiddleware, requireRealSuperAdmin);

// SQL fragments that hide the sandbox/demo data unless asked for.
const loginDemoFilter = (demo: boolean) => (demo ? '' : "AND e.method <> 'demo' AND COALESCE(u.is_demo, 0) = 0");

superAdminRouter.get('/overview', async (req: Request, res: Response) => {
  const demo = includeDemo(req);
  const uDemo = demo ? '' : 'AND COALESCE(u.is_demo, 0) = 0';
  const bDemo = demo ? '' : 'AND COALESCE(b.is_demo, 0) = 0';
  const ld = loginDemoFilter(demo);
  const since = (days: number) => ts(days * DAY);

  const roles = await db.prepare(`SELECT u.role AS role, COUNT(*) AS n FROM users u WHERE 1=1 ${uDemo} GROUP BY u.role`).all();
  const roleCount = (r: string) => num(roles.find((x: any) => x.role === r)?.n);

  const businesses = await db.prepare(`SELECT COUNT(*) AS n FROM businesses b WHERE 1=1 ${bDemo}`).get();
  const buyers = await db.prepare(
    `SELECT COUNT(*) AS n FROM customers c JOIN businesses b ON b.id = c.business_id WHERE 1=1 ${bDemo}`
  ).get();
  const orders = await db.prepare(
    `SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN o.order_status <> 'Cancelled' THEN o.total_amount ELSE 0 END), 0) AS revenue
       FROM orders o JOIN businesses b ON b.id = o.business_id WHERE 1=1 ${bDemo}`
  ).get();

  const loginCount = async (cutoff?: string) =>
    num((await db.prepare(
      `SELECT COUNT(*) AS n FROM login_events e LEFT JOIN users u ON u.id = e.user_id
        WHERE e.success = 1 AND e.method <> 'register' ${ld} ${cutoff ? 'AND e.created_at >= ?' : ''}`
    ).get(...(cutoff ? [cutoff] : [])))?.n);

  const uniq7 = await db.prepare(
    `SELECT COUNT(DISTINCT e.user_id) AS n FROM login_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.success = 1 AND e.user_id IS NOT NULL AND e.method <> 'register' AND e.created_at >= ? ${ld}`
  ).get(since(7));
  const activeNow = await db.prepare(
    `SELECT COUNT(*) AS n FROM users u WHERE u.last_seen_at >= ? ${uDemo}`
  ).get(ts(15 * 60 * 1000));
  const failed24 = await db.prepare(
    `SELECT COUNT(*) AS n FROM login_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.success = 0 AND e.created_at >= ? ${ld}`
  ).get(ts(DAY));
  const demoVisits = await db.prepare(`SELECT COUNT(*) AS n FROM login_events WHERE method = 'demo' AND success = 1`).get();

  const loginsByDay = await db.prepare(
    `SELECT substr(e.created_at, 1, 10) AS day, COUNT(*) AS logins, COUNT(DISTINCT e.user_id) AS users
       FROM login_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.success = 1 AND e.method <> 'register' AND e.created_at >= ? ${ld}
      GROUP BY substr(e.created_at, 1, 10) ORDER BY day`
  ).all(since(13));
  const signupsByDay = await db.prepare(
    `SELECT substr(u.created_at, 1, 10) AS day, COUNT(*) AS n FROM users u
      WHERE u.created_at >= ? AND u.role <> 'SUPER_ADMIN' ${uDemo}
      GROUP BY substr(u.created_at, 1, 10) ORDER BY day`
  ).all(since(13));
  const byMethod = await db.prepare(
    `SELECT e.method AS method, COUNT(*) AS n FROM login_events e LEFT JOIN users u ON u.id = e.user_id
      WHERE e.success = 1 ${ld} GROUP BY e.method ORDER BY n DESC`
  ).all();

  const topBusinesses = await db.prepare(
    `SELECT b.id, b.name, b.category,
            (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) AS orders,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.business_id = b.id AND o.order_status <> 'Cancelled') AS revenue
       FROM businesses b WHERE 1=1 ${bDemo} ORDER BY revenue DESC, b.created_at DESC LIMIT 5`
  ).all();

  res.json({
    includeDemo: demo,
    totals: {
      users: roleCount('BUSINESS_OWNER') + roleCount('EMPLOYEE') + roleCount('CUSTOMER') + roleCount('SUPER_ADMIN'),
      owners: roleCount('BUSINESS_OWNER'),
      employees: roleCount('EMPLOYEE'),
      customerAccounts: roleCount('CUSTOMER'),
      businesses: num(businesses?.n),
      buyers: num(buyers?.n),
      orders: num(orders?.n),
      revenue: num(orders?.revenue),
    },
    activity: {
      loginsToday: await loginCount(ts(DAY)),
      logins7d: await loginCount(since(7)),
      logins30d: await loginCount(since(30)),
      loginsAllTime: await loginCount(),
      uniqueUsers7d: num(uniq7?.n),
      activeNow: num(activeNow?.n),
      failed24h: num(failed24?.n),
      demoVisits: num(demoVisits?.n),
    },
    loginsByDay: loginsByDay.map((r: any) => ({ day: r.day, logins: num(r.logins), users: num(r.users) })),
    signupsByDay: signupsByDay.map((r: any) => ({ day: r.day, n: num(r.n) })),
    byMethod: byMethod.map((r: any) => ({ method: r.method, n: num(r.n) })),
    topBusinesses: topBusinesses.map((r: any) => ({ ...r, orders: num(r.orders), revenue: num(r.revenue) })),
  });
});

superAdminRouter.get('/logins', async (req: Request, res: Response) => {
  const { limit, offset, page } = paging(req);
  const where: string[] = ['1=1'];
  const args: any[] = [];
  if (!includeDemo(req)) where.push("e.method <> 'demo' AND COALESCE(u.is_demo, 0) = 0");
  const role = cleanText(req.query.role, 20);
  if (['SUPER_ADMIN', 'BUSINESS_OWNER', 'EMPLOYEE', 'CUSTOMER'].includes(role)) { where.push('e.role = ?'); args.push(role); }
  const method = cleanText(req.query.method, 20);
  if (['password', 'google', 'demo', 'register', 'superadmin'].includes(method)) { where.push('e.method = ?'); args.push(method); }
  if (req.query.status === 'success') where.push('e.success = 1');
  if (req.query.status === 'failed') where.push('e.success = 0');
  if (req.query.q) {
    where.push('(LOWER(COALESCE(e.email, \'\')) LIKE LOWER(?) OR LOWER(COALESCE(e.name, \'\')) LIKE LOWER(?))');
    args.push(like(req.query.q), like(req.query.q));
  }
  const from = `FROM login_events e LEFT JOIN users u ON u.id = e.user_id LEFT JOIN businesses b ON b.id = e.business_id WHERE ${where.join(' AND ')}`;
  const total = await db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args);
  const rows = await db.prepare(
    `SELECT e.id, e.created_at, e.email, e.name, e.role, e.method, e.success, e.failure_reason, e.ip,
            b.name AS business_name ${from} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  res.json({ rows: rows.map((r: any) => ({ ...r, success: !!num(r.success) })), total: num(total?.n), page, limit });
});

superAdminRouter.get('/users', async (req: Request, res: Response) => {
  const { limit, offset, page } = paging(req);
  const where: string[] = ['1=1'];
  const args: any[] = [];
  if (!includeDemo(req)) where.push('COALESCE(u.is_demo, 0) = 0');
  const role = cleanText(req.query.role, 20);
  if (['SUPER_ADMIN', 'BUSINESS_OWNER', 'EMPLOYEE', 'CUSTOMER'].includes(role)) { where.push('u.role = ?'); args.push(role); }
  if (req.query.q) {
    where.push("(LOWER(u.email) LIKE LOWER(?) OR LOWER(u.name) LIKE LOWER(?) OR COALESCE(u.phone, '') LIKE ?)");
    args.push(like(req.query.q), like(req.query.q), like(req.query.q));
  }
  const from = `FROM users u LEFT JOIN businesses b ON b.id = u.business_id WHERE ${where.join(' AND ')}`;
  const total = await db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args);
  const rows = await db.prepare(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.auth_provider, u.created_at, u.last_login_at, u.last_seen_at,
            COALESCE(u.login_count, 0) AS login_count, b.name AS business_name ${from}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  res.json({ rows: rows.map((r: any) => ({ ...r, login_count: num(r.login_count) })), total: num(total?.n), page, limit });
});

superAdminRouter.get('/buyers', async (req: Request, res: Response) => {
  const { limit, offset, page } = paging(req);
  const where: string[] = ['1=1'];
  const args: any[] = [];
  if (!includeDemo(req)) where.push('COALESCE(b.is_demo, 0) = 0');
  if (req.query.q) {
    where.push("(LOWER(c.name) LIKE LOWER(?) OR LOWER(COALESCE(c.email, '')) LIKE LOWER(?) OR c.phone LIKE ?)");
    args.push(like(req.query.q), like(req.query.q), like(req.query.q));
  }
  const from = `FROM customers c JOIN businesses b ON b.id = c.business_id WHERE ${where.join(' AND ')}`;
  const total = await db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args);
  const rows = await db.prepare(
    `SELECT c.id, c.name, c.email, c.phone, c.city, c.created_at, b.name AS business_name,
            (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS total_orders,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.order_status <> 'Cancelled') AS total_spent,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) AS last_order_at
       ${from} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  res.json({
    rows: rows.map((r: any) => ({ ...r, total_orders: num(r.total_orders), total_spent: num(r.total_spent) })),
    total: num(total?.n), page, limit,
  });
});

superAdminRouter.get('/businesses', async (req: Request, res: Response) => {
  const { limit, offset, page } = paging(req);
  const where: string[] = ['1=1'];
  const args: any[] = [];
  if (!includeDemo(req)) where.push('COALESCE(b.is_demo, 0) = 0');
  if (req.query.q) {
    where.push("(LOWER(b.name) LIKE LOWER(?) OR LOWER(COALESCE(b.email, '')) LIKE LOWER(?))");
    args.push(like(req.query.q), like(req.query.q));
  }
  const from = `FROM businesses b WHERE ${where.join(' AND ')}`;
  const total = await db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args);
  const rows = await db.prepare(
    `SELECT b.id, b.name, b.category, b.email, b.phone, b.is_active, b.created_at, b.assistant_name,
            (SELECT u.name FROM users u WHERE u.business_id = b.id AND u.role = 'BUSINESS_OWNER' ORDER BY u.created_at LIMIT 1) AS owner_name,
            (SELECT u.email FROM users u WHERE u.business_id = b.id AND u.role = 'BUSINESS_OWNER' ORDER BY u.created_at LIMIT 1) AS owner_email,
            (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS team_size,
            (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id) AS products,
            (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS buyers,
            (SELECT COUNT(*) FROM orders o WHERE o.business_id = b.id) AS orders,
            (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.business_id = b.id AND o.order_status <> 'Cancelled') AS revenue
       ${from} ORDER BY b.created_at DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  res.json({
    rows: rows.map((r: any) => ({
      ...r, is_active: !!num(r.is_active), team_size: num(r.team_size), products: num(r.products),
      buyers: num(r.buyers), orders: num(r.orders), revenue: num(r.revenue),
    })),
    total: num(total?.n), page, limit,
  });
});

superAdminRouter.get('/orders', async (req: Request, res: Response) => {
  const { limit, offset, page } = paging(req);
  const where: string[] = ['1=1'];
  const args: any[] = [];
  if (!includeDemo(req)) where.push('COALESCE(b.is_demo, 0) = 0');
  const status = cleanText(req.query.status, 20);
  if (['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].includes(status)) {
    where.push('o.order_status = ?'); args.push(status);
  }
  if (req.query.q) {
    where.push("(LOWER(o.order_number) LIKE LOWER(?) OR LOWER(c.name) LIKE LOWER(?))");
    args.push(like(req.query.q), like(req.query.q));
  }
  const from = `FROM orders o JOIN businesses b ON b.id = o.business_id JOIN customers c ON c.id = o.customer_id WHERE ${where.join(' AND ')}`;
  const total = await db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args);
  const rows = await db.prepare(
    `SELECT o.id, o.order_number, o.created_at, o.total_amount, o.order_status, o.payment_status, o.payment_method,
            c.name AS customer_name, b.name AS business_name ${from} ORDER BY o.created_at DESC LIMIT ? OFFSET ?`
  ).all(...args, limit, offset);
  res.json({ rows: rows.map((r: any) => ({ ...r, total_amount: num(r.total_amount) })), total: num(total?.n), page, limit });
});
