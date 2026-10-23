"""Sale→CS handover (khâu 1) — đẩy dòng bàn giao sang Google Sheet.

v2 (plan docs/plans/PLAN_cs_handover_v2_hybrid_2026-10-23.md): hook gọi `maybe_push_cs_handover`
lúc BÁO ĐƠN (create AR) + khi PATCH course (order_id/Kênh/Contact) + worker dọn nền. Hàm luôn
RE-FETCH AR từ DB (không tin snapshot request) và dedup/claim qua bảng `cs_handover_log`
(`cs_handover_store`) — KHÔNG ghi cờ vào JSONB uids_data nữa (lost update → đẩy đôi AR-1740).
Mỗi course (1 bé/1 đơn) = 1 dòng sheet. Đẩy CẢ KH mới lẫn gia hạn (Hoàng chốt 21/10);
tag "KH mới"/"Gia hạn" để app CS tự lọc (chỉ đơn new sinh ticket phân bổ CS — khâu 2, không thuộc GMV).

Ghi theo TÊN cột (schema mỗi sheet/tab khác nhau) — KHÔNG hardcode index. Cột `Contact ID`
(+ `Kênh liên hệ` cho tab Team 2/gia hạn) do chủ sheet thêm ở cuối; thiếu cột → bỏ qua field đó.
Non-fatal: lỗi ghi sheet KHÔNG làm fail việc báo đơn/gắn order_id/ledger.
"""
from __future__ import annotations

import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Any

from utils.team_mapper import get_canonical_team
from utils.zalo_message_builder import format_phone_intl

import cs_handover_store as _store  # claim/dedup v2 (bảng cs_handover_log) — test monkeypatch qua _store

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
    # Inhouse 2 (Team 2): 2 tab bàn giao cột A-N là công thức QUERY (đơn do team điền vào
    # "Tổng hợp L8" ngoài → chảy sang). KHÔNG append được. Thay vào đó MATCH-WRITE: tìm dòng
    # đơn theo UID rồi chỉ GHI 2 ô "Kênh liên hệ"/"Contact ID" (cột tay, team chừa sẵn).
    # Xem _MATCH_WRITE_TEAMS + _match_write_handover. Re-enable 22/10.
    "Inhouse 2": (_SHEET_IH2_OFFLINE, "Bàn giao KH mới Team 2", "Bàn giao KH gia hạn Team 2"),
    "HCM (Online)": (_SHEET_HCM, "Bàn giao KH ", "Bàn giao KH "),
    "Inhouse 1": (_SHEET_IH1, "Bàn giao KH mới", " Bàn giao KH gia hạn"),
}
# Team dùng tab CHUNG (KH mới + gia hạn 1 tab) → cần ghi cột tag "KH mới/ gia hạn".
_SHARED_TAG_TEAMS = {"Offline", "Linh Dam (Store)", "An Binh (Store)", "HCM (Online)"}
# Team ghi kiểu MATCH (không append): dòng đơn do team tự điền L8 → chảy sang tab bàn giao
# qua QUERY. App chỉ tìm đúng dòng (theo UID + Số tiền) rồi bổ sung Kênh liên hệ + Contact ID
# vào 2 ô cột tay có sẵn. KHÔNG tạo dòng mới → không trùng, không đụng L8.
_MATCH_WRITE_TEAMS = {"Inhouse 2"}

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
    # Marker dòng app = course_code (cột cuối tab, chủ sheet thêm — G5-T1). Tab chưa có cột → bỏ qua.
    "app_order_id": ["App Order ID"],
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
        # SĐT: DB lưu số nội địa (vd "977770297"), format kèm mã nước → "84-...".
        "sdt": format_phone_intl(uid_block.get("phone") or pr.get("phone"),
                                 uid_block.get("country") or pr.get("country")) or "",
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


def _field_col_map(header_cells: list[Any], field_values: dict[str, Any]) -> dict[str, int]:
    """app-field → index cột (chỉ field có trong field_values; mỗi cột map 1 field, theo thứ tự
    _FIELD_HEADERS). Dùng chung cho build_row_values / fill-empty / verify để map NHẤT QUÁN."""
    used: set[int] = set()
    out: dict[str, int] = {}
    for field, cands in _FIELD_HEADERS.items():
        if field not in field_values:
            continue
        idx = _match_col(header_cells, cands, used)
        if idx is None:
            continue
        used.add(idx)
        out[field] = idx
    return out


def build_row_values(header_cells: list[Any], field_values: dict[str, Any]) -> tuple[list[Any], set[int]]:
    """Dàn giá trị vào đúng cột theo header. Trả (row, owned_cols): owned_cols = tập index
    cột G3 THỰC SỰ map — chỉ ghi các cột này, KHÔNG đụng cột khác (GVCN, Handover date and
    time + Thời gian tạo nhóm của Chung, STT, Gói học, Trình độ, Quốc Tịch…)."""
    cmap = _field_col_map(header_cells, field_values)
    row: list[Any] = [""] * len(header_cells)
    for field, idx in cmap.items():
        while idx >= len(row):
            row.append("")
        v = field_values[field]
        row[idx] = "" if v is None else v
    return row, set(cmap.values())


def _cell(r: list[Any], i: int | None) -> str:
    return str(r[i]) if (i is not None and len(r) > i) else ""


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


def _read_tab_rows(service, spreadsheet_id: str, tab: str) -> list[list[Any]]:
    """Đọc CẢ tab 1 lần (API cắt hàng trống cuối). Dùng chung cho match + neo hàng trống."""
    res = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{tab}'", majorDimension="ROWS")
        .execute()
    )
    return res.get("values") or []


def _header_row_index(rows: list[list[Any]]) -> int:
    """Index (0-based) dòng header trong rows — cùng luật _read_header_cells (STT → Sale/TVTS → 0)."""
    for i, r in enumerate(rows[:3]):
        if any(_norm(c) == "stt" for c in r):
            return i
    for i, r in enumerate(rows[:3]):
        if any(_norm(c) in ("sale", "tvts") for c in r):
            return i
    return 0


_KEY_FIELDS = ("ten_kh", "sdt", "uid")   # cột BẮT BUỘC ĐIỀN của 1 dòng đơn → neo "dòng dữ liệu cuối"


def _key_cols(header: list[Any]) -> set[int]:
    out: set[int] = set()
    for f in _KEY_FIELDS:
        i = _match_col(header, _FIELD_HEADERS[f], set())
        if i is not None:
            out.add(i)
    return out


_PREFILL_HEADERS = ["STT", "Tháng"]   # cột team điền sẵn hàng loạt → KHÔNG coi là "dòng đã có người"


def _prefill_cols(header: list[Any]) -> set[int]:
    out: set[int] = set()
    for h in _PREFILL_HEADERS:
        i = _match_col(header, [h], set())
        if i is not None:
            out.add(i)
    return out


def _anchored_next_row(rows: list[list[Any]], header_idx: int, key_cols: set[int], owned_cols: set[int],
                       ignore_cols: set[int] | None = None) -> int:
    """Hàng trống kế tiếp (1-based) NEO THEO CỘT KHOÁ (plan v2 G3-T4): last_data = dòng cuối có
    ô khoá non-empty; target = dòng đầu > last_data mà mọi cột app sở hữu (trừ `ignore_cols` =
    cột điền sẵn STT/Tháng) đều trống. Ô nháp lẻ ở cột không sở hữu (dropdown 'Und…' cột N, Ms
    Trinh 23/10) hay cột Tháng điền sẵn 8 dòng (L8 1396–1403, 23/10) KHÔNG kéo điểm ghi xuống."""
    keys = sorted(key_cols) or sorted(owned_cols)
    check = set(owned_cols) - set(ignore_cols or ())
    last = header_idx
    for ri in range(len(rows) - 1, header_idx, -1):
        if any(_cell(rows[ri], k).strip() for k in keys):
            last = ri
            break
    ri = last + 1
    while ri < len(rows) and any(_cell(rows[ri], c).strip() for c in check):
        ri += 1
    return ri + 1


def _next_empty_row(
    service, spreadsheet_id: str, tab: str, *,
    rows: list[list[Any]] | None = None, header: list[Any] | None = None, owned_cols: set[int] | None = None,
) -> int:
    """Hàng trống kế tiếp. Có header+owned_cols → neo theo cột khoá (_anchored_next_row);
    không → legacy len+1 (dưới MỌI dữ liệu). KHÔNG dùng append API (anchor vào cột có ô-1 rỗng
    do merge banner sẽ ghi nhầm vào row 1). `rows` truyền sẵn để không đọc tab 2 lần."""
    if rows is None:
        rows = _read_tab_rows(service, spreadsheet_id, tab)
    if not header or not owned_cols:
        return len(rows) + 1
    return _anchored_next_row(rows, _header_row_index(rows), _key_cols(header), set(owned_cols),
                              ignore_cols=_prefill_cols(header))


def _append_row(
    service, spreadsheet_id: str, tab: str, row: list[Any], owned_cols: set[int], *,
    rows: list[list[Any]] | None = None, header: list[Any] | None = None,
) -> int | None:
    """Ghi 1 hàng. CHỈ ghi các cột G3 sở hữu (owned_cols) trừ cột bị khóa cứng — KHÔNG đụng
    cột của Chung (Handover date / Thời gian tạo nhóm) hay GVCN. Hàng đích neo theo cột khoá
    (truyền header) rồi update từng đoạn cột liền kề. Trả số dòng đã ghi (1-based) để lưu
    `sheet_row`/verify."""
    blocked = _protected_cols(service, spreadsheet_id, tab)
    write_cols = {c for c in owned_cols if c not in blocked}
    segs = _row_segments(row, write_cols)
    if not segs:
        return None
    row_no = _next_empty_row(service, spreadsheet_id, tab, rows=rows, header=header, owned_cols=set(owned_cols))
    for col0, vals in segs:
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab}'!{_col_a1(col0)}{row_no}",
            valueInputOption="USER_ENTERED",
            body={"values": [vals]},
        ).execute()
    return row_no


def _digits(v: Any) -> str:
    """Giữ lại chữ số (dùng cho chuỗi chung, KHÔNG dùng cho số tiền — xem _amount_key)."""
    return re.sub(r"\D", "", str(v if v is not None else ""))


def _amount_key(v: Any) -> str:
    """Chuẩn hoá SỐ TIỀN để so khớp, chịu được cả 2 dạng:
    - app: int 9050000 HOẶC float '8480000.0' (JSONB lưu lẫn lộn) → BỎ phần thập phân.
    - sheet: '9.010.000' / '9,010,000' (dấu phân cách nghìn) → bỏ dấu.
    KHÔNG dùng _digits cho số tiền: float '8480000.0' sẽ bị nuốt '.' → '84800000' (lệch 10×)."""
    s = str(v if v is not None else "").strip()
    if not s:
        return ""
    m = re.fullmatch(r"(\d+)(?:\.\d+)?", s)   # số thuần int/float → lấy phần nguyên
    if m:
        return m.group(1)
    return re.sub(r"\D", "", s)               # '9.010.000' / '9,010,000' → '9010000'


# --- Khoá match v2 (plan 23/10 G2-T2): phone9 + tên bé; tiebreak UID → tiền ±3% ---

def _fold(s: Any) -> str:
    """Bỏ dấu tiếng Việt + lower + gộp khoảng trắng (đ→d)."""
    t = unicodedata.normalize("NFD", str(s or "").replace("\xa0", " "))
    t = "".join(ch for ch in t if unicodedata.category(ch) != "Mn")
    t = t.replace("Đ", "D").replace("đ", "d")
    return " ".join(t.lower().split())


def _phone9(v: Any) -> str:
    """9 số cuối (bỏ mã nước/0 đầu/dấu): '84-977770297' == '0977770297' == '977 770 297'."""
    d = _digits(v)
    return d[-9:] if len(d) >= 9 else d


_CHILD_PREFIX = re.compile(r"^(?:be|con|anh|chi|em|chau|bn|bạn)\s+")


def _norm_child(s: Any) -> str:
    """Tên bé chuẩn hoá: fold dấu, bỏ tiền tố 'bé/con/anh/chị/em/cháu', bỏ ký tự lạ."""
    t = _fold(s)
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    t = " ".join(t.split())
    return _CHILD_PREFIX.sub("", t).strip()


def _amount_close(a: Any, b: Any, tol: float = 0.03) -> bool:
    """Tiền xấp xỉ ±tol (đơn thẻ app lưu NET ≠ niêm yết team ghi). Thiếu 1 bên → False."""
    ka, kb = _amount_key(a), _amount_key(b)
    if not ka or not kb:
        return False
    try:
        x, y = int(ka), int(kb)
    except ValueError:
        return False
    if x == y:
        return True
    return abs(x - y) <= tol * max(x, y)


def _phone_set(*vals: Any) -> set[str]:
    """Tập phone9 từ nhiều ô (SĐT + Contact ID): team hay ghi SĐT = số Zalo liên hệ, còn app
    lưu SĐT tài khoản (AR-1731: team …3668 vs app …7839, contact …3668) → so cả 2 phía."""
    return {p for p in (_phone9(v) for v in vals) if len(p) >= 9}


def _match_key_rows(
    header: list[Any], rows: list[list[Any]], *,
    phone_intl: Any, child_name: Any, uid: Any = "", amount: Any = "", contact: Any = "",
) -> list[int]:
    """Tìm dòng sheet khớp 1 đơn. Trả list index trong `rows` (rows[0] = header → kết quả ≥1).
    Khoá: phone9 (bắt buộc; so tập {SĐT, Contact ID} app ∩ {SĐT, Contact ID} dòng) + tên bé (nếu
    tab có cột và dòng có tên; dòng để trống tên → vẫn nhận). ≥2 → tiebreak UID (dòng có UID) →
    tiebreak tiền ±3%. Vẫn ≥2 → caller coi 'ambiguous'. Tiền KHÔNG là điều kiện cứng (guardrail §3)."""
    sdt_i = _match_col(header, _FIELD_HEADERS["sdt"], set())
    if sdt_i is None:
        return []
    tps = _phone_set(phone_intl, contact)
    if not tps:
        return []
    child_i = _match_col(header, _FIELD_HEADERS["ten_hoc_sinh"], set())
    uid_i = _match_col(header, _FIELD_HEADERS["uid"], set())
    tien_i = _match_col(header, _FIELD_HEADERS["so_tien"], set())
    contact_i = _match_col(header, _FIELD_HEADERS["contact_id"], set())

    def cell(r: list[Any], i: int | None) -> str:
        return str(r[i]) if (i is not None and len(r) > i) else ""

    cands = [ri for ri in range(1, len(rows))
             if tps & _phone_set(cell(rows[ri], sdt_i), cell(rows[ri], contact_i))]
    tc = _norm_child(child_name)
    if tc and child_i is not None:
        cands = [ri for ri in cands
                 if not _norm_child(cell(rows[ri], child_i)) or _norm_child(cell(rows[ri], child_i)) == tc]
    if len(cands) <= 1:
        return cands
    tu = _norm(uid)
    if tu and uid_i is not None:
        by_uid = [ri for ri in cands if _norm(cell(rows[ri], uid_i)) == tu]
        if len(by_uid) == 1:
            return by_uid
        if by_uid:
            cands = by_uid
    if _amount_key(amount) and tien_i is not None:
        close = [ri for ri in cands if _amount_close(cell(rows[ri], tien_i), amount)]
        if len(close) == 1:
            return close
        if close:
            cands = close
    return cands


# --- Upsert 3 team (plan v2 G3): lọc dòng gần đây, fill-empty, verify-after-write ---

_RECENT_DAYS = 14
_RECENT_TAIL = 400
_DMY_RE = re.compile(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})")


def _parse_dmy(s: Any):
    m = _DMY_RE.search(str(s or ""))
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return datetime(y, mo, d).date()
    except ValueError:
        return None


def _recent_rows(header: list[Any], rows: list[list[Any]], header_idx: int, *, today=None) -> set[int]:
    """Index dòng được phép match: 'Ngày bàn giao' trong ±_RECENT_DAYS; dòng không đọc được
    ngày → chỉ nhận nếu nằm trong _RECENT_TAIL dòng cuối. Chặn match nhầm vào đơn CŨ cùng
    khách (gia hạn) — đơn cũ ngoài cửa sổ KHÔNG bao giờ là ứng viên."""
    di = _match_col(header, _FIELD_HEADERS["ngay_ban_giao"], set())
    today = today or datetime.now(timezone(timedelta(hours=7))).date()
    out: set[int] = set()
    n = len(rows)
    tail_start = max(header_idx + 1, n - _RECENT_TAIL)
    for ri in range(header_idx + 1, n):
        d = _parse_dmy(_cell(rows[ri], di)) if di is not None else None
        if d is not None:
            if abs((today - d).days) <= _RECENT_DAYS:
                out.add(ri)
        elif ri >= tail_start:
            out.add(ri)
    return out


_FILL_FIELDS = ("kenh_cham_soc", "contact_id", "note", "uid", "app_order_id")


def _fill_empty_cells(
    service, spreadsheet_id: str, tab: str, sheet_row: int, existing: list[Any],
    header: list[Any], field_values: dict[str, Any], blocked: set[int],
) -> list[int]:
    """Điền CHỈ Ô TRỐNG trên dòng team đã có: Kênh liên hệ / Contact ID / Note / UID / marker.
    KHÔNG đè ô có data (guardrail §3). Trả list cột đã ghi."""
    cmap = _field_col_map(header, field_values)
    written: list[int] = []
    for f in _FILL_FIELDS:
        idx = cmap.get(f)
        v = field_values.get(f)
        if idx is None or v in (None, "") or idx in blocked:
            continue
        if _cell(existing, idx).strip():
            continue
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab}'!{_col_a1(idx)}{sheet_row}",
            valueInputOption="USER_ENTERED",
            body={"values": [[v]]},
        ).execute()
        written.append(idx)
    return written


def _verify_row(service, spreadsheet_id: str, tab: str, sheet_row: int, header: list[Any], field_values: dict[str, Any]) -> bool:
    """Đọc lại dòng vừa ghi: marker (nếu tab có cột) hoặc SĐT phải khớp. Lệch → verify_failed."""
    cmap = _field_col_map(header, field_values)
    last = max(cmap.values()) if cmap else max(len(header) - 1, 0)
    res = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{tab}'!A{sheet_row}:{_col_a1(last)}{sheet_row}")
        .execute()
    )
    r = (res.get("values") or [[]])[0]
    mi = cmap.get("app_order_id")
    if mi is not None and field_values.get("app_order_id"):
        return _cell(r, mi).strip() == str(field_values["app_order_id"]).strip()
    si = cmap.get("sdt")
    if si is not None and field_values.get("sdt"):
        return _phone9(_cell(r, si)) == _phone9(field_values.get("sdt"))
    return True


# --- Dropdown-aware (plan v2 G3-T3): Sale = mã ngắn TVTS nếu ∈ list; Kênh = giá trị list khớp ---

_dv_cache: dict[tuple[str, str, int], tuple[float, list[str]]] = {}
_DV_TTL = 3600.0


def _read_col_dropdown(service, spreadsheet_id: str, tab: str, col0: int) -> list[str]:
    """Danh sách giá trị dropdown của 1 cột (ONE_OF_LIST, hoặc ONE_OF_RANGE → đọc dải tham chiếu).
    Kiểm theo dải dòng 2..400 (DV có thể không áp cả cột). Cache 1h/cột. Non-fatal → []."""
    import time as _time
    key = (spreadsheet_id, tab, col0)
    now = _time.time()
    hit = _dv_cache.get(key)
    if hit and (now - hit[0]) < _DV_TTL:
        return hit[1]
    colA1 = _col_a1(col0)
    vals: list[str] = []
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
        range_ref = ""
        for rd in meta["sheets"][0]["data"][0].get("rowData", []):
            for cell in rd.get("values", []):
                cond = (cell.get("dataValidation") or {}).get("condition") or {}
                cvals = [v.get("userEnteredValue") for v in cond.get("values", [])]
                if cond.get("type") == "ONE_OF_LIST":
                    if len(cvals) > len(best):
                        best = [str(v) for v in cvals if v]
                elif cond.get("type") == "ONE_OF_RANGE" and cvals and not range_ref:
                    range_ref = str(cvals[0] or "").lstrip("=")
        if not best and range_ref:
            res = service.spreadsheets().values().get(spreadsheetId=spreadsheet_id, range=range_ref).execute()
            best = [str(c).strip() for r in (res.get("values") or []) for c in r if str(c).strip()]
        vals = best
    except Exception as exc:
        print(f"[cs_handover] đọc dropdown cột {colA1} tab {tab!r} lỗi (bỏ qua): {exc}")
    _dv_cache[key] = (now, vals)
    return vals


def _dropdown_value(options: list[str], *cands: Any) -> str | None:
    """Giá trị trong list khớp 1 ứng viên (fold dấu/case/space): bằng → startswith duy nhất → None."""
    fo: dict[str, str] = {}
    for o in options:
        k = _fold(o)
        if k and k not in fo:
            fo[k] = str(o).strip()
    for c in cands:
        fc = _fold(c)
        if fc and fc in fo:
            return fo[fc]
    for c in cands:
        fc = _fold(c)
        if not fc:
            continue
        hits = [o for k, o in fo.items() if k.startswith(fc)]
        if len(hits) == 1:
            return hits[0]
    return None


_TVTS_PREFIX_RE = re.compile(r"^[A-Za-z0-9]+\s*-\s*")


def _sale_label(service, spreadsheet_id: str, tab: str, header: list[Any], *, crm_name: str, full_name: str) -> str:
    """Ô Sale: nếu cột có dropdown → mã TVTS ('HN1 - X' / 'X') hay full name khớp list; không
    khớp / không dropdown → full name (hành vi cũ). Tránh sheet báo 'Không hợp lệ'."""
    si = _match_col(header, _FIELD_HEADERS["sale"], set())
    if si is None:
        return full_name
    opts = _read_col_dropdown(service, spreadsheet_id, tab, si)
    if not opts:
        return full_name
    code = ""
    try:
        import cs_l8_order as l8mod
        code = l8mod._load_tvts(service).get(l8mod._fold(crm_name), "") if crm_name else ""
    except Exception as exc:
        print(f"[cs_handover] tra TVTS cho Sale lỗi (bỏ qua): {exc}")
    short = _TVTS_PREFIX_RE.sub("", code) if code else ""
    return _dropdown_value(opts, code, short, full_name) or full_name


def _kenh_label(service, spreadsheet_id: str, tab: str, header: list[Any], value: str) -> str:
    """Ô Kênh liên hệ: khớp giá trị dropdown của tab (zalo→Zalo, Kakao→Kakao Talk); không → nguyên."""
    if not value:
        return value
    ki = _match_col(header, _FIELD_HEADERS["kenh_cham_soc"], set())
    if ki is None:
        return value
    opts = _read_col_dropdown(service, spreadsheet_id, tab, ki)
    if not opts:
        return value
    return _dropdown_value(opts, value) or value


def _match_write_handover(
    service, spreadsheet_id: str, tab: str, header: list[Any], field_values: dict[str, Any]
) -> str:
    """IH2 (match-write): dòng đơn do team điền L8 → chảy sang tab bàn giao (A-N là QUERY).
    App KHÔNG append; chỉ tìm đúng dòng theo UID (+Số tiền) rồi GHI 2 ô "Kênh liên hệ" +
    "Contact ID" (cột tay). Trả: 'written' | 'already' | 'not_found' | 'ambiguous' | 'no_cols'.
    not_found = đơn chưa chảy sang (team chưa điền / chưa propagate) → worker thử lại sau.
    """
    uid_i = _match_col(header, _FIELD_HEADERS["uid"], set())
    kenh_i = _match_col(header, _FIELD_HEADERS["kenh_cham_soc"], set())
    contact_i = _match_col(header, _FIELD_HEADERS["contact_id"], set())
    if uid_i is None or (kenh_i is None and contact_i is None):
        return "no_cols"
    tien_i = _match_col(header, _FIELD_HEADERS["so_tien"], set())

    target_uid = _norm(field_values.get("uid"))
    if not target_uid:
        return "not_found"
    target_tien = _amount_key(field_values.get("so_tien"))

    need = [x for x in (uid_i, kenh_i, contact_i, tien_i) if x is not None]
    last_col = max(need)
    res = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"'{tab}'!A1:{_col_a1(last_col)}")
        .execute()
    )
    rows = res.get("values") or []

    def cell(r: list[Any], i: int | None) -> str:
        return str(r[i]) if (i is not None and len(r) > i) else ""

    matches: list[int] = []  # index trong rows (rows[0]=header)
    for ri in range(1, len(rows)):
        r = rows[ri]
        if _norm(cell(r, uid_i)) != target_uid:
            continue
        # Nếu có Số tiền cả 2 bên → phải khớp (disambiguate khi 1 UID nhiều đơn cùng loại)
        if target_tien and tien_i is not None:
            rtien = _amount_key(cell(r, tien_i))
            if rtien and rtien != target_tien:
                continue
        matches.append(ri)
    if not matches:
        return "not_found"
    if len(matches) > 1:
        print(f"[cs_handover] IH2 UID {target_uid} khớp {len(matches)} dòng tab {tab!r} — bỏ (verify tay)")
        return "ambiguous"

    ri = matches[0]
    sheet_row = ri + 1  # rows[0] = dòng 1
    r = rows[ri]
    kenh_v = str(field_values.get("kenh_cham_soc") or "")
    contact_v = str(field_values.get("contact_id") or "")
    writes: list[tuple[int, str]] = []
    changed = False
    if kenh_i is not None and kenh_v:
        if _norm(cell(r, kenh_i)) != _norm(kenh_v):
            changed = True
        writes.append((kenh_i, kenh_v))
    if contact_i is not None and contact_v:
        if _norm(cell(r, contact_i)) != _norm(contact_v):
            changed = True
        writes.append((contact_i, contact_v))
    if not writes:
        return "not_found"  # không có giá trị để ghi
    if not changed:
        return "already"
    # Ghi: gộp 2 ô liền kề (U,V / S,T) thành 1 update; không thì ghi riêng.
    writes.sort()
    i = 0
    while i < len(writes):
        c0, v0 = writes[i]
        vals = [v0]
        j = i + 1
        while j < len(writes) and writes[j][0] == c0 + (j - i):
            vals.append(writes[j][1])
            j += 1
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{tab}'!{_col_a1(c0)}{sheet_row}",
            valueInputOption="USER_ENTERED",
            body={"values": [vals]},
        ).execute()
        i = j
    return "written"


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
            .select("id, name, child_name, phone, sale_email, country, state, cancelled_at")
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


def _fetch_ar(sb, ar_id: str) -> dict[str, Any] | None:
    """Re-fetch AR MỚI từ DB ngay lúc đẩy (learning outbox-snapshot-stale: snapshot `row`
    trong request có thể cũ → worker + hook đẩy đôi). v2 KHÔNG ghi cờ vào JSONB uids_data
    nữa (nhiều endpoint ghi đè nguyên khối → lost update); dedup/claim ở cs_handover_store."""
    if not ar_id:
        return None
    try:
        res = (
            sb.table("active_requests")
            .select("id, pr_id, uids_data")
            .eq("id", ar_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        print(f"[cs_handover] fetch AR {ar_id} lỗi: {exc}")
        return None
    return res.data[0] if res.data else None


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
    """Runtime-read danh sách dropdown cột Gói học (uỷ quyền _read_col_dropdown, cache 1h). Non-fatal."""
    return _read_col_dropdown(service, spreadsheet_id, tab, col0)


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


_L8_OK = ("appended", "stamped", "exists", "cleaned", "ambiguous")


def _find_course(uids: list[Any], course_code: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    for ub in uids or []:
        if not isinstance(ub, dict):
            continue
        for c in (ub.get("courses") or []):
            if isinstance(c, dict) and str(c.get("code") or "") == str(course_code):
                return ub, c
    return None, None


def maybe_push_cs_handover(sb, ar_ref: Any, course_code: str, *, dry_run: bool = False) -> str:
    """Đẩy handover cho 1 course. v2 (plan 23/10 G1): `ar_ref` = ar_id (str) HOẶC dict — luôn
    RE-FETCH AR mới từ DB (không tin snapshot request). Thứ tự: gate → claim (DB, atomic) →
    ghi sheet → mark. Non-fatal: nuốt lỗi, trả outcome string để log/test:
      no_ar | no_course | no_order_id | already | claimed_elsewhere | no_pr | unrouted |
      no_header | appended | ih2_done | ih2_pending | error
    """
    code = str(course_code or "").strip()
    claimed = False
    try:
        ar_id = str(ar_ref if isinstance(ar_ref, str) else (ar_ref or {}).get("id") or "").strip()
        ar_row = _fetch_ar(sb, ar_id) if ar_id else None
        if not ar_row and isinstance(ar_ref, dict):
            ar_row = ar_ref  # fallback: DB lỗi thoáng qua → vẫn dùng snapshot (claim vẫn chặn trùng)
        if not ar_row:
            return "no_ar"
        uids = ar_row.get("uids_data") or []
        uid_block, course = _find_course(uids, code)
        if not course or uid_block is None:
            return "no_course"
        # Gate v2 (G2-T1): tín hiệu bàn giao = sale điền Kênh/Contact lúc BÁO ĐƠN — KHÔNG chờ
        # order_id. Thiếu → không đẩy dòng rỗng; KHÔNG ghi row log (để PATCH điền sau / worker
        # còn đẩy được — một row terminal ở đây sẽ chặn vĩnh viễn).
        if not (course.get("care_channel") or course.get("care_contact_id")):
            return "no_handover"

        # Dedup/claim qua bảng cs_handover_log (nguồn sự thật duy nhất).
        st = _store.fetch_statuses(sb, [code]).get(code)
        if _store.is_done(st):
            return "already"
        if st and not _store.needs_retry(st):
            return "claimed_elsewhere"

        pr = _fetch_pr(sb, str(ar_row.get("pr_id") or ""))
        if not pr:
            print(f"[cs_handover] skip AR {ar_id} course {code}: không có PR")
            return "no_pr"
        # PR bị huỷ (sale huỷ / tạo lại đơn — PR-2590→PR-2602 23/10): KHÔNG đẩy. Đã đẩy rồi mà
        # giờ mới huỷ → ghi 'cancelled' + log để người xử dòng sheet (app không tự xoá).
        if str(pr.get("state") or "").lower() == "cancelled":
            print(f"[cs_handover] PR {pr.get('id')} CANCELLED — không đẩy course {code} AR {ar_id}")
            if not dry_run:
                _store.record(sb, code, ar_id, "cancelled",
                              last_error=f"PR {pr.get('id')} cancelled lúc {pr.get('cancelled_at')}; chưa đẩy")
            return "pr_cancelled"
        sale_email = str(pr.get("sale_email") or "").strip().lower()
        sale = _fetch_sale(sb, sale_email) or {}
        team = get_canonical_team((sale.get("team") or "").strip())
        is_gia_han = str(course.get("lead_source") or "").strip() == "gia_han"
        route = resolve_route(team, is_gia_han)
        if not route:
            print(f"[cs_handover] skip AR {ar_id} course {code}: team {team!r} chưa có sheet bàn giao")
            return "unrouted"
        spreadsheet_id, tab = route
        sale_name = str(sale.get("display_name") or sale.get("crm_name") or sale_email)
        field_values = build_field_values(pr, uid_block, course, is_gia_han=is_gia_han, sale_name=sale_name)

        if not dry_run:
            claimed = _store.claim(sb, code, ar_id, team=team, spreadsheet_id=spreadsheet_id, tab=tab)
            if not claimed:
                return "claimed_elsewhere"  # kênh khác (worker/hook) đang giữ hoặc vừa xong

        service = _sheets_write_service()
        header = _read_header_cells(service, spreadsheet_id, tab)
        if not header:
            print(f"[cs_handover] skip: không đọc được header tab {tab!r} ({spreadsheet_id})")
            if claimed:
                _store.mark(sb, code, "failed", last_error=f"no header {tab}")
            return "no_header"
        # Kênh liên hệ theo dropdown của tab (G3-T3) — áp cho mọi team.
        field_values["kenh_cham_soc"] = _kenh_label(service, spreadsheet_id, tab, header, str(field_values.get("kenh_cham_soc") or ""))

        # IH2: 2 việc — (1) ghi ĐƠN vào L8 (dedup cột W); (2) ghi Kênh/Contact vào tab bàn giao.
        # l8_status lưu trong cs_handover_log để không làm lại; status=done khi CẢ HAI xong,
        # not_found (retryable) khi đơn chưa chảy sang tab bàn giao.
        if team in _MATCH_WRITE_TEAMS:
            import cs_l8_order as l8mod
            # W trên L8 = course_code (G2-T3); legacy = order_id CRM (dòng đã ghi trước 23/10).
            legacy_oid = _course_order_id(course)
            l8_status = str((st or {}).get("l8_status") or "")
            l8_done = l8_status in _L8_OK
            if not l8_done:
                try:
                    l8_header = l8mod.read_l8_header(service)
                    if l8_header:
                        pay_date = l8mod.fetch_payment_date(sb, str(ar_row.get("pr_id") or ""))
                        l8_fields = l8mod.build_l8_fields(
                            service, sale_crm_name=str(sale.get("crm_name") or sale_name),
                            pr=pr, uid_block=uid_block, course=course, is_gia_han=is_gia_han,
                            payment_date=pay_date, course_code=code,
                            phone_intl=str(field_values.get("sdt") or ""))
                        oc = l8mod.upsert_l8_order(
                            service, l8_header, l8_fields,
                            uid=str(uid_block.get("uid") or ""),
                            so_tien=_amount_key(course.get("amount")), course_code=code,
                            legacy_order_id=legacy_oid, dry_run=dry_run)
                        print(f"[cs_handover] IH2 L8 {oc} AR {ar_id} course {code}")
                        if oc in _L8_OK:
                            l8_status, l8_done = oc, True
                except Exception as exc:
                    print(f"[cs_handover] IH2 L8 lỗi (bỏ qua, retry sau): {exc}")
            bg = "dry_run" if dry_run else _match_write_handover(service, spreadsheet_id, tab, header, field_values)
            print(f"[cs_handover] IH2 bàn giao {bg} AR {ar_id} course {code} → {tab!r}")
            bg_done = bg in ("written", "already")
            if dry_run:
                return "ih2_done" if l8_done else "ih2_pending"
            if l8_done and bg_done:
                _store.mark(sb, code, "done", l8_status=l8_status or None, marker=code)
                return "ih2_done"
            _store.mark(sb, code, "not_found", l8_status=l8_status or None)
            return "ih2_pending"

        # --- 3 team IH1/Offline/HCM: UPSERT (G3) = match dòng team → fill-empty | append + verify | ambiguous ---
        # Gói học: auto-fill per-sheet (runtime-read dropdown của tab). Rỗng → không ghi cột này.
        goi_hoc = _goi_hoc_label(service, spreadsheet_id, tab, header, str(course.get("name") or ""))
        if goi_hoc:
            field_values["goi_hoc"] = goi_hoc
        field_values["app_order_id"] = code  # marker dòng app (tab chưa có cột → bỏ qua)
        field_values["sale"] = _sale_label(service, spreadsheet_id, tab, header,
                                           crm_name=str(sale.get("crm_name") or ""),
                                           full_name=str(field_values.get("sale") or ""))

        rows = _read_tab_rows(service, spreadsheet_id, tab)  # đọc 1 lần: match + neo hàng trống
        hidx = _header_row_index(rows)
        cmap = _field_col_map(header, field_values)
        mi = cmap.get("app_order_id")
        eligible = _recent_rows(header, rows, hidx)
        if mi is not None:  # dòng app của course KHÁC (marker ≠ code) không bao giờ là ứng viên
            eligible = {ri for ri in eligible if _cell(rows[ri], mi).strip() in ("", code)}
        sub = [rows[hidx]] + [rows[ri] if ri in eligible else [] for ri in range(hidx + 1, len(rows))]
        matches = [ri + hidx for ri in _match_key_rows(
            header, sub, phone_intl=field_values.get("sdt"), child_name=field_values.get("ten_hoc_sinh"),
            uid=field_values.get("uid"), amount=field_values.get("so_tien"), contact=field_values.get("contact_id"))]
        kind = "gia hạn" if is_gia_han else "KH mới"

        if len(matches) > 1:
            print(f"[cs_handover] AMBIGUOUS AR {ar_id} course {code} → {tab!r}: khớp dòng {[m + 1 for m in matches]} — không ghi, verify tay")
            if not dry_run:
                _store.mark(sb, code, "ambiguous", last_error=f"khớp {len(matches)} dòng {[m + 1 for m in matches]}")
            return "ambiguous"
        if len(matches) == 1:
            sheet_row = matches[0] + 1
            if dry_run:
                print(f"[cs_handover] [DRY] match AR {ar_id} course {code} → {tab!r} dòng {sheet_row}: fill-empty Kênh/Contact/Note/UID/marker")
                return "matched"
            blocked = _protected_cols(service, spreadsheet_id, tab)
            written = _fill_empty_cells(service, spreadsheet_id, tab, sheet_row, rows[matches[0]], header, field_values, blocked)
            _store.mark(sb, code, "matched", sheet_row=sheet_row, marker=code if mi is not None else None)
            print(f"[cs_handover] matched AR {ar_id} course {code} → {tab!r} ({kind}) dòng {sheet_row}, điền cột {[_col_a1(c) for c in written]}")
            return "matched"

        row, owned_cols = build_row_values(header, field_values)
        if dry_run:
            target = _next_empty_row(service, spreadsheet_id, tab, rows=rows, header=header, owned_cols=owned_cols)
            print(f"[cs_handover] [DRY] append AR {ar_id} course {code} → {tab!r} dòng {target}: {row}")
            return "appended"
        row_no = _append_row(service, spreadsheet_id, tab, row, owned_cols, rows=rows, header=header)
        if row_no and not _verify_row(service, spreadsheet_id, tab, row_no, header, field_values):
            _store.mark(sb, code, "verify_failed", sheet_row=row_no, last_error="đọc lại dòng không khớp marker/SĐT")
            print(f"[cs_handover] VERIFY FAILED AR {ar_id} course {code} → {tab!r} dòng {row_no} (worker xử lại)")
            return "verify_failed"
        _store.mark(sb, code, "appended", sheet_row=row_no, marker=code)
        print(f"[cs_handover] pushed AR {ar_id} course {code} → {tab!r} ({kind}) row {row_no}")
        return "appended"
    except Exception as exc:
        print(f"[cs_handover] push non-fatal error: {exc}")
        if claimed:
            try:
                _store.mark(sb, code, "failed", last_error=str(exc)[:500])
            except Exception as exc2:
                print(f"[cs_handover] mark failed lỗi: {exc2}")
        return "error"
