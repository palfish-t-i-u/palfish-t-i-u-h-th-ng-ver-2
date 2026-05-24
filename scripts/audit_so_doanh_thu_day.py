#!/usr/bin/env python3
"""Audit so_doanh_thu by ngay_tien_ve — find dupes, non-import rows, daily totals."""

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

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Missing SUPABASE env", file=sys.stderr)
        return 1

    sb = create_client(url, key)
    target = sys.argv[1] if len(sys.argv) > 1 else "2026-05-15"
    month_prefix = target[:7]

    # All rows in month
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("*, pay_time")
            .gte("ngay_tien_ve", f"{month_prefix}-01")
            .lte("ngay_tien_ve", f"{month_prefix}-31")
            .order("ngay_tien_ve")
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

    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_day[str(r.get("ngay_tien_ve"))[:10]].append(r)

    print(f"=== Month {month_prefix}: {len(rows)} rows across {len(by_day)} days ===\n")
    print(f"{'Date':<12} {'Count':>6} {'GMV':>16} {'Non-import':>11} {'Dup ma_don':>10}")
    suspicious: list[str] = []
    for day in sorted(by_day):
        day_rows = by_day[day]
        gmv = sum(int(r.get("so_tien_vnd") or 0) for r in day_rows)
        non_import = sum(
            1 for r in day_rows if not (r.get("created_by_email") or "").startswith("import:")
        )
        ma_counts: dict[str, int] = defaultdict(int)
        for r in day_rows:
            ma = (r.get("ma_don_hang") or "").strip()
            if ma:
                ma_counts[ma] += 1
        dupes = sum(1 for c in ma_counts.values() if c > 1)
        flag = ""
        if non_import or dupes:
            flag = " *"
            suspicious.append(day)
        print(f"{day:<12} {len(day_rows):>6} {gmv:>16,} {non_import:>11} {dupes:>10}{flag}")

    day_rows = by_day.get(target, [])
    print(f"\n=== Detail {target}: {len(day_rows)} rows, GMV={sum(int(r.get('so_tien_vnd') or 0) for r in day_rows):,} ===")
    by_type: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "gmv": 0})
    for r in day_rows:
        tf = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        by_type[tf]["n"] += 1
        by_type[tf]["gmv"] += int(r.get("so_tien_vnd") or 0)
    for k, v in sorted(by_type.items(), key=lambda x: -x[1]["gmv"]):
        print(f"  {k}: {v['gmv']:,} ({v['n']})")

    print("\nRows (sorted by amount desc):")
    for r in sorted(day_rows, key=lambda x: -(int(x.get("so_tien_vnd") or 0))):
        tf = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        print(
            f"  {int(r.get('so_tien_vnd') or 0):>12,} | {tf:8} | "
            f"{r.get('loai')}/{r.get('loai_2')} | {r.get('ten_khach')} | "
            f"ma={r.get('ma_don_hang') or '—'} | {r.get('loai_nhap')} | "
            f"{r.get('created_by_email')} | {str(r.get('id'))[:8]}"
        )

    if suspicious:
        print(f"\nDays flagged (non-import and/or duplicate ma_don_hang): {', '.join(suspicious)}")

    # pay_time vs ngay_tien_ve (Hiếu sheet filters Pay Time)
    def _pt_day(r: dict) -> str | None:
        p = r.get("pay_time") or ""
        return str(p)[:10] if p else None

    def _nt_day(r: dict) -> str:
        return str(r.get("ngay_tien_ve") or "")[:10]

    month_rows = [r for d, rs in by_day.items() for r in rs if d.startswith(month_prefix)]
    mismatch = [
        r for r in month_rows if _pt_day(r) and _nt_day(r) and _pt_day(r) != _nt_day(r)
    ]
    print(f"\n=== pay_time != ngay_tien_ve in {month_prefix}: {len(mismatch)} row(s) ===")
    for r in sorted(mismatch, key=lambda x: (_nt_day(x), _pt_day(x) or "")):
        vnd = int(r.get("so_tien_vnd") or 0)
        print(
            f"  ngay={_nt_day(r)} pay={_pt_day(r)} {vnd:>12,} | "
            f"{r.get('ten_khach')} | {r.get('loai')} | {r.get('created_by_email')}"
        )

    pay_on_target = [
        r for r in month_rows if _pt_day(r) == target and _nt_day(r) != target
    ]
    if pay_on_target:
        print(f"\nRows with pay_time={target} but ngay_tien_ve elsewhere: {len(pay_on_target)}")
        for r in pay_on_target:
            vnd = int(r.get("so_tien_vnd") or 0)
            print(f"  ngay={_nt_day(r)} {vnd:>12,} | {r.get('ten_khach')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
