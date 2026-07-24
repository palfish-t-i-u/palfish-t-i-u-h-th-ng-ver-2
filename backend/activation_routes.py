"""B3 — Active Request / course activation & CRM order matching (Hiếu layout).

Per-course JSONB updates use Postgres jsonb_set via Supabase RPC (DB-04).
"""

from __future__ import annotations

import hashlib
import io
import os
import re
import tempfile
import uuid
import zipfile
from datetime import date, datetime, timezone, timedelta
from typing import Any

from fastapi import Body, HTTPException, Query, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

from invoice_routes import (
    _alloc_sequences,
    _build_excel_customers,
    _build_excel_orders,
    _build_excel_products,
)
from revenue_routes import sync_ledger_from_ar_course
from env_utils import dingtalk_event_enabled
from rbac import resolve_actor
from utils.team_mapper import get_canonical_team
from utils.zalo_message_builder import (
    build_activation_request_created_message,
    build_activation_urgent_reminder_message,
    ZALO_ENABLED_EVENTS,
)

OPS_GROUP_TEAM_CODE = "Inhouse 2"

# Parent PR must be fully paid (100% or overpaid) before course activation.
from pr_guards import (
    ALLOWED_PR_STATES,
    _pr_payment_state,
    _pr_amounts,
    assert_pr_paid,
    assert_all_paid_lines_have_bill,
)

ALLOWED_AR_STATUSES = frozenset({"pending_order", "partial_order", "ready_invoice", "invoiced", "activated"})


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
    name: str | None = None  # multi-con: tên bé của block (None = bé 1 / fallback PR.child_name)
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


class CreditReferralBody(BaseModel):
    uid: str
    course_code: str
    side: str  # "referee" or "referrer"
    credited: bool
    reason: str | None = None


class ActivationReminderBody(BaseModel):
    note: str | None = None


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
    # Multi-con: giữ tên bé của block — Zalo builder render đúng bé (modal AR mở rộng)
    if raw.get("name") not in (None, ""):
        block["name"] = str(raw.get("name")).strip()
    if raw.get("phone") not in (None, ""):
        block["phone"] = str(raw.get("phone")).strip()
    if raw.get("country") not in (None, ""):
        block["country"] = str(raw.get("country")).strip()
    return block


def _max_course_seq(uids_data: list[Any]) -> int:
    """Seq lớn nhất trong các course code CC-xxx-NNN của AR — 0 nếu không parse được.

    Dùng để append tiếp seq (G2): code trùng là vỡ gắn Order ID / xuất HĐ.
    """
    max_seq = 0
    for block in uids_data or []:
        for c in (block or {}).get("courses") or []:
            code = str((c or {}).get("code") or "")
            tail = code.rsplit("-", 1)[-1]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return max_seq


def _merge_uid_blocks(
    existing: list[dict[str, Any]], new_blocks: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Merge bé/gói mới vào uids_data hiện có (append lần 2).

    Cùng uid → nối courses vào block cũ (giữ nguyên flags invoiced/order_id gói cũ);
    uid mới → thêm block. Deep-copy — không mutate input.
    """
    import copy

    merged = copy.deepcopy(existing or [])
    by_uid = {str(b.get("uid") or ""): b for b in merged if str(b.get("uid") or "")}
    for nb in new_blocks:
        uid = str(nb.get("uid") or "")
        target = by_uid.get(uid)
        if target is not None:
            target.setdefault("courses", []).extend(nb.get("courses") or [])
        else:
            merged.append(nb)
            if uid:
                by_uid[uid] = nb
    return merged


def _append_children_core(
    sb, ar_row: dict[str, Any], pr: dict[str, Any], uids_in: list[Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """Logic ruột báo đơn bổ sung — tách khỏi endpoint để test trực tiếp.

    Trả (new_blocks, merged, status). Raises HTTPException khi input sai/vượt tiền.
    KHÔNG side-effect ghi DB — endpoint lo phần update/enqueue/audit.
    """
    if not uids_in:
        raise HTTPException(400, "Cần ít nhất 1 bé/gói để bổ sung")
    ar_id = str(ar_row.get("id") or "")
    pr_id = str(ar_row.get("pr_id") or "")
    existing_uids = ar_row.get("uids_data") or []
    start_seq = _max_course_seq(existing_uids) + 1  # G2
    new_blocks = _assign_course_codes(uids_in, pr_id, start_seq=start_seq)
    _assert_course_names_present(new_blocks)
    _assert_uids_have_uid(new_blocks)
    merged = _merge_uid_blocks(existing_uids, new_blocks)
    _validate_course_amounts(sb, pr, merged, exclude_ar_id=ar_id)  # G4
    _assert_uids_data_order_ids_unique(sb, ar_id, merged)
    return new_blocks, merged, _derive_status(merged)


def _assign_course_codes(uids_in: list[Any], pr_id: str, start_seq: int = 1) -> list[dict[str, Any]]:
    """Inject sequential CC-[PR_DIGITS]-[SEQ] codes; output snake_case only."""
    pr_part = _pr_digits(pr_id)
    seq = start_seq
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
            norm_course = {
                "code": code,
                "name": _course_name(c),
                "amount": _course_amount(c),
                "order_id": str(order_raw or "").strip(),
                "invoiced": False,
            }
            ls = str(c.get("lead_source") or "").strip()
            if ls:
                norm_course["lead_source"] = ls
            lc = str(c.get("lead_channel") or "").strip()
            if lc:
                norm_course["lead_channel"] = lc
            ref_uid = str(c.get("referrer_uid") or c.get("referrerUid") or "").strip()
            if ref_uid:
                norm_course["referrer_uid"] = ref_uid
            for snake, camel in (
                ("bonus_sessions_referee", "bonusSessionsReferee"),
                ("bonus_sessions_referrer", "bonusSessionsReferrer"),
            ):
                val = c.get(snake)
                if val is None:
                    val = c.get(camel)
                if val not in (None, ""):
                    try:
                        norm_course[snake] = max(0, int(val))
                    except (TypeError, ValueError):
                        pass
            norm_courses.append(norm_course)
        block["courses"] = norm_courses
        out.append(block)

    return out


def _assert_course_names_present(uids_data: list[dict[str, Any]]) -> None:
    """Chặn tạo AR khi có gói chưa điền tên (feedback 7/7).

    Tin Zalo 'yêu cầu kích hoạt' bắn ngay lúc tạo AR — thiếu tên gói thì Ops
    không biết kích hoạt gói gì. Chỉ áp cho luồng TẠO; sửa AR (PATCH) không chặn
    vì flow thêm gói mới trong drawer lưu nháp với tên rỗng trước khi điền.
    """
    missing = [
        c.get("code") or "?"
        for u in uids_data
        for c in (u.get("courses") or [])
        if not str(c.get("name") or "").strip()
    ]
    if missing:
        raise HTTPException(
            400,
            "Chưa chọn tên gói học — cần điền tên gói cho từng khoá trước khi gửi yêu cầu kích hoạt",
        )


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


def _serialize_ar(row: dict[str, Any], pr: dict[str, Any] | None = None, sale_name_map: dict[str, str] | None = None) -> dict[str, Any]:
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
        "hold_activation": bool(row.get("hold_activation")),
        "hold_note": row.get("hold_note") or None,
    }
    if pr is not None:
        target, received = _pr_amounts(pr)
        budget = max(target, received)
        sale_email = _clean_text(pr.get("sale_email")).lower()
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
            "sale_email": sale_email,
            "sale_name": (sale_name_map or {}).get(sale_email) or sale_email,
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


# _pr_amounts, _normalize_pr_state, _pr_payment_state, and _assert_pr_paid moved to pr_guards.py


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


# Tên quốc gia nước ngoài (khách OV chọn lúc tạo PR → lưu vào cột `province`).
# Nguồn chuẩn: frontend/src/components/payment-request/CountryCombo.tsx (COUNTRIES, code != "VN").
# Tỉnh/TP Việt Nam không nằm trong set này nên phân biệt được khách OV vs khách trong nước.
FOREIGN_COUNTRY_NAMES: set[str] = {
    "United States", "United Kingdom", "China", "Japan", "South Korea", "Thailand",
    "Singapore", "Malaysia", "Indonesia", "Philippines", "India", "Australia",
    "New Zealand", "Canada", "Germany", "France", "Italy", "Spain", "Netherlands",
    "Switzerland", "Sweden", "Norway", "Finland", "Denmark", "Poland", "Russia",
    "Türkiye", "United Arab Emirates", "Saudi Arabia", "Israel", "Egypt",
    "South Africa", "Nigeria", "Brazil", "Argentina", "Mexico", "Chile", "Peru",
    "Colombia", "Hong Kong", "Taiwan", "Macao", "Cambodia", "Laos", "Myanmar",
    "Bangladesh", "Pakistan", "Iran",
    "Czechia", "Czech Republic", "Portugal", "Belgium", "Austria", "Ireland",
    "Greece", "Romania", "Hungary", "Croatia", "Slovakia", "Slovenia",
    "Bulgaria", "Lithuania", "Latvia", "Estonia", "Luxembourg", "Serbia",
    "Iceland", "Albania", "Montenegro", "North Macedonia", "Moldova",
    "Bosnia and Herzegovina", "Kosovo", "Cuba", "Venezuela", "Ecuador",
    "Bolivia", "Paraguay", "Uruguay", "Costa Rica", "Panama",
    "Sri Lanka", "Nepal", "Mongolia", "Kazakhstan", "Uzbekistan",
    "Qatar", "Bahrain", "Kuwait", "Oman", "Jordan", "Lebanon",
    "Kenya", "Ghana", "Tanzania", "Ethiopia", "Morocco", "Tunisia",
}


def _invoice_addr_parts(course: dict[str, Any], pr: dict[str, Any] | None) -> tuple[str, str, str, str]:
    """Địa chỉ hiệu lực cho hoá đơn: ưu tiên course, fallback PR (khớp paymentFlowUtils)."""
    province = _clean_text(course.get("province")) or (_clean_text(pr.get("province")) if pr else "")
    ward = _clean_text(course.get("ward")) or (_clean_text(pr.get("ward")) if pr else "")
    street = _clean_text(course.get("address")) or (_clean_text(pr.get("address")) if pr else "")
    country = _clean_text(course.get("country")) or (_clean_text(pr.get("country")) if pr else "")
    return province, ward, street, country


def _invoice_address_complete(province: str, ward: str, street: str, country: str = "") -> bool:
    """Đủ địa chỉ để xuất HĐ: Tỉnh + Phường + Số nhà. Khách OV chỉ cần quốc gia."""
    country = (country or "").strip().upper()
    if country and country != "VN":
        return True
    province = (province or "").strip()
    if province in FOREIGN_COUNTRY_NAMES:
        return True
    return bool(province) and bool((ward or "").strip()) and bool((street or "").strip())


def _missing_address_parts(province: str, ward: str, street: str) -> list[str]:
    missing: list[str] = []
    if not (province or "").strip():
        missing.append("Tỉnh/Thành")
    if not (ward or "").strip():
        missing.append("Phường/Xã")
    if not (street or "").strip():
        missing.append("Số nhà, đường")
    return missing


def _course_invoice_blockers(course: dict[str, Any], pr: dict[str, Any] | None) -> list[str]:
    """Điều kiện còn thiếu để Yêu cầu/Xuất HĐ cho 1 course. Rỗng = đủ điều kiện.

    Khớp logic FE getInvoiceBlockers (ActivationTab.tsx): Order ID + tên gói + số tiền + địa chỉ.
    """
    blockers: list[str] = []
    order_id = _clean_text(course.get("order_id")) or _clean_text(course.get("orderId"))
    if not order_id:
        blockers.append("Order ID")
    if not _clean_text(course.get("name")):
        blockers.append("tên gói học")
    try:
        amount = float(course.get("amount") or 0)
    except (TypeError, ValueError):
        amount = 0.0
    if amount <= 0:
        blockers.append("số tiền")
    province, ward, street, country = _invoice_addr_parts(course, pr)
    if not _invoice_address_complete(province, ward, street, country):
        blockers.append("địa chỉ (" + ", ".join(_missing_address_parts(province, ward, street)) + ")")
    return blockers


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
    if not name or not phone:
        raise HTTPException(
            400,
            "Thiếu thông tin xuất hoá đơn — cần tên và SĐT khách hàng",
        )
    country = _clean_text(preview.get("country"))
    if not _invoice_address_complete(province, ward, address, country):
        missing = _missing_address_parts(province, ward, address)
        raise HTTPException(
            400,
            f"Chưa đủ địa chỉ để xuất hoá đơn — thiếu: {', '.join(missing)}. "
            "Bổ sung địa chỉ ở PR (khách nước ngoài chỉ cần chọn quốc gia).",
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


def _enqueue_activation_request_created_zalo(
    sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None
) -> None:
    """Enqueue Zalo 'activation_request_created' notification (best-effort).

    Mirrors the urgent-reminder enqueue pattern (create_activation_urgent_reminder,
    ~line 2018). Must NEVER raise — a Zalo failure must not fail AR creation.
    """
    try:
        if "activation_request_created" not in ZALO_ENABLED_EVENTS:
            print("[zalo] activation_request_created skipped (not in ZALO_ENABLED_EVENTS)")
            return
        if pr is None:
            print(f"[zalo] activation_request_created skip: no PR for AR {saved_ar.get('id')}")
            return
        if pr.get("is_test") or saved_ar.get("is_test"):
            return

        sale_email = str(pr.get("sale_email") or "").strip().lower()
        if not sale_email:
            print(f"[zalo] activation_request_created skip: no sale_email for AR {saved_ar.get('id')}")
            return

        staff_res = (
            sb.table("nhan_su_sale")
            .select("email, display_name, crm_name, team")
            .ilike("email", sale_email)
            .limit(1)
            .execute()
        )
        staff = staff_res.data[0] if staff_res.data else None
        team = (staff or {}).get("team") or ""
        if not team:
            print(f"[zalo] activation_request_created skip: sale {sale_email} has no team")
            return

        canonical_team = get_canonical_team(team)
        g = (
            sb.table("zalo_team_groups")
            .select("group_id, is_active")
            .eq("team_code", canonical_team)
            .limit(1)
            .execute()
        )
        if not g.data or not g.data[0].get("is_active"):
            print(f"[zalo] activation_request_created skip: no active group for team {canonical_team}")
            return
        group_id = g.data[0]["group_id"]

        bill_url: str | None = None
        pr_id_val = str(pr.get("id") or "")
        if pr_id_val:
            lines_res = (
                sb.table("payment_lines")
                .select("bill_image, bill_images")
                .eq("payment_request_id", pr_id_val)
                .eq("status", "paid")
                .order("paid_at", desc=True)
                .limit(1)
                .execute()
            )
            if lines_res.data:
                line = lines_res.data[0]
                bill_url = (line.get("bill_image") or "").strip() or None
                if not bill_url:
                    bills = line.get("bill_images")
                    if isinstance(bills, list) and bills:
                        bill_url = str(bills[-1]).strip() or None

        pr_target, _ = _pr_amounts(pr)
        result = build_activation_request_created_message(
            {
                "id": saved_ar.get("id"),
                "customer_name": saved_ar.get("customer_name"),
                "uids_data": saved_ar.get("uids_data"),
            },
            {
                "id": pr.get("id"),
                "name": pr.get("name"),
                "child_name": pr.get("child_name"),
                "phone": pr.get("phone"),
                "country": pr.get("country") or "VN",
                "lead_source": pr.get("lead_source"),
                "lead_channel": pr.get("lead_channel"),
                "target": pr_target,
            },
            {
                "display_name": (staff or {}).get("display_name"),
                "crm_name": (staff or {}).get("crm_name"),
                "team": team,
            },
        )

        ar_id = str(saved_ar.get("id") or "")
        source_uuid = str(uuid.UUID(hashlib.md5(ar_id.encode()).hexdigest()))

        try:
            sb.table("zalo_outbox").insert(
                {
                    "event_type": "activation_request_created",
                    "source_table": "active_requests",
                    "source_id": source_uuid,
                    "group_id": group_id,
                    "message": result["message"],
                    "image_url": bill_url,
                }
            ).execute()
        except Exception as exc:
            msg = str(exc).lower()
            if "duplicate" in msg or "unique" in msg:
                pass  # idempotent — event đã enqueue trước đó (UNIQUE source_table+source_id+event_type)
            else:
                raise
    except Exception as exc:
        print(f"[zalo] activation_request_created enqueue failed (non-fatal): {exc}")


def _enqueue_activation_request_created_dingtalk(
    sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None, source_suffix: str = "",
    hold_activation: bool = False, hold_note: str | None = None,
) -> None:
    """Enqueue DingTalk 'activation_request_created' (best-effort, NEVER raises).

    Routing = RAW sale team (khớp trigger + bảng dingtalk_team_groups), KHÔNG
    canonical hoá, KHÔNG OPS fallback — chỉ 3 team HN có group mới nhận tin;
    team khác thì skip. Kèm ảnh bill nếu có (worker gửi riêng qua sampleImageMsg).
    """
    try:
        if not dingtalk_event_enabled("activation_request_created"):
            print("[dingtalk] activation_request_created skipped (DINGTALK_DISABLED_EVENTS)")
            return
        if pr is None:
            return
        if pr.get("is_test") or saved_ar.get("is_test"):
            return

        sale_email = str(pr.get("sale_email") or "").strip().lower()
        if not sale_email:
            return

        staff_res = (
            sb.table("nhan_su_sale")
            .select("email, display_name, crm_name, team")
            .ilike("email", sale_email)
            .limit(1)
            .execute()
        )
        staff = staff_res.data[0] if staff_res.data else None
        team = (staff or {}).get("team") or ""
        if not team:
            print(f"[dingtalk] activation_request_created skip: sale {sale_email} has no team")
            return

        # RAW team — KHÔNG get_canonical_team. Skip nếu team không có group (KHÔNG fallback).
        g = (
            sb.table("dingtalk_team_groups")
            .select("team_code, is_active")
            .eq("team_code", team)
            .limit(1)
            .execute()
        )
        if not g.data or not g.data[0].get("is_active"):
            print(f"[dingtalk] activation_request_created skip: no active group for team {team!r}")
            return
        team_code = g.data[0]["team_code"]

        # 17/7 (a Hiếu chốt): gom TẤT CẢ bill của mọi lần TT đã paid — worker gửi nhiều ảnh.
        bill_urls: list[str] = []
        pr_id_val = str(pr.get("id") or "")
        if pr_id_val:
            lines_res = (
                sb.table("payment_lines")
                .select("bill_image, bill_images")
                .eq("payment_request_id", pr_id_val)
                .eq("status", "paid")
                .order("paid_at", desc=False)
                .execute()
            )
            for line in (lines_res.data or []):
                bills = line.get("bill_images")
                if isinstance(bills, list):
                    for b in bills:
                        u = str(b or "").strip()
                        if u and u not in bill_urls:
                            bill_urls.append(u)
                legacy = (line.get("bill_image") or "").strip()
                if legacy and legacy not in bill_urls:
                    bill_urls.append(legacy)
        bill_url = bill_urls[0] if bill_urls else None

        pr_target, pr_received = _pr_amounts(pr)
        result = build_activation_request_created_message(
            {
                "id": saved_ar.get("id"),
                "customer_name": saved_ar.get("customer_name"),
                "uids_data": saved_ar.get("uids_data"),
            },
            {
                "id": pr.get("id"),
                "name": pr.get("name"),
                "child_name": pr.get("child_name"),
                "phone": pr.get("phone"),
                "country": pr.get("country") or "VN",
                "lead_source": pr.get("lead_source"),
                "lead_channel": pr.get("lead_channel"),
                "target": pr_target,
                "received": pr_received,
            },
            {
                "display_name": (staff or {}).get("display_name"),
                "crm_name": (staff or {}).get("crm_name"),
                "team": team,
            },
        )

        ar_id = str(saved_ar.get("id") or "")
        # source_suffix (append lần 2): outbox UNIQUE(source_table, source_id, event_type)
        # — giữ md5(ar_id) là tin bổ sung bị drop im lặng (G3).
        source_uuid = str(uuid.UUID(hashlib.md5(f"{ar_id}{source_suffix}".encode()).hexdigest()))
        outbox_message = result["message"]
        if hold_activation:
            hold_line = "\n⏸ PH CHƯA MUỐN KÍCH HOẠT"
            if hold_note:
                hold_line += f"\nGhi chú: {hold_note}"
            outbox_message = outbox_message + hold_line
        try:
            sb.table("dingtalk_outbox").insert(
                {
                    "event_type": "activation_request_created",
                    "source_table": "active_requests",
                    "source_id": source_uuid,
                    "team_code": team_code,
                    "message": outbox_message,
                    "image_url": bill_url,
                    "image_urls": bill_urls or None,
                }
            ).execute()
        except Exception as exc:
            msg = str(exc).lower()
            if "duplicate" in msg or "unique" in msg:
                pass  # idempotent — UNIQUE(source_table, source_id, event_type)
            else:
                raise
    except Exception as exc:
        print(f"[dingtalk] activation_request_created enqueue failed (non-fatal): {exc}")


# _assert_all_paid_lines_have_bill moved to pr_guards.py


def _assert_uids_have_uid(uids_data: list[Any]) -> None:
    """Gate: bất kỳ block uid-rỗng → 422 MISSING_UID kèm tên bé thiếu.

    Mirrors _assert_all_paid_lines_have_bill / MISSING_BILLS pattern.
    Gate đặt sau _assign_course_codes để uids_data đã được normalize.
    """
    missing: list[str] = []
    for block in uids_data or []:
        if not isinstance(block, dict):
            continue
        if not str(block.get("uid") or "").strip():
            name = str(block.get("name") or "").strip() or "học viên"
            missing.append(name)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "MISSING_UID",
                "message": f"{len(missing)} học viên chưa có UID. Vui lòng bổ sung UID trước khi kích hoạt.",
                "children": missing,
            },
        )


def _writeback_pr_uid_from_ar(
    sb, saved_ar: dict[str, Any], pr: dict[str, Any] | None, uids_data: list[Any]
) -> None:
    """Best-effort: điền PR.uid từ UID kích hoạt khi PR.uid đang rỗng.

    Dùng uids_data tính toán trong _save_active_request (không đọc lại từ saved_ar
    vì DB response có thể thiếu field sau insert).

    Chỉ fill khi PR.uid rỗng VÀ tên bé khớp child_name (hoặc PR 1 bé không tên).
    Không bao giờ ghi đè uid có sẵn.
    """
    if pr is None:
        return
    try:
        current_uid = str(pr.get("uid") or "").strip()
        if current_uid:
            return  # PR đã có UID → không đụng

        pr_id = str(pr.get("id") or "")
        if not pr_id:
            return

        if len(uids_data) != 1:
            # Nhiều bé → writeback vào extra_children (không fill PR.uid chung)
            _writeback_child_uids_to_pr(sb, saved_ar)
            return

        block = uids_data[0]
        if not isinstance(block, dict):
            return

        new_uid = str(block.get("uid") or "").strip()
        if not new_uid:
            return

        block_name = str(block.get("name") or "").strip()
        pr_child_name = str(pr.get("child_name") or "").strip()

        # Điều kiện khớp: block không có name, hoặc tên bé trùng child_name PR
        if block_name and pr_child_name and block_name != pr_child_name:
            return  # tên bé khác → skip (chống điền nhầm uid bé 2 vào PR.uid)

        sb.table("payment_requests").update({"uid": new_uid}).eq("id", pr_id).execute()
    except Exception as exc:
        print(f"[uid-writeback] _writeback_pr_uid_from_ar failed: {exc}")


def _save_active_request(
    sb,
    *,
    pr_id: str | None,
    uids_in: list[Any],
    customer_name: str | None = None,
    require_paid_pr: bool = False,
    hold_activation: bool = False,
    hold_note: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    pr: dict[str, Any] | None = None
    if pr_id:
        pr = _fetch_payment_request(sb, pr_id)
        # 17/7 (a Hiếu chốt): bỏ bước "Báo đơn hoàn thành" riêng — tin báo đơn giờ bắn
        # ngay khi tạo Active Request. Không còn gate completion-report trước AR.
        if require_paid_pr:
            assert_pr_paid(pr)
        assert_all_paid_lines_have_bill(sb, pr)

    ar_id = _next_ar_id(sb)
    uids_data = _assign_course_codes(uids_in, pr_id or ar_id)
    _assert_course_names_present(uids_data)

    # Gate: chặn kích hoạt khi bất kỳ block nào thiếu UID — mirror MISSING_BILLS
    _assert_uids_have_uid(uids_data)

    # Validate: tổng tiền gói học không được vượt số tiền thực nhận
    if pr is not None:
        _validate_course_amounts(sb, pr, uids_data)

    # Chặn duplicate order_id giữa AR/course khác — defense (Bug 2-04)
    _assert_uids_data_order_ids_unique(sb, ar_id, uids_data)

    status = _derive_status(uids_data)
    _hold_note = (hold_note or "").strip()[:500] if hold_activation and hold_note else None
    row: dict[str, Any] = {
        "id": ar_id,
        "pr_id": pr_id,
        "uids_data": uids_data,
        "status": status,
        "is_test": bool(pr.get("is_test")) if pr else False,
        "hold_activation": hold_activation,
    }
    if _hold_note:
        row["hold_note"] = _hold_note
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
    _writeback_pr_uid_from_ar(sb, saved, pr, uids_data)
    _enqueue_activation_request_created_zalo(sb, saved, pr)
    _enqueue_activation_request_created_dingtalk(sb, saved, pr, hold_activation=hold_activation, hold_note=_hold_note)
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


def _export_b4_tax_batch(sb, items: list[ExportBatchItem] | None) -> FileResponse:
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
    tmp = tempfile.NamedTemporaryFile(prefix="palfish_b4_export_", suffix=".zip", delete=False)
    tmp_path = tmp.name
    tmp.close()
    try:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"01_1don_hang_{batch_label}.xlsx", excel_orders)
            zf.writestr(f"02_khach_hang1_{batch_label}.xlsx", excel_customers)
            zf.writestr(f"03_sanpham1_{batch_label}.xlsx", excel_products)
    except Exception:
        os.unlink(tmp_path)
        raise

    return FileResponse(
        tmp_path,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="b4_tax_export_{batch_label}.zip"'},
        background=BackgroundTask(os.unlink, tmp_path),
    )


def _writeback_child_uids(extra_children: list, uids_data: list) -> bool:
    """UID nhập ở B3 ghi ngược vào extra_children của PR khi bé trùng tên còn thiếu uid."""
    changed = False
    for uid_block in uids_data or []:
        if not isinstance(uid_block, dict):
            continue
        name = str(uid_block.get("name") or "").strip()
        uid = str(uid_block.get("uid") or "").strip()
        if not name or not uid:
            continue
        for child in extra_children or []:
            if isinstance(child, dict) and child.get("name") == name and not child.get("uid"):
                child["uid"] = uid
                changed = True
    return changed


def _writeback_child_uids_to_pr(sb, ar_row: dict[str, Any]) -> None:
    """Best-effort: đồng bộ UID từ uids_data về PR.extra_children. KHÔNG raise."""
    try:
        pr_id = str(ar_row.get("pr_id") or "")
        if not pr_id:
            return
        res = sb.table("payment_requests").select("extra_children").eq("id", pr_id).limit(1).execute()
        if not res.data:
            return
        extra = res.data[0].get("extra_children") or []
        if not extra:
            return
        if _writeback_child_uids(extra, ar_row.get("uids_data") or []):
            sb.table("payment_requests").update({"extra_children": extra}).eq("id", pr_id).execute()
    except Exception as exc:
        print(f"[pr-multi-con] uid write-back failed: {exc}")


def _find_course_order_id(sb, ar_id: str, course_code: str) -> str:
    """Read current order_id for a course (for audit old-value capture)."""
    try:
        res = sb.table("active_requests").select("uids_data").eq("id", ar_id).limit(1).execute()
    except Exception:
        return ""
    if not res.data:
        return ""
    for uid_block in res.data[0].get("uids_data") or []:
        if not isinstance(uid_block, dict):
            continue
        for c in uid_block.get("courses") or []:
            if isinstance(c, dict) and c.get("code") == course_code:
                return _course_order_id(c)
    return ""


def _inject_course_set_by(
    sb, ar_id: str, course_code: str,
    set_by: str | None, set_at: str | None,
    row: dict[str, Any],
) -> dict[str, Any]:
    """Write order_id_set_by/at into a course's JSONB after RPC. Returns updated row."""
    uids_data = row.get("uids_data") or []
    changed = False
    for uid_block in uids_data:
        if not isinstance(uid_block, dict):
            continue
        for c in uid_block.get("courses") or []:
            if isinstance(c, dict) and c.get("code") == course_code:
                c["order_id_set_by"] = set_by
                c["order_id_set_at"] = set_at
                changed = True
                break
        if changed:
            break
    if changed:
        try:
            upd = sb.table("active_requests").update({"uids_data": uids_data}).eq("id", ar_id).execute()
            if upd.data:
                return {**row, **upd.data[0]}
        except Exception as exc:
            print(f"[activation] inject set_by failed: {exc}")
    return row


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


def _stamp_order_id_changes(
    old_uids: list[dict[str, Any]],
    new_uids: list[dict[str, Any]],
    actor_email: str,
    now: str,
) -> list[dict[str, Any]]:
    """Diff order_ids and inject set_by/set_at on changed courses. Returns list of changes for audit."""
    old_courses = {
        c.get("code"): c
        for u in old_uids for c in (u.get("courses") or [])
        if isinstance(c, dict) and c.get("code")
    }
    audit_changes: list[dict[str, Any]] = []
    for uid_block in new_uids:
        if not isinstance(uid_block, dict):
            continue
        for c in uid_block.get("courses") or []:
            if not isinstance(c, dict) or not c.get("code"):
                continue
            code = c["code"]
            old_c = old_courses.get(code) or {}
            old_oid = _course_order_id(old_c)
            new_oid = _course_order_id(c)
            if old_oid == new_oid:
                continue
            if new_oid:
                c["order_id_set_by"] = actor_email
                c["order_id_set_at"] = now
                audit_changes.append({"code": code, "action": "set", "order_id": new_oid, "old_order_id": old_oid})
            else:
                c["order_id_set_by"] = None
                c["order_id_set_at"] = None
                audit_changes.append({"code": code, "action": "cleared", "old_order_id": old_oid})
    return audit_changes


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
        from payment_request_routes import _sale_name_map
        try:
            snm = _sale_name_map(sb)
        except Exception:
            snm = {}
        return [_serialize_ar(r, pr_map.get(str(r.get("pr_id") or "")), snm) for r in rows]

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

            oid_now = datetime.now(timezone.utc).isoformat()
            oid_changes = _stamp_order_id_changes(current.get("uids_data") or [], uids_data, actor.email, oid_now)
            if oid_changes:
                from audit import log_audit
                for oc in oid_changes:
                    action = "activation.order_id_set" if oc["action"] == "set" else "activation.order_id_cleared"
                    log_audit(sb, actor.email, action, "active_request_course", f"{ar_id}_{oc['code']}", oc)

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
                _writeback_child_uids_to_pr(sb, merged)
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
            _writeback_child_uids_to_pr(sb, merged)
        pr_map = _fetch_prs_by_ids(sb, [str(merged.get("pr_id") or "")])
        return _serialize_ar(merged, pr_map.get(str(merged.get("pr_id") or "")))

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

        # Chỉ cho cộng buổi khi course đã kích hoạt (có order_id) — bỏ tick thì
        # vẫn cho phép để sửa lỗi cộng nhầm trên course đã rollback Order ID.
        if body.credited and not str(target_course.get("order_id") or "").strip():
            raise HTTPException(400, "Khoá học chưa được kích hoạt (chưa có Order ID) — không thể cộng buổi")

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
        hold_activation = bool(payload.get("hold_activation")) if isinstance(payload, dict) else False
        hold_note_raw = str(payload.get("hold_note") or "").strip()[:500] if isinstance(payload, dict) else ""
        hold_note = hold_note_raw if hold_activation and hold_note_raw else None
        saved, pr = _save_active_request(
            sb,
            pr_id=pr_id,
            uids_in=uids_in,
            customer_name=customer_name,
            require_paid_pr=bool(pr_id),
            hold_activation=hold_activation,
            hold_note=hold_note,
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
        hold_activation = bool(payload.get("hold_activation")) if isinstance(payload, dict) else False
        hold_note_raw = str(payload.get("hold_note") or "").strip()[:500] if isinstance(payload, dict) else ""
        hold_note = hold_note_raw if hold_activation and hold_note_raw else None
        saved, pr = _save_active_request(
            sb,
            pr_id=pr_id,
            uids_in=uids_in,
            customer_name=customer_name,
            require_paid_pr=True,
            hold_activation=hold_activation,
            hold_note=hold_note,
        )
        return _serialize_ar(saved, pr)

    @app.post("/api/v1/active-requests/{ar_id}/append", tags=["Activation"])
    def append_active_request_children(
        ar_id: str,
        payload: Any = Body(...),
        authorization: str | None = Header(None),
    ):
        """Báo đơn bổ sung (lần 2+): cộng bé/gói mới vào AR có sẵn + bắn tin DingTalk.

        Body cùng shape create: {"uids": [{uid, name?, phone?, courses:[{name, amount,...}]}]}.
        KHÔNG tạo AR thứ 2 (G1) — merge vào uids_data, course code tiếp seq (G2),
        tin báo đơn source_id riêng + chỉ chứa bé mới (G3).
        """
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)

        try:
            res = sb.table("active_requests").select("*").eq("id", ar_id).limit(1).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc active_requests: {exc}") from exc
        if not res.data:
            raise HTTPException(404, f"Active Request {ar_id} khong ton tai")
        ar_row = res.data[0]

        pr_id = str(ar_row.get("pr_id") or "")
        if not pr_id:
            raise HTTPException(400, "AR không gắn PR — không hỗ trợ báo đơn bổ sung")
        pr = _fetch_payment_request(sb, pr_id)

        # G4 — server-side guards y hệt create
        assert_pr_paid(pr)
        assert_all_paid_lines_have_bill(sb, pr)

        _, _, uids_in = _parse_create_ar_payload(payload)
        new_blocks, merged, new_status = _append_children_core(sb, ar_row, pr, uids_in)

        patch = {
            "uids_data": merged,
            "status": new_status,  # G5
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        # Optional: update hold flag if caller provides it (không gửi → giữ nguyên)
        if isinstance(payload, dict) and "hold_activation" in payload:
            append_hold = bool(payload.get("hold_activation"))
            patch["hold_activation"] = append_hold
            if append_hold:
                raw_note = str(payload.get("hold_note") or "").strip()[:500]
                patch["hold_note"] = raw_note if raw_note else None
            else:
                patch["hold_note"] = None
        try:
            upd = sb.table("active_requests").update(patch).eq("id", ar_id).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat active_requests: {exc}") from exc
        updated = (upd.data or [{**ar_row, **patch}])[0]

        _writeback_pr_uid_from_ar(sb, updated, pr, merged)

        # G3: tin bổ sung — CHỈ bé mới, source_id riêng theo code gói mới đầu tiên
        first_new_code = new_blocks[0]["courses"][0]["code"]
        _enqueue_activation_request_created_dingtalk(
            sb,
            {**updated, "uids_data": new_blocks},
            pr,
            source_suffix=f":append:{first_new_code}",
        )
        # G6: Zalo không gọi

        try:
            from audit import log_audit
            log_audit(
                sb, actor.email, "activation.append_children", "active_request", ar_id,
                {"new_codes": [c["code"] for b in new_blocks for c in b["courses"]]},
            )
        except Exception as exc:
            print(f"[activation] append audit failed (non-fatal): {exc}")

        return _serialize_ar(updated, pr)

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

        old_order_id = _find_course_order_id(sb, ar_id, course_code)

        from rpc_helpers import rpc_active_request_row
        from audit import log_audit

        now = datetime.now(timezone.utc).isoformat()

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
            row = _inject_course_set_by(sb, ar_id, course_code, actor.email, now, row)
            log_audit(
                sb, actor.email, "activation.order_id_set",
                "active_request_course", f"{ar_id}_{course_code}",
                {"order_id": order_id, "old_order_id": old_order_id},
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
        row = _inject_course_set_by(sb, ar_id, course_code, None, None, row)
        log_audit(
            sb, actor.email, "activation.order_id_cleared",
            "active_request_course", f"{ar_id}_{course_code}",
            {"old_order_id": old_order_id},
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

        # Chặn yêu cầu xuất HĐ khi còn course thiếu điều kiện (Order ID / tên gói / số tiền / địa chỉ).
        # RPC chỉ flag course đã có Order ID nên chỉ kiểm các course đó (chưa invoiced/chưa requested).
        pr_for_check = (
            _fetch_payment_request(sb, str(row.get("pr_id") or "")) if row.get("pr_id") else None
        )
        blocked_lines: list[str] = []
        for _uid in (row.get("uids_data") or []):
            for _course in (_uid.get("courses") or []):
                if not isinstance(_course, dict):
                    continue
                if not (_clean_text(_course.get("order_id")) or _clean_text(_course.get("orderId"))):
                    continue
                if _course_is_invoiced(_course) or _course_invoice_requested_at(_course):
                    continue
                blk = _course_invoice_blockers(_course, pr_for_check)
                if blk:
                    label = _clean_text(_course.get("code")) or _clean_text(_course.get("name")) or "?"
                    blocked_lines.append(f"{label}: thiếu {', '.join(blk)}")
        if blocked_lines:
            raise HTTPException(
                400,
                "Chưa thể yêu cầu xuất hoá đơn — " + "; ".join(blocked_lines)
                + ". Bổ sung thông tin rồi thử lại.",
            )

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

    # ── TOP3: Activation urgent reminder ──

    @app.post("/api/v1/payment-requests/{pr_id}/activation-urgent-remind", tags=["Activation"])
    def create_activation_urgent_reminder(
        pr_id: str,
        body: ActivationReminderBody | None = None,
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        actor = resolve_actor(sb, authorization)

        pr = _fetch_payment_request(sb, pr_id)

        ar_res = sb.table("active_requests").select("id, status, pr_id, uids_data, hold_activation").eq("pr_id", pr_id).limit(1).execute()
        ar = ar_res.data[0] if ar_res.data else None
        if not ar:
            raise HTTPException(400, "PR chưa có Active Request")
        if ar.get("status") == "activated":
            raise HTTPException(400, "Khóa học đã được kích hoạt")

        # Parse pending courses từ uids_data trước khi check cooldown
        pending_courses: list[dict[str, str]] = []
        courses_total = 0
        courses_activated = 0
        if ar and ar.get("uids_data"):
            uids = ar["uids_data"] if isinstance(ar["uids_data"], list) else []
            for uid_block in uids:
                if not isinstance(uid_block, dict):
                    continue
                for c in (uid_block.get("courses") or []):
                    if not isinstance(c, dict):
                        continue
                    courses_total += 1
                    if (c.get("order_id") or "").strip():
                        courses_activated += 1
                    else:
                        pending_courses.append({
                            "code": c.get("code") or "?",
                            "name": (c.get("name") or "").strip() or "(chưa có tên gói)",
                        })

        if courses_total > 0 and not pending_courses:
            raise HTTPException(400, "Tất cả gói đã có Order ID — không cần nhắc")

        # Smart cooldown: cho nhắc lại nếu >15 phút HOẶC pending count đã giảm
        last = sb.table("activation_reminders") \
            .select("id, requested_at, pending_courses_snapshot") \
            .eq("payment_request_id", pr_id) \
            .is_("resolved_at", "null") \
            .order("requested_at", desc=True) \
            .limit(1).execute()

        if last.data:
            last_row = last.data[0]
            last_at = datetime.fromisoformat(last_row["requested_at"].replace("Z", "+00:00"))
            elapsed = datetime.now(timezone.utc) - last_at
            last_pending_count = len(last_row.get("pending_courses_snapshot") or [])
            progress_made = len(pending_courses) < last_pending_count
            cooldown_elapsed = elapsed >= timedelta(minutes=15)
            if not progress_made and not cooldown_elapsed:
                wait_min = int((timedelta(minutes=15) - elapsed).total_seconds() / 60) + 1
                raise HTTPException(429, f"Đã nhắc gần đây. Đợi ~{wait_min} phút hoặc đợi Ops kích hoạt thêm gói rồi nhắc lại")

        sale_name = (actor.staff or {}).get("display_name") or (actor.staff or {}).get("crm_name") or actor.email
        note_text = (body.note or "").strip() if body else None

        reminder = sb.table("activation_reminders").insert({
            "payment_request_id": pr_id,
            "requested_by": actor.user_id,
            "requested_by_name": sale_name,
            "note": note_text or None,
            "pending_courses_snapshot": pending_courses,
        }).execute()

        # PH đã sẵn sàng → gỡ hold (tránh 2 tín hiệu mâu thuẫn: vàng + cam cùng lúc)
        if ar.get("hold_activation"):
            try:
                sb.table("active_requests").update(
                    {"hold_activation": False, "hold_note": None}
                ).eq("id", ar["id"]).execute()
            except Exception as hold_exc:
                print(f"[activation] urgent remind: gỡ hold failed (non-fatal): {hold_exc}")

        # Route theo team của sale (giống tin AR-created) — feedback 7/7: sale IH1
        # nhắc GẤP nhưng tin bắn sang nhóm IH2 & OFF. Fallback nhóm Ops khi team
        # chưa có nhóm Zalo riêng (Offline/HCM hiện dùng chung nhóm Inhouse 2).
        sale_canonical_team = get_canonical_team((actor.staff or {}).get("team"))
        g = sb.table("zalo_team_groups") \
            .select("group_id, is_active") \
            .eq("team_code", sale_canonical_team) \
            .limit(1).execute()
        if not g.data or not g.data[0].get("is_active"):
            g = sb.table("zalo_team_groups") \
                .select("group_id, is_active") \
                .eq("team_code", OPS_GROUP_TEAM_CODE) \
                .limit(1).execute()
        if not g.data or not g.data[0].get("is_active"):
            return {"ok": True, "zalo": "skipped_no_group", "reminder": reminder.data[0] if reminder.data else None}

        result = build_activation_urgent_reminder_message(
            {
                "pr_code": pr_id,
                "customer_name": pr.get("name") or pr.get("child_name") or "?",
                "courses_total": courses_total,
                "courses_activated": courses_activated,
                "pending_courses": pending_courses,
                "note": note_text,
            },
            {
                "display_name": sale_name,
                "crm_name": (actor.staff or {}).get("crm_name", ""),
                "team": (actor.staff or {}).get("team", ""),
            },
        )
        if "activation_urgent_reminder" in ZALO_ENABLED_EVENTS:
            sb.table("zalo_outbox").insert({
                "event_type": "activation_urgent_reminder",
                "source_table": "activation_reminders",
                "source_id": reminder.data[0]["id"] if reminder.data else "00000000-0000-0000-0000-000000000000",
                "group_id": g.data[0]["group_id"],
                "message": result["message"],
            }).execute()

        # DingTalk parallel notification — best-effort, independent of Zalo
        try:
            if not dingtalk_event_enabled("activation_urgent_reminder"):
                print("[dingtalk] activation_urgent_reminder skipped (DINGTALK_DISABLED_EVENTS)")
            else:
                dt_team_code = sale_canonical_team
                dt_group = (
                    sb.table("dingtalk_team_groups")
                    .select("team_code, is_active")
                    .eq("team_code", dt_team_code)
                    .limit(1)
                    .execute()
                )
                if not dt_group.data or not dt_group.data[0].get("is_active"):
                    dt_team_code = OPS_GROUP_TEAM_CODE
                    dt_group = (
                        sb.table("dingtalk_team_groups")
                        .select("team_code, is_active")
                        .eq("team_code", dt_team_code)
                        .limit(1)
                        .execute()
                    )
                if dt_group.data and dt_group.data[0].get("is_active"):
                    sb.table("dingtalk_outbox").insert({
                        "event_type": "activation_urgent_reminder",
                        "source_table": "activation_reminders",
                        "source_id": str(reminder.data[0]["id"]) if reminder.data else "00000000-0000-0000-0000-000000000000",
                        "team_code": dt_team_code,
                        "message": result["message"],
                    }).execute()
        except Exception as dt_exc:
            print(f"[dingtalk] urgent reminder enqueue failed (non-fatal): {dt_exc}")

        return {"ok": True, "reminder": reminder.data[0] if reminder.data else None}

    @app.get("/api/v1/payment-requests/{pr_id}/activation-urgent-remind", tags=["Activation"])
    def get_activation_urgent_reminder_status(
        pr_id: str,
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        actor = resolve_actor(sb, authorization)

        res = sb.table("activation_reminders") \
            .select("requested_at, requested_by_name") \
            .eq("payment_request_id", pr_id) \
            .is_("resolved_at", "null") \
            .order("requested_at", desc=True) \
            .limit(1).execute()

        can_remind = True
        if res.data:
            last_at = datetime.fromisoformat(res.data[0]["requested_at"].replace("Z", "+00:00"))
            elapsed = datetime.now(timezone.utc) - last_at
            can_remind = elapsed >= timedelta(minutes=15)

        return {
            "can_remind": can_remind,
            "last_reminder": res.data[0] if res.data else None,
        }

    @app.get("/api/v1/activation-urgent-reminders", tags=["Activation"])
    def list_activation_urgent_reminders(
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        actor = resolve_actor(sb, authorization)

        res = sb.table("activation_reminders") \
            .select("id, payment_request_id, requested_by_name, requested_at, note") \
            .is_("resolved_at", "null") \
            .order("requested_at", desc=True) \
            .execute()

        reminders = []
        pr_ids = list({r["payment_request_id"] for r in (res.data or [])})
        pr_map: dict[str, dict[str, Any]] = {}
        if pr_ids:
            pr_res = sb.table("payment_requests").select("id, name").in_("id", pr_ids).execute()
            pr_map = {p["id"]: p for p in (pr_res.data or [])}

        for r in (res.data or []):
            pr_info = pr_map.get(r["payment_request_id"], {})
            reminders.append({
                "id": r["id"],
                "payment_request_id": r["payment_request_id"],
                "pr_code": r["payment_request_id"],
                "customer_name": pr_info.get("name", ""),
                "requested_by_name": r["requested_by_name"],
                "requested_at": r["requested_at"],
                "note": r.get("note"),
            })
        return {"reminders": reminders}
