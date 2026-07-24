#!/usr/bin/env python3
"""1 lệnh: import GSheet (apply) → audit 2 tháng gần nhất → 1 báo cáo.

Chạy hàng tuần tới ngày Thu Hiền chuyển hẳn sang Sổ. Exit code != 0 nếu
recent-month còn lệch (sheet_only/amount_mismatch > 0) — nhìn phát biết ngay.
KHÔNG tự lên cron — Minh chạy tay hoặc tự quyết lịch.
"""
from __future__ import annotations

import io
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND = Path(__file__).resolve().parents[1]
today = date.today()
prev = (today.replace(day=1) - timedelta(days=1)).replace(day=1)

r1 = subprocess.run([sys.executable, "scripts/run_import.py", "--apply"], cwd=BACKEND)
if r1.returncode != 0:
    sys.exit("Import lỗi — dừng, không audit.")
r2 = subprocess.run(
    [sys.executable, "scripts/audit_so_vs_allfile.py",
     "--start", prev.isoformat(), "--end", today.isoformat()],
    cwd=BACKEND, capture_output=True, text=True, encoding="utf-8")
print(r2.stdout)
ok = ("File có, app THIẾU | 0 dòng" in r2.stdout
      and "Lệch số tiền (cùng khách cùng ngày) | 0 dòng" in r2.stdout)
print("\n=== " + ("✅ KHỚP SẠCH 2 tháng gần nhất" if ok else "❌ CÒN LỆCH — mở CSV") + " ===")
sys.exit(0 if ok else 2)
