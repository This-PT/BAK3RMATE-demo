# Putting Kumtun online, pay-per-use (Google Cloud Run + Neon)

You pay for **visits, not for a machine**. When nobody is using the app it costs close to nothing, so the same accounts can hold your other projects too.

- **Google Cloud Run** runs the app. It starts when someone visits and sleeps when nobody does.
- **Neon** is the database (PostgreSQL). It also sleeps when idle, and has a free plan.

Prices and free allowances change, and I can't see them live. Check the two pricing pages before you rely on "free": https://cloud.google.com/run/pricing and https://neon.com/pricing.

> Tested here: the one-container build starts on a completely empty database and creates its tables by itself, serves the website and the API from one address, survives the database dropping every connection (what sleeping does), and passes the full test suite. Not tested: your real Google Cloud and Neon accounts.

**How long the first visit takes:** after a quiet period the first visit takes a few seconds, because the app and the database wake up. After that it's fast. If that bothers you, add `--min-instances 1` to the deploy command; the app then never sleeps, at a small constant cost.

---

## 1. Create the database (Neon)

1. Sign up at https://neon.com (no card needed for the free plan) and **create a project**. Pick the **Singapore** region (AWS `ap-southeast-1`).
2. On the project page click **Connect**. Turn **Connection pooling** ON and copy the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-something-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   Keep it private: it's the key to your data.

## 2. Move your current data across (optional, do this BEFORE the first deploy)

Skip this if you want to start fresh. The database must still be empty when you do it, so do it now.

From the `kumtun` folder on your computer:

```bash
export NEON_URL='paste the connection string here, in single quotes'
docker compose exec -T db pg_dump -U kumtun kumtun --no-owner --no-privileges > kumtun-local.sql
docker run --rm -i postgres:17-alpine psql "$NEON_URL" < kumtun-local.sql
rm kumtun-local.sql
```

Your accounts, stores, products, prices and sold log all come with it, so you log in with the same email and password (or Google) as before.

## 3. Get the Google Cloud tools

You already have a Google Cloud project (the one you made for Google login).

1. In the Cloud Console open **Billing** and link a billing account to that project. Cloud Run needs this even when you stay inside the free allowance. A card is required. The free trial credit can cover the early use.
2. Install the command-line tool and log in:

```bash
brew install --cask google-cloud-sdk
gcloud auth login
gcloud projects list                       # find the PROJECT_ID of your kumtun project
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 4. Fill in the settings

```bash
cd kumtun
cp env.cloudrun.example.yaml env.cloudrun.yaml
```

Open `env.cloudrun.yaml` and fill it in: the Neon connection string as `DATABASE_URL`, your Gmail as `ADMIN_EMAIL`, the Google client ID and secret (the same as on your computer), and the OpenAI / ElevenLabs keys if you use them. Delete lines you don't need. **Don't set `PUBLIC_URL`.** This file holds secrets; git ignores it. Never share it.

## 5. Deploy

```bash
gcloud run deploy kumtun \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --env-vars-file env.cloudrun.yaml \
  --max-instances 3 \
  --memory 512Mi
```

The first time it asks to create a storage place for the build ("Artifact Registry repository"): answer **Y**. It builds the app in Google's cloud (a few minutes) and prints a **Service URL**, an `https://….run.app` address. Open it: you should see the login page.

`--max-instances 3` caps how many copies can run at once, which caps your bill if the site gets hammered.

## 6. Tell Google about the new address

In Google Cloud Console → **Google Auth Platform → Clients → Web client 1**:

- Under **Authorized redirect URIs** add `SERVICE_URL/api/auth/google/callback` (your real `.run.app` address, no slash at the end of the URL), keeping the localhost one too, then **Save**.
- Under **Audience** click **Publish app** so other people can sign in (or add them as Test users).

Wait a few minutes, then use **Continue with Google** on the live site.

## 7. First login

Sign in with the email you put in `ADMIN_EMAIL`. If you moved your data in step 2, you simply see your stores. On a fresh database you get a store of your own (the sample bakery or empty, your choice). Anyone else who signs up gets a separate store and can't see yours.

---

## Keeping the cost small

- **Cap the app:** `--max-instances 3` (above). You can lower it.
- **Set a budget alert:** Cloud Console → **Billing → Budgets & alerts → Create budget**, for example 5 US dollars with alerts at 50%, 90% and 100%. It emails you; it doesn't stop anything by itself.
- **Limit the AI keys:** in OpenAI's billing settings set a monthly limit. ElevenLabs has a monthly character allowance. The app already limits AI calls to 40 per minute per person.
- **Logins are rate-limited** per app copy, so brute-force guessing is slowed down.
- **What you pay for:** Cloud Run (visits, within a free monthly allowance), the build (small), the stored app image (a few cents), and Neon only if you outgrow its free plan.

## Updating later

Run the same `gcloud run deploy …` command from step 5. Database changes apply automatically when the new version starts. To roll back, open the service in the Cloud Console → **Revisions** and send 100% of traffic to the older one.

To change just one setting without redoing the file:

```bash
gcloud run services update kumtun --region asia-southeast1 --update-env-vars ADMIN_EMAIL=you@gmail.com
```

## Backups

Nothing in the app is ever deleted for good (users restore things from the "Deleted…" lists), but you should still keep copies of the database. Neon has its own restore options, which depend on your plan; check them in the Neon console. You can also save a copy yourself at any time:

```bash
DATABASE_URL='your Neon connection string' ./scripts/backup-remote.sh
```

It writes a compressed file into `backups/` and keeps the newest 14.

## Using the same accounts for other projects

This is the point of pay-per-use: an idle project costs almost nothing, so you can keep adding.

- In the **same Google Cloud project** deploy another app as another service: `gcloud run deploy my-other-app …`. Each service has its own address and its own usage.
- In **Neon** make another project (or another database) for it. Check the plan's limits on projects and storage.
- Free allowances are shared across everything in the account, so many small projects share one free allowance. Watch the budget alert as you add them.

## Troubleshooting

| Problem | What to check |
|---|---|
| Build or deploy fails right away | Billing isn't linked to the project, or step 3's `gcloud services enable …` wasn't run. |
| "Container failed to start" | `gcloud run services logs read kumtun --region asia-southeast1 --limit 50`. Usually a wrong `DATABASE_URL` (it must end with `?sslmode=require`). |
| The first visit is slow | It's waking up (app and database). Add `--min-instances 1` if that matters to you. |
| `redirect_uri_mismatch` from Google | The address in step 6 isn't exactly `SERVICE_URL/api/auth/google/callback`, or you haven't waited a few minutes. |
| "Access blocked" from Google | Your Gmail isn't a Test user and the app isn't published (step 6). |
| Logging in works, then you are logged out | `TRUST_PROXY_HOPS` must be `"1"` and `PUBLIC_URL` must not be set. |
| "too many connections" in the log | Use Neon's pooled connection string, and keep `PG_POOL_MAX` at `"5"` or lower. |
| You forgot your password | Password reset isn't built yet. Sign in with Google instead. |
