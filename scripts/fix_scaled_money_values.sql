-- Fix legacy Access-imported money values scaled by 10,000.
-- Run in Supabase SQL editor.
-- This script includes:
-- 1) preview queries
-- 2) transactional updates
-- 3) post-update verification

-- =========================
-- 1) PREVIEW (no changes)
-- =========================

-- Suspect clients (large balances, likely scaled)
select id, full_name, usd_balance, lbp_balance
from clients
where abs(coalesce(usd_balance, 0)) >= 10000
   or abs(coalesce(lbp_balance, 0)) >= 100000000
order by id
limit 200;

-- Suspect invoices (large totals, likely scaled)
select id, client_name, total_usd, total_lbp, created_at
from invoices
where abs(coalesce(total_usd, 0)) >= 10000
   or abs(coalesce(total_lbp, 0)) >= 100000000
order by id
limit 200;

-- Suspect invoice items
select id, invoice_id, product_name, unit_price, total, currency
from invoice_items
where abs(coalesce(unit_price, 0)) >= 10000
   or abs(coalesce(total, 0)) >= 10000
order by id
limit 200;

-- =========================
-- 2) APPLY FIX
-- =========================
begin;

update clients
set
  usd_balance = usd_balance / 10000.0,
  lbp_balance = lbp_balance / 10000.0
where abs(coalesce(usd_balance, 0)) >= 10000
   or abs(coalesce(lbp_balance, 0)) >= 100000000;

update invoices
set
  total_usd = total_usd / 10000.0,
  total_lbp = total_lbp / 10000.0
where abs(coalesce(total_usd, 0)) >= 10000
   or abs(coalesce(total_lbp, 0)) >= 100000000;

update invoice_items
set
  unit_price = unit_price / 10000.0,
  total = total / 10000.0
where abs(coalesce(unit_price, 0)) >= 10000
   or abs(coalesce(total, 0)) >= 10000;

commit;

-- =========================
-- 3) VERIFY
-- =========================
select count(*) as remaining_suspect_clients
from clients
where abs(coalesce(usd_balance, 0)) >= 10000
   or abs(coalesce(lbp_balance, 0)) >= 100000000;

select count(*) as remaining_suspect_invoices
from invoices
where abs(coalesce(total_usd, 0)) >= 10000
   or abs(coalesce(total_lbp, 0)) >= 100000000;

select count(*) as remaining_suspect_invoice_items
from invoice_items
where abs(coalesce(unit_price, 0)) >= 10000
   or abs(coalesce(total, 0)) >= 10000;
