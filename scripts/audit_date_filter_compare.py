#!/usr/bin/env python3
"""Compare summary by pay_time vs ngay_tien_ve filter."""

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


def fetch(sb, date_col: str, fr: str, to: str) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        q = sb.table("so_doanh_thu").select("loai, loai_2, so_tien_vnd")
        if date_col == "pay_time":
            q = q.gte("pay_time", f"{fr}T00:00:00").lte("pay_time", f"{to}T23:59:59")
        else:
            q = q.gte("ngay_tien_ve", fr).lte("ngay_tien_ve", to)
        res = q.range(offset, offset + 999).execute()
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def summarize(rows: list[dict]) -> dict[str, dict[str, int]]:
    by: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "gmv": 0})
    for r in rows:
        k = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        by[k]["n"] += 1
        by[k]["gmv"] += int(r.get("so_tien_vnd") or 0)
    return by


def main() -> int:
    from supabase import create_client

    fr, to = "2025-05-22", "2026-05-22"
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    for col in ("pay_time", "ngay_tien_ve"):
        rows = fetch(sb, col, fr, to)
        by = summarize(rows)
        print(f"\n=== filter {col}: {len(rows)} rows ===")
        for k in sorted(by, key=lambda x: -by[x]["gmv"]):
            v = by[k]
            print(f"  {k}: {v['n']} / {v['gmv']:,}")

    # Sheet expected (from user screenshot)
    print("\n=== Hiếu sheet (expected) ===")
    exp = {
        "广告": (2829, 30_910_571_325),
        "续费": (2361, 25_621_423_523),
        "转介绍": (1055, 13_000_617_942),
        "公海": (596, 5_135_078_899),
    }
    for k, (n, g) in exp.items():
        print(f"  {k}: {n} / {g:,}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
