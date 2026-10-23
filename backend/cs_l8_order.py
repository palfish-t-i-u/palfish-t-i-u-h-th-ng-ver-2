"""Ghi đơn IH2 (Team 2) vào "Tổng hợp L8" (sheet báo cáo ngoài) + dedup cột W (App Order ID).

Bối cảnh: team IH2 vẫn điền đơn tay vào L8 (báo cáo doanh thu của họ, có GV/Tạo nhóm app ko có).
App ghi đơn (nếu team CHƯA điền) + đóng dấu order_id ở cột W để KHÔNG trùng. Kênh/Contact thì
app ghi thẳng vào 2 tab bàn giao (xem cs_handover_sheet._match_write_handover) — ở đây CHỈ lo
phần ghi ĐƠN vào L8.

Map (đã chốt qua data thật 22/10):
- TVTS: tra "TVTS List 2" (crm_name không dấu → mã "HN2 - X"); thiếu → trống + log.
- Loại cts: lead_source (gia_han/kho_chung/gioi_thieu) ưu tiên, else lead_channel → nhãn L8.
- Ngày chuyển tiền: payment_lines.paid_at (fallback confirmed_at) sớm nhất, giờ VN.
- Gói học: mã buổi "base+bonus". Trạng thái: "Chưa kích hoạt" (team cập nhật sau). Tháng: YYYY-M.
- GV / Tạo nhóm GV: để TRỐNG (team điền — app không có).

Dedup (khoá UID + Số tiền, con dấu W):
  app_row = dòng có W == order_id (app đã ghi).  sale_row = dòng W trống, khớp UID+tiền (team điền).
  - có app_row + sale_row  → xoá nội dung app_row, đóng dấu W lên sale_row   → 'cleaned'
  - chỉ app_row            → đã ghi rồi                                       → 'exists'
  - chỉ sale_row           → đóng dấu W lên sale_row (không tạo mới)          → 'stamped'
  - không có gì            → append dòng mới + W                              → 'appended'
  ≥2 sale_row mập mờ → không đoán, chỉ append nếu chưa có app_row? → 'ambiguous' (bỏ, log).
"""
from __future__ import annotations

import re
import time
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

from cs_handover_sheet import _amount_key, _col_a1, _match_col, _next_empty_row, _norm, _read_header_cells

_SHEET_L8 = "1H6hslccd_dEKwl6UOhn5Jebl6ppowno6WO1jfRINSTw"
_L8_TAB = "Tổng hợp L8"
_TVTS_SHEET = "1h58XWvtuH8fvX88EFanzyVjTJlIbLVNAOJy90Mw5uv0"
_TVTS_TAB = "TVTS List 2"
_VN = timezone(timedelta(hours=7))

# --- Loại cts: lead_source (ưu tiên) + lead_channel → nhãn L8 (bộ lọc QUERY tab bàn giao nhận) ---
_SOURCE_TO_LOAICTS = {"gia_han": "Gia hạn", "kho_chung": "Kho chung", "gioi_thieu": "Refer"}
_CHANNEL_TO_LOAICTS = {
    "300265": "Facebook", "300281": "Facebook", "300581": "Facebook",
    "300431": "Livestream", "300431_ls_tt": "Livestream",
    "300561": "Instant form", "300571": "Instant form",
    "300531": "Paid Partnership",
    "300301": "Tiktok", "300551": "Tiktok shop",
    "300361": "Hotline", "832": "Refer",
    "300444": "Tài App", "300445": "Tài App",   # sheet viết 'Tài App' (sai dấu) — ghi khớp lọc
    "300311": "Tự kiếm", "300471": "Tự kiếm",
}


def loai_cts(lead_source: Any, lead_channel: Any) -> str:
    ls = str(lead_source or "").strip()
    lc = str(lead_channel or "").strip()
    if ls in _SOURCE_TO_LOAICTS:
        return _SOURCE_TO_LOAICTS[ls]
    if lc in _CHANNEL_TO_LOAICTS:
        return _CHANNEL_TO_LOAICTS[lc]
    return lc or ls  # nguồn lạ: ghi nguyên văn (anh Minh dặn); IH2 thực tế không dính


def _fold(s: Any) -> str:
    s = str(s or "").replace("\xa0", " ").replace("đ", "d").replace("Đ", "D")
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    return " ".join(s.split()).strip().lower()


# Typo trên sheet TVTS (tên điền sai) → mã đúng. Mở rộng khi phát hiện thêm.
_TVTS_OVERRIDE = {"vu thi khanh huyen": "HN2 - HuyenVTK"}

_tvts_cache: dict[str, str] = {}
_tvts_loaded_at: float = 0.0
_TVTS_TTL = 3600.0


def _load_tvts(service) -> dict[str, str]:
    """crm_name (folded) → mã TVTS. Cache 1h. IMPORTRANGE từ nguồn team tự quản."""
    global _tvts_cache, _tvts_loaded_at
    now = time.time()
    if _tvts_cache and (now - _tvts_loaded_at) < _TVTS_TTL:
        return _tvts_cache
    try:
        res = service.spreadsheets().values().get(
            spreadsheetId=_TVTS_SHEET, range=f"'{_TVTS_TAB}'!A1:L500").execute()
        rows = res.get("values") or []
        m: dict[str, str] = {}
        for r in rows[2:]:
            if len(r) > 9 and r[0] and r[9] and "HN2" in str(r[9]):
                m[_fold(r[0])] = str(r[9]).strip()
        m.update(_TVTS_OVERRIDE)
        _tvts_cache, _tvts_loaded_at = m, now
    except Exception as exc:
        print(f"[cs_l8] load TVTS list lỗi (giữ cache cũ): {exc}")
    return _tvts_cache


def tvts_code(service, crm_name: str) -> str:
    code = _load_tvts(service).get(_fold(crm_name), "")
    if not code:
        print(f"[cs_l8] TVTS THIẾU cho sale {crm_name!r} — team cần thêm vào TVTS List 2")
    return code


def _goi_buoi(name: str) -> str:
    m = re.search(r"(\d+)\s*[A-Za-z一-鿿_\-]*\s*\+\s*(\d+)", str(name or ""))
    return f"{m.group(1)}+{m.group(2)}" if m else ""


def fetch_payment_date(sb, pr_id: str) -> str:
    """Ngày chuyển tiền = paid_at (fallback confirmed_at) sớm nhất của payment_lines. 'dd/mm/yyyy'|''."""
    if not pr_id:
        return ""
    try:
        res = (sb.table("payment_lines")
               .select("paid_at, confirmed_at, status, payment_request_id")
               .eq("payment_request_id", pr_id).execute())
    except Exception as exc:
        print(f"[cs_l8] fetch payment_lines {pr_id} lỗi: {exc}")
        return ""
    dates = [str(r.get("paid_at") or r.get("confirmed_at")) for r in (res.data or [])
             if (r.get("paid_at") or r.get("confirmed_at"))]
    if not dates:
        return ""
    try:
        dt = datetime.fromisoformat(min(dates).replace("Z", "+00:00")).astimezone(_VN)
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return ""


def build_l8_fields(
    service, *, sale_crm_name: str, pr: dict[str, Any], uid_block: dict[str, Any],
    course: dict[str, Any], is_gia_han: bool, payment_date: str, order_id: str,
    phone_intl: str,
) -> dict[str, list[str]]:
    """{candidate-header: value} cho 1 dòng L8. GV/Tạo nhóm KHÔNG có → bỏ (team điền)."""
    parent = str(pr.get("name") or "").strip()
    child = str(uid_block.get("name") or pr.get("child_name") or "").strip()
    hoten = f"{parent} - {child}" if (parent and child) else (parent or child)
    today = datetime.now(_VN)
    return {
        "TVTS": tvts_code(service, sale_crm_name),
        "Loại cts": loai_cts(course.get("lead_source"), course.get("lead_channel")),
        "Họ tên": hoten,
        "SDT": phone_intl,
        "UID": str(uid_block.get("uid") or "").strip(),
        "Ngày chuyển tiền": payment_date,
        "Số tiền": _amount_key(course.get("amount")),   # '8480000' (bỏ .0) → Sheets tự format
        "Gói học": _goi_buoi(course.get("name")),
        "Trạng thái": "Chưa kích hoạt",
        "Tháng": f"{today.year}-{today.month}",
        "App Order ID": str(order_id),
    }


def _plan_l8_row(header: list[Any], fields: dict[str, Any]) -> tuple[list[Any], set[int]]:
    """Dàn fields vào đúng cột L8 theo TÊN. Trả (row dài bằng header, owned_cols)."""
    row: list[Any] = [""] * len(header)
    owned: set[int] = set()
    used: set[int] = set()
    for hdr_name, val in fields.items():
        idx = _match_col(header, [hdr_name], used)
        if idx is None:
            continue
        used.add(idx)
        while idx >= len(row):
            row.append("")
        row[idx] = "" if val is None else val
        owned.add(idx)
    return row, owned


def upsert_l8_order(
    service, header: list[Any], fields: dict[str, Any], *, uid: str, so_tien: str, order_id: str,
    dry_run: bool = False,
) -> str:
    """Ghi/dedup 1 đơn vào L8. Xem docstring module cho 4 ca. Trả outcome string.
    dry_run=True: KHÔNG ghi, chỉ in dự kiến."""
    uid_i = _match_col(header, ["UID"], set())
    tien_i = _match_col(header, ["Số tiền"], set())
    w_i = _match_col(header, ["App Order ID"], set())
    if uid_i is None or w_i is None:
        return "no_cols"
    if not uid or not order_id:
        return "skip"

    last_col = max([i for i in (uid_i, tien_i, w_i) if i is not None] + [len(header) - 1])
    res = service.spreadsheets().values().get(
        spreadsheetId=_SHEET_L8, range=f"'{_L8_TAB}'!A1:{_col_a1(last_col)}").execute()
    rows = res.get("values") or []

    def cell(r: list[Any], i: int | None) -> str:
        return str(r[i]) if (i is not None and len(r) > i) else ""

    target_uid = _norm(uid)
    app_rows: list[int] = []   # W == order_id
    sale_rows: list[int] = []  # W trống, UID (+tiền) khớp
    for ri in range(1, len(rows)):
        r = rows[ri]
        w = cell(r, w_i).strip()
        if w == str(order_id):
            app_rows.append(ri)
            continue
        if w:  # dòng app của order khác → bỏ qua
            continue
        if _norm(cell(r, uid_i)) != target_uid:
            continue
        if so_tien and tien_i is not None:
            rt = _amount_key(cell(r, tien_i))
            if rt and rt != so_tien:
                continue
        sale_rows.append(ri)

    row_vals, owned = _plan_l8_row(header, fields)

    def _row_preview() -> str:
        return " · ".join(f"{_col_a1(i)}={row_vals[i]!r}" for i in sorted(owned) if str(row_vals[i]).strip())

    # Ca 4: có cả app_row + sale_row → xoá nội dung app_row, đóng dấu W lên sale_row.
    if app_rows and sale_rows:
        if dry_run:
            print(f"   [DRY] CLEANED: xoá dòng app {[r+1 for r in app_rows]}, đóng dấu W lên dòng sale {sale_rows[0]+1}")
            return "cleaned"
        for ri in app_rows:
            _clear_row_cells(service, ri + 1, owned)
        _stamp_w(service, sale_rows[0] + 1, w_i, order_id)
        return "cleaned"
    if app_rows:
        if dry_run:
            print(f"   [DRY] EXISTS: đã có dòng app W={order_id} tại dòng {app_rows[0]+1} → bỏ qua")
        return "exists"
    if len(sale_rows) > 1:
        if dry_run:
            print(f"   [DRY] AMBIGUOUS: {len(sale_rows)} dòng sale khớp {[r+1 for r in sale_rows]} → đóng dấu dòng đầu")
            return "ambiguous"
        print(f"[cs_l8] UID {uid} khớp {len(sale_rows)} dòng sale L8 — mập mờ, chỉ đóng dấu dòng đầu")
        _stamp_w(service, sale_rows[0] + 1, w_i, order_id)
        return "ambiguous"
    if sale_rows:
        if dry_run:
            print(f"   [DRY] STAMPED: đóng dấu W={order_id} lên dòng sale {sale_rows[0]+1} (team đã điền đơn)")
            return "stamped"
        _stamp_w(service, sale_rows[0] + 1, w_i, order_id)
        return "stamped"
    # Ca 1: chưa có → append dòng mới + W.
    if dry_run:
        print(f"   [DRY] APPENDED: ghi dòng MỚI → {_row_preview()}")
        return "appended"
    _append_l8(service, row_vals, owned)
    return "appended"


def _stamp_w(service, sheet_row: int, w_i: int, order_id: str) -> None:
    service.spreadsheets().values().update(
        spreadsheetId=_SHEET_L8, range=f"'{_L8_TAB}'!{_col_a1(w_i)}{sheet_row}",
        valueInputOption="RAW", body={"values": [[str(order_id)]]}).execute()


def _clear_row_cells(service, sheet_row: int, cols: set[int]) -> None:
    """Xoá nội dung các cột app sở hữu trên 1 dòng (không deleteDimension → không lệch sheet)."""
    for c in sorted(cols):
        service.spreadsheets().values().update(
            spreadsheetId=_SHEET_L8, range=f"'{_L8_TAB}'!{_col_a1(c)}{sheet_row}",
            valueInputOption="RAW", body={"values": [[""]]}).execute()


def _append_l8(service, row_vals: list[Any], owned: set[int]) -> None:
    """Ghi dòng mới ở hàng trống cuối, CHỈ các cột app sở hữu (đoạn liền kề)."""
    row_no = _next_empty_row(service, _SHEET_L8, _L8_TAB)
    segs: list[tuple[int, list[Any]]] = []
    cur_start: int | None = None
    cur: list[Any] = []
    for i in range(len(row_vals)):
        if i not in owned:
            if cur:
                segs.append((cur_start, cur))
            cur_start, cur = None, []
            continue
        if cur_start is None:
            cur_start = i
        cur.append(row_vals[i])
    if cur:
        segs.append((cur_start, cur))
    for col0, vals in segs:
        service.spreadsheets().values().update(
            spreadsheetId=_SHEET_L8, range=f"'{_L8_TAB}'!{_col_a1(col0)}{row_no}",
            valueInputOption="USER_ENTERED", body={"values": [vals]}).execute()


def read_l8_header(service) -> list[Any]:
    return _read_header_cells(service, _SHEET_L8, _L8_TAB)
