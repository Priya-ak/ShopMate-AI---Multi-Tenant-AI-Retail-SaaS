import { db, isPostgres } from './db.js';
import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Clean production seed - does NOT seed any sample products, mock orders,
 * fake customers, or sample conversations.
 */
export function seedDatabase() {
  console.log('Production mode: Database initialized cleanly without sample data.');
}

/**
 * Utility to completely wipe all sample records from the database.
 */
export async function clearDatabase() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('clearDatabase() is for automated tests only and is disabled in production.');
  }
  if (isPostgres) {
    await db.exec(`
      TRUNCATE order_items, orders, inventory_movements, product_variants, products, product_categories,
               messages, conversations, customers, integrations, audit_logs, password_reset_tokens,
               login_events, users, businesses CASCADE;
    `);
  } else {
    await db.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM order_items;
      DELETE FROM orders;
      DELETE FROM inventory_movements;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM product_categories;
      DELETE FROM messages;
      DELETE FROM conversations;
      DELETE FROM customers;
      DELETE FROM integrations;
      DELETE FROM audit_logs;
      DELETE FROM password_reset_tokens;
      DELETE FROM login_events;
      DELETE FROM users;
      DELETE FROM businesses;
      PRAGMA foreign_keys = ON;
    `);
  }
  console.log('Database purged completely: 0 sample records remain.');
}

/**
 * Isolated test fixture generator strictly for automated test suites.
 * Automatically cleaned up after test execution.
 */
export async function seedTestFixtures() {
  await clearDatabase();

  const biz1Id = 'biz_kalakriti_001';
  const biz2Id = 'biz_urbanvogue_002';

  await db.prepare(`
    INSERT INTO businesses (id, name, slug, category, phone, email, address, currency, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(biz1Id, 'Test Store 1', 'test-store-1', 'Fashion', '+91 90000 00001', 'test1@example.com', '108 Test St, Bengaluru', '₹');

  await db.prepare(`
    INSERT INTO businesses (id, name, slug, category, phone, email, address, currency, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(biz2Id, 'Test Store 2', 'test-store-2', 'Streetwear', '+91 90000 00002', 'test2@example.com', '42 Test Rd, Mumbai', '₹');

  // Insert categories
  await db.prepare(`INSERT INTO product_categories (id, business_id, name, slug) VALUES (?, ?, ?, ?)`).run('cat_kurtis', biz1Id, 'Kurtis & Kurta Sets', 'kurtis');
  await db.prepare(`INSERT INTO product_categories (id, business_id, name, slug) VALUES (?, ?, ?, ?)`).run('cat_sarees', biz1Id, 'Sarees', 'sarees');
  await db.prepare(`INSERT INTO product_categories (id, business_id, name, slug) VALUES (?, ?, ?, ?)`).run('cat_shirts', biz1Id, 'Shirts', 'shirts');
  await db.prepare(`INSERT INTO product_categories (id, business_id, name, slug) VALUES (?, ?, ?, ?)`).run('cat_dresses', biz1Id, 'Dresses', 'dresses');
  await db.prepare(`INSERT INTO product_categories (id, business_id, name, slug) VALUES (?, ?, ?, ?)`).run('cat_uv', biz2Id, 'Streetwear', 'streetwear');

  // Insert 30 test products for KalaKriti
  for (let i = 1; i <= 30; i++) {
    const isKurti = i <= 10;
    const isSaree = i > 10 && i <= 20;
    const isRed = i % 3 === 0;
    const isBlue = i % 3 === 1;
    const catId = isKurti ? 'cat_kurtis' : isSaree ? 'cat_sarees' : 'cat_shirts';
    const name = isKurti
      ? `${isRed ? 'Red' : 'Yellow'} Anarkali Kurti #${i}`
      : isSaree
      ? `${isBlue ? 'Blue' : 'Green'} Silk Saree #${i}`
      : `Casual Cotton Shirt #${i}`;
    const colour = isRed ? 'Red' : isBlue ? 'Blue' : 'Green';
    const price = 800 + i * 35; // ranges between 835 and 1850

    await db.prepare(`
      INSERT INTO products (id, business_id, category_id, name, sku, regular_price, discount_price, colour, sizes, is_archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(`t_prd_${i}`, biz1Id, catId, name, `TEST-SKU-${i}`, price + 200, price, colour, JSON.stringify(['S', 'M', 'L']));

    // Insert variants
    for (const size of ['S', 'M', 'L']) {
      await db.prepare(`
        INSERT INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(`t_var_${i}_${size}`, `t_prd_${i}`, biz1Id, `TEST-SKU-${i}-${size}`, size, colour, price + 200, price, 15);
    }
  }

  // Insert 1 product for biz 2
  await db.prepare(`
    INSERT INTO products (id, business_id, category_id, name, sku, regular_price, discount_price, colour, sizes, is_archived)
    VALUES ('t_prd_b2', ?, 'cat_uv', 'Urban Denim Jacket', 'UV-JCK-01', 2500, 2200, 'Black', '["M", "L"]', 0)
  `).run(biz2Id);
  await db.prepare(`
    INSERT INTO product_variants (id, product_id, business_id, sku, size, colour, price, discount_price, stock_quantity)
    VALUES ('t_var_b2_M', 't_prd_b2', ?, 'UV-JCK-01-M', 'M', 'Black', 2500, 2200, 10)
  `).run(biz2Id);
}
