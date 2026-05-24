#!/usr/bin/env python3
"""Import Sổ doanh thu từ Google Sheet All File Thu Hiền.

Cần:
  - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (backend/.env)
  - GOOGLE_SERVICE_ACCOUNT_JSON=path/to/service-account.json
  - Sheet share Viewer cho email service account

Ví dụ:
  python scripts/import_gsheet_so_doanh_thu.py --dry-run --limit 20
  python scripts/import_gsheet_so_doanh_thu.py
  python scripts/import_gsheet_so_doanh_thu.py --tab "SM Hanoi" --limit 500
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
    parser = argparse.ArgumentParser(description="Import All File Thu Hiền → so_doanh_thu")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ đếm + in sample, không ghi DB")
    parser.add_argument("--limit", type=int, default=0, help="Giới hạn số dòng map (0 = hết)")
    parser.add_argument(
        "--spreadsheet-id",
        default=os.environ.get("GOOGLE_SHEETS_ID", ""),
        help="Google Spreadsheet ID (mặc định All File Thu Hiền)",
    )
    parser.add_argument(
        "--credentials",
        default=os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""),
        help="Đường dẫn file JSON service account",
    )
    parser.add_argument(
        "--tab",
        action="append",
        dest="tabs",
        help="Tab import (lặp được). Mặc định: SM Hanoi + HCM REV",
    )
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    from supabase import create_client
    from gsheet_ledger_import import DEFAULT_SHEET_TABS, sync_gsheet_to_ledger

    sb = create_client(url, key)
    tabs = tuple(args.tabs) if args.tabs else DEFAULT_SHEET_TABS

    def sb_factory():
        return create_client(url, key)

    try:
        result = sync_gsheet_to_ledger(
            sb,
            spreadsheet_id=args.spreadsheet_id or None,
            tabs=tabs,
            credentials_path=args.credentials or None,
            limit=args.limit,
            dry_run=args.dry_run,
            sb_factory=sb_factory,
        )
    except FileNotFoundError as exc:
        print(exc, file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Lỗi import: {exc}", file=sys.stderr)
        return 1

    print("\n--- Kết quả ---")
    print(f"Tabs: {', '.join(result['tabs'])}")
    print(f"Fetched (unique): {result['fetched']}")
    print(f"Skipped (đã import): {result['skippedExisting']}")
    print(f"Inserted: {result['inserted']}" + (" [dry-run]" if result["dryRun"] else ""))
    if result["samples"]:
        print("\nSample:")
        for s in result["samples"]:
            print(
                f"  {s.get('ngay_tien_ve')} {s.get('ten_khach')} "
                f"{s.get('so_tien_vnd'):,} VND sale={s.get('sale_crm_name')} team={s.get('team')}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
