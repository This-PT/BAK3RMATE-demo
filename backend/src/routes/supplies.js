import { Router } from 'express';
import { loadSupplies, supplyView, supplyKpis, recentChanges } from '../services/listings.js';
import { applySupplyChange } from '../services/supplies.js';
import { query } from '../db.js';

export const suppliesRouter = Router();

suppliesRouter.get('/supplies', async (_req, res) => {
  const supplies = await loadSupplies();
  const changes = await recentChanges(7);
  res.json({ supplies: supplies.map(supplyView), kpis: supplyKpis(supplies, changes) });
});

suppliesRouter.post('/supplies/:id/purchase', async (req, res) => {
  const id = Number(req.params.id);
  const qty = Number(req.body.qty ?? 0);
  const unitCost = req.body.unit_cost === undefined ? undefined : Number(req.body.unit_cost);
  if (!Number.isFinite(qty) || qty < 0 || (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0))) {
    return res.status(400).json({ error: 'qty and unit_cost must be non-negative numbers' });
  }
  res.json(await applySupplyChange(id, { unitCost, addQty: qty, source: req.body.source || 'manual' }));
});

suppliesRouter.get('/changes', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 365);
  const changes = await recentChanges(days);
  const { rows } = await query(
    `select count(distinct r.product_id)::int as n from recipe_items r
      where r.supply_id = any($1::int[])`,
    [changes.map((c) => c.supply_id)],
  );
  res.json({ changes, products_affected: rows[0].n });
});

// Restore the cost a change replaced.
suppliesRouter.post('/changes/:id/undo', async (req, res) => {
  const { rows } = await query('select * from price_changes where id = $1 and not undone', [Number(req.params.id)]);
  const change = rows[0];
  if (!change) return res.status(404).json({ error: 'Change not found or already undone' });
  const result = await applySupplyChange(change.supply_id, { unitCost: change.old_cost, source: 'undo' });
  await query('update price_changes set undone = true where id in ($1, $2)', [change.id, result.change_id ?? change.id]);
  res.json(result);
});
