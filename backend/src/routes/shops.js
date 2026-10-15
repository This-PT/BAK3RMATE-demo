import { Router } from 'express';
import { query } from '../db.js';
import { PRESETS, presetByKey } from '../presets.js';
import { loadShops, computeListings, loadSupplies, supplyKpis, recentChanges } from '../services/listings.js';

export const shopsRouter = Router();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

shopsRouter.get('/shops', async (req, res) => {
  const [shops, listings] = await Promise.all([loadShops(req.storeId), computeListings({ storeId: req.storeId })]);
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
    `insert into shops (store_id, name, commission_pct, transaction_pct, shipping_pct, extra_pct, extra_cap_per_item, fixed_fee_per_order, platform)
     values ($9,$1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [name, values.commission_pct, values.transaction_pct, values.shipping_pct, values.extra_pct, values.extra_cap_per_item, values.fixed_fee_per_order, preset?.key ?? null, req.storeId],
  );
  const shop = rows[0];
  // Start the new shop with the products, prices, ads and wear of another shop (editable afterwards).
  // copy_from: null means start empty; leaving it out copies from the first shop.
  let source = 'copy_from' in req.body ? req.body.copy_from : (await query('select min(id) as id from shops where store_id = $1 and id <> $2 and deleted_at is null', [req.storeId, shop.id])).rows[0].id;
  if (source && !(await query('select 1 from shops where id = $1 and store_id = $2 and deleted_at is null', [Number(source), req.storeId])).rowCount) source = null; // only copy from a shop of this store
  if (source) {
    await query(
      `insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order)
       select $1, l.product_id, l.price, l.ads_per_order, l.wear_per_order from listings l join products p on p.id = l.product_id
        where l.shop_id = $2 and l.deleted_at is null and p.deleted_at is null`,
      [shop.id, Number(source)],
    );
  }
  const count = (await query('select count(*)::int as n from listings where shop_id = $1 and deleted_at is null', [shop.id])).rows[0].n;
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
  vals.push(Number(req.params.id), req.storeId);
  const { rows } = await query(`update shops set ${sets.join(', ')} where id = $${vals.length - 1} and store_id = $${vals.length} and deleted_at is null returning *`, vals);
  if (!rows[0]) return res.status(404).json({ error: 'Shop not found' });
  res.json(rows[0]);
});

// "Delete" hides the shop with its prices; nothing is removed, and it can be restored.
shopsRouter.delete('/shops/:id', async (req, res) => {
  const del = await query('update shops set deleted_at = now() where id = $1 and store_id = $2 and deleted_at is null returning id', [Number(req.params.id), req.storeId]);
  if (!del.rows[0]) return res.status(404).json({ error: 'Shop not found' });
  res.json({ ok: true });
});

shopsRouter.get('/shops/deleted', async (req, res) => {
  const { rows } = await query(
    `select s.id, s.name, s.deleted_at,
            (select count(*)::int from listings l join products p on p.id = l.product_id where l.shop_id = s.id and l.deleted_at is null and p.deleted_at is null) as product_count
       from shops s where s.store_id = $1 and s.deleted_at is not null order by s.deleted_at desc`,
    [req.storeId],
  );
  res.json(rows);
});

shopsRouter.post('/shops/:id/restore', async (req, res) => {
  const r = await query('update shops set deleted_at = null where id = $1 and store_id = $2 and deleted_at is not null returning id', [Number(req.params.id), req.storeId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'That shop is not in the deleted list' });
  res.json({ id: r.rows[0].id });
});

shopsRouter.get('/shops/:id/listings', async (req, res) => {
  const id = Number(req.params.id);
  res.json((await computeListings({ storeId: req.storeId })).filter((l) => l.shop_id === id));
});

// Products not yet sold in this shop, with a starting price taken from another shop that sells them.
shopsRouter.get('/shops/:id/available-products', async (req, res) => {
  const { rows } = await query(
    `select p.id, p.name, p.name_th,
            (select l2.price from listings l2 where l2.product_id = p.id and l2.shop_id in (select id from shops where store_id = $2 and deleted_at is null)
              order by (l2.shop_id = $1) desc, (l2.deleted_at is null) desc, l2.id limit 1) as suggested_price
       from products p
      where p.store_id = $2 and p.deleted_at is null and not exists (select 1 from listings l where l.shop_id = $1 and l.product_id = p.id and l.deleted_at is null)
      order by p.id`,
    [Number(req.params.id), req.storeId],
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
  const shop = await query('select 1 from shops where id = $1 and store_id = $2 and deleted_at is null', [shopId, req.storeId]);
  const product = await query('select 1 from products where id = $1 and store_id = $2 and deleted_at is null', [productId, req.storeId]);
  if (!shop.rowCount) return res.status(404).json({ error: 'Shop not found' });
  if (!product.rowCount) return res.status(404).json({ error: 'Product not found' });
  const existing = (await query('select id, deleted_at from listings where shop_id = $1 and product_id = $2', [shopId, productId])).rows[0];
  if (existing && !existing.deleted_at) return res.status(400).json({ error: 'This product is already in the shop' });
  let id;
  if (existing) {
    // it was removed earlier: bring that same row back with the new numbers
    await query('update listings set deleted_at = null, price = $2, ads_per_order = $3, wear_per_order = $4 where id = $1', [existing.id, price, ads, wear]);
    id = existing.id;
  } else {
    id = (await query('insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order) values ($1,$2,$3,$4,$5) returning id', [shopId, productId, price, ads, wear])).rows[0].id;
  }
  res.status(201).json((await computeListings({ storeId: req.storeId })).find((l) => l.id === id));
});

// Take a product out of a shop. It is only hidden: the price is kept and it can be put back.
shopsRouter.delete('/listings/:id', async (req, res) => {
  const del = await query(
    `update listings l set deleted_at = now() from shops s
      where l.id = $1 and s.id = l.shop_id and s.store_id = $2 and s.deleted_at is null and l.deleted_at is null returning l.id`,
    [Number(req.params.id), req.storeId],
  );
  if (!del.rows[0]) return res.status(404).json({ error: 'Listing not found' });
  res.json({ ok: true });
});

// Products taken out of this shop that can be put back.
shopsRouter.get('/shops/:id/removed', async (req, res) => {
  const { rows } = await query(
    `select l.id, p.name as product_name, l.price, l.deleted_at
       from listings l join shops s on s.id = l.shop_id join products p on p.id = l.product_id
      where l.shop_id = $1 and s.store_id = $2 and l.deleted_at is not null and p.deleted_at is null
      order by l.deleted_at desc`,
    [Number(req.params.id), req.storeId],
  );
  res.json(rows);
});

shopsRouter.post('/listings/:id/restore', async (req, res) => {
  const r = await query(
    `update listings l set deleted_at = null from shops s, products p
      where l.id = $1 and s.id = l.shop_id and p.id = l.product_id and s.store_id = $2
        and s.deleted_at is null and p.deleted_at is null and l.deleted_at is not null returning l.id`,
    [Number(req.params.id), req.storeId],
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'That product is not in the removed list, or its shop or product is deleted' });
  res.json((await computeListings({ storeId: req.storeId })).find((l) => l.id === r.rows[0].id));
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
  vals.push(Number(req.params.id), req.storeId);
  const { rows } = await query(
    `update listings l set ${sets.join(', ')} from shops s
      where l.id = $${vals.length - 1} and s.id = l.shop_id and s.store_id = $${vals.length} and s.deleted_at is null and l.deleted_at is null returning l.id`,
    vals,
  );
  if (!rows[0]) return res.status(404).json({ error: 'Listing not found' });
  res.json((await computeListings({ storeId: req.storeId })).find((l) => l.id === rows[0].id));
});

shopsRouter.get('/dashboard', async (req, res) => {
  const [listings, supplies, changes, shops] = await Promise.all([
    computeListings({ storeId: req.storeId }),
    loadSupplies(req.storeId),
    recentChanges(req.storeId, 7),
    loadShops(req.storeId),
  ]);
  const losing = listings.filter((l) => l.status === 'losing');
  const thin = listings.filter((l) => l.status === 'thin');
  res.json({
    kpis: {
      products_tracked: listings.length,
      shops: shops.length,
      store_name: req.storeName,
      losing: losing.length,
      losing_names: losing.map((l) => `${l.product_name} on ${l.shop_name.replace(/ shop$/, '')}`),
      thin: thin.length,
      thin_names: thin.map((l) => `${l.product_name} on ${l.shop_name.replace(/ shop$/, '')}`),
      stock_value: supplyKpis(supplies, changes).stock_value,
    },
    listings,
  });
});
