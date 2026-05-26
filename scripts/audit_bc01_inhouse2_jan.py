#!/usr/bin/env python3
"""Compare BC01 Inhouse 2 Jan 2026 total vs sum of sale rows."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import (  # noqa: E402
    _build_sales_performance_pivot,
    _fetch_so_doanh_thu,
    _month_key,
    _parse_date,
    team_to_canonical,
)

GEMINI_SUM = 300_380  # user manual sum from screenshot


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    fr, to = "2026-01-01", "2026-05-25"
    rows = _fetch_so_doanh_thu(
        sb,
        "pay_time, ngay_tien_ve, gmv_rmb, sale_crm_name, team, team_pivot_label, ten_khach",
        from_date=fr,
        to_date=to,
    )
    pivot = _build_sales_performance_pivot(rows, team_filter="Inhouse 2")
    mk = "2026/1"
    team = next((t for t in pivot["teams"] if t["teamLabel"] == "Inhouse 2"), None)
    if not team:
        print("No Inhouse 2 in pivot")
        return 1

    grand = pivot["grandTotalRow"].get(mk, 0)
    team_total = team["totalRow"].get(mk, 0)
    sales = sorted(team["sales"], key=lambda s: -(s["cells"].get(mk) or 0))
    sum_sales = round(sum(s["cells"].get(mk, 0) for s in sales), 2)

    print(f"Filter pay_time: {fr} .. {to}")
    print(f"Month bucket (ngay_tien_ve): {mk}")
    print(f"BC01 grand row 2026/1:     {grand:,.2f}")
    print(f"BC01 team totalRow:        {team_total:,.2f}")
    print(f"Sum all sale cells:        {sum_sales:,.2f}")
    print(f"User Gemini sum:           {GEMINI_SUM:,.2f}")
    print(f"BC01 vs Gemini:            {grand - GEMINI_SUM:+,.2f}")
    print(f"Sale rows (any month):     {len(sales)}")
    print(f"Sales with GMV>0 in {mk}: {sum(1 for s in sales if (s['cells'].get(mk) or 0) > 0)}")
    print()

    gemini_vals = [
        9086, 6091, 3897, 5166, 50849, 46696, 23243, 13295, 36781, 13675,
        23700, 23282, 12652, 14861, 15294, 8480, 12732, 1200,
    ]
    print(f"Gemini list count: {len(gemini_vals)}, sum={sum(gemini_vals):,}")
    print()

    print("--- All sales with GMV in 2026/1 ---")
    pivot_by_name = {s["sale"]: s["cells"].get(mk, 0) for s in sales}
    for s in sales:
        v = s["cells"].get(mk, 0)
        if v:
            print(f"  {v:>10,.2f}  {s['sale']}")

    print()
    print("--- In Gemini list but NOT in BC01 pivot (or different amount) ---")
    # map rough names from user list - we match by value
    used = set()
    for gv in gemini_vals:
        matches = [name for name, v in pivot_by_name.items() if abs(v - gv) < 0.01 and name not in used]
        if not matches:
            print(f"  value {gv:,} — no exact match in BC01")
        else:
            used.add(matches[0])

    print()
    print("--- In BC01 but likely MISSING from Gemini manual add ---")
    for name, v in sorted(pivot_by_name.items(), key=lambda x: -x[1]):
        if v > 0 and name not in used:
            # check if value close to any gemini
            close = any(abs(v - g) < 0.01 for g in gemini_vals)
            if not close:
                print(f"  {v:>10,.2f}  {name}  <-- extra in BC01?")

    print()
    print("--- Ledger lines (ngay_tien_ve month = 2026/1) ---")
    by_sale: dict[str, float] = defaultdict(float)
    lines: list[tuple] = []
    for r in rows:
        if team_to_canonical(r.get("team"), r.get("team_pivot_label")) != "Inhouse 2":
            continue
        ngay = _parse_date(r.get("ngay_tien_ve"))
        if not ngay or _month_key(ngay) != mk:
            continue
        sale = (r.get("sale_crm_name") or "(Chua gan sale)").strip()
        gmv = float(r.get("gmv_rmb") or 0)
        by_sale[sale] += gmv
        pay = str(r.get("pay_time") or "")[:10]
        lines.append((sale, gmv, pay, ngay.isoformat(), r.get("ten_khach")))

    print(f"Transaction rows: {len(lines)}")
    for sale, total in sorted(by_sale.items(), key=lambda x: -x[1]):
        if total:
            print(f"  {total:>10,.2f}  {sale}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
