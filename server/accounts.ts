import { db, newId } from './db.js';
import { AuthUser, DEMO_BUSINESS_ID, NO_PASSWORD, cleanText, hashPassword, isValidEmail, normalizePhone, toAuthUser } from './auth.js';

export const DEFAULT_ASSISTANT_NAME = 'ShopMate AI';

export const DEFAULT_SUGGESTED_QUESTIONS = [
  'What products do you have?',
  'Show me items under ₹1,000',
  'What categories do you sell?',
  'Do you have size M available?',
  'Track my order',
];

/** Thrown for problems the person can fix themselves; mapped to a 4xx response. */
export class AccountError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

const isUniqueViolation = (err: any) =>
  err?.code === '23505' || /UNIQUE constraint failed|duplicate key value/i.test(err?.message || '');

// ---------------------------------------------------------------------------
// Business serialisation (suggested_questions is stored as JSON text)
// ---------------------------------------------------------------------------
export function parseSuggestedQuestions(raw: unknown): string[] | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((q) => typeof q === 'string' && q.trim()).slice(0, 8) : null;
  } catch {
    return null;
  }
}

export function serializeBusiness(row: any) {
  if (!row) return null;
  return {
    ...row,
    assistant_name: row.assistant_name || DEFAULT_ASSISTANT_NAME,
    suggested_questions: parseSuggestedQuestions(row.suggested_questions),
  };
}

/** Validate and normalise the owner-editable chatbot settings. */
export function sanitizeQuestions(input: unknown): string[] {
  if (!Array.isArray(input)) throw new AccountError(400, 'Suggested questions must be a list.');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of input) {
    const text = cleanText(q, 80);
    if (text && !seen.has(text.toLowerCase())) {
      seen.add(text.toLowerCase());
      out.push(text);
    }
  }
  if (out.length > 8) throw new AccountError(400, 'You can add up to 8 suggested questions.');
  return out;
}

// ---------------------------------------------------------------------------
// Registration (shared by password and Google sign-up)
// ---------------------------------------------------------------------------
async function uniqueSlug(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'store';
  let slug = base;
  for (let i = 2; await db.prepare('SELECT 1 AS x FROM businesses WHERE slug = ?').get(slug); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

const PHONE_SQL = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')`;

export async function assertEmailAndPhoneFree(email: string, phone: string) {
  const byEmail = await db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
  if (byEmail) {
    throw new AccountError(409, 'This email address is already registered. Please sign in or use another email.', 'EMAIL_TAKEN');
  }
  const byPhone = await db.prepare(`SELECT id FROM users WHERE ${PHONE_SQL} = ? AND COALESCE(is_demo, 0) = 0`).get(phone);
  if (byPhone) {
    throw new AccountError(409, 'This phone number is already registered to another account. Each account must have a unique phone number.', 'PHONE_TAKEN');
  }
}

export interface NewOwnerInput {
  email: string;
  name: string;
  phone: string;
  businessName: string;
  businessCategory?: string;
  password?: string; // omitted for Google sign-up
  googleId?: string;
  avatarUrl?: string;
}

export function validateOwnerInput(raw: {
  email?: unknown; name?: unknown; phone?: unknown; businessName?: unknown; businessCategory?: unknown; password?: unknown;
}, opts: { requirePassword: boolean }) {
  const email = cleanText(raw.email, 254).toLowerCase();
  const name = cleanText(raw.name, 80);
  const phone = normalizePhone(raw.phone);
  const businessName = cleanText(raw.businessName, 80);
  const businessCategory = cleanText(raw.businessCategory, 60) || 'Retail Store';

  if (!name) throw new AccountError(400, 'Owner full name is required.');
  if (!businessName || businessName.length < 2) throw new AccountError(400, 'Business / store name is required (at least 2 characters).');
  if (!isValidEmail(email)) throw new AccountError(400, 'Please enter a valid email address.');
  if (phone.replace(/\D/g, '').length < 8 || phone.length > 20) {
    throw new AccountError(400, 'A valid phone number (at least 8 digits) is required for account security.');
  }
  if (opts.requirePassword) {
    const password = typeof raw.password === 'string' ? raw.password : '';
    if (password.length < 8) throw new AccountError(400, 'Password must be at least 8 characters long.');
    if (password.length > 200) throw new AccountError(400, 'Password is too long.');
  }
  return { email, name, phone, businessName, businessCategory };
}

export async function createBusinessOwner(input: NewOwnerInput): Promise<{ user: AuthUser; business: any }> {
  await assertEmailAndPhoneFree(input.email, input.phone);

  const passwordHash = input.password ? await hashPassword(input.password) : NO_PASSWORD;
  const businessId = newId('biz');
  const userId = newId('usr');
  const slug = await uniqueSlug(input.businessName);
  const greeting = `Hello! Welcome to ${input.businessName}. I am ${DEFAULT_ASSISTANT_NAME}, your shopping assistant. How may I help you today?`;

  try {
    await db.transaction(async () => {
      await db.prepare(
        `INSERT INTO businesses (id, name, slug, category, phone, email, ai_greeting, assistant_name, suggested_questions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        businessId, input.businessName, slug, input.businessCategory || 'Retail Store', input.phone, input.email,
        greeting, DEFAULT_ASSISTANT_NAME, JSON.stringify(DEFAULT_SUGGESTED_QUESTIONS)
      );
      await db.prepare(
        `INSERT INTO users (id, email, password_hash, name, role, business_id, phone, auth_provider, google_id, avatar_url)
         VALUES (?, ?, ?, ?, 'BUSINESS_OWNER', ?, ?, ?, ?, ?)`
      ).run(
        userId, input.email, passwordHash, input.name, businessId, input.phone,
        input.googleId ? 'google' : 'password', input.googleId ?? null, input.avatarUrl ?? null
      );
    });
  } catch (err: any) {
    if (isUniqueViolation(err)) {
      throw new AccountError(409, 'An account with this email or phone number already exists.', 'DUPLICATE');
    }
    throw err;
  }

  const row = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const business = await db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId);
  return { user: toAuthUser(row), business: serializeBusiness(business) };
}

// ---------------------------------------------------------------------------
// One-click demo personas (a shared, read-mostly sandbox tenant)
// ---------------------------------------------------------------------------
export type DemoPersona = 'OWNER' | 'EMPLOYEE' | 'CUSTOMER' | 'SUPER_ADMIN';

const DEMO_QUESTIONS = [
  'Show me red kurtis below ₹1,500',
  'Do you have size M available?',
  'Show me Banarasi and Chanderi sarees',
  'Show linen shirts for men',
  'What categories do you have?',
  'Track order ORD-2026-DEMO',
];

const PERSONAS: Record<DemoPersona, { id: string; email: string; password: string; name: string; role: AuthUser['role']; business: boolean; phone: string }> = {
  OWNER: { id: 'usr_owner_demo', email: 'owner@shopmate.com', password: 'admin123', name: 'Rajesh Patel (Store Owner)', role: 'BUSINESS_OWNER', business: true, phone: '+91 98765 43210' },
  EMPLOYEE: { id: 'usr_emp_demo', email: 'priya@shopmate.com', password: 'employee123', name: 'Priya Nair (Staff Executive)', role: 'EMPLOYEE', business: true, phone: '+91 98765 43211' },
  CUSTOMER: { id: 'usr_cust_demo', email: 'ananya@example.com', password: 'customer123', name: 'Ananya Sen (Demo Customer)', role: 'CUSTOMER', business: true, phone: '+91 98765 11111' },
  SUPER_ADMIN: { id: 'usr_admin_demo', email: 'superadmin@shopmate.com', password: 'super123', name: 'Aarav Sharma (Platform Admin)', role: 'SUPER_ADMIN', business: false, phone: '+91 99999 00000' },
};

async function seedDemoStore() {
  const existing = await db.prepare('SELECT id FROM businesses WHERE id = ?').get(DEMO_BUSINESS_ID);
  if (existing) {
    await db.prepare('UPDATE businesses SET is_demo = 1 WHERE id = ? AND COALESCE(is_demo, 0) = 0').run(DEMO_BUSINESS_ID);
    return;
  }

  await db.transaction(async () => {
    await db.prepare(
      `INSERT OR IGNORE INTO businesses (id, name, slug, category, phone, email, address, currency, ai_greeting, assistant_name, suggested_questions, is_active, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
    ).run(
      DEMO_BUSINESS_ID, 'KalaKriti Ethnic & Modern Wear', 'kalakriti-demo', 'Clothing & Ethnic Fashion',
      '+91 98765 43210', 'demo@kalakriti.in', '108 Commercial Street, Bengaluru, Karnataka, 560001', '₹',
      'Namaste! Welcome to KalaKriti Ethnic & Modern Wear demo store. I am your ShopMate AI shopping assistant. How may I assist your shopping today?',
      DEFAULT_ASSISTANT_NAME, JSON.stringify(DEMO_QUESTIONS)
    );

    const cats = [
      ['cat_demo_kurtis', 'Kurtis & Kurta Sets', 'kurtis', 'Handcrafted cotton and festive designer kurtis'],
      ['cat_demo_sarees', 'Sarees', 'sarees', 'Banarasi, Chanderi, and silk festive sarees'],
      ['cat_demo_shirts', 'Shirts & Tops', 'shirts', 'Breathable linen and casual office shirts'],
    ];
    for (const [id, name, slug, desc] of cats) {
      await db.prepare(`INSERT OR IGNORE INTO product_categories (id, business_id, name, slug, description) VALUES (?, ?, ?, ?, ?)`)
        .run(id, DEMO_BUSINESS_ID, name, slug, desc);
    }

    const products = [
      { id: 'prd_d1', cat: 'cat_demo_kurtis', name: 'Anarkali Pure Cotton Festive Kurti', sku: 'KK-KRT-101', price: 1399, col: 'Red', sizes: ['S', 'M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80' },
      { id: 'prd_d2', cat: 'cat_demo_kurtis', name: 'Floral Embroidered Georgette Kurta Set', sku: 'KK-KRT-102', price: 1899, col: 'Pink', sizes: ['M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80' },
      { id: 'prd_d3', cat: 'cat_demo_sarees', name: 'Chanderi Zari Border Saree', sku: 'KK-SAR-201', price: 2199, col: 'Royal Blue', sizes: ['Free Size'], img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80' },
      { id: 'prd_d4', cat: 'cat_demo_shirts', name: 'Pure Linen Mandarin Collar Shirt', sku: 'KK-SHT-301', price: 1249, col: 'White', sizes: ['M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80' },
    ];
    for (const p of products) {
      await db.prepare(
        `INSERT OR IGNORE INTO products (id, business_id, category_id, name, sku, regular_price, discount_price, colour, sizes, images, is_archived)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      ).run(p.id, DEMO_BUSINESS_ID, p.cat, p.name, p.sku, p.price + 300, p.price, p.col, JSON.stringify(p.sizes), JSON.stringify([p.img]));
      for (const sz of p.sizes) {
        await db.prepare(
          `INSERT OR IGNORE INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 15)`
        ).run(`${p.id}_${sz}`, p.id, DEMO_BUSINESS_ID, `${p.sku}-${sz}`, sz, p.col, p.price + 300, p.price);
      }
    }

    await db.prepare(
      `INSERT OR IGNORE INTO customers (id, business_id, name, phone, email, address, city)
       VALUES ('cust_demo_01', ?, 'Ananya Sen', '+91 98765 11111', 'ananya@example.com', 'Flat 402, Green Acres Apt, Indiranagar', 'Bengaluru')`
    ).run(DEMO_BUSINESS_ID);
    await db.prepare(
      `INSERT OR IGNORE INTO orders (id, business_id, customer_id, order_number, subtotal, discount, tax, total_amount, delivery_address, payment_method, payment_status, order_status)
       VALUES ('ord_demo_01', ?, 'cust_demo_01', 'ORD-2026-DEMO', 1399, 0, 0, 1399, 'Indiranagar, Bengaluru', 'Cash on Delivery', 'Paid', 'Confirmed')`
    ).run(DEMO_BUSINESS_ID);
    await db.prepare(
      `INSERT OR IGNORE INTO order_items (id, order_id, product_id, variant_id, product_name, variant_details, quantity, unit_price, total_price)
       VALUES ('item_demo_01', 'ord_demo_01', 'prd_d1', 'prd_d1_M', 'Anarkali Pure Cotton Festive Kurti', 'Size: M | Colour: Red', 1, 1399, 1399)`
    ).run();
  });
}

export async function ensureDemoPersona(persona: DemoPersona): Promise<{ user: AuthUser; business: any | null }> {
  const cfg = PERSONAS[persona];
  if (cfg.business) await seedDemoStore();

  let row = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cfg.email);
  if (!row) {
    const hash = await hashPassword(cfg.password);
    await db.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, business_id, phone, auth_provider, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'demo', 1)`
    ).run(cfg.id, cfg.email, hash, cfg.name, cfg.role, cfg.business ? DEMO_BUSINESS_ID : null, cfg.phone);
    row = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cfg.email);
  } else if (!row.is_demo) {
    await db.prepare('UPDATE users SET is_demo = 1 WHERE id = ?').run(row.id);
    row.is_demo = 1;
  }
  if (!row) throw new Error('Could not provision demo account');

  const business = cfg.business
    ? serializeBusiness(await db.prepare('SELECT * FROM businesses WHERE id = ?').get(DEMO_BUSINESS_ID))
    : null;
  return { user: toAuthUser(row), business };
}
