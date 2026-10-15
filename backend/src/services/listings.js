import { query } from '../db.js';
import { ingredientCost, listingBreakdown, stockValue } from '../engine/cost.js';

export async function loadSupplies() {
  const { rows } = await query('select * from supplies order by id');
  return rows;
}

export async function loadProducts() {
  const [{ rows: products }, { rows: items }] = await Promise.all([
    query('select * from products order by id'),
    query('select * from recipe_items order by product_id, supply_id'),
  ]);
  return products.map((p) => ({ ...p, recipe: items.filter((i) => i.product_id === p.id) }));
}

export async function loadShops() {
  const { rows } = await query('select * from shops order by id');
  return rows;
}

export async function loadListingsRaw() {
  const { rows } = await query('select * from listings order by id');
  return rows;
}

// Every listing with its full engine breakdown. `overrides` is an optional what-if map.
export async function computeListings({ overrides = {}, supplies, products, shops, listings } = {}) {
  supplies ||= await loadSupplies();
  products ||= await loadProducts();
  shops ||= await loadShops();
  listings ||= await loadListingsRaw();
  return listings.map((l) => {
    const product = products.find((p) => p.id === l.product_id);
    const shop = shops.find((s) => s.id === l.shop_id);
    const ing = ingredientCost(product.recipe, supplies, overrides);
    return {
      id: l.id,
      shop_id: shop.id,
      shop_name: shop.name,
      product_id: product.id,
      product_name: product.name,
      product_name_th: product.name_th,
      pieces: product.pieces,
      ...listingBreakdown({ price: l.price, ingredientCost: ing, shop, ads: l.ads_per_order, wear: l.wear_per_order }),
    };
  });
}

export function supplyView(s) {
  const changePct = s.prev_unit_cost ? ((s.unit_cost - s.prev_unit_cost) / s.prev_unit_cost) * 100 : 0;
  return {
    ...s,
    stock_value: s.qty * s.unit_cost,
    change_pct: changePct,
    low: s.qty <= s.low_stock_at,
  };
}

export function supplyKpis(supplies, changes7d) {
  return {
    items: supplies.length,
    stock_value: stockValue(supplies),
    low_count: supplies.filter((s) => s.qty <= s.low_stock_at).length,
    price_ups: changes7d.filter((c) => c.new_cost > c.old_cost).length,
  };
}

export async function recentChanges(days = 7) {
  const { rows } = await query(
    `select c.*, s.name as supply_name, s.unit
       from price_changes c join supplies s on s.id = c.supply_id
      where c.created_at > now() - ($1 || ' days')::interval and not c.undone
      order by c.created_at desc`,
    [String(days)],
  );
  return rows.map((c) => ({
    ...c,
    change_pct: c.old_cost ? ((c.new_cost - c.old_cost) / c.old_cost) * 100 : 0,
  }));
}

// Engine breakdown of one listing at a chosen selling price (used when logging a sale).
export async function breakdownAt(listingId, price) {
  const [supplies, products, shops, listings] = await Promise.all([loadSupplies(), loadProducts(), loadShops(), loadListingsRaw()]);
  const listing = listings.find((l) => l.id === listingId);
  if (!listing) return null;
  const product = products.find((p) => p.id === listing.product_id);
  const shop = shops.find((s) => s.id === listing.shop_id);
  const ing = ingredientCost(product.recipe, supplies);
  const unitPrice = price ?? listing.price;
  return {
    listing,
    product,
    shop,
    breakdown: listingBreakdown({ price: unitPrice, ingredientCost: ing, shop, ads: listing.ads_per_order, wear: listing.wear_per_order }),
  };
}
