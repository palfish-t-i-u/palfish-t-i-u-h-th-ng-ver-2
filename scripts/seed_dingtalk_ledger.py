#!/usr/bin/env python3
"""Seed Sổ doanh thu sạch từ file gốc DingTalk (xlsx).

Quy trình khuyến nghị:
  1. Dry-run: python scripts/seed_dingtalk_ledger.py --dry-run
  2. Purge + seed: python scripts/seed_dingtalk_ledger.py --purge-gsheet --confirm

Cần SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY trong backend/.env
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def _load_dotenv() -> None:
    env_path = ROOT / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path, override=False)
        except ImportError:
            pass


def main() -> int:
    _load_dotenv()
    parser = argparse.ArgumentParser(description="Seed Sổ từ DingTalk xlsx (SM INCOME + HCM REVENUE)")
    parser.add_argument(
        "--sm-xlsx",
        type=Path,
        default=Path(r"E:\PalFish\DA\SM HANOI daily report.xlsx"),
    )
    parser.add_argument(
        "--hcm-xlsx",
        type=Path,
        default=Path(r"E:\PalFish\DA\HCM Revenue statement.xlsx"),
    )
    parser.add_argument("--sm-max-row", type=int, default=13943)
    parser.add_argument("--hcm-max-row", type=int, default=798)
    parser.add_argument("--dry-run", action="store_true", help="Chỉ map + in sample, không ghi DB")
    parser.add_argument(
        "--purge-gsheet",
        action="store_true",
        help="Xóa dòng cũ created_by_email import:gsheet:* trước khi insert",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Bắt buộc khi purge hoặc insert thật (tránh chạy nhầm)",
    )
    args = parser.parse_args()

    if not args.dry_run and not args.confirm:
        print("Thêm --confirm để ghi DB, hoặc --dry-run để xem trước.", file=sys.stderr)
        return 1

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    if not args.sm_xlsx.exists():
        print("Không thấy:", args.sm_xlsx, file=sys.stderr)
        return 1
    if not args.hcm_xlsx.exists():
        print("Không thấy:", args.hcm_xlsx, file=sys.stderr)
        return 1

    from supabase import create_client
    from gsheet_ledger_import import TeamLookupCache
    from xlsx_ledger_import import (
        collect_dingtalk_payloads,
        insert_ledger_payloads,
        purge_gsheet_import_rows,
    )

    sb = create_client(url, key)

    if args.purge_gsheet:
        if args.dry_run:
            print("Dry-run: bỏ qua purge (dùng --confirm --purge-gsheet để xóa thật)")
        else:
            print("Purge import:gsheet:* …")
            n = purge_gsheet_import_rows(sb)
            print(f"Đã xóa {n} dòng import cũ từ All File")

    print("Load team cache…")
    team_cache = TeamLookupCache(sb)
    print(f"  {team_cache.size} sale trong nhan_su_sale")

    payloads = collect_dingtalk_payloads(
        team_cache,
        sm_path=args.sm_xlsx,
        hcm_path=args.hcm_xlsx,
        sm_max_row=args.sm_max_row,
        hcm_max_row=args.hcm_max_row,
    )

    sm_n = sum(1 for p in payloads if "SM Hanoi" in (p.get("created_by_email") or ""))
    hcm_n = len(payloads) - sm_n
    sum_gmv = round(sum(p.get("gmv_rmb") or 0 for p in payloads), 2)
    print(f"Tổng: {len(payloads)} dòng (SM {sm_n}, HCM {hcm_n}), SUM GMV ≈ {sum_gmv} RMB")

    insert_ledger_payloads(
        sb,
        payloads,
        dry_run=args.dry_run,
        sb_factory=lambda: create_client(url, key),
    )

    if not args.dry_run:
        print("Xong. Chạy lại audit script hoặc đối chiếu BC01/BC02 trên app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
