#!/usr/bin/env python3
"""Cron entry: sync All File Thu Hiền → Sổ doanh thu, chỉ trong khung giờ cuối ngày.

Chạy trên **Render Cron Job riêng** (container độc lập — RAM tách khỏi web API
palfish-gmv-api, nên bước reconcile nạp full ledger không thể OOM con API sống).

Lịch cron (UTC) fire mỗi 5' trong 14:00–16:59; script này tự chặn ngoài khung VN:
  - Thường:      21:59 → 22:30 (VN, UTC+7)
  - Cuối tháng:  21:59 → 23:59
Ngoài khung → exit 0 (no-op), KHÔNG chạm DB.

Hành vi sync y hệt nút "Sync Data" trên tab Sổ doanh thu (cùng hàm
`sync_gsheet_to_ledger`, cùng floor mặc định, append-only dedupe).

Chạy tay để kiểm thử ngoài khung: đặt env `HCM_SYNC_FORCE=1` (hoặc `--force`).
"""
from __future__ import annotations

import argparse
import io
import json
import os
import sys
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path

# UTF-8 stdout (Render log) — mirror run_import.py
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

# --- Khung giờ (giờ Việt Nam, không DST) ---------------------------------
VN_TZ = timezone(timedelta(hours=7))
WINDOW_START = dt_time(21, 59, 0)
WINDOW_END_NORMAL = dt_time(22, 30, 59)  # seconds=59: cả phút :30 đều tính (cron có thể fire trễ vài giây)
WINDOW_END_EOM = dt_time(23, 59, 59)


def _is_last_day_of_month(d: date) -> bool:
    return (d + timedelta(days=1)).month != d.month


def _window_end(now: datetime) -> dt_time:
    """Biên cuối của khung: cuối tháng nới tới 23:59, ngày thường 22:30."""
    return WINDOW_END_EOM if _is_last_day_of_month(now.date()) else WINDOW_END_NORMAL


def _in_window(now: datetime) -> bool:
    """now: datetime giờ VN. True nếu đang trong khung chạy (khung không qua nửa đêm)."""
    t = now.time()
    return WINDOW_START <= t <= _window_end(now)


# --- Sync (y hệt nút Sync Data) -----------------------------------------
def _run_sync() -> dict:
    from supabase import create_client
    from gsheet_ledger_import import sync_gsheet_to_ledger

    url = os.getenv("SUPABASE_URL", "")
    # Chốt an toàn: chỉ chạy trên prod (cùng assert như run_import.py)
    assert "jozcvbbypwvzaefteoxn" in url, f"KHÔNG phải prod: {url!r}"
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    sb = create_client(url, key)
    return sync_gsheet_to_ledger(
        sb,
        dry_run=False,
        actor_email="import:gsheet:cron",
        sb_factory=lambda: create_client(url, key),
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync All File Thu Hiền → Sổ (cron, có cổng giờ)")
    ap.add_argument(
        "--force",
        action="store_true",
        help="Bỏ qua cổng giờ, chạy ngay (hoặc đặt env HCM_SYNC_FORCE=1)",
    )
    args = ap.parse_args()
    force = args.force or os.getenv("HCM_SYNC_FORCE", "").strip().lower() in ("1", "true", "yes")

    now = datetime.now(VN_TZ)
    stamp = now.strftime("%Y-%m-%d %H:%M:%S")
    end = _window_end(now)

    if not force and not _in_window(now):
        print(
            f"[hcm-sync] {stamp} VN — ngoài khung "
            f"({WINDOW_START.strftime('%H:%M')}–{end.strftime('%H:%M')}), bỏ qua."
        )
        return

    reason = "FORCE" if force and not _in_window(now) else "trong khung"
    print(f"[hcm-sync] {stamp} VN — {reason}, bắt đầu sync…")
    res = _run_sync()
    summary = {k: v for k, v in res.items() if k != "samples"}
    print(f"[hcm-sync] xong: {json.dumps(summary, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
