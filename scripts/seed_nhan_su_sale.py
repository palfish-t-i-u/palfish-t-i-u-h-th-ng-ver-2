#!/usr/bin/env python3
"""Seed nhan_su_sale từ docs/team_hierarchy.json. Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "docs" / "team_hierarchy.json"
sys.path.insert(0, str(ROOT / "backend"))

from vn_staff import filter_vn_rows, is_vn_sale_row  # noqa: E402


def flatten_tree(tree: dict) -> list[dict]:
    rows: list[dict] = []
    for _team, sub in tree.items():
        if not isinstance(sub, dict):
            continue
        for _sub, members in sub.items():
            if not isinstance(members, list):
                continue
            for m in members:
                if not isinstance(m, dict) or not m.get("sale"):
                    continue
                d6 = (m.get("depart6") or [None])[0]
                d7 = (m.get("depart7") or [None])[0]
                d8 = (m.get("depart8") or [None])[0]
                row = {
                    "crm_name": m["sale"].strip(),
                    "depart6_name": d6,
                    "depart7_name": d7,
                    "depart8_name": d8,
                    "team": (m.get("team") or "").strip() or None,
                    "sub_team": (m.get("sub_team") or "").strip() or None,
                    "role": "sale",
                    "is_active": True,
                }
                if is_vn_sale_row(row):
                    rows.append(row)
    return rows


def deactivate_non_vn(sb) -> None:
    for team in ("Tele sale", "P'AU Group", "P'TEE Group"):
        sb.table("nhan_su_sale").update({"is_active": False}).eq("team", team).execute()
    sb.table("nhan_su_sale").update({"is_active": False}).ilike(
        "depart6_name", "%thailand%"
    ).execute()


def main() -> int:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    if not JSON_PATH.exists():
        print(f"Missing {JSON_PATH}", file=sys.stderr)
        return 1

    data = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    all_flat = flatten_tree(data.get("tree", {}))
    rows = filter_vn_rows(all_flat)
    skipped = len(all_flat) - len(rows)
    print(f"Found {len(all_flat)} sales in JSON, seeding {len(rows)} VN (skipped {skipped} non-VN)")

    from supabase import create_client

    sb = create_client(url, key)
    batch = 50
    upserted = 0
    for i in range(0, len(rows), batch):
        chunk = rows[i : i + batch]
        sb.table("nhan_su_sale").upsert(chunk, on_conflict="crm_name").execute()
        upserted += len(chunk)
        print(f"  upserted {upserted}/{len(rows)}")

    deactivate_non_vn(sb)
    print("Deactivated non-VN teams in nhan_su_sale (is_active=false).")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
