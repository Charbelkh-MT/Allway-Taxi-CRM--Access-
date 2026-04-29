import csv
import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
EXPORTS = ROOT / "exports_backend"
OUT = ROOT / "supabase_import"


def _read_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[])


def _write_csv(path: Path, rows: List[Dict[str, Any]], fieldnames: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})


_money_re = re.compile(r"[,$\s]")


def parse_money(s: str) -> Optional[float]:
    s = (s or "").strip()
    if not s:
        return None
    s = s.replace("USD", "").replace("LBP", "").strip()
    s = s.replace("(", "-").replace(")", "")
    s = _money_re.sub("", s)
    if not s or s == "-":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_int(s: str) -> Optional[int]:
    v = parse_money(s)
    if v is None:
        return None
    try:
        return int(round(v))
    except Exception:
        return None


def parse_ts(s: str) -> Optional[str]:
    s = (s or "").strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.isoformat()
        except ValueError:
            pass
    return None


def _access_time(s: str) -> str:
    """Extract HH:MM:SS from Access time value (date part is always the OLE epoch 1899-12-30)."""
    s = (s or "").strip()
    if not s:
        return "00:00:00"
    return s.split(" ")[1] if " " in s else s


def _combine_dt(date_str: str, time_str: str) -> Optional[str]:
    date_part = (parse_ts(date_str) or "")[:10]
    if not date_part:
        return None
    return f"{date_part}T{_access_time(time_str)}"


def norm_bool(s: str) -> Optional[bool]:
    s = (s or "").strip().lower()
    if s in ("true", "yes", "1"):
        return True
    if s in ("false", "no", "0"):
        return False
    return None


def _cap12(v: float) -> float:
    return min(max(v, -9_999_999_999.99), 9_999_999_999.99)


def _cap16(v: float) -> int:
    return int(min(max(v, -9_999_999_999_999_999), 9_999_999_999_999_999))


ACCESS_MONEY_SCALE = 10_000


def _normalize_access_money(v: float) -> float:
    """
    Access exports store legacy money fields in scaled units.
    Normalize into real currency units before importing to Supabase.
    """
    return float(v) / ACCESS_MONEY_SCALE


@dataclass
class Findings:
    source: str
    exported_at: str
    tables: Dict[str, Dict[str, Any]]


def load_findings() -> Findings:
    m = json.loads((EXPORTS / "manifest.json").read_text(encoding="utf-8"))
    tables = {t["table"]: t for t in m["tables"]}
    return Findings(source=m["source"], exported_at=m["exported_at"], tables=tables)


# ─── Core lookups reused by multiple preparers ────────────────────────────────

def _valid_ids(df: pd.DataFrame, col: str) -> set:
    return set(str(int(float(x))) for x in df[col].dropna() if str(x).strip())


def _client_name_map(clients_df: pd.DataFrame) -> Dict[str, str]:
    out = {}
    for _, r in clients_df.iterrows():
        cid = str(parse_int(r.get("C_ID", "")) or "")
        if cid:
            out[cid] = (r.get("ClientFullName", "") or r.get("ClientDisplayName", "") or "").strip()
    return out


# ─── Prepare functions ────────────────────────────────────────────────────────

def prepare_clients() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblClients.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        out.append(
            {
                "id": parse_int(r.get("C_ID", "")) or "",
                "full_name": r.get("ClientFullName", "").strip() or r.get("ClientDisplayName", "").strip(),
                "mobile": (r.get("ClientMobile", "") or "").strip(),
                "debt_status": (r.get("DebtStatus", "") or "Unchecked").strip() or "Unchecked",
                "usd_balance": _cap12(_normalize_access_money(parse_money(r.get("usd_balance", "")) or 0)),
                "lbp_balance": _cap16(_normalize_access_money(parse_money(r.get("lbp_balance", "")) or 0)),
                "notes": "",
                "created_at": None,
            }
        )
    return "clients", out


def prepare_suppliers() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblSuppliers.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        out.append(
            {
                "id": parse_int(r.get("Supplier_ID", "")) or "",
                "name": (r.get("Supplier_Name", "") or "").strip(),
                "contact_person": (r.get("Contact_Person", "") or "").strip(),
                "mobile": (r.get("Phone", "") or "").strip(),
                "address": (r.get("Address", "") or "").strip(),
                "usd_balance": (parse_money(r.get("USD_Balance", "")) or 0),
                "created_at": None,
            }
        )
    return "suppliers", out


def prepare_products() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblProducts.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        raw_cur = (r.get("Product_Currency", "") or "").strip().upper()
        out.append(
            {
                "id": parse_int(r.get("P_ID", "")) or "",
                "description": (r.get("Product_Details", "") or r.get("Product_Description", "") or "").strip(),
                "category": (r.get("Product_Category", "") or "").strip(),
                "sub_category": (r.get("Product_Sub_Category", "") or "").strip(),
                "brand": (r.get("Product_Brand", "") or "").strip(),
                "currency": raw_cur if raw_cur in ("USD", "LBP") else "USD",
                "cost": (parse_money(r.get("Product_Cost", "")) or 0),
                "selling": (parse_money(r.get("Product_Selling", "")) or 0),
                "quantity": (parse_int(r.get("Product_Quantity", "")) or 0),
                "active": True,
                "created_at": None,
            }
        )
    return "products", out


def prepare_invoices() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblInvoicesHead.csv")
    clients_df = _read_csv(EXPORTS / "tblClients.csv")
    payments_df = _read_csv(EXPORTS / "tblPayments.csv")

    valid_client_ids = _valid_ids(clients_df, "C_ID")

    # Build payment lookup: Payment_ID → {lbp, usd}
    payment_map: Dict[str, Dict[str, float]] = {}
    for _, r in payments_df.iterrows():
        pid = str(r.get("Payment_ID", "") or "").strip()
        if pid:
            payment_map[pid] = {
                "lbp": parse_money(r.get("LBP_Received", "")) or 0,
                "usd": parse_money(r.get("USD_Received", "")) or 0,
            }

    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        inv_id = parse_int(r.get("INV_ID", "")) or ""
        raw_cid = parse_int(r.get("C_ID", ""))
        client_id = raw_cid if raw_cid is not None and str(raw_cid) in valid_client_ids else None

        raw_usd = parse_money(r.get("usd_total", "")) or 0
        raw_lbp = parse_money(r.get("lbp_total", "")) or 0
        total_usd = _cap12(_normalize_access_money(raw_usd))
        total_lbp = _cap16(_normalize_access_money(raw_lbp))

        # Derive payment_method from first Payment_ID in the (possibly comma-separated) list
        pid_raw = str(r.get("Payment_ID", "") or "").strip()
        first_pid = pid_raw.split(",")[0].strip()
        pm = payment_map.get(first_pid, {})
        has_usd = (pm.get("usd") or 0) > 0
        has_lbp = (pm.get("lbp") or 0) > 0
        if has_usd and has_lbp:
            payment_method = "Mixed"
        elif has_lbp:
            payment_method = "Cash LBP"
        else:
            payment_method = "Cash USD"

        out.append(
            {
                "id": inv_id,
                "client_id": client_id,
                "client_name": (r.get("ClientFullName", "") or "").strip(),
                "total_usd": total_usd,
                "total_lbp": total_lbp,
                "payment_method": payment_method,
                "status": "saved",
                "void_reason": "",
                "void_requested_by": "",
                "void_approved_by": "",
                "created_by": (r.get("Username", "") or "Unknown").strip() or "Unknown",
                "station": "Main Station",
                "created_at": parse_ts(r.get("Invoice_Date", "")) or None,
            }
        )
    return "invoices", out


def prepare_invoice_items() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblInvoicesDetails.csv")
    products_df = _read_csv(EXPORTS / "tblProducts.csv")
    invoices_df = _read_csv(EXPORTS / "tblInvoicesHead.csv")

    valid_product_ids = _valid_ids(products_df, "P_ID")
    valid_invoice_ids = _valid_ids(invoices_df, "INV_ID")

    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        raw_inv_id = parse_int(r.get("INV_ID", ""))
        inv_id = raw_inv_id if raw_inv_id is not None and str(raw_inv_id) in valid_invoice_ids else None
        raw_prod_id = parse_int(r.get("P_ID", ""))
        prod_id = raw_prod_id if raw_prod_id is not None and str(raw_prod_id) in valid_product_ids else None

        qty = parse_int(r.get("Quantity", "")) or 0
        total_raw = parse_money(r.get("Total", "")) or parse_money(r.get("Amount", "")) or 0
        total = _normalize_access_money(total_raw)
        unit_price = 0.0
        if qty:
            try:
                unit_price = float(total) / float(qty)
            except Exception:
                unit_price = 0.0

        raw_cur = (r.get("Product_Currency", "") or "").strip().upper()
        detail_id = parse_int(r.get("ID_ID", ""))

        out.append(
            {
                "id": detail_id or "",
                "invoice_id": inv_id,
                "product_id": prod_id,
                "product_name": (r.get("Product_Description", "") or "").strip(),
                "quantity": qty,
                "unit_price": _cap12(unit_price),
                "currency": raw_cur if raw_cur in ("USD", "LBP") else "USD",
                "total": _cap12(float(total)),
            }
        )
    return "invoice_items", out


def prepare_expenses() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblExpenses.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        status_raw = (r.get("Status", "") or "").strip().lower()
        if status_raw in ("solved", "approved"):
            status = "approved"
        elif status_raw in ("rejected", "declined"):
            status = "rejected"
        else:
            status = "pending"
        out.append(
            {
                "id": parse_int(r.get("Expenses_ID", "")) or "",
                "supplier": (r.get("Supplier", "") or "").strip() or "Unknown",
                "amount_usd": (parse_money(r.get("AmountUSD", "")) or 0),
                "amount_lbp": 0,
                "description": (r.get("Description", "") or "").strip(),
                "note": (r.get("Notes", "") or "").strip(),
                "status": status,
                "submitted_by": "Unknown",
                "approved_by": "",
                "station": "Main Station",
                "created_at": parse_ts(r.get("ExpenseDate", "")) or None,
            }
        )
    return "expenses", out


def prepare_purchases() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblPurchaseHead.csv")
    suppliers_df = _read_csv(EXPORTS / "tblSuppliers.csv")
    details_df = _read_csv(EXPORTS / "tblPurchaseDetails.csv")

    supplier_map = {
        str(int(float(r["Supplier_ID"]))): (r.get("Supplier_Name", "") or "").strip()
        for _, r in suppliers_df.iterrows()
        if str(r.get("Supplier_ID", "")).strip()
    }

    # Group purchase details by Purchase_ID → JSONB array
    items_map: Dict[str, List[Dict]] = {}
    for _, r in details_df.iterrows():
        pid = str(parse_int(r.get("Purchase_ID", "")) or "")
        if not pid:
            continue
        raw_cur = (r.get("PurchaseCurrency", "") or "").strip().upper()
        item = {
            "product_id": parse_int(r.get("P_ID", "")),
            "description": (r.get("Product_Description", "") or "").strip(),
            "qty": parse_int(r.get("Qty", "")) or 0,
            "unit_cost": parse_money(r.get("Unit_Cost", "")) or 0,
            "total": parse_money(r.get("Total", "")) or 0,
            "currency": raw_cur if raw_cur in ("USD", "LBP") else "USD",
        }
        items_map.setdefault(pid, []).append(item)

    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        purchase_id = parse_int(r.get("Purchase_ID", "")) or ""
        raw_sup_id = parse_int(r.get("Supplier_ID", ""))
        supplier_name = supplier_map.get(str(raw_sup_id), "") if raw_sup_id is not None else ""
        out.append(
            {
                "id": purchase_id,
                "supplier_id": raw_sup_id if raw_sup_id is not None and str(raw_sup_id) in supplier_map else None,
                "supplier_name": supplier_name or "Unknown",
                "total_usd": parse_money(r.get("Total_USD", "")) or 0,
                "total_lbp": 0,
                "paid_usd": parse_money(r.get("Paid_USD", "")) or 0,
                "paid_lbp": 0,
                "items": json.dumps(items_map.get(str(purchase_id), []), ensure_ascii=False),
                "created_by": (r.get("Username", "") or "Unknown").strip() or "Unknown",
                "station": "Main Station",
                "created_at": parse_ts(r.get("Purchase_Date", "")) or parse_ts(r.get("TimeSaved", "")) or None,
            }
        )
    return "purchases", out


def prepare_receivables() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblClientReceivables.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        status_raw = (r.get("Status", "") or "").strip().lower()
        status = "collected" if status_raw == "solved" else "pending"
        out.append(
            {
                "id": parse_int(r.get("ReceivableID", "")) or "",
                "client_name": (r.get("ClientName", "") or "Unknown").strip() or "Unknown",
                "amount_usd": _cap12(parse_money(r.get("AmountUSD", "")) or 0),
                "reason": (r.get("Reason", "") or "").strip(),
                "note": (r.get("Notes", "") or "").strip(),
                "status": status,
                "created_by": "Unknown",
                "created_at": parse_ts(r.get("ReceivableDate", "")) or None,
            }
        )
    return "receivables", out


def prepare_taxi_trips() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblTaxiTransactions.csv")
    taxi_df = _read_csv(EXPORTS / "tblTaxiAccounts.csv")
    clients_df = _read_csv(EXPORTS / "tblClients.csv")

    name_map = _client_name_map(clients_df)
    # TaxiAccountID → client name
    taxi_name: Dict[str, str] = {}
    for _, r in taxi_df.iterrows():
        tid = str(parse_int(r.get("TaxiAccountID", "")) or "")
        cid = str(parse_int(r.get("ClientID", "")) or "")
        if tid and cid:
            taxi_name[tid] = name_map.get(cid, f"Account #{tid}")

    def driver_name(did: Optional[int]) -> str:
        if did is None:
            return "Unknown"
        return taxi_name.get(str(did), f"Driver #{did}")

    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        trans_id = parse_int(r.get("TransID", ""))
        driver_id = parse_int(r.get("DriverID", ""))
        amount_paid = parse_money(r.get("AmountPaid", "")) or 0
        amount_received = parse_money(r.get("AmountReceived", "")) or 0
        amount_lbp = amount_paid if amount_paid else amount_received

        creation_date = r.get("CreationDate", "") or ""
        creation_time = r.get("CreationTime", "") or ""
        trip_date = (parse_ts(creation_date) or "")[:10] or None
        created_at = _combine_dt(creation_date, creation_time)

        out.append(
            {
                "id": trans_id or "",
                "driver_name": driver_name(driver_id),
                "trip_date": trip_date,
                "amount_usd": 0,
                "amount_lbp": _cap16(amount_lbp),
                "payment_method": (r.get("TransactionType", "") or "Cash").strip() or "Cash",
                "route": "",
                "note": (r.get("Description", "") or "").strip(),
                "created_by": (r.get("CreatedBy", "") or "Unknown").strip() or "Unknown",
                "created_at": created_at,
            }
        )
    return "taxi_trips", out


def prepare_pnl_entries() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblPNL.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        pnl_id = parse_int(r.get("PNL_ID", ""))
        count_date = r.get("CountDate", "") or ""
        count_time = r.get("CountTime", "") or ""
        entry_date = (parse_ts(count_date) or "")[:10] or None
        created_at = _combine_dt(count_date, count_time)

        def _u(field: str) -> float:
            return _cap12(parse_money(r.get(field, "")) or 0)

        def _l(field: str) -> int:
            return _cap16(parse_money(r.get(field, "")) or 0)

        out.append(
            {
                "id": pnl_id or "",
                "entry_date": entry_date,
                "usd_cms": _u("AccessoriesUSD"),
                "usd_whish": _u("AppUSD"),
                "usd_cash": _u("CashUSD"),
                "usdt": _u("USDT"),
                "alfa_dollars": _u("AlfaUSD"),
                "touch_dollars": _u("TouchUSD"),
                "lbp_cms": _l("AppLBP"),
                "lbp_whish": 0,
                "lbp_cash": _l("CashLBP"),
                "commission_usd": _u("ComissionUSD"),
                "commission_lbp": _l("ComissionLBP"),
                "note": (r.get("Notes", "") or "").strip(),
                "total_usd": _u("PNL_ResultUSD"),
                "shift_profit": 0,
                "day_profit": _u("PNL_ResultUSD"),
                "created_by": "system",
                "station": "Main Station",
                "created_at": created_at,
            }
        )
    return "pnl_entries", out


def prepare_audit_log() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblLogs.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        log_id = parse_int(r.get("ID", ""))
        desc = (r.get("Description", "") or "").strip()
        action = desc.split(" ")[0] if desc else "Log"
        log_date = r.get("LogDate", "") or ""
        log_time = r.get("LogTime", "") or ""
        created_at = _combine_dt(log_date, log_time)
        out.append(
            {
                "id": log_id or "",
                "action": action or "Log",
                "module": "",
                "detail": desc,
                "user_name": (r.get("Username", "") or "Unknown").strip() or "Unknown",
                "station": (r.get("ComputerName", "") or "").strip(),
                "ip_address": "",
                "created_at": created_at,
            }
        )
    return "audit_log", out


def prepare_s14_stamps() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblStamps.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        out.append(
            {
                "id": parse_int(r.get("StampID", "")) or "",
                "customer_name": (r.get("ClientName", "") or "").strip(),
                "quantity": 1,
                "amount_usd": 0,
                "amount_lbp": 0,
                "reference": str(r.get("FinanceID", "") or "").strip(),
                "note": (r.get("Mobile", "") or "").strip(),
                "created_by": "Unknown",
                "station": (r.get("Zone", "") or "").strip(),
                "created_at": None,
            }
        )
    return "s14_stamps", out


def prepare_shifts() -> Tuple[str, List[Dict[str, Any]]]:
    df = _read_csv(EXPORTS / "tblStockCashAndPhysical.csv")
    out: List[Dict[str, Any]] = []
    for _, r in df.iterrows():
        shift_id = parse_int(r.get("ID", ""))
        stock_cash = _cap12(parse_money(r.get("StockCash", "")) or 0)
        stock_physical = _cap12(parse_money(r.get("StockPhysical", "")) or 0)
        is_shift_close = norm_bool(r.get("IsShiftClose", ""))
        is_opening = norm_bool(r.get("IsOpening", ""))
        check_ts = parse_ts(r.get("CheckDate", "")) or None
        status = "closed" if is_shift_close else "open"
        out.append(
            {
                "id": shift_id or "",
                "user_name": "Unknown",
                "station": "Main Station",
                "opened_at": check_ts if is_opening else None,
                "closed_at": check_ts if is_shift_close else None,
                "expected_cash_usd": stock_physical,
                "counted_cash_usd": stock_cash,
                "difference_usd": _cap12(stock_cash - stock_physical),
                "status": status,
                "note": (r.get("ShiftLabel", "") or "").strip(),
            }
        )
    return "shifts", out


# ─── Field order per Supabase table ──────────────────────────────────────────

FIELDS: Dict[str, List[str]] = {
    "clients": ["id", "full_name", "mobile", "debt_status", "usd_balance", "lbp_balance", "notes", "created_at"],
    "suppliers": ["id", "name", "contact_person", "mobile", "address", "usd_balance", "created_at"],
    "products": ["id", "description", "category", "sub_category", "brand", "currency", "cost", "selling", "quantity", "active", "created_at"],
    "invoices": ["id", "client_id", "client_name", "total_usd", "total_lbp", "payment_method", "status", "void_reason", "void_requested_by", "void_approved_by", "created_by", "station", "created_at"],
    "invoice_items": ["id", "invoice_id", "product_id", "product_name", "quantity", "unit_price", "currency", "total"],
    "expenses": ["id", "supplier", "amount_usd", "amount_lbp", "description", "note", "status", "submitted_by", "approved_by", "station", "created_at"],
    "purchases": ["id", "supplier_id", "supplier_name", "total_usd", "total_lbp", "paid_usd", "paid_lbp", "items", "created_by", "station", "created_at"],
    "receivables": ["id", "client_name", "amount_usd", "reason", "note", "status", "created_by", "created_at"],
    "taxi_trips": ["id", "driver_name", "trip_date", "amount_usd", "amount_lbp", "payment_method", "route", "note", "created_by", "created_at"],
    "pnl_entries": ["id", "entry_date", "usd_cms", "usd_whish", "usd_cash", "usdt", "alfa_dollars", "touch_dollars", "lbp_cms", "lbp_whish", "lbp_cash", "commission_usd", "commission_lbp", "note", "total_usd", "shift_profit", "day_profit", "created_by", "station", "created_at"],
    "audit_log": ["id", "action", "module", "detail", "user_name", "station", "ip_address", "created_at"],
    "s14_stamps": ["id", "customer_name", "quantity", "amount_usd", "amount_lbp", "reference", "note", "created_by", "station", "created_at"],
    "shifts": ["id", "user_name", "station", "opened_at", "closed_at", "expected_cash_usd", "counted_cash_usd", "difference_usd", "status", "note"],
}

PREPARERS = [
    prepare_clients,
    prepare_suppliers,
    prepare_products,
    prepare_invoices,
    prepare_invoice_items,
    prepare_expenses,
    prepare_purchases,
    prepare_receivables,
    prepare_taxi_trips,
    prepare_pnl_entries,
    prepare_audit_log,
    prepare_s14_stamps,
    prepare_shifts,
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    findings = load_findings()

    results: Dict[str, int] = {}
    for fn in PREPARERS:
        table, rows = fn()
        results[table] = len(rows)
        fields = FIELDS.get(table) or sorted({k for r in rows for k in r.keys()})
        _write_csv(OUT / f"{table}.csv", rows, fields)
        print(f"  {table}: {len(rows)} rows")

    report = {
        "source_access": findings.source,
        "access_exported_at": findings.exported_at,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "supabase_schema_source": "allway_complete_schema.sql",
        "generated_files": {k: f"supabase_import/{k}.csv" for k in results},
        "row_counts": results,
        "notes": [
            "clients/usd_balance+lbp_balance, invoices totals, and invoice_items totals are normalized from Access scaled units (/10000).",
            "payment_method derived from tblPayments (LBP_Received / USD_Received per first Payment_ID).",
            "purchases.items populated as JSONB from tblPurchaseDetails grouped by Purchase_ID.",
            "invoice_items and expenses now carry stable Access IDs for idempotent upsert.",
            "receivables: Status='Solved' maps to 'collected'; all others to 'pending'.",
            "taxi_trips: amounts stored as LBP (amount_usd=0); DriverID resolved via tblTaxiAccounts→tblClients.",
            "pnl_entries: AccessoriesUSD→usd_cms, AppUSD→usd_whish, AppLBP→lbp_cms, CashLBP→lbp_cash.",
            "audit_log: LogTime OLE-epoch date stripped; combined with LogDate for created_at.",
            "s14_stamps: financial amounts not in Access; amount_usd/lbp default 0.",
            "shifts: mapped from tblStockCashAndPhysical; user_name defaulted to 'Unknown'.",
            "Tables with no Access equivalent (whish_transactions, recharge_cards, internet_recharges, whish_balances, inventory_checks) are not imported.",
        ],
    }
    (OUT / "_import_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nWrote", OUT)
    print(json.dumps(report["row_counts"], indent=2))


if __name__ == "__main__":
    main()
