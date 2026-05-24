#!/usr/bin/env python3
"""Audit BC02 Inhouse 1 Apr 2026 vs expected GMV tab totals."""

from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    collect_payloads_from_gsheet,
    row_fingerprint,
)
from revenue_routes import (
    BC02_TYPE_TO_GMV_KEY,
    _build_key_data_pivot,
    _fetch_so_doanh_thu,
    bc02_type_from_row,
    team_to_canonical,
)


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    from_date, to_date = "2026-04-01", "2026-04-30"

    rows = _fetch_so_doanh_thu(
        sb,
        "pay_time, ngay_tien_ve, gmv_rmb, loai, loai_2, team, team_pivot_label, "
        "so_tien_vnd, sale_crm_name, created_by_email, loai_nhap, don_hang_id, "
        "uid, sdt, ten_khach, id, ma_don_hang",
        from_date=from_date,
        to_date=to_date,
    )
    i1 = [
        r
        for r in rows
        if team_to_canonical(r.get("team"), r.get("team_pivot_label")) == "Inhouse 1"
    ]
    pivot = _build_key_data_pivot(rows, team_filter="Inhouse 1")
    print("=== BC02 Inhouse 1 Apr 2026 (DB) ===")
    print(f"Orders: {pivot['grandTotal']['totalOrders']} (expected sheet: 550)")
    print(f"GMV RMB: {pivot['grandTotal']['totalGmv']} (expected sheet: 1815778)")

    by_src: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0, "vnd": 0})
    for r in i1:
        src = r.get("loai_nhap") or "?"
        email = (r.get("created_by_email") or "")[:40]
        key = f"{src}|{email}"
        by_src[key]["n"] += 1
        by_src[key]["gmv"] += float(r.get("gmv_rmb") or 0)
        by_src[key]["vnd"] += int(r.get("so_tien_vnd") or 0)
    print("\nBy loai_nhap + created_by:")
    for k, v in sorted(by_src.items(), key=lambda x: -x[1]["n"]):
        print(f"  {k}: {v['n']} orders, {v['gmv']:.2f} RMB, {v['vnd']:,} VND")

    # fingerprint dupes within i1
    fps: dict[str, list[dict]] = defaultdict(list)
    for r in i1:
        fps[row_fingerprint(r)].append(r)
    dup_groups = {fp: rs for fp, rs in fps.items() if len(rs) > 1}
    print(f"\nDuplicate fingerprint groups in Inhouse 1 Apr: {len(dup_groups)}")
    extra_orders = sum(len(rs) - 1 for rs in dup_groups.values())
    extra_gmv = sum(
        float(rs[i].get("gmv_rmb") or 0)
        for rs in dup_groups.values()
        for i in range(1, len(rs))
    )
    print(f"Extra orders from dupes: {extra_orders}, extra GMV: {extra_gmv:.2f}")
    for fp, rs in sorted(dup_groups.items(), key=lambda x: -len(x[1]))[:20]:
        print(f"\n  FP {fp[:12]}… ({len(rs)} rows):")
        for r in rs:
            print(
                f"    id={str(r.get('id'))[:8]} {r.get('pay_time','')[:10]} "
                f"gmv={r.get('gmv_rmb')} vnd={r.get('so_tien_vnd')} "
                f"{r.get('ten_khach')} sale={r.get('sale_crm_name')} "
                f"src={r.get('loai_nhap')} by={r.get('created_by_email')} "
                f"don={r.get('don_hang_id') or r.get('ma_don_hang') or '—'}"
            )

    # rows not from gsheet import
    non_gsheet = [r for r in i1 if not (r.get("created_by_email") or "").startswith("import:gsheet")]
    gmv_extra = sum(float(r.get("gmv_rmb") or 0) for r in non_gsheet)
    print(f"\nNon-gsheet rows in Inhouse 1 Apr: {len(non_gsheet)}, GMV {gmv_extra:.2f}")
    for r in sorted(non_gsheet, key=lambda x: -(float(x.get("gmv_rmb") or 0))):
        print(
            f"  {str(r.get('pay_time',''))[:10]} gmv={r.get('gmv_rmb')} "
            f"{r.get('ten_khach')} {r.get('loai_nhap')} {r.get('created_by_email')} "
            f"don={r.get('don_hang_id') or r.get('ma_don_hang') or '—'}"
        )

    def cat_break(rows: list[dict]) -> dict[str, dict[str, float | int]]:
        buckets: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
        for r in rows:
            tl = bc02_type_from_row(r.get("loai"), r.get("loai_2"))
            k = BC02_TYPE_TO_GMV_KEY.get(tl, "other")
            buckets[k]["n"] += 1
            buckets[k]["gmv"] += float(r.get("gmv_rmb") or 0)
        return buckets

    # Compare with live gsheet SM Hanoi Apr
    print("\n=== Live Google Sheet SM Hanoi (Apr 2026) ===")
    try:
        team_cache = TeamLookupCache(sb)
        payloads = collect_payloads_from_gsheet(
            team_cache,
            spreadsheet_id=DEFAULT_SPREADSHEET_ID,
            tabs=("SM Hanoi",),
            limit=0,
        )
        sheet_all_apr = [
            p
            for p in payloads
            if from_date <= (p.get("pay_time") or "")[:10] <= to_date
        ]
        sheet_apr = [p for p in sheet_all_apr if (p.get("team") or "") == "Inhouse 1"]
        sheet_gmv = sum(float(p.get("gmv_rmb") or 0) for p in sheet_apr)
        print(
            f"Sheet all teams Apr: {len(sheet_all_apr)}, GMV "
            f"{sum(float(p.get('gmv_rmb') or 0) for p in sheet_all_apr):.2f}"
        )
        print(f"Sheet Inhouse 1 Apr: {len(sheet_apr)}, GMV {sheet_gmv:.2f}")
        sheet_fps = {row_fingerprint(p) for p in sheet_apr}
        only_db = [r for r in i1 if row_fingerprint(r) not in sheet_fps]
        only_sheet = [
            p
            for p in sheet_apr
            if row_fingerprint(p) not in {row_fingerprint(r) for r in i1}
        ]
        print(f"DB rows not in sheet fingerprint: {len(only_db)}")
        print(f"Sheet rows not in DB: {len(only_sheet)}")

        sbkt = cat_break(sheet_apr)
        dbkt = cat_break(i1)
        print("\nCategory diff (sheet vs db Inhouse 1):")
        for k in sorted(set(sbkt) | set(dbkt)):
            s = sbkt.get(k, {"n": 0, "gmv": 0.0})
            d = dbkt.get(k, {"n": 0, "gmv": 0.0})
            if s["n"] != d["n"] or abs(float(s["gmv"]) - float(d["gmv"])) > 0.01:
                print(f"  {k}: sheet {s['n']}/{float(s['gmv']):.2f} vs db {d['n']}/{float(d['gmv']):.2f}")

        by_team: dict[str, dict[str, float | int]] = defaultdict(lambda: {"n": 0, "gmv": 0.0})
        for p in sheet_all_apr:
            t = p.get("team") or "None"
            by_team[t]["n"] += 1
            by_team[t]["gmv"] += float(p.get("gmv_rmb") or 0)
        print("\nSheet Apr by team:")
        for t, v in sorted(by_team.items(), key=lambda x: -float(x[1]["gmv"])):
            print(f"  {t}: {v['n']} / {float(v['gmv']):.2f}")
    except Exception as exc:
        print(f"Sheet fetch failed: {exc}")

    # Total ledger by team
    all_rows: list[dict] = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("so_tien_vnd, team, team_pivot_label, loai_nhap, created_by_email")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        all_rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    total_vnd = sum(int(r.get("so_tien_vnd") or 0) for r in all_rows)
    print(f"\n=== Total ledger: {len(all_rows)} rows, {total_vnd:,} VND ===")
    by_team: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "vnd": 0})
    for r in all_rows:
        t = team_to_canonical(r.get("team"), r.get("team_pivot_label"))
        by_team[t]["n"] += 1
        by_team[t]["vnd"] += int(r.get("so_tien_vnd") or 0)
    print("By team:")
    for t, v in sorted(by_team.items(), key=lambda x: -x[1]["vnd"]):
        print(f"  {t}: {v['n']} rows, {v['vnd']:,} VND")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
