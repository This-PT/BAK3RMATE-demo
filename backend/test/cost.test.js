import test from 'node:test';
import assert from 'node:assert/strict';
import { ingredientCost, listingBreakdown, stockValue, status } from '../src/engine/cost.js';

const supplies = [
  { id: 1, name: 'Dark chocolate', qty: 2.4, unit_cost: 450 },
  { id: 2, name: 'Butter', qty: 1.8, unit_cost: 320 },
  { id: 3, name: 'Sugar', qty: 5, unit_cost: 30 },
  { id: 4, name: 'Cake flour', qty: 3.2, unit_cost: 40 },
  { id: 5, name: 'Eggs', qty: 42, unit_cost: 4.5 },
  { id: 6, name: 'Cream cheese', qty: 0.6, unit_cost: 380 },
  { id: 7, name: 'Matcha powder', qty: 0.15, unit_cost: 1200 },
  { id: 8, name: 'Box + label', qty: 85, unit_cost: 12 },
];

const r = (supply_id, amount) => ({ supply_id, amount });
const recipes = {
  brownie: [r(1, 0.2), r(2, 0.12), r(3, 0.15), r(4, 0.08), r(5, 3), r(8, 1)],
  cookie: [r(2, 0.1), r(4, 0.2), r(3, 0.05), r(5, 1), r(8, 1)],
  matcha: [r(4, 0.05), r(2, 0.05), r(3, 0.05), r(5, 1), r(7, 0.01), r(8, 1)],
  cheesecake: [r(6, 0.1), r(2, 0.025), r(5, 1), r(8, 1)],
};

const shopee = { commission_pct: 8, transaction_pct: 3, shipping_pct: 4 };
const line = { commission_pct: 0, transaction_pct: 0, shipping_pct: 0 };

// Original spec demo fees (Shopee 8% + 3% + 4%), kept as explicit fixtures. The app now seeds real fees (see README).
// shop, product, price, ingredients, ads, wear, trueCost, profit, margin, thinkMargin, breakEven, status
const rows = [
  [shopee, 'brownie', 289, 161.6, 25, 6, 235.95, 53.05, 18.4, 44.1, 227, 'healthy'],
  [shopee, 'cookie', 159, 58.0, 15, 4, 100.85, 58.15, 36.6, 63.5, 91, 'healthy'],
  [shopee, 'matcha', 79, 48.0, 15, 3, 77.85, 1.15, 1.5, 39.2, 78, 'thin'],
  [shopee, 'cheesecake', 99, 62.5, 20, 4, 101.35, -2.35, -2.4, 36.9, 102, 'losing'],
  [line, 'brownie', 260, 161.6, 0, 6, 167.6, 92.4, 35.5, 37.8, 168, 'healthy'],
  [line, 'cookie', 150, 58.0, 0, 4, 62.0, 88.0, 58.7, 61.3, 62, 'healthy'],
];

for (const [shop, product, price, ing, ads, wear, trueCost, profit, margin, think, be, st] of rows) {
  test(`${shop === shopee ? 'Shopee' : 'LINE'} / ${product}`, () => {
    const cost = ingredientCost(recipes[product], supplies);
    assert.equal(cost.toFixed(2), ing.toFixed(2));
    const b = listingBreakdown({ price, ingredientCost: cost, shop, ads, wear });
    assert.equal(b.trueCost.toFixed(2), trueCost.toFixed(2));
    assert.equal(b.profit.toFixed(2), profit.toFixed(2));
    assert.equal(b.margin.toFixed(1), margin.toFixed(1));
    assert.equal(b.thinkMargin.toFixed(1), think.toFixed(1));
    assert.equal(b.breakEven, be);
    assert.equal(b.status, st);
  });
}

test('stock value is 3551', () => {
  assert.equal(stockValue(supplies).toFixed(2), '3551.00');
});

test('chocolate 400 -> 450 moves brownie 151.60 -> 161.60 and Shopee margin 21.8% -> 18.4%', () => {
  const before = ingredientCost(recipes.brownie, supplies, { 1: 400 });
  const after = ingredientCost(recipes.brownie, supplies);
  assert.equal(before.toFixed(2), '151.60');
  assert.equal(after.toFixed(2), '161.60');
  const mb = listingBreakdown({ price: 289, ingredientCost: before, shop: shopee, ads: 25, wear: 6 }).margin;
  const ma = listingBreakdown({ price: 289, ingredientCost: after, shop: shopee, ads: 25, wear: 6 }).margin;
  assert.equal(mb.toFixed(1), '21.8');
  assert.equal(ma.toFixed(1), '18.4');
});

test('overrides do not mutate supplies', () => {
  ingredientCost(recipes.brownie, supplies, { 1: 1 });
  assert.equal(supplies[0].unit_cost, 450);
});

test('break-even is null when fees reach 100%', () => {
  const b = listingBreakdown({ price: 100, ingredientCost: 10, shop: { commission_pct: 60, transaction_pct: 30, shipping_pct: 10 } });
  assert.equal(b.breakEven, null);
});

test('status thresholds', () => {
  assert.equal(status(-0.01), 'losing');
  assert.equal(status(0), 'thin');
  assert.equal(status(4.99), 'thin');
  assert.equal(status(5), 'healthy');
});

// Real Thai platform fees (Aug 2026, VAT included, from the platforms' seller-center pages), Brownie box at 289, ingredients 161.60.
const platforms = {
  line: { commission_pct: 0, transaction_pct: 3.21, shipping_pct: 0 },
  lineShopping: { commission_pct: 0, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 3.21 },
  lazada: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 0 },
  shopee: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 0, fixed_fee_per_order: 1.07 },
  tiktok: { commission_pct: 10.7, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 8.03, extra_cap_per_item: 199, fixed_fee_per_order: 1.07 },
  lazadaPremium: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 8.56 },
  shopeeXtra: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 8.56, fixed_fee_per_order: 1.07 },
};
// platform, total fees, left after ingredients (a worked example: Brownie box at 289)
const worked = [
  ['line', 9.28, 118.12],
  ['lineShopping', 18.56, 108.84],
  ['lazada', 55.66, 71.74],
  ['shopee', 56.73, 70.67],
  ['tiktok', 64.48, 62.92],
  ['lazadaPremium', 80.4, 47.0],
  ['shopeeXtra', 81.47, 45.93],
];
for (const [name, fees, left] of worked) {
  test(`platform fee worked example: ${name}`, () => {
    const b = listingBreakdown({ price: 289, ingredientCost: 161.6, shop: platforms[name] });
    const totalFees = b.commission + b.transaction + b.shipping + b.extra + b.fixedFee;
    // the published worked example rounds each fee line to a satang before adding; the engine rounds only for display
    assert.ok(Math.abs(totalFees - fees) <= 0.011, `fees ${totalFees} vs ${fees}`);
    assert.ok(Math.abs(289 - totalFees - 161.6 - left) <= 0.011, `left ${289 - totalFees - 161.6} vs ${left}`);
  });
}

test('TikTok growth fee is capped at 199 per item', () => {
  const b = listingBreakdown({ price: 3000, ingredientCost: 1000, shop: platforms.tiktok });
  assert.equal(b.extra, 199);
});

test('break-even includes the flat fee, and covers every cost', () => {
  const b = listingBreakdown({ price: 100, ingredientCost: 50, shop: platforms.shopee, ads: 5, wear: 3 });
  const at = listingBreakdown({ price: b.breakEven, ingredientCost: 50, shop: platforms.shopee, ads: 5, wear: 3 });
  const below = listingBreakdown({ price: b.breakEven - 1, ingredientCost: 50, shop: platforms.shopee, ads: 5, wear: 3 });
  assert.ok(at.profit >= 0);
  assert.ok(below.profit < 0);
});

test('break-even is right when the capped fee is at its cap', () => {
  const b = listingBreakdown({ price: 5000, ingredientCost: 2000, shop: platforms.tiktok });
  const at = listingBreakdown({ price: b.breakEven, ingredientCost: 2000, shop: platforms.tiktok });
  const below = listingBreakdown({ price: b.breakEven - 1, ingredientCost: 2000, shop: platforms.tiktok });
  assert.ok(at.profit >= 0);
  assert.ok(below.profit < 0);
});
