import { Router } from 'express';
import { loadProducts, loadSupplies, loadShops, loadListingsRaw, computeListings } from '../services/listings.js';
import { ingredientCost } from '../engine/cost.js';

export const productsRouter = Router();

productsRouter.get('/products', async (_req, res) => {
  const [products, supplies] = await Promise.all([loadProducts(), loadSupplies()]);
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

// What-if: nothing is saved.
productsRouter.post('/products/:id/preview', async (req, res) => {
  const id = Number(req.params.id);
  const overrides = {};
  for (const [k, v] of Object.entries(req.body.overrides || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) overrides[Number(k)] = n;
  }
  const [products, supplies, shops, listings] = await Promise.all([
    loadProducts(),
    loadSupplies(),
    loadShops(),
    loadListingsRaw(),
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
