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
import re
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
    # Gói học: auto-fill per-sheet (xem _goi_hoc_label). Giá trị tính riêng từng tab
    # (tháng vs mã buổi) nên maybe_push_cs_handover set field này; build_field_values KHÔNG.
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
        # goi_hoc bỏ: sale/CS tự chọn dropdown (xem _FIELD_HEADERS).
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


def build_row_values(header_cells: list[Any], field_values: dict[str, Any]) -> tuple[list[Any], set[int]]:
    """Dàn giá trị vào đúng cột theo header. Trả (row, owned_cols): owned_cols = tập index
    cột G3 THỰC SỰ map — chỉ ghi các cột này, KHÔNG đụng cột khác (GVCN, Handover date and
    time + Thời gian tạo nhóm của Chung, STT, Gói học, Trình độ, Quốc Tịch…)."""
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
    return row, used


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


def _col_a1(idx0: int) -> str:
    """0 -> A, 25 -> Z, 26 -> AA."""
    s, n = "", idx0
    while True:
        s = chr(ord("A") + n % 26) + s
        n = n // 26 - 1
        if n < 0:
            return s


def _protected_cols(service, spreadsheet_id: str, tab: str) -> set[int]:
    """Cột (index 0-based) bị khóa 'chỉ xem' trên tab — protected range toàn cột (không chặn hàng).

    append/update chạm vào ô protected (kể cả ghi rỗng) sẽ bị Google từ chối → né các cột này.
    """
    try:
        meta = (
            service.spreadsheets()
            .get(
                spreadsheetId=spreadsheet_id,
                fields="sheets(properties(title),protectedRanges(range(startRowIndex,endRowIndex,startColumnIndex,endColumnIndex),warningOnly))",
            )
            .execute()
        )
    except Exception as exc:
        print(f"[cs_handover] đọc protected range lỗi (bỏ qua): {exc}")
        return set()
    blocked: set[int] = set()
    for sh in meta.get("sheets", []) or []:
        if (sh.get("properties") or {}).get("title") != tab:
            continue
        for pr in sh.get("protectedRanges", []) or []:
            # warningOnly=True chỉ cảnh báo, KHÔNG chặn ghi API → không né (né sẽ mất data).
            if pr.get("warningOnly"):
                continue
            rng = pr.get("range") or {}
            # Chỉ né protected range toàn cột (không giới hạn hàng) — mới chặn hàng append mới.
            if rng.get("startRowIndex") is None and rng.get("endRowIndex") is None:
                c0, c1 = rng.get("startColumnIndex"), rng.get("endColumnIndex")
                if c0 is not None and c1 is not None:
                    blocked.update(range(c0, c1))
    return blocked


def _row_segments(row: list[Any], write_cols: set[int]) -> list[tuple[int, list[Any]]]:
    """Cắt thành các đoạn cột liền nhau CHỈ gồm cột trong write_cols (G3 sở hữu, không bị
    khóa). Cột ngoài write_cols KHÔNG đụng tới (không ghi "" đè). Trả [(start_col0, [values])]."""
    segs: list[tuple[int, list[Any]]] = []
    cur_start: int | None = None
    cur: list[Any] = []
    for i in range(len(row)):
        if i not in write_cols:
            if cur:
                segs.append((cur_start, cur))
            cur_start, cur = None, []
            continue
        if cur_start is None:
            cur_start = i
        cur.append(row[i])
    if cur:
        segs.append((cur_start, cur))
    return segs


def _next_empty_row(service, spreadsheet_id: str, tab: str) -> int:
    """Hàng trống kế tiếp = dưới MỌI dữ liệu hiện có. Đọc cả tab (API cắt hàng trống cuối)
    → len+1. KHÔNG dùng append (append anchor vào cột có ô-1 rỗng do merge banner sẽ ghi
    nhầm vào row 1)."""
    res = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{tab}'", majorDimension="ROWS")
        .execute()
    )
    return len((res.get("values") or [])) + 1


def _append_row(service, spreadsheet_id: str, tab: str, row: list[Any], owned_cols: set[int]) -> None:
    """Ghi 1 hàng. CHỈ ghi các cột G3 sở hữu (owned_cols) trừ cột bị khóa cứng — KHÔNG đụng
    cột của Chung (Handover date / Thời gian tạo nhóm) hay GVCN. Tìm hàng trống cuối rồi
    update từng đoạn cột liền kề."""
    blocked = _protected_cols(service, spreadsheet_id, tab)
    write_cols = {c for c in owned_cols if c not in blocked}
    segs = _row_segments(row, write_cols)
    if not segs:
        return
    row_no = _next_empty_row(service, spreadsheet_id, tab)
    for col0, vals in segs:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab}'!{_col_a1(col0)}{row_no}",
            valueInputOption="USER_ENTERED",
            body={"values": [vals]},
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


# --- Gói học: auto-fill per-sheet (logic "Split package" của Chung, port 22/10) ---
# Buổi gốc → số tháng. App/CRM đặt tên theo buổi (vd "48 PHI+5"), sheet dropdown theo tháng.
_TERM_MONTHS = {24: 3, 32: 4, 48: 6, 72: 9, 96: 12, 144: 18, 192: 24}
_VALID_MONTHS = {3, 4, 6, 9, 12, 18, 24, 36}
# Combo chuẩn có mặt ở các dropdown — dùng khi tab KHÔNG đọc được dropdown (vd IH1 mới range-ref).
# Native 4/18 KHÔNG nằm đây → edge để trống cho đồng nhất (edge → blank).
_SAFE_FALLBACK = {("PHI", m) for m in (3, 4, 6, 9, 12, 18, 24)} | {("US-UK", m) for m in (3, 6, 9, 12, 24)}


def _parse_course(name: str) -> tuple[str, int | None, int | None, int | None]:
    """course.name → (loại PHI/US-UK/CONFLICT/'', base, bonus, tháng)."""
    phi = bool(re.search(r"PHI", name, re.I)) or ("菲" in name) or bool(re.search(r"(^|[^A-Za-z])PH(?![A-Za-z])", name, re.I))
    usuk = (bool(re.search(r"(^|[^A-Za-z])US(?![A-Za-z])", name, re.I))
            or bool(re.search(r"(^|[^A-Za-z])UK(?![A-Za-z])", name, re.I))
            or bool(re.search(r"Native", name, re.I)) or bool(re.search(r"欧美|欧|美|英", name)))
    ct = "CONFLICT" if (phi and usuk) else ("PHI" if phi else ("US-UK" if usuk else ""))
    m = re.search(r"(\d+)\s*[A-Za-z一-鿿_\-]*\s*\+\s*(\d+)", name)
    if m:
        base, bonus = int(m.group(1)), int(m.group(2))
    else:
        b = re.search(r"(\d+)\s*(?:B|节)(?![A-Za-z])", name, re.I)
        base, bonus = (int(b.group(1)), None) if b else (None, None)
    months = _TERM_MONTHS.get(base) if ct in ("PHI", "US-UK") else None
    return ct, base, bonus, months


def _parse_dropdown_entry(s: str) -> tuple[str, int] | None:
    """1 mục dropdown ('Philipine 6 tháng','Phil 9 tháng','Phi 6th','Native 12th','Phil 1 năm')
    → (loại, tháng); None nếu rác (Ket/buổi/Gói học)."""
    tn = s.strip().lower()
    if re.search(r"\d+\s*b(?:uổi|uoi)?\b", tn) or "ket" in tn or tn in ("gói học", "goi hoc"):
        return None
    if re.search(r"nativ|欧|美|英|us-?uk", tn):
        typ = "US-UK"
    elif re.search(r"phi|菲", tn):
        typ = "PHI"
    else:
        return None
    if re.search(r"1\s*n[ăa]m", tn):
        return (typ, 12)
    m = re.search(r"(\d+)\s*(?:tháng|thang|th|t)\b", tn) or re.search(r"(\d+)", tn)
    if not m:
        return None
    mo = int(m.group(1))
    return (typ, mo) if mo in _VALID_MONTHS else None


def _build_thang_index(dropdown: list[str]) -> dict[tuple[str, int], str]:
    """{(loại,tháng): chuỗi dropdown ĐÚNG}. Ưu tiên mục có 'tháng' đầy đủ, rồi ngắn gọn."""
    idx: dict[tuple[str, int], str] = {}

    def score(entry: str) -> tuple[bool, int]:
        e = entry.lower()
        return (("tháng" in e or "thang" in e), -len(entry))
    for e in dropdown:
        k = _parse_dropdown_entry(e)
        if k and (k not in idx or score(e) > score(idx[k])):
            idx[k] = e
    return idx


def _canonical_goi(ct: str, months: int) -> str:
    return f"{'Philipine' if ct == 'PHI' else 'Native'} {months} tháng"


def _read_goi_hoc_dropdown(service, spreadsheet_id: str, tab: str, col0: int) -> list[str]:
    """Runtime-read: danh sách giá trị dropdown (ONE_OF_LIST) của cột Gói học. Non-fatal."""
    colA1 = _col_a1(col0)
    try:
        meta = (
            service.spreadsheets()
            .get(
                spreadsheetId=spreadsheet_id,
                ranges=[f"'{tab}'!{colA1}2:{colA1}400"],
                includeGridData=True,
                fields="sheets(data(rowData(values(dataValidation(condition(type,values(userEnteredValue)))))))",
            )
            .execute()
        )
        best: list[str] = []
        for rd in meta["sheets"][0]["data"][0].get("rowData", []):
            for cell in rd.get("values", []):
                dv = cell.get("dataValidation") or {}
                if (dv.get("condition") or {}).get("type") != "ONE_OF_LIST":
                    continue
                vals = [v.get("userEnteredValue") for v in dv["condition"].get("values", [])]
                if len(vals) > len(best):
                    best = [v for v in vals if v]
        return best
    except Exception as exc:
        print(f"[cs_handover] đọc dropdown Gói học lỗi (bỏ qua): {exc}")
        return []


def _goi_hoc_label(service, spreadsheet_id: str, tab: str, header: list[Any], course_name: str) -> str:
    """Nhãn Gói học đúng format của tab. '' nếu không suy được (gói hiếm → để trống)."""
    gi = _match_col(header, _FIELD_HEADERS["goi_hoc"], set())
    if gi is None or not course_name:
        return ""
    ct, base, bonus, months = _parse_course(course_name)
    if "Team 2" in tab:  # Team 2: ghi mã buổi "base+bonus" (dropdown free-text)
        return f"{base}+{bonus}" if (base is not None and bonus is not None) else ""
    if ct not in ("PHI", "US-UK") or not months:
        return ""  # edge (gói hiếm / CONFLICT) → để trống cho sale chọn
    dropdown = _read_goi_hoc_dropdown(service, spreadsheet_id, tab, gi)
    if dropdown:
        # Đọc được dropdown: khớp thì ghi chuỗi đúng; KHÔNG khớp (edge, vd Native 4) → để trống.
        return _build_thang_index(dropdown).get((ct, months)) or ""
    # Dropdown không đọc được (vd IH1 mới range-ref): canonical cho combo chuẩn, edge → để trống.
    return _canonical_goi(ct, months) if (ct, months) in _SAFE_FALLBACK else ""


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
        # Gói học: auto-fill per-sheet (runtime-read dropdown của tab). Rỗng → không ghi cột này.
        goi_hoc = _goi_hoc_label(service, spreadsheet_id, tab, header, str(course.get("name") or ""))
        if goi_hoc:
            field_values["goi_hoc"] = goi_hoc
        row, owned_cols = build_row_values(header, field_values)
        _append_row(service, spreadsheet_id, tab, row, owned_cols)
        _mark_handover_pushed(sb, ar_id, uids, course_code)
        print(f"[cs_handover] pushed AR {ar_id} course {course_code} → {tab!r} ({'gia hạn' if is_gia_han else 'KH mới'})")
    except Exception as exc:
        print(f"[cs_handover] push non-fatal error: {exc}")
