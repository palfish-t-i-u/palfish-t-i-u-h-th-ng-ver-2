"""Zalo Message Builder — format notification messages for the Zalo OA Worker.

All builder functions follow the same contract:
    Input:  Two dicts (event data + sale info).
    Output: {"message": str, "canonical_team_code": str}

Graceful degradation: missing fields are replaced with safe defaults
and a WARNING is logged.  Functions NEVER raise exceptions.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo  # type: ignore[no-redef]

from utils.team_mapper import get_canonical_team

logger = logging.getLogger(__name__)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def _safe_get(data: dict[str, Any], key: str, default: str = "Unknown",
              context: str = "") -> str:
    """Get a string value from *data*, log a warning if missing."""
    val = data.get(key)
    if val is None or (isinstance(val, str) and not val.strip()):
        logger.warning(
            "Missing %s in %s (key=%r, id=%s)",
            key, context or "payload", key, data.get("id", "?"),
        )
        return default
    return str(val).strip()


def _format_vnd(amount: Any) -> str:
    """Format an amount as Vietnamese đồng: ``1,500,000đ``."""
    try:
        n = int(amount)
    except (TypeError, ValueError):
        return "0đ"
    return f"{n:,}đ"


def _format_datetime_vn(dt_value: Any) -> str:
    """Convert a datetime to ``dd/mm/yyyy HH:MM`` in Asia/Ho_Chi_Minh.

    Accepts datetime objects or ISO-format strings.
    Returns ``"N/A"`` on failure.
    """
    if dt_value is None:
        return "N/A"
    try:
        if isinstance(dt_value, str):
            dt_value = datetime.fromisoformat(dt_value)
        if isinstance(dt_value, datetime):
            if dt_value.tzinfo is None:
                # Assume UTC for naive datetimes (Render server default)
                from datetime import timezone
                dt_value = dt_value.replace(tzinfo=timezone.utc)
            vn_dt = dt_value.astimezone(VN_TZ)
            return vn_dt.strftime("%d/%m/%Y %H:%M")
    except Exception as exc:
        logger.warning("Failed to format datetime %r: %s", dt_value, exc)
    return "N/A"


# -----------------------------------------------------------------------
# Public builders
# -----------------------------------------------------------------------


def build_payment_paid_message(
    payment_data: dict[str, Any],
    sale_info: dict[str, Any],
) -> dict[str, str]:
    """Build the PAID notification message.

    Format::

        💰 PAID — KH {customer} | {amount}đ | sale {sale_name} | {method} | {time}

    Returns ``{"message": ..., "canonical_team_code": ...}``.
    """
    ctx = f"payment id={payment_data.get('id', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}

    customer = _safe_get(payment_data, "customer_name", "Unknown",
                         f"payment_data ({ctx})")
    amount_raw = payment_data.get("amount")
    if amount_raw is None:
        logger.warning("Missing amount in payment_data (%s)", ctx)
        amount_raw = 0
    amount = _format_vnd(amount_raw)

    sale_name = _safe_get(sale_info, "crm_name", "Unknown",
                          f"sale_info ({ctx})")
    method = _safe_get(payment_data, "method", "Unknown",
                       f"payment_data ({ctx})")
    paid_at = payment_data.get("paid_at")
    time_str = _format_datetime_vn(paid_at)

    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)

    message = (
        f"💰 PAID — KH {customer} | {amount} "
        f"| sale {sale_name} | {method} | {time_str}"
    )

    return {"message": message, "canonical_team_code": canonical_team}


def build_activation_urgent_reminder_message(
    reminder_data: dict[str, Any],
    sale_info: dict[str, Any],
) -> dict[str, str]:
    """Build urgent activation reminder for Zalo group.

    Format::

        ⚡ Cần kích hoạt khóa học GẤP
        PR-xxxx · {customer}
        Gói: {activated}/{total}
        Sale nhắc: {sale_name}
        Note: {note}
    """
    ctx = f"reminder pr={reminder_data.get('pr_code', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}

    pr_code = _safe_get(reminder_data, "pr_code", "?", ctx)
    customer = _safe_get(reminder_data, "customer_name", "Unknown", ctx)
    courses_total = reminder_data.get("courses_total", 0)
    courses_activated = reminder_data.get("courses_activated", 0)
    sale_name = _safe_get(sale_info, "display_name",
                          sale_info.get("crm_name", "Unknown"), ctx)
    note = reminder_data.get("note")

    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)

    lines = [
        "⚡ Cần kích hoạt khóa học GẤP",
        f"{pr_code} · {customer}",
        f"Gói: {courses_activated}/{courses_total}",
        f"Sale nhắc: {sale_name}",
    ]
    if note and str(note).strip():
        lines.append(f"Note: {str(note).strip()}")

    return {"message": "\n".join(lines), "canonical_team_code": canonical_team}


def build_course_activated_message(
    req_data: dict[str, Any],
    sale_info: dict[str, Any],
) -> dict[str, str]:
    """Build the COURSE ACTIVATED notification message.

    Format::

        ✅ KÍCH HOẠT — KH {customer} | gói {package} | sale {sale_name}

    Returns ``{"message": ..., "canonical_team_code": ...}``.
    """
    ctx = f"active_request id={req_data.get('id', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}

    customer = _safe_get(req_data, "customer_name", "Unknown",
                         f"req_data ({ctx})")
    package = _safe_get(req_data, "package_name", "Unknown",
                        f"req_data ({ctx})")
    sale_name = _safe_get(sale_info, "crm_name", "Unknown",
                          f"sale_info ({ctx})")

    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)

    message = (
        f"✅ KÍCH HOẠT — KH {customer} "
        f"| gói {package} | sale {sale_name}"
    )

    return {"message": message, "canonical_team_code": canonical_team}
