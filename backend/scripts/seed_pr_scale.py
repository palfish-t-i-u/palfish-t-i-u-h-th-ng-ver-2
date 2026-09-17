#!/usr/bin/env python3
"""Seed 2.000 payment_requests trên sandbox để test scale cho pr-list server pagination.

Xem docs/superpowers/plans/2026-09-15-pr-list-server-pagination.md M0-T5.
Pattern copy từ scripts/clean_test_data.py (load .env, confirm y/N trước khi apply).

Phân bố (2000 PR, is_test=true, id = PR-SEED-%05d):
  - state: pending 30% (600) / short 20% (400) / done 40% (800) / over 5% (100) / cancelled 5% (100)
    payment_lines được sinh KHỚP với state mong muốn (không chỉ set cột state suông) —
    vì pr_list_page/pr_list_summary tính eff_state TỪ payment_lines (M0-N1), set state
    thẳng mà không có lines tương ứng sẽ khiến RPC trả eff_state khác state cột.
  - 100 PR (trong nhóm short/done) có 15-30 dòng installment (heavy).
  - ~40% (800 PR) có 1 active_requests đi kèm.
  - >= 50 cặp trùng created_at (test tie-break `order by created_at desc, id desc`).
  - created_at rải đều 180 ngày gần nhất.
  - tên có dấu tiếng Việt thật (không phải placeholder) để test search norm_vi().
  - 1 phần nhỏ PR có phone rỗng/ngắn — test guard SĐT rỗng (position('' in x) = 1 bug).

Usage:
    python scripts/seed_pr_scale.py            # dry-run (chỉ preview phân bố)
    python scripts/seed_pr_scale.py --apply    # thực sự insert
    python scripts/seed_pr_scale.py --clean    # xoá toàn bộ PR-SEED-* (dry-run preview)
    python scripts/seed_pr_scale.py --clean --apply   # thực sự xoá PR-SEED-*
"""

from __future__ import annotations

import argparse
import io
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

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

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[ERROR] Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY (backend/.env).")
    sys.exit(1)

# Safety: KHÔNG BAO GIỜ cho script này chạy nhắm vào prod (jozcvbbypwvzaefteoxn).
if "jozcvbbypwvzaefteoxn" in SUPABASE_URL:
    print("❌  SUPABASE_URL đang trỏ PROD — script này CHỈ chạy trên sandbox. Dừng.")
    sys.exit(1)

N_TOTAL = 2000
SEED_ID_PREFIX = "PR-SEED-"
STATE_BUCKETS = [
    ("pending", 0.30),
    ("short", 0.20),
    ("done", 0.40),
    ("over", 0.05),
    ("cancelled", 0.05),
]
HEAVY_INSTALLMENT_COUNT = 100
AR_RATIO = 0.40
MIN_DUP_CREATED_AT_PAIRS = 50
DAYS_SPAN = 180

# Vài email sale thật đã có trong nhan_su_sale sandbox (xem query trước khi viết script) —
# để tvts option/count có ý nghĩa thật khi test, không chỉ email giả vô danh.
SALE_EMAILS = [
    "sale_hn@palfish.vn",
    "sale_hcm@palfish.vn",
    "sale.seed1@dev",
    "sale.seed2@dev",
    "",  # PR chưa gán sale — rơi vào bucket "__unknown_tvts__"
]

FIRST_NAMES = [
    "Nguyễn Thị Phương Thảo", "Trần Văn Hùng", "Lê Thị Bích Thuận", "Phạm Đức Ước",
    "Hoàng Bảo Ngân", "Vũ Thị Kim Chi", "Đặng Quốc Trường", "Bùi Thị Hạnh",
    "Đỗ Minh Quân", "Ngô Thị Như Ý", "Dương Văn Đường", "Đinh Thị Trãi",
    "Phan Thị Vũ", "Trịnh Văn Ước", "Lý Thị Ngọc Trâm",
]
CHILD_NAMES = [
    "Bé An", "Bé Bảo", "Bé Chi", "Bé Đăng Khoa", "Bé Gia Hân",
    "Bé Hoàng Long", "Bé Khánh Vy", "Bé Minh Thư", "Bé Ngọc Anh", "Bé Yến Nhi",
]


def _rand_name(rng: random.Random) -> str:
    return rng.choice(FIRST_NAMES)


def _rand_phone(rng: random.Random, i: int) -> str:
    # ~5% rỗng, ~5% ngắn (<4 số) để test guard SĐT rỗng/ngắn — còn lại số VN thật dạng 84xxxxxxxxx.
    roll = rng.random()
    if roll < 0.05:
        return ""
    if roll < 0.10:
        return str(rng.randint(1, 99))
    return f"84{rng.randint(300000000, 999999999)}"


def _line_for_state(target: int, state: str, rng: random.Random) -> list[dict[str, Any]]:
    """Sinh payment_lines để tổng paid KHỚP với state mong muốn (mirror _compute_state)."""
    if state == "pending":
        return []
    if state == "short":
        recv = int(target * rng.uniform(0.2, 0.8))
        return [{"amount": recv, "status": "paid", "method": "qr"}]
    if state == "done":
        return [{"amount": target, "status": "paid", "method": "qr"}]
    if state == "over":
        recv = int(target * rng.uniform(1.1, 1.5))
        return [{"amount": recv, "status": "paid", "method": "bank"}]
    if state == "cancelled":
        # Đa số cancelled không có line paid; ~10% có 1 line paid CỐ Ý (mirror hành vi
        # thật đã thấy trên prod — early-return payment_request_routes.py:~1501, không phải bug).
        if rng.random() < 0.10:
            return [{"amount": int(target * 0.5), "status": "paid", "method": "qr"}]
        return []
    return []


def _heavy_installment_lines(target: int, rng: random.Random) -> list[dict[str, Any]]:
    n = rng.randint(15, 30)
    per = max(1, target // n)
    lines = []
    for idx in range(n):
        amt = per if idx < n - 1 else target - per * (n - 1)
        lines.append({"amount": amt, "status": "paid", "method": "installment", "verified_received": amt})
    return lines


def build_seed(n_total: int = N_TOTAL) -> tuple[list[dict], list[dict], list[dict]]:
    rng = random.Random(20260916)  # seed cố định — reproducible giữa các lần chạy
    now = datetime.now(timezone.utc)

    # Danh sách state theo đúng tỷ lệ, rồi shuffle.
    states: list[str] = []
    for state, ratio in STATE_BUCKETS:
        states.extend([state] * round(n_total * ratio))
    while len(states) < n_total:
        states.append("pending")
    states = states[:n_total]
    rng.shuffle(states)

    # created_at: rải 180 ngày, ép >= MIN_DUP_CREATED_AT_PAIRS cặp trùng giờ-phút-giây.
    created_ats: list[datetime] = []
    for i in range(n_total):
        offset_days = rng.uniform(0, DAYS_SPAN)
        created_ats.append(now - timedelta(days=offset_days))
    # Ép trùng: lấy 2*MIN_DUP cái đầu, ghép cặp cho trùng timestamp.
    for pair_idx in range(MIN_DUP_CREATED_AT_PAIRS):
        a, b = pair_idx * 2, pair_idx * 2 + 1
        created_ats[b] = created_ats[a]

    heavy_idx = set(
        rng.sample(
            [i for i, s in enumerate(states) if s in ("short", "done")],
            k=min(HEAVY_INSTALLMENT_COUNT, sum(1 for s in states if s in ("short", "done"))),
        )
    )
    ar_idx = set(rng.sample(range(n_total), k=round(n_total * AR_RATIO)))

    prs: list[dict[str, Any]] = []
    lines: list[dict[str, Any]] = []
    ars: list[dict[str, Any]] = []

    for i in range(n_total):
        pr_id = f"{SEED_ID_PREFIX}{i + 1:05d}"
        state = states[i]
        target = rng.choice([500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000])
        created_at = created_ats[i]
        name = _rand_name(rng)
        sale_email = rng.choice(SALE_EMAILS)

        if i in heavy_idx:
            pr_lines = _heavy_installment_lines(target, rng)
        else:
            pr_lines = _line_for_state(target, state, rng)
        received = sum(l["amount"] for l in pr_lines if l["status"] == "paid")

        prs.append({
            "id": pr_id,
            "name": name,
            "uid": f"SEEDUID{i + 1:06d}",
            "phone": _rand_phone(rng, i),
            "country": "VN",
            "target": target,
            "received": received,
            "state": state,
            "created_at": created_at.isoformat(),
            "sale_email": sale_email,
            "child_name": rng.choice(CHILD_NAMES),
            "is_test": True,
        })

        for line_idx, line in enumerate(pr_lines):
            lines.append({
                "payment_request_id": pr_id,
                "method": line["method"],
                "amount": line["amount"],
                "status": line["status"],
                "verified_received": line.get("verified_received"),
                "created_at": (created_at + timedelta(minutes=line_idx)).isoformat(),
                "is_test": True,
            })

        if i in ar_idx and state != "cancelled":
            ars.append({
                "id": f"AR-SEED-{i + 1:05d}",
                "pr_id": pr_id,
                "status": "pending",
                "customer_name": name,
                "uids_data": [],
                "created_at": created_at.isoformat(),
                "is_test": True,
            })

    return prs, lines, ars


def _chunked(items: list, size: int = 500):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def run(dry_run: bool, clean: bool) -> None:
    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    mode = "[DRY-RUN]" if dry_run else "[APPLY]"

    if clean:
        existing = (
            sb.table("payment_requests")
            .select("id", count="exact")
            .like("id", f"{SEED_ID_PREFIX}%")
            .execute()
        )
        n_existing = existing.count or 0
        print(f"\n{'='*55}\n  Seed PR scale — CLEAN {mode}\n{'='*55}")
        print(f"  payment_requests PR-SEED-*: {n_existing} dòng sẽ bị xoá (kèm lines/AR liên quan)")
        if n_existing == 0:
            print("  ✅ Không có gì để xoá.")
            return
        if not dry_run:
            print(f"\n  Sẽ xoá {n_existing} PR-SEED-* (+ payment_lines + active_requests liên quan). Tiếp tục? [y/N] ", end="", flush=True)
            if input().strip().lower() != "y":
                print("  Hủy.")
                return
            ids_res = sb.table("payment_requests").select("id").like("id", f"{SEED_ID_PREFIX}%").execute()
            ids = [r["id"] for r in ids_res.data or []]
            for chunk in _chunked(ids, 200):
                sb.table("payment_lines").delete().in_("payment_request_id", chunk).execute()
                sb.table("active_requests").delete().in_("pr_id", chunk).execute()
                sb.table("payment_requests").delete().in_("id", chunk).execute()
            print(f"  ✓ Đã xoá {len(ids)} PR-SEED-* + dữ liệu liên quan.")
        else:
            print(f"\n  → Chạy với --clean --apply để thực sự xoá {n_existing} dòng.")
        print(f"{'='*55}\n")
        return

    prs, lines, ars = build_seed()

    dist: dict[str, int] = {}
    for pr in prs:
        dist[pr["state"]] = dist.get(pr["state"], 0) + 1
    ar_pct = round(100 * len(ars) / len(prs))
    dup_pairs = MIN_DUP_CREATED_AT_PAIRS

    print(f"\n{'='*55}\n  Seed PR scale — {mode}\n{'='*55}")
    print(f"  payment_requests : {len(prs)}")
    print(f"  Phân bố state    : {dist}")
    print(f"  payment_lines    : {len(lines)}")
    print(f"  active_requests  : {len(ars)} (~{ar_pct}%)")
    print(f"  Cặp created_at trùng (ép cứng): {dup_pairs}")

    if not dry_run:
        existing = (
            sb.table("payment_requests")
            .select("id", count="exact")
            .like("id", f"{SEED_ID_PREFIX}%")
            .execute()
        )
        if (existing.count or 0) > 0:
            print(f"\n  ⚠️  Đã có {existing.count} PR-SEED-* trên sandbox — chạy --clean --apply trước khi seed lại.")
            sys.exit(1)

        print(f"\n  Sẽ insert {len(prs)} PR + {len(lines)} lines + {len(ars)} AR vào SANDBOX. Tiếp tục? [y/N] ", end="", flush=True)
        if input().strip().lower() != "y":
            print("  Hủy.")
            return

        print()
        for chunk in _chunked(prs, 500):
            sb.table("payment_requests").insert(chunk).execute()
        print(f"  ✓ Đã insert {len(prs)} payment_requests")
        for chunk in _chunked(lines, 500):
            sb.table("payment_lines").insert(chunk).execute()
        print(f"  ✓ Đã insert {len(lines)} payment_lines")
        for chunk in _chunked(ars, 500):
            sb.table("active_requests").insert(chunk).execute()
        print(f"  ✓ Đã insert {len(ars)} active_requests")
        print(f"\n✅  Hoàn tất seed {len(prs)} PR.")
    else:
        print(f"\n  → Chạy với --apply để thực sự insert vào sandbox.")
    print(f"{'='*55}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed 2000 PR scale test data (sandbox only)")
    parser.add_argument("--apply", action="store_true", help="Thực sự insert/xoá (mặc định: dry-run)")
    parser.add_argument("--clean", action="store_true", help="Xoá toàn bộ PR-SEED-* thay vì seed mới")
    args = parser.parse_args()
    run(dry_run=not args.apply, clean=args.clean)


if __name__ == "__main__":
    main()
