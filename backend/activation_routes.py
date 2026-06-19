"""B3 — Active Request / course activation & CRM order matching (Hiếu layout).

Per-course JSONB updates use Postgres jsonb_set via Supabase RPC (DB-04).
"""

from __future__ import annotations

import io
import re
import zipfile
from datetime import date, datetime, timezone
from typing import Any

from fastapi import Body, HTTPException, Query, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from invoice_routes import (
    _alloc_sequences,
    _build_excel_customers,
    _build_excel_orders,
    _build_excel_products,
)
from revenue_routes import sync_ledger_from_ar_course
from rbac import resolve_actor

# Parent PR must be fully paid (100% or overpaid) before course activation.
ALLOWED_PR_STATES = frozenset({"done", "over"})
ALLOWED_AR_STATUSES = frozenset({"pending_order", "partial_order", "ready_invoice", "invoiced", "activated"})

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
    order_id: str | None = ""


class ActiveRequestPatchCoursePayload(BaseModel):
    code: str = Field(..., min_length=1)
    name: str = ""
    amount: float | int = 0
    order_id: str | None = ""
    invoice_requested_at: str | None = ""
    invoiced: bool | None = False
    invoice_id: str | None = ""
    invoiced_at: str | None = ""
    tax_invoice_code: str | None = ""
    tax_product_code: str | None = ""
    lead_source: str | None = None
    lead_channel: str | None = None
    # Cộng buổi referral (nguồn = gioi_thieu): persist trong uids_data JSONB
    referrer_uid: str | None = None
    bonus_sessions_referee: int | None = None
    bonus_sessions_referrer: int | None = None
    referee_credited_at: str | None = None
    referee_credited_by: str | None = None
    referrer_credited_at: str | None = None
    referrer_credited_by: str | None = None


class ActiveRequestPatchUidPayload(BaseModel):
    uid: str = Field(..., min_length=1)
    phone: str | None = ""
    country: str | None = "VN"
    courses: list[ActiveRequestPatchCoursePayload] = Field(default_factory=list)


class ActiveRequestPatchBody(BaseModel):
    customer_name: str | None = None
    info_confirmed: bool | None = None
    uids_data: list[ActiveRequestPatchUidPayload] | None = None
    expected_updated_at: str | None = None


class IssueCourseInvoiceBody(BaseModel):
    customer_type: str | None = "individual"
    name: str | None = None
    email: str | None = None
    country: str | None = None
    phone: str | None = None
    address: str | None = None
    ward: str | None = None
    province: str | None = None
    tax_code: str | None = None
    company_name: str | None = None
    note: str | None = None


class BulkIssueCourseItem(BaseModel):
    ar_id: str = Field(..., min_length=1)
    course_code: str = Field(..., min_length=1)


class BulkIssueCourseBody(BaseModel):
    items: list[BulkIssueCourseItem] = Field(..., min_length=1)


class ExportBatchItem(BaseModel):
    ar_id: str = Field(..., min_length=1)
    course_code: str = Field(..., min_length=1)


class ExportBatchBody(BaseModel):
    items: list[ExportBatchItem] | None = None


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
                    "invoiced": False,
                }
            )
        block["courses"] = norm_courses
        out.append(block)

    return out


def _derive_status(uids_data: list[dict[str, Any]]) -> str:
    """Tính AR status từ uids_data.

    Hai luồng nghiệp vụ TÁCH BIỆT:
    - Kích hoạt CRM: cần order_id trên từng course.
    - Xuất hoá đơn: CHỈ cần invoice_requested_at, KHÔNG phụ thuộc order_id.

    Status machine:
      pending_order  → chưa course nào có order_id VÀ chưa ai yêu cầu xuất HĐ
      partial_order  → một số course có order_id, chưa yêu cầu xuất HĐ
      ready_invoice  → ít nhất 1 course đã yêu cầu xuất HĐ (có invoice_requested_at)
      activated      → tất cả course có order_id, chưa ai yêu cầu xuất HĐ
      invoiced       → tất cả course đã xuất HĐ (invoiced=True)
    """
    courses = [c for u in uids_data for c in (u.get("courses") or [])]
    if not courses:
        return "pending_order"
    if all(_course_is_invoiced(c) for c in courses):
        return "invoiced"
    # Luồng xuất hoá đơn: ưu tiên kiểm tra trước order_id
    if any(_course_invoice_requested_at(c) for c in courses):
        return "ready_invoice"
    # Luồng kích hoạt CRM
    all_have_order = all(_course_order_id(c) for c in courses)
    some_have_order = any(_course_order_id(c) for c in courses)
    if all_have_order:
        return "activated"
    if some_have_order:
        return "partial_order"
    return "pending_order"


def _compute_referral_status(courses: list[dict[str, Any]]) -> str | None:
    referral_courses = [c for c in courses if c.get("referrer_uid")]
    if not referral_courses:
        return None
    
    none_count = 0
    full_count = 0
    
    for c in referral_courses:
        r1 = bool(c.get("referee_credited_at"))
        r2 = bool(c.get("referrer_credited_at"))
        if r1 and r2:
            full_count += 1
        elif not r1 and not r2:
            none_count += 1
            
    if full_count == len(referral_courses):
        return "full"
    if none_count == len(referral_courses):
        return "none"
    return "partial"


def _serialize_ar(row: dict[str, Any], pr: dict[str, Any] | None = None) -> dict[str, Any]:
    raw_uids_data = row.get("uids_data") or []
    uids_data: list[dict[str, Any]] = []
    for uid_block in raw_uids_data:
        if not isinstance(uid_block, dict):
            continue
        next_uid = dict(uid_block)
        next_courses: list[dict[str, Any]] = []
        for course in uid_block.get("courses") or []:
            if not isinstance(course, dict):
                continue
            next_course = dict(course)
            next_course["order_id"] = _course_order_id(next_course)
            next_course.pop("orderId", None)
            next_courses.append(next_course)
        next_uid["courses"] = next_courses
        uids_data.append(next_uid)
    courses = [c for u in uids_data for c in (u.get("courses") or [])]
    total_amount = sum(float(c.get("amount") or 0) for c in courses)
    ordered_count = sum(1 for c in courses if _course_order_id(c))

    out: dict[str, Any] = {
        "id": row.get("id"),
        "pr_id": row.get("pr_id"),
        "customer_name": row.get("customer_name") or "",
        "uids_data": uids_data,
        "status": row.get("status") or "pending_order",
        "info_confirmed_at": row.get("info_confirmed_at"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
        "total_amount": total_amount,
        "course_count": len(courses),
        "ordered_count": ordered_count,
        "referral_status": _compute_referral_status(courses),
    }
    if pr is not None:
        target, received = _pr_amounts(pr)
        budget = max(target, received)
        out["payment_request"] = {
            "id": pr.get("id"),
            "name": pr.get("name") or pr.get("ten_khach") or "",
            "uid": pr.get("uid") or pr.get("uid_khach_hang") or "",
            "phone": pr.get("phone") or pr.get("sdt") or "",
            "email": pr.get("email") or "",
            "target": target,
            "received": received,
            "budget": budget,  # max(target, received) — dùng cho progress bar FE
            "state": _pr_payment_state(pr),
        }
    return out


def _course_order_id(course: dict[str, Any]) -> str:
    raw = course.get("order_id")
    if raw in (None, ""):
        raw = course.get("orderId")
    return str(raw or "").strip()


def _assert_order_id_available(sb, ar_id: str, course_code: str, order_id: str) -> None:
    normalized_order_id = _clean_text(order_id)
    if not normalized_order_id:
        return
    target_ar = _clean_text(ar_id)
    target_course = _clean_text(course_code)
    try:
        res = sb.table("active_requests").select("id,uids_data").execute()
    except Exception as exc:
        raise HTTPException(500, f"Khong quet duplicate order_id: {exc}") from exc
    for ar in res.data or []:
        existing_ar_id = _clean_text(ar.get("id"))
        for uid_block in ar.get("uids_data") or []:
            if not isinstance(uid_block, dict):
                continue
            for course in uid_block.get("courses") or []:
                if not isinstance(course, dict):
                    continue
                existing_code = _clean_text(course.get("code"))
                existing_order = _clean_text(_course_order_id(course))
                if existing_order != normalized_order_id:
                    continue
                if existing_ar_id == target_ar and existing_code == target_course:
                    continue
                raise HTTPException(
                    409,
                    f"order_id {normalized_order_id!r} da ton tai o AR/course khac",
                )


def _assert_uids_data_order_ids_unique(sb, ar_id: str | None, uids_data: list[Any]) -> None:
    """Quét order_id trong uids_data để chặn trùng — dùng khi tạo AR mới
    hoặc replace toàn bộ uids_data qua PATCH /active-requests/{ar_id}.

    Chỉ check những (course_code, order_id) MỚI so với state hiện tại của AR target.
    Cặp (code, order_id) đã tồn tại trong AR target trước khi PATCH thì giữ nguyên
    (không phải "thêm mới") — kể cả nếu chúng đã trùng với AR khác do dữ liệu legacy.
    """
    target_ar = _clean_text(ar_id) if ar_id else ""
    # Gom (course_code, order_id) trong incoming uids_data
    incoming: dict[str, str] = {}  # order_id → course_code
    for uid_block in uids_data or []:
        if not isinstance(uid_block, dict):
            continue
        for course in uid_block.get("courses") or []:
            if not isinstance(course, dict):
                continue
            code = _clean_text(course.get("code"))
            order_id = _clean_text(_course_order_id(course))
            if not order_id:
                continue
            # Trùng trong cùng batch (2 course cùng AR mà order_id trùng)
            if order_id in incoming and incoming[order_id] != code:
                raise HTTPException(
                    409,
                    f"order_id {order_id!r} bi trung giua nhieu course trong cung AR",
                )
            incoming[order_id] = code

    if not incoming:
        return

    # Fetch state hiện tại của AR target để exclude (code, order_id) đã có trước PATCH.
    existing_in_target: set[tuple[str, str]] = set()
    if target_ar:
        try:
            cur_res = (
                sb.table("active_requests")
                .select("uids_data")
                .eq("id", target_ar)
                .limit(1)
                .execute()
            )
            if cur_res.data:
                for uid_block in cur_res.data[0].get("uids_data") or []:
                    if not isinstance(uid_block, dict):
                        continue
                    for course in uid_block.get("courses") or []:
                        if not isinstance(course, dict):
                            continue
                        code = _clean_text(course.get("code"))
                        oid = _clean_text(_course_order_id(course))
                        if code and oid:
                            existing_in_target.add((code, oid))
        except Exception:
            # Best-effort — nếu fetch fail thì fallback check thường (có thể false positive)
            pass

    # Chỉ giữ cặp (order_id, code) MỚI thực sự
    truly_new = {oid: code for oid, code in incoming.items() if (code, oid) not in existing_in_target}
    if not truly_new:
        return

    try:
        res = sb.table("active_requests").select("id,uids_data").execute()
    except Exception as exc:
        raise HTTPException(500, f"Khong quet duplicate order_id: {exc}") from exc

    for ar in res.data or []:
        existing_ar_id = _clean_text(ar.get("id"))
        for uid_block in ar.get("uids_data") or []:
            if not isinstance(uid_block, dict):
                continue
            for course in uid_block.get("courses") or []:
                if not isinstance(course, dict):
                    continue
                existing_code = _clean_text(course.get("code"))
                existing_order = _clean_text(_course_order_id(course))
                if not existing_order or existing_order not in truly_new:
                    continue
                # Cùng AR + cùng course → idempotent (PATCH cùng row), skip
                if existing_ar_id == target_ar and existing_code == truly_new[existing_order]:
                    continue
                raise HTTPException(
                    409,
                    f"order_id {existing_order!r} da ton tai o AR/course khac",
                )


def _course_invoice_requested_at(course: dict[str, Any]) -> str:
    return str(course.get("invoice_requested_at") or "").strip()


def _course_is_invoiced(course: dict[str, Any]) -> bool:
    raw = course.get("invoiced")
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, (int, float)):
        return raw != 0
    if isinstance(raw, str):
        return raw.strip().lower() in {"1", "true", "yes", "y"}
    return False


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


def _validate_course_amounts(
    sb,
    pr: dict[str, Any],
    new_uids_data: list[dict[str, Any]],
    exclude_ar_id: str | None = None,
) -> None:
    """Kiểm tra tổng tiền gói học không vượt quá số tiền thực nhận của PR.

    Budget = max(target, received) — cho phép trường hợp overpay.
    Tính tổng từ TẤT CẢ AR đang gắn cùng PR (trừ AR đang update nếu có).
    Standalone AR (pr_id=None) bỏ qua validation này.
    """
    pr_id = str(pr.get("id") or "")
    if not pr_id:
        return  # standalone AR, không gắn PR → skip

    target, received = _pr_amounts(pr)
    budget = max(target, received)
    if budget <= 0:
        return  # PR target = 0 → skip (edge case)

    # Tổng tiền gói học trong request mới
    new_total = sum(
        _course_amount(c)
        for u in new_uids_data
        for c in (u.get("courses") or [])
    )

    # Tổng tiền gói học đã có trong các AR khác cùng PR
    existing_total = 0.0
    try:
        res = sb.table("active_requests").select("id,uids_data").eq("pr_id", pr_id).execute()
        for ar in (res.data or []):
            if exclude_ar_id and str(ar.get("id") or "") == exclude_ar_id:
                continue  # AR đang update → bỏ qua (sẽ dùng new_uids_data thay)
            for u in (ar.get("uids_data") or []):
                for c in (u.get("courses") or []):
                    existing_total += _course_amount(c)
    except Exception as exc:
        raise HTTPException(
            500,
            f"Khong xac dinh duoc budget cua PR (loi doc AR): {exc}",
        ) from exc

    grand_total = new_total + existing_total
    if grand_total > budget:
        remaining = max(0.0, budget - existing_total)
        raise HTTPException(
            422,
            {
                "error": "COURSE_AMOUNT_EXCEEDED",
                "message": (
                    f"Tổng tiền gói học ({int(grand_total):,} VND) vượt quá "
                    f"số tiền thực nhận ({int(budget):,} VND). "
                    f"Ngân sách còn lại: {int(remaining):,} VND."
                ),
                "budget": int(budget),
                "used": int(existing_total),
                "remaining": int(remaining),
                "requested": int(new_total),
            },
        )


def _sync_ledger_courses_from_uids(sb, ar_id: str, uids_data: list) -> None:
    for ub in uids_data or []:
        if not isinstance(ub, dict):
            continue
        for c in ub.get("courses") or []:
            if not isinstance(c, dict):
                continue
            code = str(c.get("code") or "").strip()
            if code and _course_order_id(c):
                sync_ledger_from_ar_course(sb, ar_id, code)


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _insert_ar_confirmed_notification(
    sb,
    *,
    ar_id: str,
    course_code: str,
    order_id: str,
    ar_row: dict[str, Any],
) -> None:
    pr_id = _clean_text(ar_row.get("pr_id"))
    if not pr_id:
        return
    try:
        pr_row = _fetch_payment_request(sb, pr_id)
        sale_email = _clean_text(pr_row.get("sale_email")).lower()
        if not sale_email:
            return
        sb.table("notifications").insert(
            {
                "user_email": sale_email,
                "kind": "ar_confirmed",
                "payload": {
                    "ar_id": ar_id,
                    "pr_id": pr_id,
                    "course_code": course_code,
                    "order_id": order_id,
                    "customer_name": pr_row.get("name") or ar_row.get("customer_name") or "",
                },
            }
        ).execute()
    except Exception as exc:
        print(f"[notify] insert failed (non-blocking): {exc}")


def _find_course(uids_data: list[dict[str, Any]], course_code: str) -> dict[str, Any]:
    for uid_block in uids_data:
        for course in uid_block.get("courses") or []:
            if course.get("code") == course_code:
                return course
    raise HTTPException(404, f"Không tìm thấy course code {course_code}")


def _format_invoiced_at() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")


def _allocate_invoice_id(sb, year: int | None = None) -> str:
    """INV-2026-1042 — khớp prototype invoice-page.jsx."""
    year_key = str(year or datetime.now(timezone.utc).year)
    try:
        res = (
            sb.table("invoice_sequences")
            .select("current_val")
            .eq("year_key", year_key)
            .limit(1)
            .execute()
        )
        if res.data:
            seq = int(res.data[0].get("current_val") or 0) + 1
            sb.table("invoice_sequences").update({"current_val": seq}).eq("year_key", year_key).execute()
        else:
            seq = 1
            sb.table("invoice_sequences").insert({"year_key": year_key, "current_val": seq}).execute()
    except Exception as exc:
        raise HTTPException(
            503,
            "Thiếu bảng invoice_sequences. Chạy docs/supabase_schema_patch_invoice_courses.sql",
        ) from exc
    return f"INV-{year_key}-1{seq:03d}"


def _build_invoice_course_patch(
    course: dict[str, Any],
    pr: dict[str, Any] | None,
    body: IssueCourseInvoiceBody | None,
) -> dict[str, Any]:
    patch: dict[str, Any] = {}
    if body:
        for key, val in (
            ("customer_type", body.customer_type),
            ("name", body.name),
            ("email", body.email),
            ("country", body.country),
            ("phone", body.phone),
            ("address", body.address),
            ("ward", body.ward),
            ("province", body.province),
            ("tax_code", body.tax_code),
            ("company_name", body.company_name),
            ("note", body.note),
        ):
            cleaned = _clean_text(val)
            if cleaned:
                patch[key] = cleaned

    if not patch.get("name") and pr:
        patch.setdefault("name", _clean_text(pr.get("name")))
    if not patch.get("phone") and pr:
        patch.setdefault("phone", _clean_text(pr.get("phone")))
    if not patch.get("country") and pr:
        patch.setdefault("country", _clean_text(pr.get("country")) or "VN")
    if not patch.get("address") and pr:
        patch.setdefault("address", _clean_text(pr.get("address")))
    if not patch.get("ward") and pr:
        patch.setdefault("ward", _clean_text(pr.get("ward")))
    if not patch.get("province") and pr:
        patch.setdefault("province", _clean_text(pr.get("province")))
    patch.setdefault("customer_type", _clean_text(course.get("customer_type")) or "individual")

    preview = {**course, **patch}
    name = _clean_text(preview.get("name"))
    phone = _clean_text(preview.get("phone"))
    address = _clean_text(preview.get("address"))
    ward = _clean_text(preview.get("ward"))
    province = _clean_text(preview.get("province"))
    if not name or not phone or not (address or ward or province):
        raise HTTPException(
            400,
            "Thiếu thông tin xuất hoá đơn — cần tên, SĐT và ít nhất một trường địa chỉ",
        )

    return {k: v for k, v in patch.items() if v not in (None, "")}


def _issue_course_invoice_atomic(
    sb,
    ar_id: str,
    course_code: str,
    body: IssueCourseInvoiceBody | None = None,
) -> dict[str, Any]:
    from rpc_helpers import rpc_active_request_row

    res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

    row = res.data[0]
    course = _find_course(row.get("uids_data") or [], course_code)
    if _course_is_invoiced(course):
        raise HTTPException(
            400,
            f"Course {course_code} đã xuất hoá đơn {course.get('invoice_id')}",
        )

    pr = _fetch_payment_request(sb, str(row.get("pr_id") or "")) if row.get("pr_id") else None
    course_patch = _build_invoice_course_patch(course, pr, body)
    invoice_id = _allocate_invoice_id(sb)
    invoiced_at = _format_invoiced_at()

    merged_row = rpc_active_request_row(
        sb,
        "issue_course_invoice_atomic",
        {
            "p_ar_id": ar_id,
            "p_course_code": course_code,
            "p_invoice_id": invoice_id,
            "p_invoiced_at": invoiced_at,
            "p_course_patch": course_patch,
        },
    )
    return {
        "active_request": _serialize_ar(merged_row, pr),
        "course_code": course_code,
        "invoice_id": invoice_id,
        "invoiced_at": invoiced_at,
    }


def _revoke_course_invoice_atomic(sb, ar_id: str, course_code: str) -> dict[str, Any]:
    from rpc_helpers import rpc_active_request_row

    res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

    row = res.data[0]
    course = _find_course(row.get("uids_data") or [], course_code)
    if not _course_is_invoiced(course):
        raise HTTPException(400, f"Course {course_code} chưa xuất hoá đơn")

    merged_row = rpc_active_request_row(
        sb,
        "revoke_course_invoice_atomic",
        {"p_ar_id": ar_id, "p_course_code": course_code},
    )
    pr = _fetch_payment_request(sb, str(merged_row.get("pr_id") or "")) if merged_row.get("pr_id") else None
    return {"active_request": _serialize_ar(merged_row, pr), "course_code": course_code}


def _parse_create_ar_payload(raw: Any) -> tuple[str | None, str | None, list[Any]]:
    """Return (pr_id, customer_name, uids_in) from body."""
    if isinstance(raw, dict):
        pr_id = _clean_text(raw.get("pr_id")) or None
        customer_name = _clean_text(raw.get("customer_name")) or None
        return pr_id, customer_name, _coerce_uids_payload(raw)
    return None, None, _coerce_uids_payload(raw)


def _save_active_request(
    sb,
    *,
    pr_id: str | None,
    uids_in: list[Any],
    customer_name: str | None = None,
    require_paid_pr: bool = False,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    pr: dict[str, Any] | None = None
    if pr_id:
        pr = _fetch_payment_request(sb, pr_id)
        if require_paid_pr:
            _assert_pr_paid(pr)

    ar_id = _next_ar_id(sb)
    uids_data = _assign_course_codes(uids_in, pr_id or ar_id)

    # Validate: tổng tiền gói học không được vượt số tiền thực nhận
    if pr is not None:
        _validate_course_amounts(sb, pr, uids_data)

    # Chặn duplicate order_id giữa AR/course khác — defense (Bug 2-04)
    _assert_uids_data_order_ids_unique(sb, ar_id, uids_data)

    status = _derive_status(uids_data)
    row: dict[str, Any] = {
        "id": ar_id,
        "pr_id": pr_id,
        "uids_data": uids_data,
        "status": status,
        "is_test": bool(pr.get("is_test")) if pr else False,
    }
    if customer_name:
        row["customer_name"] = customer_name

    try:
        res = sb.table("active_requests").insert(row).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "customer_name" in msg and "customer_name" in row:
            row.pop("customer_name", None)
            try:
                res = sb.table("active_requests").insert(row).execute()
            except Exception as retry_exc:
                raise HTTPException(500, f"Không lưu active_requests: {retry_exc}") from retry_exc
        elif pr_id is None and ("null value" in msg or "not-null" in msg) and "pr_id" in msg:
            raise HTTPException(
                503,
                "Chưa cho phép AR không gắn PR — chạy docs/supabase_schema_patch_active_requests_nullable_pr.sql",
            ) from exc
        else:
            raise HTTPException(500, f"Không lưu active_requests: {exc}") from exc

    saved = (res.data or [row])[0]
    if customer_name and not saved.get("customer_name"):
        saved["customer_name"] = customer_name
    return saved, pr


def _course_display_name(course: dict[str, Any], ar_row: dict[str, Any], pr: dict[str, Any] | None) -> str:
    for key in ("name", "company_name"):
        val = _clean_text(course.get(key))
        if val:
            return val
    val = _clean_text(ar_row.get("customer_name"))
    if val:
        return val
    if pr:
        val = _clean_text(pr.get("name") or pr.get("ten_khach"))
        if val:
            return val
    return _clean_text(course.get("code"))


def _course_display_phone(
    course: dict[str, Any], uid_block: dict[str, Any], pr: dict[str, Any] | None
) -> str:
    for src in (course, uid_block, pr or {}):
        val = _clean_text(src.get("phone") or src.get("sdt"))
        if val:
            return val
    return ""


def _course_to_tax_order(
    course: dict[str, Any],
    uid_block: dict[str, Any],
    ar_row: dict[str, Any],
    pr: dict[str, Any] | None,
    tax_invoice_code: str,
    tax_product_code: str,
) -> dict[str, Any]:
    product_name = _clean_text(course.get("name")) or _clean_text(course.get("code"))
    return {
        "taxInvoiceCode": tax_invoice_code,
        "taxProductCode": tax_product_code,
        "taxProductName": product_name,
        "goiHoc": product_name,
        "sdt": _course_display_phone(course, uid_block, pr),
        "tenKhach": _course_display_name(course, ar_row, pr),
        "tongTien": int(float(course.get("amount") or 0)),
        "m3ApprovedAt": course.get("invoiced_at") or ar_row.get("created_at") or "",
        "email": _clean_text(course.get("email") or (pr.get("email") if pr else "")),
    }


def _collect_b4_export_queue(
    sb, items: list[ExportBatchItem] | None
) -> list[tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any] | None]]:
    """Return [(ar_row, uid_block, course, pr), ...] ready for tax export."""
    targets: list[tuple[str, str]] = []
    if items:
        targets = [(i.ar_id.strip(), i.course_code.strip()) for i in items if i.ar_id and i.course_code]
    else:
        try:
            res = sb.table("active_requests").select("*").order("created_at", desc=False).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
        for ar_row in res.data or []:
            for uid_block in ar_row.get("uids_data") or []:
                for course in uid_block.get("courses") or []:
                    if course.get("invoiced") and not _clean_text(course.get("tax_invoice_code")):
                        code = _clean_text(course.get("code"))
                        if code:
                            targets.append((str(ar_row.get("id") or ""), code))

    if not targets:
        raise HTTPException(400, "Không có course nào đủ điều kiện xuất hóa đơn thuế")

    ar_ids = list({t[0] for t in targets})
    try:
        res = sb.table("active_requests").select("*").in_("id", ar_ids).execute()
    except Exception as exc:
        raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
    ar_map = {str(r["id"]): r for r in (res.data or []) if r.get("id")}
    pr_map = _fetch_prs_by_ids(sb, list({str(r.get("pr_id")) for r in ar_map.values() if r.get("pr_id")}))

    out: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any] | None]] = []
    for ar_id, course_code in targets:
        ar_row = ar_map.get(ar_id)
        if not ar_row:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")
        found: dict[str, Any] | None = None
        uid_block_match: dict[str, Any] | None = None
        for uid_block in ar_row.get("uids_data") or []:
            for course in uid_block.get("courses") or []:
                if course.get("code") == course_code:
                    found = course
                    uid_block_match = uid_block
                    break
            if found:
                break
        if not found or not uid_block_match:
            raise HTTPException(404, f"Không tìm thấy course code {course_code} trong {ar_id}")
        if not found.get("invoiced"):
            raise HTTPException(400, f"Course {course_code} chưa xuất hoá đơn (INV)")
        pr = pr_map.get(str(ar_row.get("pr_id") or "")) if ar_row.get("pr_id") else None
        out.append((ar_row, uid_block_match, found, pr))
    return out


def _export_b4_tax_batch(sb, items: list[ExportBatchItem] | None) -> StreamingResponse:
    queue = _collect_b4_export_queue(sb, items)
    ar_map = {str(row.get("id") or ""): row for row, _, _, _ in queue}
    n = len(queue)
    today = date.today()
    date_key = today.strftime("%d%m%y")

    try:
        inv_start, prod_start = _alloc_sequences(sb, n, date_key)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Lỗi cấp sequence hóa đơn: {exc}") from exc

    enriched: list[dict[str, Any]] = []
    mutated_ar_ids: set[str] = set()

    for i, (ar_row, uid_block, course, pr) in enumerate(queue):
        existing_inv = _clean_text(course.get("tax_invoice_code"))
        existing_prod = _clean_text(course.get("tax_product_code"))
        tax_invoice_code = existing_inv or f"M{date_key}{inv_start + i + 1:03d}"
        tax_product_code = existing_prod or f"PF{prod_start + i + 1:06d}"
        if not existing_inv:
            course["tax_invoice_code"] = tax_invoice_code
        if not existing_prod:
            course["tax_product_code"] = tax_product_code
        mutated_ar_ids.add(str(ar_row.get("id") or ""))
        enriched.append(_course_to_tax_order(course, uid_block, ar_row, pr, tax_invoice_code, tax_product_code))

    from rpc_helpers import rpc_active_request_row

    for ar_id in mutated_ar_ids:
        ar_row = ar_map.get(ar_id)
        if not ar_row:
            continue
        try:
            rpc_active_request_row(
                sb,
                "replace_active_request_uids_snapshot",
                {
                    "p_ar_id": ar_id,
                    "p_uids_data": ar_row.get("uids_data") or [],
                },
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Không lưu mã thuế cho {ar_id}: {exc}") from exc

    try:
        excel_orders = _build_excel_orders(enriched)
        excel_customers = _build_excel_customers(enriched)
        excel_products = _build_excel_products(enriched)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Lỗi tạo file Excel: {exc}") from exc

    batch_label = today.strftime("%Y%m%d")
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"01_1don_hang_{batch_label}.xlsx", excel_orders)
        zf.writestr(f"02_khach_hang1_{batch_label}.xlsx", excel_customers)
        zf.writestr(f"03_sanpham1_{batch_label}.xlsx", excel_products)
    zip_buf.seek(0)

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="b4_tax_export_{batch_label}.zip"'},
    )


def _diff_referral_courses(old_uids: list[dict[str, Any]], new_uids: list[dict[str, Any]]) -> list[dict[str, Any]]:
    old_courses = {c.get("code"): c for u in old_uids for c in (u.get("courses") or []) if isinstance(c, dict) and c.get("code")}
    new_courses = {c.get("code"): c for u in new_uids for c in (u.get("courses") or []) if isinstance(c, dict) and c.get("code")}
    changes = []
    for code, nc in new_courses.items():
        oc = old_courses.get(code) or {}
        old_ref = {
            "referrer_uid": oc.get("referrer_uid"),
            "bonus_sessions_referee": oc.get("bonus_sessions_referee"),
            "bonus_sessions_referrer": oc.get("bonus_sessions_referrer"),
        }
        new_ref = {
            "referrer_uid": nc.get("referrer_uid"),
            "bonus_sessions_referee": nc.get("bonus_sessions_referee"),
            "bonus_sessions_referrer": nc.get("bonus_sessions_referrer"),
        }
        if old_ref != new_ref:
            changes.append({"code": code, "old": old_ref, "new": new_ref})
    return changes


def register_activation_routes(app, supabase_factory):

    @app.get("/api/v1/active-requests", tags=["Activation"])
    def list_active_requests(
        status: str | None = Query(
            None,
            description="Lọc theo status: pending_order | partial_order | ready_invoice | invoiced | activated",
        ),
        authorization: str | None = Header(None),
    ):
        """Danh sách AR — snake_case, kèm payment_request snippet cho FE Activation/Invoice."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

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
    def get_active_request(ar_id: str, authorization: str | None = Header(None)):
        """Chi tiết một AR + payment_request."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

        row = res.data[0]
        pr = _fetch_payment_request(sb, str(row.get("pr_id") or "")) if row.get("pr_id") else None
        return _serialize_ar(row, pr)

    @app.get("/api/v1/payment-requests/{pr_id}/course-budget", tags=["Activation"])
    def get_pr_course_budget(pr_id: str, authorization: str | None = Header(None)):
        """Ngân sách gói học của PR — FE dùng để vẽ progress bar.

        Trả về:
        - budget: max(target, received) — tổng ngân sách khả dụng
        - used: tổng tiền đã phân bổ vào các gói học (từ tất cả AR gắn PR này)
        - remaining: budget - used
        - active_requests: list [{ar_id, amount}] breakdown theo từng AR
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        pr = _fetch_payment_request(sb, pr_id)
        target, received = _pr_amounts(pr)
        budget = max(target, received)

        used = 0.0
        ar_list: list[dict[str, Any]] = []
        try:
            res = sb.table("active_requests").select("id,uids_data").eq("pr_id", pr_id).execute()
            for ar in (res.data or []):
                ar_total = sum(
                    _course_amount(c)
                    for u in (ar.get("uids_data") or [])
                    for c in (u.get("courses") or [])
                )
                used += ar_total
                ar_list.append({"ar_id": ar.get("id"), "amount": int(ar_total)})
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc

        return {
            "pr_id": pr_id,
            "budget": int(budget),
            "target": int(target),
            "received": int(received),
            "used": int(used),
            "remaining": int(max(0.0, budget - used)),
            "active_requests": ar_list,
        }

    @app.delete("/api/v1/active-requests/{ar_id}", tags=["Activation"])
    def delete_active_request(ar_id: str, authorization: str | None = Header(None)):
        """Delete Active Request when no course has been invoiced."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chua cau hinh")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} khong ton tai")

        row = res.data[0]
        courses = [
            course
            for uid_block in (row.get("uids_data") or [])
            if isinstance(uid_block, dict)
            for course in (uid_block.get("courses") or [])
            if isinstance(course, dict)
        ]
        if any(_course_is_invoiced(course) for course in courses):
            raise HTTPException(409, "Khong the xoa Active Request da co course invoiced")

        try:
            sb.table("active_requests").delete().eq("id", ar_id).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong xoa active_requests: {exc}") from exc

        return {"ok": True, "id": ar_id}

    @app.patch("/api/v1/active-requests/{ar_id}", tags=["Activation"])
    def patch_active_request(
        ar_id: str,
        body: ActiveRequestPatchBody,
        authorization: str | None = Header(None),
    ):
        """
        Patch Active Request at AR-level.
        Supports:
        - customer_name
        - info_confirmed (writes info_confirmed_at timestamp / clear)
        - uids_data (replace full JSONB block, recompute status)
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chua cau hinh")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} khong ton tai")

        current = res.data[0]
        patch: dict[str, Any] = {}

        if body.customer_name is not None:
            customer_name = str(body.customer_name or "").strip()
            if not customer_name:
                raise HTTPException(400, "customer_name khong duoc rong")
            patch["customer_name"] = customer_name

        guarded_uids: list[dict[str, Any]] | None = None
        guarded_status: str | None = None
        if body.uids_data is not None:
            if not body.uids_data:
                raise HTTPException(400, "uids_data phai co it nhat mot uid")
            uids_data = [uid.model_dump() for uid in body.uids_data]

            changes = _diff_referral_courses(current.get("uids_data") or [], uids_data)
            if changes:
                from audit import log_audit
                log_audit(sb, actor.email, "referral.amount_changed", "active_request", ar_id, {"changes": changes})

            current_pr_id = str(current.get("pr_id") or "")
            if current_pr_id:
                patch_pr = _fetch_payment_request(sb, current_pr_id)
                _validate_course_amounts(sb, patch_pr, uids_data, exclude_ar_id=ar_id)
            # Chặn duplicate order_id (Bug 2-04)
            _assert_uids_data_order_ids_unique(sb, ar_id, uids_data)
            guarded_status = _derive_status(uids_data)
            if body.expected_updated_at:
                from rpc_helpers import MIGRATION_HINT, rpc_first_row

                expected = str(body.expected_updated_at).strip()
                if not expected:
                    raise HTTPException(400, "expected_updated_at khong hop le")
                try:
                    rpc_out = rpc_first_row(
                        sb,
                        "replace_active_request_uids_data_guarded",
                        {
                            "p_ar_id": ar_id,
                            "p_expected_updated_at": expected,
                            "p_uids_data": uids_data,
                            "p_status": guarded_status,
                        },
                    )
                except HTTPException:
                    raise
                except Exception as exc:
                    raise HTTPException(
                        500,
                        f"RPC replace_active_request_uids_data_guarded loi: {exc}. {MIGRATION_HINT}",
                    ) from exc
                if not isinstance(rpc_out, dict):
                    raise HTTPException(503, MIGRATION_HINT)
                if rpc_out.get("conflict"):
                    cur_row = rpc_out.get("row") or current
                    pr_map = _fetch_prs_by_ids(sb, [str(cur_row.get("pr_id") or "")])
                    current_ar = _serialize_ar(
                        cur_row if isinstance(cur_row, dict) else current,
                        pr_map.get(str(cur_row.get("pr_id") or "") if isinstance(cur_row, dict) else ""),
                    )
                    raise HTTPException(
                        409,
                        detail={
                            "detail": "Active Request da duoc cap nhat boi nguoi khac",
                            "current": current_ar,
                        },
                    )
                row = rpc_out.get("row") or {}
                merged = {**current, **row}
                _sync_ledger_courses_from_uids(sb, ar_id, merged.get("uids_data") or [])
                extra: dict[str, Any] = {}
                if body.customer_name is not None:
                    customer_name = str(body.customer_name or "").strip()
                    if not customer_name:
                        raise HTTPException(400, "customer_name khong duoc rong")
                    extra["customer_name"] = customer_name
                if body.info_confirmed is not None:
                    extra["info_confirmed_at"] = (
                        datetime.now(timezone.utc).isoformat()
                        if body.info_confirmed
                        else None
                    )
                if extra:
                    extra["updated_at"] = datetime.now(timezone.utc).isoformat()
                    try:
                        upd = (
                            sb.table("active_requests")
                            .update(extra)
                            .eq("id", ar_id)
                            .execute()
                        )
                        if upd.data:
                            merged = {**merged, **upd.data[0]}
                        else:
                            merged = {**merged, **extra}
                    except Exception as exc:
                        raise HTTPException(
                            500, f"Khong cap nhat active_requests: {exc}"
                        ) from exc
                pr_map = _fetch_prs_by_ids(sb, [str(merged.get("pr_id") or "")])
                return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")))
            patch["uids_data"] = uids_data
            patch["status"] = guarded_status
            guarded_uids = uids_data

        if body.info_confirmed is not None:
            patch["info_confirmed_at"] = (
                datetime.now(timezone.utc).isoformat() if body.info_confirmed else None
            )

        if not patch:
            raise HTTPException(400, "Khong co du lieu de cap nhat")

        patch["updated_at"] = datetime.now(timezone.utc).isoformat()

        try:
            upd = sb.table("active_requests").update(patch).eq("id", ar_id).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat active_requests: {exc}") from exc

        saved = (upd.data or [{**current, **patch}])[0]
        merged = {**current, **saved, **patch}
        if guarded_uids is not None:
            _sync_ledger_courses_from_uids(sb, ar_id, merged.get("uids_data") or guarded_uids)
        pr_map = _fetch_prs_by_ids(sb, [str(merged.get("pr_id") or "")])
        return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")))

    class CreditReferralBody(BaseModel):
        uid: str
        course_code: str
        side: str  # "referee" or "referrer"
        credited: bool
        reason: str | None = None

    @app.patch("/api/v1/active-requests/{ar_id}/credit-referral", tags=["Activation"])
    def credit_referral(
        ar_id: str,
        body: CreditReferralBody,
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chua cau hinh")

        from rbac import require_referral_credit
        actor = resolve_actor(sb, authorization)
        require_referral_credit(actor)

        if not body.credited and not (body.reason and body.reason.strip()):
            raise HTTPException(400, "Bỏ tick xác nhận cần kèm lý do")
        if body.side not in ("referee", "referrer"):
            raise HTTPException(400, "side must be referee or referrer")

        res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")
        
        ar = res.data[0]
        uids_data = ar.get("uids_data") or []
        
        # Locate the course
        target_course = None
        for u in uids_data:
            if u.get("uid") == body.uid:
                for c in u.get("courses") or []:
                    if c.get("code") == body.course_code:
                        target_course = c
                        break
        
        if not target_course:
            raise HTTPException(404, "Không tìm thấy course trong active request này")

        now = datetime.now(timezone.utc).isoformat()
        from audit import log_audit

        if body.credited:
            target_course[f"{body.side}_credited_at"] = now
            target_course[f"{body.side}_credited_by"] = actor.email
            log_audit(
                sb, actor.email, "referral.credit_confirmed",
                "active_request_course", f"{ar_id}_{body.course_code}",
                {"side": body.side, "credited_at": now}
            )
        else:
            previous_at = target_course.get(f"{body.side}_credited_at")
            previous_by = target_course.get(f"{body.side}_credited_by")
            target_course[f"{body.side}_credited_at"] = None
            target_course[f"{body.side}_credited_by"] = None
            log_audit(
                sb, actor.email, "referral.credit_revoked",
                "active_request_course", f"{ar_id}_{body.course_code}",
                {
                    "side": body.side,
                    "previous_credited_at": previous_at,
                    "previous_credited_by": previous_by,
                    "reason": body.reason.strip(),
                }
            )

        # Update uids_data in DB
        upd = sb.table("active_requests").update({"uids_data": uids_data}).eq("id", ar_id).execute()
        if not upd.data:
            raise HTTPException(500, "Cập nhật thất bại")

        pr_map = _fetch_prs_by_ids(sb, [str(upd.data[0].get("pr_id") or "")])
        return _serialize_ar(upd.data[0], pr_map.get(str(upd.data[0].get("pr_id") or "")))


    @app.post("/api/v1/active-requests", tags=["Activation"])
    def create_standalone_active_request(
        payload: Any = Body(...),
        authorization: str | None = Header(None),
    ):
        """
        Tạo Active Request — có thể không gắn PR (pr_id null).
        Body: `{ customer_name?, pr_id?, uids: [...] }` hoặc mảng uids.
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        pr_id, customer_name, uids_in = _parse_create_ar_payload(payload)
        saved, pr = _save_active_request(
            sb,
            pr_id=pr_id,
            uids_in=uids_in,
            customer_name=customer_name,
            require_paid_pr=bool(pr_id),
        )
        return _serialize_ar(saved, pr)

    @app.post(
        "/api/v1/payment-requests/{pr_id}/active-requests",
        tags=["Activation"],
    )
    def create_active_request(
        pr_id: str,
        payload: Any = Body(...),
        authorization: str | None = Header(None),
    ):
        """
        Tạo Active Request gắn PR đã thanh toán đủ.
        Body: mảng uids hoặc `{ "uids": [ { uid, courses: [{ name, amount }] } ] }`.
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        _, customer_name, uids_in = _parse_create_ar_payload(payload)
        saved, pr = _save_active_request(
            sb,
            pr_id=pr_id,
            uids_in=uids_in,
            customer_name=customer_name,
            require_paid_pr=True,
        )
        return _serialize_ar(saved, pr)

    @app.patch(
        "/api/v1/active-requests/{ar_id}/courses/{course_code}",
        tags=["Activation"],
    )
    def patch_active_request_course(
        ar_id: str,
        course_code: str,
        body: PatchCourseOrderBody,
        authorization: str | None = Header(None),
    ):
        """Thu Hiền — gắn CRM order_id lên course có code khớp (JSONB atomic via RPC)."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        order_id = str(body.order_id or "").strip()

        # RPC path for non-empty Order ID (atomic JSONB patch)
        from rpc_helpers import rpc_active_request_row

        if order_id:
            _assert_order_id_available(sb, ar_id, course_code, order_id)
            row = rpc_active_request_row(
                sb,
                "patch_active_request_course_order",
                {
                    "p_ar_id": ar_id,
                    "p_course_code": course_code,
                    "p_order_id": order_id,
                },
            )
            ledger_id = sync_ledger_from_ar_course(sb, ar_id, course_code)
            if ledger_id:
                _insert_ar_confirmed_notification(
                    sb,
                    ar_id=ar_id,
                    course_code=course_code,
                    order_id=order_id,
                    ar_row=row,
                )
                print(f"[activation] B3 → Sổ: AR {ar_id} course {course_code} → {ledger_id}")
            else:
                print(f"[activation] B3 → Sổ: skip/fail AR {ar_id} course {course_code}")
            pr_map = _fetch_prs_by_ids(sb, [str(row.get("pr_id") or "")])
            return _serialize_ar(row, pr_map.get(str(row.get("pr_id") or "")))

        row = rpc_active_request_row(
            sb,
            "clear_course_order_id_atomic",
            {"p_ar_id": ar_id, "p_course_code": course_code},
        )
        pr_map = _fetch_prs_by_ids(sb, [str(row.get("pr_id") or "")])
        return _serialize_ar(row, pr_map.get(str(row.get("pr_id") or "")))

    @app.post(
        "/api/v1/active-requests/{ar_id}/request-invoice",
        tags=["Activation"],
    )
    def request_active_request_invoice(ar_id: str, authorization: str | None = Header(None)):
        """Bấm nút Xuất HĐ màu tím — yêu cầu xuất hoá đơn cho tất cả course có Order ID trong AR."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Không đọc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} không tồn tại")

        from rpc_helpers import rpc_active_request_row

        row = res.data[0]
        current_time = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
        merged_row = rpc_active_request_row(
            sb,
            "request_ar_invoice_atomic",
            {"p_ar_id": ar_id, "p_requested_at": current_time},
        )
        pr = (
            _fetch_payment_request(sb, str(merged_row.get("pr_id") or ""))
            if merged_row.get("pr_id")
            else None
        )
        return _serialize_ar(merged_row, pr)

    @app.post(
        "/api/v1/active-requests/{ar_id}/courses/{course_code}/issue-invoice",
        tags=["Activation"],
    )
    def issue_active_request_course_invoice(
        ar_id: str,
        course_code: str,
        body: IssueCourseInvoiceBody | None = None,
        authorization: str | None = Header(None),
    ):
        """B4 — phát hành INV cho một Course Code đã có Order ID."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)
        return _issue_course_invoice_atomic(sb, ar_id, course_code, body)

    @app.post(
        "/api/v1/active-requests/{ar_id}/courses/{course_code}/revoke-invoice",
        tags=["Activation"],
    )
    def revoke_active_request_course_invoice(
        ar_id: str,
        course_code: str,
        authorization: str | None = Header(None),
    ):
        """B4 — thu hồi INV (demo / sửa sai)."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)
        return _revoke_course_invoice_atomic(sb, ar_id, course_code)

    @app.post("/api/v1/invoice-courses/bulk-issue", tags=["Activation"])
    def bulk_issue_course_invoices(
        body: BulkIssueCourseBody,
        authorization: str | None = Header(None),
    ):
        """B4 — xuất nhiều INV trong một request."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        issued: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        for item in body.items:
            try:
                result = _issue_course_invoice_atomic(sb, item.ar_id, item.course_code)
                issued.append(
                    {
                        "ar_id": item.ar_id,
                        "course_code": item.course_code,
                        "invoice_id": result["invoice_id"],
                        "invoiced_at": result["invoiced_at"],
                    }
                )
            except HTTPException as exc:
                errors.append(
                    {
                        "ar_id": item.ar_id,
                        "course_code": item.course_code,
                        "status_code": exc.status_code,
                        "detail": exc.detail,
                    }
                )

        return {
            "issued": issued,
            "issued_count": len(issued),
            "error_count": len(errors),
            "errors": errors,
        }

    @app.post("/api/v1/invoice-courses/export-batch", tags=["Activation"])
    def export_invoice_courses_batch(
        body: ExportBatchBody | None = None,
        authorization: str | None = Header(None),
    ):
        """B4 — xuất ZIP 3 file Excel kê khai thuế; cấp + lưu mã M.../PF... vào course JSONB."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)
        items = body.items if body else None
        return _export_b4_tax_batch(sb, items)
