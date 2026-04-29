// Hand-crafted from allway_complete_schema.sql
// Run `npx supabase gen types typescript` after linking the project for auto-generated types.

export type Role = 'admin' | 'supervisor' | 'senior' | 'cashier'
export type DebtStatus = 'Debt' | 'Cash' | 'Unchecked'
export type InvoiceStatus = 'saved' | 'void_requested' | 'voided'
export type ExpenseStatus = 'pending' | 'approved' | 'rejected'
export type ReceivableStatus = 'pending' | 'collected'
export type ShiftStatus = 'open' | 'closed' | 'flagged'

export interface UserProfile {
  id: string
  name: string
  username: string
  role: Role
  station: string
  active: boolean
  created_at: string
}

export interface Client {
  id: number
  full_name: string
  mobile: string
  debt_status: DebtStatus
  usd_balance: number
  lbp_balance: number
  notes: string
  created_at: string
}

export interface Supplier {
  id: number
  name: string
  contact_person: string
  mobile: string
  address: string
  usd_balance: number
  created_at: string
}

export interface Product {
  id: number
  description: string
  category: string
  sub_category: string
  brand: string
  barcode?: string
  currency: 'USD' | 'LBP'
  cost: number
  selling: number
  quantity: number
  active: boolean
  created_at: string
}

export interface Invoice {
  id: number
  client_id: number | null
  client_name: string
  total_usd: number
  total_lbp: number
  payment_method: string
  status: InvoiceStatus
  void_reason: string
  void_requested_by: string
  void_approved_by: string
  created_by: string
  station: string
  created_at: string
}

export interface InvoiceItem {
  id: number
  invoice_id: number | null
  product_id: number | null
  product_name: string
  quantity: number
  unit_price: number
  currency: string
  total: number
}

export interface Expense {
  id: number
  supplier: string
  amount_usd: number
  amount_lbp: number
  description: string
  note: string
  status: ExpenseStatus
  submitted_by: string
  approved_by: string
  station: string
  created_at: string
}

export interface Purchase {
  id: number
  supplier_id: number | null
  supplier_name: string
  total_usd: number
  total_lbp: number
  paid_usd: number
  paid_lbp: number
  items: PurchaseItem[]
  created_by: string
  station: string
  created_at: string
}

export interface PurchaseItem {
  product_id: number | null
  description: string
  qty: number
  unit_cost: number
  total: number
  currency: string
}

export interface Receivable {
  id: number
  client_name: string
  amount_usd: number
  reason: string
  note: string
  status: ReceivableStatus
  created_by: string
  created_at: string
}

export interface TaxiTrip {
  id: number
  driver_name: string
  trip_date: string
  amount_usd: number
  amount_lbp: number
  payment_method: string
  route: string
  note: string
  created_by: string
  created_at: string
}

export interface PnlEntry {
  id: number
  entry_date: string
  usd_cms: number
  usd_whish: number
  usd_cash: number
  usdt: number
  alfa_dollars: number
  touch_dollars: number
  lbp_cms: number
  lbp_whish: number
  lbp_cash: number
  commission_usd: number
  commission_lbp: number
  note: string
  total_usd: number
  shift_profit: number
  day_profit: number
  created_by: string
  station: string
  created_at: string
}

export interface AuditLog {
  id: number
  action: string
  module: string
  detail: string
  user_name: string
  station: string
  ip_address: string
  created_at: string
}

export interface S14Stamp {
  id: number
  customer_name: string
  quantity: number
  amount_usd: number
  amount_lbp: number
  reference: string
  note: string
  created_by: string
  station: string
  created_at: string
}

export interface Shift {
  id: number
  user_name: string
  station: string
  opened_at: string | null
  closed_at: string | null
  expected_cash_usd: number
  counted_cash_usd: number
  difference_usd: number
  status: ShiftStatus
  note: string
}

// Placeholder – filled out when more tables are built
export type Database = {
  public: {
    Tables: {
      users:          { Row: UserProfile;  Insert: Partial<UserProfile>;  Update: Partial<UserProfile> }
      clients:        { Row: Client;       Insert: Partial<Client>;       Update: Partial<Client> }
      suppliers:      { Row: Supplier;     Insert: Partial<Supplier>;     Update: Partial<Supplier> }
      products:       { Row: Product;      Insert: Partial<Product>;      Update: Partial<Product> }
      invoices:       { Row: Invoice;      Insert: Partial<Invoice>;      Update: Partial<Invoice> }
      invoice_items:  { Row: InvoiceItem;  Insert: Partial<InvoiceItem>;  Update: Partial<InvoiceItem> }
      expenses:       { Row: Expense;      Insert: Partial<Expense>;      Update: Partial<Expense> }
      purchases:      { Row: Purchase;     Insert: Partial<Purchase>;     Update: Partial<Purchase> }
      receivables:    { Row: Receivable;   Insert: Partial<Receivable>;   Update: Partial<Receivable> }
      taxi_trips:     { Row: TaxiTrip;     Insert: Partial<TaxiTrip>;     Update: Partial<TaxiTrip> }
      pnl_entries:    { Row: PnlEntry;     Insert: Partial<PnlEntry>;     Update: Partial<PnlEntry> }
      audit_log:      { Row: AuditLog;     Insert: Partial<AuditLog>;     Update: Partial<AuditLog> }
      s14_stamps:     { Row: S14Stamp;     Insert: Partial<S14Stamp>;     Update: Partial<S14Stamp> }
      shifts:         { Row: Shift;        Insert: Partial<Shift>;        Update: Partial<Shift> }
    }
    Functions: {}
    Enums: {}
  }
}
