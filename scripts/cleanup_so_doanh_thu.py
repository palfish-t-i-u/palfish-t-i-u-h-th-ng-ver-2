#!/usr/bin/env python3
"""Xóa dòng test trong so_doanh_thu — giữ data thật (import Excel, sau go-live).

Phân loại theo created_by_email:
  import:HN / import:HCM  → lịch sử Excel HNxHCM
  import:gsheet:*         → import All File Thu Hiền (Google Sheet)
  email user / backfill@m3 → test hoặc đơn app (xóa trước go-live nếu cần)

Ví dụ:
  # Xóa chỉ dòng import từ Google Sheet (All File Thu Hiền)
  python scripts/cleanup_so_doanh_thu.py --gsheet-only --dry-run
  python scripts/cleanup_so_doanh_thu.py --gsheet-only

  # Xem sẽ xóa gì (giữ mọi import:*)
  python scripts/cleanup_so_doanh_thu.py --keep-import-only --dry-run

  # Xóa hết trừ import Excel
  python scripts/cleanup_so_doanh_thu.py --keep-import-only

  # Xóa toàn bộ Sổ (trước khi import lần đầu)
  python scripts/cleanup_so_doanh_thu.py --all --dry-run
  python scripts/cleanup_so_doanh_thu.py --all

  # Xóa mọi dòng tạo trước ngày go-live
  python scripts/cleanup_so_doanh_thu.py --before 2026-06-01 --dry-run
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

            load_dotenv(env_path)
        except ImportError:
            pass


def _fetch_all(sb, select: str = "id,ten_khach,ma_don_hang,loai_nhap,created_by_email,created_at") -> list[dict]:
    rows: list[dict] = []
    offset = 0
    page = 500
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select(select)
            .order("created_at")
            .range(offset, offset + page - 1)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += page
    return rows


def _is_import_row(row: dict) -> bool:
    email = (row.get("created_by_email") or "").strip()
    return email.startswith("import:")


def _is_gsheet_import_row(row: dict) -> bool:
    email = (row.get("created_by_email") or "").strip()
    return email.startswith("import:gsheet:")


def _match_before(row: dict, before: str) -> bool:
    created = (row.get("created_at") or "")[:10]
    return bool(created and created < before)


def main() -> int:
    _load_dotenv()
    parser = argparse.ArgumentParser(description="Cleanup test rows in so_doanh_thu")
    parser.add_argument("--dry-run", action="store_true", help="Chỉ in, không xóa")
    parser.add_argument(
        "--gsheet-only",
        action="store_true",
        help="Xóa dòng import:gsheet:* (All File Thu Hiền qua Google Sheet)",
    )
    parser.add_argument(
        "--keep-import-only",
        action="store_true",
        help="Xóa mọi dòng KHÔNG phải import:* (giữ HN/HCM/gsheet)",
    )
    parser.add_argument("--all", action="store_true", help="Xóa toàn bộ Sổ")
    parser.add_argument(
        "--before",
        metavar="YYYY-MM-DD",
        help="Xóa dòng created_at trước ngày này",
    )
    args = parser.parse_args()

    if not args.gsheet_only and not args.keep_import_only and not args.all and not args.before:
        parser.error("Cần --gsheet-only, --keep-import-only, --all, hoặc --before")

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    from supabase import create_client

    sb = create_client(url, key)
    rows = _fetch_all(sb)
    print(f"Total rows in so_doanh_thu: {len(rows)}")

    to_delete: list[dict] = []
    for row in rows:
        if args.all:
            to_delete.append(row)
        elif args.gsheet_only and _is_gsheet_import_row(row):
            to_delete.append(row)
        elif args.keep_import_only and not _is_import_row(row):
            to_delete.append(row)
        elif args.before and _match_before(row, args.before):
            to_delete.append(row)

    if not to_delete:
        print("Nothing to delete.")
        return 0

    print(f"Will delete: {len(to_delete)} row(s)")
    for r in to_delete[:20]:
        print(
            f"  - {r.get('ten_khach') or '?'} | {r.get('ma_don_hang') or '—'} | "
            f"{r.get('loai_nhap')} | {r.get('created_by_email')} | {str(r.get('created_at', ''))[:10]}"
        )
    if len(to_delete) > 20:
        print(f"  ... and {len(to_delete) - 20} more")

    if args.dry_run:
        print("Dry-run — no rows deleted.")
        return 0

    ids = [r["id"] for r in to_delete]
    batch = 50
    deleted = 0
    for i in range(0, len(ids), batch):
        chunk = ids[i : i + batch]
        sb.table("so_doanh_thu").delete().in_("id", chunk).execute()
        deleted += len(chunk)
        print(f"  deleted {deleted}/{len(ids)}")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
