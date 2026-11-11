import { Request, Response } from 'express';
import { asyncRouter } from './asyncRouter.js';
import { db, newId } from './db.js';
import { loadVariantsByProduct } from './dbHelpers.js';
import {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  resolveBusinessId,
  AuthUser,
  DEMO_BUSINESS_ID,
  cleanText,
  hashPassword,
  isValidEmail,
} from './auth.js';
import { authRouter } from './authRoutes.js';
import { superAdminRouter } from './superadmin.js';
import { appAssistantRouter } from './appAssistant.js';
import { AccountError, sanitizeQuestions, serializeBusiness } from './accounts.js';
import {
  runGeminiAgent,
  runDeterministicAgent,
  toolSearchProducts,
  toolGetRecommendations,
  toolCreateOrderSafe,
} from './gemini.js';

export { authMiddleware, optionalAuthMiddleware, resolveBusinessId };
export type { AuthUser };

/** Safe error response for store APIs: log the real cause, never leak database internals to the browser. */
function apiError(res: Response, err: any, fallback = 'Something went wrong on our side. Please try again.') {
  if (err instanceof AccountError) return res.status(err.status).json({ error: err.message, code: err.code });
  const msg = String(err?.message || '');
  if (err?.code === '23505' || /UNIQUE constraint failed/i.test(msg)) {
    return res.status(409).json({ error: 'That already exists. Please use a different name or value.', code: 'DUPLICATE' });
  }
  if (err?.code === '23503' || /FOREIGN KEY constraint failed/i.test(msg)) {
    return res.status(409).json({ error: 'This item is linked to other records and cannot be changed this way.', code: 'IN_USE' });
  }
  console.error('[api] request failed:', msg || err);
  return res.status(500).json({ error: fallback });
}

export const apiRouter = asyncRouter();

apiRouter.use(authRouter);
apiRouter.use('/superadmin', superAdminRouter);
apiRouter.use(appAssistantRouter);

// -------------------------------------------------------------
// BUSINESSES
// -------------------------------------------------------------
apiRouter.get('/businesses/me', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const biz = await db.prepare('SELECT * FROM businesses WHERE id = ?').get(bizId);
  if (!biz) return res.status(404).json({ error: 'Business not found' });
  res.json(serializeBusiness(biz));
});

// Owner-only: store profile + the store's own AI chatbot (name, greeting, suggested questions).
apiRouter.put('/businesses/me', authMiddleware, requireRole('BUSINESS_OWNER'), async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const body = req.body || {};

    const name = body.name !== undefined ? cleanText(body.name, 80) : null;
    if (name !== null && name.length < 2) return res.status(400).json({ error: 'Business name is required (at least 2 characters).' });
    const email = body.email !== undefined ? cleanText(body.email, 254) : null;
    if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid support email.' });

    let assistantName: string | null = null;
    if (body.assistant_name !== undefined) {
      assistantName = cleanText(body.assistant_name, 40);
      if (!assistantName) return res.status(400).json({ error: 'The assistant needs a name.' });
    }
    const greeting = body.ai_greeting !== undefined ? cleanText(body.ai_greeting, 500) : null;
    const questions = body.suggested_questions !== undefined ? JSON.stringify(sanitizeQuestions(body.suggested_questions)) : null;

    await db.prepare(`
      UPDATE businesses
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          currency = COALESCE(?, currency),
          ai_greeting = COALESCE(?, ai_greeting),
          assistant_name = COALESCE(?, assistant_name),
          suggested_questions = COALESCE(?, suggested_questions),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      body.phone !== undefined ? cleanText(body.phone, 30) : null,
      email,
      body.address !== undefined ? cleanText(body.address, 250) : null,
      body.currency !== undefined ? cleanText(body.currency, 6) || null : null,
      greeting,
      assistantName,
      questions,
      bizId
    );

    const updated = await db.prepare('SELECT * FROM businesses WHERE id = ?').get(bizId);
    res.json(serializeBusiness(updated));
  } catch (err: any) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// Platform Super Admin - List all businesses
apiRouter.get('/businesses', authMiddleware, async (req: Request, res: Response) => {
  const user = (req as any).user as AuthUser;
  if (user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Super Admin only' });
  }

  // Real platform admins only (the demo admin persona no longer exists).
  const businesses = await db.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM products WHERE business_id = b.id) as product_count,
      (SELECT COUNT(*) FROM orders WHERE business_id = b.id) as order_count,
      (SELECT COUNT(*) FROM users WHERE business_id = b.id) as user_count
    FROM businesses b
    ${user.is_demo ? 'WHERE b.id = ?' : ''}
  `).all(...(user.is_demo ? [DEMO_BUSINESS_ID] : []));

  res.json(businesses);
});

// -------------------------------------------------------------
// PRODUCTS
// -------------------------------------------------------------
// GET /api/products (supports search, category, colour, size, min/max price, sorting, pagination)
apiRouter.get('/products', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
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

    const products = await db.prepare(sql).all(...params) as any[];

    // Hydrate variants and parsed fields
    const variantsByProduct = await loadVariantsByProduct(bizId, products.map((p) => p.id));
    const enriched = products.map((p) => {
      const variants = variantsByProduct.get(p.id) || [];
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

    const totalCount = (await db.prepare(`SELECT COUNT(*) as count FROM products WHERE business_id = ? AND is_archived = 0`).get(bizId) as any).count;

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
    return apiError(res, err);
  }
});

// GET /api/products/:id
apiRouter.get('/products/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const p = await db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.id = ? AND p.business_id = ?
  `).get(req.params.id, bizId) as any;

  if (!p) return res.status(404).json({ error: 'Product not found' });

  const variants = await db.prepare(`SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?`).all(p.id, bizId);
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
apiRouter.post('/products', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
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
    const existingSku = await db.prepare(`SELECT id FROM products WHERE business_id = ? AND sku = ?`).get(bizId, sku);
    if (existingSku) {
      return res.status(400).json({ error: `SKU "${sku}" already exists in your inventory.` });
    }

    const prodId = 'prd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    await db.transaction(async () => {
      await db.prepare(`
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

        await db.prepare(`
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
          await db.prepare(`
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

    });
    res.status(201).json({ id: prodId, message: 'Product created successfully' });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// PUT /api/products/:id
apiRouter.put('/products/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
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

    await db.prepare(`
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
    return apiError(res, err);
  }
});

// DELETE /api/products/:id
apiRouter.delete('/products/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    // Soft delete / archive to protect historical order items foreign keys
    await db.prepare(`
      UPDATE products SET is_archived = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ?
    `).run(req.params.id, bizId);

    res.json({ message: 'Product archived successfully' });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// Bulk CSV Import
apiRouter.post('/products/bulk-csv', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { items } = req.body; // Array of product objects from CSV
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required for bulk CSV import' });
    }

    let importedCount = 0;
    await db.transaction(async () => {
      for (const item of items) {
        if (!item.name || !item.sku || !item.regular_price) continue;

        // Skip if SKU already exists
        const exists = await db.prepare('SELECT id FROM products WHERE business_id = ? AND sku = ?').get(bizId, item.sku);
        if (exists) continue;

        const prodId = 'prd_bulk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        await db.prepare(`
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
        await db.prepare(`
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
    });
    res.json({ message: `Successfully imported ${importedCount} products.`, importedCount });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// CSV Export
apiRouter.get('/products/export-csv', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const products = await db.prepare(`
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
apiRouter.get('/categories', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const cats = await db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM product_categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0
    WHERE c.business_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(bizId);
  res.json(cats);
});

apiRouter.post('/categories', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { name, description, image_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const id = 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);

    await db.prepare(`
      INSERT INTO product_categories (id, business_id, name, slug, description, image_url)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, bizId, name, slug, description || '', image_url || '');

    res.status(201).json({ id, name, slug });
  } catch (err: any) {
    return apiError(res, err);
  }
});

apiRouter.delete('/categories/:id', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  // Check if products exist in category
  const prodCount = (await db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE category_id = ? AND business_id = ? AND is_archived = 0
  `).get(req.params.id, bizId) as any).count;

  if (prodCount > 0) {
    return res.status(400).json({
      error: `Cannot delete category: Contains ${prodCount} active product(s). Please reassign or delete them first.`,
    });
  }

  await db.prepare('DELETE FROM product_categories WHERE id = ? AND business_id = ?').run(req.params.id, bizId);
  res.json({ message: 'Category deleted successfully' });
});

// -------------------------------------------------------------
// VARIANTS & INVENTORY
// -------------------------------------------------------------
apiRouter.get('/products/:id/variants', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const variants = await db.prepare(`
    SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?
  `).all(req.params.id, bizId);
  res.json(variants);
});

apiRouter.post('/products/:id/variants', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { size, colour, price, discount_price, stock_quantity = 0 } = req.body;

    const prod = await db.prepare('SELECT sku FROM products WHERE id = ? AND business_id = ?').get(req.params.id, bizId) as any;
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    const varId = `var_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const varSku = `${prod.sku}-${(size || 'STD').replace(/\s+/g, '')}-${(colour || 'STD').substring(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    await db.prepare(`
      INSERT INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(varId, req.params.id, bizId, varSku, size, colour, Number(price), discount_price ? Number(discount_price) : null, Number(stock_quantity));

    if (stock_quantity > 0) {
      await db.prepare(`
        INSERT INTO inventory_movements (id, business_id, product_id, variant_id, change_qty, balance_after, movement_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'PURCHASE', 'New variant stock added')
      `).run(`mov_${varId}`, bizId, req.params.id, varId, Number(stock_quantity), Number(stock_quantity));
    }

    res.status(201).json({ id: varId, sku: varSku });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// GET /api/inventory
apiRouter.get('/inventory', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const items = await db.prepare(`
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
apiRouter.put('/inventory/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { adjustment_qty, new_stock_qty, movement_type = 'ADJUSTMENT', notes } = req.body;

    const variant = await db.prepare(`
      SELECT * FROM product_variants WHERE id = ? AND business_id = ?
    `).get(req.params.id, bizId) as any;

    if (!variant) return res.status(404).json({ error: 'Variant not found' });
    if (!['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'CANCELLATION'].includes(String(movement_type))) {
      return res.status(400).json({ error: 'Invalid stock movement type.' });
    }

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

    await db.transaction(async () => {
      await db.prepare(`
        UPDATE product_variants
        SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND business_id = ?
      `).run(finalStock, req.params.id, bizId);

      const movId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      await db.prepare(`
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

    });
    res.json({ message: 'Stock updated', variant_id: variant.id, new_stock: finalStock });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// GET /api/inventory/movements
apiRouter.get('/inventory/movements', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const movements = await db.prepare(`
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
apiRouter.get('/customers', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const customers = await db.prepare(`
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

apiRouter.get('/customers/:id', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const customer = await db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(req.params.id, bizId);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const orders = await db.prepare('SELECT * FROM orders WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC').all(req.params.id, bizId);
  res.json({ customer, orders });
});

apiRouter.post('/customers', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { name, phone, email, address, city, state, postal_code } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required' });

    const id = newId('cust');
    await db.prepare(`
      INSERT INTO customers (id, business_id, name, phone, email, address, city, state, postal_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, bizId, name, phone, email || null, address || null, city || null, state || null, postal_code || null);

    res.status(201).json({ id, name, phone });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// -------------------------------------------------------------
// ORDERS
// -------------------------------------------------------------
// GET /api/orders
apiRouter.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
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
  const orders = await db.prepare(sql).all(...params) as any[];

  // Attach items count
  const itemsByOrder = new Map<string, any[]>();
  if (orders.length > 0) {
    const marks = orders.map(() => '?').join(',');
    const allItems = await db.prepare(`SELECT * FROM order_items WHERE order_id IN (${marks})`).all(...orders.map((o) => o.id)) as any[];
    for (const it of allItems) {
      const list = itemsByOrder.get(it.order_id) || [];
      list.push(it);
      itemsByOrder.set(it.order_id, list);
    }
  }
  const enriched = orders.map((o) => {
    const items = itemsByOrder.get(o.id) || [];
    return {
      ...o,
      items,
      itemCount: items.length,
    };
  });

  res.json(enriched);
});

// GET /api/orders/:id
apiRouter.get('/orders/:id', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const order = await db.prepare(`
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
           b.name as business_name, b.phone as business_phone, b.address as business_address
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    JOIN businesses b ON o.business_id = b.id
    WHERE (o.id = ? OR o.order_number = ?) AND o.business_id = ?
  `).get(req.params.id, req.params.id, bizId) as any;

  if (!order) return res.status(404).json({ error: 'Order not found' });

  const items = await db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ ...order, items });
});

// POST /api/orders (Safe transaction creation)
apiRouter.post('/orders', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { customerName, customerPhone, customerEmail, deliveryAddress, paymentMethod, items, notes } = req.body;

    if (!customerName || !customerPhone || !deliveryAddress || !items || items.length === 0) {
      return res.status(400).json({ error: 'Customer name, phone, address and at least one item are required' });
    }

    const result = await toolCreateOrderSafe({
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
    if (/relation|column|syntax|constraint|violates|SQLITE|connection/i.test(String(err?.message))) return apiError(res, err);
    res.status(400).json({ error: err.message });
  }
});

/**
 * Cancels an order and returns its stock to the ledger atomically.
 * The status flip is conditional, so two concurrent cancellations can never restock twice.
 */
async function cancelOrderAndRestock(order: any, bizId: string, note: string, paymentStatus?: string | null) {
  await db.transaction(async () => {
    const flipped = await db.prepare(`
      UPDATE orders
      SET order_status = 'Cancelled',
          payment_status = COALESCE(?, payment_status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ? AND order_status != 'Cancelled'
    `).run(paymentStatus ?? null, order.id, bizId);
    if (flipped.changes === 0) throw new AccountError(400, 'Order is already cancelled');

    const items = await db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as any[];
    for (const item of items) {
      const variant = await db.prepare(
        `SELECT * FROM product_variants WHERE id = ? AND business_id = ? FOR UPDATE`
      ).get(item.variant_id, bizId) as any;
      if (!variant) continue;

      const restoredStock = variant.stock_quantity + item.quantity;
      await db.prepare(`
        UPDATE product_variants
        SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND business_id = ?
      `).run(restoredStock, variant.id, bizId);

      await db.prepare(`
        INSERT INTO inventory_movements (
          id, business_id, product_id, variant_id, change_qty, balance_after,
          movement_type, reference_order_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'CANCELLATION', ?, ?)
      `).run(
        newId('mov_cancel'),
        bizId,
        variant.product_id,
        variant.id,
        item.quantity,
        restoredStock,
        order.order_number,
        note
      );
    }
  });
}

// PUT /api/orders/:id/status
apiRouter.put('/orders/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { status, payment_status } = req.body;

    const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Delivered', 'Cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }

    const order = await db.prepare(`SELECT * FROM orders WHERE id = ? AND business_id = ?`).get(req.params.id, bizId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Moving to Cancelled restores stock atomically
    if (status === 'Cancelled' && order.order_status !== 'Cancelled') {
      await cancelOrderAndRestock(order, bizId, 'Stock restored due to order status update to Cancelled', payment_status);
      return res.json({ message: 'Order status updated to Cancelled and inventory restored' });
    }

    await db.prepare(`
      UPDATE orders
      SET order_status = COALESCE(?, order_status),
          payment_status = COALESCE(?, payment_status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND business_id = ?
    `).run(status ?? null, payment_status ?? null, req.params.id, bizId);

    res.json({ message: 'Order status updated successfully' });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// POST /api/orders/:id/cancel (Restores stock safely in transaction)
apiRouter.post('/orders/:id/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const order = await db.prepare(`SELECT * FROM orders WHERE id = ? AND business_id = ?`).get(req.params.id, bizId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.order_status === 'Cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    await cancelOrderAndRestock(order, bizId, 'Stock restored due to order cancellation');
    res.json({ message: `Order #${order.order_number} cancelled and inventory restored successfully.` });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// -------------------------------------------------------------
// AI SHOPPING AGENT ENDPOINTS
// -------------------------------------------------------------
// POST /api/ai/chat
apiRouter.post('/ai/chat', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const body = req.body || {};

    // Input guardrails: bounded message, bounded and well-formed history.
    const message = cleanText(body.message, 1000);
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    const history = (Array.isArray(body.history) ? body.history : [])
      .slice(-10)
      .filter((h: any) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
      .map((h: any) => ({ role: h.role, content: h.content.slice(0, 1000) }));
    const customerName = cleanText(body.customerName, 80) || 'Guest Customer';
    const customerPhone = cleanText(body.customerPhone, 30) || undefined;

    // Run AI Agent (Gemini or the deterministic engine fallback)
    const aiResult = await runGeminiAgent(bizId, message, history);

    // Persist conversation (only ever inside the caller's tenant)
    let convId: string | undefined;
    if (typeof body.conversationId === 'string') {
      const owned = await db.prepare('SELECT id FROM conversations WHERE id = ? AND business_id = ?').get(body.conversationId, bizId) as any;
      convId = owned?.id;
    }
    if (!convId && customerPhone) {
      const existingConv = await db.prepare('SELECT id FROM conversations WHERE business_id = ? AND customer_phone = ?').get(bizId, customerPhone) as any;
      if (existingConv) {
        convId = existingConv.id;
      }
    }

    if (!convId) {
      convId = newId('conv');
      await db.prepare(`
        INSERT INTO conversations (id, business_id, customer_name, customer_phone, status)
        VALUES (?, ?, ?, ?, 'Open')
      `).run(convId, bizId, customerName, customerPhone || null);
    }

    // Save Customer Message
    await db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, 'CUSTOMER', ?, ?, null)
    `).run(newId('msg'), convId, customerName, message);

    // Save AI Response
    await db.prepare(`
      INSERT INTO messages (id, conversation_id, sender_type, sender_name, content, metadata)
      VALUES (?, ?, 'AI', ?, ?, ?)
    `).run(
      newId('msg'),
      convId,
      aiResult.assistantName || 'ShopMate AI',
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
    return apiError(res, err);
  }
});

// POST /api/ai/search-products
apiRouter.post('/ai/search-products', async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const results = await toolSearchProducts({ businessId: bizId, ...req.body });
  res.json(results);
});

// POST /api/ai/recommendations
apiRouter.post('/ai/recommendations', async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const { categoryId, excludeProductId } = req.body;
  const results = await toolGetRecommendations(bizId, categoryId, excludeProductId);
  res.json(results);
});

// POST /api/ai/summarise
apiRouter.post('/ai/summarise', async (req: Request, res: Response) => {
  const { conversationId } = req.body;
  if (!conversationId) return res.status(400).json({ error: 'conversationId required' });

  const msgs = await db.prepare('SELECT sender_type, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId) as any[];
  if (msgs.length === 0) {
    return res.json({ summary: 'No messages in conversation yet.' });
  }

  const summary = `Customer engaged in shopping enquiry (${msgs.length} messages). Discussed products, checked size/stock availability, and reviewed cart options.`;
  await db.prepare('UPDATE conversations SET ai_summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(summary, conversationId);

  res.json({ summary });
});

// -------------------------------------------------------------
// CONVERSATIONS
// -------------------------------------------------------------
apiRouter.get('/conversations', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const convs = await db.prepare(`
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

apiRouter.get('/conversations/:id/messages', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const msgs = await db.prepare(`
    SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json(msgs);
});

// -------------------------------------------------------------
// EMPLOYEES
// -------------------------------------------------------------
apiRouter.get('/employees', authMiddleware, requireRole('BUSINESS_OWNER', 'EMPLOYEE'), async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const employees = await db.prepare(`
    SELECT id, email, name, role, phone, created_at
    FROM users
    WHERE business_id = ? AND role IN ('EMPLOYEE', 'BUSINESS_OWNER')
    ORDER BY created_at ASC
  `).all(bizId);

  res.json(employees);
});

apiRouter.post('/employees', authMiddleware, requireRole('BUSINESS_OWNER'), async (req: Request, res: Response) => {
  try {
    const bizId = await resolveBusinessId(req);
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and temporary password are required' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(String(email).trim().toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const id = newId('usr_emp');
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, name, role, business_id, phone)
      VALUES (?, ?, ?, ?, 'EMPLOYEE', ?, ?)
    `).run(id, email.trim().toLowerCase(), await hashPassword(password), name, bizId, phone || null);

    res.status(201).json({ id, name, email, role: 'EMPLOYEE' });
  } catch (err: any) {
    return apiError(res, err);
  }
});

// -------------------------------------------------------------
// ANALYTICS & REPORTING
// -------------------------------------------------------------
apiRouter.get('/analytics/overview', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);

  const totalRevenue = (await db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as rev FROM orders WHERE business_id = ? AND order_status != 'Cancelled'
  `).get(bizId) as any).rev;

  const totalOrders = (await db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ?
  `).get(bizId) as any).count;

  const pendingOrders = (await db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND order_status IN ('Pending', 'Confirmed', 'Processing', 'Packed')
  `).get(bizId) as any).count;

  const completedOrders = (await db.prepare(`
    SELECT COUNT(*) as count FROM orders WHERE business_id = ? AND order_status = 'Delivered'
  `).get(bizId) as any).count;

  const totalCustomers = (await db.prepare(`
    SELECT COUNT(*) as count FROM customers WHERE business_id = ?
  `).get(bizId) as any).count;

  const totalProducts = (await db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE business_id = ? AND is_archived = 0
  `).get(bizId) as any).count;

  const lowStockCount = (await db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_variants v ON p.id = v.product_id
    WHERE p.business_id = ? AND p.is_archived = 0 AND v.stock_quantity <= p.min_stock_threshold AND v.stock_quantity > 0
  `).get(bizId) as any).count;

  const outOfStockCount = (await db.prepare(`
    SELECT COUNT(DISTINCT p.id) as count
    FROM products p
    JOIN product_variants v ON p.id = v.product_id
    WHERE p.business_id = ? AND p.is_archived = 0 AND v.stock_quantity = 0
  `).get(bizId) as any).count;

  // Recent 5 orders
  const recentOrders = await db.prepare(`
    SELECT o.*, c.name as customer_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.business_id = ?
    ORDER BY o.created_at DESC LIMIT 5
  `).all(bizId);

  // Best selling products
  const bestSellers = await db.prepare(`
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

apiRouter.get('/analytics/sales', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  // Group sales by day for actual trends
  const dailySales = await db.prepare(`
    SELECT substr(order_date, 1, 10) as date,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue
    FROM orders
    WHERE business_id = ? AND order_status != 'Cancelled'
    GROUP BY date
    ORDER BY date ASC
  `).all(bizId);

  const categoryShare = await db.prepare(`
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
apiRouter.get('/integrations', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const integrations = await db.prepare('SELECT * FROM integrations WHERE business_id = ?').all(bizId);
  res.json(integrations);
});

apiRouter.put('/integrations/:id', authMiddleware, async (req: Request, res: Response) => {
  const bizId = await resolveBusinessId(req);
  const { status, phone_number, settings } = req.body;

  await db.prepare(`
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
apiRouter.get('/webhooks/whatsapp', async (req: Request, res: Response) => {
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
    const firstBiz = await db.prepare('SELECT id FROM businesses WHERE is_active = 1 ORDER BY COALESCE(is_demo, 0) DESC, created_at ASC LIMIT 1').get() as { id: string } | undefined;
    const bizId = payload.businessId || firstBiz?.id || '';

    const aiRes = await runGeminiAgent(bizId, messageBody);

    res.json({
      status: 'success',
      autoReply: aiRes.reply,
      engine: aiRes.engine,
    });
  } catch (err: any) {
    return apiError(res, err);
  }
});
