"""Matching logic chung cho import GSheet + audit A1 (Sổ ↔ All File).

Consumption-based: mỗi dòng DB chỉ được ghép đúng 1 lần (Pool.take đánh dấu
consumed). Khác membership cũ — 1 key không còn chặn vô hạn dòng sheet.
Bug 175tr bị nuốt 2026: xem docs/learnings/ + plan 2026-07-23.

Tier (global pass — chạy hết tầng này trên TOÀN BỘ sheet rows rồi mới sang
tầng sau, tránh tầng yếu "cướp" dòng DB của cặp tầng mạnh):
  1. exact       — uid + ngày + tiền
  2. loose       — uid + sale + tháng pay_time + tiền (_loose_fp production)
  3. blank_db    — DB row UID trống + key |sale|tháng|tiền + GUARD tên/SĐT
  4. blank_sheet — sheet row UID trống ghép DB bất kỳ cùng key + GUARD
  5. day_vnd     — ngày + tiền (yếu, spot-check)
  6. uid_day     — uid + ngày khớp nhưng LỆCH TIỀN (amount_mismatch)

Sau cùng, sheet row không khớp mà exact-key CÓ tồn tại trong DB gốc
→ dup_suspect (sheet có 2 dòng y hệt uid+ngày+tiền, DB có 1 — nghi Hiền
duplicate dòng trên sheet; KHÔNG auto-insert, đưa người quyết).
Còn lại → sheet_only (thiếu thật, cần insert). DB row thừa → db_only.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any


# ---- fingerprint (chuyển nguyên văn từ gsheet_ledger_import) ----

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


def _loose_fp(row: dict[str, Any]) -> str:
    """Dedup key bền với sheet edit giữa các đợt sync.

    Key = uid + sale + tháng-pay-time + số tiền VND. Cùng customer PalFish
    (UID unique per customer) + cùng sale phụ trách + cùng tháng đóng tiền +
    cùng số tiền = cùng giao dịch — bất kể tên khách/SĐT/ngày tiền về bị sửa
    trên sheet giữa các đợt.

    Tháng (YYYY-MM) thay vì ngày để hấp thụ ca Hiền sửa `ngày tiền về` đợt
    sau. Bỏ SDT khỏi key (bản cũ gồm SDT — Hiền sửa SDT giữa các đợt thì
    bypass dedup; xem 18 cặp X bị xóa 15/6/2026).
    """
    uid = _fp_clean(row.get("uid"))
    pay = str(row.get("pay_time") or row.get("ngay_tien_ve") or "")[:7]
    sale = _fp_clean(row.get("sale_crm_name")).lower()
    vnd = str(row.get("so_tien_vnd") or 0)
    return f"{uid}|{sale}|{pay}|{vnd}"


def _loose_fp_blank(row: dict[str, Any]) -> str:
    """Fallback key cho dòng đợt sớm chưa điền UID: sale + tháng + tiền."""
    pay = str(row.get("pay_time") or row.get("ngay_tien_ve") or "")[:7]
    sale = _fp_clean(row.get("sale_crm_name")).lower()
    vnd = str(row.get("so_tien_vnd") or 0)
    return f"|{sale}|{pay}|{vnd}"


# ---- helpers so khớp ----

def _clean(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() == "nan" else s


def _primary_day(row: dict) -> str:
    d = _clean(row.get("ngay_tien_ve"))[:10]
    return d if d else _clean(row.get("pay_time"))[:10]


def _vnd(row: dict) -> int:
    try:
        return int(row.get("so_tien_vnd") or 0)
    except (TypeError, ValueError):
        return 0


def _k_exact(row: dict) -> str | None:
    uid, day = _clean(row.get("uid")), _primary_day(row)
    if not uid or not day:
        return None
    return f"{uid}|{day}|{_vnd(row)}"


def _k_uid_day(row: dict) -> str | None:
    uid, day = _clean(row.get("uid")), _primary_day(row)
    if not uid or not day:
        return None
    return f"{uid}|{day}"


def _k_day_vnd(row: dict) -> str | None:
    day = _primary_day(row)
    return f"{day}|{_vnd(row)}" if day else None


def _same_person(a: dict, b: dict) -> bool:
    """Guard tầng blank: chỉ ghép khi SĐT hoặc tên trùng.

    Không guard thì 2 khách cùng sale+tháng+giá, ai đứng trước trong sheet
    người đó nuốt dòng trống — 50/50 sai (Ryan vs Huy Anh, 23/7).
    Thiếu dữ kiện cả 2 phía → False (thà không ghép, dòng trống rơi vào
    db_only cho người xử; backfill Task 2.3 dọn).
    """
    pa, pb = _clean(a.get("sdt")), _clean(b.get("sdt"))
    if pa and pb:
        return pa == pb
    na = _clean(a.get("ten_khach")).lower()
    nb = _clean(b.get("ten_khach")).lower()
    if na and nb:
        return na == nb
    return False


class Pool:
    """Multimap key → index DB row chưa tiêu thụ. take() = consume."""

    def __init__(self, db_rows: list[dict]):
        self.rows = db_rows
        self.consumed = [False] * len(db_rows)
        self.maps: dict[str, dict[str, list[int]]] = {
            "exact": defaultdict(list),
            "loose": defaultdict(list),
            "blank_db": defaultdict(list),   # chỉ DB row UID trống
            "blank_all": defaultdict(list),  # mọi DB row (cho sheet UID trống)
            "day_vnd": defaultdict(list),
            "uid_day": defaultdict(list),
        }
        self.exact_keys_db = set()  # key exact TỒN TẠI trong DB gốc (cho dup_suspect)
        for i, r in enumerate(db_rows):
            k = _k_exact(r)
            if k:
                self.maps["exact"][k].append(i)
                self.exact_keys_db.add(k)
            self.maps["loose"][_loose_fp(r)].append(i)
            bk = _loose_fp_blank(r)
            if not _clean(r.get("uid")):
                self.maps["blank_db"][bk].append(i)
            self.maps["blank_all"][bk].append(i)
            k = _k_day_vnd(r)
            if k:
                self.maps["day_vnd"][k].append(i)
            k = _k_uid_day(r)
            if k:
                self.maps["uid_day"][k].append(i)

    def take(self, map_name: str, key: str | None, *,
             sheet_row: dict | None = None, guard=None) -> int | None:
        if key is None:
            return None
        lst = self.maps[map_name].get(key)
        if not lst:
            return None
        for pos, i in enumerate(lst):
            if self.consumed[i]:
                continue
            if guard is not None and not guard(sheet_row, self.rows[i]):
                continue  # KHÔNG pop — candidate khác có thể hợp dòng sau
            self.consumed[i] = True
            lst.pop(pos)
            return i
        return None

    def leftovers(self) -> list[dict]:
        return [r for i, r in enumerate(self.rows) if not self.consumed[i]]


def reconcile(sheet_rows: list[dict], db_rows: list[dict]) -> dict:
    """Global tier-pass. Trả buckets — xem docstring module."""
    pool = Pool(db_rows)
    matched: list[tuple[str, int] | None] = [None] * len(sheet_rows)

    def _pass(tier: str, keyfn, *, map_name: str | None = None,
              guard=None, only_blank_sheet: bool = False):
        for si, s in enumerate(sheet_rows):
            if matched[si] is not None:
                continue
            if only_blank_sheet and _clean(s.get("uid")):
                continue
            i = pool.take(map_name or tier, keyfn(s), sheet_row=s, guard=guard)
            if i is not None:
                matched[si] = (tier, i)

    _pass("exact", _k_exact)
    _pass("loose", _loose_fp)
    _pass("loose_blank", _loose_fp_blank, map_name="blank_db", guard=_same_person)
    _pass("loose_blank", _loose_fp_blank, map_name="blank_all",
          guard=_same_person, only_blank_sheet=True)
    _pass("day_vnd", _k_day_vnd)
    _pass("uid_day", _k_uid_day)

    matches = {"exact": [], "loose": [], "loose_blank": [], "day_vnd": [], "uid_day": []}
    dup_suspect: list[dict] = []
    sheet_only: list[dict] = []
    for si, s in enumerate(sheet_rows):
        m = matched[si]
        if m is not None:
            matches[m[0]].append((s, pool.rows[m[1]]))
        elif (k := _k_exact(s)) is not None and k in pool.exact_keys_db:
            dup_suspect.append(s)
        else:
            sheet_only.append(s)

    return {"matches": matches, "dup_suspect": dup_suspect,
            "sheet_only": sheet_only, "db_only": pool.leftovers()}


FETCH_LEDGER_COLS = (
    "id, uid, ngay_tien_ve, pay_time, so_tien_vnd, gmv_rmb, ten_khach, sdt, "
    "sale_crm_name, team, loai_nhap, created_by_email"
)


def fetch_ledger_rows(sb) -> list[dict]:
    """Đọc toàn bộ so_doanh_thu, phân trang 1000. Read-only."""
    rows: list[dict] = []
    offset = 0
    while True:
        res = (sb.table("so_doanh_thu").select(FETCH_LEDGER_COLS)
               .order("created_at").order("id")
               .range(offset, offset + 999).execute())
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows
