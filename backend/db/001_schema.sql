create table supplies (
  id             serial primary key,
  name           text not null,
  name_th        text,
  unit           text not null,
  qty            numeric not null,
  unit_cost      numeric not null,
  prev_unit_cost numeric,
  low_stock_at   numeric not null default 0
);

create table products (
  id      serial primary key,
  name    text not null,
  name_th text,
  pieces  int not null default 1
);

create table recipe_items (
  product_id int references products(id) on delete cascade,
  supply_id  int references supplies(id),
  amount     numeric not null,
  display    text,
  primary key (product_id, supply_id)
);

create table shops (
  id              serial primary key,
  name            text not null,
  commission_pct  numeric not null default 0,
  transaction_pct numeric not null default 0,
  shipping_pct    numeric not null default 0,
  extra_pct       numeric not null default 0,
  extra_cap_per_item numeric,
  fixed_fee_per_order numeric not null default 0,
  platform        text
);

create table listings (
  id             serial primary key,
  shop_id        int references shops(id) on delete cascade,
  product_id     int references products(id) on delete cascade,
  price          numeric not null,
  ads_per_order  numeric not null default 0,
  wear_per_order numeric not null default 0
);

create table price_changes (
  id         serial primary key,
  supply_id  int references supplies(id),
  old_cost   numeric,
  new_cost   numeric,
  source     text,
  created_at timestamptz default now(),
  undone     boolean not null default false
);

create table if not exists sales (
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
