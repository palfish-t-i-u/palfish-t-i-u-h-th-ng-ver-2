"""API — ghi nhận kế toán đã gửi hóa đơn cho khách (email/zalo)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from admin_routes import require_module_write
from invoice_email_service import is_valid_email
from rbac import resolve_actor

router = APIRouter(prefix="/api/v1", tags=["invoice-delivery"])

DELIVERY_CHANNELS = frozenset({"email", "zalo"})


class InvoiceDeliveryLogBody(BaseModel):
    channel: Literal["email", "zalo"] = "email"
    sent_to: str | None = None
    note: str | None = None


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_delivery_log(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "sent_to": row.get("sent_to"),
        "sent_by_email": row.get("sent_by_email"),
        "sent_at": row.get("sent_at"),
        "status": row.get("status"),
        "channel": row.get("channel") or "email",
        "error_message": row.get("error_message"),
        "provider_message_id": row.get("provider_message_id"),
        "metadata": row.get("metadata") or {},
    }


def _fetch_active_request(sb, active_request_id: str) -> dict[str, Any]:
    try:
        res = (
            sb.table("active_requests")
            .select("*")
            .eq("id", active_request_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(503, f"Khong doc duoc active_requests: {exc}") from exc
    if not res.data:
        raise HTTPException(404, f"Active request {active_request_id} khong ton tai")
    return res.data[0]


def _fetch_payment_request(sb, pr_id: str) -> dict[str, Any] | None:
    if not pr_id:
        return None
    try:
        res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", pr_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(503, f"Khong doc duoc payment_requests: {exc}") from exc
    if not res.data:
        return None
    return res.data[0]


def _resolve_sent_to(
    channel: str,
    body_sent_to: str | None,
    pr_row: dict[str, Any] | None,
) -> str:
    sent_to = _clean_text(body_sent_to)

    if channel == "email":
        if not sent_to and pr_row:
            sent_to = _clean_text(pr_row.get("email"))
        if not sent_to:
            raise HTTPException(
                400,
                "Thieu email khach hang; can sent_to hoac payment_requests.email",
            )
        if not is_valid_email(sent_to):
            raise HTTPException(400, "Email khach hang khong hop le")
        return sent_to

    if not sent_to and pr_row:
        sent_to = _clean_text(pr_row.get("phone") or pr_row.get("sdt"))
    if not sent_to:
        sent_to = "zalo"
    return sent_to


def _insert_delivery_log(sb, row: dict[str, Any]) -> dict[str, Any]:
    try:
        res = sb.table("invoice_email_logs").insert(row).execute()
    except Exception as exc:
        raise HTTPException(500, f"Khong ghi duoc invoice_email_log: {exc}") from exc
    if res.data:
        return res.data[0]
    return row


def register_invoice_email_routes(app, get_supabase) -> None:
    @router.post("/invoices/{active_request_id}/delivery-log")
    def create_invoice_delivery_log(
        active_request_id: str,
        body: InvoiceDeliveryLogBody,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "module4")

        channel = _clean_text(body.channel).lower() or "email"
        if channel not in DELIVERY_CHANNELS:
            raise HTTPException(400, "channel phai la email hoac zalo")

        ar_row = _fetch_active_request(sb, active_request_id)
        pr_id = _clean_text(ar_row.get("pr_id")) or None
        pr_row = _fetch_payment_request(sb, pr_id) if pr_id else None
        sent_to = _resolve_sent_to(channel, body.sent_to, pr_row)

        note = _clean_text(body.note)
        metadata: dict[str, Any] = {}
        if note:
            metadata["note"] = note

        log_row = _insert_delivery_log(
            sb,
            {
                "id": str(uuid.uuid4()),
                "active_request_id": active_request_id,
                "payment_request_id": pr_id,
                "sent_to": sent_to,
                "sent_by_email": actor.email.lower(),
                "sent_at": _iso_now(),
                "status": "sent",
                "channel": channel,
                "error_message": None,
                "provider_message_id": None,
                "metadata": metadata,
            },
        )

        return {"log": _serialize_delivery_log(log_row)}

    @router.get("/invoices/{active_request_id}/delivery-log")
    def list_invoice_delivery_logs(
        active_request_id: str,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "module4")

        _fetch_active_request(sb, active_request_id)

        try:
            res = (
                sb.table("invoice_email_logs")
                .select("*")
                .eq("active_request_id", active_request_id)
                .order("sent_at", desc=True)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(503, f"Khong doc duoc invoice_email_logs: {exc}") from exc

        rows = res.data or []
        return {"logs": [_serialize_delivery_log(row) for row in rows]}

    app.include_router(router)
