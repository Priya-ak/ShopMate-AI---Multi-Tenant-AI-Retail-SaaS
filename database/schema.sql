-- ==============================================================================
-- SHOPMATE AI - NORMALIZED RELATIONAL DATABASE SCHEMA (SQLite / PostgreSQL Compatible)
-- ==============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS businesses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  currency TEXT DEFAULT '₹',
  ai_greeting TEXT,
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

-- ---------------------------------------------------------------------------
-- Additions (2026-11-09.1). The application applies these automatically at startup
-- (see server/db.ts); they are listed here for reference only.
-- ---------------------------------------------------------------------------
-- businesses: assistant_name TEXT, suggested_questions TEXT (JSON array), is_demo INTEGER DEFAULT 0
-- users: auth_provider TEXT DEFAULT 'password', google_id TEXT, avatar_url TEXT, is_demo INTEGER DEFAULT 0,
--        last_login_at TEXT, last_seen_at TEXT, login_count INTEGER DEFAULT 0
-- CREATE TABLE login_events (id, user_id, email, name, role, business_id, method, success, failure_reason,
--                            ip, user_agent, created_at);   -- feeds the Super Admin portal
-- CREATE TABLE app_meta (key, value);                         -- schema version marker
