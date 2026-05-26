#!/usr/bin/env python3
"""Identify SM Hanoi rows excluded from GMV tab daily counts — Apr 2026."""

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
    row_fingerprint,
)
from revenue_routes import bc02_type_from_row


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

    # dedupe like import
    seen: set[str] = set()
    deduped = []
    for p in payloads:
        fp = row_fingerprint(p)
        if fp in seen:
            continue
        seen.add(fp)
        deduped.append(p)

    i1_apr = [
        p
        for p in deduped
        if (p.get("team") or "") == "Inhouse 1"
        and "2026-04-01" <= (p.get("pay_time") or "")[:10] <= "2026-04-30"
    ]
    print(f"Deduped Inhouse1 Apr: {len(i1_apr)} orders, GMV {sum(p.get('gmv_rmb',0) for p in i1_apr):.2f}")

    gmv_rows = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="GMV")
    gmv_daily: dict[str, int] = {}
    for row in gmv_rows:
        if not row:
            continue
        a = str(row[0]).strip()
        if re.match(r"^2026[/-]4[/-]\d{1,2}$", a):
            d = int(re.split(r"[/-]", a)[-1])
            gmv_daily[f"2026-04-{d:02d}"] = int(_parse_sheet_number(row[1] if len(row) > 1 else 0) or 0)

    by_day: dict[str, list[dict]] = defaultdict(list)
    for p in i1_apr:
        by_day[(p.get("pay_time") or "")[:10]].append(p)

    excluded: list[dict] = []
    print("\nDays where GMV tab count < deduped SM Hanoi:")
    for dk in sorted(gmv_daily):
        g = gmv_daily[dk]
        rows = by_day.get(dk, [])
        if len(rows) <= g:
            continue
        extra = len(rows) - g
        print(f"\n  {dk}: GMV={g}, have={len(rows)}, extra={extra}")
        # Heuristic: if GMV excludes N rows, try find type pattern
        for p in sorted(rows, key=lambda x: -(x.get("gmv_rmb") or 0)):
            tl = bc02_type_from_row(p.get("loai"), p.get("loai_2"))
            print(
                f"    gmv={p.get('gmv_rmb')} loai={p.get('loai')} cat={tl} "
                f"{p.get('ten_khach')} sale={p.get('sale_crm_name')}"
            )
        if extra <= len(rows):
            # try exclude Lives first
            non_lives = [p for p in rows if bc02_type_from_row(p.get("loai"), p.get("loai_2")) != "Lives"]
            lives = [p for p in rows if bc02_type_from_row(p.get("loai"), p.get("loai_2")) == "Lives"]
            if len(non_lives) == g:
                print(f"    -> MATCH if exclude Lives ({len(lives)} rows)")
                excluded.extend(lives)
            koc = [p for p in rows if bc02_type_from_row(p.get("loai"), p.get("loai_2")) == "KOC"]
            if len(rows) - len(koc) == g:
                print(f"    -> MATCH if exclude KOC ({len(koc)} rows)")
            other = [p for p in rows if bc02_type_from_row(p.get("loai"), p.get("loai_2")) == "Other"]
            if len(rows) - len(other) == g:
                print(f"    -> MATCH if exclude Other ({len(other)} rows)")

    # Try global: what subset gives 550 orders and 1815778 GMV?
    target_n, target_gmv = 550, 1815778.0
    print(f"\n=== Find subset matching GMV tab {target_n}/{target_gmv} ===")

    # Try excluding Lives
    no_lives = [p for p in i1_apr if bc02_type_from_row(p.get("loai"), p.get("loai_2")) != "Lives"]
    print(
        f"Exclude Lives: {len(no_lives)} orders, "
        f"GMV {sum(p.get('gmv_rmb',0) for p in no_lives):.2f}"
    )

    # Try excluding Lives + Other
    no_lo = [
        p
        for p in i1_apr
        if bc02_type_from_row(p.get("loai"), p.get("loai_2")) not in ("Lives", "Other")
    ]
    print(
        f"Exclude Lives+Other: {len(no_lo)} orders, "
        f"GMV {sum(p.get('gmv_rmb',0) for p in no_lo):.2f}"
    )

    # Category totals
    by_cat: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
    for p in i1_apr:
        tl = bc02_type_from_row(p.get("loai"), p.get("loai_2"))
        by_cat[tl]["n"] += 1
        by_cat[tl]["gmv"] += float(p.get("gmv_rmb") or 0)
    print("\nBC02 categories (deduped SM Hanoi Apr I1):")
    for k, v in sorted(by_cat.items(), key=lambda x: -x[1]["gmv"]):
        print(f"  {k}: {v['n']} / {float(v['gmv']):.2f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
