#!/usr/bin/env python3
"""Find 1-order gap after team backfill — Apr 2026 In-house."""

from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    SM_HANOI_COL_TEAM,
    TeamLookupCache,
    _cell,
    _parse_date,
    _parse_pay_time,
    _to_int_vnd,
    fetch_gsheet_tab_values,
    map_sm_hanoi_row,
    row_fingerprint,
)
from revenue_routes import _fetch_so_doanh_thu, team_to_canonical


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    db = _fetch_so_doanh_thu(
        sb,
        "id,pay_time,gmv_rmb,team,uid,sdt,sale_crm_name,ten_khach",
        from_date="2026-04-01",
        to_date="2026-04-30",
    )
    db_i1 = [r for r in db if (r.get("team") or "") == "Inhouse 1"]
    print(f"DB Inhouse1 Apr: {len(db_i1)} orders, GMV {sum(float(r.get('gmv_rmb') or 0) for r in db_i1):.2f}")

    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="SM Hanoi")
    tc = TeamLookupCache(sb)
    sheet: list[dict] = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        if _to_int_vnd(_cell(row, 10)) <= 0:
            continue
        bank = _parse_date(_cell(row, 0))
        pt = _parse_pay_time(_cell(row, 8), bank)
        if not pt or not (pt.year == 2026 and pt.month == 4):
            continue
        if str(_cell(row, SM_HANOI_COL_TEAM) or "").strip() != "In-house":
            continue
        p = map_sm_hanoi_row(tc, row)
        if p:
            sheet.append(p)

    print(f"Sheet In-house Apr raw: {len(sheet)} orders")
    fps_db = {row_fingerprint(r) for r in db_i1}
    sheet_fps = [row_fingerprint(p) for p in sheet]
    c = Counter(sheet_fps)
    dups = {fp: n for fp, n in c.items() if n > 1}
    print(f"Duplicate fingerprints on sheet: {len(dups)}")
    for fp, n in dups.items():
        rows = [p for p in sheet if row_fingerprint(p) == fp]
        p0 = rows[0]
        print(f"  DUP x{n}: {p0.get('ten_khach')} gmv={p0.get('gmv_rmb')} pay={(p0.get('pay_time') or '')[:10]}")

    only_sheet = [p for p in sheet if row_fingerprint(p) not in fps_db]
    print(f"On sheet not in DB: {len(only_sheet)}")
    for p in only_sheet:
        print(f"  {(p.get('pay_time') or '')[:10]} {p.get('gmv_rmb')} {p.get('ten_khach')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
