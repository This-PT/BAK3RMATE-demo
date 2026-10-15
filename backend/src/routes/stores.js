import { Router } from 'express';
import { query, transaction } from '../db.js';
import { HttpError } from '../http.js';
import { fetchSales } from '../services/sales.js';

export const storesRouter = Router();

const cleanName = (v) => String(v ?? '').trim();

// Is this an active store that belongs to the person? (Everything about stores goes through this check.)
async function ownsStore(userId, storeId, client = { query }) {
  const r = await client.query(
    'select 1 from stores s join store_members m on m.store_id = s.id where s.id = $1 and m.user_id = $2 and s.deleted_at is null',
    [storeId, userId],
  );
  return r.rowCount > 0;
}

async function summary(id) {
  const { rows } = await query(
    `select s.id, s.name, s.created_at,
            (select count(*)::int from shops where store_id = s.id and deleted_at is null) as shop_count,
            (select count(*)::int from products where store_id = s.id and deleted_at is null) as product_count,
            (select count(*)::int from supplies where store_id = s.id and deleted_at is null) as supply_count
       from stores s where s.id = $1 and s.deleted_at is null`,
    [id],
  );
  if (!rows[0]) return null;
  const month = (await query(`select date_trunc('month', (now() at time zone 'Asia/Bangkok'))::date as d`)).rows[0].d;
  const { totals } = await fetchSales({ storeId: id, from: month });
  return { ...rows[0], month: { units: totals.units, revenue: totals.revenue, profit: totals.profit } };
}

// Only the stores that belong to the person who is logged in.
storesRouter.get('/stores', async (req, res) => {
  const { rows } = await query(
    'select s.id from stores s join store_members m on m.store_id = s.id where m.user_id = $1 and s.deleted_at is null order by s.id',
    [req.user.id],
  );
  res.json(await Promise.all(rows.map((r) => summary(r.id))));
});

// Copies supplies, products, recipes, shops and listings (not the sold log or price history).
async function duplicate(client, fromId, toId) {
  const map = { supplies: new Map(), products: new Map(), shops: new Map() };
  const supplies = (await client.query('select * from supplies where store_id = $1 and deleted_at is null order by id', [fromId])).rows;
  for (const s of supplies) {
    const r = await client.query(
      `insert into supplies (store_id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [toId, s.name, s.name_th, s.unit, s.qty, s.unit_cost, s.prev_unit_cost, s.low_stock_at],
    );
    map.supplies.set(s.id, r.rows[0].id);
  }
  const products = (await client.query('select * from products where store_id = $1 and deleted_at is null order by id', [fromId])).rows;
  for (const p of products) {
    const r = await client.query('insert into products (store_id, name, name_th, pieces) values ($1,$2,$3,$4) returning id', [toId, p.name, p.name_th, p.pieces]);
    map.products.set(p.id, r.rows[0].id);
  }
  const items = (await client.query('select r.* from recipe_items r join products p on p.id = r.product_id where p.store_id = $1 and p.deleted_at is null', [fromId])).rows;
  for (const i of items) {
    await client.query('insert into recipe_items (product_id, supply_id, amount, display) values ($1,$2,$3,$4)', [map.products.get(i.product_id), map.supplies.get(i.supply_id), i.amount, i.display]);
  }
  const shops = (await client.query('select * from shops where store_id = $1 and deleted_at is null order by id', [fromId])).rows;
  for (const s of shops) {
    const r = await client.query(
      `insert into shops (store_id, name, commission_pct, transaction_pct, shipping_pct, extra_pct, extra_cap_per_item, fixed_fee_per_order, platform)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [toId, s.name, s.commission_pct, s.transaction_pct, s.shipping_pct, s.extra_pct, s.extra_cap_per_item, s.fixed_fee_per_order, s.platform],
    );
    map.shops.set(s.id, r.rows[0].id);
  }
  const listings = (await client.query('select l.* from listings l join shops s on s.id = l.shop_id join products p on p.id = l.product_id where s.store_id = $1 and s.deleted_at is null and p.deleted_at is null and l.deleted_at is null', [fromId])).rows;
  for (const l of listings) {
    await client.query('insert into listings (shop_id, product_id, price, ads_per_order, wear_per_order) values ($1,$2,$3,$4,$5)', [map.shops.get(l.shop_id), map.products.get(l.product_id), l.price, l.ads_per_order, l.wear_per_order]);
  }
}

// Supplies of any store, so you can pick some to copy into the store you are working in.
storesRouter.get('/stores/:id/supplies', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await ownsStore(req.user.id, id))) return res.status(404).json({ error: 'Store not found' });
  const { rows } = await query('select id, name, name_th, unit, qty, unit_cost, low_stock_at from supplies where store_id = $1 and deleted_at is null order by id', [id]);
  res.json(rows);
});

// Products of any store with their recipe, so you can pick some to copy into the store you are working in.
storesRouter.get('/stores/:id/products', async (req, res) => {
  const id = Number(req.params.id);
  if (!(await ownsStore(req.user.id, id))) return res.status(404).json({ error: 'Store not found' });
  const products = (await query('select id, name, name_th, pieces from products where store_id = $1 and deleted_at is null order by id', [id])).rows;
  const items = (
    await query(
      `select r.product_id, s.name, s.unit, r.display from recipe_items r
         join supplies s on s.id = r.supply_id join products p on p.id = r.product_id
        where p.store_id = $1 and p.deleted_at is null and s.deleted_at is null order by r.product_id, s.id`,
      [id],
    )
  ).rows;
  res.json(products.map((p) => ({ ...p, recipe: items.filter((i) => i.product_id === p.id).map(({ name, unit, display }) => ({ name, unit, display })) })));
});

storesRouter.post('/stores', async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Store name must be 1 to 60 characters' });
  const copyFrom = req.body.copy_from === null || req.body.copy_from === undefined ? null : Number(req.body.copy_from);
  const id = await transaction(async (client) => {
    if (copyFrom !== null && !(await ownsStore(req.user.id, copyFrom, client))) throw new HttpError(404, 'The store to copy from was not found');
    const created = (await client.query('insert into stores (name) values ($1) returning id', [name])).rows[0].id;
    await client.query(`insert into store_members (store_id, user_id, role) values ($1, $2, 'owner')`, [created, req.user.id]);
    if (copyFrom !== null) await duplicate(client, copyFrom, created);
    return created;
  });
  res.status(201).json(await summary(id));
});

storesRouter.patch('/stores/:id', async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Store name must be 1 to 60 characters' });
  const { rows } = await query(
    `update stores s set name = $1 from store_members m
      where s.id = $2 and m.store_id = s.id and m.user_id = $3 and s.deleted_at is null returning s.id`,
    [name, Number(req.params.id), req.user.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Store not found' });
  res.json(await summary(rows[0].id));
});

// "Delete" hides the store with everything in it; nothing is removed. It can be restored from the list below.
storesRouter.delete('/stores/:id', async (req, res) => {
  const id = Number(req.params.id);
  await transaction(async (client) => {
    if (!(await ownsStore(req.user.id, id, client))) throw new HttpError(404, 'Store not found');
    const mine = await client.query(
      'select count(*)::int as n from stores s join store_members m on m.store_id = s.id where m.user_id = $1 and s.deleted_at is null',
      [req.user.id],
    );
    if (mine.rows[0].n <= 1) throw new HttpError(400, 'You need at least one store');
    await client.query('update stores set deleted_at = now() where id = $1', [id]);
  });
  res.json({ ok: true });
});

storesRouter.get('/stores/deleted', async (req, res) => {
  const { rows } = await query(
    `select s.id, s.name, s.deleted_at,
            (select count(*)::int from shops where store_id = s.id and deleted_at is null) as shop_count,
            (select count(*)::int from products where store_id = s.id and deleted_at is null) as product_count
       from stores s join store_members m on m.store_id = s.id
      where m.user_id = $1 and s.deleted_at is not null order by s.deleted_at desc`,
    [req.user.id],
  );
  res.json(rows);
});

storesRouter.post('/stores/:id/restore', async (req, res) => {
  const { rows } = await query(
    `update stores s set deleted_at = null from store_members m
      where s.id = $1 and m.store_id = s.id and m.user_id = $2 and s.deleted_at is not null returning s.id`,
    [Number(req.params.id), req.user.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'That store is not in the deleted list' });
  res.json(await summary(rows[0].id));
});
