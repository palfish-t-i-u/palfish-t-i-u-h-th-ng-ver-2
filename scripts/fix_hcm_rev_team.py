#!/usr/bin/env python3
"""Backfill team=HCM (Online) for rows imported from HCM REV tab."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import team_to_pivot_label


def main() -> int:
    from supabase import create_client

    dry_run = "--dry-run" in sys.argv
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    rows = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("id, team, team_pivot_label, so_tien_vnd, sale_crm_name")
            .like("created_by_email", "import:gsheet:HCM REV")
            .neq("team", "HCM (Online)")
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

    vnd = sum(int(r.get("so_tien_vnd") or 0) for r in rows)
    print(f"Rows to fix: {len(rows)}, VND {vnd:,}" + (" [dry-run]" if dry_run else ""))
    for r in rows[:10]:
        print(
            f"  {r['id'][:8]}… team={r.get('team')!r} "
            f"vnd={int(r.get('so_tien_vnd') or 0):,} sale={r.get('sale_crm_name')}"
        )
    if len(rows) > 10:
        print(f"  … and {len(rows) - 10} more")

    if dry_run or not rows:
        return 0

    pivot = team_to_pivot_label("HCM (Online)")
    updated = 0
    for r in rows:
        sb.table("so_doanh_thu").update(
            {"team": "HCM (Online)", "team_pivot_label": pivot}
        ).eq("id", r["id"]).execute()
        updated += 1
    print(f"Updated {updated} rows → HCM (Online)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
