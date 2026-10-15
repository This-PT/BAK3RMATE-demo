import { Router } from 'express';
import { query } from '../db.js';
import { PRESETS, presetByKey } from '../presets.js';
import { loadShops, computeListings, loadSupplies, supplyKpis, recentChanges } from '../services/listings.js';

export const shopsRouter = Router();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

shopsRouter.get('/shops', async (_req, res) => {
  const [shops, listings] = await Promise.all([loadShops(), computeListings()]);
  res.json(shops.map((s) => ({ ...s, product_count: listings.filter((l) => l.shop_id === s.id).length })));
});

shopsRouter.get('/shop-presets', (_req, res) =>
  res.json(
    PRESETS.map((p) => ({
      ...p,
      total_pct: parseFloat((p.fees.commission_pct + p.fees.transaction_pct + p.fees.shipping_pct + p.fees.extra_pct).toFixed(2)),
    })),
  ),
);

const FEE_FIELDS = ['commission_pct', 'transaction_pct', 'shipping_pct', 'extra_pct'];

// Reads fee inputs from a request body. Returns { values } or { error }.
function readFees(body, base = {}) {
  const out = {};
  for (const f of FEE_FIELDS) {
    if (body[f] === undefined) continue;
    const n = num(body[f]);
    if (n === null || n > 100) return { error: `${f} must be between 0 and 100` };
    out[f] = n;
  }
  if (body.fixed_fee_per_order !== undefined) {
    const n = num(body.fixed_fee_per_order);
    if (n === null || n > 10000) return { error: 'fixed_fee_per_order must be 0 or more' };
    out.fixed_fee_per_order = n;
  }
  if (body.extra_cap_per_item !== undefined) {
    if (body.extra_cap_per_item === null || body.extra_cap_per_item === '') out.extra_cap_per_item = null;
    else {
      const n = num(body.extra_cap_per_item);
      if (n === null) return { error: 'extra_cap_per_item must be 0 or more, or empty for no cap' };
      out.extra_cap_per_item = n;
    }
  }
  return { values: { ...base, ...out } };
}

shopsRouter.post('/shops', async (req, res) => {
  const preset = req.body.preset ? presetByKey(req.body.preset) : null;
  if (req.body.preset && !preset) return res.status(400).json({ error: 'Unknown shop type' });
  const name = String(req.body.name ?? preset?.name ?? 'New shop').trim().slice(0, 60) || 'New shop';
  const base = { commission_pct: 0, transaction_pct: 0, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0, ...(preset?.fees ?? {}) };
  const { values, error } = readFees(req.body, base);
  if (error) return res.status(400).json({ error });
  const { rows } = await query(
    `insert into shops (name, commission_pct, transaction_pct, shipping_pct, extra_pct, extra_cap_per_item, fixed_fee_per_order, platform)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [name, values.commission_pct, values.transaction_pct, values.shipping_pct, values.extra_pct, values.extra_cap_per_item, values.fixed_fee_per_order, preset?.key ?? null],
  );
  const shop = rows[0];
  // Start the new shop with the products, prices, ads and wear of another shop (editable afterwards).
  // copy_from: null means start empty; leaving it out copies from the first shop.
  const source = 'copy_from' in req.body ? req.body.copy_from : (await query('select min(id) as id from shops where id <> $1', [shop.id])).rows[0].id;
  if (source) {
    await query(
      `insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order)
       select $1, product_id, price, ads_per_order, wear_per_order from listings where shop_id = $2`,
      [shop.id, Number(source)],
    );
  }
  const count = (await query('select count(*)::int as n from listings where shop_id = $1', [shop.id])).rows[0].n;
  res.status(201).json({ ...shop, product_count: count });
});

shopsRouter.patch('/shops/:id', async (req, res) => {
  const sets = [];
  const vals = [];
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 60) return res.status(400).json({ error: 'Shop name must be 1 to 60 characters' });
    vals.push(name);
    sets.push(`name = $${vals.length}`);
  }
  const { values, error } = readFees(req.body);
  if (error) return res.status(400).json({ error });
  for (const [k, v] of Object.entries(values)) {
    vals.push(v);
    sets.push(`${k} = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(Number(req.params.id));
  const { rows } = await query(`update shops set ${sets.join(', ')} where id = $${vals.length} returning *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Shop not found' });
  res.json(rows[0]);
});

shopsRouter.delete('/shops/:id', async (req, res) => {
  const { rows } = await query('select count(*)::int as n from shops');
  if (rows[0].n <= 1) return res.status(400).json({ error: 'You need at least one shop' });
  const del = await query('delete from shops where id = $1 returning id', [Number(req.params.id)]); // listings cascade
  if (!del.rows[0]) return res.status(404).json({ error: 'Shop not found' });
  res.json({ ok: true });
});

shopsRouter.get('/shops/:id/listings', async (req, res) => {
  const id = Number(req.params.id);
  res.json((await computeListings()).filter((l) => l.shop_id === id));
});

// Products not yet sold in this shop, with a starting price taken from another shop that sells them.
shopsRouter.get('/shops/:id/available-products', async (req, res) => {
  const { rows } = await query(
    `select p.id, p.name, p.name_th,
            (select l2.price from listings l2 where l2.product_id = p.id order by l2.id limit 1) as suggested_price
       from products p
      where not exists (select 1 from listings l where l.shop_id = $1 and l.product_id = p.id)
      order by p.id`,
    [Number(req.params.id)],
  );
  res.json(rows);
});

// Put a product into a shop.
shopsRouter.post('/shops/:id/listings', async (req, res) => {
  const shopId = Number(req.params.id);
  const productId = Number(req.body.product_id);
  const price = num(req.body.price);
  const ads = req.body.ads_per_order === undefined ? 0 : num(req.body.ads_per_order);
  const wear = req.body.wear_per_order === undefined ? 0 : num(req.body.wear_per_order);
  if (price === null || price <= 0) return res.status(400).json({ error: 'Selling price must be more than 0' });
  if (ads === null || wear === null) return res.status(400).json({ error: 'Ads and wear must be non-negative numbers' });
  const shop = await query('select 1 from shops where id = $1', [shopId]);
  const product = await query('select 1 from products where id = $1', [productId]);
  if (!shop.rowCount) return res.status(404).json({ error: 'Shop not found' });
  if (!product.rowCount) return res.status(404).json({ error: 'Product not found' });
  const dup = await query('select 1 from listings where shop_id = $1 and product_id = $2', [shopId, productId]);
  if (dup.rowCount) return res.status(400).json({ error: 'This product is already in the shop' });
  const { rows } = await query(
    'insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order) values ($1,$2,$3,$4,$5) returning id',
    [shopId, productId, price, ads, wear],
  );
  res.status(201).json((await computeListings()).find((l) => l.id === rows[0].id));
});

// Take a product out of a shop (the product itself stays).
shopsRouter.delete('/listings/:id', async (req, res) => {
  const del = await query('delete from listings where id = $1 returning id', [Number(req.params.id)]);
  if (!del.rows[0]) return res.status(404).json({ error: 'Listing not found' });
  res.json({ ok: true });
});

shopsRouter.patch('/listings/:id', async (req, res) => {
  const map = { price: 'price', ads_per_order: 'ads_per_order', wear_per_order: 'wear_per_order' };
  const sets = [];
  const vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] === undefined) continue;
    const n = num(req.body[k]);
    if (n === null) return res.status(400).json({ error: `${k} must be a non-negative number` });
    if (k === 'price' && n <= 0) return res.status(400).json({ error: 'Selling price must be more than 0' });
    vals.push(n);
    sets.push(`${col} = $${vals.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(Number(req.params.id));
  const { rows } = await query(`update listings set ${sets.join(', ')} where id = $${vals.length} returning id`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Listing not found' });
  res.json((await computeListings()).find((l) => l.id === rows[0].id));
});

shopsRouter.get('/dashboard', async (_req, res) => {
  const [listings, supplies, changes] = await Promise.all([computeListings(), loadSupplies(), recentChanges(7)]);
  const losing = listings.filter((l) => l.status === 'losing');
  const thin = listings.filter((l) => l.status === 'thin');
  const shopCount = new Set(listings.map((l) => l.shop_id)).size;
  res.json({
    kpis: {
      products_tracked: listings.length,
      shops: shopCount,
      losing: losing.length,
      losing_names: losing.map((l) => `${l.product_name} on ${l.shop_name.replace(/ shop$/, '')}`),
      thin: thin.length,
      thin_names: thin.map((l) => `${l.product_name} on ${l.shop_name.replace(/ shop$/, '')}`),
      stock_value: supplyKpis(supplies, changes).stock_value,
    },
    listings,
  });
});
