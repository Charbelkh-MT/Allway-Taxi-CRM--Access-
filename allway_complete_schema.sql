-- ================================================================
-- ALLWAY SERVICES CRM — COMPLETE DATABASE SCHEMA
-- Version: Final
-- ================================================================

-- USERS
create table if not exists users (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin','supervisor','senior','cashier')),
  station text default 'Main Station',
  active boolean default true,
  created_at timestamptz default now()
);

-- CLIENTS
create table if not exists clients (
  id serial primary key,
  full_name text not null,
  mobile text default '',
  debt_status text default 'Unchecked' check (debt_status in ('Debt','Cash','Unchecked')),
  usd_balance numeric(12,2) default 0,
  lbp_balance numeric(16,0) default 0,
  notes text default '',
  created_at timestamptz default now()
);

-- SUPPLIERS
create table if not exists suppliers (
  id serial primary key,
  name text not null,
  contact_person text default '',
  mobile text default '',
  address text default '',
  usd_balance numeric(12,2) default 0,
  created_at timestamptz default now()
);

-- PRODUCTS
create table if not exists products (
  id serial primary key,
  description text not null,
  category text default '',
  sub_category text default '',
  brand text default '',
  currency text default 'USD' check (currency in ('USD','LBP')),
  cost numeric(14,2) default 0,
  selling numeric(14,2) default 0,
  quantity integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- INVOICES
create table if not exists invoices (
  id serial primary key,
  client_id integer references clients(id),
  client_name text not null,
  total_usd numeric(12,2) default 0,
  total_lbp numeric(16,0) default 0,
  payment_method text default 'Cash USD',
  status text default 'saved' check (status in ('saved','void_requested','voided')),
  void_reason text default '',
  void_requested_by text default '',
  void_approved_by text default '',
  created_by text not null,
  station text not null,
  created_at timestamptz default now()
);

-- INVOICE ITEMS
create table if not exists invoice_items (
  id serial primary key,
  invoice_id integer references invoices(id) on delete cascade,
  product_id integer references products(id),
  product_name text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  currency text default 'USD',
  total numeric(12,2) not null
);

-- EXPENSES
create table if not exists expenses (
  id serial primary key,
  supplier text not null,
  amount_usd numeric(12,2) default 0,
  amount_lbp numeric(16,0) default 0,
  description text default '',
  note text default '',
  status text default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by text not null,
  approved_by text default '',
  station text default '',
  created_at timestamptz default now()
);

-- PURCHASES
create table if not exists purchases (
  id serial primary key,
  supplier_id integer references suppliers(id),
  supplier_name text not null,
  total_usd numeric(12,2) default 0,
  total_lbp numeric(16,0) default 0,
  paid_usd numeric(12,2) default 0,
  paid_lbp numeric(16,0) default 0,
  items jsonb default '[]',
  created_by text not null,
  station text default '',
  created_at timestamptz default now()
);

-- WHISH TRANSACTIONS
create table if not exists whish_transactions (
  id serial primary key,
  transaction_type text not null,
  client_name text default '',
  amount_usd numeric(12,2) default 0,
  amount_lbp numeric(16,0) default 0,
  commission_usd numeric(10,2) default 0,
  commission_lbp numeric(14,0) default 0,
  note text default '',
  created_by text not null,
  station text default '',
  created_at timestamptz default now()
);

-- SHIFTS
create table if not exists shifts (
  id serial primary key,
  user_name text not null,
  station text not null,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  expected_cash_usd numeric(12,2) default 0,
  counted_cash_usd numeric(12,2) default 0,
  difference_usd numeric(12,2) default 0,
  status text default 'open' check (status in ('open','closed','flagged')),
  note text default ''
);

-- PNL ENTRIES
create table if not exists pnl_entries (
  id serial primary key,
  entry_date date default current_date,
  usd_cms numeric(12,2) default 0,
  usd_whish numeric(12,2) default 0,
  usd_cash numeric(12,2) default 0,
  usdt numeric(12,2) default 0,
  alfa_dollars numeric(12,2) default 0,
  touch_dollars numeric(12,2) default 0,
  lbp_cms numeric(16,0) default 0,
  lbp_whish numeric(16,0) default 0,
  lbp_cash numeric(16,0) default 0,
  commission_usd numeric(12,2) default 0,
  commission_lbp numeric(16,0) default 0,
  note text default '',
  total_usd numeric(12,2) default 0,
  shift_profit numeric(12,2) default 0,
  day_profit numeric(12,2) default 0,
  created_by text not null,
  station text default '',
  created_at timestamptz default now()
);

-- RECEIVABLES
create table if not exists receivables (
  id serial primary key,
  client_name text not null,
  amount_usd numeric(12,2) default 0,
  reason text default '',
  note text default '',
  status text default 'pending' check (status in ('pending','collected')),
  created_by text not null,
  created_at timestamptz default now()
);

-- AUDIT LOG
create table if not exists audit_log (
  id serial primary key,
  action text not null,
  module text default '',
  detail text default '',
  user_name text not null,
  station text default '',
  ip_address text default '',
  created_at timestamptz default now()
);

-- RECHARGE CARDS
create table if not exists recharge_cards (
  id serial primary key,
  brand text not null,
  denomination text not null,
  serial_number text default '',
  batch_number text default '',
  cost numeric(14,2) default 0,
  selling numeric(14,2) default 0,
  currency text default 'LBP',
  status text default 'in_stock' check (status in ('in_stock','sold','voided')),
  received_by text default '',
  sold_by text default '',
  sold_at timestamptz,
  invoice_id integer,
  created_at timestamptz default now()
);

-- INTERNET RECHARGES
create table if not exists internet_recharges (
  id serial primary key,
  provider text not null,
  plan text default '',
  customer_account text not null,
  customer_name text default '',
  amount_usd numeric(12,2) default 0,
  amount_lbp numeric(16,0) default 0,
  verified boolean default false,
  verified_by text default '',
  created_by text not null,
  station text default '',
  invoice_id integer,
  created_at timestamptz default now()
);

-- INVENTORY SPOT CHECKS
create table if not exists inventory_checks (
  id serial primary key,
  product_id integer references products(id),
  product_name text not null,
  system_qty integer default 0,
  counted_qty integer default 0,
  difference integer default 0,
  checked_by text not null,
  station text default '',
  note text default '',
  created_at timestamptz default now()
);

-- WHISH DAILY BALANCE
create table if not exists whish_balances (
  id serial primary key,
  balance_date date default current_date,
  opening_balance_usd numeric(12,2) default 0,
  closing_balance_usd numeric(12,2) default 0,
  expected_balance_usd numeric(12,2) default 0,
  difference_usd numeric(12,2) default 0,
  status text default 'ok' check (status in ('ok','flagged')),
  entered_by text not null,
  note text default '',
  created_at timestamptz default now()
);

-- TAXI TRIPS
create table if not exists taxi_trips (
  id serial primary key,
  driver_name text not null,
  trip_date date default current_date,
  amount_usd numeric(12,2) default 0,
  amount_lbp numeric(16,0) default 0,
  payment_method text default 'Cash',
  route text default '',
  note text default '',
  created_by text not null,
  created_at timestamptz default now()
);

-- S14 STAMPS
create table if not exists s14_stamps (
  id serial primary key,
  customer_name text default '',
  quantity integer default 1,
  amount_usd numeric(12,2) default 0,
  amount_lbp numeric(16,0) default 0,
  reference text default '',
  note text default '',
  created_by text not null,
  station text default '',
  created_at timestamptz default now()
);

-- ================================================================
-- DISABLE RLS ON ALL TABLES
-- ================================================================
alter table users disable row level security;
alter table clients disable row level security;
alter table products disable row level security;
alter table suppliers disable row level security;
alter table invoices disable row level security;
alter table invoice_items disable row level security;
alter table expenses disable row level security;
alter table purchases disable row level security;
alter table whish_transactions disable row level security;
alter table shifts disable row level security;
alter table pnl_entries disable row level security;
alter table receivables disable row level security;
alter table audit_log disable row level security;
alter table recharge_cards disable row level security;
alter table internet_recharges disable row level security;
alter table inventory_checks disable row level security;
alter table whish_balances disable row level security;
alter table taxi_trips disable row level security;
alter table s14_stamps disable row level security;

-- ================================================================
-- GRANT PERMISSIONS
-- ================================================================
grant usage on schema public to anon;
grant all on all tables in schema public to anon;
grant all on all sequences in schema public to anon;

-- ================================================================
-- DEFAULT USERS
-- ================================================================
insert into users (name, username, password_hash, role, station) values
  ('Jenny', 'jenny', 'supervisor123', 'supervisor', 'Main Station'),
  ('Admin', 'admin', 'admin123', 'admin', 'Main Station'),
  ('Tarek', 'tarek', 'tarek123', 'cashier', 'Main Station'),
  ('Maria', 'maria', 'maria123', 'senior', 'Station 01')
on conflict (username) do nothing;

-- ================================================================
-- LOGIN FUNCTION (bypasses RLS)
-- ================================================================
create or replace function get_user_login(p_username text)
returns table (
  id uuid, name text, username text, password_hash text,
  role text, station text, active boolean
)
language sql security definer
as $$
  select id, name, username, password_hash, role, station, active
  from users
  where username = p_username and active = true;
$$;
grant execute on function get_user_login to anon;
grant execute on function get_user_login to public;

