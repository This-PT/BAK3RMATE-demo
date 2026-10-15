import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// numeric columns come back as numbers instead of strings
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// date columns stay plain 'YYYY-MM-DD' strings (no timezone shifting)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://kumtun:kumtun@localhost:5432/kumtun',
  // pay-per-use hosts can run several copies of the app, and managed databases limit connections: keep each copy small
  max: Number(process.env.PG_POOL_MAX) || 10,
});
// A database that sleeps when idle drops its connections. Without this handler Node would crash on that.
pool.on('error', (err) => console.error('A database connection dropped (a new one is made when needed):', err.message));

export const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside one transaction.
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

// Runs at startup. On an EMPTY database (a managed one such as Neon) it creates the tables first; with Docker the
// database image already did that. SEED_DEMO_DATA=1 also adds the demo bakery. A lock stops two copies of the app
// that start at the same moment from doing it twice.
export async function prepareDatabase() {
  const lock = await pool.connect();
  try {
    await lock.query('select pg_advisory_lock(7000)');
    const empty = (await lock.query(`select to_regclass('public.supplies') is null as empty`)).rows[0].empty;
    if (empty) {
      console.log('Empty database: creating the tables');
      await lock.query(await readFile(path.join(DB_DIR, '001_schema.sql'), 'utf8'));
      if (process.env.SEED_DEMO_DATA === '1') await lock.query(await readFile(path.join(DB_DIR, '002_seed.sql'), 'utf8'));
    }
    await migrate();
  } finally {
    await lock.query('select pg_advisory_unlock(7000)').catch(() => {});
    lock.release();
  }
}

// Brings databases created by older versions up to date. Safe to repeat. Brings databases created by older versions up to date.
export async function migrate() {
  await pool.query(`
    alter table shops
      add column if not exists extra_pct numeric not null default 0,
      add column if not exists extra_cap_per_item numeric,
      add column if not exists fixed_fee_per_order numeric not null default 0,
      add column if not exists platform text
  `);
  await pool.query(`create table if not exists sales (
    id           serial primary key,
    sold_on      date not null,
    listing_id   int references listings(id) on delete set null,
    shop_name    text not null,
    product_name text not null,
    qty          int not null check (qty > 0),
    unit_price   numeric not null,
    unit_cost    numeric not null,
    created_at   timestamptz default now()
  )`);
  await pool.query('create index if not exists sales_sold_on_idx on sales (sold_on)');

  // Stores: every supply, product, shop and sale belongs to one store.
  await pool.query(`create table if not exists stores (
    id         serial primary key,
    name       text not null,
    created_at timestamptz default now()
  )`);
  // Only a database from before stores existed (it has data but no store) gets a default store to hold that data.
  // A brand-new empty database gets none: the first person to sign up creates their own.
  await pool.query(`insert into stores (name) select 'Baan Brownie'
    where not exists (select 1 from stores)
      and (exists (select 1 from supplies) or exists (select 1 from products) or exists (select 1 from shops))`);
  for (const table of ['supplies', 'products', 'shops', 'sales']) {
    await pool.query(`alter table ${table} add column if not exists store_id int references stores(id) on delete cascade`);
    await pool.query(`update ${table} set store_id = (select min(id) from stores) where store_id is null`);
    await pool.query(`alter table ${table} alter column store_id set not null`);
    await pool.query(`create index if not exists ${table}_store_idx on ${table} (store_id)`);
  }
  await pool.query(`select setval('stores_id_seq', (select max(id) from stores))`);
  // Accounts. Passwords are salted scrypt hashes; sessions store only a hash of the browser's cookie token.
  await pool.query(`create table if not exists users (
    id            serial primary key,
    email         text not null unique,
    name          text,
    password_hash text,
    google_sub    text unique,
    created_at    timestamptz default now(),
    last_login_at timestamptz
  )`);
  await pool.query(`create table if not exists sessions (
    token_hash text primary key,
    user_id    int not null references users(id) on delete cascade,
    created_at timestamptz default now(),
    expires_at timestamptz not null
  )`);
  await pool.query('create index if not exists sessions_user_idx on sessions (user_id)');
  // Who may use a store. Only role 'owner' exists for now; inviting staff would add more rows here.
  await pool.query(`create table if not exists store_members (
    store_id int not null references stores(id) on delete cascade,
    user_id  int not null references users(id) on delete cascade,
    role     text not null default 'owner',
    primary key (store_id, user_id)
  )`);
  await pool.query('create index if not exists store_members_user_idx on store_members (user_id)');
  await pool.query('delete from sessions where expires_at < now()');

  // Nothing is ever deleted for good: "deleting" sets deleted_at, and restoring clears it.
  for (const table of ['products', 'supplies', 'shops', 'listings', 'sales', 'stores']) {
    await pool.query(`alter table ${table} add column if not exists deleted_at timestamptz`);
  }
  // price history goes away with its supply
  await pool.query(`alter table price_changes drop constraint if exists price_changes_supply_id_fkey`);
  await pool.query(`alter table price_changes add constraint price_changes_supply_id_fkey foreign key (supply_id) references supplies(id) on delete cascade`);
}
