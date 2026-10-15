import { query } from '../db.js';
import { HttpError } from '../http.js';
import { computeListings, loadProducts, loadShops, loadListingsRaw, loadSupplies } from './listings.js';

// Updates a supply's unit cost (and optionally adds stock), logs it, and returns the
// before/after impact on every listing that uses the supply. Numbers come from the engine.
export async function applySupplyChange(storeId, supplyId, { unitCost, addQty = 0, source = 'manual' }) {
  const [products, shops, listings, supplies] = await Promise.all([loadProducts(storeId), loadShops(storeId), loadListingsRaw(storeId), loadSupplies(storeId)]);
  const supply = supplies.find((s) => s.id === supplyId);
  if (!supply) throw new HttpError(404, 'Supply not found');

  const old = supply.unit_cost;
  const newCost = unitCost ?? old;
  const before = await computeListings({ overrides: { [supplyId]: old }, supplies, products, shops, listings });

  await query('update supplies set unit_cost = $1, prev_unit_cost = $2, qty = qty + $3 where id = $4', [
    newCost,
    newCost !== old ? old : supply.prev_unit_cost,
    addQty,
    supplyId,
  ]);
  let changeId = null;
  if (newCost !== old) {
    const { rows } = await query(
      'insert into price_changes (supply_id, old_cost, new_cost, source) values ($1,$2,$3,$4) returning id',
      [supplyId, old, newCost, source],
    );
    changeId = rows[0].id;
  }

  const fresh = await loadSupplies(storeId);
  const after = await computeListings({ supplies: fresh, products, shops, listings });
  const usingIds = new Set(
    products.filter((p) => p.recipe.some((r) => r.supply_id === supplyId)).map((p) => p.id),
  );

  const impacts = [];
  const seenProducts = new Set();
  for (const a of after.filter((l) => usingIds.has(l.product_id))) {
    const b = before.find((x) => x.id === a.id);
    if (!seenProducts.has(a.product_id)) {
      seenProducts.add(a.product_id);
      impacts.push({ kind: 'ingredient', product: a.product_name, before: b.ingredientCost, after: a.ingredientCost });
    }
    impacts.push({
      kind: 'margin',
      product: a.product_name,
      shop: a.shop_name,
      before: b.margin,
      after: a.margin,
      status_before: b.status,
      status_after: a.status,
    });
  }

  return {
    change_id: changeId,
    supply: { id: supply.id, name: supply.name, unit: supply.unit, old_cost: old, new_cost: newCost },
    impacts,
  };
}
