"""Notification routes -- in-app inbox for sales/ops."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException, Query

from rbac import resolve_actor


router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_notification(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "user_email": row.get("user_email"),
        "kind": row.get("kind"),
        "payload": row.get("payload") or {},
        "created_at": row.get("created_at"),
        "read_at": row.get("read_at"),
    }


def register_notification_routes(app, get_supabase) -> None:
    @router.get("")
    def list_notifications(
        unread: bool = Query(False),
        limit: int = Query(20, ge=1, le=100),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        query = (
            sb.table("notifications")
            .select("*")
            .eq("user_email", actor.email.lower())
        )
        if unread:
            query = query.is_("read_at", "null")
        try:
            res = query.order("created_at", desc=True).limit(limit).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc duoc notifications: {exc}") from exc
        return {"notifications": [_serialize_notification(row) for row in (res.data or [])]}

    @router.post("/{notification_id}/read")
    def mark_notification_read(
        notification_id: str,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        try:
            res = (
                sb.table("notifications")
                .update({"read_at": _now_iso()})
                .eq("id", notification_id)
                .eq("user_email", actor.email.lower())
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat notification: {exc}") from exc
        if not res.data:
            raise HTTPException(404, "Khong tim thay notification")
        return {"ok": True, "notification": _serialize_notification(res.data[0])}

    @router.post("/mark-all-read")
    def mark_all_notifications_read(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        try:
            sb.table("notifications").update({"read_at": _now_iso()}).eq(
                "user_email", actor.email.lower()
            ).is_("read_at", "null").execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat notifications: {exc}") from exc
        return {"ok": True}

    app.include_router(router)
