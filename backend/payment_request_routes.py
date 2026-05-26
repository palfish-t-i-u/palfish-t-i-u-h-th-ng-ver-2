from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from payos_qr import parse_transfer_content_from_qr


router = APIRouter(prefix="/api/v1", tags=["payment-requests"])

PAYMENT_LINE_METHODS = {"vietqr", "tien_mat", "quet_the"}
METHOD_ALIASES = {
    "qr": "vietqr",
    "vietqr": "vietqr",
    "cash": "tien_mat",
    "tien_mat": "tien_mat",
    "card": "quet_the",
    "quet_the": "quet_the",
    "installment": "quet_the",
}


class PaymentRequestCreate(BaseModel):
    uid_khach_hang: str | None = None
    ten_khach: str | None = None
    sdt: str | None = None
    dia_chi: str | None = None
    tong_tien_phai_thu: int | str | None = None

    # Aliases used by Hieu's prototype UI.
    uid: str | None = None
    name: str | None = None
    phone: str | None = None
    address: str | None = None
    ward: str | None = None
    province: str | None = None
    target: int | str | None = None


class PaymentLineCreate(BaseModel):
    so_tien: int | str | None = None
    hinh_thuc: str | None = None
    tien_ve: bool | None = None
    payos_order_code: str | int | None = None

    # Aliases used by Hieu's prototype UI.
    amount: int | str | None = None
    method: str | None = None
    code: str | None = None


def _sb_or_503(get_supabase):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _parse_amount(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_method(raw: str | None) -> str:
    key = _clean_text(raw).lower()
    method = METHOD_ALIASES.get(key)
    if not method:
        allowed = ", ".join(sorted(PAYMENT_LINE_METHODS))
        raise HTTPException(400, f"hinh_thuc khong hop le. Gia tri hop le: {allowed}")
    return method


def _payment_request_row(body: PaymentRequestCreate) -> dict[str, Any]:
    uid_khach_hang = _clean_text(body.uid_khach_hang or body.uid)
    ten_khach = _clean_text(body.ten_khach or body.name)
    sdt = _clean_text(body.sdt or body.phone)
    dia_chi = _clean_text(body.dia_chi)
    if not dia_chi:
        dia_chi = ", ".join(
            part for part in [_clean_text(body.address), _clean_text(body.ward), _clean_text(body.province)] if part
        )
    tong_tien_phai_thu = _parse_amount(body.tong_tien_phai_thu or body.target)

    missing = []
    if not uid_khach_hang:
        missing.append("uid_khach_hang")
    if not ten_khach:
        missing.append("ten_khach")
    if not sdt:
        missing.append("sdt")
    if tong_tien_phai_thu <= 0:
        missing.append("tong_tien_phai_thu")
    if missing:
        raise HTTPException(400, f"Thieu du lieu bat buoc: {', '.join(missing)}")

    return {
        "uid_khach_hang": uid_khach_hang,
        "ten_khach": ten_khach,
        "sdt": sdt,
        "dia_chi": dia_chi,
        "tong_tien_phai_thu": tong_tien_phai_thu,
        "da_thu_luc_nay": 0,
        "trang_thai": "pending",
    }


def _extract_payos_data(payload: dict[str, Any]) -> tuple[str, int, str]:
    data = payload.get("data", payload) or {}
    order_code = _clean_text(data.get("orderCode") or data.get("order_code") or data.get("reference"))
    amount = _parse_amount(data.get("amount") or data.get("transferAmount") or data.get("transfer_amount") or 0)
    description = _clean_text(data.get("description") or data.get("content") or data.get("transferContent"))
    return order_code, amount, description


def recompute_payment_request_totals(sb, payment_request_id: str) -> dict[str, Any]:
    request_res = (
        sb.table("payment_requests")
        .select("id, tong_tien_phai_thu")
        .eq("id", payment_request_id)
        .limit(1)
        .execute()
    )
    if not request_res.data:
        raise HTTPException(404, "Khong tim thay payment_request")

    expected = _parse_amount(request_res.data[0].get("tong_tien_phai_thu"))
    line_res = (
        sb.table("payment_lines")
        .select("so_tien")
        .eq("payment_request_id", payment_request_id)
        .eq("tien_ve", True)
        .execute()
    )
    collected = sum(_parse_amount(row.get("so_tien")) for row in (line_res.data or []))

    if expected > 0 and collected >= expected:
        status = "fully_paid"
    elif collected > 0:
        status = "partially_paid"
    else:
        status = "pending"

    update_res = (
        sb.table("payment_requests")
        .update({"da_thu_luc_nay": collected, "trang_thai": status})
        .eq("id", payment_request_id)
        .execute()
    )
    updated = update_res.data[0] if update_res.data else {}
    return {
        "payment_request_id": payment_request_id,
        "da_thu_luc_nay": collected,
        "tong_tien_phai_thu": expected,
        "trang_thai": status,
        "payment_request": updated,
    }


async def _create_payos_payment_link(amount: int, description_hint: str) -> dict[str, Any]:
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()
    if not all([client_id, api_key, checksum_key]):
        raise HTTPException(503, "PayOS chua duoc cau hinh")

    description = re.sub(r"[^a-zA-Z0-9 ]", "", description_hint or "Thanh toan")[:25].strip()
    if not description:
        description = "Thanh toan"

    order_code = int(time.time() * 1000) % 9_007_199_254_740_991
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5174").rstrip("/")
    return_url = f"{frontend_url}/"
    cancel_url = f"{frontend_url}/"

    sig_str = (
        f"amount={amount}"
        f"&cancelUrl={cancel_url}"
        f"&description={description}"
        f"&orderCode={order_code}"
        f"&returnUrl={return_url}"
    )
    signature = hmac.new(
        checksum_key.encode("utf-8"),
        sig_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    payload = {
        "orderCode": order_code,
        "amount": amount,
        "description": description,
        "returnUrl": return_url,
        "cancelUrl": cancel_url,
        "signature": signature,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api-merchant.payos.vn/v2/payment-requests",
                json=payload,
                headers={
                    "x-client-id": client_id,
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                },
            )
            data = resp.json()
    except Exception as exc:
        raise HTTPException(502, f"Khong ket noi duoc PayOS: {exc}") from exc

    if data.get("code") != "00":
        raise HTTPException(400, f"PayOS loi: {data.get('desc') or data}")

    link_data = data.get("data", {}) or {}
    qr_code = _clean_text(link_data.get("qrCode"))
    transfer_content = parse_transfer_content_from_qr(qr_code) or description
    return {
        "checkout_url": link_data.get("checkoutUrl", ""),
        "qr_code": qr_code,
        "order_code": str(order_code),
        "description": description,
        "transfer_content": transfer_content,
        "payment_link_id": link_data.get("paymentLinkId", ""),
    }


def reconcile_payment_line_webhook(sb, payload: dict[str, Any]) -> dict[str, Any]:
    """Match PayOS webhook to payment_lines first, then refresh parent totals.

    Returns matched=False when the webhook does not belong to the new
    many-to-many payment flow so the deprecated don_hang fallback can run.
    """
    order_code, amount, description = _extract_payos_data(payload)
    if not sb or not order_code:
        return {"matched": False}

    try:
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("payos_order_code", order_code)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print(f"[payment_requests] webhook lookup skipped: {exc}")
        return {"matched": False}

    if not line_res.data:
        return {"matched": False}

    line = line_res.data[0]
    line_id = line.get("id")
    payment_request_id = line.get("payment_request_id")
    if not line_id or not payment_request_id:
        return {"matched": False}

    try:
        sb.table("payment_lines").update({"tien_ve": True}).eq("id", line_id).execute()
        totals = recompute_payment_request_totals(sb, str(payment_request_id))
    except Exception as exc:
        print(f"[payment_requests] webhook reconcile error: {exc}")
        return {"matched": True, "error": 1, "message": str(exc)}

    return {
        "matched": True,
        "error": 0,
        "message": "Xu ly payment_line thanh cong",
        "payment_line_id": line_id,
        "payment_request_id": payment_request_id,
        "payos_order_code": order_code,
        "amount": amount,
        "description": description,
        **totals,
    }


def register_payment_request_routes(app, get_supabase) -> None:
    @router.post("/payment-requests")
    def create_payment_request(body: PaymentRequestCreate):
        sb = _sb_or_503(get_supabase)
        row = _payment_request_row(body)
        try:
            res = sb.table("payment_requests").insert(row).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_request: {exc}") from exc
        return {"payment_request": res.data[0] if res.data else row}

    @router.post("/payment-requests/{id}/payment-lines")
    async def create_payment_line(id: str, body: PaymentLineCreate):
        sb = _sb_or_503(get_supabase)
        payment_request_id = id
        request_res = (
            sb.table("payment_requests")
            .select("id, tong_tien_phai_thu, da_thu_luc_nay")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        amount = _parse_amount(body.so_tien or body.amount)
        if amount <= 0:
            raise HTTPException(400, "so_tien khong hop le")

        method = _normalize_method(body.hinh_thuc or body.method)
        payos: dict[str, Any] | None = None
        payos_order_code = _clean_text(body.payos_order_code)
        tien_ve = bool(body.tien_ve) if body.tien_ve is not None else method != "vietqr"

        if method == "vietqr":
            description_hint = body.code or f"TT {payment_request_id.replace('-', '')[:16]}"
            payos = await _create_payos_payment_link(amount, description_hint)
            payos_order_code = payos["order_code"]
            tien_ve = False

        row = {
            "payment_request_id": payment_request_id,
            "so_tien": amount,
            "hinh_thuc": method,
            "tien_ve": tien_ve,
            "payos_order_code": payos_order_code or None,
        }
        try:
            line_res = sb.table("payment_lines").insert(row).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_line: {exc}") from exc

        return {
            "payment_line": line_res.data[0] if line_res.data else row,
            "payment_request": totals.get("payment_request"),
            "da_thu_luc_nay": totals["da_thu_luc_nay"],
            "trang_thai": totals["trang_thai"],
            "payos": payos,
        }

    app.include_router(router)
