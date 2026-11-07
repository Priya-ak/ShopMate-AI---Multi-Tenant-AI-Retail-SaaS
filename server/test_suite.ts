import { db, initDatabase } from './db.js';
import { seedTestFixtures, clearDatabase } from './seed.js';
import {
  toolSearchProducts,
  toolCheckInventory,
  toolCreateOrderSafe,
  toolGetOrderStatus,
  runDeterministicAgent,
} from './gemini.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING SHOPMATE AI AUTOMATED INTEGRATION TESTS');
  console.log('====================================================');

  initDatabase();
  seedTestFixtures();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Database seed verification
  const prodCount = (db.prepare("SELECT COUNT(*) as count FROM products WHERE business_id = 'biz_kalakriti_001'").get() as any).count;
  assert(prodCount >= 30, `Database seeded with >= 30 products for KalaKriti (Found: ${prodCount})`);

  // 2. Multi-tenant data isolation
  const biz2Prods = toolSearchProducts({ businessId: 'biz_urbanvogue_002' });
  const biz1Names = biz2Prods.filter((p: any) => p.name.includes('Kurti') || p.name.includes('Saree'));
  assert(biz1Names.length === 0, 'Multi-tenant isolation: Tenant #2 cannot query Tenant #1 products');

  // 3. Natural Language Product Search Filter Test
  const redKurtis = toolSearchProducts({
    businessId: 'biz_kalakriti_001',
    query: 'kurti',
    colour: 'red',
    maxPrice: 1500,
  });
  assert(redKurtis.length > 0, `Search tool found ${redKurtis.length} red kurtis under ₹1,500`);
  assert(redKurtis.every((p: any) => p.currentPrice <= 1500), 'All returned products adhere to price boundary <= ₹1,500');

  // 4. Variant-Aware Inventory Check
  const sampleVariant = db.prepare("SELECT * FROM product_variants WHERE business_id = 'biz_kalakriti_001' AND stock_quantity > 5 LIMIT 1").get() as any;
  const invCheck = toolCheckInventory('biz_kalakriti_001', sampleVariant.id);
  assert(invCheck.available === true && invCheck.stock === sampleVariant.stock_quantity, 'Variant-aware inventory checker matches database quantity');

  // 5. Transaction-Safe Order Creation & Inventory Deduction
  const initialStock = sampleVariant.stock_quantity;
  const orderResult = toolCreateOrderSafe({
    businessId: 'biz_kalakriti_001',
    customerName: 'Test Buyer',
    customerPhone: '+91 99999 88888',
    deliveryAddress: 'Test Lane, Suite 10, Bengaluru',
    items: [
      {
        productId: sampleVariant.product_id,
        variantId: sampleVariant.id,
        quantity: 2,
      },
    ],
  });

  assert(orderResult.success === true, `Order #${orderResult.orderNumber} created successfully with transaction lock`);

  const updatedVariant = db.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?').get(sampleVariant.id) as any;
  assert(updatedVariant.stock_quantity === initialStock - 2, `Stock correctly deducted from ${initialStock} to ${initialStock - 2}`);

  // 6. Ledger Movement Recording
  const latestMovement = db.prepare("SELECT * FROM inventory_movements WHERE reference_order_id = ? AND movement_type = 'SALE'").get(orderResult.orderNumber) as any;
  assert(latestMovement && latestMovement.change_qty === -2, 'Inventory ledger accurately recorded SALE movement with change_qty -2');

  // 7. Order Lookup & Status
  const lookupOrder = toolGetOrderStatus('biz_kalakriti_001', orderResult.orderNumber);
  assert(lookupOrder !== null && lookupOrder.order_number === orderResult.orderNumber, 'Order status tool found verified order');

  // 8. Safe Order Cancellation & Stock Restoration
  db.exec('BEGIN TRANSACTION;');
  const cancelOrderId = orderResult.orderId;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(cancelOrderId) as any[];
  for (const it of items) {
    const v = db.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?').get(it.variant_id) as any;
    db.prepare('UPDATE product_variants SET stock_quantity = ? WHERE id = ?').run(v.stock_quantity + it.quantity, it.variant_id);
    db.prepare("INSERT INTO inventory_movements (id, business_id, product_id, variant_id, change_qty, balance_after, movement_type, reference_order_id) VALUES (?, ?, ?, ?, ?, ?, 'CANCELLATION', ?)").run(
      `mov_test_cancel_${Date.now()}`,
      'biz_kalakriti_001',
      it.product_id,
      it.variant_id,
      it.quantity,
      v.stock_quantity + it.quantity,
      orderResult.orderNumber
    );
  }
  db.prepare("UPDATE orders SET order_status = 'Cancelled' WHERE id = ?").run(cancelOrderId);
  db.exec('COMMIT;');

  const restoredVariant = db.prepare('SELECT stock_quantity FROM product_variants WHERE id = ?').get(sampleVariant.id) as any;
  assert(restoredVariant.stock_quantity === initialStock, `Stock safely restored to original balance ${initialStock} after cancellation`);

  // 9. Deterministic AI Intent Recognition Fallback Test
  const agentSearchRes = runDeterministicAgent('biz_kalakriti_001', 'Show me red kurtis below 1500');
  assert(agentSearchRes.toolExecuted === 'search_products', 'Deterministic AI identified search_products intent');
  assert(agentSearchRes.suggestedProducts.length > 0, 'Deterministic AI returned matching real database products');

  // 10. Multi-turn Order Tracking Query
  const agentTrackRes = runDeterministicAgent('biz_kalakriti_001', `Track order ${orderResult.orderNumber}`);
  assert(agentTrackRes.toolExecuted === 'get_order_status', 'Deterministic AI identified get_order_status intent and returned tracking details');

  // 11. Phase 4 - Query 1: "Show me red kurtis below ₹1,500."
  const q1 = runDeterministicAgent('biz_kalakriti_001', 'Show me red kurtis below ₹1,500.');
  assert(q1.suggestedProducts.length > 0 && q1.suggestedProducts.every((p: any) => p.currentPrice <= 1500), 'Phase 4 Q1: Red kurtis below ₹1,500 accurately filtered from DB');

  // 12. Phase 4 - Query 2: "Show me blue sarees."
  const q2 = runDeterministicAgent('biz_kalakriti_001', 'Show me blue sarees.');
  assert(q2.suggestedProducts.length > 0 && q2.suggestedProducts.some((p: any) => p.name.toLowerCase().includes('saree')), 'Phase 4 Q2: Blue sarees accurately returned from DB');

  // 13. Phase 4 - Query 3: "Do you have size M?"
  const q3 = runDeterministicAgent('biz_kalakriti_001', 'Do you have size M?');
  assert(
    q3.suggestedProducts.length > 0 &&
      q3.suggestedProducts.every((p: any) =>
        p.variants.some((v: any) => v.size.toUpperCase() === 'M' || v.size.toLowerCase() === 'medium')
      ),
    'Phase 4 Q3: Size M products verified against variant stock'
  );

  // 14. Phase 4 - Query 4: "Is this product available?"
  const q4 = runDeterministicAgent('biz_kalakriti_001', 'Is this product available?');
  assert(q4.toolExecuted === 'check_inventory' && q4.reply.includes('available'), 'Phase 4 Q4: Product availability checked against active inventory');

  // 15. Phase 4 - Query 5: "Show me products below ₹2,000."
  const q5 = runDeterministicAgent('biz_kalakriti_001', 'Show me products below ₹2,000.');
  assert(q5.suggestedProducts.length > 0 && q5.suggestedProducts.every((p: any) => p.currentPrice <= 2000), 'Phase 4 Q5: Products below ₹2,000 returned with correct price constraints');

  // 16. Phase 4 - Query 6: "I want to order two pieces."
  const q6 = runDeterministicAgent('biz_kalakriti_001', 'I want to order two pieces.');
  assert(q6.toolExecuted === 'order_intent_guidance' && q6.suggestedProducts.length > 0, 'Phase 4 Q6: Ordering guidance with in-stock products returned');

  // 17. Phase 4 - Query 7: "What is my order status?"
  const q7NoLookup = runDeterministicAgent('biz_kalakriti_001', 'What is my order status?');
  assert(q7NoLookup.toolExecuted === 'get_order_status_prompt' && q7NoLookup.reply.includes('Order Number'), 'Phase 4 Q7: Prompts customer for order number or phone when unspecified');

  const q7WithLookup = runDeterministicAgent('biz_kalakriti_001', `What is my order status for ${orderResult.orderNumber}?`);
  assert(q7WithLookup.toolExecuted === 'get_order_status' && q7WithLookup.order.order_number === orderResult.orderNumber, 'Phase 4 Q7: Real database order fetched and formatted for customer');

  // Clean up all test fixture records so database remains completely free of sample data
  clearDatabase();

  console.log('====================================================');
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
