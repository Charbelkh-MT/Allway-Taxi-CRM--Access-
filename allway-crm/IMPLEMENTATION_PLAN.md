# AllWay CRM — React/TypeScript Implementation Plan

## Architecture Decisions

These apply to every page and component:

- **Data fetching:** TanStack Query `useQuery` + `useMutation` — no manual `useState` for server data
- **Forms:** shadcn `Dialog` for simple single-purpose forms; shadcn `Sheet` (side panel) for complex multi-field forms (new invoice, new PO)
- **Notifications:** `sonner` toast instead of `alert()` / `confirm()`
- **Audit logging:** `useAuditLog()` hook called inside every mutation `onSuccess`
- **Permissions:** `useCan(module)` and `useRole()` from `AuthContext` gate every action and button
- **Caching:** clients + products pre-loaded into TanStack Query cache on app mount, shared by Sales autocomplete, Purchasing, and Inventory

---

## Step 1 — Shared Infrastructure

**Status:** `completed`

**Files:**
- `src/components/shared/Badges.tsx`
- `src/hooks/useAuditLog.ts`
- `src/hooks/useProductsCache.ts`
- `src/hooks/useClientsCache.ts`

**Details:**

| Item | Purpose |
|---|---|
| `StatusBadge` | Saved / Void requested / Voided |
| `MethodBadge` | Cash USD / Cash LBP / Whish / Card / Debt |
| `DebtBadge` | Debt / Cash / Unchecked |
| `RoleBadge` | Admin / Supervisor / Senior / Cashier |
| `ExpenseStatusBadge` | Pending / Approved / Rejected |
| `UserBadge` | Mono-styled name chip used in every table |
| `useAuditLog` | Wraps `supabase.from('audit_log').insert(...)` with current user + station from `AuthContext` |
| `useProductsCache` | TanStack query for all active products — shared by Sales, Purchasing, Inventory |
| `useClientsCache` | TanStack query for all clients — shared by Sales, Expenses |

---

## Step 2 — Sales Page

**Status:** `completed`
**File:** `src/pages/Sales.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Invoice list | Search by client name, filter today / week / month, 200-row limit |
| Columns | #, Client, Date, USD total, Method badge, Created-by, Station, Status badge, Actions |
| Summary bar | "X invoices · $Y USD" |
| New invoice (Sheet) | Client typeahead from cache, payment method select (Cash USD / Cash LBP / Whish / Card / Debt), dynamic line items with product autocomplete + price auto-fill on Enter, running total |
| Void request | Any user — opens a Dialog to enter reason, updates status to `void_requested` |
| Approve void | Supervisor / admin only — button visible only to correct roles |
| Audit | Every save / void / approve calls `useAuditLog` |

---

## Step 3 — Clients Page

**Status:** `completed`
**File:** `src/pages/Clients.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Client list | Search by name, filter by DebtStatus (All / Debt / Cash / Unchecked), 600-row limit |
| Columns | ID, Full name, Mobile, Debt badge, USD balance (red if negative), LBP balance, WhatsApp dot (green if mobile exists) |
| Summary bar | "X clients · Debts: $Y" |
| Add client (Dialog) | Full name, Mobile, Debt status select, USD balance |

---

## Step 4 — Products Page

**Status:** `completed`
**File:** `src/pages/Products.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Product list | Search by description, filter by category, active only, 300-row limit |
| Columns | ID, Description, Category, Brand, Currency, Cost, Selling, Qty (green if >0, grey if 0) |
| Summary bar | "X products" |
| Add product (Dialog) | Supervisor+ only — description, category, brand, currency, cost, selling, quantity |

---

## Step 5 — Expenses Page

**Status:** `completed`
**File:** `src/pages/Expenses.tsx`

Two cards side-by-side at the top, table below.

**Add Expense card:**

| Field | Note |
|---|---|
| Supplier / description | Required |
| Amount USD | Triggers WhatsApp alert if ≥ $50 |
| Amount LBP | Optional |
| Description | Free text |
| Note | Free text |

**Add Receivable card:**

| Field | Note |
|---|---|
| Client | Select from cache |
| Amount USD | |
| Reason | |
| Note | |

**Expenses table:**

| Column | Detail |
|---|---|
| Supplier | |
| Date | |
| USD | |
| Description | |
| By | UserBadge |
| Status | ExpenseStatusBadge |
| Actions | Supervisor+ sees Approve / Reject on pending rows |

---

## Step 6 — Whish Page

**Status:** `completed`
**File:** `src/pages/Whish.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Header banner | Red Whish branding, "Transactions today: N" counter |
| Transaction form | Type (Whish to Whish / Receive USD / Send USD / Top up LBP / Withdrawal / Alfa Dollars / Touch Dollars), Client name, Amount USD, Amount LBP, Commission USD, Note |
| Recent table | Type badge, Client, USD, LBP, Commission, By, Time |

---

## Step 7 — Purchasing Page

**Status:** `completed`
**File:** `src/pages/Purchasing.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Permission gate | Non-supervisors see a restricted notice instead of the form |
| New PO (top card) | Supplier select (fetched from Supabase), Date (auto today), dynamic line items (product name, qty, unit price — product autocomplete from cache), USD total auto-calc, USD paid input |
| PO table | #, Supplier, Date, Total USD, Paid USD, Remaining (red if >0), By |

---

## Step 8 — Shift Page

**Status:** `completed`
**File:** `src/pages/Shift.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Status banner | Green / grey dot, "Shift open since X" or "No active shift", Open Shift / Close Shift / Close Day buttons |
| Reconciliation card | Sales recorded this shift, Expected cash, Your count input, Difference auto-calc (colour-coded), Note, Submit count, Flag discrepancy |
| Close shift logic | Compares counted vs expected — diff > $1 sets status to `flagged`, logs audit |
| Station summary card | Today's shifts for all staff — expected / counted / difference / status |
| Daily report | Generates a printable HTML page (opens new window) with sales, expenses, Whish, shift summary |

---

## Step 9 — Audit Log Page

**Status:** `completed`
**File:** `src/pages/Audit.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Module filter | All / Sales / Voids / Logins / Expenses / Flags / Whish |
| Staff filter | Populated dynamically from the returned data |
| Activity feed | Timeline rows: time, icon, action detail, user + station |
| Export CSV | Downloads all visible rows as a `.csv` file |
| Limit | 200 rows |

---

## Step 10 — Recharge Cards Page

**Status:** `completed`
**File:** `src/pages/Recharge.tsx`

Two cards side-by-side, inventory table below.

**Receive cards (Supervisor+):**

| Field | |
|---|---|
| Brand | Alfa / Touch |
| Denomination | 03.03 / 04.50 / 07.58 / 15.15 / 22.73 / 77.28 / Dollars / Month |
| Quantity | |
| Batch number | |
| Cost each (LBP) | |
| Selling each (LBP) | |

**Sell card:**

| Field | |
|---|---|
| Brand | |
| Denomination | |
| Quantity | |
| Client name | |
| Live stock count | "Available: N cards" — green if >0, red if 0 |

**Inventory table:** Summarised by Brand + Denomination showing In stock, Sold, Selling price, Status badge.

---

## Step 11 — Internet Recharges Page

**Status:** `completed`
**File:** `src/pages/Internet.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Form | Provider (IDM / Ogero / Terranet / Sodetel / Cyberia / Connect / Mobi / Wise), Plan, Customer account # (required), Customer name, Amount USD, Amount LBP |
| Table | Provider badge, Plan, Account #, Customer, USD, By, Time, Verified |
| Verify action | Supervisor+ — sets `verified = true`, logs audit |

---

## Step 12 — Taxi Page

**Status:** `completed`
**File:** `src/pages/Taxi.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Form | Driver name (required), Date (today default), Amount USD, Amount LBP, Payment method (Cash / Whish / Card), Route / note |
| Trip table | Driver, Date, USD, Method badge, Route, By; total USD shown above table |

---

## Step 13 — Inventory Check Page

**Status:** `completed`
**File:** `src/pages/Inventory.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Permission gate | Supervisor+ only can submit |
| Form | Product autocomplete from cache (system qty auto-fills on selection), Physical count input, Difference auto-calc (red if short / green if match), Note |
| History table | Product, System qty, Counted, Difference (coloured ±), By, Date, Note |

---

## Step 14 — Users Page

**Status:** `completed`
**File:** `src/pages/Users.tsx`

**Features:**

| Feature | Detail |
|---|---|
| Permission gate | Admin only |
| User table | Name, Username (mono), Role badge, Station, Active badge |
| Add user (Dialog) | Full name, username, password, role select, station select — creates Supabase Auth account + profile row |
| Security rules | Static display of the 6 enforced system rules |

---

## Step 15 — Returns Page

**Status:** `completed`
**File:** `src/pages/Returns.tsx`

**Note:** Requires adding a `returns` table to Supabase (SQL provided below).

**Features:**

| Feature | Detail |
|---|---|
| Form | Original invoice #, Client name, Product returned, Quantity, Refund amount USD, Refund method (Cash USD / Whish / Store credit / Exchange only), Reason, Note |
| Return history table | Invoice #, Client, Product, Qty, Refund USD, Method, Reason, By, Date |

**SQL to run in Supabase before building this page:**

```sql
create table if not exists returns (
  id serial primary key,
  invoice_id integer,
  client_name text not null,
  product_name text not null,
  quantity integer default 1,
  refund_usd numeric(12,2) default 0,
  refund_method text default 'Cash USD',
  reason text default '',
  note text default '',
  processed_by text not null,
  station text default '',
  created_at timestamptz default now()
);
alter table returns disable row level security;
grant all on returns to anon;
grant usage, select on sequence returns_id_seq to anon;
```

---

## Step 16 — Settings Page

**Status:** `completed`
**File:** `src/pages/Settings.tsx`

**Features:**

| Feature | Detail |
|---|---|
| WhatsApp alerts | Owner phone number, CallMeBot API key input, Alert on void toggle, Alert on cash mismatch toggle, Alert threshold for expenses (USD) |
| Save | Persists to `tblInformation` row in Supabase |
| Setup guide | Static step-by-step instructions for CallMeBot activation |

---

## Full File List

```
src/
├── components/
│   └── shared/
│       └── Badges.tsx
├── hooks/
│   ├── useAuditLog.ts
│   ├── useClientsCache.ts
│   └── useProductsCache.ts
└── pages/
    ├── Sales.tsx
    ├── Clients.tsx
    ├── Products.tsx
    ├── Expenses.tsx
    ├── Whish.tsx
    ├── Purchasing.tsx
    ├── Shift.tsx
    ├── Audit.tsx
    ├── Recharge.tsx
    ├── Internet.tsx
    ├── Taxi.tsx
    ├── Inventory.tsx
    ├── Users.tsx
    ├── Returns.tsx
    └── Settings.tsx
```

---

## Execution Order

| # | Step | Reason |
|---|---|---|
| 1 | Shared infrastructure | Everything else depends on it |
| 2 | Sales | Highest-traffic page, most business-critical |
| 3 | Clients | Referenced by Sales autocomplete |
| 4 | Products | Referenced by Sales, Purchasing, Inventory |
| 5 | Expenses | Second most used daily operation |
| 6 | Whish | Third most used daily operation |
| 7 | Purchasing | Less frequent, supervisor-only |
| 8 | Shift | Daily close workflow |
| 9 | Audit Log | Read-only, quick to build |
| 10 | Recharge Cards | Specialised inventory flow |
| 11 | Internet Recharges | Similar pattern to Recharge |
| 12 | Taxi | Simple log form |
| 13 | Inventory Check | Supervisor spot-check |
| 14 | Users | Admin-only, low frequency |
| 15 | Returns | Requires schema migration first |
| 16 | Settings | Last — low priority, rarely changed |
