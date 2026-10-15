import { Router } from 'express';
import { query } from '../db.js';
import { breakdownAt } from '../services/listings.js';
import { fetchDeletedSales, fetchSales, validDate, withMoney } from '../services/sales.js';

export const salesRouter = Router();

// All sales (optionally from/to inclusive), grouped by day, newest first.
salesRouter.get('/sales', async (req, res) => {
  const { from, to } = req.query;
  if ((from && !validDate(from)) || (to && !validDate(to))) return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
  const { totals, days } = await fetchSales({ storeId: req.storeId, from: from || null, to: to || null });
  res.json({ totals, days });
});

salesRouter.post('/sales', async (req, res) => {
  const listingId = Number(req.body.listing_id);
  const qty = Number(req.body.qty ?? 1);
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) return res.status(400).json({ error: 'Quantity must be a whole number from 1 to 100000' });
  const price = req.body.unit_price === undefined || req.body.unit_price === '' ? null : Number(req.body.unit_price);
  if (price !== null && (!Number.isFinite(price) || price <= 0)) return res.status(400).json({ error: 'Selling price must be more than 0' });
  if (req.body.sold_on !== undefined && !validDate(req.body.sold_on)) return res.status(400).json({ error: 'Date must be YYYY-MM-DD' });

  const found = await breakdownAt(req.storeId, listingId, price);
  if (!found) return res.status(404).json({ error: 'That product is not sold in that shop' });
  const { listing, product, shop, breakdown } = found;
  const { rows } = await query(
    `insert into sales (store_id, sold_on, listing_id, shop_name, product_name, qty, unit_price, unit_cost)
     values ($8, coalesce($1::date, (now() at time zone 'Asia/Bangkok')::date), $2, $3, $4, $5, $6, $7) returning *`,
    [req.body.sold_on ?? null, listing.id, shop.name, product.name, qty, breakdown.price, breakdown.trueCost, req.storeId],
  );
  res.status(201).json(withMoney(rows[0]));
});

// "Delete" hides the sale from the log and the totals; it can be restored.
salesRouter.delete('/sales/:id', async (req, res) => {
  const del = await query('update sales set deleted_at = now() where id = $1 and store_id = $2 and deleted_at is null returning id', [Number(req.params.id), req.storeId]);
  if (!del.rows[0]) return res.status(404).json({ error: 'Sale not found' });
  res.json({ ok: true });
});

salesRouter.get('/sales/deleted', async (req, res) => {
  res.json(await fetchDeletedSales(req.storeId));
});

salesRouter.post('/sales/:id/restore', async (req, res) => {
  const r = await query('update sales set deleted_at = null where id = $1 and store_id = $2 and deleted_at is not null returning *', [Number(req.params.id), req.storeId]);
  if (!r.rows[0]) return res.status(404).json({ error: 'That sale is not in the deleted list' });
  res.json(withMoney(r.rows[0]));
});
