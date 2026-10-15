import { loadSupplies, loadProducts, computeListings } from '../services/listings.js';
import { applySupplyChange } from '../services/supplies.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '');

// Extra spoken names, keyed by the lowercase English name so they work in any store that uses that name.
const SUPPLY_ALIASES = {
  'dark chocolate': ['chocolate', 'choc', 'ช็อคโกแลต', 'ช็อกโกแลต', 'ช็อกโกเลต', 'ดาร์กช็อก'],
  butter: ['เนย'],
  sugar: ['น้ำตาล'],
  'cake flour': ['flour', 'แป้ง', 'แป้งเค้ก'],
  eggs: ['egg', 'ไข่', 'ไข่ไก่'],
  'cream cheese': ['creamcheese', 'cheese', 'ครีมชีส'],
  'matcha powder': ['matcha', 'มัทฉะ', 'มัจฉะ', 'ชาเขียว'],
  'box + label': ['box', 'กล่อง'],
};
const PRODUCT_ALIASES = {
  'brownie box (6 pcs)': ['brownie', 'บราวนี่'],
  'butter cookie jar': ['cookie', 'คุกกี้'],
  'matcha cake slice': ['matcha', 'มัทฉะ', 'มัจฉะ', 'เค้กชาเขียว'],
  'cheesecake cup': ['cheesecake', 'cheese cake', 'ชีสเค้ก'],
};

function findIn(items, aliases, text) {
  const t = norm(text);
  if (!t) return null;
  let best = null;
  for (const it of items) {
    const names = [it.name, it.name_th, ...(aliases[String(it.name).toLowerCase()] || [])].filter(Boolean).map(norm);
    for (const n of names) {
      if (t.includes(n) || n.includes(t)) {
        if (!best || n.length > best.len) best = { item: it, len: n.length };
      }
    }
  }
  return best?.item ?? null;
}

export const findSupply = (supplies, text) => findIn(supplies, SUPPLY_ALIASES, text);
export const findProduct = (products, text) => findIn(products, PRODUCT_ALIASES, text);

export const toolSchemas = [
  {
    type: 'function',
    function: {
      name: 'update_supply_price',
      description: 'Set the latest unit price of a supply (ingredient/material) and see the impact on products.',
      parameters: {
        type: 'object',
        properties: {
          supply: { type: 'string', description: 'Supply name in English or Thai' },
          unit_cost: { type: 'number', description: 'New price in THB per unit' },
          unit: { type: 'string', description: 'kg or pc' },
        },
        required: ['supply', 'unit_cost'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_profit',
      description: 'Get the true cost, profit, margin and break-even of a product, optionally for one shop.',
      parameters: {
        type: 'object',
        properties: { product: { type: 'string' }, shop: { type: 'string' } },
        required: ['product'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_problem_products',
      description: 'List products that are losing money or have a thin margin.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_purchase',
      description: 'Record a purchase: add stock and set the latest unit price.',
      parameters: {
        type: 'object',
        properties: { supply: { type: 'string' }, qty: { type: 'number' }, unit_cost: { type: 'number' } },
        required: ['supply', 'qty', 'unit_cost'],
      },
    },
  },
];

const slim = (l) => ({
  product: l.product_name,
  shop: l.shop_name,
  price: l.price,
  ingredient_cost: l.ingredientCost,
  platform_fees: l.commission + l.transaction + l.shipping + l.extra + l.fixedFee,
  ads: l.ads,
  wear: l.wear,
  true_cost: l.trueCost,
  profit: l.profit,
  margin_pct: l.margin,
  break_even: l.breakEven,
  status: l.status,
});

// Handlers return { result, impacts?, change_id? }. `result` goes back to the LLM verbatim.
export const handlers = {
  async update_supply_price(storeId, { supply, unit_cost }) {
    const supplies = await loadSupplies(storeId);
    const s = findSupply(supplies, supply);
    if (!s) return { result: { error: `Unknown supply "${supply}"`, known: supplies.map((x) => x.name) } };
    const r = await applySupplyChange(storeId, s.id, { unitCost: Number(unit_cost), source: 'chat' });
    return { result: r, impacts: r.impacts, change_id: r.change_id };
  },
  async get_product_profit(storeId, { product, shop }) {
    const products = await loadProducts(storeId);
    const p = findProduct(products, product);
    if (!p) return { result: { error: `Unknown product "${product}"`, known: products.map((x) => x.name) } };
    let rows = (await computeListings({ storeId })).filter((l) => l.product_id === p.id);
    if (shop) {
      const t = norm(shop);
      const f = rows.filter((l) => norm(l.shop_name).includes(t) || t.includes(norm(l.shop_name).replace('shop', '')));
      if (f.length) rows = f;
    }
    return { result: { listings: rows.map(slim) } };
  },
  async list_problem_products(storeId) {
    const rows = (await computeListings({ storeId })).filter((l) => l.status !== 'healthy');
    return { result: { listings: rows.map(slim) } };
  },
  async add_purchase(storeId, { supply, qty, unit_cost }) {
    const supplies = await loadSupplies(storeId);
    const s = findSupply(supplies, supply);
    if (!s) return { result: { error: `Unknown supply "${supply}"`, known: supplies.map((x) => x.name) } };
    const r = await applySupplyChange(storeId, s.id, { unitCost: Number(unit_cost), addQty: Number(qty), source: 'chat' });
    return { result: r, impacts: r.impacts, change_id: r.change_id };
  },
};
