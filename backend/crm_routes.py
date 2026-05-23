"""CRM routes — Module 5: Đồng bộ & xuất dữ liệu CRM PalFish.

Luồng:
  Extension → POST /system/update-crm-token  (lưu cookie vào crm_tokens)
  Frontend  → GET  /crm/export-master        (cào dữ liệu + trả file Excel)

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
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx
from fastapi import HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    import pandas as pd
    _PANDAS_OK = True
except ImportError:
    _PANDAS_OK = False

# ---------------------------------------------------------------------------
# In-memory fallback khi chưa cấu hình Supabase
# ---------------------------------------------------------------------------
_crm_token_mem: dict[str, Any] = {"cookie_value": "", "updated_at": None}

CRM_DOWNLOAD_URL = (
    "https://sea.pri.ibanyu.com/opapi/crmi18n/crmopapii18n/report/record/download"
)

MAX_DAYS = 31

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
        "销售", "销售姓名", "销售人员", "顾问", "销售顾问", "sale_name", "sale", "Sale",
        "Sales", "Consultant", "NV Sale", "Tên Sale", "Sale Name",
    ],
    "team": ["组", "团队", "小组", "team", "Team", "销售组", "Nhóm", "Group"],
    "department": ["部门", "department", "Department", "销售部门", "Bộ phận", "Phòng ban"],
    "package_name": [
        "课程", "课程名称", "产品", "套餐", "package_name", "package", "Package",
        "Gói học", "产品名称", "Course", "Product",
    ],
    "amount": [
        "业绩(元)", "业绩", "GMV", "金额", "合同金额", "amount", "Amount",
        "价格", "gmv", "收入", "Doanh thu", "Revenue",
    ],
}

_ORDER_HINTS = ("order", "contract", "合同", "订单", "编号", "record", "mã đơn", "ma don")
_UID_HINTS = ("uid", "学员", "student", "customer", "khách", "客户")
_SALE_HINTS = ("sale", "销售", "顾问", "consult", "tư vấn", "advisor")
_AMOUNT_HINTS = ("amount", "gmv", "金额", "doanh thu", "revenue", "price", "paid", "实付")

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


def _resolve_order_id(raw: dict, mapping: dict, cols: list[str], report_date: str, idx: int) -> str:
    order_id_col = mapping.get("crm_order_id")
    if order_id_col:
        val = _sanitize_raw(raw.get(order_id_col))
        if val is not None:
            return str(val).strip()

    fuzzy = _find_col_fuzzy(cols, _ORDER_HINTS)
    if fuzzy:
        val = _sanitize_raw(raw.get(fuzzy))
        if val is not None:
            return str(val).strip()

    uid_col = mapping.get("uid") or _find_col_fuzzy(cols, _UID_HINTS)
    uid = str(_sanitize_raw(raw.get(uid_col)) or "") if uid_col else ""

    import hashlib

    parts = [report_date, uid] + [str(_sanitize_raw(raw.get(c)) or "") for c in cols[:6]]
    digest = hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()[:12]
    if uid:
        return f"{uid}-{report_date}"
    return f"crm-{report_date}-{idx}-{digest}"


def _df_to_upsert_rows(df: "pd.DataFrame") -> list[dict]:
    """
    Map DataFrame từ CRM → list dicts cho bảng crm_sales_data.
    Mọi cột gốc được lưu vào raw_data để không mất dữ liệu.
    """
    cols = list(df.columns)
    mapping = {field: _find_col(cols, candidates) for field, candidates in _COL_MAP.items()}

    # Bổ sung mapping fuzzy nếu thiếu
    if not mapping.get("crm_order_id"):
        mapping["crm_order_id"] = _find_col_fuzzy(cols, _ORDER_HINTS)
    if not mapping.get("uid"):
        mapping["uid"] = _find_col_fuzzy(cols, _UID_HINTS)
    if not mapping.get("sale_name"):
        mapping["sale_name"] = _find_col_fuzzy(cols, _SALE_HINTS)
    if not mapping.get("amount"):
        mapping["amount"] = _find_col_fuzzy(cols, _AMOUNT_HINTS)

    rows = []
    for idx, row in df.iterrows():
        raw: dict[str, Any] = {}
        for c in cols:
            raw[c] = _sanitize_raw(row[c])

        report_date = str(raw.get("Date_Report", "") or "")[:10]
        if not report_date:
            continue

        crm_order_id = _resolve_order_id(raw, mapping, cols, report_date, int(idx))

        def _get(field: str) -> str:
            col = mapping.get(field)
            if not col:
                return ""
            val = _sanitize_raw(raw.get(col))
            return str(val).strip() if val is not None else ""

        def _get_num(field: str) -> int:
            col = mapping.get(field)
            if not col:
                return 0
            val = _sanitize_raw(raw.get(col))
            if val is None:
                return 0
            try:
                return int(float(str(val).replace(",", "").replace(" ", "")))
            except (ValueError, TypeError):
                return 0

        rows.append({
            "crm_order_id": crm_order_id,
            "report_date":  report_date,
            "uid":          _get("uid") or None,
            "sale_name":    _get("sale_name") or None,
            "team":         _get("team") or None,
            "department":   _get("department") or None,
            "package_name": _get("package_name") or None,
            "amount":       _get_num("amount"),
            "raw_data":     raw,
        })
    return rows


def _upsert_crm_sales(sb, df: "pd.DataFrame") -> int:
    """Upsert DataFrame vào bảng crm_sales_data. Trả về số rows đã upsert."""
    if sb is None:
        return 0
    rows = _df_to_upsert_rows(df)
    if not rows:
        print(f"[CRM Upsert] 0 rows mapped — CSV columns: {list(df.columns)}")
        return 0

    print(f"[CRM Upsert] mapping sample: order={rows[0].get('crm_order_id')} sale={rows[0].get('sale_name')}")

    BATCH = 200  # Supabase giới hạn payload ~1MB/request
    total = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i : i + BATCH]
        try:
            sb.table("crm_sales_data").upsert(
                batch,
                on_conflict="crm_order_id,report_date",
            ).execute()
            total += len(batch)
        except Exception as exc:
            print(f"[CRM Upsert] batch {i//BATCH} failed: {exc}")
    return total


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
class CrmTokenBody(BaseModel):
    cookie_str: str


def _ts_ms_vn(d: date, end_of_day: bool = False) -> int:
    """Unix timestamp milliseconds — đầu/cuối ngày theo giờ VN."""
    from datetime import time as _time
    from zoneinfo import ZoneInfo

    vn = ZoneInfo("Asia/Ho_Chi_Minh")
    t = _time(23, 59, 59) if end_of_day else _time(0, 0, 0)
    dt = datetime.combine(d, t, tzinfo=vn)
    return int(dt.timestamp() * 1000)


def _format_ts_for_crm(day: date, sample: Any, end_of_day: bool) -> Any:
    """Giữ đúng kiểu (str/int) và đơn vị (giây/ms) như payload CRM gốc."""
    ts_ms = _ts_ms_vn(day, end_of_day)
    ts_sec = ts_ms // 1000

    if sample is None:
        return ts_ms

    if isinstance(sample, str):
        try:
            num = int(sample)
        except ValueError:
            return sample
        val = ts_ms if num >= 10**12 else ts_sec
        return str(val)

    if isinstance(sample, (int, float)):
        return ts_ms if int(sample) >= 10**12 else ts_sec

    return ts_ms


def _day_from_crm_ts(value: Any) -> date | None:
    """Đọc timestamp CRM → ngày VN."""
    if value is None:
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
    template: dict | None,
    day: date,
    *,
    d_start: date | None = None,
    d_end: date | None = None,
) -> dict[str, Any]:
    if template:
        payload = copy.deepcopy(template)

        # Nếu user export đúng 1 ngày trên CRM → giữ nguyên payload (kể cả h_lc)
        if d_start and d_end and d_start == d_end:
            tpl_day = _day_from_crm_ts(payload.get("time_start"))
            if tpl_day == day:
                return payload

        # Đổi ngày → bỏ h_lc (checksum client-side, không tái tính được)
        payload.pop("h_lc", None)

        start_sample = payload.get("time_start", payload.get("start_time"))
        end_sample = payload.get("time_end", payload.get("end_time", start_sample))

        for start_key, end_key in [
            ("time_start", "time_end"),
            ("start_time", "end_time"),
            ("startTime", "endTime"),
            ("start_date", "end_date"),
            ("startDate", "endDate"),
        ]:
            if start_key in payload or end_key in payload:
                payload[start_key] = _format_ts_for_crm(day, start_sample, end_of_day=False)
                payload[end_key] = _format_ts_for_crm(day, end_sample, end_of_day=True)
                return payload

        payload["time_start"] = _format_ts_for_crm(day, start_sample, end_of_day=False)
        payload["time_end"] = _format_ts_for_crm(day, end_sample, end_of_day=True)
        return payload

    return {
        "time_start": _ts_ms_vn(day, end_of_day=False),
        "time_end": _ts_ms_vn(day, end_of_day=True),
        "department_id": 2242153,
        "show_type": 2,
        "customer_type": 0,
    }


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


def _read_tabular(buf: io.BytesIO, hint: str = "") -> "pd.DataFrame":
    """Đọc Excel/CSV — thử nhiều encoding cho file CRM Trung Quốc."""
    hint = hint.lower()
    if hint.endswith((".xlsx", ".xls")) or "sheet" in hint or "excel" in hint:
        return pd.read_excel(buf)
    if hint.endswith(".csv") or "csv" in hint or "text" in hint:
        for enc in ("utf-8-sig", "utf-8", "gbk", "gb18030"):
            try:
                buf.seek(0)
                return pd.read_csv(buf, encoding=enc)
            except UnicodeDecodeError:
                continue
    try:
        buf.seek(0)
        return pd.read_excel(buf)
    except Exception:
        buf.seek(0)
        return pd.read_csv(buf, encoding="utf-8-sig")


async def _fetch_crm_day_df(client: httpx.AsyncClient, resp: httpx.Response, ct: str) -> "pd.DataFrame | None":
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

    @app.get("/crm/export-master", tags=["CRM"])
    async def export_master(
        start_date: str = Query(..., description="YYYY-MM-DD"),
        end_date: str = Query(..., description="YYYY-MM-DD"),
    ):
        """Cào dữ liệu CRM theo từng ngày trong dải, gộp lại và trả file Excel."""
        if not _PANDAS_OK:
            raise HTTPException(500, "Thư viện pandas chưa được cài — chạy: pip install pandas openpyxl")

        # Validate dates
        try:
            d_start = date.fromisoformat(start_date)
            d_end = date.fromisoformat(end_date)
        except ValueError:
            raise HTTPException(400, "start_date / end_date phải có dạng YYYY-MM-DD")

        if d_end < d_start:
            raise HTTPException(400, "end_date phải >= start_date")

        if (d_end - d_start).days >= MAX_DAYS:
            raise HTTPException(400, f"Dải ngày tối đa {MAX_DAYS} ngày")

        # Lấy auth bundle (cookie + headers + payload mẫu từ extension)
        sb = supabase_factory()
        bundle = _get_auth_bundle(sb)
        cookie = bundle.get("cookie", "")
        if not cookie:
            raise HTTPException(
                503,
                "Chưa có token CRM — hãy cài Chrome Extension và truy cập trang CRM trước."
            )

        headers = _build_crm_headers(bundle)
        payload_template = bundle.get("download_payload")
        if payload_template:
            print(f"[CRM Export] using captured payload template: {list(payload_template.keys())}")
        else:
            print("[CRM Export] no payload template — dùng payload mặc định (hãy Export 1 lần trên CRM)")

        # Cào dữ liệu từng ngày
        all_dfs: list = []
        failed_days: list[str] = []

        async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
            current = d_start
            while current <= d_end:
                payload = _build_day_payload(
                    payload_template, current, d_start=d_start, d_end=d_end
                )
                try:
                    if current == d_start:
                        print(f"[CRM Export] sample payload: {payload}")
                    resp = await client.post(CRM_DOWNLOAD_URL, json=payload)
                    ct = resp.headers.get("content-type", "").lower()
                    print(f"[CRM Export] {current} → HTTP {resp.status_code} | ct={ct} | size={len(resp.content)}")

                    if resp.status_code == 401:
                        raise HTTPException(
                            401,
                            "Token CRM đã hết hạn — hãy truy cập lại trang CRM để extension tự động làm mới."
                        )
                    if resp.status_code != 200:
                        snippet = resp.text[:300] if resp.text else "(empty)"
                        print(f"[CRM Export] {current} non-200 body: {snippet}")
                        failed_days.append(current.isoformat())
                        current += timedelta(days=1)
                        continue

                    try:
                        df = await _fetch_crm_day_df(client, resp, ct)
                        if df is None or df.empty:
                            print(f"[CRM Export] {current} no data rows")
                            failed_days.append(current.isoformat())
                            current += timedelta(days=1)
                            continue

                        df["Date_Report"] = current.isoformat()
                        all_dfs.append(df)
                        print(f"[CRM Export] {current} OK → {len(df)} rows")
                    except HTTPException:
                        raise
                    except Exception as parse_err:
                        print(f"[CRM Export] parse failed {current}: {parse_err}")
                        failed_days.append(current.isoformat())

                except HTTPException:
                    raise
                except Exception as req_err:
                    print(f"[CRM Export] request failed {current}: {req_err}")
                    failed_days.append(current.isoformat())

                current += timedelta(days=1)

        if not all_dfs:
            detail = "CRM API không trả về dữ liệu nào trong khoảng thời gian này."
            if failed_days:
                detail += f" Các ngày lỗi ({len(failed_days)}): {', '.join(failed_days[:5])}"
                detail += " — Xem log backend để biết chi tiết lỗi từng ngày."
            print(f"[CRM Export] FAILED: all {len(failed_days)} days failed, 0 rows collected")
            raise HTTPException(502, detail)

        # Gộp toàn bộ data
        master_df = pd.concat(all_dfs, ignore_index=True)

        # ── Upsert vào crm_sales_data (background, không block file download) ──
        upserted = 0
        if sb:
            try:
                upserted = _upsert_crm_sales(sb, master_df)
                print(f"[CRM Upsert] {upserted}/{len(master_df)} rows → crm_sales_data")
            except Exception as exc:
                print(f"[CRM Upsert] failed (non-fatal): {exc}")

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            master_df.to_excel(writer, index=False, sheet_name="Master")
        output.seek(0)

        label = f"{start_date}_to_{end_date}".replace("-", "")
        filename = f"Master_Sales_Data_{label}.xlsx"

        # Ghi log tóm tắt
        print(
            f"[CRM Export] {len(master_df)} rows | "
            f"{len(all_dfs)} ngày OK | {len(failed_days)} ngày lỗi | "
            f"{upserted} rows upserted to DB"
        )

        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
