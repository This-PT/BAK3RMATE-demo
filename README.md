# BAK3RMATE

An AI back office for small online sellers. It shows what each product **really** earns after ingredients, platform fees, ads and equipment wear, and keeps that number up to date whenever a price changes.

> "You think you make 44.1% on the brownie box. You actually make 13.7%."

**The one design rule:** the AI reads and talks, plain code does the math. The assistant turns messy Thai or English chat into structured actions and turns results back into plain language. Every cost, margin and price comes from a small, tested, deterministic engine ([`backend/src/engine/cost.js`](backend/src/engine/cost.js)), never from the AI.

## What it does

| Page | |
|---|---|
| **AI Assistant** | Chat or talk in Thai or English: "ช็อกโกแลตขึ้นกิโลละ 450" updates the price and shows the impact on every product. Replies can be read aloud. Works offline for the demo phrases. |
| **Cost Breakdown** | A recipe per product, priced from your supplies. Edit any price as a what-if before saving. |
| **Supply** | Ingredients and materials: stock, latest price, change since last purchase, low-stock flags. |
| **Shops** | One shop per sales channel (Shopee, TikTok Shop, Lazada, LINE, on-site) with that platform's real fees, all editable. Each product shows "what you think you make" vs "what you actually make", and its break-even price. |
| **Sold Log** | A daily record of what you sold. Each sale freezes its true cost, so later price changes never rewrite history. |
| **Dashboard** | Which products lose money or run thin, plus an Excel export: today's prices per shop, then the sold log with a daily summary. |

Also: several **stores** (businesses) per account, **login** with email + password or Google, and nothing is ever deleted for good (see below).

## Run it

You need [Docker](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env        # every key in it is optional
docker compose up --build
# open http://localhost:8080 and choose "Create account"
```

The first account to sign up takes over the demo data. Without any API keys everything works except the real AI and voice: the assistant falls back to a rule-based parser for the demo phrases.

Reset the demo data: `docker compose down -v && docker compose up --build`. **Careful:** `down -v` also deletes your local database.

## Where your data lives

**The live site does not share a database with your computer. It uses its own database on [Neon](https://neon.com).** Your local copy and the live site are two separate databases that never sync.

```
 Your computer (development)                 The live site (deployment)

 browser                                     browser
    │                                           │
 docker compose                              Google Cloud Run  (one container)
 ├─ web + API                                    │
 └─ Postgres container ── Docker volume          └─ Neon  (hosted PostgreSQL)

            two separate databases: changing one never changes the other
```

| | Local development | Live site (the deploy model) |
|---|---|---|
| Runs on | `docker compose up` on your computer | Google Cloud Run, pay-per-use ([guide](DEPLOY-CLOUDRUN.md)) |
| **Database** | A Postgres container, saved in a Docker volume (`pgdata`) on your machine | **Neon** (serverless PostgreSQL), set through `DATABASE_URL` |
| Starts with | The demo bakery (the first account to sign up takes it over) | An empty database; the app creates its own tables on first start |
| Back up with | `./scripts/backup.sh` | `DATABASE_URL=… ./scripts/backup-remote.sh`, plus Neon's own restore options |

Anything you type into the live site is saved in Neon only, and anything you do locally stays on your computer. To copy your local data to Neon once, follow step 2 of [DEPLOY-CLOUDRUN.md](DEPLOY-CLOUDRUN.md).

Prefer a rented server instead of Cloud Run? [DEPLOY.md](DEPLOY.md) puts Postgres in a container on that server, with its own separate data again.

## Settings (`.env`)

| Setting | What it is |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Real AI chat and speech-to-text. Optional. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Spoken replies. Optional (the browser's voice is the fallback). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google". Optional, see below. |
| `DATABASE_URL` | Where the database is. Docker Compose sets it for you locally. On the live site it is the **Neon** connection string, set in `env.cloudrun.yaml`. |
| `PUBLIC_URL` | The address people open the app at, e.g. `http://localhost:8080`. |
| `ADMIN_EMAIL` | Only this email can take over data that existed before accounts. Set it on any public server. |
| `TRUST_PROXY_HOPS` | How many proxies sit in front of the app (see the deploy guides). |
| `DOMAIN`, `POSTGRES_PASSWORD` | Only for a public server ([DEPLOY.md](DEPLOY.md)). |
| `SEED_DEMO_DATA`, `PG_POOL_MAX` | Only for the one-container version: add the sample bakery to a brand-new empty database, and the size of the connection pool. |

### Log in with Google (optional)

1. In [Google Cloud Console](https://console.cloud.google.com) create a project, then **Google Auth Platform → Clients → Create client → Web application**.
2. Under **Authorized redirect URIs** add `http://localhost:8080/api/auth/google/callback` (and `https://your-address/api/auth/google/callback` once it is online).
3. Put the client ID and secret in `.env`, then `docker compose up -d --force-recreate backend`.
4. While the Google app is in "Testing", add the Gmail addresses that may sign in under **Audience → Test users**, or click **Publish app**.

## How it fits together

```
kumtun/
├── backend/                 Node 20 + Express + PostgreSQL
│   ├── db/                  schema and demo data (SQL)
│   ├── src/
│   │   ├── engine/cost.js   the cost math: pure functions, no I/O
│   │   ├── ai/              chat tools, language handling, offline fallback
│   │   ├── auth/            password hashing, sessions, Google sign-in, rate limits
│   │   ├── routes/          the HTTP API
│   │   ├── services/        loading data and running the engine
│   │   ├── presets.js       default fees per platform (Thailand, Aug 2026, VAT included)
│   │   └── sample.js        the sample bakery for new accounts
│   └── test/                engine tests, Google checks, multi-user and delete/restore tests
├── frontend/                React 18 + Vite
├── scripts/                 test-app.sh, backup.sh, backup-remote.sh
├── Dockerfile               the whole app as ONE container (for pay-per-use hosting)
├── docker-compose*.yml      local, production and test setups
├── Caddyfile                HTTPS for the production setup
└── DEPLOY*.md               how to put it online
```

- **Stores:** a store is one business. Supplies, products, recipes, shops, the sold log and price history belong to one store. The browser sends the open store in an `X-Store-Id` header, and the backend only accepts stores that belong to the logged-in person.
- **Accounts:** passwords are salted scrypt hashes. Sessions are random tokens in an HttpOnly cookie (only a hash is stored). Logins and AI calls are rate-limited. Not built yet: password reset and inviting staff into a store.
- **Deleting:** "Delete" and "Remove" only hide things (`deleted_at`). Each page has a "Deleted …" list with Restore. A supply used by any recipe, even a deleted product's, can't be deleted.

## Tests

```bash
cd backend && npm install && npm test     # cost engine and Google checks, no database needed
./scripts/test-app.sh                     # everything, on a throw-away copy of the app (own database, port 8081)
```

`test-app.sh` never touches your real data. Don't point the tests at your real app: nothing is deleted for good, so test data would pile up in its "Deleted" lists.

## Demo numbers (fresh install)

Shopee uses its real fees (16.05% commission + 3.21% payment + ฿1.07 per order), LINE only the 3.21% payment fee. Ads and wear are demo values.

| Shop | Product | Price | Ingredients | True cost | Profit | Margin | Think margin | Break-even | Status |
|------|---------|------:|------------:|----------:|-------:|-------:|-------------:|-----------:|--------|
| Shopee | Brownie box | 289 | 161.60 | 249.33 | 39.67 | 13.7% | 44.1% | 240 | Healthy |
| Shopee | Butter cookie jar | 159 | 58.00 | 108.69 | 50.31 | 31.6% | 63.5% | 97 | Healthy |
| Shopee | Matcha cake slice | 79 | 48.00 | 82.29 | −3.29 | −4.2% | 39.2% | 84 | Losing money |
| Shopee | Cheesecake cup | 99 | 62.50 | 106.64 | −7.64 | −7.7% | 36.9% | 109 | Losing money |
| LINE | Brownie box | 260 | 161.60 | 175.95 | 84.05 | 32.3% | 37.8% | 174 | Healthy |
| LINE | Butter cookie jar | 150 | 58.00 | 66.81 | 83.19 | 55.5% | 61.3% | 65 | Healthy |

Chocolate ฿400 → ฿450 moves the Shopee brownie margin from 17.2% to 13.7%. Joining Shopee's Xtra program (+8.56%) drops it to 5.2%.

## Putting it online

- **[DEPLOY-CLOUDRUN.md](DEPLOY-CLOUDRUN.md)**: the live setup: Google Cloud Run for the app and **Neon for the database** (separate from your local one). Pay-per-use, so it costs almost nothing while nobody is using it.
- **[DEPLOY.md](DEPLOY.md)**: a rented Linux server with automatic HTTPS (Caddy). Flat monthly price, no waking-up delay.
