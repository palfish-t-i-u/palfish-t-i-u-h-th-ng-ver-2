"""CRM routes — Module 5: Đồng bộ & xuất dữ liệu CRM PalFish.

Luồng:
  Extension → POST /system/update-crm-token  (cookie + headers — không bắt Export)
  Frontend  → POST /crm/sync               (dual pull, payload server-side → upsert DB)
  Frontend  → GET  /crm/export-master      (cào dữ liệu + trả file Excel — legacy)

SQL cần chạy trên Supabase (nếu chưa có bảng crm_tokens):
  CREATE TABLE IF NOT EXISTS crm_tokens (
      id           INT PRIMARY KEY DEFAULT 1,
      cookie_value TEXT NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
"""

from __future__ import annotations

import io
import copy
import json
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from crm_metrics import extract_row_metrics, is_valid_sale_name, parse_rate, sale_label, team_label

try:
    import numpy as np
    import pandas as pd
    _PANDAS_OK = True
except ImportError:
    np = None  # type: ignore
    _PANDAS_OK = False

# ---------------------------------------------------------------------------
# In-memory fallback khi chưa cấu hình Supabase
# ---------------------------------------------------------------------------
_crm_token_mem: dict[str, Any] = {"cookie_value": "", "updated_at": None}

CRM_DOWNLOAD_URL = (
    "https://sea.pri.ibanyu.com/opapi/crmi18n/crmopapii18n/report/record/download"
)

MAX_DAYS = 31
# Team con (vd. 越南崛起团队) đôi khi export API trả CSV chỉ header — fallback org VN
VN_ORG_DEPARTMENT_ID = 2242153
# show_type=2 → đủ nhân sự team con dưới org (API PalFish, không cần Export thủ công)
CRM_AUTONOMOUS_SHOW_TYPE = 2
# Chỉ merge từ extension capture — KHÔNG copy time_start/end hay h_lc
_CRM_STATIC_PREF_KEYS: tuple[str, ...] = (
    "department_id",
    "customer_type",
    "is_asc",
    "zone_name",
    "contain_sub",
    "is_include_sub",
    "include_sub",
)

# Cặp key thời gian PalFish F12 (report/record/download)
_CRM_TIME_KEY_PAIRS: list[tuple[str, str]] = [
    ("time_start", "time_end"),
    ("start_time", "end_time"),
    ("startTime", "endTime"),
    ("start_date", "end_date"),
    ("startDate", "endDate"),
]
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")

# ---------------------------------------------------------------------------
# Column mapping: tên cột CRM (tiếng Trung/Anh) → schema crm_sales_data
# Mỗi key là tên cột đích, value là danh sách tên cột CRM có thể gặp
# ---------------------------------------------------------------------------
_COL_MAP: dict[str, list[str]] = {
    "crm_order_id": [
        "订单ID", "订单号", "订单编号", "合同号", "合同编号", "order_id", "order id",
        "Order ID", "OrderID", "crm_order_id", "id", "ID", "Mã đơn", "Ma don",
        "Order No", "Contract ID", "record_id", "Record ID",
    ],
    "uid": [
        "客户ID", "客户UID", "学员UID", "学员ID", "uid", "UID", "user_id", "User ID",
        "Student UID", "CRM UID", "Khách UID",
    ],
    "sale_name": [
        "Sales", "Sale", "sale_name", "sale",
        "销售", "销售姓名", "销售人员", "顾问", "销售顾问",
        "Consultant", "NV Sale", "Tên Sale", "Sale Name",
    ],
    "team": [
        "Department", "部门", "department", "销售部门",
        "组", "团队", "小组", "team", "Team", "销售组", "Nhóm", "Group",
    ],
    "department": ["Department", "部门", "department", "销售部门", "Bộ phận", "Phòng ban"],
    "package_name": [
        "课程", "课程名称", "产品", "套餐", "package_name", "package", "Package",
        "Gói học", "产品名称", "Course", "Product",
    ],
    "amount": [
        "业绩(元)", "业绩", "GMV", "金额", "合同金额", "amount", "Amount",
        "价格", "gmv", "收入", "Doanh thu", "Revenue",
    ],
    "completed_classes": [
        "Completed Class Number", "完课数", "completed_classes",
    ],
    "referral_leads": [
        "Referral leads", "Referral Leads", "转介绍Leads数", "referral_leads",
    ],
}

_SKIP_SALE_NAMES = frozenset(
    s.lower() for s in ("Sales", "Sale", "汇总", "Total", "合计", "Department", "")
)
_HEADER_SALE_NAMES = frozenset(s.lower() for s in ("Sales", "Department", "Total", "合计", ""))
# Giá trị ô CSV là nhãn header (dòng tiếng Anh song ngữ) — không phải số liệu
_HEADER_CELL_LABELS = frozenset(s.lower() for s in (
    "Total leads", "Invitation Number", "Number of invitations", "Completed Class Number",
    "Referral leads", "Referral Leads", "Order", "Orders", "GMV",
    "Department", "Sales", "Sale", "Performance (CNY)",
    "总Leads数", "邀约数", "完课数", "签单数", "业绩(元)", "部门", "销售",
))

_ORDER_HINTS = ("order", "contract", "合同", "订单", "编号", "record", "mã đơn", "ma don")
_UID_HINTS = ("uid", "学员", "student", "customer", "khách", "客户")
_SALE_HINTS = ("sale", "销售", "顾问", "consult", "tư vấn", "advisor")
_AMOUNT_HINTS = ("amount", "gmv", "金额", "doanh thu", "revenue", "price", "paid", "实付")

def _csv_data_row_count(content: bytes) -> int:
    """CRM CSV: 2 dòng header (CN + EN), dòng 3+ là data."""
    if not content:
        return 0
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        try:
            lines = content.decode(enc).splitlines()
            break
        except UnicodeDecodeError:
            continue
    else:
        return 0
    return sum(1 for ln in lines[2:] if ln.strip())


def _flatten_column_name(col: Any) -> str:
    if isinstance(col, tuple):
        parts = [
            str(p).strip()
            for p in col
            if p is not None and str(p).strip() and not str(p).startswith("Unnamed")
        ]
        return " ".join(parts) if parts else str(col[-1])
    return str(col).strip()


def _normalize_column_names(df: "pd.DataFrame") -> "pd.DataFrame":
    out = df.copy()
    out.columns = [_flatten_column_name(c) for c in out.columns]
    return out

def _find_col(df_cols: list[str], candidates: list[str]) -> str | None:
    """Tìm tên cột đầu tiên khớp (case-insensitive) trong DataFrame."""
    lower_map = {c.lower(): c for c in df_cols}
    for candidate in candidates:
        if candidate in df_cols:
            return candidate
        if candidate.lower() in lower_map:
            return lower_map[candidate.lower()]
    return None


def _find_col_fuzzy(df_cols: list[str], hints: tuple[str, ...]) -> str | None:
    for col in df_cols:
        cl = col.lower()
        if any(h in cl for h in hints):
            return col
    return None


def _sanitize_raw(val: Any) -> Any:
    import math

    if hasattr(val, "item"):
        val = val.item()
    if isinstance(val, float) and math.isnan(val):
        return None
    if val is None or (isinstance(val, str) and val.strip().lower() in ("", "nan", "none")):
        return None
    return val


def _resolve_order_id(
    raw: dict,
    mapping: dict,
    cols: list[str],
    report_date: str,
    sale: str,
    dept: str,
    idx: int,
    record_type: str = "daily",
) -> str:
    """Khóa synthetic: record_type|sale|date — tránh trùng summary vs daily."""
    if sale and sale.lower() not in _SKIP_SALE_NAMES:
        return f"{record_type}|{sale}|{report_date}"

    order_id_col = mapping.get("crm_order_id")
    if order_id_col:
        val = _sanitize_raw(raw.get(order_id_col))
        if val is not None:
            return str(val).strip()

    import hashlib

    parts = [report_date, sale, dept] + [str(_sanitize_raw(raw.get(c)) or "") for c in cols[:4]]
    digest = hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()[:12]
    return f"crm-{report_date}-{idx}-{digest}"


def _columns_look_english(cols) -> bool:
    lower = {str(c).strip().lower() for c in cols if c is not None and str(c).strip()}
    if "sales" in lower and "department" in lower:
        return True
    joined = " ".join(lower)
    return any(m in joined for m in _ENGLISH_HEADER_MARKERS)


def _normalize_crm_percent_columns(df: "pd.DataFrame") -> "pd.DataFrame":
    """Chuẩn hóa cột % (39%, 0.00%) → số thực trước khi lưu raw_data."""
    out = df.copy()
    for col in out.columns:
        cl = str(col).lower()
        if any(h in cl for h in ("rate", "占比", "率", "preview")):
            out[col] = out[col].fillna(0).apply(parse_rate)
    return out


def _clean_crm_dataframe(df: "pd.DataFrame") -> "pd.DataFrame":
    """
    Bước B/C sau khi đọc file với header tiếng Anh (header=1 / skiprows=1).
    Loại Total, Sales rỗng/NaN, header ghost rows; chuẩn hóa cột %.
    """
    if df is None or df.empty:
        return df

    out = df.copy()
    sale_col = "Sales" if "Sales" in out.columns else _find_col(list(out.columns), _COL_MAP["sale_name"])
    dept_col = "Department" if "Department" in out.columns else _find_col(list(out.columns), _COL_MAP["department"])

    if dept_col:
        dept_s = out[dept_col].astype(str).str.strip()
        out = out[dept_s.str.lower() != "total"]
        out = out[dept_s != ""]
        out = out[out[dept_col].notna()]

    if sale_col:
        out = out.dropna(subset=[sale_col])
        sale_s = out[sale_col].astype(str).str.strip()
        out = out[sale_s != ""]
        out = out[sale_s.str.lower() != "nan"]
        out = out[sale_s.str.lower() != "total"]
        out = out[~sale_s.str.lower().isin(_SKIP_SALE_NAMES | _HEADER_SALE_NAMES)]

    if "销售" in out.columns and sale_col != "销售":
        cn = out["销售"].astype(str).str.strip()
        out = out[cn != ""]
        out = out[~cn.str.lower().isin(_SKIP_SALE_NAMES | {"汇总"})]

    out = _normalize_crm_percent_columns(out)
    return out.reset_index(drop=True)


def _row_sale_name(raw: dict, mapping: dict) -> str:
    col = mapping.get("sale_name")
    if col:
        val = _sanitize_raw(raw.get(col))
        if val is not None:
            return str(val).strip()
    return str(raw.get("销售") or "").strip()


def _is_crm_header_row(raw: dict, mapping: dict) -> bool:
    """Bỏ dòng header song ngữ CRM (Sales / Total leads / GMV…)."""
    sale = _row_sale_name(raw, mapping).lower()
    if sale in _HEADER_SALE_NAMES:
        return True
    for key in (
        "总Leads数", "Total leads", "邀约数", "Invitation Number", "Number of invitations",
        "完课数", "Completed Class Number", "签单数", "Order", "业绩(元)", "GMV",
    ):
        val = raw.get(key)
        if val is not None and str(val).strip().lower() in _HEADER_CELL_LABELS:
            return True
    return False


def _df_to_insert_rows(df: "pd.DataFrame", record_type: str = "daily") -> list[dict]:
    """
    Map DataFrame CRM → crm_sales_data với record_type ('summary' | 'daily').
    """
    cols = list(df.columns)
    mapping = {field: _find_col(cols, candidates) for field, candidates in _COL_MAP.items()}

    if not mapping.get("sale_name"):
        mapping["sale_name"] = _find_col_fuzzy(cols, _SALE_HINTS)
    if not mapping.get("amount"):
        mapping["amount"] = _find_col_fuzzy(cols, _AMOUNT_HINTS)

    rows = []
    for idx, row in df.iterrows():
        raw: dict[str, Any] = {}
        for c in cols:
            raw[c] = _sanitize_raw(row[c])

        report_date = str(
            raw.get("date_report") or raw.get("Date_Report") or ""
        )[:10]
        if not report_date:
            continue

        if _is_crm_header_row(raw, mapping):
            continue

        def _get(field: str) -> str:
            col = mapping.get(field)
            if not col:
                return ""
            val = _sanitize_raw(raw.get(col))
            return str(val).strip() if val is not None else ""

        row_stub = {"raw_data": raw}
        metrics = extract_row_metrics(row_stub)
        dept = _get("department") or team_label(row_stub)
        team_val = dept if dept != "—" else (_get("team") or None)
        sale = _get("sale_name") or sale_label(row_stub)
        if sale == "—":
            sale = ""

        if not is_valid_sale_name(sale):
            continue

        rtype = str(raw.get("record_type") or record_type).strip().lower()
        if rtype not in ("summary", "daily"):
            rtype = record_type

        raw["date_report"] = report_date
        raw["Date_Report"] = report_date
        raw["record_type"] = rtype
        crm_order_id = _resolve_order_id(
            raw, mapping, cols, report_date, sale, dept, int(idx), rtype
        )

        rows.append({
            "crm_order_id": crm_order_id,
            "report_date":  report_date,
            "record_type":  rtype,
            "uid":          _get("uid") or None,
            "sale_name":    sale,
            "team":         team_val,
            "department":   team_val,
            "package_name": _get("package_name") or None,
            "amount":       int(metrics["b3_gmv"]),
            "completed_classes": int(metrics["l4"]),
            "referral_leads":    int(metrics["l1_2"]),
            "raw_data":     raw,
        })
    return rows


def _json_safe(val: Any) -> Any:
    """Chuẩn hóa NaN/Inf → None trước khi gửi Supabase JSON."""
    import math

    if val is None:
        return None
    if hasattr(val, "item"):
        try:
            val = val.item()
        except (ValueError, AttributeError):
            pass
    if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
        return None
    if isinstance(val, dict):
        return {k: _json_safe(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_json_safe(v) for v in val]
    return val


def _sanitize_rows_for_db(rows: list[dict]) -> list[dict]:
    return [{k: _json_safe(v) for k, v in r.items()} for r in rows]


def _dataframe_nan_to_none(df: "pd.DataFrame") -> "pd.DataFrame":
    """df.replace({np.nan: None}) — tránh NaN trong raw_data khi upsert."""
    if df is None or df.empty or np is None:
        return df
    return df.replace({np.nan: None})


def _upsert_crm_rows(sb, rows: list[dict]) -> int:
    """UPSERT theo (sale_name, report_date, record_type) — không delete thủ công."""
    if sb is None or not rows:
        return 0

    rows = _sanitize_rows_for_db(rows)
    print(
        f"[CRM Upsert] {len(rows)} rows | sample sale={rows[0].get('sale_name')} "
        f"type={rows[0].get('record_type')} date={rows[0].get('report_date')}"
    )

    conflict = "sale_name,report_date,record_type"
    fallbacks = (
        conflict,
        "crm_order_id,report_date",
    )

    BATCH = 200
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        last_exc: Exception | None = None
        for on_conflict in fallbacks:
            try:
                sb.table("crm_sales_data").upsert(
                    batch,
                    on_conflict=on_conflict,
                ).execute()
                total += len(batch)
                last_exc = None
                break
            except Exception as exc:
                last_exc = exc
                err = str(exc).lower()
                if "record_type" in err and on_conflict == conflict:
                    continue
                if "completed_classes" in err or "referral_leads" in err:
                    slim = [
                        {
                            k: v
                            for k, v in r.items()
                            if k not in ("completed_classes", "referral_leads")
                        }
                        for r in batch
                    ]
                    sb.table("crm_sales_data").upsert(
                        slim, on_conflict=on_conflict
                    ).execute()
                    total += len(slim)
                    last_exc = None
                    break
                if on_conflict == fallbacks[-1]:
                    print(f"[CRM Upsert] batch {i // BATCH} failed: {exc}")
                    raise
        if last_exc is not None:
            raise last_exc
    return total


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class CrmTokenBody(BaseModel):
    cookie_str: str


class CrmSyncBody(BaseModel):
    start_date: str
    end_date: str


def _validate_date_range(start_date: str, end_date: str) -> tuple[date, date]:
    try:
        d_start = date.fromisoformat(start_date)
        d_end = date.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(400, "start_date / end_date phải có dạng YYYY-MM-DD")
    if d_end < d_start:
        raise HTTPException(400, "end_date phải >= start_date")
    if (d_end - d_start).days >= MAX_DAYS:
        raise HTTPException(400, f"Dải ngày tối đa {MAX_DAYS} ngày")
    return d_start, d_end


async def _crm_http_client(sb) -> tuple[httpx.AsyncClient, dict[str, Any]]:
    """Auth bundle + httpx client dùng chung cho summary & daily pull."""
    if not _PANDAS_OK:
        raise HTTPException(500, "Thư viện pandas chưa được cài")
    bundle = _get_auth_bundle(sb)
    if not bundle.get("cookie"):
        raise HTTPException(
            503,
            "Chưa có token CRM — hãy cài Extension và truy cập trang CRM trước.",
        )
    headers = _build_crm_headers(bundle)
    client = httpx.AsyncClient(timeout=120, headers=headers, follow_redirects=True)
    return client, bundle


def _default_crm_download_payload() -> dict[str, Any]:
    """
    Payload server-side — sync chỉ cần token CRM (cookie/headers từ extension).
    Không bắt user bấm Export trên PalFish.
    """
    return {
        "time_start": "",
        "time_end": "",
        "department_id": VN_ORG_DEPARTMENT_ID,
        "show_type": CRM_AUTONOMOUS_SHOW_TYPE,
        "customer_type": 0,
        "is_asc": False,
        "zone_name": "Asia/Saigon",
    }


def _extract_crm_prefs(template: dict | None) -> dict[str, Any]:
    """
    Lấy cấu hình cố định cho API download — backend tự build, không phụ thuộc Export.
    Optional: extension từng capture department_id / contain_sub → merge một lần.
    Override: env CRM_DEPARTMENT_ID, CRM_SHOW_TYPE.
    """
    prefs = _default_crm_download_payload()
    if template:
        for key in _CRM_STATIC_PREF_KEYS:
            if key in template and template[key] is not None:
                prefs[key] = copy.deepcopy(template[key])
    dept_env = os.environ.get("CRM_DEPARTMENT_ID", "").strip()
    if dept_env:
        prefs["department_id"] = int(dept_env)
    show_env = os.environ.get("CRM_SHOW_TYPE", "").strip()
    if show_env:
        prefs["show_type"] = int(show_env)
    return prefs


def _assemble_crm_payload(
    prefs: dict[str, Any],
    d_start: date,
    d_end: date,
) -> dict[str, Any]:
    """
    Ghép request body gửi PalFish từ prefs server-side + kỳ user chọn.
    Không gửi h_lc (checksum client-side — chỉ cần khi export cùng ngày trên UI CRM).
    """
    payload = copy.deepcopy(prefs)
    payload.pop("h_lc", None)

    start_sample = payload.get("time_start") or "2026-01-01"
    end_sample = payload.get("time_end") or start_sample

    start_val = _format_ts_for_crm(d_start, start_sample, end_of_day=False)
    end_val = _format_ts_for_crm(d_end, end_sample, end_of_day=True)

    updated = False
    for start_key, end_key in _CRM_TIME_KEY_PAIRS:
        if start_key in payload or end_key in payload:
            payload[start_key] = start_val
            payload[end_key] = end_val
            updated = True
            break

    if not updated:
        payload["time_start"] = start_val
        payload["time_end"] = end_val

    return payload


def _build_range_payload(
    prefs: dict[str, Any],
    d_start: date,
    d_end: date,
) -> dict[str, Any]:
    """Payload 1 lần cho cả dải ngày — Bước B (summary)."""
    return _assemble_crm_payload(prefs, d_start, d_end)


async def _download_crm_file(
    client: httpx.AsyncClient,
    payload: dict[str, Any],
) -> tuple[bytes, str]:
    """POST CRM → tải file OSS, trả (content, hint)."""
    resp = await client.post(CRM_DOWNLOAD_URL, json=payload)
    ct = resp.headers.get("content-type", "").lower()
    if resp.status_code == 401:
        raise HTTPException(401, "Token CRM đã hết hạn — vào CRM để extension làm mới.")
    if resp.status_code != 200:
        raise HTTPException(502, f"CRM trả HTTP {resp.status_code}")

    if "json" not in ct:
        return resp.content, ct

    try:
        jbody = resp.json()
    except Exception as exc:
        print(f"[CRM Download] JSON parse failed: {exc}")
        raise HTTPException(502, "CRM trả response không đọc được") from exc

    ret = jbody.get("ret")
    if ret not in (None, 0, 1):
        msg = jbody.get("msg") or jbody.get("message") or str(jbody)
        print(f"[CRM Download] CRM error: {jbody}")
        raise HTTPException(502, f"CRM từ chối: {msg}")

    file_url = _extract_download_url(jbody)
    if not file_url:
        print(f"[CRM Download] no file url: {jbody}")
        raise HTTPException(502, "CRM không trả link file — mở CRM để extension làm mới token.")

    file_resp = await client.get(file_url)
    if file_resp.status_code != 200 or not file_resp.content:
        raise HTTPException(502, f"Tải file CRM thất bại HTTP {file_resp.status_code}")

    hint = f"{file_url} {file_resp.headers.get('content-type', '')}"
    return file_resp.content, hint


async def _download_crm_dataframe(
    client: httpx.AsyncClient,
    payload: dict[str, Any],
    *,
    label: str = "",
) -> "pd.DataFrame | None":
    """Tải + parse CRM; None nếu file chỉ có header (0 dòng data)."""
    print(
        f"[CRM Payload/{label}] dept={payload.get('department_id')} "
        f"show_type={payload.get('show_type')} "
        f"{payload.get('time_start')}→{payload.get('time_end')} "
        f"keys={sorted(payload.keys())}"
    )
    content, hint = await _download_crm_file(client, payload)
    data_rows = _csv_data_row_count(content)
    if data_rows == 0 and ("csv" in hint.lower() or content[:3] == b"\xef\xbb\xbf" or b"," in content[:200]):
        print(f"[CRM {label}] CSV headers-only (dept={payload.get('department_id')})")
        return None

    df = _read_tabular(io.BytesIO(content), hint)
    if df is None or df.empty:
        print(f"[CRM {label}] parsed empty dataframe")
        return None

    before = len(df)
    df = _clean_crm_dataframe(df)
    if df.empty:
        print(f"[CRM {label}] {before} rows → 0 after clean")
        return None
    print(f"[CRM {label}] OK {before} raw → {len(df)} clean (dept={payload.get('department_id')})")
    return df


async def _resolve_sync_department_id(
    client: httpx.AsyncClient,
    prefs: dict[str, Any],
    probe_day: date,
) -> tuple[int, bool, int]:
    """
    Probe export 1 ngày — nếu team con trả CSV rỗng, fallback org VN.
    Returns: (department_id, used_fallback, captured_id)
    """
    captured_id = int(prefs.get("department_id") or VN_ORG_DEPARTMENT_ID)
    probe = _build_day_payload(prefs, probe_day, d_start=probe_day, d_end=probe_day)
    try:
        content, _ = await _download_crm_file(client, probe)
        if _csv_data_row_count(content) > 0:
            return int(probe.get("department_id") or captured_id), False, captured_id
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[CRM Dept probe] captured dept {captured_id} failed: {exc}")

    if captured_id == VN_ORG_DEPARTMENT_ID:
        return captured_id, False, captured_id

    fb = copy.deepcopy(probe)
    fb["department_id"] = VN_ORG_DEPARTMENT_ID
    fb.pop("h_lc", None)
    try:
        content, _ = await _download_crm_file(client, fb)
        if _csv_data_row_count(content) > 0:
            print(
                f"[CRM Dept] team {captured_id} → CSV rỗng; "
                f"fallback org VN {VN_ORG_DEPARTMENT_ID}"
            )
            return VN_ORG_DEPARTMENT_ID, True, captured_id
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[CRM Dept probe] fallback failed: {exc}")

    raise HTTPException(
        502,
        f"CRM export trả file rỗng (chỉ header) cho department_id={captured_id}. "
        f"Thử đặt CRM_DEPARTMENT_ID={VN_ORG_DEPARTMENT_ID} trong backend/.env "
        "hoặc mở CRM để extension làm mới token.",
    )


async def _fetch_crm_summary_df(
    client: httpx.AsyncClient,
    prefs: dict[str, Any],
    d_start: date,
    d_end: date,
    department_id: int,
) -> "pd.DataFrame":
    """Bước B: 1 request cả kỳ → record_type=summary."""
    end_iso = d_end.isoformat()
    payload = _build_range_payload(prefs, d_start, d_end)
    payload["department_id"] = department_id

    df = await _download_crm_dataframe(client, payload, label="Summary")
    if df is not None and not df.empty:
        df["date_report"] = end_iso
        df["Date_Report"] = end_iso
        df["record_type"] = "summary"
        return df

    raise HTTPException(
        502,
        "CRM không trả dữ liệu summary cho kỳ này — kiểm tra token CRM hoặc CRM_DEPARTMENT_ID.",
    )


async def _fetch_crm_daily_df(
    client: httpx.AsyncClient,
    prefs: dict[str, Any],
    d_start: date,
    d_end: date,
    department_id: int,
) -> tuple["pd.DataFrame", list[str]]:
    """Bước C: vòng lặp từng ngày → record_type=daily."""
    day_prefs = copy.deepcopy(prefs)
    day_prefs["department_id"] = department_id
    all_dfs: list = []
    failed_days: list[str] = []

    current = d_start
    while current <= d_end:
        day_iso = current.isoformat()
        payload = _build_day_payload(
            day_prefs, current, d_start=d_start, d_end=d_end
        )
        try:
            df = await _download_crm_dataframe(client, payload, label=f"Daily/{day_iso}")
            if df is None or df.empty:
                failed_days.append(day_iso)
            else:
                df["date_report"] = day_iso
                df["Date_Report"] = day_iso
                df["record_type"] = "daily"
                all_dfs.append(df)
        except HTTPException:
            raise
        except Exception as exc:
            print(f"[CRM Daily] {day_iso} failed: {exc}")
            failed_days.append(day_iso)
        current += timedelta(days=1)

    if not all_dfs:
        return pd.DataFrame(), failed_days
    return pd.concat(all_dfs, ignore_index=True), failed_days


async def _run_dual_pull_sync(
    sb, d_start: date, d_end: date
) -> dict[str, Any]:
    """
    Kiến trúc Kéo Kép:
      B — summary 1 lần
      C — daily loop
      → upsert (sale_name, report_date, record_type)
    """
    ps, pe = d_start.isoformat(), d_end.isoformat()

    client, bundle = await _crm_http_client(sb)
    prefs = _extract_crm_prefs(bundle.get("download_payload"))
    print(
        f"[CRM Sync] autonomous payload dept={prefs.get('department_id')} "
        f"show_type={prefs.get('show_type')} "
        f"(capture={'yes' if bundle.get('download_payload') else 'no — token only'})"
    )

    async with client:
        dept_id, dept_fallback, captured_dept = await _resolve_sync_department_id(
            client, prefs, d_end
        )
        summary_df = await _fetch_crm_summary_df(
            client, prefs, d_start, d_end, dept_id
        )
        daily_df, failed_days = await _fetch_crm_daily_df(
            client, prefs, d_start, d_end, dept_id
        )

    summary_df = _dataframe_nan_to_none(summary_df)
    daily_df = _dataframe_nan_to_none(daily_df)

    summary_rows = _df_to_insert_rows(summary_df, "summary")
    daily_rows = _df_to_insert_rows(daily_df, "daily") if not daily_df.empty else []
    data_to_upsert = summary_rows + daily_rows

    upserted = 0
    if sb and data_to_upsert:
        upserted = _upsert_crm_rows(sb, data_to_upsert)
        print(
            f"[CRM Dual Pull] {ps}→{pe} upserted={upserted} "
            f"summary={len(summary_rows)} daily={len(daily_rows)}"
        )

    master_df = pd.concat(
        [summary_df] + ([daily_df] if not daily_df.empty else []),
        ignore_index=True,
    )

    return {
        "master_df": master_df,
        "deleted": 0,
        "inserted": upserted,
        "upserted": upserted,
        "summary_rows": len(summary_rows),
        "daily_rows": len(daily_rows),
        "failed_days": failed_days,
        "days_ok": (d_end - d_start).days + 1 - len(failed_days),
        "department_id_used": dept_id,
        "department_id_captured": captured_dept,
        "department_fallback": dept_fallback,
        "show_type_used": prefs.get("show_type"),
    }


async def _fetch_crm_master_df(sb, d_start: date, d_end: date) -> tuple["pd.DataFrame", list[str]]:
    """Export Excel — chạy dual pull (đã ghi DB)."""
    result = await _run_dual_pull_sync(sb, d_start, d_end)
    return result["master_df"], result["failed_days"]


def _ts_ms_vn(d: date, end_of_day: bool = False) -> int:
    """Unix timestamp milliseconds — đầu/cuối ngày theo giờ VN."""
    from datetime import time as _time
    from zoneinfo import ZoneInfo

    vn = ZoneInfo("Asia/Ho_Chi_Minh")
    t = _time(23, 59, 59) if end_of_day else _time(0, 0, 0)
    dt = datetime.combine(d, t, tzinfo=vn)
    return int(dt.timestamp() * 1000)


def _format_ts_for_crm(day: date, sample: Any, end_of_day: bool) -> Any:
    """Giữ đúng kiểu (ISO YYYY-MM-DD / str-ms / int ms|sec) như payload F12."""
    ts_ms = _ts_ms_vn(day, end_of_day)
    ts_sec = ts_ms // 1000
    iso = day.isoformat()

    if sample is None:
        return iso

    if isinstance(sample, str):
        s = sample.strip()
        if _ISO_DATE_RE.match(s):
            return iso
        try:
            num = int(s)
        except ValueError:
            return iso
        val = ts_ms if num >= 10**12 else ts_sec
        return str(val)

    if isinstance(sample, (int, float)):
        return ts_ms if int(sample) >= 10**12 else ts_sec

    return iso


def _day_from_crm_ts(value: Any) -> date | None:
    """Đọc time_start/time_end CRM (ISO hoặc unix) → ngày."""
    if value is None:
        return None
    if isinstance(value, str):
        s = value.strip()
        if _ISO_DATE_RE.match(s):
            try:
                return date.fromisoformat(s[:10])
            except ValueError:
                return None
    try:
        from zoneinfo import ZoneInfo

        num = int(value)
        if num >= 10**12:
            num //= 1000
        return datetime.fromtimestamp(num, ZoneInfo("Asia/Ho_Chi_Minh")).date()
    except (ValueError, TypeError, OSError):
        return None


def _build_day_payload(
    prefs: dict[str, Any],
    day: date,
    *,
    d_start: date | None = None,
    d_end: date | None = None,
) -> dict[str, Any]:
    """Payload 1 ngày — Bước C (daily loop)."""
    return _assemble_crm_payload(prefs, day, day)


def _parse_auth_bundle(raw: str) -> dict[str, Any]:
    """Parse cookie string hoặc JSON bundle từ extension."""
    raw = (raw or "").strip()
    if not raw:
        return {"cookie": "", "headers": {}, "download_payload": None}
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                return {
                    "cookie": str(data.get("cookie") or ""),
                    "headers": data.get("headers") or {},
                    "download_payload": data.get("download_payload"),
                }
        except json.JSONDecodeError:
            pass
    return {"cookie": raw, "headers": {}, "download_payload": None}


def _get_auth_bundle(sb) -> dict[str, Any]:
    """Lấy auth bundle từ Supabase hoặc bộ nhớ."""
    raw = ""
    if sb:
        try:
            res = sb.table("crm_tokens").select("cookie_value").eq("id", 1).limit(1).execute()
            if res.data:
                raw = res.data[0].get("cookie_value", "")
        except Exception as exc:
            print(f"crm_tokens get failed: {exc}")
    if not raw:
        raw = _crm_token_mem.get("cookie_value", "")
    return _parse_auth_bundle(raw)


def _build_crm_headers(bundle: dict[str, Any]) -> dict[str, str]:
    cookie = bundle.get("cookie") or ""
    extra: dict = bundle.get("headers") or {}

    headers: dict[str, str] = {
        "Cookie": cookie,
        "Content-Type": "application/json",
        "Accept": "application/json, application/octet-stream, */*",
        "Referer": "https://sea.pri.ibanyu.com/",
        "Origin": "https://sea.pri.ibanyu.com",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        ),
    }

    skip = {"cookie", "content-length", "host", "content-type", "accept"}
    for key, val in extra.items():
        if val is None or val == "":
            continue
        if key.lower() in skip:
            continue
        headers[key] = str(val)

    if "token" not in {k.lower() for k in headers}:
        m = re.search(r"(?:^|;\s*)token=([^;]+)", cookie)
        if m:
            headers["token"] = m.group(1)

    return headers


def _get_cookie(sb) -> str:
    """Backward compat — trả cookie string thuần."""
    return _get_auth_bundle(sb).get("cookie", "")


def _extract_download_url(jbody: dict[str, Any]) -> str | None:
    """Trích URL file từ response CRM dạng {ret:1, data:{ent:{items:{url:...}}}}."""

    def _walk(obj: Any) -> str | None:
        if isinstance(obj, dict):
            url = obj.get("url")
            if isinstance(url, str) and url.startswith("http"):
                return url
            for val in obj.values():
                found = _walk(val)
                if found:
                    return found
        elif isinstance(obj, list):
            for item in obj:
                found = _walk(item)
                if found:
                    return found
        return None

    data = jbody.get("data")
    if isinstance(data, dict):
        found = _walk(data)
        if found:
            return found
    return _walk(jbody)


def _read_excel_crm(buf: io.BytesIO) -> "pd.DataFrame":
    """Đọc Excel CRM — thử header 0/1 và multi-row header."""
    best: pd.DataFrame | None = None
    for header in ([0, 1], [1], [0], 0, 1):
        try:
            buf.seek(0)
            df = _normalize_column_names(pd.read_excel(buf, header=header))
            if len(df) == 0 and not _columns_look_english(df.columns):
                continue
            if best is None or len(df) > len(best):
                best = df
            if _columns_look_english(df.columns) and len(df) > 0:
                return df
        except Exception:
            continue
    if best is not None:
        return best
    buf.seek(0)
    return _normalize_column_names(pd.read_excel(buf, header=0))


def _read_csv_crm(buf: io.BytesIO) -> "pd.DataFrame":
    """CRM CSV: dòng 0 = header CN, dòng 1 = header EN → skiprows=1."""
    for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
        for skip in (1, 0):
            try:
                buf.seek(0)
                df = _normalize_column_names(pd.read_csv(buf, encoding=enc, skiprows=skip))
                if _columns_look_english(df.columns) or len(df) > 0:
                    return df
            except UnicodeDecodeError:
                break
            except Exception:
                continue
    buf.seek(0)
    return _normalize_column_names(pd.read_csv(buf, encoding="utf-8-sig", skiprows=1))


def _read_tabular(buf: io.BytesIO, hint: str = "") -> "pd.DataFrame":
    """Đọc Excel/CSV PalFish — header tiếng Anh, bỏ dòng Trung đầu file."""
    hint = hint.lower()
    if hint.endswith((".xlsx", ".xls")) or "sheet" in hint or "excel" in hint:
        return _read_excel_crm(buf)
    if hint.endswith(".csv") or "csv" in hint or "text" in hint:
        return _read_csv_crm(buf)
    try:
        buf.seek(0)
        return _read_excel_crm(buf)
    except Exception:
        buf.seek(0)
        return _read_csv_crm(buf)


async def _fetch_crm_response_df(client: httpx.AsyncClient, resp: httpx.Response, ct: str) -> "pd.DataFrame | None":
    """Parse response CRM → DataFrame (file trực tiếp hoặc URL OSS)."""
    if "json" not in ct:
        if not resp.content:
            return None
        hint = ct
        return _read_tabular(io.BytesIO(resp.content), hint)

    try:
        jbody = resp.json()
    except Exception as exc:
        print(f"[CRM Export] JSON parse failed: {exc}")
        return None

    ret = jbody.get("ret")
    if ret not in (None, 0, 1):
        msg = jbody.get("msg") or jbody.get("message") or str(jbody)
        print(f"[CRM Export] CRM error body: {jbody}")
        low = str(msg).lower()
        if any(k in low for k in ("format", "parameter", "param")):
            raise HTTPException(
                400,
                f"CRM payload lỗi: {msg}. "
                "Thử Export lại trên CRM cùng ngày rồi bấm LẤY DỮ LIỆU.",
            )
        raise HTTPException(
            401,
            f"CRM từ chối: {msg}. Vào sea.pri.ibanyu.com → Export 1 lần → thử lại.",
        )

    file_url = _extract_download_url(jbody)
    if not file_url:
        print(f"[CRM Export] JSON ok but no file url: {jbody}")
        return None

    print(f"[CRM Export] downloading OSS: {file_url[:100]}...")
    file_resp = await client.get(file_url)
    if file_resp.status_code != 200 or not file_resp.content:
        print(f"[CRM Export] OSS download failed HTTP {file_resp.status_code}")
        return None

    file_ct = file_resp.headers.get("content-type", "").lower()
    hint = f"{file_url} {file_ct}"
    return _read_tabular(io.BytesIO(file_resp.content), hint)


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------
def register_crm_routes(app, supabase_factory):

    @app.post("/system/update-crm-token", tags=["CRM"])
    async def update_crm_token(body: CrmTokenBody):
        """Nhận cookie từ Chrome Extension và lưu vào bảng crm_tokens."""
        cookie = body.cookie_str.strip()
        if not cookie:
            raise HTTPException(400, "cookie_str không được rỗng")

        now_iso = datetime.now(timezone.utc).isoformat()
        sb = supabase_factory()

        if sb:
            try:
                sb.table("crm_tokens").upsert(
                    {"id": 1, "cookie_value": cookie, "updated_at": now_iso}
                ).execute()
            except Exception as exc:
                print(f"crm_tokens upsert failed (fallback to mem): {exc}")
                _crm_token_mem.update({"cookie_value": cookie, "updated_at": now_iso})
        else:
            _crm_token_mem.update({"cookie_value": cookie, "updated_at": now_iso})

        return {"ok": True, "updated_at": now_iso}

    @app.get("/crm/token-status", tags=["CRM"])
    async def crm_token_status():
        """Kiểm tra xem đã có token CRM chưa (để frontend hiển thị trạng thái)."""
        sb = supabase_factory()
        cookie = _get_cookie(sb)
        has_token = bool(cookie)
        updated_at: str | None = None

        if sb and has_token:
            try:
                res = sb.table("crm_tokens").select("updated_at").eq("id", 1).limit(1).execute()
                if res.data:
                    updated_at = res.data[0].get("updated_at")
            except Exception:
                pass

        if not has_token:
            updated_at = _crm_token_mem.get("updated_at")

        return {"hasToken": has_token, "updatedAt": updated_at}

    @app.post("/crm/sync", tags=["CRM"])
    async def crm_sync(body: CrmSyncBody):
        """Dual pull: xóa kỳ → summary 1 lần + daily loop → insert."""
        d_start, d_end = _validate_date_range(body.start_date, body.end_date)
        sb = supabase_factory()

        try:
            result = await _run_dual_pull_sync(sb, d_start, d_end)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Sync CRM thất bại: {exc}") from exc

        return {
            "ok": True,
            "rows_fetched": len(result["master_df"]),
            "rows_deleted": 0,
            "rows_inserted": result["upserted"],
            "rows_upserted": result["upserted"],
            "summary_rows": result["summary_rows"],
            "daily_rows": result["daily_rows"],
            "days_ok": result["days_ok"],
            "days_failed": result["failed_days"],
            "sync_mode": "dual_pull_autonomous",
            "payload_autonomous": True,
            "show_type_used": result.get("show_type_used"),
            "department_id_used": result.get("department_id_used"),
            "department_fallback": result.get("department_fallback", False),
            "period": {"start": body.start_date, "end": body.end_date},
        }

    @app.get("/crm/export-master", tags=["CRM"])
    async def export_master(
        start_date: str = Query(..., description="YYYY-MM-DD"),
        end_date: str = Query(..., description="YYYY-MM-DD"),
    ):
        """Dual pull + trả file Excel (summary + daily sheets)."""
        d_start, d_end = _validate_date_range(start_date, end_date)
        sb = supabase_factory()

        result = await _run_dual_pull_sync(sb, d_start, d_end)
        master_df = result["master_df"]
        failed_days = result["failed_days"]
        inserted = result["inserted"]

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            master_df.to_excel(writer, index=False, sheet_name="Master")
        output.seek(0)

        label = f"{start_date}_to_{end_date}".replace("-", "")
        filename = f"Master_Sales_Data_{label}.xlsx"

        print(
            f"[CRM Export] {len(master_df)} rows | "
            f"{(d_end - d_start).days + 1 - len(failed_days)} ngày OK | {len(failed_days)} ngày lỗi | "
            f"{inserted} rows inserted to DB"
        )

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
