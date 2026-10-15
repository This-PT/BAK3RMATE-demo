# Kumtun (คุ้มทุน)

AI back office that shows small online sellers what each product really earns after ingredients, platform fees, ads and equipment wear. Spec: `../project_system.md`.

```bash
cp .env.example .env     # keys are optional: the offline parser handles the demo without them
docker compose up --build
# open http://localhost:8080
```

- Tests: `cd backend && npm install && npm test`
- Local dev: `docker compose up db`, then `npm run dev` in `backend/` and `frontend/` (Vite proxies `/api` to :4000)
- Reset demo data: `docker compose down -v && docker compose up --build`

## Demo numbers (fresh install)

Shopee and LINE are seeded with the real fees from `shop-fee.md` (regular food seller, Thailand, Aug 2026, VAT included): Shopee 16.05% commission + 3.21% payment + ฿1.07 per order, LINE 3.21% payment only. Ads and wear are the demo values from `project_system.md`.

| Shop | Product | Price | Ingredients | True cost | Profit | Margin | Think margin | Break-even | Status |
|------|---------|------:|------------:|----------:|-------:|-------:|-------------:|-----------:|--------|
| Shopee | Brownie box | 289 | 161.60 | 249.33 | 39.67 | 13.7% | 44.1% | 240 | Healthy |
| Shopee | Butter cookie jar | 159 | 58.00 | 108.69 | 50.31 | 31.6% | 63.5% | 97 | Healthy |
| Shopee | Matcha cake slice | 79 | 48.00 | 82.29 | −3.29 | −4.2% | 39.2% | 84 | Losing money |
| Shopee | Cheesecake cup | 99 | 62.50 | 106.64 | −7.64 | −7.7% | 36.9% | 109 | Losing money |
| LINE | Brownie box | 260 | 161.60 | 175.95 | 84.05 | 32.3% | 37.8% | 174 | Healthy |
| LINE | Butter cookie jar | 150 | 58.00 | 66.81 | 83.19 | 55.5% | 61.3% | 65 | Healthy |

- Pitch: "You think you make 44.1% on the brownie box. You actually make 13.7%."
- Chocolate ฿400 → ฿450 moves the Shopee brownie margin 17.2% → 13.7%.
- Joining Shopee's Xtra program (+8.56%) drops the brownie box to 5.2% margin.
- `backend/test/cost.test.js` still checks the older flat-rate demo fees from the spec (8% / 3% / 4%) with explicit fee values, plus every worked example in `shop-fee.md`.
# KUMTON-demo
