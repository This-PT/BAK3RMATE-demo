import { presetByKey } from './presets.js';

// The demo bakery: what a new account can start with. Prices are real Thai platform fees (see presets.js).
const SUPPLIES = [
  ['Dark chocolate', 'ช็อกโกแลต', 'kg', 2.4, 450, 400, 0.5],
  ['Butter', 'เนย', 'kg', 1.8, 320, 300, 0.5],
  ['Sugar', 'น้ำตาล', 'kg', 5, 30, 30, 1],
  ['Cake flour', 'แป้งเค้ก', 'kg', 3.2, 40, 40, 1],
  ['Eggs', 'ไข่', 'pc', 42, 4.5, 4.15, 12],
  ['Cream cheese', 'ครีมชีส', 'kg', 0.6, 380, 380, 1],
  ['Matcha powder', 'ชาเขียว', 'kg', 0.15, 1200, 1200, 0.2],
  ['Box + label', 'กล่อง', 'pc', 85, 12, 12, 20],
];
const PRODUCTS = [
  ['Brownie box (6 pcs)', 'บราวนี่กล่อง', 6, [['Dark chocolate', 0.2, '200 g'], ['Butter', 0.12, '120 g'], ['Sugar', 0.15, '150 g'], ['Cake flour', 0.08, '80 g'], ['Eggs', 3, '3 pcs'], ['Box + label', 1, '1 pc']]],
  ['Butter cookie jar', 'คุกกี้เนย', 1, [['Butter', 0.1, '100 g'], ['Cake flour', 0.2, '200 g'], ['Sugar', 0.05, '50 g'], ['Eggs', 1, '1 pc'], ['Box + label', 1, '1 pc']]],
  ['Matcha cake slice', 'เค้กมัทฉะ', 1, [['Cake flour', 0.05, '50 g'], ['Butter', 0.05, '50 g'], ['Sugar', 0.05, '50 g'], ['Eggs', 1, '1 pc'], ['Matcha powder', 0.01, '10 g'], ['Box + label', 1, '1 pc']]],
  ['Cheesecake cup', 'ชีสเค้กถ้วย', 1, [['Cream cheese', 0.1, '100 g'], ['Butter', 0.025, '25 g'], ['Eggs', 1, '1 pc'], ['Box + label', 1, '1 pc']]],
];
// shop, product, price, ads, wear
const LISTINGS = [
  ['Shopee shop', 'Brownie box (6 pcs)', 289, 25, 6],
  ['Shopee shop', 'Butter cookie jar', 159, 15, 4],
  ['Shopee shop', 'Matcha cake slice', 79, 15, 3],
  ['Shopee shop', 'Cheesecake cup', 99, 20, 4],
  ['LINE shop', 'Brownie box (6 pcs)', 260, 0, 6],
  ['LINE shop', 'Butter cookie jar', 150, 0, 4],
];

// Inside a transaction: creates a store with the demo data and returns its id.
export async function createSampleStore(client, name) {
  const store = (await client.query('insert into stores (name) values ($1) returning id', [name])).rows[0].id;
  const supply = new Map();
  for (const [n, th, unit, qty, cost, prev, low] of SUPPLIES) {
    const r = await client.query(
      'insert into supplies (store_id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [store, n, th, unit, qty, cost, prev, low],
    );
    supply.set(n, r.rows[0].id);
  }
  const product = new Map();
  for (const [n, th, pieces, recipe] of PRODUCTS) {
    const r = await client.query('insert into products (store_id, name, name_th, pieces) values ($1,$2,$3,$4) returning id', [store, n, th, pieces]);
    product.set(n, r.rows[0].id);
    for (const [s, amount, display] of recipe) {
      await client.query('insert into recipe_items (product_id, supply_id, amount, display) values ($1,$2,$3,$4)', [r.rows[0].id, supply.get(s), amount, display]);
    }
  }
  const shop = new Map();
  for (const [n, key] of [['Shopee shop', 'shopee'], ['LINE shop', 'line']]) {
    const f = presetByKey(key).fees;
    const r = await client.query(
      `insert into shops (store_id, name, commission_pct, transaction_pct, shipping_pct, extra_pct, extra_cap_per_item, fixed_fee_per_order, platform)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [store, n, f.commission_pct, f.transaction_pct, f.shipping_pct, f.extra_pct, f.extra_cap_per_item, f.fixed_fee_per_order, key],
    );
    shop.set(n, r.rows[0].id);
  }
  for (const [s, p, price, ads, wear] of LISTINGS) {
    await client.query('insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order) values ($1,$2,$3,$4,$5)', [shop.get(s), product.get(p), price, ads, wear]);
  }
  return store;
}
