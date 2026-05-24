#!/usr/bin/env python3
"""Compare All File GMV pivot tab vs BC02 / SM Hanoi source."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    _parse_sheet_number,
    fetch_gsheet_tab_values,
)
from revenue_routes import _build_key_data_pivot, _fetch_so_doanh_thu


def main() -> int:
    from supabase import create_client

    rows = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="GMV")
    print(f"GMV tab rows: {len(rows)}")

    apr_summary = None
    apr_daily: list[tuple[int, list, str]] = []
    for i, row in enumerate(rows):
        if not row:
            continue
        a = str(row[0]).strip()
        if a in ("2026/4", "2026/04", "2026-04"):
            apr_summary = (i + 1, row)
        if re.match(r"^2026[/-]4[/-]\d{1,2}$", a):
            apr_daily.append((i + 1, row, a))

    print(f"Apr summary row: {apr_summary[0] if apr_summary else None}")
    if apr_summary:
        r = apr_summary[1]
        b = _parse_sheet_number(r[1] if len(r) > 1 else None)
        c = _parse_sheet_number(r[2] if len(r) > 2 else None)
        print(f"  B orders={b}, C GMV={c}")

    print(f"Apr daily rows: {len(apr_daily)}")
    sum_orders = 0
    sum_gmv = 0.0
    for _, row, _a in apr_daily:
        b = int(_parse_sheet_number(row[1] if len(row) > 1 else 0) or 0)
        c = float(_parse_sheet_number(row[2] if len(row) > 2 else 0) or 0)
        sum_orders += b
        sum_gmv += c
    print(f"Sum of daily B/C: orders={sum_orders}, GMV={sum_gmv:.2f}")

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    db_rows = _fetch_so_doanh_thu(
        sb,
        "pay_time, gmv_rmb, loai, loai_2, team, team_pivot_label",
        from_date="2026-04-01",
        to_date="2026-04-30",
    )
    pivot = _build_key_data_pivot(db_rows, team_filter="Inhouse 1")
    gt = pivot["grandTotal"]
    print(f"BC02 Inhouse1: orders={gt['totalOrders']}, GMV={gt['totalGmv']}")

    by_day_db = {r["date"]: (r["totalOrders"], r["totalGmv"]) for r in pivot["rows"]}
    by_day_gmv: dict[str, tuple[int, float]] = {}
    for _rn, row, a in apr_daily:
        parts = re.split(r"[/-]", a)
        d = int(parts[-1])
        dk = f"2026-04-{d:02d}"
        b = int(_parse_sheet_number(row[1] if len(row) > 1 else 0) or 0)
        c = float(_parse_sheet_number(row[2] if len(row) > 2 else 0) or 0)
        by_day_gmv[dk] = (b, c)

    print("\nDays with diff (GMV tab vs BC02):")
    diff_orders = 0
    diff_gmv = 0.0
    for dk in sorted(set(by_day_db) | set(by_day_gmv)):
        dbv = by_day_db.get(dk, (0, 0))
        gmv = by_day_gmv.get(dk, (0, 0))
        if dbv[0] != gmv[0] or abs(dbv[1] - gmv[1]) > 0.01:
            diff_orders += dbv[0] - gmv[0]
            diff_gmv += dbv[1] - gmv[1]
            print(
                f"  {dk}: GMVtab {gmv[0]}/{gmv[1]:.2f} vs BC02 {dbv[0]}/{dbv[1]:.2f} "
                f"diff orders={dbv[0] - gmv[0]} gmv={dbv[1] - gmv[1]:.2f}"
            )
    print(f"\nTotal diff: orders={diff_orders}, GMV={diff_gmv:.2f}")

    # Full GMV tab columns A-T
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    cred_path = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"].strip().strip('"').strip("'")
    creds = service_account.Credentials.from_service_account_file(
        cred_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    sid = DEFAULT_SPREADSHEET_ID
    hdr = service.spreadsheets().values().get(spreadsheetId=sid, range="'GMV'!A1:T3").execute()
    print("\nGMV headers A-T:")
    for i, row in enumerate(hdr.get("values", [])):
        print(f"  row{i+1}: {row}")
    r36 = service.spreadsheets().values().get(spreadsheetId=sid, range="'GMV'!A36:T36").execute()
    print(f"Apr summary A-T: {r36.get('values', [[]])[0]}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
