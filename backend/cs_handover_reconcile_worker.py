"""Worker dọn nền cho handover Team 2 (IH2 — match-write).

Lúc báo đơn, đơn thường CHƯA chảy sang tab bàn giao (team điền L8 sau / cơ chế copy
L8→"Dữ liệu KH tổng Team 2" chưa chạy) nên `maybe_push_cs_handover` trả 'not_found' và
KHÔNG mark pushed. Worker này định kỳ quét lại các course đã báo đơn nhưng chưa ghi được,
thử match-write lại — tới khi đơn hiện ra thì ghi Kênh liên hệ + Contact ID.

Lịch phân tầng theo giờ VN (anh Minh chốt 22/10) — CS cần data sớm trong giờ làm:
    08:30–18:00  → 5 phút/lần
    18:00–22:00  → 10 phút/lần
    22:00–24:00  → 15 phút/lần
    00:00–08:00  → 60 phút/lần
    08:00–08:30  → chờ gộp vào 08:30 (không chạy)

Cực nhẹ: steady-state (0 đơn pending) chỉ tốn 1 query Supabase, 0 đọc Google Sheet.
Gắn vào process API sẵn có (như zalo/dingtalk outbox worker) — KHÔNG thêm cron/hạ tầng.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from cs_handover_sheet import _course_order_id, maybe_push_cs_handover

VN = timezone(timedelta(hours=7))
# Chỉ quét đơn gần đây — chặn trường hợp đơn kẹt (ambiguous/không bao giờ khớp) retry mãi.
LOOKBACK_DAYS = 14


def _next_sleep_seconds(now_vn: datetime) -> int:
    """Giây tới lần chạy kế theo tầng giờ VN (gọi sau khi đã chạy xong 1 vòng)."""
    h = now_vn.hour + now_vn.minute / 60.0
    if 8.5 <= h < 18:
        return 5 * 60
    if 18 <= h < 22:
        return 10 * 60
    if 22 <= h < 24:
        return 15 * 60
    return 60 * 60  # 00:00–08:00


def _seconds_until_830(now_vn: datetime) -> int:
    """Cửa sổ 08:00–08:30: chờ tới đúng 08:30 rồi chạy 1 thể."""
    target = now_vn.replace(hour=8, minute=30, second=0, microsecond=0)
    return max(1, int((target - now_vn).total_seconds()))


def _course_has_handover(c: dict[str, Any]) -> bool:
    return bool(c.get("care_channel") or c.get("care_contact_id"))


def reconcile_pending(sb) -> int:
    """Quét ARs gần đây, thử ghi handover cho course pending (có order_id + có Kênh/Contact
    nhưng chưa pushed). maybe_push_cs_handover tự dedup + chỉ mark khi ghi thành công.
    Trả số course đã THỬ xử lý (để log)."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    try:
        res = (
            sb.table("active_requests")
            .select("id, pr_id, uids_data")
            .gte("updated_at", cutoff)
            .execute()
        )
    except Exception as exc:
        print(f"[cs_handover_worker] fetch ARs lỗi: {exc}")
        return 0
    attempted = 0
    for ar in res.data or []:
        for ub in ar.get("uids_data") or []:
            for c in ub.get("courses") or []:
                if (
                    _course_order_id(c)
                    and not c.get("handover_pushed_at")
                    and _course_has_handover(c)
                ):
                    maybe_push_cs_handover(sb, ar, str(c.get("code") or ""))
                    attempted += 1
    return attempted


async def start_reconcile_worker(sb_factory: Callable[[], Any]) -> None:
    """Vòng lặp nền: chạy reconcile rồi ngủ theo tầng giờ. Non-fatal — nuốt mọi lỗi."""
    print("[cs_handover_worker] starting...")
    while True:
        sleep_s = 15 * 60
        try:
            now_vn = datetime.now(VN)
            h = now_vn.hour + now_vn.minute / 60.0
            if 8 <= h < 8.5:
                # Cửa sổ chờ: ngủ tới 08:30, KHÔNG chạy.
                await asyncio.sleep(_seconds_until_830(now_vn))
                continue
            sb = sb_factory() if callable(sb_factory) else sb_factory
            if sb is not None:
                n = reconcile_pending(sb)
                if n:
                    print(f"[cs_handover_worker] attempted {n} pending handover(s)")
            sleep_s = _next_sleep_seconds(datetime.now(VN))
        except Exception as exc:
            print(f"[cs_handover_worker] loop error: {exc}")
        await asyncio.sleep(sleep_s)
