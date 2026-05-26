#!/usr/bin/env python3
"""Backfill so_doanh_thu.team from SM Hanoi column AH (TEAM) — not sale roster."""

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
    map_sm_hanoi_row,
    row_fingerprint,
)


def main() -> int:
    from supabase import create_client

    dry_run = "--dry-run" in sys.argv
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    print("Load SM Hanoi from Google Sheet (column AH = TEAM)…")
    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="SM Hanoi")
    sheet_by_fp: dict[str, tuple[str, str]] = {}
    for i, row in enumerate(raw):
        if i == 0:
            continue
        payload = map_sm_hanoi_row(team_cache, row, tab="SM Hanoi")
        if not payload:
            continue
        fp = row_fingerprint(payload)
        team = payload.get("team") or ""
        pivot = payload.get("team_pivot_label") or ""
        sheet_by_fp[fp] = (team, pivot)

    print(f"  {len(sheet_by_fp)} fingerprints from sheet")

    db_rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("id, uid, pay_time, so_tien_vnd, sale_crm_name, sdt, team, team_pivot_label")
            .like("created_by_email", "import:gsheet:SM Hanoi")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        db_rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000

    to_fix: list[tuple[dict, str, str]] = []
    missing_sheet = 0
    for r in db_rows:
        fp = row_fingerprint(r)
        mapped = sheet_by_fp.get(fp)
        if not mapped:
            missing_sheet += 1
            continue
        new_team, new_pivot = mapped
        if (r.get("team") or "") == new_team and (r.get("team_pivot_label") or "") == new_pivot:
            continue
        to_fix.append((r, new_team, new_pivot))

    print(f"DB SM Hanoi import rows: {len(db_rows)}")
    print(f"No sheet match: {missing_sheet}")
    print(f"Team updates needed: {len(to_fix)}" + (" [dry-run]" if dry_run else ""))

    from collections import Counter

    changes = Counter()
    for r, new_team, _ in to_fix:
        old = r.get("team") or "?"
        changes[f"{old} → {new_team}"] += 1
    for label, n in changes.most_common(15):
        print(f"  {label}: {n}")

    for r, new_team, new_pivot in to_fix[:8]:
        print(
            f"  sample {str(r['id'])[:8]}… {r.get('team')!r} → {new_team!r} "
            f"sale={r.get('sale_crm_name')} pay={str(r.get('pay_time') or '')[:10]}"
        )

    if dry_run or not to_fix:
        return 0

    updated = 0
    for r, new_team, new_pivot in to_fix:
        sb.table("so_doanh_thu").update(
            {"team": new_team, "team_pivot_label": new_pivot}
        ).eq("id", r["id"]).execute()
        updated += 1
        if updated % 200 == 0:
            print(f"  updated {updated}/{len(to_fix)}…")

    print(f"Done — updated {updated} rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
