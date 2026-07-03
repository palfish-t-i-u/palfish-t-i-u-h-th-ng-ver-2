"""
UAT Zalo Notifications on Sandbox (Phương án C — đổi chìa OA tạm)

Cách chạy (làm theo docs/UAT_ZALO_RUNBOOK.md trước):
    # Chạy đủ 4 case (A/B/C/D)
    python scripts/uat_staging_zalo.py --all

    # Chạy 1 case
    python scripts/uat_staging_zalo.py --case A

    # Dry-run: chỉ insert outbox row + verify format DB, KHÔNG gọi worker
    python scripts/uat_staging_zalo.py --all --dry-run

Script tự chặn nếu SUPABASE_URL trỏ vào PROD.
Script nhúng luôn worker poll để không cần terminal thứ 2.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Load sandbox creds (không đụng backend/.env prod)
load_dotenv(BACKEND / ".env.sandbox", override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

GROUP_ID = "df7d5a31765c9f02c64d"  # IH2 & OFF - Báo tiền (production group — cần prefix [TEST])
TEST_PREFIX = "🧪 [TEST UAT]\n"

VALID_BILL = (
    "https://pxgybyfiwywksesyogti.supabase.co/storage/v1/object/public/bills/"
    "z7850454066801_50fc827bca03debb656bad6bd617d0a5.jpg"
)
INVALID_BILL = (
    "https://pxgybyfiwywksesyogti.supabase.co/storage/v1/object/public/bills/"
    "does-not-exist-uat-bill.jpg"
)

CASES: dict[str, dict] = {
    "A": {
        "label": "AR created + ảnh hợp lệ → text 🆕 + ảnh bill BIDV lên nhóm",
        "event_type": "activation_request_created",
        "message": (
            "🆕 Yêu cầu kích hoạt khoá học\n"
            "KH: Nguyễn Văn UAT · Sale UAT · Team Inhouse 2\n"
            "SĐT: 0999000111 · UID: UID-UAT-A\n"
            "Gói: 2/W- UAT KIT\n"
            "Nguồn: gioi_thieu\n"
            "Tổng: 4,999,000đ"
        ),
        "image_url": VALID_BILL,
        "expect_image_sent": True,
        "expect_image_error": False,
    },
    "B": {
        "label": "AR created + ảnh URL hỏng → text 🆕 + fallback `📎 Bill: {url}`",
        "event_type": "activation_request_created",
        "message": (
            "🆕 Yêu cầu kích hoạt khoá học\n"
            "KH: Trần Thị UAT B · Sale UAT · Team Inhouse 2\n"
            "SĐT: 0999000222 · UID: UID-UAT-B\n"
            "Gói: 2/W- UAT KIT\n"
            "Nguồn: gioi_thieu\n"
            "Tổng: 4,999,000đ"
        ),
        "image_url": INVALID_BILL,
        "expect_image_sent": False,
        "expect_image_error": True,
    },
    "C": {
        "label": "course_activated multi-line (SĐT/UID/gói)",
        "event_type": "course_activated",
        "message": (
            "✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC — KH của Lê Văn UAT C · "
            "Team Inhouse 2 với gói 2/W- UAT ACTIVATE 24 PHI+2 HN\n"
            "SĐT: 0999000333 · UID: UID-UAT-C"
        ),
        "image_url": None,
        "expect_image_sent": False,
        "expect_image_error": False,
    },
    "D": {
        "label": "payment_paid REGRESSION GATE (giữ nguyên format 💰 cũ)",
        "event_type": "payment_paid",
        "message": (
            "💰 Đã vào - KH UAT DVN | Sale Test UAT · Team Inhouse 2 | "
            "2,000đ | 18:00 03/07/2026"
        ),
        "image_url": None,
        "expect_image_sent": False,
        "expect_image_error": False,
    },
}


def guard() -> None:
    if "jozcvbbypwvzaefteoxn" in SUPABASE_URL:
        print("❌ SUPABASE_URL trỏ PROD (jozcvbbypwvzaefteoxn). Dừng.")
        sys.exit(1)
    if "pxgybyfiwywksesyogti" not in SUPABASE_URL:
        print(f"❌ SUPABASE_URL không phải sandbox: {SUPABASE_URL!r}")
        sys.exit(1)
    if not SUPABASE_KEY:
        print("❌ SUPABASE_SERVICE_ROLE_KEY trống.")
        sys.exit(1)


def make_sb():
    try:
        from supabase import create_client  # type: ignore
    except ImportError:
        print("❌ Cần cài supabase-py: pip install supabase python-dotenv httpx")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def insert_case(sb, case_key: str) -> int:
    c = CASES[case_key]
    src_id = str(uuid.uuid4())
    payload = {
        "event_type": c["event_type"],
        "source_table": "uat_synthetic",
        "source_id": src_id,
        "group_id": GROUP_ID,
        "message": TEST_PREFIX + c["message"],
        "image_url": c["image_url"],
    }
    resp = sb.table("zalo_outbox").insert(payload).execute()
    row_id = resp.data[0]["id"]
    print(f"  [+] outbox row inserted: id={row_id} event={c['event_type']}")
    return row_id


def fetch_row(sb, outbox_id: int) -> dict:
    return (
        sb.table("zalo_outbox")
        .select("*")
        .eq("id", outbox_id)
        .single()
        .execute()
        .data
    )


async def run_worker_ticks(iterations: int = 8, interval: float = 10.0) -> None:
    """Nhúng worker vào script — chạy poll_and_send N lần, không cần terminal 2."""
    from zalo_outbox_worker import poll_and_send  # type: ignore

    def sb_factory():
        return make_sb()

    for i in range(iterations):
        print(f"  [worker tick {i+1}/{iterations}] poll…")
        try:
            await poll_and_send(sb_factory)
        except Exception as exc:  # pragma: no cover
            print(f"  [worker tick {i+1}] error: {exc}")
        await asyncio.sleep(interval)


def verify_case(sb, outbox_id: int, case_key: str) -> tuple[bool, list[str]]:
    row = fetch_row(sb, outbox_id)
    problems: list[str] = []
    c = CASES[case_key]

    if not row.get("sent_at"):
        problems.append(
            f"KHÔNG có sent_at (retries={row.get('retries')}, last_error={row.get('last_error')})"
        )
    if not row.get("zalo_message_id"):
        problems.append("KHÔNG có zalo_message_id")

    if c["expect_image_sent"]:
        if not row.get("image_sent_at"):
            problems.append(
                f"expect image_sent_at nhưng KHÔNG có (image_error={row.get('image_error')})"
            )
    if c["expect_image_error"]:
        if not (row.get("image_error") or "").strip():
            problems.append("expect image_error nhưng cột trống")

    return (len(problems) == 0), problems


def run_case_insert(sb, case_key: str, dry_run: bool) -> tuple[str, int]:
    c = CASES[case_key]
    print(f"\n=== CASE {case_key}: {c['label']} ===")
    oid = insert_case(sb, case_key)

    if dry_run:
        row = fetch_row(sb, oid)
        print("  [DRY-RUN] insert xong, KHÔNG gọi worker. Row:")
        print(f"    message: {row['message']!r}")
        print(f"    image_url: {row['image_url']!r}")
        print(f"    event_type: {row['event_type']}")
        return "DRY_RUN", oid

    return "PENDING", oid


async def main_async() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", choices=list(CASES.keys()), help="Chạy 1 case")
    ap.add_argument("--all", action="store_true", help="Chạy 4 case A/B/C/D")
    ap.add_argument("--dry-run", action="store_true", help="Chỉ insert row + verify DB")
    args = ap.parse_args()

    guard()
    sb = make_sb()

    if args.all:
        cases = list(CASES.keys())
    elif args.case:
        cases = [args.case]
    else:
        print("Chọn --all hoặc --case A|B|C|D")
        sys.exit(2)

    print(f"\n=== UAT ZALO SANDBOX — {len(cases)} case ===")
    print(f"    Group ID: {GROUP_ID}")
    print(f"    Prefix:   {TEST_PREFIX.strip()!r}")

    ids: dict[str, int] = {}
    for k in cases:
        _, oid = run_case_insert(sb, k, args.dry_run)
        ids[k] = oid
        time.sleep(1)

    if args.dry_run:
        print("\n=== DRY-RUN xong. Xem message + image_url trên rồi decide. ===")
        return

    # Chạy worker embedded ~80s (8 ticks × 10s) — đủ cho 4 case gửi
    print("\n=== Bắt đầu WORKER embedded (~80 giây) ===")
    await run_worker_ticks(iterations=8, interval=10.0)

    # Verify final
    print("\n=== VERIFY DB (sau khi worker chạy xong) ===")
    results: dict[str, tuple[bool, list[str]]] = {}
    for k, oid in ids.items():
        ok, problems = verify_case(sb, oid, k)
        results[k] = (ok, problems)
        mark = "✅" if ok else "❌"
        print(f"  {mark} Case {k} (row {oid}):")
        if problems:
            for p in problems:
                print(f"     - {p}")

    print("\n=== VERIFY BẰNG MẮT — nhóm Zalo `IH2 & OFF - Báo tiền` ===")
    print("  [ ] 4 tin có prefix `🧪 [TEST UAT]`")
    print("  [ ] Case A: text 🆕 + ẢNH BIDV 2,000đ")
    print("  [ ] Case B: text 🆕 + tin `📎 Bill: {invalid-url}`")
    print("  [ ] Case C: text ✅ multi-line có SĐT/UID/gói")
    print("  [ ] Case D: text 💰 đúng format cũ")

    n_fail = sum(1 for _, (ok, _) in results.items() if not ok)
    print(f"\n=== TỔNG KẾT: {len(results) - n_fail}/{len(results)} case pass DB verify ===")
    sys.exit(0 if n_fail == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main_async())
