#!/usr/bin/env python3
"""Chạy sync_gsheet_to_ledger từ CLI. Mặc định DRY-RUN. --apply mới ghi."""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

import os
from supabase import create_client
from gsheet_ledger_import import sync_gsheet_to_ledger, DEFAULT_MIN_INSERT_DAY


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="GHI THẬT (mặc định dry-run)")
    ap.add_argument("--min-day", default=DEFAULT_MIN_INSERT_DAY)
    args = ap.parse_args()

    url = os.getenv("SUPABASE_URL", "")
    assert "jozcvbbypwvzaefteoxn" in url, f"KHÔNG phải prod: {url}"
    sb = create_client(url, os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    res = sync_gsheet_to_ledger(
        sb, dry_run=not args.apply, min_insert_day=args.min_day,
        actor_email="import:gsheet:cli",
    )
    print(json.dumps({k: v for k, v in res.items() if k != "samples"},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
