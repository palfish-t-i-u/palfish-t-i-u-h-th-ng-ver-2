"""Many-to-many payment request API — B1/B2 (Hiếu prototype)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from payos_qr import create_payos_payment_link, fetch_payos_payment, payos_payment_is_paid

router = APIRouter(prefix="/api/v1", tags=["payment-requests"])

PAYMENT_METHODS = frozenset({"qr", "cash", "card", "installment"})
LINE_STATUSES = frozenset({"pending", "paid", "rejected"})
PR_STATES = frozenset({"pending", "short", "done", "over", "cancelled"})

METHOD_ALIASES = {
    "qr": "qr",
    "vietqr": "qr",
    "cash": "cash",
    "tien_mat": "cash",
    "card": "card",
    "quet_the": "card",
    "installment": "installment",
    "tra_gop": "installment",
}


class PaymentRequestCreate(BaseModel):
    uid: str | None = None
    name: str | None = None
    phone: str | None = None
    country: str | None = "VN"
    address: str | None = ""
    ward: str | None = ""
    province: str | None = ""
    note: str | None = ""
    target: int | str | None = None

    uid_khach_hang: str | None = None
    ten_khach: str | None = None
    sdt: str | None = None
    dia_chi: str | None = None
    tong_tien_phai_thu: int | str | None = None


class PaymentLineCreate(BaseModel):
    amount: int | str | None = None
    method: str | None = None
    transfer_code: str | None = None
    code: str | None = None

    so_tien: int | str | None = None
    hinh_thuc: str | None = None


class TransactionStatusPatch(BaseModel):
    status: str
    reject_reason: str | None = None


class PaymentRequestCancelBody(BaseModel):
    reason: str | None = None


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _parse_amount(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0


def _normalize_method(raw: str | None) -> str:
    key = _clean_text(raw).lower()
    method = METHOD_ALIASES.get(key)
    if not method:
        allowed = ", ".join(sorted(PAYMENT_METHODS))
        raise HTTPException(400, f"method khong hop le. Gia tri hop le: {allowed}")
    return method


def _normalize_line_status(raw: str | None) -> str:
    key = _clean_text(raw).lower()
    if key not in LINE_STATUSES:
        allowed = ", ".join(sorted(LINE_STATUSES))
        raise HTTPException(400, f"status khong hop le. Gia tri hop le: {allowed}")
    return key


def _compute_state(received: int, target: int) -> str:
    if received <= 0:
        return "pending"
    if received < target:
        return "short"
    if received == target:
        return "done"
    return "over"


def _sum_paid_amount(lines: list[dict[str, Any]]) -> int:
    if not lines:
        return 0
    df = pd.DataFrame(lines)
    if df.empty or "amount" not in df.columns:
        return 0
    if "status" not in df.columns:
        df["status"] = ""
    paid = df[df["status"].astype(str).str.lower() == "paid"].copy()
    paid["amount"] = pd.to_numeric(paid["amount"], errors="coerce").fillna(0)
    return int(paid["amount"].sum())


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_payment_request(row: dict[str, Any]) -> dict[str, Any]:
    target = _parse_amount(row.get("target"))
    received = _parse_amount(row.get("received"))
    return {
        "id": row.get("id") or "",
        "name": row.get("name") or "",
        "uid": row.get("uid") or "",
        "phone": row.get("phone") or "",
        "country": row.get("country") or "VN",
        "address": row.get("address") or "",
        "ward": row.get("ward") or "",
        "province": row.get("province") or "",
        "note": row.get("note") or "",
        "target": target,
        "received": received,
        "state": row.get("state") or "pending",
        "delta": received - target,
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
    }


def _serialize_payment_line(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "payment_request_id": row.get("payment_request_id") or "",
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "payos_order_code": row.get("payos_order_code") or "",
        "transfer_code": row.get("transfer_code") or "",
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": row.get("paid_at") or "",
        "reject_reason": row.get("reject_reason") or "",
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
    }


def _serialize_payment_for_list(row: dict[str, Any], idx: int) -> dict[str, Any]:
    reject = row.get("reject_reason")
    paid_at = row.get("paid_at")
    return {
        "id": str(row.get("id") or ""),
        "idx": idx,
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "transfer_code": row.get("transfer_code") or "",
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": paid_at if paid_at else None,
        "created_at": row.get("created_at") or "",
        "reject_reason": reject if reject else None,
    }


def _serialize_payment_request_list_item(
    row: dict[str, Any], lines: list[dict[str, Any]]
) -> dict[str, Any]:
    sorted_lines = sorted(lines, key=lambda item: str(item.get("created_at") or ""))
    payments = [_serialize_payment_for_list(line, idx) for idx, line in enumerate(sorted_lines, start=1)]
    done_count = sum(1 for payment in payments if payment["status"] == "paid")
    item = _serialize_payment_request(row)
    item["cancelled_at"] = row.get("cancelled_at") or None
    item["cancelled_reason"] = row.get("cancelled_reason") or None
    item["done_count"] = done_count
    item["total_count"] = len(payments)
    item["payments"] = payments
    return item


def _group_lines_by_request(lines: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in lines:
        pr_id = str(line.get("payment_request_id") or "")
        if not pr_id:
            continue
        grouped.setdefault(pr_id, []).append(line)
    return grouped


def _payment_request_insert_row(body: PaymentRequestCreate) -> dict[str, Any]:
    uid = _clean_text(body.uid or body.uid_khach_hang)
    name = _clean_text(body.name or body.ten_khach)
    phone = _clean_text(body.phone or body.sdt)
    target = _parse_amount(body.target or body.tong_tien_phai_thu)
    address = _clean_text(body.address or body.dia_chi)

    missing: list[str] = []
    if not uid:
        missing.append("uid")
    if not name:
        missing.append("name")
    if not phone:
        missing.append("phone")
    if target <= 0:
        missing.append("target")
    if missing:
        raise HTTPException(400, f"Thieu du lieu bat buoc: {', '.join(missing)}")

    return {
        "name": name,
        "uid": uid,
        "phone": phone,
        "country": _clean_text(body.country) or "VN",
        "address": address,
        "ward": _clean_text(body.ward),
        "province": _clean_text(body.province),
        "note": _clean_text(body.note),
        "target": target,
        "received": 0,
        "state": "pending",
    }


def _allocate_pr_id(sb, year: int | None = None) -> str:
    year_key = str(year or datetime.now(timezone.utc).year)
    res = (
        sb.table("payment_request_sequences")
        .select("current_val")
        .eq("year_key", year_key)
        .limit(1)
        .execute()
    )
    if res.data:
        seq = int(res.data[0].get("current_val") or 0) + 1
        sb.table("payment_request_sequences").update({"current_val": seq}).eq("year_key", year_key).execute()
    else:
        seq = 1
        sb.table("payment_request_sequences").insert({"year_key": year_key, "current_val": seq}).execute()
    return f"PR-{year_key}-{seq:04d}"


def _transfer_code_hint(payment_request_id: str, line_count: int) -> str:
    suffix = payment_request_id.replace("PR-", "").replace("-", "")
    return f"TT-{suffix}-{line_count + 1:03d}"


def recompute_payment_request_totals(sb, payment_request_id: str) -> dict[str, Any]:
    request_res = (
        sb.table("payment_requests")
        .select("*")
        .eq("id", payment_request_id)
        .limit(1)
        .execute()
    )
    if not request_res.data:
        raise HTTPException(404, "Khong tim thay payment_request")

    pr_row = request_res.data[0]
    if _clean_text(pr_row.get("state")).lower() == "cancelled":
        return {
            "payment_request_id": payment_request_id,
            "received": _parse_amount(pr_row.get("received")),
            "target": _parse_amount(pr_row.get("target")),
            "state": "cancelled",
            "payment_request": _serialize_payment_request(pr_row),
        }

    line_res = (
        sb.table("payment_lines")
        .select("amount, status")
        .eq("payment_request_id", payment_request_id)
        .execute()
    )
    target = _parse_amount(pr_row.get("target"))
    received = _sum_paid_amount(line_res.data or [])
    state = _compute_state(received, target)

    update_res = (
        sb.table("payment_requests")
        .update({"received": received, "state": state})
        .eq("id", payment_request_id)
        .execute()
    )
    updated = update_res.data[0] if update_res.data else {**pr_row, "received": received, "state": state}
    return {
        "payment_request_id": payment_request_id,
        "received": received,
        "target": target,
        "state": state,
        "payment_request": _serialize_payment_request(updated),
    }


def _extract_payos_data(payload: dict[str, Any]) -> tuple[str, int, str]:
    data = payload.get("data", payload) or {}
    order_code = _clean_text(data.get("orderCode") or data.get("order_code") or data.get("reference"))
    amount = _parse_amount(data.get("amount") or data.get("transferAmount") or data.get("transfer_amount") or 0)
    description = _clean_text(data.get("description") or data.get("content") or data.get("transferContent"))
    return order_code, amount, description


def _mark_line_paid(sb, line_id: str) -> dict[str, Any]:
    now_iso = _iso_now()
    line_res = (
        sb.table("payment_lines")
        .update({"status": "paid", "paid_at": now_iso, "reject_reason": None})
        .eq("id", line_id)
        .execute()
    )
    if not line_res.data:
        raise HTTPException(404, "Khong tim thay payment_line")
    line = line_res.data[0]
    totals = recompute_payment_request_totals(sb, str(line["payment_request_id"]))
    return {
        "payment_line": _serialize_payment_line(line),
        **totals,
    }


def _find_payment_line_by_payos_code(sb, order_code: str) -> dict[str, Any] | None:
    """Lookup payment_line — PayOS gửi orderCode number, DB lưu text."""
    keys: list[str] = []
    cleaned = _clean_text(order_code)
    if cleaned:
        keys.append(cleaned)
    if cleaned.isdigit():
        keys.append(str(int(cleaned)))
    seen: set[str] = set()
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            line_res = (
                sb.table("payment_lines")
                .select("*")
                .eq("payos_order_code", key)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            print(f"[payment_requests] webhook lookup skipped: {exc}")
            return None
        if line_res.data:
            return line_res.data[0]
    return None


def _find_payment_line_by_payment_link_id(sb, payment_link_id: str) -> dict[str, Any] | None:
    link_id = _clean_text(payment_link_id)
    if not link_id:
        return None
    try:
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("checkout_url", f"https://pay.payos.vn/web/{link_id}")
            .limit(1)
            .execute()
        )
        if line_res.data:
            return line_res.data[0]
    except Exception as exc:
        print(f"[payment_requests] payment_link_id lookup skipped: {exc}")
    return None


async def sync_payment_line_from_payos(sb, line: dict[str, Any]) -> dict[str, Any] | None:
    """Poll PayOS — nếu PAID thì cập nhật payment_line (fallback khi webhook không tới)."""
    if _clean_text(line.get("status")).lower() == "paid":
        return None
    order_code = _clean_text(line.get("payos_order_code"))
    if not order_code:
        return None
    try:
        payos_data = await fetch_payos_payment(order_code)
    except Exception as exc:
        print(f"[payment_requests] payos fetch skipped: {exc}")
        return {"line_id": line.get("id"), "error": str(exc)}
    if not payos_data or not payos_payment_is_paid(payos_data):
        return None
    line_id = str(line.get("id") or "")
    if not line_id:
        return None
    try:
        result = _mark_line_paid(sb, line_id)
    except Exception as exc:
        return {"line_id": line_id, "error": str(exc)}
    return {
        "line_id": line_id,
        "payos_order_code": order_code,
        "payos_status": payos_data.get("status"),
        **result,
    }


async def sync_all_pending_payos_lines(sb) -> dict[str, Any]:
    try:
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("method", "qr")
            .eq("status", "pending")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(500, f"Khong doc payment_lines: {exc}") from exc

    synced: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for line in line_res.data or []:
        if not _clean_text(line.get("payos_order_code")):
            continue
        outcome = await sync_payment_line_from_payos(sb, line)
        if not outcome:
            continue
        if outcome.get("error"):
            errors.append(outcome)
        else:
            synced.append(
                {
                    "line_id": outcome.get("line_id"),
                    "payment_request_id": outcome.get("payment_request_id"),
                    "payos_order_code": outcome.get("payos_order_code"),
                }
            )
    return {"synced": synced, "synced_count": len(synced), "errors": errors}


def reconcile_payment_line_webhook(sb, payload: dict[str, Any]) -> dict[str, Any]:
    """Match PayOS webhook to payment_lines; fallback to don_hang when unmatched."""
    order_code, amount, description = _extract_payos_data(payload)
    data = payload.get("data", payload) or {}
    payment_link_id = _clean_text(data.get("paymentLinkId") or data.get("payment_link_id"))

    if not sb:
        return {"matched": False}

    line = None
    if order_code:
        line = _find_payment_line_by_payos_code(sb, order_code)
    if not line and payment_link_id:
        line = _find_payment_line_by_payment_link_id(sb, payment_link_id)
    if not line and description:
        # Fallback: khớp transfer_code trong nội dung CK (PayOS description)
        desc = description.upper()
        try:
            candidates = (
                sb.table("payment_lines")
                .select("*")
                .eq("method", "qr")
                .eq("status", "pending")
                .execute()
            )
            for candidate in candidates.data or []:
                code = _clean_text(candidate.get("transfer_code")).upper()
                if code and code in desc:
                    line = candidate
                    break
        except Exception as exc:
            print(f"[payment_requests] description lookup skipped: {exc}")

    if not line:
        return {"matched": False}

    line_id = str(line.get("id") or "")
    if not line_id:
        return {"matched": False}

    try:
        result = _mark_line_paid(sb, line_id)
    except Exception as exc:
        print(f"[payment_requests] webhook reconcile error: {exc}")
        return {"matched": True, "error": 1, "message": str(exc)}

    return {
        "matched": True,
        "error": 0,
        "message": "Xu ly payment_line thanh cong",
        "payos_order_code": order_code,
        "amount": amount,
        "description": description,
        **result,
    }


def register_payment_request_routes(app, get_supabase) -> None:
    @router.get("/payment-requests")
    def list_payment_requests(
        state: str | None = Query(None),
        uid: str | None = Query(None),
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ):
        sb = _sb_or_503(get_supabase)
        query = sb.table("payment_requests").select("*")
        state_filter = _clean_text(state).lower()
        if state_filter:
            if state_filter not in PR_STATES:
                allowed = ", ".join(sorted(PR_STATES))
                raise HTTPException(400, f"state khong hop le. Gia tri hop le: {allowed}")
            query = query.eq("state", state_filter)
        uid_filter = _clean_text(uid)
        if uid_filter:
            query = query.eq("uid", uid_filter)

        try:
            pr_res = (
                query.order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong doc duoc payment_requests: {exc}") from exc

        pr_rows = pr_res.data or []
        if not pr_rows:
            return {"requests": []}

        pr_ids = [str(row.get("id") or "") for row in pr_rows if row.get("id")]
        lines_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                line_res = (
                    sb.table("payment_lines")
                    .select("*")
                    .in_("payment_request_id", pr_ids)
                    .execute()
                )
                lines_by_pr = _group_lines_by_request(line_res.data or [])
            except Exception as exc:
                raise HTTPException(500, f"Khong doc duoc payment_lines: {exc}") from exc

        requests = [
            _serialize_payment_request_list_item(row, lines_by_pr.get(str(row.get("id") or ""), []))
            for row in pr_rows
        ]
        return {"requests": requests}

    @router.post("/payment-requests/{payment_request_id}/cancel")
    def cancel_payment_request(
        payment_request_id: str,
        body: PaymentRequestCancelBody | None = None,
    ):
        sb = _sb_or_503(get_supabase)
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        current_state = _clean_text(pr_row.get("state")).lower()
        if current_state == "cancelled":
            raise HTTPException(400, "Payment request da bi huy")
        if _parse_amount(pr_row.get("received")) > 0:
            raise HTTPException(400, "Khong the huy payment request da nhan tien")

        line_res = (
            sb.table("payment_lines")
            .select("status")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        if any(_clean_text(line.get("status")).lower() == "paid" for line in (line_res.data or [])):
            raise HTTPException(400, "Khong the huy payment request da co lan thanh toan thanh cong")

        now_iso = _iso_now()
        reason = _clean_text(body.reason if body else None) or None
        patch: dict[str, Any] = {
            "state": "cancelled",
            "cancelled_at": now_iso,
            "cancelled_reason": reason,
        }
        try:
            updated_res = (
                sb.table("payment_requests")
                .update(patch)
                .eq("id", payment_request_id)
                .execute()
            )
        except Exception as exc:
            msg = str(exc)
            if "cancelled_at" in msg or "cancelled_reason" in msg:
                raise HTTPException(
                    503,
                    "Thieu cot cancelled_at/cancelled_reason tren payment_requests. "
                    "Chay docs/supabase_schema_patch_payment_requests_cancel.sql",
                ) from exc
            raise HTTPException(500, f"Khong huy duoc payment_request: {exc}") from exc

        updated = updated_res.data[0] if updated_res.data else {**pr_row, **patch}
        line_res_full = (
            sb.table("payment_lines")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        return {
            "payment_request": _serialize_payment_request_list_item(
                updated, line_res_full.data or []
            )
        }

    @router.post("/payment-requests/sync-pending-payos")
    async def sync_pending_payos_payments():
        """Poll PayOS cho mọi QR pending — dùng khi webhook chưa tới (local/prod)."""
        sb = _sb_or_503(get_supabase)
        return await sync_all_pending_payos_lines(sb)

    @router.post("/payment-lines/{line_id}/sync-payos")
    async def sync_payment_line_payos(line_id: str):
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")
        outcome = await sync_payment_line_from_payos(sb, line_res.data[0])
        if not outcome:
            return {"synced": False, "line_id": line_id}
        if outcome.get("error"):
            raise HTTPException(502, f"PayOS sync loi: {outcome['error']}")
        return {"synced": True, **outcome}

    @router.post("/payment-requests")
    def create_payment_request(body: PaymentRequestCreate):
        sb = _sb_or_503(get_supabase)
        row = _payment_request_insert_row(body)
        try:
            row["id"] = _allocate_pr_id(sb)
            res = sb.table("payment_requests").insert(row).execute()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_request: {exc}") from exc

        inserted = res.data[0] if res.data else row
        return {"payment_request": _serialize_payment_request(inserted)}

    @router.post("/payment-requests/{payment_request_id}/payment-lines")
    async def create_payment_line(payment_request_id: str, body: PaymentLineCreate):
        sb = _sb_or_503(get_supabase)
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        if _clean_text(pr_row.get("state")).lower() == "cancelled":
            raise HTTPException(400, "Payment request da bi huy")

        amount = _parse_amount(body.amount or body.so_tien)
        if amount <= 0:
            raise HTTPException(400, "amount khong hop le")

        method = _normalize_method(body.method or body.hinh_thuc)
        existing_lines = (
            sb.table("payment_lines")
            .select("id")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        line_count = len(existing_lines.data or [])
        transfer_code = _clean_text(body.transfer_code or body.code) or _transfer_code_hint(
            payment_request_id, line_count
        )

        payos_payload: dict[str, Any] | None = None
        insert_row: dict[str, Any] = {
            "payment_request_id": payment_request_id,
            "method": method,
            "amount": amount,
            "status": "pending",
            "transfer_code": transfer_code,
        }
        if method in {"cash", "card"}:
            insert_row["status"] = "paid"
            insert_row["paid_at"] = _iso_now()

        if method == "qr":
            try:
                payos_payload = await create_payos_payment_link(amount, transfer_code)
            except ValueError as exc:
                raise HTTPException(503, str(exc)) from exc
            except Exception as exc:
                raise HTTPException(502, f"Khong ket noi duoc PayOS: {exc}") from exc

            insert_row.update(
                {
                    "payos_order_code": payos_payload["order_code"],
                    "transfer_code": payos_payload.get("transfer_content") or transfer_code,
                    "qr_code": payos_payload.get("qr_code") or "",
                    "checkout_url": payos_payload.get("checkout_url") or "",
                }
            )

        try:
            line_res = sb.table("payment_lines").insert(insert_row).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_line: {exc}") from exc

        line_row = line_res.data[0] if line_res.data else insert_row
        response: dict[str, Any] = {
            "payment_line": _serialize_payment_line(line_row),
            "payment_request": totals["payment_request"],
            "received": totals["received"],
            "target": totals["target"],
            "state": totals["state"],
        }
        if payos_payload:
            response["payos"] = {
                "checkout_url": payos_payload.get("checkout_url") or "",
                "qr_code": payos_payload.get("qr_code") or "",
                "order_code": payos_payload.get("order_code") or "",
                "transfer_content": payos_payload.get("transfer_content") or "",
                "payment_link_id": payos_payload.get("payment_link_id") or "",
            }
        return response

    @router.post("/payos-webhook")
    async def payos_webhook_v1(payload: dict):
        sb = _sb_or_503(get_supabase)
        result = reconcile_payment_line_webhook(sb, payload)
        if not result.get("matched"):
            raise HTTPException(404, "Khong tim thay payment_line tuong ung webhook")
        return result

    @router.patch("/transactions/{transaction_id}/status")
    def patch_transaction_status(transaction_id: str, body: TransactionStatusPatch):
        sb = _sb_or_503(get_supabase)
        status = _normalize_line_status(body.status)

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("id", transaction_id)
            .limit(1)
            .execute()
        )
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay transaction")

        line = line_res.data[0]
        payment_request_id = str(line.get("payment_request_id") or "")
        if not payment_request_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        patch: dict[str, Any] = {"status": status}
        if status == "paid":
            patch["paid_at"] = _iso_now()
            patch["reject_reason"] = None
        elif status == "rejected":
            patch["paid_at"] = None
            patch["reject_reason"] = _clean_text(body.reject_reason) or "Ke toan tu choi"
        else:
            patch["paid_at"] = None
            patch["reject_reason"] = None

        try:
            updated_res = sb.table("payment_lines").update(patch).eq("id", transaction_id).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat transaction: {exc}") from exc

        updated_line = updated_res.data[0] if updated_res.data else {**line, **patch}
        return {
            "payment_line": _serialize_payment_line(updated_line),
            "payment_request": totals["payment_request"],
            "received": totals["received"],
            "target": totals["target"],
            "state": totals["state"],
        }

    app.include_router(router)
