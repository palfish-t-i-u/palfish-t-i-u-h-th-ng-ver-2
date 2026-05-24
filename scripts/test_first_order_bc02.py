#!/usr/bin/env python3
"""Test first-order vs all-order counting for BC02 categories — Apr 2026 I1."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import (
    BC02_TYPE_TO_GMV_KEY,
    _fetch_so_doanh_thu,
    _parse_date,
    bc02_type_from_row,
    team_to_canonical,
)

FIRST_ORDER_CATS = frozenset({"ads", "refer", "offline"})


def pay_date(r: dict) -> str:
    p = r.get("pay_time") or r.get("ngay_tien_ve") or ""
    return str(p)[:10]


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    # Full history for first-order keys (Inhouse 1)
    all_rows = _fetch_so_doanh_thu(
        sb,
        "id, pay_time, ngay_tien_ve, gmv_rmb, loai, loai_2, team, team_pivot_label, uid",
    )
    i1 = [
        r
        for r in all_rows
        if team_to_canonical(r.get("team"), r.get("team_pivot_label")) == "Inhouse 1"
    ]
    i1.sort(key=lambda r: (pay_date(r), str(r.get("id") or "")))

    seen: set[tuple[str, str]] = set()
    apr = [r for r in i1 if "2026-04-01" <= pay_date(r) <= "2026-04-30"]

    all_cat: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
    first_cat: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})

    for r in i1:
        uid = (r.get("uid") or "").strip()
        cat = BC02_TYPE_TO_GMV_KEY.get(
            bc02_type_from_row(r.get("loai"), r.get("loai_2")), "other"
        )
        gmv = float(r.get("gmv_rmb") or 0)
        in_apr = "2026-04-01" <= pay_date(r) <= "2026-04-30"

        is_first = True
        if cat in FIRST_ORDER_CATS and uid:
            key = (uid, cat)
            if key in seen:
                is_first = False
            else:
                seen.add(key)

        if in_apr:
            all_cat[cat]["n"] += 1
            all_cat[cat]["gmv"] += gmv
            if is_first or cat not in FIRST_ORDER_CATS:
                first_cat[cat]["n"] += 1
                first_cat[cat]["gmv"] += gmv

    print("April Inhouse1 — ALL orders vs FIRST order (ads/refer/offline only):")
    print(f"{'cat':12} {'all_n':>6} {'first_n':>7} {'all_gmv':>12} {'first_gmv':>12}")
    for cat in sorted(set(all_cat) | set(first_cat)):
        a, f = all_cat[cat], first_cat[cat]
        print(
            f"{cat:12} {a['n']:6} {f['n']:7} {float(a['gmv']):12.2f} {float(f['gmv']):12.2f}"
        )

    print("\nGMV tab expected Apr:")
    print("  ads: 166 / 532257")
    print("  refer: 84 / 337012")
    print("  public_pool: 38 / 111340")
    print("  renew: 249 / 798420")
    print("  other: 1 / 3130")
    print("  lives: 12 / 33619")
    print("  total: 550 / 1815778")

    total_first_n = sum(first_cat[c]["n"] for c in first_cat)
    total_first_gmv = sum(float(first_cat[c]["gmv"]) for c in first_cat)
    print(f"\nSum first_n (Apr, first logic ads/refer/offline): {total_first_n}")
    print(f"Sum first_gmv: {total_first_gmv:.2f}")

    # Try public_pool first-order too
    seen2: set[tuple[str, str]] = set()
    first2: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
    first_cats = FIRST_ORDER_CATS | {"public_pool"}
    for r in i1:
        uid = (r.get("uid") or "").strip()
        cat = BC02_TYPE_TO_GMV_KEY.get(
            bc02_type_from_row(r.get("loai"), r.get("loai_2")), "other"
        )
        gmv = float(r.get("gmv_rmb") or 0)
        in_apr = "2026-04-01" <= pay_date(r) <= "2026-04-30"
        is_first = True
        if cat in first_cats and uid:
            key = (uid, cat)
            if key in seen2:
                is_first = False
            else:
                seen2.add(key)
        if in_apr and (is_first or cat not in first_cats):
            first2[cat]["n"] += 1
            first2[cat]["gmv"] += gmv
    print("\nWith public_pool first-order too:")
    for cat in sorted(first2):
        print(f"  {cat}: {first2[cat]['n']} / {float(first2[cat]['gmv']):.2f}")
    print(f"  total n: {sum(first2[c]['n'] for c in first2)}")
    print(f"  total gmv: {sum(float(first2[c]['gmv']) for c in first2):.2f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
