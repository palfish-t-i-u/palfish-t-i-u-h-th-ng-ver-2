#!/usr/bin/env python3
"""Compare ledger totals: filter ngay_tien_ve vs pay_time."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import ledger_type_fixx_from_row  # noqa: E402


def main() -> int:
    from supabase import create_client

    day = sys.argv[1] if len(sys.argv) > 1 else "2026-05-15"
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    by_ngay = (
        sb.table("so_doanh_thu")
        .select("*")
        .eq("ngay_tien_ve", day)
        .execute()
        .data
        or []
    )
    by_pay = (
        sb.table("so_doanh_thu")
        .select("*")
        .gte("pay_time", f"{day}T00:00:00")
        .lte("pay_time", f"{day}T23:59:59")
        .execute()
        .data
        or []
    )

    def summarize(label: str, rows: list[dict]) -> None:
        gmv = sum(int(r.get("so_tien_vnd") or 0) for r in rows)
        print(f"\n{label}: {len(rows)} rows, GMV {gmv:,}")
        by: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "gmv": 0})
        for r in rows:
            k = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
            by[k]["n"] += 1
            by[k]["gmv"] += int(r.get("so_tien_vnd") or 0)
        for k, v in sorted(by.items(), key=lambda x: -x[1]["gmv"]):
            print(f"  {k}: {v['gmv']:,} ({v['n']})")

    summarize(f"ngay_tien_ve = {day}", by_ngay)
    summarize(f"pay_time = {day}", by_pay)

    ngay_ids = {r["id"] for r in by_ngay}
    pay_ids = {r["id"] for r in by_pay}
    only_ngay = [r for r in by_ngay if r["id"] not in pay_ids]
    only_pay = [r for r in by_pay if r["id"] not in ngay_ids]
    if only_ngay:
        print("\nOnly in ngay_tien_ve filter:")
        for r in only_ngay:
            print(
                f"  {r.get('ten_khach')} {int(r.get('so_tien_vnd') or 0):,} "
                f"pay={str(r.get('pay_time'))[:10]}"
            )
    if only_pay:
        print("\nOnly in pay_time filter:")
        for r in only_pay:
            print(
                f"  {r.get('ten_khach')} {int(r.get('so_tien_vnd') or 0):,} "
                f"ngay={r.get('ngay_tien_ve')}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
