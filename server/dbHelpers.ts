import { db } from './db.js';

/** One query for the variants of many products (avoids N+1 round-trips to Postgres). */
export async function loadVariantsByProduct(businessId: string, productIds: string[]): Promise<Map<string, any[]>> {
  const byProduct = new Map<string, any[]>();
  if (productIds.length === 0) return byProduct;
  const marks = productIds.map(() => '?').join(',');
  const rows = (await db
    .prepare(`SELECT * FROM product_variants WHERE business_id = ? AND product_id IN (${marks})`)
    .all(businessId, ...productIds)) as any[];
  for (const v of rows) {
    const list = byProduct.get(v.product_id) || [];
    list.push(v);
    byProduct.set(v.product_id, list);
  }
  return byProduct;
}
