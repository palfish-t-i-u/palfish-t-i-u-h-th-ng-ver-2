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

from utils.lead_source_map import resolve_lead_label
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


def _format_vnd_dots(amount: Any) -> str:
    """Format an amount with dot thousand-separators: ``8.500.000 VNĐ``.

    Distinct from ``_format_vnd`` (comma separator, no space) which existing
    messages (payment_paid) already rely on — do NOT merge the two.
    """
    try:
        n = int(float(amount))
    except (TypeError, ValueError):
        n = 0
    return f"{n:,}".replace(",", ".") + " VNĐ"


def _first_nonempty(*values: Any, default: str = "") -> str:
    """Return the first stripped, non-empty string among *values*."""
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


_COUNTRY_DIAL_CODE: dict[str, str] = {
    "VN": "84", "CN": "86", "KR": "82", "US": "1", "JP": "81",
    "TW": "886", "HK": "852", "SG": "65", "TH": "66", "PH": "63",
}


def format_phone_intl(phone: Any, country: Any = None) -> str | None:
    """Format phone as ``{dial_code}-{local}`` (VD: ``84-353748121``).

    Mirror of SQL ``public.format_phone_intl`` (migration
    2026-07-04-zalo-phone-intl-format.sql).  Keep in sync.
    """
    if phone is None:
        return None
    raw = str(phone).strip()
    if not raw:
        return None
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return raw
    cc_key = (str(country).strip().upper() if country else "VN") or "VN"
    dial = _COUNTRY_DIAL_CODE.get(cc_key, "84")
    digits = digits.lstrip("0")
    if digits.startswith(dial) and len(digits) > len(dial) + 5:
        digits = digits[len(dial):]
    return f"{dial}-{digits}"


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

        💰 ĐÃ VÀO - KH {name}[ - Bé {child_name}] - ĐT: {phone|chưa cung cấp}
        🔸 Sale {sale_name} · Team {team}
        🔸 Số tiền: {amount} VND lúc {HH:MM DD/MM/YYYY}

    Live path = SQL function ``build_payment_paid_message`` (DB trigger).
    Keep this mirror in sync with 2026-07-04-zalo-payment-paid-format-v2.sql.

    Returns ``{"message": ..., "canonical_team_code": ...}``.
    """
    ctx = f"payment id={payment_data.get('id', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}

    customer = _first_nonempty(payment_data.get("customer_name"), default="?")
    child_name = _first_nonempty(payment_data.get("child_name"))
    phone_fmt = format_phone_intl(
        payment_data.get("phone"), payment_data.get("country")
    )
    phone = phone_fmt if phone_fmt else "chưa cung cấp"

    amount_raw = payment_data.get("amount")
    if amount_raw is None:
        logger.warning("Missing amount in payment_data (%s)", ctx)
        amount_raw = 0
    try:
        amount_int = int(amount_raw)
    except (TypeError, ValueError):
        amount_int = 0
    amount = f"{amount_int:,} VND"

    method_raw = str(payment_data.get("method") or "").strip().lower()
    if method_raw == "qr":
        method_label = "Chuyển khoản QR"
    elif method_raw == "cash":
        method_label = "Tiền mặt"
    elif method_raw == "card":
        method_label = "Thẻ"
    elif method_raw == "installment":
        platform = str(payment_data.get("installment_platform") or "").strip()
        method_label = f"Trả góp {platform}" if platform else "Trả góp"
    else:
        method_label = "?"

    sale_name = _first_nonempty(
        sale_info.get("display_name"),
        sale_info.get("crm_name"),
        sale_info.get("email"),
        default="?",
    )
    paid_at = payment_data.get("paid_at")
    time_str = _format_datetime_vn(paid_at)
    if time_str == "N/A":
        time_str = "?"
    else:
        # SQL format = "HH:MM DD/MM/YYYY" — reverse Python's "DD/MM/YYYY HH:MM"
        parts = time_str.split(" ")
        if len(parts) == 2:
            time_str = f"{parts[1]} {parts[0]}"

    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)
    team_display = str(raw_team).strip() if raw_team and str(raw_team).strip() else "?"

    header = f"💰 ĐÃ VÀO - KH {customer}"
    if child_name:
        header += f" - Bé {child_name}"
    # ZWSP (U+200B) after phone breaks Zalo Web phone-hyperlink auto-detection
    # which otherwise swallows trailing newline (dính dòng bug 4/7)
    header += f" - ĐT: {phone}​"

    message = (
        f"{header}\n"
        f"🔸 Sale {sale_name} · Team {team_display}\n"
        f"🔸 Số tiền: {amount} lúc {time_str} - {method_label}"
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

    pending_courses: list[dict[str, str]] = reminder_data.get("pending_courses") or []

    if pending_courses:
        display = pending_courses[:3]
        parts = [f"{c.get('code', '?')} · {c.get('name', '(chưa có tên)')}" for c in display]
        courses_line = f"Gói: {courses_activated}/{courses_total} — Còn: {', '.join(parts)}"
        remainder = len(pending_courses) - 3
        if remainder > 0:
            courses_line += f" ... (+{remainder} gói khác)"
    else:
        courses_line = f"Gói: {courses_activated}/{courses_total}"

    lines = [
        "⚡ Cần kích hoạt khóa học GẤP",
        f"{pr_code} · {customer}",
        courses_line,
        f"Sale nhắc: {sale_name}",
    ]
    if note and str(note).strip():
        lines.append(f"Note: {str(note).strip()}")

    return {"message": "\n".join(lines), "canonical_team_code": canonical_team}


def build_course_activated_message(
    req_data: dict[str, Any],
    sale_info: dict[str, Any],
    *,
    pr_data: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Build the COURSE ACTIVATED notification message.

    **NOTE**: The SQL function ``build_course_activated_message`` in the DB
    trigger is the *live path* — this Python mirror must produce the exact
    same format.  Keep them in sync whenever either is changed.

    Format (enriched)::

        ✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC
        KH: {customer} · Sale {sale_name} · Team {team}
        SĐT: {phone} · UID: {uid1, uid2…}
        Gói: {danh sách tên gói}

    Returns ``{"message": ..., "canonical_team_code": ...}``.
    """
    ctx = f"active_request id={req_data.get('id', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}
    if pr_data is None:
        pr_data = {}

    customer = _first_nonempty(
        req_data.get("customer_name"),
        pr_data.get("name"),
        default="?",
    )
    sale_name = _first_nonempty(
        sale_info.get("display_name"),
        sale_info.get("crm_name"),
        default="?",
    )

    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)
    team_display = str(raw_team).strip() if raw_team and str(raw_team).strip() else "?"

    pr_phone = _first_nonempty(pr_data.get("phone"))

    # --- Extract phones, UIDs, course names from uids_data ---
    uids_data = req_data.get("uids_data")
    uid_blocks = uids_data if isinstance(uids_data, list) else []

    phones: list[str] = []
    uids: list[str] = []
    courses_list: list[str] = []

    for uid_block in uid_blocks:
        if not isinstance(uid_block, dict):
            continue
        phone = _first_nonempty(uid_block.get("phone"), pr_phone, default="?")
        phones.append(phone)
        uid = _first_nonempty(uid_block.get("uid"), default="?")
        uids.append(uid)

        courses = uid_block.get("courses")
        if isinstance(courses, list):
            for course in courses:
                if isinstance(course, dict):
                    courses_list.append(
                        _first_nonempty(course.get("name"), default="?")
                    )

    phones_str = ", ".join(phones) if phones else _first_nonempty(pr_phone, default="?")
    uids_str = ", ".join(uids) if uids else "?"
    courses_str = ", ".join(courses_list) if courses_list else "?"

    lines = [
        "✅ ĐÃ KÍCH HOẠT THÀNH CÔNG GÓI HỌC",
        f"KH: {customer} · Sale {sale_name} · Team {team_display}",
        f"SĐT: {phones_str} · UID: {uids_str}",
        f"Gói: {courses_str}",
    ]

    return {"message": "\n".join(lines), "canonical_team_code": canonical_team}


def build_activation_request_created_message(
    ar_data: dict[str, Any],
    pr_data: dict[str, Any],
    sale_info: dict[str, Any],
) -> dict[str, str]:
    """Build the ACTIVATION REQUEST CREATED notification message.

    Mirrors the handoff bàn giao format sale gửi tay:

        🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-0001
        SĐT: 84-772333555
        UID: 3307542974
        Thành Nam 9T, Phil 48+5 fix 2b/tuần
        Nguồn: Kho chung - Imperia
        Tổng: 8.500.000 VNĐ
        Sale: Trần Thị B · Team Inhouse 2

    Multiple UIDs in ``ar_data["uids_data"]`` produce multiple blocks
    (SĐT/UID/gói/Nguồn/Tổng), separated by a blank line, under one shared
    header/footer.  Image (bill) attachment is handled by the caller/worker,
    not part of the text message.

    Returns ``{"message": ..., "canonical_team_code": ...}``.
    """
    ctx = f"active_request id={ar_data.get('id', '?')}"

    if not sale_info:
        logger.warning("Missing sale_info for %s", ctx)
        sale_info = {}
    if not pr_data:
        logger.warning("Missing pr_data for %s", ctx)
        pr_data = {}

    ar_id = _safe_get(ar_data, "id", "?", ctx)

    child_name = _first_nonempty(
        pr_data.get("child_name"), ar_data.get("customer_name"), pr_data.get("name"),
        default="Unknown",
    )
    lead = resolve_lead_label(pr_data.get("lead_source"), pr_data.get("lead_channel"))
    pr_phone = _first_nonempty(pr_data.get("phone"))
    pr_target = pr_data.get("target")

    uids_data = ar_data.get("uids_data")
    uid_blocks = uids_data if isinstance(uids_data, list) else []
    if not uid_blocks:
        logger.warning("Missing uids_data in %s", ctx)

    blocks: list[str] = []
    for uid_block in uid_blocks:
        if not isinstance(uid_block, dict):
            continue
        phone_country = _first_nonempty(uid_block.get("country"), pr_data.get("country"))
        phone_fmt = format_phone_intl(
            _first_nonempty(uid_block.get("phone"), pr_phone), phone_country or None
        )
        phone = phone_fmt if phone_fmt else "?"
        uid = _first_nonempty(uid_block.get("uid"), default="?")

        courses = uid_block.get("courses")
        courses = courses if isinstance(courses, list) else []

        course_lines: list[str] = []
        total = 0.0
        has_amount = False
        for course in courses:
            if not isinstance(course, dict):
                continue
            course_name = _first_nonempty(course.get("name"), default="(chưa có tên gói)")
            course_lines.append(f"{child_name}, {course_name}")
            amount = course.get("amount")
            if amount not in (None, ""):
                try:
                    total += float(amount)
                    has_amount = True
                except (TypeError, ValueError):
                    logger.warning("Invalid course amount %r in %s", amount, ctx)
        if not course_lines:
            course_lines = [child_name]
        if not has_amount:
            total = float(pr_target) if pr_target not in (None, "") else 0.0

        blocks.append(
            "\n".join(
                [
                    f"SĐT: {phone}​",
                    f"UID: {uid}",
                    *course_lines,
                    f"Nguồn: {lead}",
                    f"Tổng: {_format_vnd_dots(total)}",
                ]
            )
        )

    if not blocks:
        blocks.append(
            "\n".join(
                [
                    f"SĐT: {format_phone_intl(pr_phone, pr_data.get('country')) or '?'}​",
                    "UID: ?",
                    child_name,
                    f"Nguồn: {lead}",
                    f"Tổng: {_format_vnd_dots(pr_target or 0)}",
                ]
            )
        )

    sale_name = _safe_get(sale_info, "display_name", sale_info.get("crm_name") or "Unknown", ctx)
    raw_team = sale_info.get("team")
    canonical_team = get_canonical_team(raw_team)
    team_display = str(raw_team).strip() if raw_team and str(raw_team).strip() else "?"

    header = f"🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — {ar_id}"
    footer = f"Sale: {sale_name} · Team {team_display}"
    message = header + "\n" + "\n\n".join(blocks) + "\n" + footer

    return {"message": message, "canonical_team_code": canonical_team}
