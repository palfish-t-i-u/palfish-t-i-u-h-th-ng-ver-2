"""Worker dọn nền cho Sale→CS handover (mọi team) — plan v2 23/10.

Mỗi tick: (1) `reconcile_pending`: course có Kênh/Contact mà cs_handover_log chưa xong /
retryable (IH2 not_found khi đơn chưa chảy sang tab bàn giao, verify_failed, failed, claim treo)
→ gọi lại `maybe_push_cs_handover`; (2) `cs_handover_dedup.reconcile_duplicates`: quét sheet
3 team append, gom dòng app (marker) + dòng team trùng → merge/dup_manual.

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

import cs_handover_store as _store
from cs_handover_sheet import maybe_push_cs_handover

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
    """Quét ARs gần đây, thử ghi handover cho course pending. v2 (G1): trạng thái lấy từ
    bảng cs_handover_log (1 query batch) — KHÔNG đọc cờ JSONB nữa; chỉ gọi push cho course
    `needs_retry` (chưa có row / retryable / claim treo). maybe_push tự claim + mark.
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
    # (ar_id, code) ứng viên: có Kênh/Contact (G2: KHÔNG cần order_id — trigger = báo đơn).
    candidates: list[tuple[str, str]] = []
    for ar in res.data or []:
        ar_id = str(ar.get("id") or "")
        for ub in ar.get("uids_data") or []:
            if not isinstance(ub, dict):
                continue
            for c in ub.get("courses") or []:
                if not isinstance(c, dict):
                    continue
                code = str(c.get("code") or "").strip()
                if code and _course_has_handover(c):
                    candidates.append((ar_id, code))
    if not candidates:
        return 0
    try:
        statuses = _store.fetch_statuses(sb, [code for _, code in candidates])
    except Exception as exc:
        print(f"[cs_handover_worker] fetch statuses lỗi: {exc}")
        return 0
    # Course ĐÃ ĐẨY mà PR bị huỷ SAU đó (sale huỷ/tạo lại đơn, PR-2590 23/10): ghi 'cancelled'
    # + cảnh báo để người xử dòng sheet (app không tự xoá). 1 query batch theo pr_id.
    try:
        pr_by_ar = {str(ar.get("id") or ""): str(ar.get("pr_id") or "") for ar in res.data or []}
        pr_ids = sorted({p for p in pr_by_ar.values() if p})
        cancelled: dict[str, Any] = {}
        for i in range(0, len(pr_ids), 200):
            q = sb.table("payment_requests").select("id, cancelled_at").in_("id", pr_ids[i:i + 200]).eq("state", "cancelled").execute()
            cancelled.update({str(r["id"]): r.get("cancelled_at") for r in (q.data or [])})
        for ar_id, code in candidates:
            pr_id = pr_by_ar.get(ar_id, "")
            st = statuses.get(code) or {}
            if pr_id in cancelled and str(st.get("status") or "") not in ("cancelled", ""):
                if _store.is_done(st):
                    print(f"[cs_handover_worker] CẢNH BÁO: {code} (AR {ar_id}) đã đẩy ({st.get('status')}, tab {st.get('tab')!r} dòng {st.get('sheet_row')}) nhưng PR {pr_id} bị huỷ lúc {cancelled[pr_id]} — xử tay dòng sheet")
                _store.record(sb, code, ar_id, "cancelled",
                              last_error=f"PR {pr_id} cancelled lúc {cancelled[pr_id]}; trước đó {st.get('status')}"
                                         + (f" dòng {st.get('sheet_row')}" if st.get("sheet_row") else ""))
                statuses[code] = {**st, "status": "cancelled"}
    except Exception as exc:
        print(f"[cs_handover_worker] kiểm PR cancelled lỗi (bỏ qua): {exc}")
    attempted = 0
    for ar_id, code in candidates:
        if not _store.needs_retry(statuses.get(code)):
            continue
        outcome = maybe_push_cs_handover(sb, ar_id, code)
        print(f"[cs_handover_worker] {code} → {outcome}")
        attempted += 1
    return attempted


def backfill_l8_payment_dates(sb, service=None) -> int:
    """Ứng viên = log IH2 đã ghi L8 (status done/not_found, l8_status appended|stamped) trong
    LOOKBACK_DAYS → cs_l8_order.backfill_payment_dates (chỉ điền ô G trống khi PR đủ tiền)."""
    import cs_l8_order as l8
    import cs_handover_dedup as dd
    cutoff = (datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)).isoformat()
    res = (sb.table(_store.TABLE).select("course_code, ar_id")
           .eq("team", "Inhouse 2").in_("status", ["done", "not_found"])
           .in_("l8_status", ["appended", "stamped"]).gte("updated_at", cutoff).execute())
    cands = [{"course_code": r["course_code"], "ar_id": r.get("ar_id")} for r in (res.data or [])]
    if not cands:
        return 0
    if service is None:
        if dd._svc is None:
            import cs_handover_sheet as hs
            dd._svc = hs._sheets_write_service()
        service = dd._svc
    return l8.backfill_payment_dates(sb, service, cands)


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
                # G4: quét sheet gom trùng app + team (merge / dup_manual). Non-fatal.
                try:
                    from cs_handover_dedup import reconcile_duplicates
                    d = reconcile_duplicates(sb)
                    if d:
                        print(f"[cs_handover_worker] dedup handled {d} pair(s)")
                except Exception as exc:
                    print(f"[cs_handover_worker] dedup error: {exc}")
                # IH2: điền bổ sung 'Ngày chuyển tiền' trên L8 khi tiền về ĐỦ sau lúc báo đơn. Non-fatal.
                try:
                    b = backfill_l8_payment_dates(sb)
                    if b:
                        print(f"[cs_handover_worker] L8 backfill ngày chuyển tiền: {b}")
                except Exception as exc:
                    print(f"[cs_handover_worker] L8 backfill error: {exc}")
            sleep_s = _next_sleep_seconds(datetime.now(VN))
        except Exception as exc:
            print(f"[cs_handover_worker] loop error: {exc}")
        await asyncio.sleep(sleep_s)
