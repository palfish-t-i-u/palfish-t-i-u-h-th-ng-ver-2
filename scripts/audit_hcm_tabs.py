#!/usr/bin/env python3
"""Compare HCM REV vs HCM tab — missing revenue for 150B target."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    fetch_gsheet_tab_values,
    map_hcm_rev_row,
    row_fingerprint,
)


def tab_vnd_total(tab: str, team_cache: TeamLookupCache) -> tuple[int, int, int]:
    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab=tab)
    mapped = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        p = map_hcm_rev_row(team_cache, row, tab=tab)
        if p:
            mapped.append(p)
    seen: set[str] = set()
    deduped = []
    for p in mapped:
        fp = row_fingerprint(p)
        if fp in seen:
            continue
        seen.add(fp)
        deduped.append(p)
    vnd = sum(int(p.get("so_tien_vnd") or 0) for p in deduped)
    return len(raw) - 1, len(deduped), vnd


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    for tab in ("HCM REV", "HCM"):
        raw_n, n, vnd = tab_vnd_total(tab, team_cache)
        print(f"{tab}: raw={raw_n}, mapped_deduped={n}, VND={vnd:,} ({vnd/1e9:.3f}B)")

    rows = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("so_tien_vnd, team, created_by_email")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000

    total = sum(int(r.get("so_tien_vnd") or 0) for r in rows)
    hcm = [r for r in rows if (r.get("team") or "") == "HCM (Online)"]
    hcm_vnd = sum(int(r.get("so_tien_vnd") or 0) for r in hcm)
    print(f"\nDB total: {len(rows)} rows, {total:,} VND ({total/1e9:.3f}B)")
    print(f"DB HCM (Online): {len(hcm)} rows, {hcm_vnd:,} VND ({hcm_vnd/1e9:.3f}B)")
    print(f"Gap to 150B: {150_000_000_000 - total:,} VND")

    by_import: dict[str, int] = {}
    for r in rows:
        k = (r.get("created_by_email") or "")[:30]
        by_import[k] = by_import.get(k, 0) + int(r.get("so_tien_vnd") or 0)
    print("\nDB by import source:")
    for k, v in sorted(by_import.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v:,} VND")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
