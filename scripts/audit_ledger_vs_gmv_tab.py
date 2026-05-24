#!/usr/bin/env python3
"""Break down Sổ summary vs GMV tab In-house — by team, month, date edge."""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import _build_key_data_pivot, _fetch_so_doanh_thu, team_to_canonical  # noqa: E402


def fetch_range(sb, fr: str, to: str) -> list[dict]:
    return _fetch_so_doanh_thu(
        sb,
        "pay_time, so_tien_vnd, gmv_rmb, team, team_pivot_label, loai, loai_2",
        from_date=fr,
        to_date=to,
    )


def summarize(rows: list[dict], team: str | None = None) -> dict:
    n = 0
    vnd = 0
    rmb = 0
    for r in rows:
        t = team_to_canonical(r.get("team_pivot_label") or r.get("team") or "")
        if team and t != team:
            continue
        n += 1
        vnd += int(r.get("so_tien_vnd") or 0)
        rmb += int(r.get("gmv_rmb") or 0)
    return {"orders": n, "vnd": vnd, "rmb": rmb}


def by_team(rows: list[dict]) -> dict[str, dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {"orders": 0, "vnd": 0, "rmb": 0})
    for r in rows:
        t = team_to_canonical(r.get("team_pivot_label") or r.get("team") or "") or "(blank)"
        buckets[t]["orders"] += 1
        buckets[t]["vnd"] += int(r.get("so_tien_vnd") or 0)
        buckets[t]["rmb"] += int(r.get("gmv_rmb") or 0)
    return dict(buckets)


def by_month(rows: list[dict], team: str | None = None) -> dict[str, dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {"orders": 0, "vnd": 0, "rmb": 0})
    for r in rows:
        t = team_to_canonical(r.get("team_pivot_label") or r.get("team") or "")
        if team and t != team:
            continue
        pt = (r.get("pay_time") or "")[:10]
        if len(pt) < 7:
            continue
        mk = f"{pt[:4]}/{int(pt[5:7])}"
        buckets[mk]["orders"] += 1
        buckets[mk]["vnd"] += int(r.get("so_tien_vnd") or 0)
        buckets[mk]["rmb"] += int(r.get("gmv_rmb") or 0)
    return dict(buckets)


def main() -> int:
    from supabase import create_client

    fr, to = "2026-01-01", "2026-05-24"
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = fetch_range(sb, fr, to)

    print(f"=== App Sổ pay_time {fr}..{to} (ALL teams) ===")
    all_s = summarize(rows)
    print(f"  orders={all_s['orders']}, VND={all_s['vnd']:,}, RMB={all_s['rmb']:,}")

    print(f"\n=== App Inhouse 1 only (BC02 scope) ===")
    ih1 = summarize(rows, "Inhouse 1")
    print(f"  orders={ih1['orders']}, VND={ih1['vnd']:,}, RMB={ih1['rmb']:,}")

    print(f"\n=== By team ===")
    for t, v in sorted(by_team(rows).items(), key=lambda x: -x[1]["orders"]):
        print(f"  {t}: {v['orders']} orders, RMB={v['rmb']:,}")

    print(f"\n=== Inhouse 1 by month (app) ===")
    gmv_tab_expected = {
        "2026/1": (488, 1_647_321),
        "2026/2": (392, 1_351_450),
        "2026/3": (553, 1_820_583),
        "2026/4": (550, 1_815_778),  # sheet; app ~549
        "2026/5": (310, 1_025_489),  # sheet FULL month
    }
    monthly = by_month(rows, "Inhouse 1")
    sum_orders = 0
    sum_rmb = 0
    for mk in sorted(monthly):
        v = monthly[mk]
        exp = gmv_tab_expected.get(mk)
        exp_s = f" sheet={exp[0]}/{exp[1]:,}" if exp else ""
        print(f"  {mk}: app={v['orders']}/{v['rmb']:,}{exp_s}")
        if exp:
            sum_orders += exp[0]
            sum_rmb += exp[1]
    print(f"  GMV tab sum (full months 1-5): orders={sum_orders}, RMB={sum_rmb:,}")

    # Partial May effect
    may_full = fetch_range(sb, "2026-05-01", "2026-05-31")
    may_full_ih1 = summarize(may_full, "Inhouse 1")
    may_partial = summarize([r for r in rows if team_to_canonical(r.get("team_pivot_label") or r.get("team") or "") == "Inhouse 1" and (r.get("pay_time") or "")[:10] >= "2026-05-01"], "Inhouse 1")
    print(f"\n=== May 2026 Inhouse 1: partial 1-24 vs full month ===")
    print(f"  partial 1-24: {may_partial['orders']} orders, RMB={may_partial['rmb']:,}")
    print(f"  full month:   {may_full_ih1['orders']} orders, RMB={may_full_ih1['rmb']:,}")

    # BC02 pivot check Apr
    apr = fetch_range(sb, "2026-04-01", "2026-04-30")
    pivot = _build_key_data_pivot(apr, team_filter="Inhouse 1")
    gt = pivot["grandTotal"]
    print(f"\n=== BC02 Apr Inhouse 1 ===")
    print(f"  orders={gt['totalOrders']}, RMB={gt['totalGmv']}")

  # Non-Inhouse 1 explaining gap
    other_orders = all_s["orders"] - ih1["orders"]
    other_rmb = all_s["rmb"] - ih1["rmb"]
    print(f"\n=== Gap ALL vs Inhouse 1 ===")
    print(f"  extra orders={other_orders}, extra RMB={other_rmb:,}")
    print(f"  User sheet GMV tab (In-house only, full mo 1-5): 2293 / 4,671,020")
    print(f"  User app Sổ (all teams, 1/1-24/5): {all_s['orders']} / {all_s['rmb']:,} RMB equiv")

    # team column vs canonical mismatch
    pivot_only = 0
    for r in rows:
        t = (r.get("team") or "").strip()
        pl = (r.get("team_pivot_label") or "").strip()
        if team_to_canonical(t, pl) == "Inhouse 1" and t not in ("Inhouse 1", "In-house", "HN inhouse"):
            pivot_only += 1
    print("Inhouse 1 rows not matched by team.eq filter:", pivot_only)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
