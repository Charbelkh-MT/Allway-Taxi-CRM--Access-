-- ================================================================
-- ALLWAY CRM — ROW LEVEL SECURITY POLICIES
-- Run this in your Supabase SQL editor AFTER verifying the app works.
-- ================================================================
-- IMPORTANT: These policies enforce server-side role validation.
-- They complement (not replace) client-side role checks in AuthContext.tsx.
-- ================================================================

-- Step 1: Enable RLS on all tables
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices           ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivables        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxi_trips         ENABLE ROW LEVEL SECURITY;
ALTER TABLE whish_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recharge_cards     ENABLE ROW LEVEL SECURITY;
ALTER TABLE internet_recharges ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_checks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pnl_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE s14_stamps         ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- HELPER: Get current user's role from public.users table
-- ================================================================
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.users
  WHERE id = auth.uid()
  AND active = true
  LIMIT 1;
$$;

-- ================================================================
-- USERS TABLE — admin only for write; all authenticated can read own row
-- ================================================================
CREATE POLICY "users_select_own"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR get_my_role() IN ('admin', 'supervisor'));

CREATE POLICY "users_insert_admin"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "users_update_admin"
  ON users FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- ================================================================
-- CLIENTS TABLE — supervisor+ write; all authenticated read
-- ================================================================
CREATE POLICY "clients_select_all"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "clients_insert_supervisor"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'supervisor'));

CREATE POLICY "clients_update_supervisor"
  ON clients FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- PRODUCTS TABLE — all authenticated read; supervisor+ write
-- ================================================================
CREATE POLICY "products_select_all"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_write_supervisor"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'supervisor'));

CREATE POLICY "products_update_supervisor"
  ON products FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- INVOICES TABLE — all authenticated read+insert; only creator or supervisor can update
-- ================================================================
CREATE POLICY "invoices_select_all"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "invoices_insert_all"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'supervisor', 'senior', 'cashier'));

CREATE POLICY "invoices_update_creator_or_supervisor"
  ON invoices FOR UPDATE
  TO authenticated
  USING (
    created_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() IN ('admin', 'supervisor')
  );

-- ================================================================
-- INVOICE ITEMS TABLE — all authenticated read+insert; supervisor can update
-- ================================================================
CREATE POLICY "invoice_items_select_all"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "invoice_items_insert_all"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "invoice_items_update_supervisor"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- EXPENSES TABLE — all authenticated insert+read; supervisor can update (approve/reject)
-- ================================================================
CREATE POLICY "expenses_select_all"
  ON expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "expenses_insert_all"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "expenses_update_supervisor"
  ON expenses FOR UPDATE
  TO authenticated
  USING (
    -- Submitter can only update if still pending (to retract)
    (submitted_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1) AND status = 'pending')
    OR get_my_role() IN ('admin', 'supervisor')
  )
  WITH CHECK (
    -- Prevent self-approval: submitter cannot change status to 'approved'
    NOT (
      submitted_by = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
      AND status = 'approved'
    )
  );

-- ================================================================
-- PURCHASES TABLE — supervisor+ only
-- ================================================================
CREATE POLICY "purchases_select_all"
  ON purchases FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "purchases_write_supervisor"
  ON purchases FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'supervisor'));

CREATE POLICY "purchases_update_supervisor"
  ON purchases FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- AUDIT LOG — insert only (no update/delete — immutable audit trail)
-- ================================================================
CREATE POLICY "audit_log_select_supervisor"
  ON audit_log FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('admin', 'supervisor'));

CREATE POLICY "audit_log_insert_all"
  ON audit_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- CRITICAL: Prevent any updates or deletes on audit_log
-- (No UPDATE or DELETE policies = those operations blocked for authenticated)

-- ================================================================
-- SHIFTS TABLE — own shift + supervisor can see all
-- ================================================================
CREATE POLICY "shifts_select"
  ON shifts FOR SELECT
  TO authenticated
  USING (
    user_name = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() IN ('admin', 'supervisor')
  );

CREATE POLICY "shifts_insert_all"
  ON shifts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "shifts_update_own_or_supervisor"
  ON shifts FOR UPDATE
  TO authenticated
  USING (
    user_name = (SELECT name FROM public.users WHERE id = auth.uid() LIMIT 1)
    OR get_my_role() IN ('admin', 'supervisor')
  );

-- ================================================================
-- WHISH TRANSACTIONS — all authenticated
-- ================================================================
CREATE POLICY "whish_select_all"     ON whish_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "whish_insert_all"     ON whish_transactions FOR INSERT TO authenticated WITH CHECK (true);

-- ================================================================
-- TAXI TRIPS — all authenticated
-- ================================================================
CREATE POLICY "taxi_select_all"      ON taxi_trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "taxi_insert_all"      ON taxi_trips FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "taxi_update_supervisor" ON taxi_trips FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- RECHARGE CARDS — all read; supervisor write
-- ================================================================
CREATE POLICY "recharge_select_all"  ON recharge_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "recharge_insert_sup"  ON recharge_cards FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'supervisor'));
CREATE POLICY "recharge_update_sup"  ON recharge_cards FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- INTERNET RECHARGES — all insert+read; supervisor update (verify)
-- ================================================================
CREATE POLICY "internet_select_all"  ON internet_recharges FOR SELECT TO authenticated USING (true);
CREATE POLICY "internet_insert_all"  ON internet_recharges FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "internet_update_sup"  ON internet_recharges FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- INVENTORY CHECKS — supervisor+ only
-- ================================================================
CREATE POLICY "inventory_select_sup" ON inventory_checks FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));
CREATE POLICY "inventory_insert_sup" ON inventory_checks FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- PNL ENTRIES — supervisor+ only
-- ================================================================
CREATE POLICY "pnl_select_sup"       ON pnl_entries FOR SELECT TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));
CREATE POLICY "pnl_insert_sup"       ON pnl_entries FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- RECEIVABLES — all authenticated
-- ================================================================
CREATE POLICY "recv_select_all"      ON receivables FOR SELECT TO authenticated USING (true);
CREATE POLICY "recv_insert_all"      ON receivables FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "recv_update_sup"      ON receivables FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- SUPPLIERS — all read; supervisor write
-- ================================================================
CREATE POLICY "suppliers_select_all" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write_sup"  ON suppliers FOR INSERT TO authenticated WITH CHECK (get_my_role() IN ('admin', 'supervisor'));
CREATE POLICY "suppliers_update_sup" ON suppliers FOR UPDATE TO authenticated USING (get_my_role() IN ('admin', 'supervisor'));

-- ================================================================
-- STAMPS — all authenticated
-- ================================================================
CREATE POLICY "stamps_select_all"    ON s14_stamps FOR SELECT TO authenticated USING (true);
CREATE POLICY "stamps_insert_all"    ON s14_stamps FOR INSERT TO authenticated WITH CHECK (true);

-- ================================================================
-- GRANT execute on helper function
-- ================================================================
GRANT EXECUTE ON FUNCTION get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_role() TO anon;
