"""B3 — Active Request / course activation & CRM order matching (Hiếu layout)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fastapi import Body, HTTPException, Query
from pydantic import BaseModel, Field

# Parent PR must be fully paid (100% or overpaid) before course activation.
ALLOWED_PR_STATES = frozenset({"done", "over"})
ALLOWED_AR_STATUSES = frozenset({"pending_order", "partial_order", "ready_invoice", "invoiced"})

_TRANG_THAI_ALIASES: dict[str, str] = {
    "done": "done",
    "over": "over",
    "da_du": "done",
    "da_du_tien": "done",
    "du_tien": "done",
    "du": "done",
    "thua": "over",
    "thua_tien": "over",
    "pending": "pending",
    "cho_thanh_toan": "pending",
    "short": "short",
    "con_thieu": "short",
    "thieu": "short",
    "thieu_tien": "short",
    "cancelled": "cancelled",
    "da_huy": "cancelled",
    "huy": "cancelled",
}


class PatchCourseOrderBody(BaseModel):
    order_id: str = Field(..., min_length=1)


def _pr_digits(pr_id: str) -> str:
    """Token segment for CC codes — PR-2026-0042 → 0042; UUID → 4 ký tự từ segment cuối."""
    raw = str(pr_id or "").strip()
    if re.match(r"^PR-\d{4}-\d+$", raw, re.I):
        return raw.rsplit("-", 1)[-1].zfill(4)
    parts = raw.split("-")
    if len(parts) == 5 and all(parts):
        return parts[-1][:4].upper().ljust(4, "0")
    compact = re.sub(r"[^a-zA-Z0-9]", "", raw).upper()
    if compact:
        return compact[-4:].rjust(4, "0")
    return "0000"


def _coerce_uids_payload(raw: Any) -> list[Any]:
    """Accept raw JSON array or `{ "uids": [...] }`."""
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("uids"), list):
        return raw["uids"]
    raise HTTPException(400, "Body phải là mảng uids hoặc object { uids: [...] }")


def _course_name(raw: dict[str, Any]) -> str:
    for key in ("name", "package_name", "packageName", "goi_hoc"):
        val = raw.get(key)
        if val not in (None, ""):
            return str(val).strip()
    return ""


def _course_amount(raw: dict[str, Any]) -> float:
    for key in ("amount", "so_tien"):
        if raw.get(key) not in (None, ""):
            try:
                return float(raw[key])
            except (TypeError, ValueError):
                return 0.0
    return 0.0


def _normalize_uid_block(raw: dict[str, Any]) -> dict[str, Any]:
    block: dict[str, Any] = {
        "uid": str(raw.get("uid") or "").strip(),
        "courses": [],
    }
    if raw.get("phone") not in (None, ""):
        block["phone"] = str(raw.get("phone")).strip()
    if raw.get("country") not in (None, ""):
        block["country"] = str(raw.get("country")).strip()
    return block


def _assign_course_codes(uids_in: list[Any], pr_id: str) -> list[dict[str, Any]]:
    """Inject sequential CC-[PR_DIGITS]-[SEQ] codes; output snake_case only."""
    pr_part = _pr_digits(pr_id)
    seq = 1
    out: list[dict[str, Any]] = []

    for item in uids_in:
        if not isinstance(item, dict):
            raise HTTPException(400, "Mỗi phần tử uids phải là object")
        block = _normalize_uid_block(item)
        courses_in = item.get("courses")
        if courses_in is None:
            # Single-course shorthand from create modal
            if _course_name(item) or _course_amount(item):
                courses_in = [item]
            else:
                courses_in = []
        if not isinstance(courses_in, list) or not courses_in:
            raise HTTPException(400, "Mỗi uid cần ít nhất một course")

        norm_courses: list[dict[str, Any]] = []
        for c in courses_in:
            if not isinstance(c, dict):
                raise HTTPException(400, "course phải là object")
            code = f"CC-{pr_part}-{seq:03d}"
            seq += 1
            order_raw = c.get("order_id") if c.get("order_id") is not None else c.get("orderId")
            norm_courses.append(
                {
                    "code": code,
                    "name": _course_name(c),
                    "amount": _course_amount(c),
                    "order_id": str(order_raw or "").strip(),
                }
            )
        block["courses"] = norm_courses
        out.append(block)

    return out


def _derive_status(uids_data: list[dict[str, Any]]) -> str:
    courses = [c for u in uids_data for c in (u.get("courses") or [])]
    if not courses:
        return "pending_order"
    ordered = sum(1 for c in courses if str(c.get("order_id") or "").strip())
    if ordered == 0:
        return "pending_order"
    if ordered == len(courses):
        return "ready_invoice"
    return "partial_order"


def _serialize_ar(row: dict[str, Any], pr: dict[str, Any] | None = None) -> dict[str, Any]:
    uids_data = row.get("uids_data") or []
    courses = [c for u in uids_data for c in (u.get("courses") or [])]
    total_amount = sum(float(c.get("amount") or 0) for c in courses)
    ordered_count = sum(1 for c in courses if str(c.get("order_id") or "").strip())

    out: dict[str, Any] = {
        "id": row.get("id"),
        "pr_id": row.get("pr_id"),
        "uids_data": uids_data,
        "status": row.get("status") or "pending_order",
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "total_amount": total_amount,
        "course_count": len(courses),
        "ordered_count": ordered_count,
    }
    if pr is not None:
        target, received = _pr_amounts(pr)
        out["payment_request"] = {
            "id": pr.get("id"),
            "name": pr.get("name") or pr.get("ten_khach") or "",
            "uid": pr.get("uid") or pr.get("uid_khach_hang") or "",
            "phone": pr.get("phone") or pr.get("sdt") or "",
            "target": target,
            "received": received,
            "state": _pr_payment_state(pr),
        }
    return out


def _fetch_prs_by_ids(sb, pr_ids: list[str]) -> dict[str, dict[str, Any]]:
    if not pr_ids:
        return {}
    try:
        res = sb.table("payment_requests").select("*").in_("id", pr_ids).execute()
    except Exception:
        return {}
    return {str(r["id"]): r for r in (res.data or []) if r.get("id")}


def _next_ar_id(sb, year: int | None = None) -> str:
    yr = year or datetime.now(timezone.utc).year
    prefix = f"AR-{yr}-"
    try:
        res = (
            sb.table("active_requests")
            .select("id")
            .like("id", f"{prefix}%")
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            tail = str(res.data[0]["id"]).rsplit("-", 1)[-1]
            n = int(tail) + 1
        else:
            n = 1
    except Exception:
        n = 1
    return f"{prefix}{n:04d}"


def _fetch_payment_request(sb, pr_id: str) -> dict[str, Any]:
    try:
        res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
    except Exception as exc:
        raise HTTPException(503, f"Không đọc được payment_requests: {exc}") from exc
    if not res.data:
        raise HTTPException(404, f"Payment Request {pr_id} không tồn tại")
    return res.data[0]


def _pr_amounts(pr: dict[str, Any]) -> tuple[int, int]:
    """Giang schema: tong_tien_phai_thu / da_thu_luc_nay (bigint)."""
    target_raw = pr.get("tong_tien_phai_thu")
    if target_raw is None:
        target_raw = pr.get("target_amount") if pr.get("target_amount") is not None else pr.get("target")
    received_raw = pr.get("da_thu_luc_nay")
    if received_raw is None:
        received_raw = (
            pr.get("received_amount") if pr.get("received_amount") is not None else pr.get("received")
        )
    try:
        target = int(target_raw or 0)
    except (TypeError, ValueError):
        target = 0
    try:
        received = int(received_raw or 0)
    except (TypeError, ValueError):
        received = 0
    return target, received


def _normalize_pr_state(raw: Any) -> str:
    key = str(raw or "").strip().lower()
    if not key:
        return ""
    return _TRANG_THAI_ALIASES.get(key, key)


def _pr_payment_state(pr: dict[str, Any]) -> str:
    """Read state (prototype), trang_thai (Giang), else derive from target/received."""
    raw = pr.get("state")
    if raw is None:
        raw = pr.get("trang_thai") if pr.get("trang_thai") is not None else pr.get("status")
    state = _normalize_pr_state(raw)
    if state:
        return state

    if pr.get("cancelled"):
        return "cancelled"

    target, received = _pr_amounts(pr)
    if received <= 0:
        return "pending"
    if target <= 0:
        return "done"
    if received < target:
        return "short"
    if received == target:
        return "done"
    return "over"


def _assert_pr_paid(pr: dict[str, Any]) -> None:
    state = _pr_payment_state(pr)
    target, received = _pr_amounts(pr)
    paid_by_state = state in ALLOWED_PR_STATES
    paid_by_amount = target > 0 and received >= target
    if paid_by_state or paid_by_amount:
        return
    raise HTTPException(
        400,
        f"Payment Request chưa thanh toán đủ — trang_thai={pr.get('trang_thai')!r}, "
        f"da_thu={received}/{target}, cần đủ 100% tiền",
    )


def _patch_course_python(
    uids_data: list[dict[str, Any]], course_code: str, order_id: str
) -> list[dict[str, Any]]:
    found = False
    for uid_block in uids_data:
        for course in uid_block.get("courses") or []:
            if course.get("code") == course_code:
                course["order_id"] = order_id.strip()
                found = True
    if not found:
        raise HTTPException(404, f"Không tìm thấy course code {course_code}")
    return uids_data


def register_activation_routes(app, supabase_factory):

    @app.get("/api/v1/active-requests", tags=["Activation"])
    def list_active_requests(
        status: str | None = Query(
            None,
            description="Lọc theo status: pending_order | partial_order | ready_invoice | invoiced",
        ),
    ):
        """Danh sách AR — snake_case, kèm payment_request snippet cho FE Activation/Invoice."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        status_filter: str | None = None
        if status is not None and str(status).strip():
            status_filter = str(status).strip().lower()
            if status_filter not in ALLOWED_AR_STATUSES:
                raise HTTPException(
                    400,
                    f"status không hợp lệ — dùng một trong: {', '.join(sorted(ALLOWED_AR_STATUSES))}",
                )

        try:
            query = sb.table("active_requests").select("*").order("created_at", desc=True)
            if status_filter:
                query = query.eq("status", status_filter)
            res = query.execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc

        rows = res.data or []
        pr_map = _fetch_prs_by_ids(sb, list({str(r.get("pr_id")) for r in rows if r.get("pr_id")}))
        return [_serialize_ar(r, pr_map.get(str(r.get("pr_id") or ""))) for r in rows]

    @app.get("/api/v1/active-requests/{ar_id}", tags=["Activation"])
    def get_active_request(ar_id: str):
        """Chi tiết một AR + payment_request."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

        row = res.data[0]
        pr = _fetch_payment_request(sb, str(row.get("pr_id") or "")) if row.get("pr_id") else None
        return _serialize_ar(row, pr)

    @app.post(
        "/api/v1/payment-requests/{pr_id}/active-requests",
        tags=["Activation"],
    )
    def create_active_request(pr_id: str, payload: Any = Body(...)):
        """
        Tạo Active Request gắn PR đã thanh toán đủ.
        Body: mảng uids hoặc `{ "uids": [ { uid, courses: [{ name, amount }] } ] }`.
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        pr = _fetch_payment_request(sb, pr_id)
        _assert_pr_paid(pr)

        raw_uids = _coerce_uids_payload(payload)
        uids_data = _assign_course_codes(raw_uids, pr_id)
        status = _derive_status(uids_data)
        ar_id = _next_ar_id(sb)

        row = {
            "id": ar_id,
            "pr_id": pr_id,
            "uids_data": uids_data,
            "status": status,
        }

        try:
            res = sb.table("active_requests").insert(row).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không lưu active_requests: {exc}") from exc

        saved = (res.data or [row])[0]
        return _serialize_ar(saved, pr)

    @app.patch(
        "/api/v1/active-requests/{ar_id}/courses/{course_code}",
        tags=["Activation"],
    )
    def patch_active_request_course(
        ar_id: str,
        course_code: str,
        body: PatchCourseOrderBody,
    ):
        """Thu Hiền — gắn CRM order_id lên course có code khớp (JSONB atomic via RPC)."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        order_id = body.order_id.strip()
        if not order_id:
            raise HTTPException(400, "order_id không được rỗng")

        try:
            rpc = sb.rpc(
                "patch_active_request_course_order",
                {
                    "p_ar_id": ar_id,
                    "p_course_code": course_code,
                    "p_order_id": order_id,
                },
            ).execute()
            if rpc.data:
                row = rpc.data[0] if isinstance(rpc.data, list) else rpc.data
                pr_map = _fetch_prs_by_ids(sb, [str(row.get("pr_id") or "")])
                return _serialize_ar(row, pr_map.get(str(row.get("pr_id") or "")))
        except Exception as exc:
            msg = str(exc).lower()
            if "active_request_not_found" in msg or "p0002" in msg and "active" in msg:
                raise HTTPException(404, f"Active Request {ar_id} không tồn tại") from exc
            if "course_code_not_found" in msg:
                raise HTTPException(404, f"Không tìm thấy course code {course_code}") from exc
            # Fallback when RPC not deployed yet
            if "patch_active_request_course_order" not in msg:
                raise HTTPException(500, f"RPC patch_active_request_course_order lỗi: {exc}") from exc

        # Python fallback (non-atomic) if SQL function missing
        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

        row = res.data[0]
        uids_data = list(row.get("uids_data") or [])
        uids_data = _patch_course_python(uids_data, course_code, order_id)
        status = _derive_status(uids_data)

        try:
            upd = (
                sb.table("active_requests")
                .update({"uids_data": uids_data, "status": status})
                .eq("id", ar_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Không cập nhật active_requests: {exc}") from exc

        saved = (upd.data or [{"id": ar_id, "pr_id": row.get("pr_id"), "uids_data": uids_data, "status": status}])[0]
        merged = {**row, **saved, "uids_data": uids_data, "status": status}
        pr_map = _fetch_prs_by_ids(sb, [str(merged.get("pr_id") or "")])
        return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")))
