"""Helper for writing application-level audit logs."""

from __future__ import annotations
from typing import Any

def log_audit(
    sb: Any,
    actor_email: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """
    Inserts a record into the audit_logs table.
    Swallows any exceptions so it does not block the main business logic.
    """
    try:
        sb.table("audit_logs").insert({
            "action": action,
            "actor_email": actor_email,
            "target_type": target_type,
            "target_id": target_id,
            "payload": payload or {},
        }).execute()
    except Exception as exc:
        print(f"[audit] log failed for action {action}: {exc}")
