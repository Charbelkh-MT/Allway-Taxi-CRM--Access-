# AllWay Services CRM — Platform Overview

**Live URL:** https://allway-taxi-crm-access.vercel.app  
**Repository:** https://github.com/Charbelkh-MT/Allway-Taxi-CRM--Access-  
**Database:** Supabase (project: xwhvlyqirzknuxlcqsqq)  
**Stack:** React 18 · TypeScript · Vite · Tailwind v4 · shadcn/ui · TanStack Query · Supabase Auth

---

## What we built — end to end

### 1. Data Migration (Access → Supabase)

All historical data from BackEnd.accdb was extracted, cleaned, and imported into Supabase.

| Table | Records | Source |
|---|---|---|
| clients | 584 | tblClients |
| suppliers | 34 | tblSuppliers |
| products | 1,744 | tblProducts |
| invoices | 8,662 | tblInvoicesHead |
| invoice_items | 10,929 | tblInvoicesDetails |
| expenses | 310 | tblExpenses |
| purchases | 158 | tblPurchaseHead |
| receivables | 150 | tblClientReceivables |
| taxi_trips | 514 | tblTaxiTransactions |
| pnl_entries | 1,259 | tblPNL |
| audit_log | 41,433 | tblLogs |
| s14_stamps | 147 | tblStamps |
| shifts | 1,698 | tblStockCashAndPhysical |

**Data quality fixes applied during migration:**
- Client balances corrected (÷1000 — Access stored scaled values)
- 96 duplicate invoice IDs deduplicated
- 22 invoices with deleted clients: client_id nulled, name preserved
- 4 products with invalid currency `MELIYE` normalised to USD
- Invoice items with LBP overflow capped at schema limits

---

### 2. Authentication

- **Supabase Auth** with email/password (`{username}@allway.local` format)
- Profile table (`public.users`) linked by username from auth metadata
- 4 initial users migrated: jenny, admin, tarek, maria
- **Role system:** admin · supervisor · senior · cashier
- All new users created through the Users page are provisioned via Supabase Auth

---

### 3. Pages built (16 total)

#### Sales
- Invoice ledger with date filter (today / week / month)
- New invoice sheet: client typeahead, dynamic line items, product autocomplete
- **Barcode scan** → auto-opens sheet + adds product line item with price
- Void request flow (any user) → supervisor approval with stock rollback
- Stock availability check before save (blocks overselling)
- Invoice detail dialog showing all line items

#### Clients
- Searchable list with debt status filter
- Add / edit client (supervisor+ only)
- Duplicate name check before insert
- Balance changes logged with old → new values

#### Products
- 1,744 products with search, category, brand, stock-status filters
- Metric cards: stock value, low stock count, out-of-stock count
- Add / edit product with negative margin warning
- **Scan-to-Assign mode:** full-screen barcode assignment station with progress tracker, session log, camera fallback
- Barcode field on all products

#### Expenses + Receivables
- Expense submission form → supervisor approval workflow
- Self-approval blocked (cannot approve your own expense)
- Approve / Reject with full audit logging on both actions
- Expense threshold warning (reads from Settings)
- Receivable tracking against clients

#### Whish Money
- 7 transaction types with INFLOW/OUTFLOW direction labels
- Today's stats in header: count, USD moved, LBP moved, commission
- Date filter: today / week / month / all time
- Running wallet balance computed from all historical transactions
- Overdraft warning when outflow would make balance negative
- Commission in both USD and LBP

#### Purchasing
- New PO form with dynamic line items
- **Barcode scan** → auto-adds product to PO, increments qty if duplicate
- Supervisor-gated (non-supervisors see restricted message)
- PO history with outstanding balance (total − paid)

#### Shift
- Open / close shift with atomic race-condition guard (two users can't close same shift)
- Cash reconciliation: sales recorded vs. your count vs. difference
- Confirmation dialog before closing
- Cash mismatch threshold configurable via Settings
- Station summary (today's shifts for all staff)
- Printable daily report (HTML, opens for print) with XSS-escaped user data

#### Audit Log
- 41,433+ historical entries + all new actions
- Filter by module and staff member
- CSV export
- Immutable — no update/delete policies on audit_log table

#### Recharge Cards
- Receive stock (supervisor+): brand, denomination, batch, cost, selling
- Sell card with live availability counter
- Inventory summary by brand + denomination
- Every card individually tracked (receive → sell)

#### Internet Recharges
- Log recharge with mandatory customer account number
- Supervisor verification action
- Provider badge display

#### Taxi
- Trip log: driver, date, amounts, payment method, route
- Running totals above table

#### Inventory Check
- **Barcode scan** → instantly fills product field + system quantity
- Supervisor-gated submission
- Discrepancy history with colour-coded difference column
- Camera scan fallback

#### Daily Balance
- USD and LBP reconciliation inputs across 8 financial categories
- Auto-computed totals and USD equivalent
- Save Entry button (was broken Archive button — fixed)
- Historical PNL archive

#### Users
- User table with role badges (admin-only)
- Add user with Supabase Auth provisioning
- Password changes and deactivations logged as separate audit events
- Plaintext password storage removed

#### Returns
- Return form with refund method
- **Stock auto-restored** when return is processed (finds product by name, increments qty)
- Refund amount validation (> 0)
- Requires SQL migration to create `returns` table (SQL in IMPLEMENTATION_PLAN.md)

#### Settings
- Owner WhatsApp number + CallMeBot API key
- Alert thresholds (expense, cash mismatch)
- WhatsApp notification wired to shift close and large expenses

---

### 4. Barcode System

Three scanning methods, all using the same `useBarcode` hook:

| Method | How it works | Used for |
|---|---|---|
| **USB scanner (ETECH)** | Plug-in keyboard emulation, plug-and-play | Daily cashier and stock desk use |
| **Camera (BarcodeCamera)** | Browser webcam via @zxing/browser, modal overlay | Backup, mobile, no scanner stations |
| **Dev panel (BarcodeScanDev)** | Floating test panel, simulates scanner events | Testing without physical scanner |

**Pages with barcode integration:**
- Sales → scan to add invoice line item (auto-opens sheet)
- Purchasing → scan to add product to PO
- Inventory → scan to fill product field
- Products → scan to look up OR assign barcode to product
- Products → Scan-to-Assign mode for bulk barcode registration

**Dev panel access:** always visible on `localhost`. On production: press `Ctrl+Shift+B`.

---

### 5. Security & Compliance

**Authentication:**
- Supabase Auth (JWT-based, server-managed sessions)
- Passwords never stored in application tables
- Auto session refresh

**Authorisation (client-side):**
- `useCan(module)` and `useRole()` hooks gate every button and page
- Role map: admin (all), supervisor (most), senior (limited), cashier (sales + whish)

**Authorisation (server-side — run SQL in Supabase):**
- `supabase_rls_policies.sql` generated with full Row Level Security for all 18 tables
- `get_my_role()` function reads authenticated user's role from DB before every write
- Self-approval of expenses blocked at DB level
- Audit log has INSERT-only policy (no UPDATE or DELETE)

**Audit trail:**
- Every write operation calls `useAuditLog()` → appended to `audit_log` table
- Balance changes, password changes, deactivations logged as dedicated entries
- Void approvals log stock restoration per item

**Data integrity:**
- Stock quantity checked before invoice save (no overselling)
- Void approval restores stock quantities
- Return processing adds quantity back to product
- Shift close uses atomic `WHERE status='open'` guard (race-condition safe)
- Duplicate client guard (case-insensitive name check)
- HTML escaped in all printable reports (XSS protection)

---

### 6. Exchange Rate

Single source of truth in `src/lib/utils.ts`:
```
USD_RATE = 89,500 LBP per $1 USD
```
All three pages that previously had hardcoded values (Sales, DailyBalance, Whish) now import this constant. To update the rate: change one line in `utils.ts`.

All dates display in **Asia/Beirut (UTC+3)** timezone.

---

### 7. Infrastructure

| Item | Detail |
|---|---|
| Hosting | Vercel (charbelkhoury1's projects) |
| Project | allway_taxi_crm_access |
| Domain | allway-taxi-crm-access.vercel.app |
| Git repo | Charbelkh-MT/Allway-Taxi-CRM--Access- |
| Branch | main (auto-deploys on push) |
| Build | Vite → `dist/` → served by Vercel CDN |
| Env vars | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (set in Vercel dashboard) |

---

### 8. Known pending items

| Item | Status | Notes |
|---|---|---|
| Returns table | Needs SQL | Run the SQL in IMPLEMENTATION_PLAN.md Step 15 section |
| RLS policies | Needs SQL | Run `supabase_rls_policies.sql` in Supabase SQL editor |
| Barcode assignment | In progress | Use Scan-to-Assign in Products to register barcodes for all 1,744 products |
| Exchange rate | Manual | Update `USD_RATE` in `src/lib/utils.ts` when rate changes |
| WhatsApp alerts | Needs config | Add CallMeBot API key in Settings page |
| Barcode labels | Not built | For products without manufacturer barcodes |
| Joseph's Vercel project | Orphaned | Broken deployment on joseph-atallahs-projects/allway-crm — can be deleted |
