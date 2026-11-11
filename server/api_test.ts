/**
 * End-to-end API test suite (no browser, no external services).
 *
 *   npm run test:api
 *
 * Runs the real Express app against a THROW-AWAY SQLite file (never your real data), mocks Google's
 * token-verification endpoint, and checks auth, tenant isolation, super admin, Google signup, orders,
 * inventory and error handling. Exits non-zero if any check fails.
 *
 * It refuses to run when DATABASE_URL is set, so it can never write test data into Supabase/Postgres.
 * (To test against a disposable Postgres on purpose: ALLOW_TEST_ON_DATABASE_URL=1 npm run test:api)
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

if (process.env.DATABASE_URL && process.env.ALLOW_TEST_ON_DATABASE_URL !== '1') {
  console.error('Refusing to run: DATABASE_URL is set. Unset it, or set ALLOW_TEST_ON_DATABASE_URL=1 for a disposable database.');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  const file = path.join(os.tmpdir(), `shopmate-test-${process.pid}-${Date.now()}.db`);
  process.env.SQLITE_PATH = file;
  process.on('exit', () => { try { fs.rmSync(file, { force: true }); } catch { /* ignore */ } });
}
process.env.SESSION_SECRET ||= 'test-secret-test-secret-test-secret-123';
process.env.SUPERADMIN_EMAIL ||= 'boss@shopmate.dev';
process.env.SUPERADMIN_PASSWORD ||= 'Sup3rSecret!pw';
delete process.env.VERCEL;

import http from 'node:http';
const { createApp } = await import('./app.js');
const { db, driver } = await import('./db.js');

const app: any = createApp();
const server = http.createServer(app.callback ? app.callback() : app);
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;

let pass = 0, fail = 0;
const ok = (c: any, name: string, extra?: any) => { if (c) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
async function call(method: string, path: string, body?: any, token?: string, headers: any = {}) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let j: any = null; try { j = await r.json(); } catch {}
  return { s: r.status, j };
}
console.log('driver:', driver);

console.log('# health / config');
let r = await call('GET', '/health'); ok(r.s === 200 && r.j.status === 'healthy', 'health', r);
r = await call('GET', '/auth/config'); ok(r.s === 200 && 'googleClientId' in r.j, 'auth config', r);

console.log('# registration');
const reg = { email: 'Owner1@Example.com', name: 'Ravi Kumar', phone: '+91 98765 43210', businessName: 'Ravi Textiles', businessCategory: 'Fashion', password: 'secret123' };
r = await call('POST', '/auth/register', reg); ok(r.s === 201 && r.j.token && r.j.user.role === 'BUSINESS_OWNER' && r.j.business?.name === 'Ravi Textiles', 'register ok', r);
const owner = r.j; 
ok(owner.business.assistant_name === 'ShopMate AI' && Array.isArray(owner.business.suggested_questions) && owner.business.suggested_questions.length > 0, 'new business has default assistant name + questions', owner.business);
r = await call('POST', '/auth/register', reg); ok(r.s === 409, 'duplicate email -> 409', r);
r = await call('POST', '/auth/register', { ...reg, email: 'other@example.com' }); ok(r.s === 409, 'duplicate phone -> 409', r);
r = await call('POST', '/auth/register', { ...reg, email: 'x@example.com', phone: '+91 90000 11111', password: 'short' }); ok(r.s === 400, 'short password -> 400', r);
r = await call('POST', '/auth/register', { ...reg, email: 'bad', phone: '+91 90000 22222' }); ok(r.s === 400, 'bad email -> 400', r);
r = await call('POST', '/auth/register', { email: 'a@b.co' }); ok(r.s === 400, 'missing fields -> 400', r);

console.log('# login');
r = await call('POST', '/auth/login', { email: 'owner1@example.com', password: 'secret123' }); ok(r.s === 200 && r.j.token, 'login (case-insensitive email)', r);
const ownerToken = r.j.token;
r = await call('POST', '/auth/login', { email: 'owner1@example.com', password: 'wrongpass' }); ok(r.s === 401, 'wrong password -> 401', r);
r = await call('GET', '/auth/me', undefined, ownerToken); ok(r.s === 200 && r.j.user?.email === 'owner1@example.com' || r.j.email === 'owner1@example.com', 'auth/me', r);
r = await call('GET', '/auth/me'); ok(r.s === 401, 'auth/me without token -> 401', r);
r = await call('GET', '/auth/me', undefined, ownerToken + 'x'); ok(r.s === 401, 'tampered token -> 401', r);

console.log('# demo personas (no credentials)');
const demo: any = {};
for (const p of ['OWNER', 'EMPLOYEE', 'CUSTOMER']) {
  r = await call('POST', '/auth/demo-login', { persona: p }); ok(r.s === 200 && r.j.token && r.j.user.is_demo, `demo ${p}`, r); demo[p] = r.j;
}
r = await call('POST', '/auth/demo-login', { persona: 'OWNER' }); ok(r.s === 200, 'demo repeat is idempotent', r);
r = await call('GET', '/products', undefined, demo.OWNER.token); ok(r.s === 200 && r.j.products?.length > 0, 'demo owner sees demo products', r.j);
r = await call('POST', '/auth/demo-login', { persona: 'SUPER_ADMIN' }); ok(r.s === 400 && !r.j.token, 'the demo platform-admin persona no longer exists', r);
r = await call('POST', '/auth/login', { email: 'superadmin@shopmate.com', password: 'super123' }); ok(r.s === 401 || r.s === 400, 'the old public demo admin credentials do not work', r.s);
r = await call('GET', '/businesses', undefined, demo.OWNER.token); ok(r.s === 403, 'store users cannot list all tenants', r.s);

console.log('# tenant isolation / settings');
r = await call('GET', '/products', undefined, ownerToken); ok(r.s === 200 && r.j.products.length === 0, 'new tenant starts empty (no demo leak)', r.j);
r = await call('GET', '/businesses/me', undefined, ownerToken); ok(r.s === 200 && r.j.assistant_name === 'ShopMate AI', 'businesses/me', r);
r = await call('PUT', '/businesses/me', { assistant_name: 'Ravi Bot', ai_greeting: 'Namaste!', suggested_questions: ['Show sarees', 'Track my order', 'Show sarees'] }, ownerToken);
ok(r.s === 200 && r.j.assistant_name === 'Ravi Bot' && r.j.suggested_questions.length === 2, 'owner edits assistant name + questions', r);
r = await call('GET', '/businesses/me', undefined, ownerToken); ok(r.j.assistant_name === 'Ravi Bot' && r.j.ai_greeting === 'Namaste!', 'settings persisted', r.j);
r = await call('PUT', '/businesses/me', { assistant_name: '' }, ownerToken); ok(r.s === 400, 'empty assistant name rejected', r);
r = await call('PUT', '/businesses/me', { assistant_name: 'Hack' }, demo.CUSTOMER.token); ok(r.s === 403, 'customer cannot edit settings', r);
r = await call('PUT', '/businesses/me', { assistant_name: 'Hack' }); ok(r.s === 401, 'anonymous cannot edit settings', r);
r = await call('GET', '/products', undefined, ownerToken, { 'x-business-id': 'biz_demo_store_001' }); ok(r.j.products.length === 0, 'x-business-id header cannot override a tenant', r.j);

console.log('# owner features: product, employee, order, cancel');
r = await call('GET', '/categories', undefined, ownerToken); ok(r.s === 200, 'categories', r);
r = await call('POST', '/categories', { name: 'Sarees', description: 'x' }, ownerToken); ok(r.s === 201 || r.s === 200, 'create category', r);
const catId = r.j.id;
r = await call('POST', '/products', { name: 'Silk Saree', category_id: catId, sku: 'SS-1', regular_price: 2000, discount_price: 1800, colour: 'Blue', sizes: ['Free'], variants: [{ size: 'Free', colour: 'Blue', stock_quantity: 10, sku: 'SS-1-F' }] }, ownerToken);
ok(r.s === 201 || r.s === 200, 'create product', r);
r = await call('GET', '/products', undefined, ownerToken); ok(r.j.products.length === 1 && r.j.products[0].variants?.length >= 1, 'product list with variants (batched)', r.j);
const prod = r.j.products[0]; const variant = prod.variants[0];
r = await call('POST', '/employees', { name: 'Asha', email: 'Asha@Example.com', password: 'employee1', phone: '+91 91111 00000' }, ownerToken); ok(r.s === 201 || r.s === 200, 'owner adds employee', r);
r = await call('POST', '/employees', { name: 'X', email: 'x@example.com', password: 'employee1' }, demo.EMPLOYEE.token); ok(r.s === 403, 'employee cannot add employee', r);
r = await call('POST', '/orders', { customerName: 'Buyer One', customerPhone: '+91 97000 00001', deliveryAddress: '1 Main St', items: [{ productId: prod.id, variantId: variant.id, quantity: 2 }] }, ownerToken);
ok(r.s === 201 && r.j.success, 'create order', r);
const orderId = r.j.orderId;
r = await call('GET', '/inventory', undefined, ownerToken);
r = await call('GET', '/orders', undefined, ownerToken); ok(r.j.length === 1 && r.j[0].items?.length === 1, 'orders list batched', r.j);
r = await call('POST', `/orders/${orderId}/cancel`, {}, ownerToken); ok(r.s === 200, 'cancel order', r);
r = await call('POST', `/orders/${orderId}/cancel`, {}, ownerToken); ok(r.s >= 400, 'double cancel rejected', r);
r = await call('GET', '/products', undefined, ownerToken); ok(r.j.products[0].variants[0].stock_quantity === 10, 'stock restored after cancel', r.j.products[0].variants);
r = await call('POST', '/orders', { customerName: 'B', customerPhone: '+91 97000 00001', deliveryAddress: 'x', items: [{ productId: prod.id, variantId: variant.id, quantity: 999 }] }, ownerToken); ok(r.s >= 400, 'oversell rejected', r);

console.log('# end-to-end journey: category with image, employee, customer');
const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(90000);
r = await call('POST', '/categories', { name: 'Designer Kurtis', description: '', image_url: IMG }, ownerToken); ok(r.s === 201, 'create category WITH banner image (the reported bug)', r);
const kurtiCat = r.j.id;
r = await call('GET', '/categories', undefined, ownerToken); ok(r.j.some((c: any) => c.id === kurtiCat && c.image_url === IMG), 'category image stored and returned', r.s);
r = await call('POST', '/categories', { name: 'Designer Kurtis' }, ownerToken); ok(r.s === 409 && !/constraint|relation|column/i.test(r.j.error), 'duplicate category -> friendly 409, no database text', r);
r = await call('POST', '/categories', { name: '' }, ownerToken); ok(r.s === 400, 'category name required', r);
r = await call('POST', '/products', { name: 'Anarkali Kurti', category_id: kurtiCat, sku: 'AK-1', regular_price: 1500, colour: 'Pink', sizes: ['M', 'L'], image_url: IMG, variants: [{ size: 'M', colour: 'Pink', stock_quantity: 5, sku: 'AK-1-M' }, { size: 'L', colour: 'Pink', stock_quantity: 3, sku: 'AK-1-L' }] }, ownerToken);
ok(r.s === 201 || r.s === 200, 'create product in new category', r);
r = await call('POST', '/products', { name: 'Dup SKU', category_id: kurtiCat, sku: 'AK-1', regular_price: 10, variants: [{ size: 'M', stock_quantity: 1, sku: 'AK-1-M' }] }, ownerToken); ok(r.s < 500, 'duplicate SKU never returns a 500 / raw SQL error', r);
r = await call('POST', '/auth/login', { email: 'asha@example.com', password: 'employee1' }); ok(r.s === 200 && r.j.user.role === 'EMPLOYEE', 'new employee can log in', r);
const empTok = r.j.token;
r = await call('GET', '/products', undefined, empTok); ok(r.s === 200 && r.j.products.length >= 2, 'employee sees the store catalogue', r.s);
r = await call('POST', '/categories', { name: 'Employee Cat' }, empTok); ok(r.s === 201 || r.s === 403, 'employee category request handled', r.s);
r = await call('PUT', '/businesses/me', { assistant_name: 'Nope' }, empTok); ok(r.s === 403, 'employee cannot change store settings', r);
r = await call('GET', '/employees', undefined, empTok); ok(r.s === 200, 'employee can list team', r.s);
r = await call('POST', '/customers', { name: 'Meena Customer', phone: '+91 96000 00009', email: 'meena@example.com' }, ownerToken); ok(r.s === 201 || r.s === 200, 'owner adds a customer', r);
r = await call('GET', '/customers', undefined, ownerToken); ok(Array.isArray(r.j) ? r.j.some((c: any) => /Meena/.test(c.name)) : JSON.stringify(r.j).includes('Meena'), 'customer listed', r.s);
const kp = (await call('GET', '/products', undefined, ownerToken)).j.products.find((x: any) => x.name === 'Anarkali Kurti');
r = await call('POST', '/orders', { customerName: 'Meena Customer', customerPhone: '+91 96000 00009', deliveryAddress: '5 Lake Rd', items: [{ productId: kp.id, variantId: kp.variants[0].id, quantity: 1 }] }, empTok); ok(r.s === 201 && r.j.success, 'employee creates an order for the customer', r);
const empOrder = r.j.orderId;
r = await call('PUT', `/orders/${empOrder}/status`, { status: 'Shipped' }, empTok); ok(r.s === 200, 'employee updates order status', r);
r = await call('GET', '/analytics/overview', undefined, ownerToken); ok(r.s === 200, 'analytics overview', r);
r = await call('GET', '/inventory', undefined, ownerToken); ok(r.s === 200, 'inventory list', r.s);
r = await call('DELETE', `/categories/${kurtiCat}`, undefined, ownerToken); ok(r.s === 400, 'cannot delete a category that still has products', r);

console.log('# CRUD audit: every create / read / update / delete the UI uses');
r = await call('GET', '/health/schema'); ok(r.s === 200 && r.j.ok === true && r.j.missing.length === 0, 'schema self-check reports no missing columns', r);
const crudCat = (await call('POST', '/categories', { name: 'CRUD Cat', description: 'd', image_url: 'data:image/png;base64,AAAA' }, ownerToken)).j.id;
const full = { name: 'Pure Cotton Chikankari Kurti', sku: 'KK-NEW-631', category_id: crudCat, brand: 'KalaKriti Heritage', regular_price: 1499, discount_price: 1199, colour: 'Ivory White', sizes: ['S', 'M', 'L', 'XL'], images: ['data:image/jpeg;base64,' + 'B'.repeat(60000)], min_stock_threshold: 5, initial_stock: 15, description: 'Elegant kurti' };
r = await call('POST', '/products', full, ownerToken); ok(r.s === 201 || r.s === 200, 'create product with brand, images, sizes (reported bug)', r);
let all = (await call('GET', '/products', undefined, ownerToken)).j.products;
let cp = all.find((x: any) => x.sku === 'KK-NEW-631');
ok(cp && cp.brand === 'KalaKriti Heritage' && cp.variants.length >= 1, 'product read back with brand + seeded variants', cp);
r = await call('PUT', `/products/${cp.id}`, { ...full, name: 'Chikankari Kurti v2', regular_price: 1599, brand: 'KalaKriti' }, ownerToken); ok(r.s === 200, 'update product', r);
all = (await call('GET', '/products', undefined, ownerToken)).j.products; cp = all.find((x: any) => x.sku === 'KK-NEW-631');
ok(cp.name === 'Chikankari Kurti v2' && Number(cp.regular_price) === 1599 && cp.brand === 'KalaKriti', 'product update persisted', cp);
r = await call('PUT', `/inventory/${cp.variants[0].id}`, { adjustment_qty: 5, movement_type: 'PURCHASE', notes: 'new batch' }, ownerToken); ok(r.s === 200, 'inventory restock', r);
r = await call('PUT', `/inventory/${cp.variants[0].id}`, { adjustment_qty: 1, movement_type: 'BOGUS' }, ownerToken); ok(r.s === 400, 'invalid movement type -> 400, not 500', r);
r = await call('PUT', `/inventory/${cp.variants[0].id}`, { adjustment_qty: -9999 }, ownerToken); ok(r.s === 400, 'negative stock rejected', r);
r = await call('GET', '/inventory/movements', undefined, ownerToken); ok(r.s === 200, 'inventory movements', r.s);
r = await call('POST', '/products/bulk-csv', { items: [{ name: 'CSV Kurti', sku: 'CSV-1', regular_price: 999, brand: 'B', colour: 'Red', sizes: 'M,L', description: 'x' }, { name: 'CSV Kurti', sku: 'CSV-1', regular_price: 999 }] }, ownerToken); ok(r.s === 200 || r.s === 201, 'bulk CSV upload (duplicate SKU skipped)', r);
r = await call('GET', '/products/export-csv', undefined, ownerToken); ok(r.s === 200 || r.s === 404, 'CSV export responds', r.s);
r = await call('DELETE', `/products/${cp.id}`, undefined, ownerToken); ok(r.s === 200, 'delete product', r);
all = (await call('GET', '/products', undefined, ownerToken)).j.products; ok(!all.some((x: any) => x.sku === 'KK-NEW-631'), 'deleted product no longer listed', all.length);
r = await call('DELETE', `/categories/${crudCat}`, undefined, ownerToken); ok(r.s === 200, 'delete empty category', r);
r = await call('GET', '/categories', undefined, ownerToken); ok(!r.j.some((c: any) => c.id === crudCat), 'deleted category gone', r.s);
r = await call('PUT', '/businesses/me', { name: 'Ravi Textiles Pvt', ai_greeting: 'Hello' }, ownerToken); ok(r.s === 200, 'update store profile', r);
r = await call('PUT', '/businesses/me', { name: 'Ravi Textiles' }, ownerToken); ok(r.s === 200, 'restore store name', r);
for (const persona of ['OWNER', 'EMPLOYEE', 'CUSTOMER']) {
  r = await call('POST', '/auth/demo-login', { persona }); ok(r.s === 200 && r.j.token, `demo login ${persona}`, r);
}

console.log('# AI chat uses the tenant assistant');
r = await call('POST', '/ai/chat', { message: 'Show me blue sarees' }, ownerToken); ok(r.s === 200 && r.j.reply, 'tenant chat reply', r);
r = await call('POST', '/ai/chat', { message: '' }, ownerToken); ok(r.s === 400, 'empty chat message -> 400', r);
r = await call('POST', '/ai/chat', { message: 'x'.repeat(5000) }, ownerToken); ok(r.s === 200, 'oversized message is clamped, not crash', r.s);

console.log('# public app assistant');
r = await call('POST', '/ai/assistant', { message: 'How do I register my business?' }); ok(r.s === 200 && /register/i.test(r.j.reply) && !/kalakriti/i.test(r.j.reply), 'assistant answers registration question', r);
r = await call('POST', '/ai/assistant', { message: 'What is the capital of France?' }); ok(r.s === 200 && /only help|ShopMate/i.test(r.j.reply), 'assistant declines off-topic', r);
r = await call('POST', '/ai/assistant', { message: 'hello' }); ok(r.s === 200 && /ShopMate/.test(r.j.reply), 'assistant greets', r);
r = await call('POST', '/ai/assistant', {}); ok(r.s === 400, 'assistant requires message', r);
r = await call('POST', '/ai/assistant', { message: 'what is the price?' }); ok(/pricing|price/i.test(r.j.reply) && /don.t have/i.test(r.j.reply), 'assistant does not invent pricing', r.j);

console.log('# google auth');
r = await call('POST', '/auth/google', { credential: 'abc' }); ok(r.s >= 400 && r.s < 600 && r.j.error, 'google without config / bad token -> error JSON', r);

// --- Google signup-first flow (Google's tokeninfo endpoint is mocked) ---
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
const realFetch = globalThis.fetch;
const gtoken = (sub: string, email: string, name: string) => `${sub}|${email}|${name}`;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) {
    const t = decodeURIComponent(u.split('id_token=')[1]);
    const [sub, email, name] = t.split('|');
    if (!email) return new Response('{}', { status: 400 });
    return new Response(JSON.stringify({ iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, sub, email, name, email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600) }), { status: 200 });
  }
  return realFetch(url, init);
}) as any;
const G = gtoken('g-sub-1', 'newgoogle@example.com', 'Gita Google');
r = await call('POST', '/auth/google', { credential: G, mode: 'login' }); ok(r.s === 404 && r.j.code === 'NO_ACCOUNT', 'google login, no account -> NO_ACCOUNT', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'register' }); ok(r.s === 200 && r.j.needsProfile === true && r.j.profile.email === 'newgoogle@example.com' && !r.j.token, 'google register without details -> needsProfile, nothing created', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'register' }); ok(r.s === 200 && r.j.needsProfile, 'needsProfile is repeatable (no account was created)', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'register', businessName: 'Gita Stores', phone: '12' }); ok(r.s === 400, 'details step rejects short phone', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'register', businessName: 'Gita Stores', businessCategory: 'Other Retail', phone: '+91 90000 11122' }); ok(r.s === 201 && r.j.token && r.j.user.role === 'BUSINESS_OWNER' && r.j.business?.name === 'Gita Stores', 'details step creates owner + store', r);
const gTok = r.j.token;
r = await call('GET', '/auth/me', undefined, gTok); ok(r.s === 200 && r.j.email === 'newgoogle@example.com' || r.j.user?.email === 'newgoogle@example.com', 'new google owner session works', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'register' }); ok(r.s === 200 && r.j.token && !r.j.needsProfile, 'same google account again -> signs in (no duplicate)', r);
r = await call('POST', '/auth/google', { credential: G, mode: 'login' }); ok(r.s === 200 && r.j.token, 'google login for existing account', r);
r = await call('POST', '/auth/google', { credential: 'bad-credential-value' }); ok(r.s === 401 && r.j.code === 'GOOGLE_INVALID', 'invalid google credential -> 401', r);
globalThis.fetch = realFetch;

console.log('# super admin portal');
const SA = { email: process.env.SUPERADMIN_EMAIL!, password: process.env.SUPERADMIN_PASSWORD! };
r = await call('POST', '/superadmin/login', { email: SA.email, password: 'nope-nope' }); ok(r.s === 401, 'superadmin bad password', r);
r = await call('POST', '/superadmin/login', { email: 'owner1@example.com', password: 'secret123' }); ok(r.s === 401, 'owner cannot use superadmin login', r);
r = await call('POST', '/superadmin/login', { email: 'superadmin@shopmate.com', password: 'super123' }); ok(r.s === 401, 'demo super admin cannot use superadmin login', r);
r = await call('POST', '/superadmin/login', SA); ok(r.s === 200 && r.j.token, 'superadmin login', r);
const saToken = r.j.token;
for (const p of ['/overview', '/logins', '/users', '/buyers', '/businesses', '/orders']) {
  r = await call('GET', '/superadmin' + p, undefined, ownerToken); ok(r.s === 403, `owner blocked from ${p}`, r.s);
  r = await call('GET', '/superadmin' + p, undefined, demo.CUSTOMER.token); ok(r.s === 403, `demo customer blocked from ${p}`, r.s);
  r = await call('GET', '/superadmin' + p); ok(r.s === 401, `anon blocked from ${p}`, r.s);
}
r = await call('GET', '/superadmin/overview', undefined, saToken); const ov = r.j;
ok(r.s === 200 && ov.totals.businesses === 2 && ov.totals.owners === 2 && Array.isArray(ov.warnings) && ov.warnings.length === 0, 'overview excludes demo data by default, no warnings', ov?.totals);
ok(ov.activity.demoVisits >= 4, 'demo visits counted', ov.activity);
ok(ov.activity.logins7d >= 2 && ov.activity.failed24h >= 1, 'login counters', ov.activity);
ok(ov.totals.buyers === 2 && ov.totals.orders === 2, 'buyers + orders counted', ov.totals);
r = await call('GET', '/superadmin/overview?include_demo=1', undefined, saToken); ok(r.j.totals.businesses === 3, 'include_demo adds demo tenant', r.j.totals);
r = await call('GET', '/superadmin/logins?limit=5', undefined, saToken); ok(r.s === 200 && r.j.rows.length > 0 && r.j.total >= r.j.rows.length && r.j.rows.every((x: any) => x.method !== 'demo'), 'logins list excludes demo', r.j.rows?.map((x: any) => x.method));
r = await call('GET', '/superadmin/logins?status=failed', undefined, saToken); ok(r.j.rows.length >= 1 && r.j.rows.every((x: any) => x.success === false), 'logins failed filter', r.j);
r = await call('GET', '/superadmin/logins?q=owner1', undefined, saToken); ok(r.j.rows.length >= 1, 'logins search', r.j);
r = await call('GET', '/superadmin/users', undefined, saToken); ok(r.j.rows.some((u: any) => u.email === 'owner1@example.com' && u.login_count >= 1) && !r.j.rows.some((u: any) => u.email.endsWith('@shopmate.com')), 'users list (login_count, no demo)', r.j.rows?.map((u: any) => u.email));
r = await call('GET', '/superadmin/buyers', undefined, saToken); ok(r.j.rows.length === 2 && r.j.rows.every((x: any) => x.business_name === 'Ravi Textiles') && r.j.rows.some((x: any) => x.name === 'Buyer One' && x.total_orders === 1), 'buyers list', r.j.rows);
r = await call('GET', '/superadmin/businesses', undefined, saToken); ok(r.j.rows.length === 2 && r.j.rows.some((x: any) => x.owner_email === 'owner1@example.com' && x.orders === 2), 'businesses list', r.j.rows);
r = await call('GET', '/superadmin/orders?status=Cancelled', undefined, saToken); ok(r.j.rows.length === 1, 'orders list + status filter', r.j.rows);
r = await call('GET', '/superadmin/users?q=%25%27%3B--', undefined, saToken); ok(r.s === 200, 'search input is safe', r.s);

console.log('# misc');
r = await call('GET', '/nope'); ok(r.s === 404, 'unknown api route -> 404 json', r);
const bad = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }); ok(bad.status === 400, 'malformed JSON -> 400', bad.status);

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);
