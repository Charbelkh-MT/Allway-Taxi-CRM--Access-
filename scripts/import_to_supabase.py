import csv
import os
import time
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests


ROOT = Path(__file__).resolve().parents[1]
IN_DIR = ROOT / "supabase_import"


def _env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        raise SystemExit(f"Missing required env var: {name}")
    return v


def _read_csv(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        rows = []
        for row in r:
            # normalize empty strings to None for Supabase
            rows.append({k: (None if (v is None or str(v).strip() == "") else v) for k, v in row.items()})
        return rows


def _chunks(xs: List[Dict[str, Any]], n: int) -> Iterable[List[Dict[str, Any]]]:
    for i in range(0, len(xs), n):
        yield xs[i : i + n]


def _dedup(rows: List[Dict[str, Any]], key: str) -> List[Dict[str, Any]]:
    seen: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        k = r.get(key)
        if k is not None:
            seen[str(k)] = r
    return list(seen.values())


def _post_rows(
    *,
    session: requests.Session,
    base_url: str,
    api_key: str,
    table: str,
    rows: List[Dict[str, Any]],
    upsert: bool,
    on_conflict: Optional[str],
    batch_size: int = 500,
) -> None:
    if not rows:
        return

    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"

    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    if upsert:
        headers["Prefer"] = "resolution=merge-duplicates,return=minimal"

    for batch in _chunks(rows, batch_size):
        resp = session.post(url, headers=headers, json=batch, timeout=120)
        if not resp.ok:
            raise RuntimeError(f"Insert failed for {table}: {resp.status_code} {resp.text[:500]}")
        # small pause to avoid rate-limits
        time.sleep(0.1)


def main() -> None:
    """
    Imports the generated Supabase-ready CSVs from `supabase_import/` into Supabase via REST.

    Required env vars:
      - SUPABASE_URL
      - SUPABASE_SERVICE_ROLE_KEY (recommended) OR SUPABASE_ANON_KEY (only if your DB is open)
    """
    base_url = _env("SUPABASE_URL")
    api_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or _env("SUPABASE_ANON_KEY")

    # import order matters for foreign keys; all tables upsert on 'id' for idempotency
    plan: List[Tuple[str, str, bool, Optional[str]]] = [
        # ── reference / lookup tables first ──────────────────────────────
        ("clients",       "clients.csv",       True, "id"),
        ("suppliers",     "suppliers.csv",      True, "id"),
        ("products",      "products.csv",       True, "id"),
        # ── transactional tables ─────────────────────────────────────────
        ("invoices",      "invoices.csv",       True, "id"),
        ("invoice_items", "invoice_items.csv",  True, "id"),   # ID_ID from Access
        ("expenses",      "expenses.csv",        True, "id"),   # Expenses_ID from Access
        ("purchases",     "purchases.csv",       True, "id"),
        # ── additional modules ───────────────────────────────────────────
        ("receivables",   "receivables.csv",    True, "id"),
        ("taxi_trips",    "taxi_trips.csv",     True, "id"),
        ("pnl_entries",   "pnl_entries.csv",    True, "id"),
        ("audit_log",     "audit_log.csv",      True, "id"),
        ("s14_stamps",    "s14_stamps.csv",     True, "id"),
        ("shifts",        "shifts.csv",         True, "id"),
    ]

    s = requests.Session()
    for table, filename, upsert, on_conflict in plan:
        path = IN_DIR / filename
        if not path.exists():
            print(f"skip {table}: missing {path}")
            continue
        rows = _read_csv(path)
        if on_conflict:
            before = len(rows)
            rows = _dedup(rows, on_conflict)
            if len(rows) < before:
                print(f"  deduped {before - len(rows)} duplicate {on_conflict} values")
        print(f"import {table}: {len(rows)} rows")
        _post_rows(
            session=s,
            base_url=base_url,
            api_key=api_key,
            table=table,
            rows=rows,
            upsert=upsert,
            on_conflict=on_conflict,
            batch_size=500,
        )

    print("done")


if __name__ == "__main__":
    main()

