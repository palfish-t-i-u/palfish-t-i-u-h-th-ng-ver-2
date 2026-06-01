#!/usr/bin/env python3
"""Kiểm tra luồng B3 (gắn Order ID) → Sổ doanh thu trên DB hiện tại.

Chạy từ repo root (cần backend/.env):
  python scripts/test_b3_ledger_e2e.py
  python scripts/test_b3_ledger_e2e.py --backfill   # tạo dòng thiếu cho AR cũ
  python scripts/test_b3_ledger_e2e.py --patch AR-2026-0002 CC-0010-001 DEMO-123
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from supabase import create_client  # noqa: E402


def _sb():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong backend/.env")
    return create_client(url, key)


def _courses_with_order_id(uids_data: list) -> list[tuple[str, str, int]]:
    out: list[tuple[str, str, int]] = []
    for ub in uids_data or []:
        if not isinstance(ub, dict):
            continue
        for c in ub.get("courses") or []:
            if not isinstance(c, dict):
                continue
            oid = str(c.get("order_id") or c.get("orderId") or "").strip()
            if oid:
                out.append((str(c.get("code") or ""), oid, int(float(c.get("amount") or 0))))
    return out


def print_ar_ledger_gap(sb) -> None:
    ars = (
        sb.table("active_requests")
        .select("id, pr_id, status, uids_data, updated_at")
        .order("updated_at", desc=True)
        .limit(20)
        .execute()
    )
    led = (
        sb.table("so_doanh_thu")
        .select("ma_don_hang, crm_order_id, ngay_tien_ve, so_tien_vnd, note")
        .eq("loai_nhap", "tu_dong")
        .execute()
    )
    ledger_by_crm = {r.get("crm_order_id"): r for r in (led.data or [])}
    ledger_by_code = {r.get("ma_don_hang"): r for r in (led.data or [])}

    print("=== AR có Order ID vs Sổ doanh thu (tu_dong) ===")
    missing = 0
    for ar in ars.data or []:
        courses = _courses_with_order_id(ar.get("uids_data") or [])
        if not courses:
            continue
        print(f"\n{ar['id']}  status={ar.get('status')}  pr={ar.get('pr_id')}")
        for code, oid, amt in courses:
            in_ledger = oid in ledger_by_crm or code in ledger_by_code
            mark = "OK" if in_ledger else "THIẾU"
            if not in_ledger:
                missing += 1
            row = ledger_by_crm.get(oid) or ledger_by_code.get(code)
            pay = row.get("ngay_tien_ve") if row else "—"
            print(f"  [{mark}] {code} order_id={oid} amount={amt} pay_time={pay}")

    print(f"\nTổng course có order_id thiếu trên Sổ: {missing}")
    print(f"Tổng dòng tu_dong hiện có: {len(led.data or [])}")


def run_backfill(sb) -> None:
    from revenue_routes import backfill_ledger_from_active_requests

    stats = backfill_ledger_from_active_requests(sb)
    print("Backfill:", stats)


def patch_via_api(ar_id: str, course_code: str, order_id: str, api_base: str) -> None:
    url = f"{api_base.rstrip('/')}/api/v1/active-requests/{ar_id}/courses/{course_code}"
    body = json.dumps({"order_id": order_id}).encode()
    req = urllib.request.Request(url, data=body, method="PATCH", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"PATCH {resp.status}: {resp.read()[:300].decode()}")
    except urllib.error.HTTPError as exc:
        print(f"PATCH lỗi {exc.code}: {exc.read()[:500].decode()}")
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Test B3 → Sổ doanh thu")
    parser.add_argument("--backfill", action="store_true", help="Backfill AR cũ chưa có dòng Sổ")
    parser.add_argument("--patch", nargs=3, metavar=("AR_ID", "COURSE_CODE", "ORDER_ID"))
    parser.add_argument("--api", default=os.environ.get("API_BASE", "http://127.0.0.1:8000"))
    args = parser.parse_args()

    sb = _sb()
    if args.backfill:
        run_backfill(sb)
    if args.patch:
        patch_via_api(args.patch[0], args.patch[1], args.patch[2], args.api)
    print_ar_ledger_gap(sb)

    print(
        "\nGợi ý UI: Sổ lọc theo Pay Time (ngày tiền về PR), không phải ngày kích hoạt."
        "\nDòng test hiện tại thường có ngay_tien_ve = 2026-06-01 — chọn khoảng ngày đó hoặc bỏ lọc."
    )


if __name__ == "__main__":
    main()
