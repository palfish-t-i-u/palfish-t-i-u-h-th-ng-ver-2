#!/usr/bin/env python3
"""One-day reconcile: GMV tab vs SM Hanoi vs Sổ — 2026-05-25."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    _parse_sheet_number,
    fetch_gsheet_tab_values,
    map_sm_hanoi_row,
)
from supabase import create_client

DAY = "2026-05-25"


def fp_pay(p: dict) -> tuple:
    return (
        (p.get("pay_time") or "")[:10],
        str(p.get("uid") or ""),
        int(p.get("so_tien_vnd") or 0),
        (p.get("sale_crm_name") or "").strip().lower(),
    )


def fp_row(r: dict) -> tuple:
    return (
        (r.get("pay_time") or "")[:10],
        str(r.get("uid") or ""),
        int(r.get("so_tien_vnd") or 0),
        (r.get("sale_crm_name") or "").strip().lower(),
    )


def main() -> int:
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    gmv_rows = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="GMV")
    for row in gmv_rows:
        if not row:
            continue
        a = str(row[0]).strip()
        if re.match(r"^2026[/-]5[/-]25$", a) or a in ("2026/5/25", "2026-05-25"):
            b = int(_parse_sheet_number(row[1] if len(row) > 1 else 0) or 0)
            c = row[2] if len(row) > 2 else ""
            print(f"GMV tab: A={a!r} B orders={b} C gmv={c!r}")

    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="SM Hanoi")
    payloads = []
    for i, row in enumerate(raw):
        if i == 0:
            continue
        p = map_sm_hanoi_row(team_cache, row, tab="SM Hanoi")
        if p:
            payloads.append(p)

    pay_all = [p for p in payloads if (p.get("pay_time") or "")[:10] == DAY]
    bank_all = [p for p in payloads if (p.get("ngay_tien_ve") or "")[:10] == DAY]
    i1 = [p for p in pay_all if (p.get("team") or "") == "Inhouse 1"]
    print(f"SM Hanoi pay_time {DAY}: all={len(pay_all)} inhouse1={len(i1)}")
    print(f"SM Hanoi bank_day {DAY}: all={len(bank_all)}")

    res = (
        sb.table("so_doanh_thu")
        .select("id,ten_khach,so_tien_vnd,sale_crm_name,team,loai_nhap,pay_time,uid")
        .gte("pay_time", f"{DAY}T00:00:00")
        .lte("pay_time", f"{DAY}T23:59:59")
        .execute()
    )
    all_rows = res.data or []
    tay = [r for r in all_rows if r.get("loai_nhap") == "tay"]
    m3 = [r for r in all_rows if r.get("loai_nhap") == "tu_dong"]
    print(f"Sổ pay_time {DAY}: total={len(all_rows)} tay={len(tay)} tu_dong={len(m3)}")

    sheet_fps = {fp_pay(p) for p in pay_all}
    app_fps = {fp_row(r) for r in tay}
    print(f"Fingerprint: app-only={len(app_fps - sheet_fps)} sheet-only={len(sheet_fps - app_fps)}")
    for r in tay:
        if fp_row(r) not in sheet_fps:
            print(
                f"  app-only: {r.get('ten_khach')} vnd={r.get('so_tien_vnd')} "
                f"sale={r.get('sale_crm_name')} team={r.get('team')}"
            )
    for p in pay_all:
        if fp_pay(p) not in app_fps:
            print(
                f"  sheet-only: {p.get('ten_khach')} vnd={p.get('so_tien_vnd')} "
                f"sale={p.get('sale_crm_name')} team={p.get('team')}"
            )

    print("\nNon-Inhouse 1 (explains GMV 21 vs Sổ 24 tay):")
    for p in pay_all:
        if (p.get("team") or "") != "Inhouse 1":
            print(
                f"  team={p.get('team')!r} {p.get('ten_khach')} "
                f"vnd={p.get('so_tien_vnd')} sale={p.get('sale_crm_name')}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
