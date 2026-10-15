// Default fees per platform for a regular (non-Mall) food seller in Thailand, Aug 2026, VAT included.
// Source: shop-fee.md. Every rate stays editable in the app.
export const PRESETS = [
  {
    key: 'shopee',
    platform: 'Shopee',
    name: 'Shopee',
    summary: 'Commission on food, payment fee and a flat fee per order.',
    note: 'Rates from 4 Aug 2026. Small shops (฿10,000 or less in 30 days) may get 0.5–1.5 points off commission.',
    fees: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 1.07 },
  },
  {
    key: 'shopee-xtra',
    platform: 'Shopee',
    name: 'Shopee + Xtra program',
    summary: 'Shopee plus the free-shipping / voucher program.',
    note: 'Xtra is 8.56% for food, charged once even if you join both programs.',
    fees: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 8.56, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 1.07 },
  },
  {
    key: 'tiktok',
    platform: 'TikTok Shop',
    name: 'TikTok Shop',
    summary: 'Commission, payment fee, Growth Fee (capped at ฿199 per item) and a flat fee.',
    note: 'Growth Fee is not refunded if an order is returned. Sources disagree on the exact rates, so this uses the safer, higher numbers.',
    fees: { commission_pct: 10.7, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 8.03, extra_cap_per_item: 199, fixed_fee_per_order: 1.07 },
  },
  {
    key: 'lazada',
    platform: 'Lazada',
    name: 'Lazada',
    summary: 'Commission on food and a payment fee. No platform or growth fee.',
    note: 'Rates from 1 Aug 2026.',
    fees: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
  {
    key: 'lazada-premium',
    platform: 'Lazada',
    name: 'Lazada + Premium Package',
    summary: 'Lazada plus free shipping and vouchers.',
    note: 'Premium Package is 8.56% of the selling price.',
    fees: { commission_pct: 16.05, transaction_pct: 3.21, shipping_pct: 8.56, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
  {
    key: 'line',
    platform: 'LINE',
    name: 'LINE MyShop (own link or chat)',
    summary: 'Only the payment fee. No commission, no monthly fee.',
    note: 'Orders from your own shop link or chat pay no service fee. New shops pay 0% payment fee for the first 30 days.',
    fees: { commission_pct: 0, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
  {
    key: 'line-shopping',
    platform: 'LINE',
    name: 'LINE MyShop (via LINE SHOPPING)',
    summary: 'Payment fee plus the LINE SHOPPING service fee.',
    note: 'The service fee only applies to orders that come from LINE SHOPPING channels or campaigns.',
    fees: { commission_pct: 0, transaction_pct: 3.21, shipping_pct: 0, extra_pct: 3.21, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
  {
    key: 'onsite',
    platform: 'On-site',
    name: 'On-site selling',
    summary: 'Selling in person: market stall, pop-up, walk-in or your own storefront. No platform fees.',
    note: 'No platform fees. Edit the rates if you pay a card or QR fee.',
    fees: { commission_pct: 0, transaction_pct: 0, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
  {
    key: 'custom',
    platform: 'Custom',
    name: 'Other shop',
    summary: 'Start with no fees and type your own rates.',
    note: '',
    fees: { commission_pct: 0, transaction_pct: 0, shipping_pct: 0, extra_pct: 0, extra_cap_per_item: null, fixed_fee_per_order: 0 },
  },
];

export const presetByKey = (key) => PRESETS.find((p) => p.key === key);
