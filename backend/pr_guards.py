from __future__ import annotations

from typing import Any
from fastapi import HTTPException

# Parent PR must be fully paid (100% or overpaid) before course activation.
ALLOWED_PR_STATES = frozenset({"done", "over"})

# Đơn quẹt thẻ / trả góp: tiền chỉ về thật sau khi kế toán ghép mPOS (vài ngày).
# Line pending của 2 method này + CÓ bill được coi là "đủ tạm" để mở CỔNG kích hoạt,
# NHƯNG line vẫn giữ status='pending' (không set 'paid' → không fire trg_payment_paid_zalo).
_PROVISIONAL_METHODS = frozenset({"card", "installment"})

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


def assert_pr_paid(sb, pr: dict[str, Any]) -> None:
    """Cổng "được báo đơn / tạo gói học": PR đủ tiền (thật hoặc "đủ tạm").

    "Đủ tạm" = received thật + GROSS của line card/installment pending CÓ bill
    (đơn quẹt thẻ chưa ghép mPOS). Xem activatable_received.
    """
    state = _pr_payment_state(pr)
    target, _received = _pr_amounts(pr)
    activatable = activatable_received(sb, pr)
    paid_by_state = state in ALLOWED_PR_STATES
    paid_by_amount = target > 0 and activatable >= target
    if paid_by_state or paid_by_amount:
        return
    raise HTTPException(
        400,
        f"Payment Request chưa thanh toán đủ — trang_thai={pr.get('trang_thai')!r}, "
        f"da_thu={activatable}/{target}, cần đủ 100% tiền",
    )


def _line_has_bill(line: dict[str, Any]) -> bool:
    """Line có ảnh bill chưa. Khớp CHÍNH XÁC predicate FE billGuardUtils.ts:12-14."""
    if bool((line.get("bill_image") or "").strip()):
        return True
    imgs = line.get("bill_images")
    return isinstance(imgs, list) and len(imgs) > 0


def activatable_received(sb, pr: dict[str, Any]) -> int:
    """received THẬT (net paid) + GROSS của line card/installment status=pending CÓ bill.

    Line giữ pending → KHÔNG set paid → KHÔNG kích hoạt trg_payment_paid_zalo.
    qr/cash pending, hoặc card/installment thiếu bill → KHÔNG cộng (vẫn chặn cổng).
    Fail-closed: query lỗi → trả received gốc (chặn, không mở nhầm).
    ⚠ Phải khớp byte-for-byte FE paymentRequestUtils.ts activatableReceived.
    """
    _, received = _pr_amounts(pr)
    pr_id = str(pr.get("id") or "")
    if not pr_id:
        return received
    try:
        res = (
            sb.table("payment_lines")
            .select("amount, method, status, bill_image, bill_images")
            .eq("payment_request_id", pr_id)
            .eq("status", "pending")
            .execute()
        )
    except Exception:
        return received  # fail-closed
    provisional = 0
    for line in (res.data or []):
        if (line.get("method") or "").lower() in _PROVISIONAL_METHODS and _line_has_bill(line):
            try:
                provisional += int(line.get("amount") or 0)
            except (TypeError, ValueError):
                pass
    return received + provisional


def assert_all_paid_lines_have_bill(sb, pr: dict) -> None:
    """Raise 422 if any confirmed payment line on this PR is missing a bill image."""
    pr_id = str(pr.get("id") or "")
    if not pr_id:
        return
    lines_res = (
        sb.table("payment_lines")
        .select("id, amount, bill_image, bill_images")
        .eq("payment_request_id", pr_id)
        .eq("status", "paid")
        .execute()
    )
    missing = []
    for line in (lines_res.data or []):
        if not _line_has_bill(line):
            missing.append({"line_id": line["id"], "amount": line.get("amount")})
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "MISSING_BILLS",
                "message": f"{len(missing)} lần thanh toán chưa có ảnh bill. Vui lòng up bill trước khi tạo yêu cầu tạo gói học.",
                "missing_lines": missing,
            },
        )
