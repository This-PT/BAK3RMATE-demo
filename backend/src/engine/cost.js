// Pure cost engine: no DB, no network, no Date.
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// recipe: [{ supply_id, amount }], supplies: [{ id, unit_cost }], overrides: { supply_id: unit_cost }
export function ingredientCost(recipe, supplies, overrides = {}) {
  const byId = new Map(supplies.map((s) => [Number(s.id), s]));
  let total = 0;
  for (const item of recipe) {
    const id = Number(item.supply_id);
    const supply = byId.get(id);
    if (!supply) continue;
    const override = overrides[id];
    const unitCost = override !== undefined && override !== null ? Number(override) : Number(supply.unit_cost);
    total += Number(item.amount) * unitCost;
  }
  return round6(total);
}

export function status(margin) {
  if (margin < 0) return 'losing';
  if (margin < 5) return 'thin';
  return 'healthy';
}

// shop: { commission_pct, transaction_pct, shipping_pct (optional program, e.g. Xtra / Premium),
//         extra_pct + extra_cap_per_item (growth / service fee, cap per item, null = no cap),
//         fixed_fee_per_order }
export function listingBreakdown({ price, ingredientCost: ing, shop, ads = 0, wear = 0 }) {
  price = Number(price);
  ads = Number(ads);
  wear = Number(wear);
  const commissionPct = Number(shop.commission_pct);
  const transactionPct = Number(shop.transaction_pct);
  const shippingPct = Number(shop.shipping_pct);
  const extraPct = Number(shop.extra_pct ?? 0);
  const cap = shop.extra_cap_per_item === null || shop.extra_cap_per_item === undefined ? null : Number(shop.extra_cap_per_item);
  const fixedFee = Number(shop.fixed_fee_per_order ?? 0);
  const pctTotal = commissionPct + transactionPct + shippingPct + extraPct;

  const commission = (price * commissionPct) / 100;
  const transaction = (price * transactionPct) / 100;
  const shipping = (price * shippingPct) / 100;
  const rawExtra = (price * extraPct) / 100;
  const extra = cap === null ? rawExtra : Math.min(rawExtra, cap);

  const trueCost = ing + commission + transaction + shipping + extra + fixedFee + ads + wear;
  const profit = price - trueCost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  const thinkProfit = price - ing;
  const thinkMargin = price > 0 ? (thinkProfit / price) * 100 : 0;

  // Smallest price that covers every cost. If the capped extra fee is already at its cap at that
  // price, solve again with the cap as a fixed amount.
  let breakEven = null;
  if (pctTotal < 100) {
    const base = ing + ads + wear + fixedFee;
    const raw = base / (1 - pctTotal / 100);
    if (cap !== null && (raw * extraPct) / 100 > cap) {
      const rest = pctTotal - extraPct;
      breakEven = rest < 100 ? Math.ceil(round6((base + cap) / (1 - rest / 100))) : null;
    } else {
      breakEven = Math.ceil(round6(raw));
    }
  }

  return {
    price,
    ingredientCost: ing,
    commission,
    transaction,
    shipping,
    extra,
    fixedFee,
    ads,
    wear,
    pctTotal,
    trueCost,
    profit,
    margin,
    thinkProfit,
    thinkMargin,
    breakEven,
    status: status(margin),
  };
}

export function stockValue(supplies) {
  return round6(supplies.reduce((sum, s) => sum + Number(s.qty) * Number(s.unit_cost), 0));
}
