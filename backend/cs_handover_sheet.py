"""Sale→CS handover (khâu 1) — đẩy dòng bàn giao sang Google Sheet khi course có Order ID.

Luồng: Thu Hiền gắn order_id (PATCH course) → sau sync Sổ → gọi `maybe_push_cs_handover`.
Mỗi course (1 bé/1 đơn) = 1 dòng sheet. Đẩy CẢ KH mới lẫn gia hạn (Hoàng chốt 21/10);
tag "KH mới"/"Gia hạn" để app CS tự lọc (chỉ đơn new sinh ticket phân bổ CS — khâu 2, không thuộc GMV).

Ghi theo TÊN cột (schema mỗi sheet/tab khác nhau) — KHÔNG hardcode index. Cột `Contact ID`
(+ `Kênh liên hệ` cho tab Team 2/gia hạn) do chủ sheet thêm ở cuối; thiếu cột → bỏ qua field đó.
Non-fatal: lỗi ghi sheet KHÔNG làm fail việc gắn order_id/ledger. Dedup per-course bằng
`handover_pushed_at` trong uids_data JSONB (set chỉ khi append thành công).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from utils.team_mapper import get_canonical_team

# Scope GHI (khác client readonly của gsheet_ledger_import). SA cần Editor trên 3 sheet.
GSHEET_WRITE_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# --- Sheet bàn giao (anh Minh cung cấp 21/10) ---
_SHEET_IH2_OFFLINE = "1XhQDCQcnoi1iM7miHsikSMNN1SjRei0CZDWgm15AtD8"
_SHEET_HCM = "13eRuNcvduS5UMzNhV2Gc1ROZcyR9WIqf6TDv4m8Qt-k"
_SHEET_IH1 = "1212UXIMAuCiVDif8Lw6PnfaN8pTu3RU6GSXUMzBl-1A"

# team canonical (team_mapper) → (spreadsheet_id, tab KH mới, tab gia hạn)
# Tab chung (KH mới + gia hạn) thì 2 tab trỏ cùng tên + ghi thêm cột tag.
# LƯU Ý tên tab có dấu cách: HCM "Bàn giao KH " (cuối), IH1 gia hạn " Bàn giao KH gia hạn" (đầu).
_ROUTES: dict[str, tuple[str, str, str]] = {
    "Offline": (_SHEET_IH2_OFFLINE, "Bàn giao KH mới + gia hạn Offline team", "Bàn giao KH mới + gia hạn Offline team"),
    "Linh Dam (Store)": (_SHEET_IH2_OFFLINE, "Bàn giao KH mới + gia hạn Offline team", "Bàn giao KH mới + gia hạn Offline team"),
    "An Binh (Store)": (_SHEET_IH2_OFFLINE, "Bàn giao KH mới + gia hạn Offline team", "Bàn giao KH mới + gia hạn Offline team"),
    "Inhouse 2": (_SHEET_IH2_OFFLINE, "Bàn giao KH mới Team 2", "Bàn giao KH gia hạn Team 2"),
    "HCM (Online)": (_SHEET_HCM, "Bàn giao KH ", "Bàn giao KH "),
    "Inhouse 1": (_SHEET_IH1, "Bàn giao KH mới", " Bàn giao KH gia hạn"),
}
# Team dùng tab CHUNG (KH mới + gia hạn 1 tab) → cần ghi cột tag "KH mới/ gia hạn".
_SHARED_TAG_TEAMS = {"Offline", "Linh Dam (Store)", "An Binh (Store)", "HCM (Online)"}

# app field → tên cột ứng viên (ưu tiên theo thứ tự; match theo tên, KHÔNG index).
# Cột không có trong tab → bỏ qua field đó (ghi dòng một phần, CS/GVCN điền nốt).
_FIELD_HEADERS: dict[str, list[str]] = {
    "ngay_ban_giao": ["Ngày bàn giao"],
    "sale": ["TVTS", "Sale"],            # Team 2 dùng TVTS; tab khác dùng Sale (ghi full name)
    "ten_kh": ["Họ tên", "Tên KH"],      # Team 2 "Họ tên"; tab KH mới "Tên KH"
    "ten_hoc_sinh": ["Tên học sinh"],
    "uid": ["UID"],
    "sdt": ["SDT KH", "SDT", "SĐT"],
    "goi_hoc": ["Gói học"],
    "so_tien": ["Số tiền"],
    "kenh_cham_soc": ["Kênh liên hệ"],
    "contact_id": ["Contact ID"],
    "note": ["Note", "Ghi chú"],         # Team 2 note = "Note"; tab KH mới = "Ghi chú" (ô sale, khớp đầu tiên)
    "tag": ["KH mới/ gia hạn"],          # chỉ tab chung
}


def _norm(s: Any) -> str:
    return " ".join(str(s or "").replace("\n", " ").split()).strip().lower()


def resolve_route(team_canonical: str, is_gia_han: bool) -> tuple[str, str] | None:
    """(spreadsheet_id, tab) theo team + KH mới/gia hạn; None nếu team không có sheet."""
    r = _ROUTES.get(team_canonical)
    if not r:
        return None
    sheet, tab_new, tab_renew = r
    return (sheet, tab_renew if is_gia_han else tab_new)


def build_field_values(
    pr: dict[str, Any],
    uid_block: dict[str, Any],
    course: dict[str, Any],
    *,
    is_gia_han: bool,
    sale_name: str,
) -> dict[str, Any]:
    """Giá trị theo app-field cho 1 dòng sheet (1 course/1 bé)."""
    return {
        "ngay_ban_giao": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
        "sale": sale_name or str(pr.get("sale_email") or ""),
        "ten_kh": str(pr.get("name") or ""),
        "ten_hoc_sinh": str(uid_block.get("name") or pr.get("child_name") or ""),
        "uid": str(uid_block.get("uid") or ""),
        "sdt": str(uid_block.get("phone") or pr.get("phone") or ""),
        "goi_hoc": str(course.get("name") or ""),
        "so_tien": course.get("amount") or "",
        "kenh_cham_soc": str(course.get("care_channel") or ""),
        "contact_id": str(course.get("care_contact_id") or ""),
        "note": str(course.get("handover_note") or ""),
        "tag": "Gia hạn" if is_gia_han else "KH mới",
    }


def _match_col(header_cells: list[Any], candidates: list[str], used: set[int]) -> int | None:
    """Index cột đầu tiên khớp 1 trong candidates (bằng tên hoặc startswith sau normalize)."""
    hnorm = [_norm(c) for c in header_cells]
    for cand in candidates:
        cn = _norm(cand)
        if not cn:
            continue
        for i, h in enumerate(hnorm):
            if i in used or not h:
                continue
            if h == cn or h.startswith(cn):
                return i
    return None


def build_row_values(header_cells: list[Any], field_values: dict[str, Any]) -> list[Any]:
    """Dàn giá trị vào đúng cột theo header (blank cột không map). Đủ rộng tới cột xa nhất."""
    row: list[Any] = [""] * len(header_cells)
    used: set[int] = set()
    for field, cands in _FIELD_HEADERS.items():
        if field not in field_values:
            continue
        idx = _match_col(header_cells, cands, used)
        if idx is None:
            continue
        used.add(idx)
        while idx >= len(row):
            row.append("")
        v = field_values[field]
        row[idx] = "" if v is None else v
    return row


# --- I/O (mock trong test) ---

def _sheets_write_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    path = (os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "") or "").strip().strip('"').strip("'")
    if not path or not os.path.isfile(path):
        raise FileNotFoundError(
            f"GOOGLE_SERVICE_ACCOUNT_JSON thiếu/không tồn tại: {path!r} — cần cho ghi sheet bàn giao"
        )
    creds = service_account.Credentials.from_service_account_file(path, scopes=GSHEET_WRITE_SCOPES)
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _read_header_cells(service, spreadsheet_id: str, tab: str) -> list[Any]:
    """Dòng header = dòng chứa 'STT' trong A1:BZ3 (KH mới header dòng 2, Team 2 dòng 1)."""
    res = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{tab}'!A1:BZ3")
        .execute()
    )
    rows = res.get("values") or []
    for r in rows:
        if any(_norm(c) == "stt" for c in r):
            return r
    # fallback: dòng có 'sale'/'tvts'
    for r in rows:
        if any(_norm(c) in ("sale", "tvts") for c in r):
            return r
    return []


def _append_row(service, spreadsheet_id: str, tab: str, row: list[Any]) -> None:
    service.spreadsheets().values().append(
        spreadsheetId=spreadsheet_id,
        range=f"'{tab}'!A1",
        valueInputOption="USER_ENTERED",
        insertDataOption="INSERT_ROWS",
        body={"values": [row]},
    ).execute()


# --- Supabase helpers ---

def _course_order_id(course: dict[str, Any]) -> str:
    raw = course.get("order_id")
    if raw in (None, ""):
        raw = course.get("orderId")
    return str(raw or "").strip()


def _fetch_pr(sb, pr_id: str) -> dict[str, Any] | None:
    if not pr_id:
        return None
    try:
        res = (
            sb.table("payment_requests")
            .select("id, name, child_name, phone, sale_email")
            .eq("id", pr_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print(f"[cs_handover] fetch PR {pr_id} lỗi: {exc}")
        return None
    return res.data[0] if res.data else None


def _fetch_sale(sb, sale_email: str) -> dict[str, Any] | None:
    if not sale_email:
        return None
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("display_name, crm_name, team")
            .ilike("email", sale_email)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print(f"[cs_handover] fetch sale {sale_email} lỗi: {exc}")
        return None
    return res.data[0] if res.data else None


def _mark_handover_pushed(sb, ar_id: str, uids_data: list[Any], course_code: str) -> None:
    """Set handover_pushed_at per-course rồi ghi lại uids_data (dedup, không migration)."""
    now = datetime.now(timezone.utc).isoformat()
    for ub in uids_data or []:
        for c in (ub.get("courses") or []):
            if str(c.get("code") or "") == str(course_code):
                c["handover_pushed_at"] = now
    sb.table("active_requests").update({"uids_data": uids_data}).eq("id", ar_id).execute()


def maybe_push_cs_handover(sb, ar_row: dict[str, Any], course_code: str) -> None:
    """Đẩy 1 dòng bàn giao cho course vừa có order_id. Non-fatal — nuốt mọi lỗi (chỉ log)."""
    try:
        ar_id = str(ar_row.get("id") or "")
        uids = ar_row.get("uids_data") or []
        uid_block: dict[str, Any] | None = None
        course: dict[str, Any] | None = None
        for ub in uids:
            for c in (ub.get("courses") or []):
                if str(c.get("code") or "") == str(course_code):
                    uid_block, course = ub, c
                    break
            if course:
                break
        if not course or uid_block is None:
            return
        if not _course_order_id(course):
            return  # điều kiện vào sheet = có Order ID
        if course.get("handover_pushed_at"):
            return  # đã đẩy — dedup

        pr = _fetch_pr(sb, str(ar_row.get("pr_id") or ""))
        if not pr:
            print(f"[cs_handover] skip AR {ar_id} course {course_code}: không có PR")
            return
        sale_email = str(pr.get("sale_email") or "").strip().lower()
        sale = _fetch_sale(sb, sale_email) or {}
        team = get_canonical_team((sale.get("team") or "").strip())
        is_gia_han = str(course.get("lead_source") or "").strip() == "gia_han"
        route = resolve_route(team, is_gia_han)
        if not route:
            print(f"[cs_handover] skip AR {ar_id} course {course_code}: team {team!r} chưa có sheet bàn giao")
            return
        spreadsheet_id, tab = route
        sale_name = str(sale.get("display_name") or sale.get("crm_name") or sale_email)
        field_values = build_field_values(pr, uid_block, course, is_gia_han=is_gia_han, sale_name=sale_name)

        service = _sheets_write_service()
        header = _read_header_cells(service, spreadsheet_id, tab)
        if not header:
            print(f"[cs_handover] skip: không đọc được header tab {tab!r} ({spreadsheet_id})")
            return
        row = build_row_values(header, field_values)
        _append_row(service, spreadsheet_id, tab, row)
        _mark_handover_pushed(sb, ar_id, uids, course_code)
        print(f"[cs_handover] pushed AR {ar_id} course {course_code} → {tab!r} ({'gia hạn' if is_gia_han else 'KH mới'})")
    except Exception as exc:
        print(f"[cs_handover] push non-fatal error: {exc}")
