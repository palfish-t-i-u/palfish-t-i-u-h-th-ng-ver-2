"""Import Sổ doanh thu từ Google Sheet All File Thu Hiền (HCM REV + SM Hanoi)."""

from __future__ import annotations

import hashlib
import os
import re
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from revenue_routes import _resolve_team, team_to_pivot_label, vnd_to_rmb

DEFAULT_SPREADSHEET_ID = "1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc"
DEFAULT_SHEET_TABS = ("SM Hanoi", "HCM REV")
DEFAULT_TY_GIA = Decimal("3700")
GSHEET_SCOPES = ("https://www.googleapis.com/auth/spreadsheets.readonly",)

TEAM_FROM_EXCEL: dict[str, str] = {
    "In-house": "Inhouse 1",
    "In-house 2": "Inhouse 2",
    "HCM team": "HCM (Online)",
    "Linh Dam": "Linh Dam (Store)",
    "Offline": "Offline",
    "An Binh": "An Binh (Store)",
}

DEFAULT_TEAM_BY_TAB: dict[str, str] = {
    "SM Hanoi": "Inhouse 1",
    "HCM REV": "HCM (Online)",
}


def _cell(row: list[Any], idx: int) -> Any:
    if idx < 0 or idx >= len(row):
        return None
    val = row[idx]
    if val is None or val == "":
        return None
    return val


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    # Google Sheets sometimes returns YYYY/M/D without zero pad — try flexible
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


def _parse_pay_time(value: Any, fallback_day: date | None) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    d = _parse_date(value)
    if d:
        return datetime.combine(d, time.min)
    if fallback_day:
        return datetime.combine(fallback_day, time.min)
    return None


def _parse_time(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.time().isoformat()
    s = str(value).strip()
    return s or None


def _to_int_vnd(value: Any) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(float(str(value).replace(",", "").strip()))
    except ValueError:
        return 0


def _to_float_gmv(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _normalize_uid(value: Any) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return str(int(value))
    s = str(value).strip()
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    return s or None


def _gmv_from_vnd(vnd: int, gmv_hint: float | None) -> float:
    if gmv_hint and gmv_hint > 0:
        return round(gmv_hint, 2)
    if not vnd:
        return 0.0
    return vnd_to_rmb(vnd, DEFAULT_TY_GIA)


def _resolve_team_fields(
    sb,
    *,
    tab: str,
    sale_name: str | None,
    excel_team: str | None = None,
) -> tuple[str | None, str | None]:
    raw = (excel_team or "").strip()
    if raw:
        app_team = TEAM_FROM_EXCEL.get(raw, raw)
        return app_team, team_to_pivot_label(app_team)
    resolved = (_resolve_team(sb, sale_name, None) or "").strip()
    if resolved:
        return resolved, team_to_pivot_label(resolved)
    fallback = DEFAULT_TEAM_BY_TAB.get(tab)
    if fallback:
        return fallback, team_to_pivot_label(fallback)
    return None, None


def row_fingerprint(payload: dict[str, Any]) -> str:
    parts = [
        str(payload.get("uid") or ""),
        str(payload.get("pay_time") or "")[:10],
        str(payload.get("so_tien_vnd") or 0),
        str(payload.get("sale_crm_name") or "").strip().lower(),
        str(payload.get("sdt") or "").strip(),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]


def map_hcm_rev_row(sb, row: list[Any], *, tab: str = "HCM REV") -> dict[str, Any] | None:
    vnd = _to_int_vnd(_cell(row, 9))
    if vnd <= 0:
        return None
    bank_day = _parse_date(_cell(row, 0))
    pay_time = _parse_pay_time(_cell(row, 8), bank_day)
    ngay = bank_day or (pay_time.date() if pay_time else _parse_date(_cell(row, 15)))
    if not ngay:
        return None
    sale = str(_cell(row, 13) or "").strip() or None
    team, pivot = _resolve_team_fields(sb, tab=tab, sale_name=sale)
    gmv_hint = _to_float_gmv(_cell(row, 10))
    uid = _normalize_uid(_cell(row, 5))
    return {
        "ngay_tien_ve": ngay.isoformat(),
        "bank_time": _parse_time(_cell(row, 1)),
        "gateway": str(_cell(row, 2) or "").strip() or None,
        "ten_khach": str(_cell(row, 3) or "").strip(),
        "sdt": str(_cell(row, 4) or "").strip() or None,
        "uid": uid,
        "goi_hoc": str(_cell(row, 6) or "").strip() or None,
        "fixed_non_fixed": str(_cell(row, 7) or "").strip() or None,
        "pay_time": pay_time.isoformat() if pay_time else None,
        "so_tien_vnd": vnd,
        "gmv_rmb": _gmv_from_vnd(vnd, gmv_hint),
        "ty_gia_vnd_rmb": float(DEFAULT_TY_GIA),
        "payment_method": str(_cell(row, 11) or "").strip() or None,
        "loai": str(_cell(row, 12) or "").strip() or None,
        "loai_2": None,
        "sale_crm_name": sale,
        "note": str(_cell(row, 14) or "").strip() or None,
        "note2": None,
        "team": team,
        "team_pivot_label": pivot,
        "loai_nhap": "tay",
        "created_by_email": f"import:gsheet:{tab}",
        "updated_by_email": f"import:gsheet:{tab}",
    }


def map_sm_hanoi_row(sb, row: list[Any], *, tab: str = "SM Hanoi") -> dict[str, Any] | None:
    vnd = _to_int_vnd(_cell(row, 10))
    if vnd <= 0:
        return None
    bank_day = _parse_date(_cell(row, 0))
    pay_time = _parse_pay_time(_cell(row, 8), bank_day)
    ngay = bank_day or (pay_time.date() if pay_time else None)
    if not ngay:
        return None
    sale = str(_cell(row, 21) or "").strip() or None
    team, pivot = _resolve_team_fields(sb, tab=tab, sale_name=sale)
    gmv_hint = _to_float_gmv(_cell(row, 11))
    uid = _normalize_uid(_cell(row, 5))
    return {
        "ngay_tien_ve": ngay.isoformat(),
        "bank_time": _parse_time(_cell(row, 1)),
        "gateway": str(_cell(row, 2) or "").strip() or None,
        "ten_khach": str(_cell(row, 3) or "").strip(),
        "sdt": str(_cell(row, 4) or "").strip() or None,
        "uid": uid,
        "goi_hoc": str(_cell(row, 6) or "").strip() or None,
        "fixed_non_fixed": str(_cell(row, 7) or "").strip() or None,
        "pay_time": pay_time.isoformat() if pay_time else None,
        "so_tien_vnd": vnd,
        "gmv_rmb": _gmv_from_vnd(vnd, gmv_hint),
        "ty_gia_vnd_rmb": float(DEFAULT_TY_GIA),
        "payment_method": str(_cell(row, 13) or "").strip() or None,
        "loai": str(_cell(row, 14) or "").strip() or None,
        "loai_2": None,
        "sale_crm_name": sale,
        "note": None,
        "note2": None,
        "team": team,
        "team_pivot_label": pivot,
        "loai_nhap": "tay",
        "created_by_email": f"import:gsheet:{tab}",
        "updated_by_email": f"import:gsheet:{tab}",
    }


def map_tab_row(sb, tab: str, row: list[Any]) -> dict[str, Any] | None:
    if tab == "SM Hanoi":
        return map_sm_hanoi_row(sb, row, tab=tab)
    if tab == "HCM REV":
        return map_hcm_rev_row(sb, row, tab=tab)
    raise ValueError(f"Tab không hỗ trợ: {tab}")


def fetch_gsheet_tab_values(
    *,
    spreadsheet_id: str,
    tab: str,
    credentials_path: str | None = None,
) -> list[list[Any]]:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    path = (credentials_path or os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")).strip().strip('"').strip("'")
    if not path:
        raise FileNotFoundError(
            "Thiếu GOOGLE_SERVICE_ACCOUNT_JSON trong backend/.env (lưu file .env trước khi chạy). "
            "Xem docs/M5_GSHEET_IMPORT.md"
        )
    if not os.path.isfile(path):
        raise FileNotFoundError(
            f"Không tìm thấy file credentials: {path!r} — kiểm tra đường dẫn; "
            "nếu có dấu cách thì bọc path trong dấu ngoặc kép trong .env"
        )
    creds = service_account.Credentials.from_service_account_file(path, scopes=GSHEET_SCOPES)
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    # SM Hanoi cần tới cột V (Sales); HCM REV tới P
    col_end = "V" if tab == "SM Hanoi" else "P"
    rng = f"'{tab}'!A:{col_end}"
    result = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=rng).execute()
    return result.get("values") or []


def collect_payloads_from_gsheet(
    sb,
    *,
    spreadsheet_id: str,
    tabs: tuple[str, ...] = DEFAULT_SHEET_TABS,
    credentials_path: str | None = None,
    limit: int = 0,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tab in tabs:
        rows = fetch_gsheet_tab_values(
            spreadsheet_id=spreadsheet_id,
            tab=tab,
            credentials_path=credentials_path,
        )
        for i, row in enumerate(rows):
            if i == 0:
                continue  # header
            payload = map_tab_row(sb, tab, row)
            if not payload:
                continue
            fp = row_fingerprint(payload)
            if fp in seen:
                continue
            seen.add(fp)
            out.append(payload)
            if limit and len(out) >= limit:
                return out
    return out


def _load_existing_import_fingerprints(sb) -> set[str]:
    fps: set[str] = set()
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("uid, pay_time, so_tien_vnd, sale_crm_name, sdt")
            .like("created_by_email", "import:gsheet:%")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        for r in chunk:
            fps.add(row_fingerprint(r))
        if len(chunk) < 1000:
            break
        offset += 1000
    return fps


def sync_gsheet_to_ledger(
    sb,
    *,
    spreadsheet_id: str | None = None,
    tabs: tuple[str, ...] = DEFAULT_SHEET_TABS,
    credentials_path: str | None = None,
    limit: int = 0,
    dry_run: bool = False,
    actor_email: str = "import:gsheet",
) -> dict[str, Any]:
    sid = (spreadsheet_id or os.environ.get("GOOGLE_SHEETS_ID") or DEFAULT_SPREADSHEET_ID).strip()
    payloads = collect_payloads_from_gsheet(
        sb,
        spreadsheet_id=sid,
        tabs=tabs,
        credentials_path=credentials_path,
        limit=limit,
    )
    existing = _load_existing_import_fingerprints(sb) if not dry_run else set()
    to_insert: list[dict[str, Any]] = []
    skipped = 0
    for p in payloads:
        fp = row_fingerprint(p)
        if fp in existing:
            skipped += 1
            continue
        p["updated_by_email"] = actor_email
        if not p.get("created_by_email"):
            p["created_by_email"] = actor_email
        to_insert.append(p)

    inserted = 0
    if not dry_run and to_insert:
        batch = 100
        for i in range(0, len(to_insert), batch):
            chunk = to_insert[i : i + batch]
            sb.table("so_doanh_thu").insert(chunk).execute()
            inserted += len(chunk)

    return {
        "spreadsheetId": sid,
        "tabs": list(tabs),
        "fetched": len(payloads),
        "skippedExisting": skipped,
        "inserted": inserted if not dry_run else 0,
        "dryRun": dry_run,
        "samples": payloads[:3],
    }
