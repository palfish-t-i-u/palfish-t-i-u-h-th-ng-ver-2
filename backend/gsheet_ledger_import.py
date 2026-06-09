"""Import Sổ doanh thu từ Google Sheet All File Thu Hiền (HCM REV + SM Hanoi)."""

from __future__ import annotations

import hashlib
import os
import re
import time
from datetime import date, datetime, timedelta, timezone
from datetime import time as dt_time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable

from revenue_routes import team_to_pivot_label, vnd_to_rmb

DEFAULT_SPREADSHEET_ID = "1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc"
DEFAULT_SHEET_TABS = ("SM Hanoi", "HCM REV")
DEFAULT_TY_GIA = Decimal("3700")
GSHEET_SCOPES = ("https://www.googleapis.com/auth/spreadsheets.readonly",)

TEAM_FROM_EXCEL: dict[str, str] = {
    "In-house": "Inhouse 1",
    "In-house 2": "Inhouse 2",
    "HCM team": "HCM (Online)",
    "Linh Dam": "Linh Dam (Store)",
    "Linh Dam Store": "Linh Dam (Store)",
    "Offline": "Offline",
    "An Binh": "An Binh (Store)",
    "An Binh Store": "An Binh (Store)",
}

# SM Hanoi column AH — TEAM per row (GMV tab COUNTIFS); not current sale roster.
SM_HANOI_COL_TEAM = 33

DEFAULT_TEAM_BY_TAB: dict[str, str] = {
    "SM Hanoi": "Inhouse 1",
    "HCM REV": "HCM (Online)",
}

MAP_PROGRESS_EVERY = 2000
INSERT_BATCH = 50
INSERT_PAUSE_SEC = 0.05
SUPABASE_MAX_ATTEMPTS = 5


def _log(msg: str) -> None:
    print(msg, flush=True)


def _is_retryable_supabase_error(exc: BaseException) -> bool:
    name = type(exc).__name__
    if name in (
        "RemoteProtocolError",
        "ReadTimeout",
        "ConnectTimeout",
        "ConnectError",
        "NetworkError",
        "WriteError",
        "PoolTimeout",
    ):
        return True
    msg = str(exc)
    return any(
        token in msg
        for token in (
            "ConnectionTerminated",
            "connection reset",
            "Connection reset",
            "Server disconnected",
            "Broken pipe",
            "503",
            "502",
            "504",
        )
    )


def _execute_supabase(
    fn: Callable[[], Any],
    *,
    log: Callable[[str], None] = _log,
    label: str = "Supabase",
) -> Any:
    last: BaseException | None = None
    for attempt in range(1, SUPABASE_MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            last = exc
            if not _is_retryable_supabase_error(exc) or attempt >= SUPABASE_MAX_ATTEMPTS:
                raise
            wait = min(2**attempt, 30)
            log(f"  {label} tạm lỗi ({exc}) — retry {attempt}/{SUPABASE_MAX_ATTEMPTS} sau {wait}s…")
            time.sleep(wait)
    assert last is not None
    raise last


class TeamLookupCache:
    """Load nhan_su_sale once — tránh query Supabase từng dòng khi map."""

    def __init__(self, sb) -> None:
        self._by_sale: dict[str, str] = {}
        self._load(sb)

    def _load(self, sb) -> None:
        offset = 0
        while True:
            res = _execute_supabase(
                lambda off=offset: (
                    sb.table("nhan_su_sale")
                    .select("crm_name, team")
                    .eq("is_active", True)
                    .range(off, off + 999)
                    .execute()
                ),
                label="Load nhan_su_sale",
            )
            chunk = res.data or []
            if not chunk:
                break
            for row in chunk:
                name = (row.get("crm_name") or "").strip()
                team = (row.get("team") or "").strip()
                if name and team:
                    self._by_sale[name] = team
            if len(chunk) < 1000:
                break
            offset += 1000

    @property
    def size(self) -> int:
        return len(self._by_sale)

    def team_for_sale(self, sale_name: str | None) -> str:
        if not sale_name:
            return ""
        return self._by_sale.get(sale_name.strip(), "")


def _cell(row: list[Any], idx: int) -> Any:
    if idx < 0 or idx >= len(row):
        return None
    val = row[idx]
    if val is None or val == "":
        return None
    if isinstance(val, float) and val != val:
        return None
    return val


def _serial_to_date(serial: int | float) -> date | None:
    """Google Sheets serial number → date (epoch 1899-12-30)."""
    from datetime import timedelta
    n = int(serial)
    if 1 <= n <= 100000:
        return date(1899, 12, 30) + timedelta(days=n)
    return None


def _parse_date(value: Any) -> date | None:
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
        return datetime.combine(value, dt_time.min)
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 40000:
        from datetime import timedelta
        d = _serial_to_date(int(value))
        if d:
            frac = value - int(value)
            total_sec = int(round(frac * 86400))
            h, rem = divmod(total_sec, 3600)
            mi, sec = divmod(rem, 60)
            return datetime.combine(d, dt_time(h, mi, sec))
    d = _parse_date(value)
    if d:
        return datetime.combine(d, dt_time.min)
    if fallback_day:
        return datetime.combine(fallback_day, dt_time.min)
    return None


def _parse_time(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, dt_time):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.time().isoformat()
    if isinstance(value, float) and not isinstance(value, bool) and 0 < value < 1:
        total_sec = int(round(value * 86400))
        h, rem = divmod(total_sec, 3600)
        mi, sec = divmod(rem, 60)
        return f"{h:02d}:{mi:02d}:{sec:02d}"
    s = str(value).strip()
    if not s:
        return None
    # Google Sheet typo: "13;36" → "13:36"
    s = s.replace(";", ":")
    # Chỉ giữ phần HH:MM hoặc HH:MM:SS hợp lệ
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?", s)
    if m:
        h, mi, sec = int(m.group(1)), int(m.group(2)), m.group(3)
        if sec is not None:
            return f"{h:02d}:{mi:02d}:{int(sec):02d}"
        return f"{h:02d}:{mi:02d}"
    return None


def _parse_sheet_number(value: Any) -> float | None:
    """Parse số từ Google Sheet — hỗ trợ VN `4.978.000`, US `4,978,000`, số thuần."""
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(" ", "")
    if not s:
        return None
    # VN thousand sep: 4.978.000 / 38.400.000
    if s.count(".") > 1:
        s = s.replace(".", "")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _to_int_vnd(value: Any) -> int:
    n = _parse_sheet_number(value)
    if n is None or n <= 0:
        return 0
    return int(n)


def _to_float_gmv(value: Any) -> float | None:
    n = _parse_sheet_number(value)
    if n is None or n <= 0:
        return None
    return round(n, 2)


def _normalize_uid(value: Any) -> str | None:
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


def _gmv_from_vnd(vnd: int, gmv_hint: float | None) -> float:
    """Convert VND → RMB, with locale-error detection on gmv_hint from sheet.

    All File Thu Hiền (Google Sheet) sometimes has corrupted GMV values due to
    locale mismatch: DingTalk uses dot as thousand separator (4.978 = 4978 RMB)
    but Google Sheet interprets it as decimal (4.978 ≈ 5 RMB).  This typically
    produces values ~1000× too small.

    Three-tier detection:
      ratio < 0.01  → certain locale error (>100×)  → auto-fix from VND
      ratio < 0.10  → grey zone (10×–100×)          → auto-fix + log warning
      ratio ≥ 0.10  → plausible (discount / custom rate) → keep sheet value
    """
    if not vnd:
        return round(gmv_hint, 2) if (gmv_hint and gmv_hint > 0) else 0.0

    expected = float(vnd) / float(DEFAULT_TY_GIA)

    if not gmv_hint or gmv_hint <= 0:
        return round(expected, 2)

    if expected <= 0:
        return round(gmv_hint, 2)

    ratio = gmv_hint / expected

    if ratio < 0.01:
        # Certain locale error (>100× off) — silently auto-correct
        return round(expected, 2)

    if ratio < 0.10:
        # Grey zone (10×–100× off) — auto-correct + warn operator
        _log(
            f"⚠️ GMV locale fix: sheet={gmv_hint:.2f}, expected={expected:.2f}, "
            f"VND={vnd}, ratio={ratio:.4f} — using calculated value"
        )
        return round(expected, 2)

    # Plausible value (discount, custom rate, etc.) — keep sheet value
    return round(gmv_hint, 2)


TAB_TEAM_OVERRIDE = frozenset({"HCM REV"})


def _resolve_team_fields(
    team_cache: TeamLookupCache,
    *,
    tab: str,
    sale_name: str | None,
    excel_team: str | None = None,
) -> tuple[str | None, str | None]:
    """Team for gsheet import.

    HCM REV: tab default always wins (all rows are HCM revenue).
    SM Hanoi: column AH (TEAM) on sheet wins — historical team per row, not sale roster.
    """
    raw = (excel_team or "").strip()
    if raw:
        app_team = TEAM_FROM_EXCEL.get(raw, raw)
        return app_team, team_to_pivot_label(app_team)
    if tab in TAB_TEAM_OVERRIDE:
        tab_default = DEFAULT_TEAM_BY_TAB.get(tab)
        if tab_default:
            return tab_default, team_to_pivot_label(tab_default)
    resolved = team_cache.team_for_sale(sale_name)
    if resolved:
        return resolved, team_to_pivot_label(resolved)
    fallback = DEFAULT_TEAM_BY_TAB.get(tab)
    if fallback:
        return fallback, team_to_pivot_label(fallback)
    return None, None


def _fp_clean(val: Any) -> str:
    if val is None or val == "":
        return ""
    s = str(val).strip()
    return "" if s.lower() == "nan" else s


def row_fingerprint(payload: dict[str, Any]) -> str:
    parts = [
        _fp_clean(payload.get("uid")),
        str(payload.get("pay_time") or "")[:10],
        str(payload.get("so_tien_vnd") or 0),
        _fp_clean(payload.get("sale_crm_name")).lower(),
        _fp_clean(payload.get("sdt")),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:32]


def map_hcm_rev_row(team_cache: TeamLookupCache, row: list[Any], *, tab: str = "HCM REV") -> dict[str, Any] | None:
    vnd = _to_int_vnd(_cell(row, 9))
    if vnd <= 0:
        return None
    bank_day = _parse_date(_cell(row, 0))
    pay_time = _parse_pay_time(_cell(row, 8), bank_day)
    ngay = bank_day or (pay_time.date() if pay_time else _parse_date(_cell(row, 15)))
    if not ngay:
        return None
    sale = str(_cell(row, 13) or "").strip() or None
    team, pivot = _resolve_team_fields(team_cache, tab=tab, sale_name=sale)
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


def map_sm_hanoi_row(team_cache: TeamLookupCache, row: list[Any], *, tab: str = "SM Hanoi") -> dict[str, Any] | None:
    vnd = _to_int_vnd(_cell(row, 10))
    if vnd <= 0:
        return None
    bank_day = _parse_date(_cell(row, 0))
    pay_time = _parse_pay_time(_cell(row, 8), bank_day)
    ngay = bank_day or (pay_time.date() if pay_time else None)
    if not ngay:
        return None
    sale = str(_cell(row, 21) or "").strip() or None
    excel_team = str(_cell(row, SM_HANOI_COL_TEAM) or "").strip() or None
    team, pivot = _resolve_team_fields(
        team_cache, tab=tab, sale_name=sale, excel_team=excel_team
    )
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


def map_tab_row(team_cache: TeamLookupCache, tab: str, row: list[Any]) -> dict[str, Any] | None:
    if tab == "SM Hanoi":
        return map_sm_hanoi_row(team_cache, row, tab=tab)
    if tab == "HCM REV":
        return map_hcm_rev_row(team_cache, row, tab=tab)
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
    # SM Hanoi tới AH (TEAM + Sales); HCM REV tới P
    col_end = "AH" if tab == "SM Hanoi" else "P"
    rng = f"'{tab}'!A:{col_end}"
    result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=rng,
        valueRenderOption='UNFORMATTED_VALUE',
        dateTimeRenderOption='SERIAL_NUMBER',
    ).execute()
    return result.get("values") or []


def collect_payloads_from_gsheet(
    team_cache: TeamLookupCache,
    *,
    spreadsheet_id: str,
    tabs: tuple[str, ...] = DEFAULT_SHEET_TABS,
    credentials_path: str | None = None,
    limit: int = 0,
    log: Callable[[str], None] = _log,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for tab in tabs:
        log(f"  Tải Google Sheet tab «{tab}»…")
        rows = fetch_gsheet_tab_values(
            spreadsheet_id=spreadsheet_id,
            tab=tab,
            credentials_path=credentials_path,
        )
        data_rows = max(len(rows) - 1, 0)
        log(f"  «{tab}»: {len(rows)} dòng ({data_rows} data) — đang map…")
        mapped = 0
        for i, row in enumerate(rows):
            if i == 0:
                continue  # header
            payload = map_tab_row(team_cache, tab, row)
            if not payload:
                continue
            fp = row_fingerprint(payload)
            if fp in seen:
                continue
            seen.add(fp)
            out.append(payload)
            mapped += 1
            if mapped % MAP_PROGRESS_EVERY == 0:
                log(f"  «{tab}»: đã map {mapped} dòng hợp lệ…")
            if limit and len(out) >= limit:
                log(f"  Dừng sớm — limit {limit}")
                return out
        log(f"  «{tab}»: xong — {mapped} dòng hợp lệ")
    return out


def _load_existing_import_fingerprints(sb, *, log: Callable[[str], None] = _log) -> set[str]:
    fps: set[str] = set()
    offset = 0
    while True:
        res = _execute_supabase(
            lambda off=offset: (
                sb.table("so_doanh_thu")
                .select("uid, pay_time, so_tien_vnd, sale_crm_name, sdt")
                .range(off, off + 999)
                .execute()
            ),
            log=log,
            label="Load ledger fingerprint",
        )
        chunk = res.data or []
        if not chunk:
            break
        for r in chunk:
            fps.add(row_fingerprint(r))
        if len(chunk) < 1000:
            break
        offset += 1000
    log(f"  Đã có {len(fps)} fingerprint trong Sổ")
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
    log: Callable[[str], None] = _log,
    sb_factory: Callable[[], Any] | None = None,
) -> dict[str, Any]:
    sid = (spreadsheet_id or os.environ.get("GOOGLE_SHEETS_ID") or DEFAULT_SPREADSHEET_ID).strip()
    log("Load team cache (nhan_su_sale)…")
    team_cache = TeamLookupCache(sb)
    log(f"  {team_cache.size} sale → team")

    log("Map dữ liệu từ Google Sheet…")
    payloads = collect_payloads_from_gsheet(
        team_cache,
        spreadsheet_id=sid,
        tabs=tabs,
        credentials_path=credentials_path,
        limit=limit,
        log=log,
    )
    log(f"Tổng {len(payloads)} dòng unique sau map")

    log("Kiểm tra dòng đã import…")
    existing = _load_existing_import_fingerprints(sb, log=log)

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
        base_ts = datetime.now(timezone.utc)
        for idx, p in enumerate(to_insert):
            p["created_at"] = (base_ts + timedelta(milliseconds=idx)).isoformat()
        log(f"Insert {len(to_insert)} dòng mới (batch {INSERT_BATCH})…")
        client = sb
        for i in range(0, len(to_insert), INSERT_BATCH):
            chunk = to_insert[i : i + INSERT_BATCH]
            try:
                _execute_supabase(
                    lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                    log=log,
                    label="Insert batch",
                )
            except Exception:
                if sb_factory:
                    log("  Tạo lại Supabase client sau lỗi kết nối…")
                    client = sb_factory()
                    _execute_supabase(
                        lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                        log=log,
                        label="Insert batch (client mới)",
                    )
                else:
                    raise
            inserted += len(chunk)
            log(f"  inserted {inserted}/{len(to_insert)}")
            if INSERT_PAUSE_SEC and i + INSERT_BATCH < len(to_insert):
                time.sleep(INSERT_PAUSE_SEC)
    elif dry_run:
        log(f"Dry-run — sẽ insert {len(to_insert)} dòng (skip {skipped} đã có)")
    else:
        log(f"Không có dòng mới (skip {skipped} đã có)")

    return {
        "spreadsheetId": sid,
        "tabs": list(tabs),
        "fetched": len(payloads),
        "skippedExisting": skipped,
        "inserted": inserted if not dry_run else 0,
        "dryRun": dry_run,
        "samples": payloads[:3],
    }
