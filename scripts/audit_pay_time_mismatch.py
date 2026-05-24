#!/usr/bin/env python3
"""Rows where pay_time date != ngay_tien_ve — Hiếu sheet lọc Pay Time."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")


def _pt_day(r: dict) -> str | None:
    p = r.get("pay_time") or ""
    return str(p)[:10] if p else None


def _nt_day(r: dict) -> str:
    return str(r.get("ngay_tien_ve") or "")[:10]


def main() -> int:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Missing SUPABASE env", file=sys.stderr)
        return 1

    sb = create_client(url, key)
    rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("id,ngay_tien_ve,pay_time,so_tien_vnd,ten_khach,loai,created_by_email")
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

    mismatch = [r for r in rows if _pt_day(r) and _nt_day(r) and _pt_day(r) != _nt_day(r)]
    no_pay = [r for r in rows if not _pt_day(r)]

    print(f"Total: {len(rows)} | pay_time != ngay_tien_ve: {len(mismatch)} | missing pay_time: {len(no_pay)}")

    by_ngay = defaultdict(list)
    for r in mismatch:
        by_ngay[_nt_day(r)].append(r)

    print(f"\nMismatch grouped by ngay_tien_ve ({len(by_ngay)} days):")
    for day in sorted(by_ngay):
        rs = by_ngay[day]
        gmv = sum(int(x.get("so_tien_vnd") or 0) for x in rs)
        print(f"  {day}: {len(rs)} row(s), +{gmv:,} GMV counted on wrong day vs Pay Time")
        for r in rs[:5]:
            vnd = int(r.get("so_tien_vnd") or 0)
            print(
                f"    pay={_pt_day(r)} {vnd:,} {r.get('ten_khach')} | "
                f"{r.get('created_by_email')} | {str(r.get('id'))[:8]}"
            )
        if len(rs) > 5:
            print(f"    ... +{len(rs) - 5} more")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
