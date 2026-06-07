"""Pure Google Sheet row parsers (no FastAPI / revenue_routes deps)."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from datetime import time as dt_time
from decimal import Decimal
from typing import Any

DEFAULT_TY_GIA = Decimal("3700")
SM_HANOI_COL_TEAM = 33


def cell(row: list[Any], idx: int) -> Any:
    if idx < 0 or idx >= len(row):
        return None
    val = row[idx]
    if val is None or val == "":
        return None
    if isinstance(val, float) and val != val:
        return None
    return val


def _serial_to_date(serial: int | float) -> date | None:
    n = int(serial)
    if 1 <= n <= 100000:
        return date(1899, 12, 30) + timedelta(days=n)
    return None


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool) and 40000 < value < 60000:
        return _serial_to_date(value)
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    m = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def parse_pay_time(value: Any, fallback_day: date | None) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, dt_time.min)
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 40000:
        d = _serial_to_date(int(value))
        if d:
            frac = value - int(value)
            total_sec = int(round(frac * 86400))
            h, rem = divmod(total_sec, 3600)
            mi, sec = divmod(rem, 60)
            return datetime.combine(d, dt_time(h, mi, sec))
    d = parse_date(value)
    if d:
        return datetime.combine(d, dt_time.min)
    if fallback_day:
        return datetime.combine(fallback_day, dt_time.min)
    return None


def parse_sheet_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(" ", "")
    if not s:
        return None
    if s.count(".") > 1:
        s = s.replace(".", "")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def to_int_vnd(value: Any) -> int:
    n = parse_sheet_number(value)
    if n is None or n <= 0:
        return 0
    return int(n)


def to_float_gmv(value: Any) -> float | None:
    n = parse_sheet_number(value)
    if n is None or n <= 0:
        return None
    return round(n, 2)


def normalize_uid(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, (int, float)):
        return str(int(value))
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    return s or None


def gmv_from_vnd(vnd: int, gmv_hint: float | None) -> float:
    if not vnd:
        return round(gmv_hint, 2) if (gmv_hint and gmv_hint > 0) else 0.0
    expected = float(vnd) / float(DEFAULT_TY_GIA)
    if not gmv_hint or gmv_hint <= 0:
        return round(expected, 2)
    if expected <= 0:
        return round(gmv_hint, 2)
    ratio = gmv_hint / expected
    if ratio < 0.10:
        return round(expected, 2)
    return round(gmv_hint, 2)


def parse_hcm_rev_row(row: list[Any]) -> dict[str, Any] | None:
    """Column map verified in gsheet_ledger_import.map_hcm_rev_row."""
    vnd = to_int_vnd(cell(row, 9))
    if vnd <= 0:
        return None
    bank_day = parse_date(cell(row, 0))
    pay_time = parse_pay_time(cell(row, 8), bank_day)
    if not pay_time:
        return None
    uid = normalize_uid(cell(row, 5))
    if not uid:
        return None
    gmv_hint = to_float_gmv(cell(row, 10))
    return {
        "uid": uid,
        "pay_time": pay_time,
        "bank_day": (bank_day or pay_time.date()).isoformat(),
        "real_pay_vnd": vnd,
        "gmv_rmb": gmv_from_vnd(vnd, gmv_hint),
        "team": "HCM",
        "sale_name": str(cell(row, 13) or "").strip() or "Unknown",
        "package_name": str(cell(row, 6) or "").strip() or None,
        "fixed": str(cell(row, 7) or "").strip() or None,
        "channel_type_raw": str(cell(row, 12) or "").strip() or None,
        "payment_seq": str(cell(row, 11) or "").strip() or None,
        "note": str(cell(row, 14) or "").strip() or None,
        "customer_name": str(cell(row, 3) or "").strip() or None,
        "customer_phone": str(cell(row, 4) or "").strip() or None,
    }


def normalize_channel_code(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        n = int(value)
        return str(n)
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    return s or None


# Danang REV — verified from All File Thu Hiền.xlsx (49 data rows, 19 cols)
DANANG_COLUMN_MAP: dict[str, int] = {
    "bank_day": 0,
    "user_name": 3,
    "phone": 4,
    "uid": 5,
    "package": 6,
    "fixed": 7,
    "pay_time": 8,
    "real_pay_vnd": 9,
    "gmv_rmb": 10,
    "payment_seq": 12,
    "type": 13,
    "channel_code": 14,
    "sales": 15,
    "note": 16,
}


def parse_danang_row(row: list[Any]) -> dict[str, Any] | None:
    """Danang REV — no TEAM column; team defaults to Danang (historical)."""
    m = DANANG_COLUMN_MAP
    vnd = to_int_vnd(cell(row, m["real_pay_vnd"]))
    if vnd <= 0:
        return None
    bank_day = parse_date(cell(row, m["bank_day"]))
    pay_time = parse_pay_time(cell(row, m["pay_time"]), bank_day)
    if not pay_time:
        return None
    uid = normalize_uid(cell(row, m["uid"]))
    if not uid:
        return None
    gmv_hint = to_float_gmv(cell(row, m["gmv_rmb"]))
    return {
        "uid": uid,
        "pay_time": pay_time,
        "bank_day": (bank_day or pay_time.date()).isoformat(),
        "real_pay_vnd": vnd,
        "gmv_rmb": gmv_from_vnd(vnd, gmv_hint),
        "team": "Danang",
        "sale_name": str(cell(row, m["sales"]) or "").strip() or "Unknown",
        "package_name": str(cell(row, m["package"]) or "").strip() or None,
        "fixed": str(cell(row, m["fixed"]) or "").strip() or None,
        "channel_type_raw": str(cell(row, m["type"]) or "").strip() or None,
        "channel_code": normalize_channel_code(cell(row, m["channel_code"])),
        "payment_seq": str(cell(row, m["payment_seq"]) or "").strip() or None,
        "note": str(cell(row, m["note"]) or "").strip() or None,
        "customer_name": str(cell(row, m["user_name"]) or "").strip() or None,
        "customer_phone": str(cell(row, m["phone"]) or "").strip() or None,
    }


def parse_sm_hanoi_row(row: list[Any]) -> dict[str, Any] | None:
    """Column map verified in gsheet_ledger_import.map_sm_hanoi_row."""
    vnd = to_int_vnd(cell(row, 10))
    if vnd <= 0:
        return None
    bank_day = parse_date(cell(row, 0))
    pay_time = parse_pay_time(cell(row, 8), bank_day)
    if not pay_time:
        return None
    uid = normalize_uid(cell(row, 5))
    if not uid:
        return None
    gmv_hint = to_float_gmv(cell(row, 11))
    team_raw = str(cell(row, SM_HANOI_COL_TEAM) or "").strip() or "In-house"
    return {
        "uid": uid,
        "pay_time": pay_time,
        "bank_day": (bank_day or pay_time.date()).isoformat(),
        "real_pay_vnd": vnd,
        "gmv_rmb": gmv_from_vnd(vnd, gmv_hint),
        "team": team_raw,
        "sale_name": str(cell(row, 21) or "").strip() or "Unknown",
        "package_name": str(cell(row, 6) or "").strip() or None,
        "fixed": str(cell(row, 7) or "").strip() or None,
        "channel_type_raw": str(cell(row, 14) or "").strip() or None,
        "payment_seq": str(cell(row, 13) or "").strip() or None,
        "note": None,
        "customer_name": str(cell(row, 3) or "").strip() or None,
        "customer_phone": str(cell(row, 4) or "").strip() or None,
    }
