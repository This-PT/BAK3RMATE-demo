# Putting Bak3rMate online

This puts the app on a rented Linux server (a "VPS") so anyone can open it at `https://your-address`. It uses the same Docker setup you run on your computer, plus **Caddy**, which gets and renews the HTTPS certificate by itself. Only ports 80 and 443 are open to the internet; the database and the app stay private.

You need: a server, an address (domain), and the keys you already use. Allow about an hour the first time.

> The production setup was tested on a Mac before writing this: HTTPS, the http→https redirect, secure login cookies, and the full test suite all pass through it. What could not be tested from here is your real server and domain.

---

## 1. Rent a server

Any of DigitalOcean, Hetzner, Vultr or AWS Lightsail works. Choose:

- **Ubuntu 24.04** (or 22.04)
- **2 GB RAM** (1 GB can work, but building the app may run out of memory; see Troubleshooting)
- a region near your users (for Thailand, **Singapore**)
- **SSH key** login, if it offers it (safer than a password)

Write down the server's **IP address**, for example `203.0.113.5`.

## 2. Get an address

**With a domain** (for example `kumtun.example.com`): at your domain seller add a DNS record
`Type A · Name kumtun · Value <your server IP>`. It can take a few minutes to start working.

**No domain yet?** Use `203-0-113-5.sslip.io` (your IP with dashes). It's free and Caddy can get a certificate for it. It is shared with many people, so the certificate is sometimes refused; a real domain is more reliable.

## 3. Prepare the server

From your computer (use your own IP):

```bash
ssh root@203.0.113.5
```

Then on the server:

```bash
curl -fsSL https://get.docker.com | sh        # installs Docker
ufw allow OpenSSH && ufw allow 80 && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

Only if the server has 1 GB of RAM, add swap so the build doesn't run out of memory:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

## 4. Copy the project to the server

On your computer (not the server), from the folder that contains `kumtun`:

```bash
rsync -av --exclude node_modules --exclude .env --exclude backups --exclude .git kumtun/ root@203.0.113.5:/opt/kumtun/
```

## 5. Fill in the settings on the server

```bash
ssh root@203.0.113.5
cd /opt/kumtun
cp .env.example .env
nano .env
chmod 600 .env
```

Set these (the rest can stay as they are):

| Setting | Value |
|---|---|
| `DOMAIN` | your address, no `https://`, e.g. `kumtun.example.com` |
| `PUBLIC_URL` | `https://` + the same address |
| `TRUST_PROXY_HOPS` | `2` |
| `POSTGRES_PASSWORD` | a long random password. Make one with `openssl rand -hex 24`. **Set it before the first start**; it can't be changed afterwards this way |
| `ADMIN_EMAIL` | your Gmail. Only this email can take over the starting data |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | the same as on your computer |
| `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | the same as on your computer, if you use them |

Never put `.env` into git or send it to anyone: it holds your keys.

## 6. Start it

```bash
cd /opt/kumtun
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

All four (`db`, `backend`, `frontend`, `caddy`) should say "Up". The first start downloads and builds things, so give it a few minutes. Then open `https://your-address`. You should see the login page with a padlock.

## 7. Tell Google about the new address

In Google Cloud Console → your project → **Google Auth Platform → Clients → Web client 1**:

- Under **Authorized redirect URIs** click **+ Add URI** and add
  `https://your-address/api/auth/google/callback`
  (keep the `http://localhost:8080/...` one too, so it still works on your computer), then **Save**.
- Under **Audience**, either click **Publish app** so anyone with a Google account can sign in, or add people under **Test users**.

Wait a few minutes after saving, then try **Continue with Google**.

## 8. First login

Sign in with the email you put in `ADMIN_EMAIL` (Google or **Create account**). On a new server that account takes over the starting store (the sample bakery). Everyone else who signs up gets their own separate store.

### Want your data from your computer on the server instead?

On your computer, from the `kumtun` folder:

```bash
docker compose exec -T db pg_dump -U kumtun kumtun > kumtun-local.sql
scp kumtun-local.sql root@203.0.113.5:/opt/kumtun/
```

On the server:

```bash
cd /opt/kumtun
F="-f docker-compose.yml -f docker-compose.prod.yml"
docker compose $F stop backend
docker compose $F exec -T db psql -U kumtun -d postgres -c "drop database kumtun" -c "create database kumtun owner kumtun"
docker compose $F exec -T db psql -U kumtun -d kumtun < kumtun-local.sql
docker compose $F start backend
rm kumtun-local.sql
```

Your accounts come across with it, so you can log in with the same email and password (or Google) as before.

---

## Backups (do this)

Save the database and keep the newest 14 copies:

```bash
cd /opt/kumtun && ./scripts/backup.sh
```

To do it every night at 3 am: run `crontab -e` and add

```
0 3 * * * cd /opt/kumtun && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Backups stay on the same server, so now and then copy them to your computer: `scp -r root@203.0.113.5:/opt/kumtun/backups .`

To restore one: stop the backend, drop and create the database as in step 8, then `gunzip -c backups/<file>.sql.gz | docker compose $F exec -T db psql -U kumtun -d kumtun`.

## Updating later

Take a backup, copy the new files with the same `rsync` as step 4, then run the step 6 `up -d --build` command again. Database changes apply automatically when the app starts. Nothing is ever deleted for good in the app, so users can restore things themselves from the "Deleted…" lists.

## Safety checklist

- [ ] `ADMIN_EMAIL` is set to your own email.
- [ ] `POSTGRES_PASSWORD` is long and random, not the default.
- [ ] `.env` is not in git and has `chmod 600`.
- [ ] `ufw status` shows only 22, 80 and 443 open.
- [ ] Backups run, and you have copied one off the server.
- [ ] Google app is published (or your friends are listed as Test users).
- [ ] You keep the server updated now and then: `apt update && apt upgrade -y`.

## Troubleshooting

| Problem | What to check |
|---|---|
| Browser says the site can't be reached | The DNS record isn't pointing at the server yet, or the provider's own firewall blocks ports 80/443. |
| Padlock error / no certificate | `docker compose $F logs caddy`. Usually DNS isn't ready or `DOMAIN` has a typo. Fix it, then `docker compose $F restart caddy`. |
| `redirect_uri_mismatch` from Google | The address in step 7 is not exactly `https://your-address/api/auth/google/callback`, or you haven't waited a few minutes. |
| "Access blocked" from Google | Your Gmail isn't a Test user and the app isn't published (step 7). |
| Logging in works but you're logged out straight away | `PUBLIC_URL` must start with `https://`, and `TRUST_PROXY_HOPS` must be `2`. Then `docker compose $F up -d --force-recreate backend`. |
| The build stops with "Killed" | Not enough memory: add swap (step 3) or use a 2 GB server. |
| "Too many attempts" when logging in | Login is limited to 10 tries per email per 15 minutes. Wait, or restart the backend to reset it. |
| You forgot your password | Password reset isn't built yet. Sign in with Google, or ask whoever runs the server to set a new one. |

`F` here is shorthand for `-f docker-compose.yml -f docker-compose.prod.yml`.
