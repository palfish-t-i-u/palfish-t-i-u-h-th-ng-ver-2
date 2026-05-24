#!/usr/bin/env python3
"""Compare sheet tabs row counts and Apr 2026 Inhouse 1 totals."""

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
    _cell,
    _parse_pay_time,
    _parse_date,
    _to_int_vnd,
    fetch_gsheet_tab_values,
    map_sm_hanoi_row,
)


def count_tab(tab: str, team_cache: TeamLookupCache) -> dict:
    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab=tab)
    payloads = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        if tab == "SM Hanoi":
            p = map_sm_hanoi_row(team_cache, row, tab=tab)
        else:
            continue
        if p:
            payloads.append(p)
    apr_i1 = [
        p
        for p in payloads
        if "2026-04-01" <= (p.get("pay_time") or "")[:10] <= "2026-04-30"
        and (p.get("team") or "") == "Inhouse 1"
    ]
    return {
        "tab": tab,
        "total_rows": len(raw) - 1,
        "mapped": len(payloads),
        "apr_i1_n": len(apr_i1),
        "apr_i1_gmv": sum(float(p.get("gmv_rmb") or 0) for p in apr_i1),
    }


def sm_hanoi_by_source(team_cache: TeamLookupCache) -> None:
    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="SM Hanoi")
    apr_rows = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        vnd = _to_int_vnd(_cell(row, 10))
        if vnd <= 0:
            continue
        bank_day = _parse_date(_cell(row, 0))
        pay_time = _parse_pay_time(_cell(row, 8), bank_day)
        pay = (pay_time.isoformat() if pay_time else "")[:10]
        if not ("2026-04-01" <= pay <= "2026-04-30"):
            continue
        p = map_sm_hanoi_row(team_cache, row, tab="SM Hanoi")
        if not p or (p.get("team") or "") != "Inhouse 1":
            continue
        source = str(_cell(row, 19) or "").strip() or "(blank)"
        approved = str(_cell(row, 20) or "").strip() or "(blank)"
        apr_rows.append({**p, "source": source, "approved": approved})

    print(f"\nSM Hanoi Apr Inhouse1 by Source (col 19): {len(apr_rows)} rows")
    by_src: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
    for r in apr_rows:
        by_src[r["source"]]["n"] += 1
        by_src[r["source"]]["gmv"] += float(r.get("gmv_rmb") or 0)
    for k, v in sorted(by_src.items(), key=lambda x: -x[1]["n"]):
        print(f"  {k}: {v['n']} / {float(v['gmv']):.2f}")

    print("\nBy 已批工单 (col 20):")
    by_ap: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
    for r in apr_rows:
        by_ap[r["approved"]]["n"] += 1
        by_ap[r["approved"]]["gmv"] += float(r.get("gmv_rmb") or 0)
    for k, v in sorted(by_ap.items(), key=lambda x: -x[1]["n"]):
        print(f"  {k}: {v['n']} / {float(v['gmv']):.2f}")


def tab_totals() -> None:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    tabs = ["SM Hanoi", "HCM REV", "HCM", "HN Inhouse 1", "ALL SUM"]
    print("=== Tab row counts ===")
    for tab in tabs:
        try:
            raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab=tab)
            print(f"  {tab}: {len(raw) - 1} data rows")
        except Exception as exc:
            print(f"  {tab}: ERROR {exc}")

    sm = count_tab("SM Hanoi", team_cache)
    print(f"\nSM Hanoi mapped={sm['mapped']}, Apr I1={sm['apr_i1_n']}/{sm['apr_i1_gmv']:.2f}")

    sm_hanoi_by_source(team_cache)


def main() -> int:
    tab_totals()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
