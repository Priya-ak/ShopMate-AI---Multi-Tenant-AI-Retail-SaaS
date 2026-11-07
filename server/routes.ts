import { Router, Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { hashPassword } from './seed.js';
import {
  runGeminiAgent,
  runDeterministicAgent,
  toolSearchProducts,
  toolGetRecommendations,
  toolCreateOrderSafe,
} from './gemini.js';
import crypto from 'node:crypto';

export const apiRouter = Router();

// -------------------------------------------------------------
// Authentication Helper & Middleware
// -------------------------------------------------------------
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN' | 'BUSINESS_OWNER' | 'EMPLOYEE' | 'CUSTOMER';
  business_id: string | null;
  phone?: string;
}

// In-memory session store (simple token map for MVP)
const sessions = new Map<string, AuthUser>();

export function createSessionToken(user: AuthUser): string {
  const token = 'tok_' + crypto.randomBytes(32).toString('hex');
  sessions.set(token, user);
  return token;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);
  const user = sessions.get(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }

  (req as any).user = user;
  next();
}

// Optional Auth (for public customer catalog / shopping)
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const user = sessions.get(token);
    if (user) {
      (req as any).user = user;
    }
  }
  next();
}

// Multi-tenant business resolver helper
export function resolveBusinessId(req: Request): string {
  const user = (req as any).user as AuthUser | undefined;
  if (user && user.business_id) {
    return user.business_id;
  }
  const headerBiz = req.headers['x-business-id'] as string;
  if (headerBiz) {
    return headerBiz;
  }
  const firstBiz = db.prepare('SELECT id FROM businesses WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
  return firstBiz?.id || '';
}

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------

// POST /api/auth/register
apiRouter.post('/auth/register', (req: Request, res: Response) => {
  try {
    const { email, password, name, businessName, businessCategory, phone } = req.body;

    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').trim().replace(/[\s\-\(\)]/g, '');

    if (!normalizedEmail || !password || !name) {
      return res.status(400).json({ error: 'Name, email address, and password are required.' });
    }

    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'A valid phone number (at least 8 digits) is required for account security.' });
    }

    // 1. Security Check: Email Uniqueness
    const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(normalizedEmail);
    if (existingEmail) {
      return res.status(400).json({ error: 'This email address is already registered. Please sign in or use another email.' });
    }

    // 2. Security Check: Phone Number Uniqueness
    const allUsersWithPhone = db.prepare('SELECT id, phone FROM users WHERE phone IS NOT NULL').all() as any[];
    const existingPhone = allUsersWithPhone.find((u) => {
      if (!u.phone) return false;
      return u.phone.trim().replace(/[\s\-\(\)]/g, '') === cleanPhone;
    });

    if (existingPhone) {
      return res.status(400).json({ error: 'This phone number is already registered to another account. Each account must have a unique phone number.' });
    }

    let businessId: string | null = null;
    if (businessName) {
      businessId = 'biz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      db.prepare(`
        INSERT INTO businesses (id, name, slug, category, phone, email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(businessId, businessName, slug, businessCategory || 'Retail Store', phone.trim(), normalizedEmail);
    }

    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const role = businessId ? 'BUSINESS_OWNER' : 'CUSTOMER';

    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, business_id, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, normalizedEmail, hashPassword(password), name.trim(), role, businessId, phone.trim());

    const user: AuthUser = {
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      role,
      business_id: businessId,
      phone: phone.trim(),
    };

    const token = createSessionToken(user);
    res.status(201).json({ user, token });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/demo-login - Instant Provisioning for One-Click Demo Personas
apiRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  try {
    const { persona } = req.body;
    const requested = (persona || 'OWNER').toUpperCase();

    const demoBizId = 'biz_demo_store_001';

    // 1. Ensure Demo Business exists with realistic interactive data
    let demoBiz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(demoBizId) as any;
    if (!demoBiz) {
      db.prepare(`
        INSERT INTO businesses (id, name, slug, category, phone, email, address, currency, ai_greeting, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        demoBizId,
        'KalaKriti Ethnic & Modern Wear',
        'kalakriti-demo',
        'Clothing & Ethnic Fashion',
        '+91 98765 43210',
        'demo@kalakriti.in',
        '108 Commercial Street, Bengaluru, Karnataka, 560001',
        '₹',
        'Namaste! Welcome to KalaKriti Ethnic & Modern Wear demo store. I am your ShopMate AI shopping assistant. How may I assist your shopping today?'
      );
      demoBiz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(demoBizId);

      const catKurti = 'cat_demo_kurtis';
      const catSaree = 'cat_demo_sarees';
      const catShirt = 'cat_demo_shirts';
      db.prepare(`INSERT OR IGNORE INTO product_categories (id, business_id, name, slug, description) VALUES (?, ?, ?, ?, ?)`).run(catKurti, demoBizId, 'Kurtis & Kurta Sets', 'kurtis', 'Handcrafted cotton and festive designer kurtis');
      db.prepare(`INSERT OR IGNORE INTO product_categories (id, business_id, name, slug, description) VALUES (?, ?, ?, ?, ?)`).run(catSaree, demoBizId, 'Sarees', 'sarees', 'Banarasi, Chanderi, and silk festive sarees');
      db.prepare(`INSERT OR IGNORE INTO product_categories (id, business_id, name, slug, description) VALUES (?, ?, ?, ?, ?)`).run(catShirt, demoBizId, 'Shirts & Tops', 'shirts', 'Breathable linen and casual office shirts');

      const demoProducts = [
        { id: 'prd_d1', cat: catKurti, name: 'Anarkali Pure Cotton Festive Kurti', sku: 'KK-KRT-101', price: 1399, col: 'Red', sizes: ['S', 'M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80' },
        { id: 'prd_d2', cat: catKurti, name: 'Floral Embroidered Georgette Kurta Set', sku: 'KK-KRT-102', price: 1899, col: 'Pink', sizes: ['M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80' },
        { id: 'prd_d3', cat: catSaree, name: 'Chanderi Zari Border Saree', sku: 'KK-SAR-201', price: 2199, col: 'Royal Blue', sizes: ['Free Size'], img: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600&auto=format&fit=crop&q=80' },
        { id: 'prd_d4', cat: catShirt, name: 'Pure Linen Mandarin Collar Shirt', sku: 'KK-SHT-301', price: 1249, col: 'White', sizes: ['M', 'L', 'XL'], img: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=600&auto=format&fit=crop&q=80' },
      ];

      for (const p of demoProducts) {
        db.prepare(`
          INSERT OR IGNORE INTO products (id, business_id, category_id, name, sku, regular_price, discount_price, colour, sizes, images, is_archived)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(p.id, demoBizId, p.cat, p.name, p.sku, p.price + 300, p.price, p.col, JSON.stringify(p.sizes), JSON.stringify([p.img]));

        for (const sz of p.sizes) {
          db.prepare(`
            INSERT OR IGNORE INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 15)
          `).run(`${p.id}_${sz}`, p.id, demoBizId, `${p.sku}-${sz}`, sz, p.col, p.price + 300, p.price);
        }
      }

      const custId = 'cust_demo_01';
      db.prepare(`
        INSERT OR IGNORE INTO customers (id, business_id, name, phone, email, address, city)
        VALUES (?, ?, 'Ananya Sen', '+91 98765 11111', 'ananya@example.com', 'Flat 402, Green Acres Apt, Indiranagar', 'Bengaluru')
      `).run(custId, demoBizId);

      const orderId = 'ord_demo_01';
      db.prepare(`
        INSERT OR IGNORE INTO orders (id, business_id, customer_id, order_number, subtotal, discount, tax, total_amount, delivery_address, payment_method, payment_status, order_status)
        VALUES (?, ?, ?, 'ORD-2026-DEMO', 1399, 0, 0, 1399, 'Indiranagar, Bengaluru', 'Cash on Delivery', 'Paid', 'Confirmed')
      `).run(orderId, demoBizId, custId);

      db.prepare(`
        INSERT OR IGNORE INTO order_items (id, order_id, product_id, variant_id, product_name, variant_details, quantity, unit_price, total_price)
        VALUES ('item_demo_01', ?, 'prd_d1', 'prd_d1_M', 'Anarkali Pure Cotton Festive Kurti', 'Size: M | Colour: Red', 1, 1399, 1399)
      `).run(orderId);
    }

    // 2. Persona Configuration Map
    let demoUserId = 'usr_owner_demo';
    let demoEmail = 'owner@shopmate.com';
    let demoPass = 'admin123';
    let demoName = 'Rajesh Patel (Store Owner)';
    let demoRole: AuthUser['role'] = 'BUSINESS_OWNER';
    let demoUserBizId: string | null = demoBizId;
    let demoPhone = '+91 98765 43210';

    if (requested === 'EMPLOYEE') {
      demoUserId = 'usr_emp_demo';
      demoEmail = 'priya@shopmate.com';
      demoPass = 'employee123';
      demoName = 'Priya Nair (Staff Executive)';
      demoRole = 'EMPLOYEE';
      demoUserBizId = demoBizId;
      demoPhone = '+91 98765 43211';
    } else if (requested === 'CUSTOMER') {
      demoUserId = 'usr_cust_demo';
      demoEmail = 'ananya@example.com';
      demoPass = 'customer123';
      demoName = 'Ananya Sen (Demo Customer)';
      demoRole = 'CUSTOMER';
      demoUserBizId = demoBizId;
      demoPhone = '+91 98765 11111';
    } else if (requested === 'SUPER_ADMIN') {
      demoUserId = 'usr_admin_demo';
      demoEmail = 'superadmin@shopmate.com';
      demoPass = 'super123';
      demoName = 'Aarav Sharma (Platform Admin)';
      demoRole = 'SUPER_ADMIN';
      demoUserBizId = null;
      demoPhone = '+91 99999 00000';
    }

    // Ensure the user account exists
    let userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(demoEmail) as any;
    if (!userRow) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, name, role, business_id, phone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(demoUserId, demoEmail, hashPassword(demoPass), demoName, demoRole, demoUserBizId, demoPhone);
      userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(demoEmail);
    }

    const user: AuthUser = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      business_id: userRow.business_id,
      phone: userRow.phone,
    };

    const token = createSessionToken(user);
    res.json({
      user,
      token,
      businessName: demoUserBizId ? 'KalaKriti Ethnic & Modern Wear' : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
apiRouter.post('/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const hash = hashPassword(password);
    const userRow = db.prepare(`
      SELECT u.id, u.email, u.name, u.role, u.business_id, u.phone, b.name as business_name
      FROM users u
      LEFT JOIN businesses b ON u.business_id = b.id
      WHERE u.email = ? AND u.password_hash = ?
    `).get(email, hash) as any;

    if (!userRow) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user: AuthUser = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      role: userRow.role,
      business_id: userRow.business_id,
      phone: userRow.phone,
    };

    const token = createSessionToken(user);
    res.json({ user, token, businessName: userRow.business_name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
apiRouter.post('/auth/logout', authMiddleware, (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sessions.delete(authHeader.substring(7));
  }
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
apiRouter.get('/auth/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  let business = null;
  if (user.business_id) {
    business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(user.business_id);
  }
  res.json({ user, business });
});

// POST /api/auth/forgot-password
apiRouter.post('/auth/forgot-password', (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as any;
  if (!user) {
    // Avoid email enumeration in production, but confirm flow
    return res.json({ message: 'If that email exists, password reset instructions have been created.' });
  }

  const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run('tok_' + Date.now(), user.id, resetToken, expiresAt);

  res.json({
    message: 'Password reset token generated successfully.',
    resetToken, // for testing convenience
  });
});

// POST /api/auth/reset-password
apiRouter.post('/auth/reset-password', (req: Request, res: Response) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and newPassword are required' });

  const resetRecord = db.prepare(`
    SELECT * FROM password_reset_tokens WHERE token = ?
  `).get(token) as any;

  if (!resetRecord || new Date(resetRecord.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Invalid or expired password reset token' });
  }

  db.prepare(`
    UPDATE users SET password_hash = ? WHERE id = ?
  `).run(hashPassword(newPassword), resetRecord.user_id);

  db.prepare(`DELETE FROM password_reset_tokens WHERE id = ?`).run(resetRecord.id);

  res.json({ message: 'Password has been updated successfully.' });
});

// -------------------------------------------------------------
// BUSINESSES
// -------------------------------------------------------------
apiRouter.get('/businesses/me', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const biz = db.prepare('SELECT * FROM businesses WHERE id = ?').get(bizId);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json(biz);
});

apiRouter.put('/businesses/me', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const { name, phone, email, address, currency, ai_greeting } = req.body;
  db.prepare(`
    UPDATE businesses
    SET name = COALESCE(?, name),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        currency = COALESCE(?, currency),
        ai_greeting = COALESCE(?, ai_greeting),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, phone, email, address, currency, ai_greeting, bizId);

  const updated = db.prepare('SELECT * FROM businesses WHERE id = ?').get(bizId);
  res.json(updated);
});

// Platform Super Admin - List all businesses
apiRouter.get('/businesses', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }

  const businesses = db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count,
      (SELECT COUNT(*) FROM orders WHERE business_id = b.id) as order_count,
      (SELECT COUNT(*) FROM users WHERE business_id = b.id) as user_count
    FROM businesses b
  `).all();

  res.json(businesses);
});

// -------------------------------------------------------------
// PRODUCTS
// -------------------------------------------------------------
// GET /api/products (supports search, category, colour, size, min/max price, sorting, pagination)
apiRouter.get('/products', optionalAuthMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const {
      search,
      category,
      colour,
      size,
      minPrice,
      maxPrice,
      inStockOnly,
      sortBy = 'created_at',
      sortOrder = 'desc',
      page = '1',
      limit = '50',
    } = req.query as any;

    let sql = `
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN product_categories c ON p.category_id = c.id
      WHERE p.business_id = ? AND p.is_archived = 0
    `;
    const params: any[] = [bizId];

    if (search) {
      sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ? OR p.brand LIKE ?)`;
      const w = `%${search}%`;
      params.push(w, w, w, w);
    }
    if (category) {
      sql += ` AND (p.category_id = ? OR c.slug = ?)`;
      params.push(category, category);
    }
    if (colour) {
      sql += ` AND LOWER(p.colour) LIKE ?`;
      params.push(`%${colour.toLowerCase()}%`);
    }
    if (minPrice) {
      sql += ` AND COALESCE(p.discount_price, p.regular_price) >= ?`;
      params.push(Number(minPrice));
    }
    if (maxPrice) {
      sql += ` AND COALESCE(p.discount_price, p.regular_price) <= ?`;
      params.push(Number(maxPrice));
    }

    const orderCol = ['name', 'regular_price', 'created_at'].includes(sortBy) ? sortBy : 'created_at';
    const orderDir = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY p.${orderCol} ${orderDir}`;

    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    sql += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const products = db.prepare(sql).all(...params) as any[];

    // Hydrate variants and parsed fields
    const enriched = products.map((p) => {
      const variants = db.prepare(`SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?`).all(p.id, bizId) as any[];
      let sizes = [];
      let images = [];
      try { sizes = JSON.parse(p.sizes || '[]'); } catch {}
      try { images = JSON.parse(p.images || '[]'); } catch {}

      const totalStock = variants.reduce((s, v) => s + (v.stock_quantity || 0), 0);

      return {
        ...p,
        sizes,
        images,
        totalStock,
        variants,
      };
    });

    const totalCount = (db.prepare(`SELECT COUNT(*) as count FROM products WHERE business_id = ? AND is_archived = 0`).get(bizId) as any).count;

    res.json({
      products: enriched,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/products/:id
apiRouter.get('/products/:id', optionalAuthMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const p = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.business_id = ?
  `).get(req.params.id, bizId) as any;

  if (!p) return res.status(404).json({ error: 'Product not found' });

  const variants = db.prepare(`SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?`).all(p.id, bizId);
  let sizes = [];
  let images = [];
  try { sizes = JSON.parse(p.sizes || '[]'); } catch {}
  try { images = JSON.parse(p.images || '[]'); } catch {}

  res.json({
    ...p,
    sizes,
    images,
    variants,
  });
});

// POST /api/products (Create Product)
apiRouter.post('/products', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const {
      name,
      sku,
      category_id,
      description,
      brand,
      regular_price,
      discount_price,
      colour,
      sizes = [],
      images = [],
      min_stock_threshold = 5,
      variants = [],
    } = req.body;

    if (!name || !sku || !regular_price) {
      return res.status(400).json({ error: 'Name, SKU, and regular_price are required' });
    }

    // Check duplicate SKU in this business
    const existingSku = db.prepare(`SELECT id FROM products WHERE business_id = ? AND sku = ?`).get(bizId, sku);
    if (existingSku) {
      return res.status(400).json({ error: `SKU "${sku}" already exists in your inventory.` });
    }

    const prodId = 'prd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        INSERT INTO products (
          id, business_id, category_id, name, sku, description, brand,
          regular_price, discount_price, colour, sizes, images, min_stock_threshold
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        prodId,
        bizId,
        category_id || null,
        name,
        sku,
        description || '',
        brand || '',
        Number(regular_price),
        discount_price ? Number(discount_price) : null,
        colour || '',
        JSON.stringify(sizes),
        JSON.stringify(images),
        Number(min_stock_threshold)
      );

      // Insert variants if provided, or generate defaults from sizes
      const variantList = variants.length > 0 ? variants : sizes.map((s: string) => ({
        size: s,
        colour: colour || 'Standard',
        stock: 10,
        price: Number(regular_price),
      }));

      for (let i = 0; i < variantList.length; i++) {
        const v = variantList[i];
        const varId = `var_${prodId}_${i + 1}`;
        const varSku = `${sku}-${(v.size || 'STD').replace(/\s+/g, '')}-${i + 1}`;
        const stockQty = Number(v.stock || v.stock_quantity || 0);

        db.prepare(`
          INSERT INTO product_variants (
            id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          varId,
          prodId,
          bizId,
          varSku,
          v.size || 'Standard',
          v.colour || colour || 'Standard',
          Number(v.price || regular_price),
          v.discount_price ? Number(v.discount_price) : null,
          stockQty
        );

        // Record initial stock in ledger
        if (stockQty > 0) {
          db.prepare(`
            INSERT INTO inventory_movements (
              id, business_id, product_id, variant_id, change_qty, balance_after, movement_type, notes
            ) VALUES (?, ?, ?, ?, ?, ?, 'PURCHASE', 'Product creation stock setup')
          `).run(
            `mov_${varId}_init`,
            bizId,
            prodId,
            varId,
            stockQty,
            stockQty
          );
        }
      }

      db.exec('COMMIT;');
      res.status(201).json({ id: prodId, message: 'Product created successfully' });
    } catch (inner: any) {
      db.exec('ROLLBACK;');
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/products/:id
apiRouter.put('/products/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const {
      name,
      category_id,
      description,
      brand,
      regular_price,
      discount_price,
      colour,
      sizes,
      images,
      min_stock_threshold,
      is_archived,
    } = req.body;

    db.prepare(`
      UPDATE products
      SET name = COALESCE(?, name),
          category_id = COALESCE(?, category_id),
          description = COALESCE(?, description),
          brand = COALESCE(?, brand),
          regular_price = COALESCE(?, regular_price),
          discount_price = ?,
          colour = COALESCE(?, colour),
          sizes = COALESCE(?, sizes),
          images = COALESCE(?, images),
          min_stock_threshold = COALESCE(?, min_stock_threshold),
          is_archived = COALESCE(?, is_archived),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ?
    `).run(
      name,
      category_id,
      description,
      brand,
      regular_price ? Number(regular_price) : null,
      discount_price !== undefined ? (discount_price ? Number(discount_price) : null) : null,
      colour,
      sizes ? JSON.stringify(sizes) : null,
      images ? JSON.stringify(images) : null,
      min_stock_threshold !== undefined ? Number(min_stock_threshold) : null,
      is_archived !== undefined ? (is_archived ? 1 : 0) : null,
      req.params.id,
      bizId
    );

    res.json({ message: 'Product updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/:id
apiRouter.delete('/products/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    // Soft delete / archive to protect historical order items foreign keys
    db.prepare(`
      UPDATE products SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ?
    `).run(req.params.id, bizId);

    res.json({ message: 'Product archived successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Bulk CSV Import
apiRouter.post('/products/bulk-csv', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { items } = req.body; // Array of product objects from CSV
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required for bulk CSV import' });
    }

    let importedCount = 0;
    db.exec('BEGIN TRANSACTION;');
    try {
      for (const item of items) {
        if (!item.name || !item.sku || !item.regular_price) continue;

        // Skip if SKU already exists
        const exists = db.prepare('SELECT id FROM products WHERE business_id = ? AND sku = ?').get(bizId, item.sku);
        if (exists) continue;

        const prodId = 'prd_bulk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        db.prepare(`
          INSERT INTO products (
            id, business_id, name, sku, description, brand, regular_price,
            discount_price, colour, sizes, images, min_stock_threshold
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          prodId,
          bizId,
          item.name,
          item.sku,
          item.description || '',
          item.brand || '',
          Number(item.regular_price),
          item.discount_price ? Number(item.discount_price) : null,
          item.colour || '',
          JSON.stringify(item.sizes ? item.sizes.split(';') : ['Standard']),
          JSON.stringify(item.image_url ? [item.image_url] : ['https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600&auto=format&fit=crop&q=80']),
          Number(item.min_stock || 5)
        );

        // Add a default variant
        const varId = `var_${prodId}_1`;
        const initialStock = Number(item.stock || 10);
        db.prepare(`
          INSERT INTO product_variants (
            id, product_id, business_id, sku, size, colour, price, stock_quantity
          ) VALUES (?, ?, ?, ?, 'Standard', ?, ?, ?)
        `).run(
          varId,
          prodId,
          bizId,
          `${item.sku}-STD`,
          item.colour || 'Standard',
          Number(item.regular_price),
          initialStock
        );

        importedCount++;
      }
      db.exec('COMMIT;');
      res.json({ message: `Successfully imported ${importedCount} products.`, importedCount });
    } catch (inner: any) {
      db.exec('ROLLBACK;');
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// CSV Export
apiRouter.get('/products/export-csv', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const products = db.prepare(`
    SELECT p.name, p.sku, c.name as category, p.brand, p.regular_price, p.discount_price,
           p.colour, (SELECT SUM(stock_quantity) FROM product_variants WHERE product_id = p.id) as total_stock
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.business_id = ? AND p.is_archived = 0
  `).all(bizId);

  res.json({ products });
});

// -------------------------------------------------------------
// CATEGORIES
// -------------------------------------------------------------
apiRouter.get('/categories', optionalAuthMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const cats = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM product_categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0
    WHERE c.business_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(bizId);
  res.json(cats);
});

apiRouter.post('/categories', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);

    db.prepare(`
      INSERT INTO product_categories (id, business_id, name, slug, description, image_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, bizId, name, slug, description || '', image_url || '');

    res.status(201).json({ id, name, slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/categories/:id', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  // Check if products exist in category
  const prodCount = (db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE category_id = ? AND business_id = ? AND is_archived = 0
  `).get(req.params.id, bizId) as any).count;

  if (prodCount > 0) {
    return res.status(400).json({
      error: `Cannot delete category: Contains ${prodCount} active product(s). Please reassign or delete them first.`,
    });
  }

  db.prepare('DELETE FROM product_categories WHERE id = ? AND business_id = ?').run(req.params.id, bizId);
  res.json({ message: 'Category deleted successfully' });
});

// -------------------------------------------------------------
// VARIANTS & INVENTORY
// -------------------------------------------------------------
apiRouter.get('/products/:id/variants', optionalAuthMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const variants = db.prepare(`
    SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?
  `).all(req.params.id, bizId);
  res.json(variants);
});

apiRouter.post('/products/:id/variants', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { size, colour, price, discount_price, stock_quantity = 0 } = req.body;

    const prod = db.prepare('SELECT sku FROM products WHERE id = ? AND business_id = ?').get(req.params.id, bizId) as any;
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    const varId = `var_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const varSku = `${prod.sku}-${(size || 'STD').replace(/\s+/g, '')}-${(colour || 'STD').substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    db.prepare(`
      INSERT INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(varId, req.params.id, bizId, varSku, size, colour, Number(price), discount_price ? Number(discount_price) : null, Number(stock_quantity));

    if (stock_quantity > 0) {
      db.prepare(`
        INSERT INTO inventory_movements (id, business_id, product_id, variant_id, change_qty, balance_after, movement_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'PURCHASE', 'New variant stock added')
      `).run(`mov_${varId}`, bizId, req.params.id, varId, Number(stock_quantity), Number(stock_quantity));
    }

    res.status(201).json({ id: varId, sku: varSku });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory
apiRouter.get('/inventory', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const items = db.prepare(`
    SELECT v.*, p.name as product_name, p.min_stock_threshold, p.images as product_images,
           c.name as category_name
    FROM product_variants v
    JOIN products p ON v.product_id = p.id
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE v.business_id = ? AND p.is_archived = 0
    ORDER BY v.stock_quantity ASC
  `).all(bizId) as any[];

  res.json(items.map((i) => {
    let images = [];
    try { images = JSON.parse(i.product_images || '[]'); } catch {}
    return {
      ...i,
      product_images: images,
      isLowStock: i.stock_quantity <= i.min_stock_threshold,
      isOutOfStock: i.stock_quantity === 0,
    };
  }));
});

// PUT /api/inventory/:id (Update Variant Stock with Ledger Movement)
apiRouter.put('/inventory/:id', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { adjustment_qty, new_stock_qty, movement_type = 'ADJUSTMENT', notes } = req.body;

    const variant = db.prepare(`
      SELECT * FROM product_variants WHERE id = ? AND business_id = ?
    `).get(req.params.id, bizId) as any;

    if (!variant) return res.status(404).json({ error: 'Variant not found' });

    let finalStock = variant.stock_quantity;
    let change = 0;

    if (new_stock_qty !== undefined) {
      finalStock = Number(new_stock_qty);
      change = finalStock - variant.stock_quantity;
    } else if (adjustment_qty !== undefined) {
      change = Number(adjustment_qty);
      finalStock = variant.stock_quantity + change;
    }

    if (finalStock < 0) {
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      db.prepare(`
        UPDATE product_variants
        SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND business_id = ?
      `).run(finalStock, req.params.id, bizId);

      const movId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO inventory_movements (
          id, business_id, product_id, variant_id, change_qty, balance_after, movement_type, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        movId,
        bizId,
        variant.product_id,
        variant.id,
        change,
        finalStock,
        movement_type,
        notes || 'Stock quantity updated by owner'
      );

      db.exec('COMMIT;');
      res.json({ message: 'Stock updated', variant_id: variant.id, new_stock: finalStock });
    } catch (inner: any) {
      db.exec('ROLLBACK;');
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/inventory/movements
apiRouter.get('/inventory/movements', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const movements = db.prepare(`
    SELECT m.*, p.name as product_name, v.size, v.colour, v.sku as variant_sku
    FROM inventory_movements m
    JOIN products p ON m.product_id = p.id
    JOIN product_variants v ON m.variant_id = v.id
    WHERE m.business_id = ?
    ORDER BY m.created_at DESC LIMIT 100
  `).all(bizId);

  res.json(movements);
});

// -------------------------------------------------------------
// CUSTOMERS
// -------------------------------------------------------------
apiRouter.get('/customers', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const customers = db.prepare(`
    SELECT c.*,
      COUNT(o.id) as total_orders,
      COALESCE(SUM(o.total_amount), 0) as total_spent
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id
    WHERE c.business_id = ?
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all(bizId);

  res.json(customers);
});

apiRouter.get('/customers/:id', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(req.params.id, bizId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const orders = db.prepare('SELECT * FROM orders WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC').all(req.params.id, bizId);
  res.json({ customer, orders });
});

apiRouter.post('/customers', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { name, phone, email, address, city, state, postal_code } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

    const id = 'cust_' + Date.now();
    db.prepare(`
      INSERT INTO customers (id, business_id, name, phone, email, address, city, state, postal_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, bizId, name, phone, email || null, address || null, city || null, state || null, postal_code || null);

    res.status(201).json({ id, name, phone });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ORDERS
// -------------------------------------------------------------
// GET /api/orders
apiRouter.get('/orders', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const { status, search } = req.query as any;

  let sql = `
    SELECT o.*, c.name as customer_name, c.phone as customer_phone
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.business_id = ?
  `;
  const params: any[] = [bizId];

  if (status && status !== 'All') {
    sql += ` AND o.order_status = ?`;
    params.push(status);
  }
  if (search) {
    sql += ` AND (o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)`;
    const w = `%${search}%`;
    params.push(w, w, w);
  }

  sql += ` ORDER BY o.created_at DESC`;
  const orders = db.prepare(sql).all(...params) as any[];

  // Attach items count
  const enriched = orders.map((o) => {
    const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(o.id);
    return {
      ...o,
      items,
      itemCount: items.length,
    };
  });

  res.json(enriched);
});

// GET /api/orders/:id
apiRouter.get('/orders/:id', optionalAuthMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const order = db.prepare(`
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
           b.name as business_name, b.phone as business_phone, b.address as business_address
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN businesses b ON o.business_id = b.id
    WHERE (o.id = ? OR o.order_number = ?) AND o.business_id = ?
  `).get(req.params.id, req.params.id, bizId) as any;

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

// POST /api/orders (Safe transaction creation)
apiRouter.post('/orders', optionalAuthMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { customerName, customerPhone, customerEmail, deliveryAddress, paymentMethod, items, notes } = req.body;

    if (!customerName || !customerPhone || !deliveryAddress || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name, phone, address and at least one item are required' });
    }

    const result = toolCreateOrderSafe({
      businessId: bizId,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      paymentMethod,
      notes,
      items,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/orders/:id/status
apiRouter.put('/orders/:id/status', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { status, payment_status } = req.body;

    const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND business_id = ?`).get(req.params.id, bizId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // If changing to Cancelled and wasn't already Cancelled, restore stock atomically
    if (status === 'Cancelled' && order.order_status !== 'Cancelled') {
      db.exec('BEGIN TRANSACTION;');
      try {
        const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as any[];
        for (const item of items) {
          const variant = db.prepare(`SELECT * FROM product_variants WHERE id = ? AND business_id = ?`).get(item.variant_id, bizId) as any;
          if (variant) {
            const restoredStock = variant.stock_quantity + item.quantity;
            db.prepare(`
              UPDATE product_variants
              SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND business_id = ?
            `).run(restoredStock, variant.id, bizId);

            const movId = `mov_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            db.prepare(`
              INSERT INTO inventory_movements (
                id, business_id, product_id, variant_id, change_qty, balance_after,
                movement_type, reference_order_id, notes
              ) VALUES (?, ?, ?, ?, ?, ?, 'CANCELLATION', ?, 'Stock restored due to order status update to Cancelled')
            `).run(
              movId,
              bizId,
              variant.product_id,
              variant.id,
              item.quantity,
              restoredStock,
              order.order_number
            );
          }
        }

        db.prepare(`
          UPDATE orders
          SET order_status = 'Cancelled',
              payment_status = COALESCE(?, payment_status),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND business_id = ?
        `).run(payment_status, order.id, bizId);

        db.exec('COMMIT;');
        return res.json({ message: 'Order status updated to Cancelled and inventory restored' });
      } catch (inner: any) {
        db.exec('ROLLBACK;');
        throw inner;
      }
    }

    db.prepare(`
      UPDATE orders
      SET order_status = COALESCE(?, order_status),
          payment_status = COALESCE(?, payment_status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ?
    `).run(status, payment_status, req.params.id, bizId);

    res.json({ message: 'Order status updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/:id/cancel (Restores stock safely in transaction)
apiRouter.post('/orders/:id/cancel', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const order = db.prepare(`SELECT * FROM orders WHERE id = ? AND business_id = ?`).get(req.params.id, bizId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.order_status === 'Cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Get all items in this order
      const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as any[];

      // 2. Restore stock for each variant and record in ledger
      for (const item of items) {
        const variant = db.prepare(`SELECT * FROM product_variants WHERE id = ? AND business_id = ?`).get(item.variant_id, bizId) as any;
        if (variant) {
          const restoredStock = variant.stock_quantity + item.quantity;
          db.prepare(`
            UPDATE product_variants
            SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND business_id = ?
          `).run(restoredStock, variant.id, bizId);

          const movId = `mov_cancel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          db.prepare(`
            INSERT INTO inventory_movements (
              id, business_id, product_id, variant_id, change_qty, balance_after,
              movement_type, reference_order_id, notes
            ) VALUES (?, ?, ?, ?, ?, ?, 'CANCELLATION', ?, 'Stock restored due to order cancellation')
          `).run(
            movId,
            bizId,
            variant.product_id,
            variant.id,
            item.quantity,
            restoredStock,
            order.order_number
          );
        }
      }

      // 3. Update order status to Cancelled
      db.prepare(`
        UPDATE orders
        SET order_status = 'Cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND business_id = ?
      `).run(order.id, bizId);

      db.exec('COMMIT;');
      res.json({ message: `Order #${order.order_number} cancelled and inventory restored successfully.` });
    } catch (inner: any) {
      db.exec('ROLLBACK;');
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AI SHOPPING AGENT ENDPOINTS
// -------------------------------------------------------------
// POST /api/ai/chat
apiRouter.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { message, conversationId, history = [], customerName = 'Guest Customer', customerPhone } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Run AI Agent (Gemini 3.8 Flash or Deterministic Engine fallback)
    const aiResult = await runGeminiAgent(bizId, message, history);

    // Persist conversation if conversationId or phone provided
    let convId = conversationId;
    if (!convId && customerPhone) {
      const existingConv = db.prepare('SELECT id FROM conversations WHERE business_id = ? AND customer_phone = ?').get(bizId, customerPhone) as any;
      if (existingConv) {
        convId = existingConv.id;
      }
    }

    if (!convId) {
      convId = 'conv_' + Date.now();
      db.prepare(`
        INSERT INTO conversations (id, business_id, customer_name, customer_phone, status)
        VALUES (?, ?, ?, ?, 'Open')
      `).run(convId, bizId, customerName, customerPhone || null);
    }

    // Save Customer Message
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, 'CUSTOMER', ?, ?, null)
    `).run('msg_' + Date.now() + '_c', convId, customerName, message);

    // Save AI Response
    db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, 'AI', 'ShopMate AI', ?, ?)
    `).run(
      'msg_' + Date.now() + '_a',
      convId,
      aiResult.reply,
      JSON.stringify({
        tool: aiResult.toolExecuted,
        engine: aiResult.engine,
        suggestedProducts: (aiResult.suggestedProducts || []).map((p: any) => p.id),
      })
    );

    res.json({
      ...aiResult,
      conversationId: convId,
    });
  } catch (err: any) {
    console.error('Error in /api/ai/chat:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/search-products
apiRouter.post('/ai/search-products', (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const results = toolSearchProducts({ businessId: bizId, ...req.body });
  res.json(results);
});

// POST /api/ai/recommendations
apiRouter.post('/ai/recommendations', (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const { categoryId, excludeProductId } = req.body;
  const results = toolGetRecommendations(bizId, categoryId, excludeProductId);
  res.json(results);
});

// POST /api/ai/summarise
apiRouter.post('/ai/summarise', (req: Request, res: Response) => {
  const { conversationId } = req.body;
  if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

  const msgs = db.prepare('SELECT sender_type, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[];
  if (msgs.length === 0) {
    return res.json({ summary: 'No messages in conversation yet.' });
  }

  const summary = `Customer engaged in shopping enquiry (${msgs.length} messages). Discussed products, checked size/stock availability, and reviewed cart options.`;
  db.prepare('UPDATE conversations SET ai_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, conversationId);

  res.json({ summary });
});

// -------------------------------------------------------------
// CONVERSATIONS
// -------------------------------------------------------------
apiRouter.get('/conversations', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const convs = db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time
    FROM conversations c
    WHERE c.business_id = ?
    ORDER BY c.updated_at DESC
  `).all(bizId);

  res.json(convs);
});

apiRouter.get('/conversations/:id/messages', optionalAuthMiddleware, (req: Request, res: Response) => {
  const msgs = db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json(msgs);
});

// -------------------------------------------------------------
// EMPLOYEES
// -------------------------------------------------------------
apiRouter.get('/employees', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const employees = db.prepare(`
    SELECT id, email, name, role, phone, created_at
    FROM users
    WHERE business_id = ? AND role IN ('EMPLOYEE', 'BUSINESS_OWNER')
    ORDER BY created_at ASC
  `).all(bizId);

  res.json(employees);
});

apiRouter.post('/employees', authMiddleware, (req: Request, res: Response) => {
  try {
    const bizId = resolveBusinessId(req);
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and temporary password are required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const id = 'usr_emp_' + Date.now();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, business_id, phone)
      VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, ?)
    `).run(id, email, hashPassword(password), name, bizId, phone || null);

    res.status(201).json({ id, name, email, role: 'EMPLOYEE' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ANALYTICS & REPORTING
// -------------------------------------------------------------
apiRouter.get('/analytics/overview', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);

  const totalRevenue = (db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as rev FROM orders WHERE business_id = ? AND order_status != 'Cancelled'
  `).get(bizId) as any).rev;

  const totalOrders = (db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ?
  `).get(bizId) as any).count;

  const pendingOrders = (db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND order_status IN ('Pending', 'Confirmed', 'Processing', 'Packed')
  `).get(bizId) as any).count;

  const completedOrders = (db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND order_status = 'Delivered'
  `).get(bizId) as any).count;

  const totalCustomers = (db.prepare(`
    SELECT COUNT(*) as count FROM customers WHERE business_id = ?
  `).get(bizId) as any).count;

  const totalProducts = (db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE business_id = ? AND is_archived = 0
  `).get(bizId) as any).count;

  const lowStockCount = (db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_variants v ON p.id = v.product_id
    WHERE p.business_id = ? AND p.is_archived = 0 AND v.stock_quantity <= p.min_stock_threshold AND v.stock_quantity > 0
  `).get(bizId) as any).count;

  const outOfStockCount = (db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_variants v ON p.id = v.product_id
    WHERE p.business_id = ? AND p.is_archived = 0 AND v.stock_quantity = 0
  `).get(bizId) as any).count;

  // Recent 5 orders
  const recentOrders = db.prepare(`
    SELECT o.*, c.name as customer_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.business_id = ?
    ORDER BY o.created_at DESC LIMIT 5
  `).all(bizId);

  // Best selling products
  const bestSellers = db.prepare(`
    SELECT p.name, p.sku, SUM(oi.quantity) as units_sold, SUM(oi.total_price) as revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.business_id = ? AND o.order_status != 'Cancelled'
    GROUP BY p.id
    ORDER BY units_sold DESC LIMIT 5
  `).all(bizId);

  res.json({
    metrics: {
      totalRevenue,
      totalOrders,
      pendingOrders,
      completedOrders,
      totalCustomers,
      totalProducts,
      lowStockCount,
      outOfStockCount,
    },
    recentOrders,
    bestSellers,
  });
});

apiRouter.get('/analytics/sales', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  // Group sales by day for actual trends
  const dailySales = db.prepare(`
    SELECT substr(order_date, 1, 10) as date,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue
    FROM orders
    WHERE business_id = ? AND order_status != 'Cancelled'
    GROUP BY date
    ORDER BY date ASC
  `).all(bizId);

  const categoryShare = db.prepare(`
    SELECT COALESCE(c.name, 'Uncategorized') as category,
           SUM(oi.quantity) as units,
           SUM(oi.total_price) as revenue
    FROM order_items oi
    JOIN products p ON oi.product_id = p.id
    LEFT JOIN product_categories c ON p.category_id = c.id
    JOIN orders o ON oi.order_id = o.id
    WHERE o.business_id = ? AND o.order_status != 'Cancelled'
    GROUP BY c.id
  `).all(bizId);

  res.json({
    dailySales,
    categoryShare,
  });
});

// -------------------------------------------------------------
// INTEGRATIONS & WHATSAPP
// -------------------------------------------------------------
apiRouter.get('/integrations', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const integrations = db.prepare('SELECT * FROM integrations WHERE business_id = ?').all(bizId);
  res.json(integrations);
});

apiRouter.put('/integrations/:id', authMiddleware, (req: Request, res: Response) => {
  const bizId = resolveBusinessId(req);
  const { status, phone_number, settings } = req.body;

  db.prepare(`
    UPDATE integrations
    SET status = COALESCE(?, status),
        phone_number = COALESCE(?, phone_number),
        settings_json = COALESCE(?, settings_json),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND business_id = ?
  `).run(status, phone_number, settings ? JSON.stringify(settings) : null, req.params.id, bizId);

  res.json({ message: 'Integration updated' });
});

// WhatsApp Webhook Simulator & Meta verification endpoint
apiRouter.get('/webhooks/whatsapp', (req: Request, res: Response) => {
  // Support Meta WhatsApp Webhook verification challenge
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === 'shopmate_verify_token_2026') {
    return res.status(200).send(challenge);
  }
  res.json({ status: 'WhatsApp webhook ready', timestamp: new Date().toISOString() });
});

apiRouter.post('/webhooks/whatsapp', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    console.log('[WhatsApp Webhook Received]', JSON.stringify(payload, null, 2));

    // Handle incoming message simulation
    const fromNumber = payload.from || payload.contacts?.[0]?.wa_id || '';
    const messageBody = payload.text || payload.messages?.[0]?.text?.body || 'Hello';
    const firstBiz = db.prepare('SELECT id FROM businesses WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1').get() as { id: string } | undefined;
    const bizId = payload.businessId || firstBiz?.id || '';

    const aiRes = await runGeminiAgent(bizId, messageBody);

    res.json({
      status: 'success',
      autoReply: aiRes.reply,
      engine: aiRes.engine,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
