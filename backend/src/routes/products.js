import { Router } from 'express';
import { query, transaction } from '../db.js';
import { loadProducts, loadSupplies, loadShops, loadListingsRaw, computeListings } from '../services/listings.js';
import { ingredientCost } from '../engine/cost.js';

export const productsRouter = Router();

// "200 g" for kilo supplies, "3 pcs" for piece supplies
const display = (unit, amount) => {
  if (unit === 'kg') return `${parseFloat((amount * 1000).toFixed(2))} g`;
  return `${parseFloat(Number(amount).toFixed(2))} ${amount === 1 ? 'pc' : 'pcs'}`;
};

productsRouter.get('/products', async (req, res) => {
  const [products, supplies] = await Promise.all([loadProducts(req.storeId), loadSupplies(req.storeId)]);
  res.json(
    products.map((p) => ({
      ...p,
      ingredient_cost: ingredientCost(p.recipe, supplies),
      recipe: p.recipe.map((r) => {
        const s = supplies.find((x) => x.id === r.supply_id);
        return {
          supply_id: r.supply_id,
          name: s.name,
          unit: s.unit,
          amount: r.amount,
          display: r.display,
          unit_cost: s.unit_cost,
          cost: r.amount * s.unit_cost,
        };
      }),
    })),
  );
});

// A new product with its recipe. Each ingredient's quantity is in grams for kg supplies, pieces for pc supplies.
productsRouter.post('/products', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const nameTh = String(req.body.name_th ?? '').trim() || null;
  const pieces = Number(req.body.pieces ?? 1);
  const recipe = Array.isArray(req.body.recipe) ? req.body.recipe : [];
  if (!name || name.length > 60) return res.status(400).json({ error: 'Name must be 1 to 60 characters' });
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 1000) return res.status(400).json({ error: 'Pieces must be a whole number from 1 to 1000' });
  if (recipe.length === 0) return res.status(400).json({ error: 'Add at least one ingredient' });
  const supplies = await loadSupplies(req.storeId);
  const seen = new Set();
  const items = [];
  for (const r of recipe) {
    const supply = supplies.find((s) => s.id === Number(r.supply_id));
    const quantity = Number(r.quantity);
    if (!supply) return res.status(400).json({ error: 'One ingredient is not in this store' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: `Amount for ${supply.name} must be more than 0` });
    if (seen.has(supply.id)) return res.status(400).json({ error: `${supply.name} is listed twice` });
    seen.add(supply.id);
    const amount = supply.unit === 'kg' ? quantity / 1000 : quantity;
    items.push({ supply_id: supply.id, amount, display: display(supply.unit, amount) });
  }
  if ((await query('select 1 from products where store_id = $1 and deleted_at is null and lower(name) = lower($2)', [req.storeId, name])).rowCount) {
    return res.status(400).json({ error: 'You already have a product with that name' });
  }
  const id = await transaction(async (client) => {
    const p = await client.query('insert into products (store_id, name, name_th, pieces) values ($1,$2,$3,$4) returning id', [req.storeId, name, nameTh, pieces]);
    for (const i of items) {
      await client.query('insert into recipe_items (product_id, supply_id, amount, display) values ($1,$2,$3,$4)', [p.rows[0].id, i.supply_id, i.amount, i.display]);
    }
    return p.rows[0].id;
  });
  res.status(201).json({ id });
});

// Copies chosen products (with their recipes) from another store into this one. Ingredients are matched by
// name: ones you already have are reused, missing ones are copied over (price and unit, no stock).
// The product is not put in any shop; do that on the Shops page.
productsRouter.post('/products/import', async (req, res) => {
  const fromStore = Number(req.body.from_store);
  const ids = Array.isArray(req.body.product_ids) ? [...new Set(req.body.product_ids.map(Number))] : [];
  if (!Number.isInteger(fromStore) || !(await query('select 1 from stores s join store_members m on m.store_id = s.id where s.id = $1 and m.user_id = $2 and s.deleted_at is null', [fromStore, req.user.id])).rowCount) {
    return res.status(404).json({ error: 'Store to copy from was not found' });
  }
  if (fromStore === req.storeId) return res.status(400).json({ error: 'Pick a different store to copy from' });
  if (ids.length === 0) return res.status(400).json({ error: 'Choose at least one product' });

  const products = (await query('select * from products where store_id = $1 and deleted_at is null and id = any($2::int[]) order by id', [fromStore, ids])).rows;
  if (products.length !== ids.length) return res.status(400).json({ error: 'One of those products is not in the store you are copying from' });
  const items = (
    await query(
      `select r.*, s.name as sname, s.name_th as sname_th, s.unit as sunit, s.unit_cost as scost, s.low_stock_at as slow
         from recipe_items r join supplies s on s.id = r.supply_id where r.product_id = any($1::int[]) and s.deleted_at is null order by r.product_id, r.supply_id`,
      [products.map((p) => p.id)],
    )
  ).rows;

  const mySupplies = await loadSupplies(req.storeId);
  const byName = new Map(mySupplies.map((s) => [s.name.toLowerCase(), s]));
  const myProducts = new Set((await loadProducts(req.storeId)).map((p) => p.name.toLowerCase()));

  // Do not guess when the same ingredient name is counted differently (kg here, pieces there).
  for (const i of items) {
    const mine = byName.get(i.sname.toLowerCase());
    if (mine && mine.unit !== i.sunit) {
      return res.status(400).json({ error: `"${i.sname}" is counted in ${i.sunit} in the other store but in ${mine.unit} here. Rename one of them first.` });
    }
  }

  const added = [];
  const skipped = [];
  const newSupplies = [];
  const reused = new Set();
  await transaction(async (client) => {
    for (const p of products) {
      if (myProducts.has(p.name.toLowerCase())) {
        skipped.push(p.name);
        continue;
      }
      const created = await client.query('insert into products (store_id, name, name_th, pieces) values ($1,$2,$3,$4) returning id', [req.storeId, p.name, p.name_th, p.pieces]);
      for (const i of items.filter((x) => x.product_id === p.id)) {
        let mine = byName.get(i.sname.toLowerCase());
        if (mine) {
          reused.add(mine.name);
        } else {
          const s = await client.query(
            `insert into supplies (store_id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at)
             values ($1,$2,$3,$4,0,$5,$5,$6) returning *`,
            [req.storeId, i.sname, i.sname_th, i.sunit, i.scost, i.slow],
          );
          mine = s.rows[0];
          byName.set(i.sname.toLowerCase(), mine);
          newSupplies.push(mine.name);
        }
        await client.query('insert into recipe_items (product_id, supply_id, amount, display) values ($1,$2,$3,$4)', [created.rows[0].id, mine.id, i.amount, i.display]);
      }
      myProducts.add(p.name.toLowerCase());
      added.push(p.name);
    }
  });
  res.status(201).json({ added, skipped, new_supplies: newSupplies, reused_supplies: [...reused] });
});

// "Delete" hides a product but keeps its recipe and its prices in each shop, so it can be restored.
productsRouter.delete('/products/:id', async (req, res) => {
  const moved = await query('update products set deleted_at = now() where id = $1 and store_id = $2 and deleted_at is null returning id', [Number(req.params.id), req.storeId]);
  if (!moved.rows[0]) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

// Deleted products, which can be restored.
productsRouter.get('/products/deleted', async (req, res) => {
  const { rows } = await query(
    `select p.id, p.name, p.pieces, p.deleted_at, (select count(*)::int from listings l where l.product_id = p.id) as shop_count
       from products p where p.store_id = $1 and p.deleted_at is not null order by p.deleted_at desc`,
    [req.storeId],
  );
  res.json(rows);
});

productsRouter.post('/products/:id/restore', async (req, res) => {
  const p = (await query('select * from products where id = $1 and store_id = $2 and deleted_at is not null', [Number(req.params.id), req.storeId])).rows[0];
  if (!p) return res.status(404).json({ error: 'That product is not in the trash' });
  if ((await query('select 1 from products where store_id = $1 and deleted_at is null and lower(name) = lower($2)', [req.storeId, p.name])).rowCount) {
    return res.status(400).json({ error: `You already have a product called "${p.name}". Rename or delete that one first.` });
  }
  await query('update products set deleted_at = null where id = $1', [p.id]);
  res.json({ id: p.id });
});

// What-if: nothing is saved.
productsRouter.post('/products/:id/preview', async (req, res) => {
  const id = Number(req.params.id);
  const overrides = {};
  for (const [k, v] of Object.entries(req.body.overrides || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) overrides[Number(k)] = n;
  }
  const [products, supplies, shops, listings] = await Promise.all([
    loadProducts(req.storeId),
    loadSupplies(req.storeId),
    loadShops(req.storeId),
    loadListingsRaw(req.storeId),
  ]);
  const product = products.find((p) => p.id === id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const rows = await computeListings({ overrides, supplies, products, shops, listings });
  res.json({
    ingredient_cost: ingredientCost(product.recipe, supplies, overrides),
    per_piece: ingredientCost(product.recipe, supplies, overrides) / product.pieces,
    listings: rows.filter((l) => l.product_id === id),
    recipe: product.recipe.map((r) => {
      const s = supplies.find((x) => x.id === r.supply_id);
      const unitCost = overrides[r.supply_id] ?? s.unit_cost;
      return { supply_id: r.supply_id, unit_cost: unitCost, cost: r.amount * unitCost, edited: overrides[r.supply_id] !== undefined && overrides[r.supply_id] !== s.unit_cost };
    }),
  });
});
