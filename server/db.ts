import path from 'node:path';
import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * ShopMate database layer.
 *
 *  - Production (Vercel + Supabase): set DATABASE_URL (or POSTGRES_URL) to the
 *    Supabase *pooler* connection string. The app talks to Postgres via `pg`.
 *  - Local development / AI Studio / Docker: no DATABASE_URL -> embedded SQLite
 *    (node:sqlite) in ./data/shopmate.db, exactly as before.
 *
 * Both drivers are exposed through the same small async API so that the routes
 * and AI tools contain a single copy of their SQL:
 *
 *   await db.prepare('SELECT * FROM users WHERE id = ?').get(id)
 *   await db.prepare('UPDATE ...').run(...)
 *   await db.transaction(async () => { ...db.prepare(...).run() })
 */

export type Driver = 'sqlite' | 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
export const driver: Driver = DATABASE_URL ? 'postgres' : 'sqlite';
export const isPostgres = driver === 'postgres';

const SCHEMA_VERSION = '2026-11-11.1';

// ---------------------------------------------------------------------------
// SQL dialect helpers (pure functions, unit-tested)
// ---------------------------------------------------------------------------
const PG_NOW = `(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))`;

/** Translate the SQLite-flavoured SQL used across the app into PostgreSQL. */
export function toPostgresSql(sql: string): { text: string } {
  // Split into code / string-literal segments so rewrites never touch literal text.
  const segments: Array<{ lit: boolean; text: string }> = [];
  let code = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; } // '' escape
        if (sql[j] === "'") break;
        j++;
      }
      if (code) segments.push({ lit: false, text: code });
      code = '';
      segments.push({ lit: true, text: sql.slice(i, j + 1) });
      i = j + 1;
    } else {
      code += sql[i++];
    }
  }
  if (code) segments.push({ lit: false, text: code });

  let n = 0;
  let ignore = false;
  const out = segments
    .map((s) => {
      if (s.lit) return s.text;
      return s.text
        .replace(/\?/g, () => `$${++n}`)
        .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, () => { ignore = true; return 'INSERT INTO'; })
        .replace(/\bCURRENT_TIMESTAMP\b/g, PG_NOW)
        .replace(/\bLIKE\b/g, 'ILIKE');
    })
    .join('');

  return { text: ignore ? out.replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING' : out };
}

/** SQLite has no row locks; drop the Postgres-only locking clause. */
export function toSqliteSql(sql: string): string {
  return sql.replace(/\s+FOR\s+UPDATE(\s+OF\s+\w+)?/gi, '');
}

function normalizeParams(params: any[]): any[] {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p;
  });
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------
export interface Statement {
  get(...params: any[]): Promise<any | undefined>;
  all(...params: any[]): Promise<any[]>;
  run(...params: any[]): Promise<{ changes: number }>;
}

export interface Db {
  readonly driver: Driver;
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}

interface TxContext {
  client?: any; // pg PoolClient
  sqlite?: boolean;
}
const txStore = new AsyncLocalStorage<TxContext>();

// ---------------------------------------------------------------------------
// SQLite driver (lazy)
// ---------------------------------------------------------------------------
let sqlite: any = null;
let sqliteTxActive: Promise<void> | null = null;

async function getSqlite() {
  if (sqlite) return sqlite;
  if (process.env.VERCEL) {
    throw new DatabaseNotConfiguredError(
      'DATABASE_URL is not set. This deployment has no writable disk, so a Postgres (Supabase) connection string is required.'
    );
  }
  const { DatabaseSync } = await import('node:sqlite');
  // SQLITE_PATH lets automated tests use a throw-away database file; default is unchanged.
  const file = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.join(path.resolve(process.cwd(), 'data'), 'shopmate.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  return sqlite;
}

async function sqliteWaitIdle() {
  while (sqliteTxActive && !txStore.getStore()?.sqlite) await sqliteTxActive;
}

// ---------------------------------------------------------------------------
// Postgres driver (lazy)
// ---------------------------------------------------------------------------
let pool: any = null;

async function getPool() {
  if (pool) return pool;
  const pgModule: any = await import('pg');
  const pg = pgModule.default || pgModule;
  // COUNT()/SUM() come back as bigint (string) by default; the app expects numbers.
  pg.types.setTypeParser(20, (v: string) => parseInt(v, 10));
  pg.types.setTypeParser(1700, (v: string) => parseFloat(v));

  const url = new URL(DATABASE_URL);
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.searchParams.get('sslmode') === 'disable';
  url.searchParams.delete('sslmode');
  url.searchParams.delete('pgbouncer');

  pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err: Error) => console.error('[db] idle Postgres client error:', err.message));
  return pool;
}

export class DatabaseNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Unified executor
// ---------------------------------------------------------------------------
async function execute(sql: string, params: any[], mode: 'get' | 'all' | 'run') {
  const values = normalizeParams(params);

  if (isPostgres) {
    const { text } = toPostgresSql(sql);
    const ctx = txStore.getStore();
    const target = ctx?.client || (await getPool());
    const res = await target.query(text, values);
    if (mode === 'get') return res.rows[0];
    if (mode === 'all') return res.rows;
    return { changes: res.rowCount ?? 0 };
  }

  await sqliteWaitIdle();
  const conn = await getSqlite();
  const stmt = conn.prepare(toSqliteSql(sql));
  if (mode === 'get') return stmt.get(...values);
  if (mode === 'all') return stmt.all(...values);
  const r = stmt.run(...values);
  return { changes: Number(r.changes ?? 0) };
}

export const db: Db = {
  driver,

  prepare(sql: string): Statement {
    return {
      get: (...p) => execute(sql, p, 'get'),
      all: (...p) => execute(sql, p, 'all'),
      run: (...p) => execute(sql, p, 'run'),
    };
  },

  async exec(sql: string) {
    if (isPostgres) {
      const ctx = txStore.getStore();
      const target = ctx?.client || (await getPool());
      await target.query(toPostgresSql(sql).text);
      return;
    }
    await sqliteWaitIdle();
    (await getSqlite()).exec(toSqliteSql(sql));
  },

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txStore.getStore()) return fn(); // already inside a transaction

    if (isPostgres) {
      const client = await (await getPool()).connect();
      try {
        await client.query('BEGIN');
        const result = await txStore.run({ client }, fn);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection already lost */ }
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite: one connection -> serialise transactions and hold other statements back.
    while (sqliteTxActive) await sqliteTxActive;
    let release!: () => void;
    sqliteTxActive = new Promise<void>((r) => (release = r));
    const conn = await getSqlite();
    try {
      conn.exec('BEGIN');
      const result = await txStore.run({ sqlite: true }, fn);
      conn.exec('COMMIT');
      return result;
    } catch (err) {
      try { conn.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
      throw err;
    } finally {
      sqliteTxActive = null;
      release();
    }
  },
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    currency TEXT DEFAULT '₹',
    ai_greeting TEXT DEFAULT 'Hello! Welcome to ShopMate AI assistant. How may I assist your shopping today?',
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN', 'BUSINESS_OWNER', 'EMPLOYEE', 'CUSTOMER')),
    business_id TEXT,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS product_categories (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    UNIQUE(business_id, slug)
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    category_id TEXT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    description TEXT,
    brand TEXT,
    regular_price REAL NOT NULL,
    discount_price REAL,
    colour TEXT,
    sizes TEXT,
    images TEXT,
    is_archived INTEGER DEFAULT 0,
    min_stock_threshold INTEGER DEFAULT 5,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY(category_id) REFERENCES product_categories(id) ON DELETE SET NULL,
    UNIQUE(business_id, sku)
  );

  CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    business_id TEXT NOT NULL,
    sku TEXT NOT NULL,
    size TEXT NOT NULL,
    colour TEXT NOT NULL,
    price REAL NOT NULL,
    discount_price REAL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    UNIQUE(business_id, sku)
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    change_qty INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'CANCELLATION')),
    reference_order_id TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    user_id TEXT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(business_id, phone)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    order_number TEXT NOT NULL,
    order_date TEXT DEFAULT CURRENT_TIMESTAMP,
    subtotal REAL NOT NULL,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    delivery_address TEXT NOT NULL,
    payment_method TEXT DEFAULT 'Cash on Delivery',
    payment_status TEXT DEFAULT 'Pending' CHECK(payment_status IN ('Pending', 'Paid', 'Refunded')),
    order_status TEXT DEFAULT 'Pending' CHECK(order_status IN ('Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled')),
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
    UNIQUE(business_id, order_number)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    variant_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    variant_details TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    customer_id TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    status TEXT DEFAULT 'Open' CHECK(status IN ('New', 'Open', 'Waiting', 'Resolved', 'Closed')),
    channel TEXT DEFAULT 'WHATSAPP_SIMULATOR',
    assigned_employee_id TEXT,
    ai_summary TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY(assigned_employee_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    sender_type TEXT NOT NULL CHECK(sender_type IN ('CUSTOMER', 'AI', 'EMPLOYEE', 'SYSTEM')),
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS integrations (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'Disconnected' CHECK(status IN ('Connected', 'Disconnected', 'Pending')),
    phone_number TEXT,
    webhook_url TEXT,
    api_key_masked TEXT,
    settings_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    UNIQUE(business_id, provider)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    business_id TEXT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS login_events (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    email TEXT,
    name TEXT,
    role TEXT,
    business_id TEXT,
    method TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 1,
    failure_reason TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

/** Columns added after the first release. Applied to fresh and existing databases alike. */
const ADDED_COLUMNS: Array<[table: string, column: string, ddl: string]> = [
  ['businesses', 'assistant_name', 'TEXT'],
  ['businesses', 'suggested_questions', 'TEXT'],
  ['businesses', 'is_demo', 'INTEGER DEFAULT 0'],
  ['users', 'auth_provider', "TEXT DEFAULT 'password'"],
  ['users', 'google_id', 'TEXT'],
  ['users', 'avatar_url', 'TEXT'],
  ['users', 'is_demo', 'INTEGER DEFAULT 0'],
  ['users', 'last_login_at', 'TEXT'],
  ['users', 'last_seen_at', 'TEXT'],
  ['users', 'login_count', 'INTEGER DEFAULT 0'],
];


/**
 * Every column declared in BASE_SCHEMA, per table. A database that already has a table with the same name
 * (older release, another project, a manual edit) is NOT touched by CREATE TABLE IF NOT EXISTS, so missing
 * columns such as product_categories.image_url must be added explicitly.
 */
function declaredColumns(): Map<string, Array<{ name: string; ddl: string }>> {
  const out = new Map<string, Array<{ name: string; ddl: string }>>();
  const re = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n  \);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(BASE_SCHEMA))) {
    const cols: Array<{ name: string; ddl: string }> = [];
    for (const raw of m[2].split('\n')) {
      const line = raw.trim().replace(/,$/, '');
      if (!line || /^(FOREIGN|UNIQUE|PRIMARY|CONSTRAINT|CHECK)\b/i.test(line)) continue;
      const c = /^(\w+)\s+(.+)$/.exec(line);
      if (!c) continue;
      // An added column must be nullable/defaulted so existing rows stay valid.
      const ddl = c[2]
        .replace(/PRIMARY KEY/gi, '')
        .replace(/NOT NULL/gi, '')
        .replace(/REFERENCES\s+\w+\s*\(\w+\)(\s+ON DELETE\s+(CASCADE|SET NULL))?/gi, '')
        .replace(/\bUNIQUE\b/gi, '')
        .replace(/CHECK\s*\(.*\)/gi, '')
        .trim();
      cols.push({ name: c[1], ddl: ddl || 'TEXT' });
    }
    out.set(m[1], cols);
  }
  return out;
}

const INDEXES = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_id) WHERE google_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
  CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_business ON orders(business_id);
  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
  CREATE INDEX IF NOT EXISTS idx_users_business ON users(business_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id);
`;

const TABLES = [
  'businesses', 'users', 'product_categories', 'products', 'product_variants', 'inventory_movements',
  'customers', 'orders', 'order_items', 'conversations', 'messages', 'integrations', 'audit_logs',
  'password_reset_tokens', 'login_events', 'app_meta',
];

function pgSchema(sql: string) {
  return sql.replace(/\bREAL\b/g, 'DOUBLE PRECISION');
}


/** Brings pre-existing tables in line with the declared schema. Each step is isolated: one failure never blocks start-up. */
async function reconcilePostgresColumns(client: any) {
  const attempt = async (label: string, sql: string) => {
    await client.query('SAVEPOINT recon');
    try {
      await client.query(sql);
      await client.query('RELEASE SAVEPOINT recon');
    } catch (err: any) {
      await client.query('ROLLBACK TO SAVEPOINT recon');
      console.error(`[db] schema reconcile skipped (${label}):`, err?.message);
    }
  };
  const declared = declaredColumns();
  for (const [table, cols] of declared) {
    for (const c of cols) {
      await attempt(`${table}.${c.name}`, `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${c.name} ${pgSchema(c.ddl)}`);
    }
    // Leftover legacy columns that this app never writes must not block inserts.
    const known = new Set(cols.map((c) => c.name));
    const extra = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND is_nullable = 'NO' AND column_default IS NULL`,
      [table]
    );
    for (const r of extra.rows) {
      if (!known.has(r.column_name) && r.column_name !== 'id') {
        await attempt(`${table}.${r.column_name} drop not null`, `ALTER TABLE ${table} ALTER COLUMN ${r.column_name} DROP NOT NULL`);
      }
    }
  }
}

async function initPostgres() {
  const p = await getPool();
  const existing = await p.query(`SELECT to_regclass('public.app_meta') AS t`);
  if (existing.rows[0]?.t) {
    const v = await p.query(`SELECT value FROM app_meta WHERE key = 'schema_version'`);
    if (v.rows[0]?.value === SCHEMA_VERSION) return; // already migrated: skip DDL on warm/cold starts
  }

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // Serialise concurrent cold starts (transaction-scoped, safe behind pgbouncer).
    await client.query('SELECT pg_advisory_xact_lock(727272)');
    await client.query(toPostgresSql(pgSchema(BASE_SCHEMA)).text);
    for (const [table, column, ddl] of ADDED_COLUMNS) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${ddl}`);
    }
    await reconcilePostgresColumns(client);
    await client.query(INDEXES);
    // Supabase exposes `public` through its Data API. The app uses a direct server-side
    // connection (table owner, bypasses RLS), so lock the tables down for anon/authenticated roles.
    for (const t of TABLES) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
    await client.query(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [SCHEMA_VERSION]
    );
    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function initSqlite() {
  const conn = await getSqlite();
  conn.exec(BASE_SCHEMA);
  for (const [table, column, ddl] of ADDED_COLUMNS) {
    const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    }
  }
  for (const [table, cols] of declaredColumns()) {
    const have = new Set((conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name));
    for (const c of cols) {
      if (!have.has(c.name)) {
        try { conn.exec(`ALTER TABLE ${table} ADD COLUMN ${c.name} ${c.ddl.replace(/DEFAULT\s+CURRENT_TIMESTAMP/i, '')}`); }
        catch (err: any) { console.error(`[db] schema reconcile skipped (${table}.${c.name}):`, err?.message); }
      }
    }
  }
  conn.exec(INDEXES);
}

let ready: Promise<void> | null = null;

/** Idempotent, memoised schema bootstrap. Safe to call on every request. */
export function ensureDatabase(): Promise<void> {
  if (!ready) {
    ready = (isPostgres ? initPostgres() : initSqlite())
      .then(() => {
        console.log(`Database ready (${driver}).`);
      })
      .catch((err) => {
        ready = null; // allow a retry on the next request
        throw err;
      });
  }
  return ready;
}

/** Backwards-compatible alias used by server.ts and the test-suite. */
export const initDatabase = ensureDatabase;

export function newId(prefix: string): string {
  const rand = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${Date.now().toString(36)}${Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
