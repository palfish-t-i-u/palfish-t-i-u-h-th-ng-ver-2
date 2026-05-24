#!/usr/bin/env python3
"""Compare ledger summary vs expected by type fixx for a date range."""

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

    fr, to = "2025-05-22", "2026-05-22"
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("loai, loai_2, so_tien_vnd, pay_time, ngay_tien_ve, ten_khach")
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

    by: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "gmv": 0})
    for r in rows:
        k = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        by[k]["n"] += 1
        by[k]["gmv"] += int(r.get("so_tien_vnd") or 0)

    print(f"pay_time {fr}..{to}: {len(rows)} rows")
    for k in sorted(by, key=lambda x: -by[x]["gmv"]):
        v = by[k]
        print(f"  {k}: {v['n']} orders, {v['gmv']:,} VND")

    # pay_time != ngay_tien_ve in range
    mm = [
        r
        for r in rows
        if (r.get("pay_time") or "")[:10] != str(r.get("ngay_tien_ve") or "")[:10]
        and r.get("pay_time")
        and r.get("ngay_tien_ve")
    ]
    print(f"\npay_time != ngay_tien_ve: {len(mm)} rows, {sum(int(r.get('so_tien_vnd') or 0) for r in mm):,} VND")
    by_cat: dict[str, list] = defaultdict(list)
    for r in mm:
        fx = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        by_cat[fx].append(r)
    for cat, rs in sorted(by_cat.items(), key=lambda x: -sum(int(r.get("so_tien_vnd") or 0) for r in x[1])):
        g = sum(int(r.get("so_tien_vnd") or 0) for r in rs)
        print(f"  mismatch in {cat}: {len(rs)} rows, {g:,}")

    # Rows that might be wrong category - sample GD/Refer edge cases
    for loai_check in ["GD", "Refer", "公海", "转介绍", "Kho chung"]:
        hits = [r for r in rows if (r.get("loai") or "").strip() == loai_check or (r.get("loai_2") or "").strip() == loai_check]
        if hits:
            fx_counts = defaultdict(int)
            for r in hits:
                fx_counts[ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))] += 1
            print(f"\nloai={loai_check!r}: {len(hits)} rows -> fixx {dict(fx_counts)}")

    # Ad-parent -> non-ad fixx (excluding KOC/Lives etc)
    print("\nSuspicious ad subchannel -> wrong bucket:")
    for r in rows:
        l1 = (r.get("loai") or "").strip()
        l2 = (r.get("loai_2") or "").strip()
        l1f = _apply_ledger_type_fixx(l1)
        fx = ledger_type_fixx_from_row(l1, l2)
        if l1f == "广告" and l2 and fx in ("公海", "续费", "转介绍", "Other"):
            print(
                f"  {int(r.get('so_tien_vnd') or 0):,} {r.get('ten_khach')} "
                f"loai={l1} loai2={l2} -> {fx} pay={(r.get('pay_time') or '')[:10]}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
