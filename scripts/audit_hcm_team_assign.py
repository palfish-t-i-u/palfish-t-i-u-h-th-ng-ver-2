#!/usr/bin/env python3
"""HCM REV import rows — team assignment audit."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import team_to_canonical


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("so_tien_vnd, team, team_pivot_label, created_by_email, sale_crm_name")
            .like("created_by_email", "import:gsheet:HCM REV")
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

    total_vnd = sum(int(r.get("so_tien_vnd") or 0) for r in rows)
    print(f"HCM REV import rows: {len(rows)}, VND {total_vnd:,}")

    by_team: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "vnd": 0})
    for r in rows:
        t = team_to_canonical(r.get("team"), r.get("team_pivot_label"))
        by_team[t]["n"] += 1
        by_team[t]["vnd"] += int(r.get("so_tien_vnd") or 0)

    print("Team assignment for HCM REV rows:")
    for t, v in sorted(by_team.items(), key=lambda x: -x[1]["vnd"]):
        print(f"  {t}: {v['n']} rows, {v['vnd']:,} VND")

    wrong = [
        r
        for r in rows
        if team_to_canonical(r.get("team"), r.get("team_pivot_label")) != "HCM (Online)"
    ]
    wrong_vnd = sum(int(r.get("so_tien_vnd") or 0) for r in wrong)
    print(f"\nNon-HCM team from HCM REV tab: {len(wrong)} rows, {wrong_vnd:,} VND")
    for r in wrong[:20]:
        print(
            f"  {int(r.get('so_tien_vnd') or 0):,} team={r.get('team')} "
            f"sale={r.get('sale_crm_name')}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
