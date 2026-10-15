import pg from 'pg';

// numeric columns come back as numbers instead of strings
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));
// date columns stay plain 'YYYY-MM-DD' strings (no timezone shifting)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://kumtun:kumtun@localhost:5432/kumtun',
});

export const query = (text, params) => pool.query(text, params);

// Runs at startup; safe to repeat. Brings databases created by older versions up to date.
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
  unit_cost    numeric not null,   -- true cost per unit when it was sold (frozen)
  created_at   timestamptz default now()
);
create index if not exists sales_sold_on_idx on sales (sold_on);
`);
}
