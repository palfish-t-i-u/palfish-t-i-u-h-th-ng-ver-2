#!/usr/bin/env python3
"""Verify SQL norm_vi() RPC matches the JS normVi() golden fixture — bit for bit.

Đọc CÙNG file `frontend/src/lib/__fixtures__/normViCases.json` mà
`frontend/src/lib/textUtils.golden.test.ts` dùng — file đó là CHÂN LÝ DUY NHẤT
(sinh ra bằng cách chạy thật normVi(), không đoán tay). Lệch ở đâu thì sửa SQL
ở đó, KHÔNG sửa fixture để cho qua.

Xem docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md M1-T3.

Usage:
    python scripts/verify_norm_vi.py
"""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

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
    pass

try:
    from supabase import create_client
except ImportError:
    print("❌  Thiếu package: pip install supabase")
    sys.exit(1)

FIXTURE_PATH = PROJECT_ROOT / "frontend" / "src" / "lib" / "__fixtures__" / "normViCases.json"


def main() -> None:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("❌  ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (backend/.env) trước.")
        sys.exit(1)

    if not FIXTURE_PATH.exists():
        print(f"❌  Không tìm thấy fixture: {FIXTURE_PATH}")
        sys.exit(1)

    cases = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    sb = create_client(url, key)

    mismatches: list[dict] = []
    for case in cases:
        raw_input = case.get("input")
        expected = case.get("expected", "")
        try:
            res = sb.rpc("norm_vi", {"t": raw_input}).execute()
        except Exception as exc:
            msg = str(exc).lower()
            if "could not find the function" in msg:
                print(
                    "❌  RPC norm_vi chưa tồn tại trên DB — chạy migration "
                    "backend/migrations/2026-09-16-pr-list-page-rpc.sql trước."
                )
                sys.exit(1)
            print(f"❌  RPC lỗi với input={raw_input!r}: {exc}")
            sys.exit(1)
        actual = res.data
        if actual != expected:
            mismatches.append({"input": raw_input, "expected": expected, "actual": actual})

    print(f"Đã kiểm tra {len(cases)} case từ {FIXTURE_PATH.relative_to(PROJECT_ROOT)}")
    if mismatches:
        print(f"❌  LỆCH {len(mismatches)}/{len(cases)} case:")
        for m in mismatches:
            print(f"   input={m['input']!r}  expected={m['expected']!r}  actual={m['actual']!r}")
        sys.exit(1)

    print(f"✅  {len(cases)}/{len(cases)} case khớp — norm_vi (SQL) == normVi (JS).")


if __name__ == "__main__":
    main()
