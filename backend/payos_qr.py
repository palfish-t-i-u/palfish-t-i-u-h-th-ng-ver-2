"""PayOS VietQR utilities — EMV parse + dynamic payment link creation."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from typing import Any

import httpx


def _read_tlv_block(data: str, pos: int) -> tuple[str, int] | None:
    """Read one TLV at pos; return (value, next_pos)."""
    if pos + 4 > len(data):
        return None
    length = int(data[pos + 2 : pos + 4])
    start = pos + 4
    end = start + length
    if end > len(data):
        return None
    return data[start:end], end


def parse_transfer_content_from_qr(qr_code: str) -> str | None:
    """
    Trích nội dung chuyển khoản từ chuỗi EMV VietQR (qrCode PayOS trả về).
    Gộp các sub-field trong tag 62 (01 bill, 08 purpose, …) — khớp màn PayOS / app NH.
    """
    if not qr_code or len(qr_code) < 10:
        return None

    pos = 0
    while pos < len(qr_code) - 4:
        if qr_code[pos : pos + 2] != "62":
            pos += 1
            continue
        block_result = _read_tlv_block(qr_code, pos)
        if not block_result:
            break
        block, _ = block_result
        parts: list[str] = []
        sub = 0
        while sub < len(block) - 4:
            sub_id = block[sub : sub + 2]
            try:
                sub_len = int(block[sub + 2 : sub + 4])
            except ValueError:
                break
            val_start = sub + 4
            val_end = val_start + sub_len
            if val_end > len(block):
                break
            val = block[val_start:val_end].strip()
            if val:
                parts.append(val)
            sub = val_end
        if parts:
            return " ".join(parts)
        break

    return None


async def create_payos_payment_link(amount: int, description_hint: str) -> dict[str, Any]:
    """Create a PayOS v2 payment link and return QR + order metadata."""
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()
    if not all([client_id, api_key, checksum_key]):
        raise ValueError("PayOS chua duoc cau hinh")

    description = re.sub(r"[^a-zA-Z0-9 ]", "", description_hint or "Thanh toan")[:25].strip()
    if not description:
        description = "Thanh toan"

    order_code = int(time.time() * 1000) % 9_007_199_254_740_991
    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
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

    if data.get("code") != "00":
        raise ValueError(f"PayOS loi: {data.get('desc') or data}")

    link_data = data.get("data", {}) or {}
    qr_code = str(link_data.get("qrCode") or "").strip()
    transfer_content = parse_transfer_content_from_qr(qr_code) or description
    return {
        "checkout_url": link_data.get("checkoutUrl", ""),
        "qr_code": qr_code,
        "order_code": str(order_code),
        "description": description,
        "transfer_content": transfer_content,
        "payment_link_id": link_data.get("paymentLinkId", ""),
    }


def _payos_headers() -> dict[str, str]:
    client_id = os.getenv("PAYOS_CLIENT_ID", "").strip()
    api_key = os.getenv("PAYOS_API_KEY", "").strip()
    if not client_id or not api_key:
        raise ValueError("PayOS chua duoc cau hinh")
    return {
        "x-client-id": client_id,
        "x-api-key": api_key,
        "Content-Type": "application/json",
    }


def payos_payment_is_paid(data: dict[str, Any]) -> bool:
    """True khi PayOS GET /v2/payment-requests/{id} báo đã thu tiền."""
    status = str(data.get("status") or "").upper()
    if status in {"PAID", "COMPLETED", "SUCCESS", "SUCCEEDED"}:
        return True
    try:
        amount_paid = int(data.get("amountPaid") or 0)
        amount_remaining = int(data.get("amountRemaining") if data.get("amountRemaining") is not None else -1)
    except (TypeError, ValueError):
        return False
    return amount_paid > 0 and amount_remaining == 0


async def fetch_payos_payment(order_code: str) -> dict[str, Any] | None:
    """GET /v2/payment-requests/{orderCode} — trạng thái link PayOS."""
    code = str(order_code or "").strip()
    if not code:
        return None
    async with httpx.AsyncClient(timeout=12.0) as client:
        resp = await client.get(
            f"https://api-merchant.payos.vn/v2/payment-requests/{code}",
            headers=_payos_headers(),
        )
        payload = resp.json()
    if payload.get("code") != "00":
        return None
    data = payload.get("data")
    return data if isinstance(data, dict) else None


async def confirm_payos_webhook_url(webhook_url: str) -> dict[str, Any]:
    """Đăng ký webhook URL với PayOS (POST /confirm-webhook)."""
    url = str(webhook_url or "").strip()
    if not url:
        raise ValueError("webhook_url trong")
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api-merchant.payos.vn/confirm-webhook",
            json={"webhookUrl": url},
            headers=_payos_headers(),
        )
        return resp.json()
