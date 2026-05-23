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
    "https://sea.pri.ibanyu.com/api/kid-oversea-crm/dataMarket/download"
)

MAX_DAYS = 31

# ---------------------------------------------------------------------------
# Column mapping: tên cột CRM (tiếng Trung/Anh) → schema crm_sales_data
# Mỗi key là tên cột đích, value là danh sách tên cột CRM có thể gặp
# ---------------------------------------------------------------------------
_COL_MAP: dict[str, list[str]] = {
    "crm_order_id": ["订单ID", "订单号", "合同号", "order_id", "crm_order_id", "id", "ID"],
    "uid":          ["客户ID", "客户UID", "uid", "user_id", "UID", "客户id"],
    "sale_name":    ["销售", "销售姓名", "销售人员", "sale_name", "sale", "Sale", "销售员"],
    "team":         ["组", "团队", "小组", "team", "Team", "销售组"],
    "department":   ["部门", "department", "Department", "销售部门", "bộ phận"],
    "package_name": ["课程", "课程名称", "产品", "套餐", "package_name", "package",
                     "Package", "gói học", "产品名称"],
    "amount":       ["金额", "合同金额", "amount", "Amount", "价格", "GMV",
                     "gmv", "收入", "单价"],
}

def _find_col(df_cols: list[str], candidates: list[str]) -> str | None:
    """Tìm tên cột đầu tiên khớp (case-insensitive) trong DataFrame."""
    lower_map = {c.lower(): c for c in df_cols}
    for candidate in candidates:
        if candidate in df_cols:
            return candidate
        if candidate.lower() in lower_map:
            return lower_map[candidate.lower()]
    return None


def _df_to_upsert_rows(df: "pd.DataFrame") -> list[dict]:
    """
    Map DataFrame từ CRM → list dicts cho bảng crm_sales_data.
    Mọi cột gốc được lưu vào raw_data để không mất dữ liệu.
    """
    import json
    import math

    cols = list(df.columns)
    mapping = {field: _find_col(cols, candidates)
               for field, candidates in _COL_MAP.items()}

    rows = []
    for _, row in df.iterrows():
        raw = {}
        for c in cols:
            val = row[c]
            # Convert numpy/pandas types to Python primitives
            if hasattr(val, "item"):
                val = val.item()
            if isinstance(val, float) and math.isnan(val):
                val = None
            raw[c] = val

        # Lấy crm_order_id — nếu không tìm được thì dùng index làm fallback
        order_id_col = mapping.get("crm_order_id")
        crm_order_id = str(raw.get(order_id_col, "")) if order_id_col else ""
        if not crm_order_id or crm_order_id in ("", "None", "nan"):
            continue  # Bỏ qua row không có order ID

        def _get(field: str):
            col = mapping.get(field)
            return str(raw.get(col, "") or "") if col else ""

        def _get_num(field: str) -> int:
            col = mapping.get(field)
            if not col:
                return 0
            try:
                return int(float(raw.get(col, 0) or 0))
            except (ValueError, TypeError):
                return 0

        report_date = str(raw.get("Date_Report", ""))

        rows.append({
            "crm_order_id": crm_order_id,
            "report_date":  report_date or None,
            "uid":          _get("uid") or None,
            "sale_name":    _get("sale_name") or None,
            "team":         _get("team") or None,
            "department":   _get("department") or None,
            "package_name": _get("package_name") or None,
            "amount":       _get_num("amount"),
            "raw_data":     json.dumps(raw, ensure_ascii=False, default=str),
        })
    return rows


def _upsert_crm_sales(sb, df: "pd.DataFrame") -> int:
    """Upsert DataFrame vào bảng crm_sales_data. Trả về số rows đã upsert."""
    if sb is None:
        return 0
    rows = _df_to_upsert_rows(df)
    if not rows:
        return 0

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


def _ts_ms(d: date, end_of_day: bool = False) -> int:
    """Chuyển date → Unix timestamp milliseconds (đầu/cuối ngày UTC+7)."""
    from datetime import time as _time
    t = _time(23, 59, 59) if end_of_day else _time(0, 0, 0)
    dt = datetime.combine(d, t)
    # UTC+7 → UTC
    dt_utc = dt - timedelta(hours=7)
    return int(dt_utc.timestamp() * 1000)


def _get_cookie(sb) -> str:
    """Lấy cookie từ Supabase hoặc bộ nhớ."""
    if sb:
        try:
            res = sb.table("crm_tokens").select("cookie_value").eq("id", 1).limit(1).execute()
            if res.data:
                return res.data[0].get("cookie_value", "")
        except Exception as exc:
            print(f"crm_tokens get failed: {exc}")
    return _crm_token_mem.get("cookie_value", "")


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

        # Lấy cookie
        sb = supabase_factory()
        cookie = _get_cookie(sb)
        if not cookie:
            raise HTTPException(
                503,
                "Chưa có token CRM — hãy cài Chrome Extension và truy cập trang CRM trước."
            )

        # Cào dữ liệu từng ngày
        all_dfs: list = []
        failed_days: list[str] = []

        headers = {
            "Cookie": cookie,
            "Content-Type": "application/json",
            "Accept": "application/json, application/octet-stream, */*",
            "Referer": "https://sea.pri.ibanyu.com/",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
            ),
        }

        async with httpx.AsyncClient(timeout=30, headers=headers, follow_redirects=True) as client:
            current = d_start
            while current <= d_end:
                payload = {
                    "time_start": _ts_ms(current, end_of_day=False),
                    "time_end": _ts_ms(current, end_of_day=True),
                    "department_id": 2242153,
                    "show_type": 2,
                    "customer_type": 0,
                }
                try:
                    resp = await client.post(CRM_DOWNLOAD_URL, json=payload)
                    if resp.status_code == 401:
                        raise HTTPException(
                            401,
                            "Token CRM đã hết hạn — hãy truy cập lại trang CRM để extension tự động làm mới."
                        )
                    if resp.status_code != 200 or not resp.content:
                        failed_days.append(current.isoformat())
                        current += timedelta(days=1)
                        continue

                    buf = io.BytesIO(resp.content)
                    content_type = resp.headers.get("content-type", "").lower()

                    try:
                        if "sheet" in content_type or "excel" in content_type or content_type == "application/octet-stream":
                            df = pd.read_excel(buf)
                        elif "csv" in content_type or "text" in content_type:
                            df = pd.read_csv(buf)
                        else:
                            # Thử Excel trước, fallback CSV
                            try:
                                df = pd.read_excel(buf)
                            except Exception:
                                buf.seek(0)
                                df = pd.read_csv(buf)

                        df["Date_Report"] = current.isoformat()
                        all_dfs.append(df)
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
            detail = "Không có dữ liệu nào trong khoảng thời gian này."
            if failed_days:
                detail += f" Các ngày lỗi: {', '.join(failed_days)}"
            raise HTTPException(404, detail)

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
