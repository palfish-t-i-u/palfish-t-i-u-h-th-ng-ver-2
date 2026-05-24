#!/usr/bin/env python3
"""List Sổ doanh thu rows for sales missing from All File Thu Hiền xlsx pivot."""

from __future__ import annotations

import calendar
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from revenue_routes import team_to_canonical  # noqa: E402


CHECKS = [
    ("Cu Thi Thu Hien", "2025/1", 69_551),
    ("Hoang Thi Hong Tham", "2025/1", 23_704),
    ("Nguyen Nhat Vy", "2026/1", 34_120),
]


def month_range(mk: str) -> tuple[str, str]:
    y, m = mk.split("/")
    last = calendar.monthrange(int(y), int(m))[1]
    return f"{y}-{int(m):02d}-01", f"{y}-{int(m):02d}-{last}"


def main() -> int:
    from supabase import create_client

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

    for sale, mk, expected in CHECKS:
        fr, to = month_range(mk)
        res = (
            sb.table("so_doanh_thu")
            .select(
                "id, pay_time, ngay_tien_ve, gmv_rmb, so_tien_vnd, sale_crm_name, team, "
                "team_pivot_label, sdt, uid, ten_khach, ma_don_hang, crm_order_id"
            )
            .eq("sale_crm_name", sale)
            .gte("pay_time", f"{fr}T00:00:00")
            .lte("pay_time", f"{to}T23:59:59")
            .order("pay_time")
            .execute()
        )
        rows = res.data or []
        inhouse = [
            r
            for r in rows
            if team_to_canonical(r.get("team"), r.get("team_pivot_label")) == "Inhouse 1"
        ]
        gmv = sum(float(r.get("gmv_rmb") or 0) for r in inhouse)
        print(f"\n=== {sale} | {mk} | Inhouse 1 | {len(inhouse)} dòng | GMV {gmv:,.0f} (≈{expected:,}) ===")
        for r in inhouse:
            pay = str(r.get("pay_time") or "")[:10]
            don = r.get("crm_order_id") or r.get("ma_don_hang")
            print(
                f"  pay={pay} gmv={r.get('gmv_rmb')} vnd={r.get('so_tien_vnd')} "
                f"sdt={r.get('sdt')} uid={r.get('uid')} khach={r.get('ten_khach')} don={don}"
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
