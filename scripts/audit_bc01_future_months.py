#!/usr/bin/env python3
"""Trace BC01 GMV in future month columns (e.g. 2026/7, 2026/10) back to Google Sheet rows.

BC01 filters by pay_time but buckets months by ngay_tien_ve (bank day, col A).
This script finds rows where pay_time is in the filter window but ngay_tien_ve
falls in target months, then optionally matches sheet tab row numbers.

Usage:
  # From Supabase Sổ (needs SUPABASE_* in backend/.env):
  python scripts/audit_bc01_future_months.py --from 2026-01-01 --to 2026-05-25

  # From Google Sheet live (needs GOOGLE_SERVICE_ACCOUNT_JSON):
  python scripts/audit_bc01_future_months.py --from 2026-01-01 --to 2026-05-25 --source sheet

  # Both:
  python scripts/audit_bc01_future_months.py --from 2026-01-01 --to 2026-05-25 --source both
"""

from __future__ import annotations

import argparse
import os
import sys

# Windows console: avoid UnicodeEncodeError on Vietnamese customer names
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (  # noqa: E402
    DEFAULT_SPREADSHEET_ID,
    DEFAULT_SHEET_TABS,
    _cell,
    _parse_date,
    _parse_pay_time,
    _to_float_gmv,
    _to_int_vnd,
    fetch_gsheet_tab_values,
)
from revenue_routes import _month_key, team_to_canonical  # noqa: E402

# SM Hanoi column letters (1-based) for human-readable output
SM_HANOI_COLS = {
    "bank_day": "A",
    "bank_time": "B",
    "pay_time": "I",
    "real_pay_vnd": "K",
    "gmv_rmb": "L",
    "type": "O",
    "sales": "V",
    "month_of_payment": "R",
}


def _parse_iso_day(s: str) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _pay_day_from_row(r: dict) -> date | None:
    p = r.get("pay_time") or ""
    if p:
        try:
            return datetime.fromisoformat(str(p).replace("Z", "+00:00")[:19]).date()
        except ValueError:
            pass
        return _parse_iso_day(str(p))
    return None


def _in_pay_window(pay: date | None, fr: date | None, to: date | None) -> bool:
    if not pay:
        return False
    if fr and pay < fr:
        return False
    if to and pay > to:
        return False
    return True


def fetch_supabase_rows() -> list[dict]:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key or key == "YOUR_SERVICE_ROLE_KEY":
        raise SystemExit(
            "Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env\n"
            "Lấy service_role: Supabase → Project Settings → API → Legacy → service_role"
        )
    sb = create_client(url, key)
    rows: list[dict] = []
    offset = 0
    while True:
        chunk = (
            sb.table("so_doanh_thu")
            .select(
                "id, ngay_tien_ve, pay_time, gmv_rmb, so_tien_vnd, "
                "sale_crm_name, team, team_pivot_label, ten_khach, uid, "
                "created_by_email, loai"
            )
            .order("pay_time", desc=True)
            .order("id", desc=True)
            .range(offset, offset + 999)
            .execute()
            .data
            or []
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def _sheet_row_hit(tab: str, row: list, sheet_row_1based: int, fr: date | None, to: date | None) -> dict | None:
    """Parse one sheet row without Supabase (same cols as gsheet_ledger_import)."""
    if tab == "SM Hanoi":
        vnd = _to_int_vnd(_cell(row, 10))
        if vnd <= 0:
            return None
        bank_day = _parse_date(_cell(row, 0))
        pay_time = _parse_pay_time(_cell(row, 8), bank_day)
        ngay = bank_day or (pay_time.date() if pay_time else None)
        gmv_col = 11
        sale_i, loai_i = 21, 14
    else:  # HCM REV
        vnd = _to_int_vnd(_cell(row, 9))
        if vnd <= 0:
            return None
        bank_day = _parse_date(_cell(row, 0))
        pay_time = _parse_pay_time(_cell(row, 8), bank_day)
        ngay = bank_day or (pay_time.date() if pay_time else _parse_date(_cell(row, 15)))
        gmv_col = 10
        sale_i, loai_i = 13, 12
    if not ngay:
        return None
    pay = pay_time.date() if pay_time else None
    if not _in_pay_window(pay, fr, to):
        return None
    mk = _month_key(ngay)
    if mk not in TARGET_MONTHS:
        return None
    from revenue_routes import vnd_to_rmb  # noqa: E402

    gmv_hint = _to_float_gmv(_cell(row, gmv_col))
    gmv = gmv_hint if gmv_hint and gmv_hint > 0 else vnd_to_rmb(vnd)
    return {
        "source": f"sheet:{tab}",
        "sheet_row": sheet_row_1based,
        "tab": tab,
        "bank_day_raw": _cell(row, 0),
        "pay_time_raw": _cell(row, 8),
        "ngay_tien_ve": ngay.isoformat(),
        "pay_time": pay.isoformat() if pay else None,
        "month_bucket": mk,
        "gmv_rmb": float(gmv),
        "gmv_sheet_col": gmv_hint,
        "so_tien_vnd": vnd,
        "sale": str(_cell(row, sale_i) or "").strip() or None,
        "team": "(sheet only — cần Supabase để map team)",
        "ten_khach": str(_cell(row, 3) or "").strip(),
        "uid": str(_cell(row, 5) or "").strip() or None,
        "loai": str(_cell(row, loai_i) or "").strip() or None,
    }


def scan_sheet_rows(fr: date | None, to: date | None) -> list[dict]:
    cred = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip().strip('"').strip("'")
    if not cred or not os.path.isfile(cred):
        raise SystemExit(
            "Thiếu GOOGLE_SERVICE_ACCOUNT_JSON (đường dẫn file JSON service account).\n"
            "Xem docs/M5_GSHEET_IMPORT.md — share sheet Viewer cho email trong JSON."
        )
    sid = os.getenv("GOOGLE_SHEETS_ID", DEFAULT_SPREADSHEET_ID).strip()
    hits: list[dict] = []

    for tab in DEFAULT_SHEET_TABS:
        raw = fetch_gsheet_tab_values(spreadsheet_id=sid, tab=tab)
        for sheet_row_1based, row in enumerate(raw, start=1):
            if sheet_row_1based == 1:
                continue
            hit = _sheet_row_hit(tab, row, sheet_row_1based, fr, to)
            if hit:
                hits.append(hit)
    return hits


def analyze_db(rows: list[dict], fr: date | None, to: date | None) -> list[dict]:
    hits: list[dict] = []
    for r in rows:
        pay = _pay_day_from_row(r)
        ngay = _parse_iso_day(r.get("ngay_tien_ve") or "")
        if not ngay or not _in_pay_window(pay, fr, to):
            continue
        mk = _month_key(ngay)
        if mk not in TARGET_MONTHS:
            continue
        hits.append(
            {
                "source": "supabase",
                "id": r.get("id"),
                "ngay_tien_ve": ngay.isoformat(),
                "pay_time": pay.isoformat() if pay else None,
                "month_bucket": mk,
                "gmv_rmb": float(r.get("gmv_rmb") or 0),
                "so_tien_vnd": int(r.get("so_tien_vnd") or 0),
                "sale": r.get("sale_crm_name"),
                "team": team_to_canonical(r.get("team"), r.get("team_pivot_label")),
                "ten_khach": r.get("ten_khach"),
                "uid": r.get("uid"),
                "loai": r.get("loai"),
                "created_by_email": r.get("created_by_email"),
            }
        )
    return hits


def print_hits(label: str, hits: list[dict]) -> None:
    by_month: dict[str, list[dict]] = defaultdict(list)
    for h in hits:
        by_month[h["month_bucket"]].append(h)

    print(f"\n=== {label} ({len(hits)} rows) ===")
    if not hits:
        print("  (no rows)")
        return

    for mk in sorted(by_month, key=lambda m: (int(m.split("/")[0]), int(m.split("/")[1]))):
        group = by_month[mk]
        total = round(sum(x["gmv_rmb"] for x in group), 2)
        print(f"\n  Month {mk}: {len(group)} row(s), GMV RMB total = {total:,.2f}")
        for h in sorted(group, key=lambda x: -x["gmv_rmb"]):
            if h.get("source", "").startswith("sheet"):
                loc = (
                    f"tab {h['tab']} row {h['sheet_row']} "
                    f"(col {SM_HANOI_COLS['bank_day']} bank day, {SM_HANOI_COLS['pay_time']} Pay Time, "
                    f"{SM_HANOI_COLS['gmv_rmb']} GMV)"
                )
                extra = (
                    f"bank={h.get('bank_day_raw')!r} pay={h.get('pay_time_raw')!r} "
                    f"sheet_gmv={h.get('gmv_sheet_col')}"
                )
            else:
                loc = f"Ledger id={str(h.get('id', ''))[:8]}... ({h.get('created_by_email', '')})"
                extra = ""
            print(
                f"    GMV {h['gmv_rmb']:,.2f} RMB | pay={h.get('pay_time')} | "
                f"ngay_tien_ve={h['ngay_tien_ve']} | {h.get('sale')} | {h.get('ten_khach')}"
            )
            print(f"      {loc}")
            if extra:
                print(f"      {extra}")


TARGET_MONTHS: set[str] = set()


def main() -> int:
    global TARGET_MONTHS
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--from", dest="from_date", default="2026-01-01")
    ap.add_argument("--to", dest="to_date", default="2026-05-25")
    ap.add_argument(
        "--months",
        default="2026/7,2026/10",
        help="Comma-separated month buckets to trace (default: 2026/7,2026/10)",
    )
    ap.add_argument(
        "--source",
        choices=("db", "sheet", "both"),
        default="both",
        help="db=Supabase Sổ, sheet=Google Sheet live, both=compare",
    )
    args = ap.parse_args()

    fr = _parse_iso_day(args.from_date)
    to = _parse_iso_day(args.to_date)
    TARGET_MONTHS = {m.strip() for m in args.months.split(",") if m.strip()}

    print("BC01 future-month trace")
    print(f"  Filter pay_time: {fr} -> {to}")
    print(f"  Month bucket (ngay_tien_ve) in {sorted(TARGET_MONTHS)}")
    print(f"  Sheet: https://docs.google.com/spreadsheets/d/{DEFAULT_SPREADSHEET_ID}")

    if args.source in ("db", "both"):
        db_rows = fetch_supabase_rows()
        db_hits = analyze_db(db_rows, fr, to)
        print_hits("Supabase so_doanh_thu", db_hits)

    if args.source in ("sheet", "both"):
        sheet_hits = scan_sheet_rows(fr, to)
        print_hits("Google Sheet (SM Hanoi + HCM REV)", sheet_hits)

    print(
        "\nOn sheet: filter Pay Time (col I) in filter range; "
        "check bank day (col A) = ngay_tien_ve used for BC01 month columns."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
