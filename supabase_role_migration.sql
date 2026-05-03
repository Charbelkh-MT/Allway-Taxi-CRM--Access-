-- ================================================================
-- ALLWAY CRM — ROLE MIGRATION: Consolidate to admin / staff
-- Run this in the Supabase SQL editor (once).
-- ================================================================

-- Step 1: Migrate existing user roles
UPDATE public.users SET role = 'admin' WHERE role = 'supervisor';
UPDATE public.users SET role = 'staff' WHERE role IN ('senior', 'cashier');

-- Step 2: Update the check constraint on the users table
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'staff'));

-- ================================================================
-- Step 3: Update RLS policies (drop old, recreate with new roles)
-- ================================================================

-- USERS TABLE
DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own"
  ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR get_my_role() = 'admin');

-- CLIENTS TABLE
DROP POLICY IF EXISTS "clients_insert_supervisor" ON clients;
DROP POLICY IF EXISTS "clients_update_supervisor" ON clients;
CREATE POLICY "clients_insert_admin"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "clients_update_admin"
  ON clients FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- PRODUCTS TABLE
DROP POLICY IF EXISTS "products_write_supervisor" ON products;
DROP POLICY IF EXISTS "products_update_supervisor" ON products;
CREATE POLICY "products_write_admin"
  ON products FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "products_update_admin"
  ON products FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- INVOICES TABLE
DROP POLICY IF EXISTS "invoices_insert_all" ON invoices;
DROP POLICY IF EXISTS "invoices_update_creator_or_supervisor" ON invoices;
CREATE POLICY "invoices_insert_all"
  ON invoices FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'staff'));
CREATE POLICY "invoices_update_creator_or_admin"
  ON invoices FOR UPDATE TO authenticated
  USING (
    created_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() = 'admin'
  );

-- INVOICE ITEMS TABLE
DROP POLICY IF EXISTS "invoice_items_update_supervisor" ON invoice_items;
CREATE POLICY "invoice_items_update_admin"
  ON invoice_items FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- EXPENSES TABLE
DROP POLICY IF EXISTS "expenses_update_supervisor" ON expenses;
CREATE POLICY "expenses_update_admin"
  ON expenses FOR UPDATE TO authenticated
  USING (
    (submitted_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1) AND status = 'pending')
    OR get_my_role() = 'admin'
  )
  WITH CHECK (
    NOT (
      submitted_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
      AND status = 'approved'
    )
  );

-- PURCHASES TABLE
DROP POLICY IF EXISTS "purchases_write_supervisor" ON purchases;
DROP POLICY IF EXISTS "purchases_update_supervisor" ON purchases;
CREATE POLICY "purchases_write_admin"
  ON purchases FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "purchases_update_admin"
  ON purchases FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- AUDIT LOG
DROP POLICY IF EXISTS "audit_log_select_supervisor" ON audit_log;
CREATE POLICY "audit_log_select_admin"
  ON audit_log FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

-- SHIFTS TABLE
DROP POLICY IF EXISTS "shifts_select" ON shifts;
DROP POLICY IF EXISTS "shifts_update_own_or_supervisor" ON shifts;
CREATE POLICY "shifts_select"
  ON shifts FOR SELECT TO authenticated
  USING (
    user_name = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() = 'admin'
  );
CREATE POLICY "shifts_update_own_or_admin"
  ON shifts FOR UPDATE TO authenticated
  USING (
    user_name = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() = 'admin'
  );

-- TAXI TRIPS
DROP POLICY IF EXISTS "taxi_update_supervisor" ON taxi_trips;
CREATE POLICY "taxi_update_admin"
  ON taxi_trips FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- RECHARGE CARDS
DROP POLICY IF EXISTS "recharge_insert_sup" ON recharge_cards;
DROP POLICY IF EXISTS "recharge_update_sup" ON recharge_cards;
CREATE POLICY "recharge_insert_admin"
  ON recharge_cards FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "recharge_update_admin"
  ON recharge_cards FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- INTERNET RECHARGES
DROP POLICY IF EXISTS "internet_update_sup" ON internet_recharges;
CREATE POLICY "internet_update_admin"
  ON internet_recharges FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- INVENTORY CHECKS
DROP POLICY IF EXISTS "inventory_select_sup" ON inventory_checks;
DROP POLICY IF EXISTS "inventory_insert_sup" ON inventory_checks;
CREATE POLICY "inventory_select_admin"
  ON inventory_checks FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');
CREATE POLICY "inventory_insert_admin"
  ON inventory_checks FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- PNL ENTRIES
DROP POLICY IF EXISTS "pnl_select_sup" ON pnl_entries;
DROP POLICY IF EXISTS "pnl_insert_sup" ON pnl_entries;
CREATE POLICY "pnl_select_admin"
  ON pnl_entries FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');
CREATE POLICY "pnl_insert_admin"
  ON pnl_entries FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- RECEIVABLES
DROP POLICY IF EXISTS "recv_update_sup" ON receivables;
CREATE POLICY "recv_update_admin"
  ON receivables FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- SUPPLIERS
DROP POLICY IF EXISTS "suppliers_write_sup" ON suppliers;
DROP POLICY IF EXISTS "suppliers_update_sup" ON suppliers;
CREATE POLICY "suppliers_write_admin"
  ON suppliers FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');
CREATE POLICY "suppliers_update_admin"
  ON suppliers FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- ================================================================
-- Done. Verify with:
-- SELECT username, role FROM public.users ORDER BY role, username;
-- ================================================================
