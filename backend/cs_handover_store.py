"""Nguồn sự thật claim/dedup cho handover (bảng `cs_handover_log`) — G1-T2 plan v2.

Vì sao có bảng này: cờ `handover_pushed_at` trong JSONB `uids_data` bị nhiều endpoint ghi đè
nguyên khối (lost update) và hook dùng snapshot AR cũ → worker + hook cùng đẩy 1 course
(AR-2026-1740 23/10 → 2 dòng y hệt). Giải pháp: CLAIM atomic trước khi chạm sheet
(INSERT … ON CONFLICT DO NOTHING) — kẻ thua race thấy "đã có người giữ" và dừng
(learning dual-channel-race-match-only-pending.md).

Mọi hàm non-fatal ở tầng gọi; ở đây raise để caller quyết định. Module-level để test
monkeypatch dễ (cs_handover_sheet import module này và gọi qua `_store.<fn>`).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

TABLE = "cs_handover_log"

# Trạng thái KHÔNG cần làm lại (đã xong hoặc cố tình bỏ).
# LƯU Ý: course thiếu Kênh/Contact KHÔNG ghi row (không có 'skipped_no_handover' terminal) —
# nếu ghi, sale điền Kênh sau qua PATCH sẽ bị chặn vĩnh viễn.
TERMINAL = frozenset({"appended", "matched", "merged", "done", "dup_manual", "ambiguous", "held"})
# held = người vận hành giữ lại (vd Contact ID rác); đổi status → 'pending_retry' để đẩy.
# Trạng thái worker sẽ thử lại.
RETRYABLE = frozenset({"not_found", "verify_failed", "pending_retry", "failed"})
# Claim treo quá lâu (process chết giữa chừng) → cho claim lại.
STALE_CLAIM = timedelta(minutes=10)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_statuses(sb, course_codes: Iterable[str]) -> dict[str, dict[str, Any]]:
    """{course_code: row} cho các code có trong bảng (batch, 1 query)."""
    codes = sorted({str(c) for c in course_codes if c})
    if not codes:
        return {}
    res = sb.table(TABLE).select("*").in_("course_code", codes).execute()
    return {str(r.get("course_code")): r for r in (res.data or [])}


def is_done(row: dict[str, Any] | None) -> bool:
    return bool(row) and str(row.get("status") or "") in TERMINAL


def needs_retry(row: dict[str, Any] | None) -> bool:
    """Chưa có row → cần làm; row retryable → cần làm; claim treo quá STALE_CLAIM → cần làm."""
    if not row:
        return True
    st = str(row.get("status") or "")
    if st in RETRYABLE:
        return True
    if st == "claimed":
        try:
            ts = datetime.fromisoformat(str(row.get("claimed_at")).replace("Z", "+00:00"))
            return datetime.now(timezone.utc) - ts > STALE_CLAIM
        except Exception:
            return True
    return False


def claim(sb, course_code: str, ar_id: str, *, team: str = "", spreadsheet_id: str = "", tab: str = "") -> bool:
    """Giành quyền xử lý course. True = mình giữ; False = kênh khác đang giữ / đã xong.

    1) INSERT ignore-duplicates (PostgREST `Prefer: resolution=ignore-duplicates`): có row trả về
       = insert thật = mình giữ. Rỗng = đã tồn tại.
    2) Đã tồn tại: nếu row đang RETRYABLE hoặc claim treo (stale) → UPDATE có điều kiện để
       giành lại (chỉ 1 kênh thắng vì UPDATE … WHERE status/claimed_at cũ).
    """
    code = str(course_code or "").strip()
    if not code:
        return False
    payload = {
        "course_code": code, "ar_id": str(ar_id or ""), "team": team or None,
        "spreadsheet_id": spreadsheet_id or None, "tab": tab or None,
        "status": "claimed", "claimed_at": _now_iso(), "updated_at": _now_iso(),
    }
    try:
        res = (
            sb.table(TABLE)
            .upsert(payload, on_conflict="course_code", ignore_duplicates=True)
            .execute()
        )
        if res.data:
            return True
    except Exception as exc:
        # 23505 = PK trùng (client không hỗ trợ ignore_duplicates) → rơi xuống nhánh giành lại.
        if "23505" not in str(exc) and "duplicate" not in str(exc).lower():
            raise
    cur = fetch_statuses(sb, [code]).get(code)
    if not needs_retry(cur):
        return False
    # Giành lại có điều kiện: status cũ phải còn nguyên (tránh 2 kênh cùng reclaim).
    old_status = str((cur or {}).get("status") or "")
    q = (
        sb.table(TABLE)
        .update({"status": "claimed", "claimed_at": _now_iso(), "updated_at": _now_iso(),
                 "ar_id": str(ar_id or ""), "attempts": int((cur or {}).get("attempts") or 0) + 1})
        .eq("course_code", code)
    )
    if old_status:
        q = q.eq("status", old_status)
    if old_status == "claimed":
        cutoff = (datetime.now(timezone.utc) - STALE_CLAIM).isoformat()
        q = q.lt("claimed_at", cutoff)
    res = q.execute()
    return bool(res.data)


def mark(sb, course_code: str, status: str, **fields: Any) -> None:
    """Cập nhật trạng thái sau khi xử lý (pushed_at tự set khi status terminal-thành-công)."""
    code = str(course_code or "").strip()
    if not code:
        return
    patch: dict[str, Any] = {"status": status, "updated_at": _now_iso()}
    if status in ("appended", "matched", "merged", "done"):
        patch["pushed_at"] = _now_iso()
    for k, v in fields.items():
        if v is not None:
            patch[k] = v
    sb.table(TABLE).update(patch).eq("course_code", code).execute()
