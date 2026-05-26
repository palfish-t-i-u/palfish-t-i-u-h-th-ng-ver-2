#!/usr/bin/env python3
"""Compare live sheet totals vs DB — find missing rows for 150B gap."""

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
    collect_payloads_from_gsheet,
    row_fingerprint,
)


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)
    payloads = collect_payloads_from_gsheet(
        team_cache,
        spreadsheet_id=DEFAULT_SPREADSHEET_ID,
        tabs=("SM Hanoi", "HCM REV"),
        limit=0,
    )
    live_vnd = sum(int(p.get("so_tien_vnd") or 0) for p in payloads)
    print(f"Live sheet unique: {len(payloads)} rows, {live_vnd:,} VND ({live_vnd/1e9:.3f}B)")

    fps_db: set[str] = set()
    db_vnd = 0
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("uid, pay_time, so_tien_vnd, sale_crm_name, sdt")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        for r in chunk:
            fps_db.add(row_fingerprint(r))
            db_vnd += int(r.get("so_tien_vnd") or 0)
        if len(chunk) < 1000:
            break
        offset += 1000

    print(f"DB: {len(fps_db)} fingerprints, {db_vnd:,} VND ({db_vnd/1e9:.3f}B)")
    missing = [p for p in payloads if row_fingerprint(p) not in fps_db]
    missing_vnd = sum(int(p.get("so_tien_vnd") or 0) for p in missing)
    print(f"Missing from DB: {len(missing)} rows, {missing_vnd:,} VND")
    for p in missing[:10]:
        print(
            f"  {p.get('pay_time','')[:10]} {p.get('so_tien_vnd'):,} "
            f"{p.get('ten_khach')} team={p.get('team')}"
        )
    print(f"Gap to 150B after sync: {150_000_000_000 - (db_vnd + missing_vnd):,} VND")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
