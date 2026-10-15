import { Router } from 'express';
import { loadSupplies, supplyView, supplyKpis, recentChanges } from '../services/listings.js';
import { applySupplyChange } from '../services/supplies.js';
import { query, transaction } from '../db.js';

export const suppliesRouter = Router();

const nonNeg = (v) => {
  const n = Number(v);
  return v !== '' && v !== null && Number.isFinite(n) && n >= 0 ? n : null;
};

suppliesRouter.get('/supplies', async (req, res) => {
  const supplies = await loadSupplies(req.storeId);
  const changes = await recentChanges(req.storeId, 7);
  res.json({ supplies: supplies.map(supplyView), kpis: supplyKpis(supplies, changes) });
});

// A new ingredient or material in this store.
suppliesRouter.post('/supplies', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const nameTh = String(req.body.name_th ?? '').trim() || null;
  const unit = req.body.unit;
  const qty = nonNeg(req.body.qty ?? 0);
  const unitCost = nonNeg(req.body.unit_cost);
  const low = nonNeg(req.body.low_stock_at ?? 0);
  if (!name || name.length > 60) return res.status(400).json({ error: 'Name must be 1 to 60 characters' });
  if (unit !== 'kg' && unit !== 'pc') return res.status(400).json({ error: 'Unit must be kg or pc' });
  if (qty === null || unitCost === null || low === null) return res.status(400).json({ error: 'Stock, price and low-stock level must be 0 or more' });
  const dup = await query('select 1 from supplies where store_id = $1 and deleted_at is null and lower(name) = lower($2)', [req.storeId, name]);
  if (dup.rowCount) return res.status(400).json({ error: 'You already have a supply with that name' });
  const { rows } = await query(
    `insert into supplies (store_id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at)
     values ($1,$2,$3,$4,$5,$6,$6,$7) returning *`,
    [req.storeId, name, nameTh, unit, qty, unitCost, low],
  );
  res.status(201).json(supplyView(rows[0]));
});

// Copies chosen supplies from another store into this one: same name, unit, price and low-stock level.
// Stock starts at 0 because stock is physical and belongs to one store. Names you already have are skipped.
suppliesRouter.post('/supplies/import', async (req, res) => {
  const fromStore = Number(req.body.from_store);
  const ids = Array.isArray(req.body.supply_ids) ? [...new Set(req.body.supply_ids.map(Number))] : [];
  if (!Number.isInteger(fromStore) || !(await query('select 1 from stores s join store_members m on m.store_id = s.id where s.id = $1 and m.user_id = $2 and s.deleted_at is null', [fromStore, req.user.id])).rowCount) {
    return res.status(404).json({ error: 'Store to copy from was not found' });
  }
  if (fromStore === req.storeId) return res.status(400).json({ error: 'Pick a different store to copy from' });
  if (ids.length === 0) return res.status(400).json({ error: 'Choose at least one ingredient' });
  const source = (await query('select * from supplies where store_id = $1 and deleted_at is null and id = any($2::int[]) order by id', [fromStore, ids])).rows;
  if (source.length !== ids.length) return res.status(400).json({ error: 'One of those ingredients is not in the store you are copying from' });

  const have = new Set((await query('select lower(name) as n from supplies where store_id = $1 and deleted_at is null', [req.storeId])).rows.map((r) => r.n));
  const added = [];
  const skipped = [];
  await transaction(async (client) => {
    for (const s of source) {
      if (have.has(s.name.toLowerCase())) {
        skipped.push(s.name);
        continue;
      }
      const r = await client.query(
        `insert into supplies (store_id, name, name_th, unit, qty, unit_cost, prev_unit_cost, low_stock_at)
         values ($1,$2,$3,$4,0,$5,$5,$6) returning *`,
        [req.storeId, s.name, s.name_th, s.unit, s.unit_cost, s.low_stock_at],
      );
      added.push(supplyView(r.rows[0]));
      have.add(s.name.toLowerCase());
    }
  });
  res.status(201).json({ added, skipped });
});

// "Delete" hides a supply nothing uses; it can be restored from the deleted list.
suppliesRouter.delete('/supplies/:id', async (req, res) => {
  const id = Number(req.params.id);
  const owned = await query('select 1 from supplies where id = $1 and store_id = $2 and deleted_at is null', [id, req.storeId]);
  if (!owned.rowCount) return res.status(404).json({ error: 'Supply not found' });
  const used = await query('select p.name, p.deleted_at from recipe_items r join products p on p.id = r.product_id where r.supply_id = $1', [id]);
  if (used.rowCount) return res.status(400).json({ error: `Used in the recipe of ${used.rows.map((r) => (r.deleted_at ? `${r.name} (deleted)` : r.name)).join(', ')}. Remove it from there first.` });
  await query('update supplies set deleted_at = now() where id = $1', [id]);
  res.json({ ok: true });
});

suppliesRouter.get('/supplies/deleted', async (req, res) => {
  const { rows } = await query('select id, name, unit, unit_cost, deleted_at from supplies where store_id = $1 and deleted_at is not null order by deleted_at desc', [req.storeId]);
  res.json(rows);
});

suppliesRouter.post('/supplies/:id/restore', async (req, res) => {
  const s = (await query('select * from supplies where id = $1 and store_id = $2 and deleted_at is not null', [Number(req.params.id), req.storeId])).rows[0];
  if (!s) return res.status(404).json({ error: 'That supply is not in the deleted list' });
  if ((await query('select 1 from supplies where store_id = $1 and deleted_at is null and lower(name) = lower($2)', [req.storeId, s.name])).rowCount) {
    return res.status(400).json({ error: `You already have a supply called "${s.name}". Delete or rename that one first.` });
  }
  await query('update supplies set deleted_at = null where id = $1', [s.id]);
  res.json({ id: s.id });
});

suppliesRouter.post('/supplies/:id/purchase', async (req, res) => {
  const id = Number(req.params.id);
  const qty = Number(req.body.qty ?? 0);
  const unitCost = req.body.unit_cost === undefined ? undefined : Number(req.body.unit_cost);
  if (!Number.isFinite(qty) || qty < 0 || (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0))) {
    return res.status(400).json({ error: 'qty and unit_cost must be non-negative numbers' });
  }
  res.json(await applySupplyChange(req.storeId, id, { unitCost, addQty: qty, source: req.body.source || 'manual' }));
});

suppliesRouter.get('/changes', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 365);
  const changes = await recentChanges(req.storeId, days);
  const { rows } = await query(
    `select count(distinct r.product_id)::int as n from recipe_items r
      where r.supply_id = any($1::int[])`,
    [changes.map((c) => c.supply_id)],
  );
  res.json({ changes, products_affected: rows[0].n });
});

// Restore the cost a change replaced.
suppliesRouter.post('/changes/:id/undo', async (req, res) => {
  const { rows } = await query(
    `select c.* from price_changes c join supplies s on s.id = c.supply_id
      where c.id = $1 and s.store_id = $2 and s.deleted_at is null and not c.undone`,
    [Number(req.params.id), req.storeId],
  );
  const change = rows[0];
  if (!change) return res.status(404).json({ error: 'Change not found or already undone' });
  const result = await applySupplyChange(req.storeId, change.supply_id, { unitCost: change.old_cost, source: 'undo' });
  await query('update price_changes set undone = true where id in ($1, $2)', [change.id, result.change_id ?? change.id]);
  res.json(result);
});
