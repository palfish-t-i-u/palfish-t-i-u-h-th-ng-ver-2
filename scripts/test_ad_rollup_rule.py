#!/usr/bin/env python3
"""Test proposed ad-only-split rule vs Hiếu sheet."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import _apply_ledger_type_fixx  # noqa: E402

AD_LOAI2_OWN = frozenset({"KOC", "Lives", "Livestream", "Offline", "Booth", "KFT", "KET"})
ORDER = ("Lives", "Offline", "Other", "公海", "广告", "续费", "转介绍", "KOC")


def type_goc_proposed(loai: str | None, loai2: str | None) -> str:
    l1 = (loai or "").strip()
    l2 = (loai2 or "").strip()
    l1f = _apply_ledger_type_fixx(l1)
    if l1f == "广告" and l2:
        l2f = _apply_ledger_type_fixx(l2)
        if l2 in AD_LOAI2_OWN or l2f in ("KOC", "Lives", "Offline") or (
            l2f == "Other" and l2 in AD_LOAI2_OWN
        ):
            return l2
        return l1 or l2
    return l1 or l2


def fixx_from_row(loai, loai2):
    g = type_goc_proposed(loai, loai2)
    f = _apply_ledger_type_fixx(g)
    return f if f in ORDER else "Other"


def run_range(sb, fr, to):
    rows: list[dict] = []
    off = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("loai, loai_2, so_tien_vnd")
            .gte("pay_time", f"{fr}T00:00:00")
            .lte("pay_time", f"{to}T23:59:59")
            .range(off, off + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        off += 1000
    by: dict[str, dict] = defaultdict(lambda: {"n": 0, "g": 0})
    for r in rows:
        k = fixx_from_row(r.get("loai"), r.get("loai_2"))
        by[k]["n"] += 1
        by[k]["g"] += int(r.get("so_tien_vnd") or 0)
    return len(rows), by


def main():
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    for fr, to in [("2026-05-01", "2026-05-22"), ("2025-05-22", "2026-05-22")]:
        n, by = run_range(sb, fr, to)
        print(f"\n{fr}..{to} ({n} rows) proposed rule:")
        for k in ORDER:
            if k in by:
                print(f"  {k}: {by[k]['n']} / {by[k]['g']:,}")


if __name__ == "__main__":
    main()
