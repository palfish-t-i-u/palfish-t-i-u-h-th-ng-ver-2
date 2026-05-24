#!/usr/bin/env python3
"""Rows classified Other — breakdown loai/loai2 for date range."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import ledger_type_fixx_from_row, _ledger_type_goc, _apply_ledger_type_fixx  # noqa: E402


def main() -> int:
    from supabase import create_client

    fr, to = "2026-05-01", "2026-05-22"
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("loai, loai_2, so_tien_vnd, ten_khach, pay_time")
            .gte("pay_time", f"{fr}T00:00:00")
            .lte("pay_time", f"{to}T23:59:59")
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

    by_fixx: dict[str, list] = defaultdict(list)
    for r in rows:
        fx = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        by_fixx[fx].append(r)

    print(f"Range {fr}..{to}: {len(rows)} rows")
    for k in sorted(by_fixx, key=lambda x: -sum(int(r.get("so_tien_vnd") or 0) for r in by_fixx[x])):
        rs = by_fixx[k]
        gmv = sum(int(r.get("so_tien_vnd") or 0) for r in rs)
        print(f"  {k}: {len(rs)} rows, {gmv:,} VND")

    other = by_fixx.get("Other", [])
    print(f"\nOther breakdown ({len(other)} rows):")
    combo: dict[tuple, dict] = defaultdict(lambda: {"n": 0, "gmv": 0})
    for r in other:
        key = (r.get("loai") or "", r.get("loai_2") or "")
        combo[key]["n"] += 1
        combo[key]["gmv"] += int(r.get("so_tien_vnd") or 0)
    for (l1, l2), v in sorted(combo.items(), key=lambda x: -x[1]["gmv"]):
        goc = _ledger_type_goc(l1, l2)
        goc_f = _apply_ledger_type_fixx(goc)
        print(f"  loai={l1!r} loai2={l2!r} -> goc={goc!r} fixx={goc_f} | {v['n']} x {v['gmv']:,}")

    # Rows where loai is ad-family but ends Other
    print("\nAd-parent but classified Other:")
    for r in rows:
        l1 = (r.get("loai") or "").strip()
        l2 = (r.get("loai_2") or "").strip()
        l1f = _apply_ledger_type_fixx(l1)
        fx = ledger_type_fixx_from_row(l1, l2)
        if l1f == "广告" and fx == "Other":
            print(
                f"  {int(r.get('so_tien_vnd') or 0):,} {r.get('ten_khach')} "
                f"loai={l1} loai2={l2} goc={_ledger_type_goc(l1,l2)}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
