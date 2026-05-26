"""Import Sổ doanh thu từ file gốc DingTalk (xlsx) — SM INCOME + HCM REVENUE."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from gsheet_ledger_import import (
    INSERT_BATCH,
    INSERT_PAUSE_SEC,
    TeamLookupCache,
    _cell,
    _execute_supabase,
    _log,
    _parse_date,
    _parse_pay_time,
    _parse_time,
    _to_float_gmv,
    _to_int_vnd,
    map_hcm_rev_row,
    row_fingerprint,
)
from gsheet_ledger_import import (
    _gmv_from_vnd,
    _normalize_uid,
    _resolve_team_fields,
)

# SM HANOI daily report — tab INCOME (+2 cột No, Bank ID so với All File)
SM_INCOME_COL = {
    "bank_day": 2,
    "bank_time": 3,
    "gateway": 4,
    "ten": 5,
    "sdt": 6,
    "uid": 7,
    "goi": 8,
    "fixed": 9,
    "pay_time": 10,
    "vnd": 12,
    "gmv": 13,
    "payment": 15,
    "loai": 16,
    "sale": 23,
}

DEFAULT_SM_MAX_ROW = 13943
DEFAULT_HCM_MAX_ROW = 798


def map_sm_income_row(
    team_cache: TeamLookupCache,
    row: list[Any],
    *,
    source_tag: str = "import:dingtalk:SM Hanoi",
) -> dict[str, Any] | None:
    vnd = _to_int_vnd(_cell(row, SM_INCOME_COL["vnd"]))
    if vnd <= 0:
        return None
    bank_day = _parse_date(_cell(row, SM_INCOME_COL["bank_day"]))
    pay_time = _parse_pay_time(_cell(row, SM_INCOME_COL["pay_time"]), bank_day)
    ngay = bank_day or (pay_time.date() if pay_time else None)
    if not ngay:
        return None
    sale = str(_cell(row, SM_INCOME_COL["sale"]) or "").strip() or None
    team, pivot = _resolve_team_fields(team_cache, tab="SM Hanoi", sale_name=sale, excel_team=None)
    gmv_hint = _to_float_gmv(_cell(row, SM_INCOME_COL["gmv"]))
    uid = _normalize_uid(_cell(row, SM_INCOME_COL["uid"]))
    ten = str(_cell(row, SM_INCOME_COL["ten"]) or "").strip()
    return {
        "ngay_tien_ve": ngay.isoformat(),
        "bank_time": _parse_time(_cell(row, SM_INCOME_COL["bank_time"])),
        "gateway": str(_cell(row, SM_INCOME_COL["gateway"]) or "").strip() or None,
        "ten_khach": ten,
        "sdt": str(_cell(row, SM_INCOME_COL["sdt"]) or "").strip() or None,
        "uid": uid,
        "goi_hoc": str(_cell(row, SM_INCOME_COL["goi"]) or "").strip() or None,
        "fixed_non_fixed": str(_cell(row, SM_INCOME_COL["fixed"]) or "").strip() or None,
        "pay_time": pay_time.isoformat() if pay_time else None,
        "so_tien_vnd": vnd,
        "gmv_rmb": _gmv_from_vnd(vnd, gmv_hint),
        "ty_gia_vnd_rmb": 3700.0,
        "payment_method": str(_cell(row, SM_INCOME_COL["payment"]) or "").strip() or None,
        "loai": str(_cell(row, SM_INCOME_COL["loai"]) or "").strip() or None,
        "loai_2": None,
        "sale_crm_name": sale,
        "note": None,
        "note2": None,
        "team": team,
        "team_pivot_label": pivot,
        "loai_nhap": "tay",
        "created_by_email": source_tag,
        "updated_by_email": source_tag,
    }


def _df_row_to_indexed(row_series, col_map: dict[str, int]) -> list[Any]:
    """Map pandas Series → list[Any] theo chỉ số cột chuẩn."""
    width = max(col_map.values()) + 1
    cells: list[Any] = [None] * width
    d = row_series.to_dict()
    for colname, idx in col_map.items():
        for k, v in d.items():
            if str(k).strip().lower() == colname.lower():
                cells[idx] = v
                break
    return cells


SM_DF_COLS = {
    "bank day": SM_INCOME_COL["bank_day"],
    "bank time": SM_INCOME_COL["bank_time"],
    "Gateway": SM_INCOME_COL["gateway"],
    "User Name": SM_INCOME_COL["ten"],
    "Phone": SM_INCOME_COL["sdt"],
    "UID": SM_INCOME_COL["uid"],
    "Package": SM_INCOME_COL["goi"],
    "Pay Time": SM_INCOME_COL["pay_time"],
    "Real Pay(VND)": SM_INCOME_COL["vnd"],
    "GMV (RMB)": SM_INCOME_COL["gmv"],
    "Payment Method": SM_INCOME_COL["payment"],
    "Type": SM_INCOME_COL["loai"],
    "Sales": SM_INCOME_COL["sale"],
}

HCM_DF_COLS = {
    "bank day": 0,
    "bank time": 1,
    "Gateway": 2,
    "User Name": 3,
    "Phone": 4,
    "UID": 5,
    "Package": 6,
    "Pay Time": 8,
    "Real Pay(VND)": 9,
    "GMV (RMB)": 10,
    "Payment Method": 11,
    "Type": 12,
    "Sales": 13,
}


def collect_sm_income_payloads(
    team_cache: TeamLookupCache,
    path: Path,
    *,
    max_row: int = DEFAULT_SM_MAX_ROW,
    log: Callable[[str], None] = _log,
) -> list[dict[str, Any]]:
    import pandas as pd

    log(f"  Đọc SM INCOME «{path.name}» dòng 2..{max_row}…")
    df = pd.read_excel(path, sheet_name="INCOME", header=0, nrows=max(0, max_row - 1))
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for i in range(len(df)):
        sheet_row = i + 2
        if sheet_row > max_row:
            break
        row = _df_row_to_indexed(df.iloc[i], SM_DF_COLS)
        payload = map_sm_income_row(team_cache, row)
        if not payload:
            continue
        fp = row_fingerprint(payload)
        if fp in seen:
            continue
        seen.add(fp)
        out.append(payload)
    log(f"  SM: {len(out)} dòng hợp lệ")
    return out


def collect_hcm_revenue_payloads(
    team_cache: TeamLookupCache,
    path: Path,
    *,
    max_row: int = DEFAULT_HCM_MAX_ROW,
    log: Callable[[str], None] = _log,
) -> list[dict[str, Any]]:
    import pandas as pd

    log(f"  Đọc HCM REVENUE «{path.name}» dòng 2..{max_row}…")
    df = pd.read_excel(path, sheet_name="REVENUE", header=0, nrows=max(0, max_row - 1))
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for i in range(len(df)):
        sheet_row = i + 2
        if sheet_row > max_row:
            break
        row = _df_row_to_indexed(df.iloc[i], HCM_DF_COLS)
        payload = map_hcm_rev_row(team_cache, row, tab="HCM REV")
        if not payload:
            continue
        payload["created_by_email"] = "import:dingtalk:HCM REV"
        payload["updated_by_email"] = "import:dingtalk:HCM REV"
        fp = row_fingerprint(payload)
        if fp in seen:
            continue
        seen.add(fp)
        out.append(payload)
    log(f"  HCM: {len(out)} dòng hợp lệ")
    return out


def collect_dingtalk_payloads(
    team_cache: TeamLookupCache,
    *,
    sm_path: Path,
    hcm_path: Path,
    sm_max_row: int = DEFAULT_SM_MAX_ROW,
    hcm_max_row: int = DEFAULT_HCM_MAX_ROW,
    log: Callable[[str], None] = _log,
) -> list[dict[str, Any]]:
    payloads: list[dict[str, Any]] = []
    payloads.extend(collect_sm_income_payloads(team_cache, sm_path, max_row=sm_max_row, log=log))
    payloads.extend(collect_hcm_revenue_payloads(team_cache, hcm_path, max_row=hcm_max_row, log=log))
    log(f"Tổng DingTalk: {len(payloads)} dòng (dedupe trong từng tab)")
    return payloads


def count_gsheet_import_rows(sb) -> int:
    total = 0
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("id", count="exact")
            .like("created_by_email", "import:gsheet:%")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        total = res.count if hasattr(res, "count") and res.count is not None else total + len(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return total


def purge_gsheet_import_rows(sb, *, log: Callable[[str], None] = _log) -> int:
    """Xóa mọi dòng seed cũ từ All File (import:gsheet:…). Giữ tu_dong + tay khác."""
    deleted = 0
    while True:
        res = _execute_supabase(
            lambda: (
                sb.table("so_doanh_thu")
                .select("id")
                .like("created_by_email", "import:gsheet:%")
                .limit(200)
                .execute()
            ),
            log=log,
            label="Select gsheet import ids",
        )
        rows = res.data or []
        if not rows:
            break
        ids = [r["id"] for r in rows]
        _execute_supabase(
            lambda: sb.table("so_doanh_thu").delete().in_("id", ids).execute(),
            log=log,
            label="Delete gsheet batch",
        )
        deleted += len(ids)
        log(f"  Đã xóa {deleted} dòng import:gsheet…")
    return deleted


def insert_ledger_payloads(
    sb,
    payloads: list[dict[str, Any]],
    *,
    dry_run: bool = False,
    log: Callable[[str], None] = _log,
    sb_factory: Callable[[], Any] | None = None,
) -> int:
    if dry_run:
        log(f"Dry-run — sẽ insert {len(payloads)} dòng")
        for p in payloads[:3]:
            log(f"  sample: {p['ngay_tien_ve']} {p.get('ten_khach')} {p['so_tien_vnd']} GMV={p['gmv_rmb']}")
        return 0

    inserted = 0
    client = sb
    for i in range(0, len(payloads), INSERT_BATCH):
        chunk = payloads[i : i + INSERT_BATCH]
        try:
            _execute_supabase(
                lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                log=log,
                label="Insert dingtalk batch",
            )
        except Exception:
            if sb_factory:
                client = sb_factory()
                _execute_supabase(
                    lambda c=client, ch=chunk: c.table("so_doanh_thu").insert(ch).execute(),
                    log=log,
                    label="Insert dingtalk batch (retry)",
                )
            else:
                raise
        inserted += len(chunk)
        log(f"  inserted {inserted}/{len(payloads)}")
        if INSERT_PAUSE_SEC and i + INSERT_BATCH < len(payloads):
            import time

            time.sleep(INSERT_PAUSE_SEC)
    return inserted
