#!/usr/bin/env python3
"""Clean up all test-flagged data from PalFish GMV database.

Xoa toan bo data duoc danh dau is_test=true khoi cac bang:
  - payment_lines     (FK -> payment_requests)
  - active_requests   (FK -> payment_requests)
  - invoice_reminders (FK -> payment_requests)
  - payment_requests  (is_test = true)
  - so_doanh_thu      (is_test = true)

Sau do reset payment_request_sequences va invoice_sequences ve 0
neu khong con PR that nao.

Usage:
    python scripts/clean_test_data.py           # dry-run (preview only)
    python scripts/clean_test_data.py --apply   # thuc su xoa
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

# Fix Unicode output trên Windows terminal (cmd/PowerShell)
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Load .env — thử backend/.env trước, rồi thư mục project root
BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
ENV_FILE = BACKEND_DIR / ".env"
if not ENV_FILE.exists():
    ENV_FILE = PROJECT_ROOT / ".env"

try:
    from dotenv import load_dotenv
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
except ImportError:
    pass  # python-dotenv không có → dùng env vars hệ thống

try:
    from supabase import create_client
except ImportError:
    print("❌  Thiếu package: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print(f"[ERROR] Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY.")
    print(f"  -> Tao file: {BACKEND_DIR / '.env'}")
    print(f"  -> Copy tu:  {BACKEND_DIR / '.env.example'}")
    print(f"  -> Dien vao: SUPABASE_SERVICE_ROLE_KEY=<key>")
    sys.exit(1)


def get_year_key() -> str:
    from datetime import datetime
    return str(datetime.now().year)


def run(dry_run: bool) -> None:
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    mode = "[DRY-RUN]" if dry_run else "[APPLY]"

    # ── 1. Tìm tất cả PR có is_test = true ──────────────────────────────────
    test_prs = sb.table("payment_requests").select("id, name, uid").eq("is_test", True).execute().data
    test_pr_ids = [r["id"] for r in test_prs]

    # ── 2. Tìm so_doanh_thu test ──────────────────────────────────────────────
    test_sdt = sb.table("so_doanh_thu").select("id, ten_khach, uid").eq("is_test", True).execute().data

    # ── 3. Tìm active_requests liên quan ─────────────────────────────────────
    test_ars: list[dict] = []
    if test_pr_ids:
        test_ars = sb.table("active_requests").select("id, pr_id").in_("pr_id", test_pr_ids).execute().data

    # ── 4. Tìm payment_lines liên quan ───────────────────────────────────────
    test_pls: list[dict] = []
    if test_pr_ids:
        test_pls = sb.table("payment_lines").select("id, payment_request_id").in_("payment_request_id", test_pr_ids).execute().data

    # ── 5. Tìm invoice_reminders liên quan ───────────────────────────────────
    test_irs: list[dict] = []
    if test_pr_ids:
        test_irs = sb.table("invoice_reminders").select("id, payment_request_id").in_("payment_request_id", test_pr_ids).execute().data

    # ── Preview ──────────────────────────────────────────────────────────────
    print(f"\n{'='*55}")
    print(f"  PalFish GMV — Clean Test Data  {mode}")
    print(f"{'='*55}")
    print(f"  payment_requests : {len(test_prs):>4} dòng test")
    for pr in test_prs:
        print(f"    • {pr['id']}  {pr['name']} (uid: {pr['uid']})")
    print(f"  payment_lines    : {len(test_pls):>4} dòng")
    print(f"  active_requests  : {len(test_ars):>4} dòng")
    print(f"  invoice_reminders: {len(test_irs):>4} dòng")
    print(f"  so_doanh_thu     : {len(test_sdt):>4} dòng test")
    for s in test_sdt:
        print(f"    • {s['id'][:8]}…  {s['ten_khach']} (uid: {s['uid']})")

    total = len(test_prs) + len(test_pls) + len(test_ars) + len(test_irs) + len(test_sdt)
    if total == 0:
        print("\n✅  Không có data test nào. Database đã sạch!")
        return

    # ── Xác nhận nếu APPLY ───────────────────────────────────────────────────
    if not dry_run:
        print(f"\n  Sẽ xóa {total} dòng. Tiếp tục? [y/N] ", end="", flush=True)
        answer = input().strip().lower()
        if answer != "y":
            print("  Hủy.")
            return

    # ── Thực hiện xóa ────────────────────────────────────────────────────────
    if not dry_run:
        print()
        if test_pls:
            sb.table("payment_lines").delete().in_("payment_request_id", test_pr_ids).execute()
            print(f"  ✓ Đã xóa {len(test_pls)} payment_lines")

        if test_ars:
            sb.table("active_requests").delete().in_("pr_id", test_pr_ids).execute()
            print(f"  ✓ Đã xóa {len(test_ars)} active_requests")

        if test_irs:
            sb.table("invoice_reminders").delete().in_("payment_request_id", test_pr_ids).execute()
            print(f"  ✓ Đã xóa {len(test_irs)} invoice_reminders")

        if test_prs:
            sb.table("payment_requests").delete().eq("is_test", True).execute()
            print(f"  ✓ Đã xóa {len(test_prs)} payment_requests")

        if test_sdt:
            sb.table("so_doanh_thu").delete().eq("is_test", True).execute()
            print(f"  ✓ Đã xóa {len(test_sdt)} so_doanh_thu")

        # Reset sequences nếu không còn PR thật
        remaining = sb.table("payment_requests").select("id", count="exact").eq("is_test", False).execute()
        real_count = remaining.count or 0
        if real_count == 0:
            year = get_year_key()
            sb.table("payment_request_sequences").update({"current_val": 0}).eq("year_key", year).execute()
            sb.table("invoice_sequences").update({"current_val": 0}).eq("year_key", year).execute()
            print(f"  ✓ Reset sequences {year} → 0")
        else:
            print(f"  ℹ  Còn {real_count} PR thật → giữ nguyên sequence")

        print(f"\n✅  Hoàn tất! Đã xóa {total} dòng test.")
    else:
        print(f"\n  → Chạy với --apply để thực sự xóa {total} dòng.")

    print(f"{'='*55}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean PalFish GMV test data")
    parser.add_argument("--apply", action="store_true", help="Thực sự xóa (mặc định: dry-run)")
    args = parser.parse_args()
    run(dry_run=not args.apply)


if __name__ == "__main__":
    main()
