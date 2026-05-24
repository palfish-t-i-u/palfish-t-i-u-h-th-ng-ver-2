#!/usr/bin/env python3
"""Find rows causing BC02 vs GMV tab order count diff — Apr 2026 Inhouse 1."""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    _parse_sheet_number,
    fetch_gsheet_tab_values,
    map_sm_hanoi_row,
)
from revenue_routes import bc02_type_from_row, team_to_canonical


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="SM Hanoi")
    payloads = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        p = map_sm_hanoi_row(team_cache, row, tab="SM Hanoi")
        if p:
            payloads.append(p)

    def pay_day(p: dict) -> str:
        return (p.get("pay_time") or "")[:10]

    def bank_day(p: dict) -> str:
        return (p.get("ngay_tien_ve") or "")[:10]

    apr_pay = [p for p in payloads if pay_day(p) >= "2026-04-01" and pay_day(p) <= "2026-04-30"]
    apr_bank = [p for p in payloads if bank_day(p) >= "2026-04-01" and bank_day(p) <= "2026-04-30"]
    i1_pay = [p for p in apr_pay if (p.get("team") or "") == "Inhouse 1"]
    i1_bank = [p for p in apr_bank if (p.get("team") or "") == "Inhouse 1"]

    print(f"Inhouse 1 Apr by pay_time: {len(i1_pay)} orders")
    print(f"Inhouse 1 Apr by bank day: {len(i1_bank)} orders")

    # GMV tab daily order counts
    gmv_rows = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="GMV")
    gmv_daily: dict[str, int] = {}
    for row in gmv_rows:
        if not row:
            continue
        a = str(row[0]).strip()
        if re.match(r"^2026[/-]4[/-]\d{1,2}$", a):
            parts = re.split(r"[/-]", a)
            d = int(parts[-1])
            dk = f"2026-04-{d:02d}"
            gmv_daily[dk] = int(_parse_sheet_number(row[1] if len(row) > 1 else 0) or 0)

    by_pay: dict[str, list[dict]] = defaultdict(list)
    by_bank: dict[str, list[dict]] = defaultdict(list)
    for p in i1_pay:
        by_pay[pay_day(p)].append(p)
    for p in i1_bank:
        by_bank[bank_day(p)].append(p)

    print("\nDay | GMVtab | pay_time | bank_day | diff pay | diff bank")
    for dk in sorted(set(gmv_daily) | set(by_pay) | set(by_bank)):
        g = gmv_daily.get(dk, 0)
        pc = len(by_pay.get(dk, []))
        bc = len(by_bank.get(dk, []))
        if g != pc or g != bc:
            print(f"  {dk}: GMV={g} pay={pc} bank={bc} (1pay={bc - pc}")

    # pay in apr but bank outside apr
    cross = [
        p
        for p in payloads
        if (p.get("team") or "") == "Inhouse 1"
        and pay_day(p) >= "2026-04-01"
        and pay_day(p) <= "2026-04-30"
        and (bank_day(p) < "2026-04-01" or bank_day(p) > "2026-04-30")
    ]
    cross2 = [
        p
        for p in payloads
        if (p.get("team") or "") == "Inhouse 1"
        and bank_day(p) >= "2026-04-01"
        and bank_day(p) <= "2026-04-30"
        and (pay_day(p) < "2026-04-01" or pay_day(p) > "2026-04-30")
    ]
    print(f"\nInhouse1 pay in Apr, bank outside: {len(cross)}")
    for p in cross:
        print(
            f"  pay={pay_day(p)} bank={bank_day(p)} gmv={p.get('gmv_rmb')} "
            f"{p.get('ten_khach')} type={p.get('loai')} sale={p.get('sale_crm_name')}"
        )
    print(f"Inhouse1 bank in Apr, pay outside: {len(cross2)}")
    for p in cross2:
        print(
            f"  pay={pay_day(p)} bank={bank_day(p)} gmv={p.get('gmv_rmb')} "
            f"{p.get('ten_khach')} type={p.get('loai')} sale={p.get('sale_crm_name')}"
        )

    # Match GMV tab exactly: try bank_day bucket Inhouse 1
    bank_total = len(i1_bank)
    bank_gmv = sum(float(p.get("gmv_rmb") or 0) for p in i1_bank)
    print(f"\nIf GMV tab uses bank_day: {bank_total} orders, {bank_gmv:.2f} RMB")

    # Rows in pay bucket but not in bank bucket for same month
    pay_fps = {(pay_day(p), p.get("uid"), p.get("so_tien_vnd"), p.get("sale_crm_name")) for p in i1_pay}
    bank_fps = {(bank_day(p), p.get("uid"), p.get("so_tien_vnd"), p.get("sale_crm_name")) for p in i1_bank}

    # per-day: find rows where GMV tab matches bank count
    bank_matches_gmv = sum(
        1 for dk in gmv_daily if len(by_bank.get(dk, [])) == gmv_daily[dk]
    )
    pay_matches_gmv = sum(
        1 for dk in gmv_daily if len(by_pay.get(dk, [])) == gmv_daily[dk]
    )
    print(f"Days where GMV count matches bank_day bucket: {bank_matches_gmv}/30")
    print(f"Days where GMV count matches pay_time bucket: {pay_matches_gmv}/30")

    # Find specific rows: for days where pay != GMV, list extra rows
    print("\nExtra rows by pay_time vs GMV tab (sample days):")
    for dk in ("2026-04-21", "2026-04-29", "2026-04-14"):
        g = gmv_daily.get(dk, 0)
        rows = by_pay.get(dk, [])
        print(f"\n  {dk}: GMV={g}, pay_rows={len(rows)}")
        for p in rows:
            tl = bc02_type_from_row(p.get("loai"), p.get("loai_2"))
            print(
                f"    gmv={p.get('gmv_rmb')} bank={bank_day(p)} type={p.get('loai')}/{tl} "
                f"{p.get('ten_khach')} sale={p.get('sale_crm_name')}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
