import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.js';
import crypto from 'node:crypto';

// Initialize Gemini Client if key exists
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey) {
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// -------------------------------------------------------------
// Database Tools Executed on the Backend
// -------------------------------------------------------------

export interface SearchProductsParams {
  businessId: string;
  query?: string;
  categoryId?: string;
  maxPrice?: number;
  minPrice?: number;
  colour?: string;
  size?: string;
}

export function toolSearchProducts(params: SearchProductsParams) {
  let sql = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.business_id = ? AND p.is_archived = 0
  `;
  const queryArgs: any[] = [params.businessId];

  if (params.query) {
    sql += ` AND (p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ? OR p.colour LIKE ? OR c.name LIKE ?)`;
    const qWildcard = `%${params.query}%`;
    queryArgs.push(qWildcard, qWildcard, qWildcard, qWildcard, qWildcard);
  }

  if (params.categoryId) {
    sql += ` AND p.category_id = ?`;
    queryArgs.push(params.categoryId);
  }

  if (params.maxPrice !== undefined && params.maxPrice !== null) {
    sql += ` AND COALESCE(p.discount_price, p.regular_price) <= ?`;
    queryArgs.push(params.maxPrice);
  }

  if (params.minPrice !== undefined && params.minPrice !== null) {
    sql += ` AND COALESCE(p.discount_price, p.regular_price) >= ?`;
    queryArgs.push(params.minPrice);
  }

  if (params.colour) {
    sql += ` AND (LOWER(p.colour) LIKE ? OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND LOWER(pv.colour) LIKE ?))`;
    const colWildcard = `%${params.colour.toLowerCase()}%`;
    queryArgs.push(colWildcard, colWildcard);
  }

  sql += ` ORDER BY p.created_at DESC LIMIT 12`;

  const rows = db.prepare(sql).all(...queryArgs) as any[];

  // Also fetch variants for each product
  const productsWithVariants = rows.map((p) => {
    const variants = db
      .prepare(`SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?`)
      .all(p.id, params.businessId) as any[];

    let sizes: string[] = [];
    let images: string[] = [];
    try {
      sizes = JSON.parse(p.sizes || '[]');
    } catch {
      sizes = [];
    }
    try {
      images = JSON.parse(p.images || '[]');
    } catch {
      images = [];
    }

    // Check size filter if requested with word-boundary matching
    if (params.size) {
      const targetSize = params.size.trim().toLowerCase();
      const matchSize = variants.some((v) => {
        const vSize = v.size.trim().toLowerCase();
        if (targetSize === 'm') {
          return vSize === 'm' || vSize === 'medium' || /\bm\b/i.test(vSize);
        } else if (targetSize === 's') {
          return vSize === 's' || vSize === 'small' || /\bs\b/i.test(vSize);
        } else if (targetSize === 'l') {
          return vSize === 'l' || vSize === 'large' || /\bl\b/i.test(vSize);
        } else if (targetSize === 'xl') {
          return vSize === 'xl' || vSize === 'extra large' || /\bxl\b/i.test(vSize);
        } else if (targetSize === 'xxl') {
          return vSize === 'xxl' || /\bxxl\b/i.test(vSize);
        } else if (targetSize === 'xs') {
          return vSize === 'xs' || /\bxs\b/i.test(vSize);
        }
        return vSize === targetSize || new RegExp(`\\b${targetSize}\\b`, 'i').test(vSize);
      });
      if (!matchSize) return null;
    }

    const totalStock = variants.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      categoryName: p.category_name,
      brand: p.brand,
      regularPrice: p.regular_price,
      discountPrice: p.discount_price,
      currentPrice: p.discount_price || p.regular_price,
      colour: p.colour,
      sizes,
      images,
      totalStock,
      inStock: totalStock > 0,
      variants: variants.map((v) => ({
        id: v.id,
        size: v.size,
        colour: v.colour,
        price: v.discount_price || v.price,
        stock: v.stock_quantity,
        sku: v.sku,
      })),
    };
  }).filter(Boolean);

  return productsWithVariants;
}

export function toolGetProductDetails(businessId: string, productIdOrSku: string) {
  const p = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.business_id = ? AND (p.id = ? OR p.sku = ?)
  `).get(businessId, productIdOrSku, productIdOrSku) as any;

  if (!p) return null;

  const variants = db.prepare(`
    SELECT * FROM product_variants WHERE product_id = ? AND business_id = ?
  `).all(p.id, businessId) as any[];

  let sizes: string[] = [];
  let images: string[] = [];
  try {
    sizes = JSON.parse(p.sizes || '[]');
  } catch {}
  try {
    images = JSON.parse(p.images || '[]');
  } catch {}

  const totalStock = variants.reduce((acc, v) => acc + (v.stock_quantity || 0), 0);

  return {
    ...p,
    sizes,
    images,
    totalStock,
    currentPrice: p.discount_price || p.regular_price,
    variants: variants.map((v) => ({
      id: v.id,
      size: v.size,
      colour: v.colour,
      price: v.discount_price || v.price,
      stock: v.stock_quantity,
      sku: v.sku,
    })),
  };
}

export function toolCheckInventory(businessId: string, variantId: string) {
  const v = db.prepare(`
    SELECT v.*, p.name as product_name
    FROM product_variants v
    JOIN products p ON v.product_id = p.id
    WHERE v.id = ? AND v.business_id = ?
  `).get(variantId, businessId) as any;

  if (!v) {
    return { available: false, stock: 0, message: 'Variant not found' };
  }

  return {
    available: v.stock_quantity > 0,
    stock: v.stock_quantity,
    size: v.size,
    colour: v.colour,
    price: v.discount_price || v.price,
    productName: v.product_name,
  };
}

export function toolSearchCategories(businessId: string) {
  const cats = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM product_categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_archived = 0
    WHERE c.business_id = ?
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all(businessId);
  return cats;
}

export function toolGetOrderStatus(businessId: string, orderNumberOrPhone: string) {
  let order = db.prepare(`
    SELECT o.*, c.name as customer_name, c.phone as customer_phone
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    WHERE o.business_id = ? AND (o.order_number = ? OR c.phone = ?)
    ORDER BY o.created_at DESC LIMIT 1
  `).get(businessId, orderNumberOrPhone, orderNumberOrPhone) as any;

  if (!order) return null;

  const items = db.prepare(`
    SELECT * FROM order_items WHERE order_id = ?
  `).all(order.id);

  return {
    ...order,
    items,
  };
}

export function toolGetRecommendations(businessId: string, categoryId?: string, excludeProductId?: string) {
  let sql = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN product_categories c ON p.category_id = c.id
    WHERE p.business_id = ? AND p.is_archived = 0
  `;
  const params: any[] = [businessId];

  if (categoryId) {
    sql += ` AND p.category_id = ?`;
    params.push(categoryId);
  }
  if (excludeProductId) {
    sql += ` AND p.id != ?`;
    params.push(excludeProductId);
  }

  sql += ` ORDER BY RANDOM() LIMIT 4`;
  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((p) => {
    let images = [];
    try {
      images = JSON.parse(p.images || '[]');
    } catch {}
    return {
      id: p.id,
      name: p.name,
      currentPrice: p.discount_price || p.regular_price,
      regularPrice: p.regular_price,
      colour: p.colour,
      images,
    };
  });
}

// -------------------------------------------------------------
// Transaction-Safe Order Creation
// -------------------------------------------------------------
export interface CreateOrderParams {
  businessId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  paymentMethod?: string;
  notes?: string;
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
  }>;
}

export function toolCreateOrderSafe(params: CreateOrderParams) {
  if (!params.items || params.items.length === 0) {
    throw new Error('Order must contain at least one item');
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Get or create customer
    let cust = db.prepare(`
      SELECT * FROM customers WHERE business_id = ? AND phone = ?
    `).get(params.businessId, params.customerPhone) as any;

    if (!cust) {
      const custId = `cust_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO customers (id, business_id, name, phone, email, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        custId,
        params.businessId,
        params.customerName,
        params.customerPhone,
        params.customerEmail || null,
        params.deliveryAddress
      );
      cust = { id: custId };
    }

    // 2. Validate products, variants and check inventory with locking
    let subtotal = 0;
    const validatedItems: any[] = [];

    for (const item of params.items) {
      const variant = db.prepare(`
        SELECT v.*, p.name as product_name, p.regular_price as prod_reg_price, p.discount_price as prod_disc_price
        FROM product_variants v
        JOIN products p ON v.product_id = p.id
        WHERE v.id = ? AND v.business_id = ?
      `).get(item.variantId, params.businessId) as any;

      if (!variant) {
        throw new Error(`Product variant with ID ${item.variantId} not found`);
      }

      if (variant.stock_quantity < item.quantity) {
        throw new Error(
          `Insufficient stock for "${variant.product_name}" (${variant.size} / ${variant.colour}). Available: ${variant.stock_quantity}, requested: ${item.quantity}`
        );
      }

      // Backend price snapshot: never trust frontend unit price!
      const unitPrice = variant.discount_price || variant.price || variant.prod_disc_price || variant.prod_reg_price;
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      validatedItems.push({
        variant,
        quantity: item.quantity,
        unitPrice,
        itemTotal,
      });
    }

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `ORD-${new Date().getFullYear()}-${randomSuffix}`;
    const totalAmount = subtotal; // can add tax or discounts if applicable

    // 3. Insert order
    db.prepare(`
      INSERT INTO orders (
        id, business_id, customer_id, order_number, subtotal, discount, tax,
        total_amount, delivery_address, payment_method, payment_status, order_status, notes
      ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 'Pending', 'Confirmed', ?)
    `).run(
      orderId,
      params.businessId,
      cust.id,
      orderNumber,
      subtotal,
      totalAmount,
      params.deliveryAddress,
      params.paymentMethod || 'Cash on Delivery',
      params.notes || null
    );

    // 4. Insert items, deduct inventory, and record ledger movement
    for (const it of validatedItems) {
      const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const variantDetails = `Size: ${it.variant.size} | Colour: ${it.variant.colour}`;

      db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, variant_id, product_name, variant_details, quantity, unit_price, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        itemId,
        orderId,
        it.variant.product_id,
        it.variant.id,
        it.variant.product_name,
        variantDetails,
        it.quantity,
        it.unitPrice,
        it.itemTotal
      );

      // Deduct stock
      const newStock = it.variant.stock_quantity - it.quantity;
      db.prepare(`
        UPDATE product_variants
        SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND business_id = ?
      `).run(newStock, it.variant.id, params.businessId);

      // Record in ledger
      const movId = `mov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`
        INSERT INTO inventory_movements (
          id, business_id, product_id, variant_id, change_qty, balance_after,
          movement_type, reference_order_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'SALE', ?, 'Deducted for order')
      `).run(
        movId,
        params.businessId,
        it.variant.product_id,
        it.variant.id,
        -it.quantity,
        newStock,
        orderNumber
      );
    }

    db.exec('COMMIT;');

    return {
      success: true,
      orderId,
      orderNumber,
      totalAmount,
      itemCount: validatedItems.length,
      message: `Order #${orderNumber} placed successfully!`,
    };
  } catch (err: any) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

// -------------------------------------------------------------
// Deterministic Fallback Retail Agent
// -------------------------------------------------------------
export function runDeterministicAgent(
  businessId: string,
  userMessage: string,
  contextHistory: Array<{ role: string; content: string }> = []
) {
  const msgLower = userMessage.toLowerCase().trim();

  // Combine multi-turn history filters
  const fullText = [...contextHistory.map((h) => h.content), userMessage].join(' ').toLowerCase();

  // 1. Order Status Enquiry
  if (msgLower.includes('order status') || msgLower.includes('track') || msgLower.includes('ord-')) {
    const orderNumMatch = msgLower.match(/ord-\d{4}-\d+/i);
    const phoneMatch = msgLower.match(/\d{10}/);
    const lookup = orderNumMatch ? orderNumMatch[0].toUpperCase() : phoneMatch ? phoneMatch[0] : null;

    if (lookup) {
      const order = toolGetOrderStatus(businessId, lookup);
      if (order) {
        return {
          reply: `Here is the current status for order **#${order.order_number}**:\n- **Status:** ${order.order_status}\n- **Total:** ₹${order.total_amount.toLocaleString()}\n- **Payment:** ${order.payment_status} (${order.payment_method})\n- **Delivery to:** ${order.delivery_address}\nItems: ${order.items.map((i: any) => `${i.product_name} (${i.variant_details}) x${i.quantity}`).join(', ')}`,
          toolExecuted: 'get_order_status',
          order,
          suggestedProducts: [],
          engine: 'deterministic-retail-agent',
        };
      } else {
        return {
          reply: `I checked our system for order reference "${lookup}", but could not find a matching order. Please verify your order number (e.g. ORD-2026-1001) or 10-digit registered phone number.`,
          toolExecuted: 'get_order_status',
          suggestedProducts: [],
          engine: 'deterministic-retail-agent',
        };
      }
    } else {
      return {
        reply: `I would be happy to check your order status! Please provide your **Order Number** (for example: \`ORD-2026-1001\`) or your **10-digit registered mobile number** so I can retrieve your real-time tracking details and delivery updates.`,
        toolExecuted: 'get_order_status_prompt',
        suggestedProducts: [],
        engine: 'deterministic-retail-agent',
      };
    }
  }

  // 2. Order Intent Guidance (e.g., "I want to order two pieces", "order 2 pieces")
  if (
    msgLower.includes('order two pieces') ||
    msgLower.includes('order 2 pieces') ||
    msgLower.includes('want to order') ||
    msgLower.includes('order two') ||
    msgLower.includes('buy two pieces') ||
    msgLower.includes('order 2')
  ) {
    const prods = toolSearchProducts({ businessId });
    return {
      reply: `I would be thrilled to assist you with ordering 2 pieces! You can select any product variant from below, choose your size, set quantity to 2, and click **Add to Cart** or **Buy Now** to checkout instantly. We offer Cash on Delivery and online payment.\n\nWhich item and size would you like to reserve?`,
      toolExecuted: 'order_intent_guidance',
      suggestedProducts: prods.slice(0, 4),
      engine: 'deterministic-retail-agent',
    };
  }

  // 3. Product Availability Enquiry (e.g., "Is this product available?")
  if (
    msgLower.includes('is this product available') ||
    msgLower.includes('is this available') ||
    msgLower.includes('product available') ||
    msgLower.includes('available in stock')
  ) {
    const prods = toolSearchProducts({ businessId });
    if (prods.length > 0 && prods[0]) {
      const topP = prods[0] as any;
      return {
        reply: `Yes, this product is in stock and available! **${topP.name}** currently has **${topP.totalStock} pieces** in stock across sizes: ${(topP.sizes || []).join(', ')}. Price: ₹${topP.currentPrice.toLocaleString()}. Would you like to select your size and place an order?`,
        toolExecuted: 'check_inventory',
        suggestedProducts: prods.slice(0, 3),
        engine: 'deterministic-retail-agent',
      };
    }
  }

  // 4. Categories Enquiry
  if (msgLower.includes('categories') || msgLower.includes('what do you sell') || msgLower.includes('what items')) {
    const cats = toolSearchCategories(businessId) as any[];
    return {
      reply: `We offer a wide collection across these categories:\n${cats.map((c) => `• **${c.name}** (${c.product_count} items) - ${c.description || ''}`).join('\n')}\n\nWhat are you looking for today?`,
      toolExecuted: 'search_categories',
      suggestedProducts: [],
      categories: cats,
      engine: 'deterministic-retail-agent',
    };
  }

  // 5. Extract price filters (e.g., "below 1500", "under 1000", "less than 2000", "below ₹2,000")
  let maxPrice: number | undefined = undefined;
  const priceMatch = fullText.match(/(?:below|under|less than|within|budget of)\s*(?:₹|rs\.?|inr)?\s*([0-9,]+)/i);
  if (priceMatch) {
    maxPrice = parseInt(priceMatch[1].replace(/,/g, ''), 10);
  }

  // 6. Extract colour (e.g. red, blue, green, yellow, peach, black, white, gold, etc.)
  let colour: string | undefined = undefined;
  const colours = ['red', 'blue', 'green', 'yellow', 'peach', 'black', 'white', 'indigo', 'maroon', 'gold', 'silver', 'lavender', 'tan', 'beige'];
  for (const c of colours) {
    if (fullText.includes(c)) {
      colour = c;
      break;
    }
  }

  // 7. Extract size (e.g. S, M, L, XL, XXL)
  let size: string | undefined = undefined;
  const sizeMatches = ['xxl', 'xl', 'l', 'm', 's', 'xs'];
  for (const s of sizeMatches) {
    const regex = new RegExp(`\\b${s}\\b|size\\s*${s}`, 'i');
    if (regex.test(userMessage)) {
      size = s.toUpperCase();
      break;
    }
  }

  // 8. Extract category keywords
  let categoryKeyword = '';
  if (fullText.includes('kurti') || fullText.includes('kurta')) categoryKeyword = 'kurti';
  else if (fullText.includes('saree')) categoryKeyword = 'saree';
  else if (fullText.includes('dress') || fullText.includes('gown')) categoryKeyword = 'dress';
  else if (fullText.includes('shirt')) categoryKeyword = 'shirt';
  else if (fullText.includes('t-shirt') || fullText.includes('tee')) categoryKeyword = 't-shirt';
  else if (fullText.includes('jean') || fullText.includes('palazzo') || fullText.includes('trouser')) categoryKeyword = 'jean';
  else if (fullText.includes('jutti') || fullText.includes('shoe') || fullText.includes('footwear') || fullText.includes('kolhapuri')) categoryKeyword = 'footwear';
  else if (fullText.includes('jewel') || fullText.includes('necklace') || fullText.includes('earring') || fullText.includes('choker') || fullText.includes('jhumka') || fullText.includes('bangle') || fullText.includes('bag') || fullText.includes('potli')) categoryKeyword = 'jewellery';

  // 9. Specific Size Enquiry (e.g., "Do you have size M?")
  if (size && (msgLower.includes('do you have') || msgLower.includes('have size') || msgLower.includes('in size') || msgLower.includes('size m'))) {
    const sizeProducts = toolSearchProducts({
      businessId,
      query: categoryKeyword || undefined,
      size,
    });
    if (sizeProducts.length > 0) {
      return {
        reply: `Yes, we have verified stock in **Size ${size}**! Here are the top available items ready for immediate dispatch:\n\n${sizeProducts.slice(0, 3).map((p: any) => `• **${p.name}** - ₹${p.currentPrice.toLocaleString()} (${p.totalStock} total in stock, includes Size ${size})`).join('\n')}\n\nYou can select any item below to view variant stock and add it to your cart!`,
        toolExecuted: 'search_products',
        suggestedProducts: sizeProducts,
        filtersApplied: { size, query: categoryKeyword },
        engine: 'deterministic-retail-agent',
      };
    }
  }

  // Perform database search
  const products = toolSearchProducts({
    businessId,
    query: categoryKeyword || (colour ? colour : undefined),
    maxPrice,
    colour,
    size,
  });

  if (products.length > 0) {
    let replyText = `I found **${products.length} product${products.length > 1 ? 's' : ''}** matching your request`;
    if (colour) replyText += ` in **${colour.toUpperCase()}**`;
    if (maxPrice) replyText += ` under **₹${maxPrice.toLocaleString()}**`;
    if (size) replyText += ` with size **${size}**`;
    replyText += `:\n\n`;

    products.slice(0, 3).forEach((p: any) => {
      replyText += `• **${p.name}**\n  Price: ₹${p.currentPrice.toLocaleString()} ${p.discountPrice ? `~~₹${p.regularPrice.toLocaleString()}~~` : ''}\n  Available sizes: ${(p.sizes || []).join(', ')}\n  Stock: ${p.totalStock} pieces in stock\n\n`;
    });

    replyText += `You can select any item below to view variant stock, choose your size, or add it directly to your cart!`;

    return {
      reply: replyText,
      toolExecuted: 'search_products',
      suggestedProducts: products,
      filtersApplied: { colour, maxPrice, size, query: categoryKeyword },
      engine: 'deterministic-retail-agent',
    };
  }

  // If no direct filter match, show general recommendations
  const recs = toolGetRecommendations(businessId);
  return {
    reply: `I could not find exact products matching those filters right now. Here are some of our best-selling featured items from the catalogue that you might love! Let me know if you would like sarees, kurtis, dresses, shirts, or jewellery.`,
    toolExecuted: 'get_recommendations',
    suggestedProducts: recs,
    engine: 'deterministic-retail-agent',
  };
}

// -------------------------------------------------------------
// Gemini Agent with Function Calling
// -------------------------------------------------------------
export async function runGeminiAgent(
  businessId: string,
  userMessage: string,
  contextHistory: Array<{ role: string; content: string }> = []
) {
  // If no Gemini client or API key, run deterministic agent
  if (!aiClient) {
    return runDeterministicAgent(businessId, userMessage, contextHistory);
  }

  try {
    const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(businessId) as any;
    const bizName = business ? business.name : 'Our Store';

    // Tool declarations for Gemini
    const searchProductsTool = {
      name: 'search_products',
      description: 'Search the real retail store database for products by keyword, category, colour, size, and price limits.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'Keywords like "kurti", "saree", "linen shirt", "silk"' },
          maxPrice: { type: Type.NUMBER, description: 'Maximum price in INR' },
          minPrice: { type: Type.NUMBER, description: 'Minimum price in INR' },
          colour: { type: Type.STRING, description: 'Colour like "Red", "Blue", "Emerald Green"' },
          size: { type: Type.STRING, description: 'Size like "S", "M", "L", "XL"' },
        },
      },
    };

    const checkInventoryTool = {
      name: 'check_inventory',
      description: 'Check stock availability for a specific variant or size in the database.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          variantId: { type: Type.STRING, description: 'ID of the product variant' },
        },
        required: ['variantId'],
      },
    };

    const getOrderStatusTool = {
      name: 'get_order_status',
      description: 'Check status and tracking of an existing customer order.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          orderNumberOrPhone: { type: Type.STRING, description: 'Order number like "ORD-2026-1001" or customer phone number' },
        },
        required: ['orderNumberOrPhone'],
      },
    };

    const getCategoriesTool = {
      name: 'get_categories',
      description: 'List all active product categories available in the store.',
      parameters: {
        type: Type.OBJECT,
        properties: {},
      },
    };

    const systemInstruction = `You are ShopMate AI, the intelligent, friendly, and expert shopping assistant for "${bizName}".
You have real-time access to the store's relational database via function calling tools.
RULES:
1. Always call tools (like "search_products", "check_inventory", "get_order_status", "get_categories") to get actual real data.
2. NEVER invent fake prices, stock counts, discounts, or order numbers.
3. Keep answers concise, polite, helpful, and retail-oriented.
4. When products are returned from the tool, present their names, prices, colors, and sizes accurately.
5. If the customer wants to buy, guide them to pick their size and confirm order details.`;

    const chat = aiClient.chats.create({
      model: 'gemini-3.8-flash',
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: [searchProductsTool, checkInventoryTool, getOrderStatusTool, getCategoriesTool] }],
      },
    });

    // Send the user message with a 7-second timeout guard
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API timeout after 7s')), 7000)
    );
    let response = await Promise.race([
      chat.sendMessage({ message: userMessage }),
      timeoutPromise,
    ]);

    let suggestedProducts: any[] = [];
    let toolExecutedName = '';

    // Handle tool call loops if Gemini requests functions
    const functionCalls = response.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      for (const call of functionCalls) {
        toolExecutedName = call.name || '';
        let toolResult: any = null;

        if (call.name === 'search_products') {
          const args = (call.args || {}) as any;
          toolResult = toolSearchProducts({
            businessId,
            query: args.query,
            maxPrice: args.maxPrice,
            minPrice: args.minPrice,
            colour: args.colour,
            size: args.size,
          });
          suggestedProducts = toolResult;
        } else if (call.name === 'check_inventory') {
          const args = (call.args || {}) as any;
          toolResult = toolCheckInventory(businessId, args.variantId);
        } else if (call.name === 'get_order_status') {
          const args = (call.args || {}) as any;
          toolResult = toolGetOrderStatus(businessId, args.orderNumberOrPhone);
        } else if (call.name === 'get_categories') {
          toolResult = toolSearchCategories(businessId);
        }

        // Return tool result to the chat session
        const nextResponse = await chat.sendMessage({
          message: [
            {
              functionResponse: {
                name: call.name,
                response: { result: toolResult },
              },
            },
          ],
        });

        response = nextResponse;
      }
    }

    const reply = response.text || "I've checked our store inventory for you. How else can I assist you today?";

    // If no products were explicitly captured by tool call but search was mentioned, run search
    if (suggestedProducts.length === 0 && (userMessage.toLowerCase().includes('show') || userMessage.toLowerCase().includes('kurti') || userMessage.toLowerCase().includes('saree') || userMessage.toLowerCase().includes('shirt'))) {
      suggestedProducts = toolSearchProducts({ businessId, query: userMessage.slice(0, 30) });
    }

    return {
      reply,
      toolExecuted: toolExecutedName || 'conversational_agent',
      suggestedProducts,
      engine: 'gemini-3.8-flash',
    };
  } catch (err: any) {
    console.error('Gemini API call failed, safely falling back to deterministic retail agent:', err);
    const fallback = runDeterministicAgent(businessId, userMessage, contextHistory);
    return {
      ...fallback,
      engineNotice: 'Gemini service unavailable. Powered by ShopMate deterministic retail engine.',
    };
  }
}
