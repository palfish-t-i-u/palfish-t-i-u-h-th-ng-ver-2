# Import Consumption-Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans để thi công từng task theo checkbox. KHÔNG dùng subagent fan-out — làm trực tiếp, tuần tự.

**Goal:** Sửa bug import GSheet nuốt giao dịch thật (11 GD / 175tr trong 2026) bằng cách thay dedup membership → consumption (dùng chung thuật toán reconcile với audit A1), rồi nạp lại data thiếu + gỡ 21 dòng UID-trống.

**Architecture:** Tách matching logic ra module chung `backend/ledger_recon.py` (Pool + reconcile, global tier-pass, name/SĐT-guard cho tầng blank). `gsheet_ledger_import.sync_gsheet_to_ledger` bỏ 2 set membership, gọi `reconcile()`, insert đúng `sheet_only`. Audit script import từ module chung — audit trở thành dry-run của import, hai bên không bao giờ lệch nhau.

**Tech Stack:** Python (backend), Supabase (Postgres), Google Sheets API readonly, pytest.

---

## ⛔ LUẬT CHO AGENT THI CÔNG (đọc trước, tuân tuyệt đối)

1. **Scope fence — CHỈ được tạo/sửa các file liệt kê trong từng task.** Không refactor file khác, không thêm dependency, không đổi schema DB, không tạo cron/worker, không sửa frontend (Phase FE là plan riêng, không nằm ở đây).
2. **Mọi lệnh GHI prod nằm sau dòng `⛔ STOP — chờ Minh OK`.** Chưa có OK bằng chữ của Minh trong chat → không chạy. Phase 1 hoàn toàn read-only với prod.
3. **Oracle bất biến (bảng dưới): số thực tế lệch oracle → DỪNG, báo cáo nguyên trạng, KHÔNG tự diễn giải, KHÔNG sửa test/sửa số cho khớp.**
4. Trước mọi lệnh chạm Supabase: verify `SUPABASE_URL` chứa `jozcvbbypwvzaefteoxn` (prod). Lệch → dừng.
5. Chạy Python từ thư mục `backend/`. CSV đọc bằng `encoding='utf-8-sig'` (BOM gotcha đã dính 23/7).
6. Test cũ trong `tests/test_gsheet_dedup.py` là HỢP ĐỒNG hành vi. Task nào đổi assertion đều ghi rõ đổi thành gì + vì sao ngay trong plan này. Ngoài các đổi đã ghi → không đụng.
7. Git: nhánh `sandbox`, squash 1 commit/phase (3 commit tổng + 1 commit docs). Message theo mẫu trong task.
8. Bí ở đâu → dừng ở đó, báo lại, không đoán. Tối đa 1 lần grep-investigate/vấn đề, không fan-out.

### Bảng oracle (số đã verify bằng tay 23/7/2026 trên prod)

| Kiểm | Kỳ vọng | Lệch → |
|---|---|---|
| `pytest tests/test_recon_matching.py tests/test_gsheet_dedup.py -v` | 100% pass | DỪNG |
| Audit T6–T7 sau refactor: `sheet_only` | PHẢI chứa đúng 7 dòng: Ngọc Diệp 3176063446, Ryan 3313266573, Hạ Vy 3313700785, TuấnKhang 3304034205, Bảo Hân 3270878040, Bảo Lâm 3276643405, Mina 3303471071. Dòng NGOÀI danh sách chỉ hợp lệ nếu `ngay ≥ 2026-07-22` (giao dịch mới sheet ghi sau lần sync 23/7 07:04 — liệt kê ra báo cáo). Dòng lạ ngày cũ hơn → | DỪNG |
| Audit T6–T7: `dup_suspect` | đúng 1: Đô Đô 3299959930 (31.8M ×2 cùng ngày 15/7) | DỪNG |
| Audit T6–T7: `amount_mismatch` | 0 (Hiểu Minh 3313146255 phải biến mất — DB đủ 2 dòng, trước là artifact) | DỪNG |
| Audit full-2026 (`--start 2026-01-01 --end 2026-12-31`): `sheet_only` | = kết quả T6–T7 + đúng 2 dòng: Daniel 2026-03-20 25.23M + Minh Nhật 2026-05-30 24.67M | DỪNG |
| Import dry-run (floor 2026-01-01): `plannedInsert` | danh sách ≡ sheet_only full-2026 (9 dòng chốt + dòng mới ≥ 22/7 nếu có) | DỪNG |
| Sau Phase 2 real import: audit full-2026 `sheet_only` | 0 | DỪNG |
| Sau Phase 2 backfill: số dòng `uid` trống trong `so_doanh_thu` | 0 (hoặc = số dòng Minh quyết giữ, ghi trong CSV duyệt) | DỪNG |

### Bối cảnh bug (đọc để hiểu, không cần đào thêm)

- `gsheet_ledger_import.py:738`: `if _loose_fp(p) in loose_existing or _loose_fp_blank(p) in loose_existing: skip`. `_loose_fp_blank` = `|sale|tháng|tiền` (không UID). 1 dòng UID-trống trong Sổ chặn vĩnh viễn MỌI khách mới trùng sale+tháng+giá (giá gói cố định → trùng thường xuyên). 21 dòng trống = 21 mìn.
- Vì sao không vá điều kiện đơn thuần ("dòng có UID bỏ check blank"): mở lại pattern-B dup — dòng nhập sớm UID trống, Hiền điền UID lên sheet sau → import sau nhân đôi. Test `test_blank_uid_early_row_absorbs_filled_version` khắc hành vi này, phải giữ.
- Fix đúng: membership → **consumption**. Mỗi dòng DB chỉ được "khớp" đúng 1 lần. Mìn bị chính dòng gốc của nó tiêu thụ, khách mới không còn gì để đổ oan → được insert.
- Danang REV: chi nhánh đã đóng, tab chỉ còn 49 dòng 2024–2025 (verify 23/7). KHÔNG thêm vào import. Ghi chú vào code + runbook (task 3.3).

---

## Phase 1 — Đổi cơ chế (read-only với prod)

### Task 1.1: Tạo module chung `backend/ledger_recon.py`

**Files:**
- Create: `backend/ledger_recon.py`
- Modify: `backend/gsheet_ledger_import.py` (chuyển 4 hàm fingerprint sang module mới, re-export giữ tương thích)

- [ ] **Step 1: Viết `backend/ledger_recon.py`**

Chuyển NGUYÊN VĂN từ `gsheet_ledger_import.py` sang: `_fp_clean` (dòng 363-367), `row_fingerprint` (370-378), `_loose_fp` (381-397), `_loose_fp_blank` (400-405) — kèm docstring gốc. Rồi thêm phần matching (chuyển + nâng cấp từ `scripts/audit_so_vs_allfile.py` — global tier-pass thay waterfall, thêm guard):

```python
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
# ... _fp_clean / row_fingerprint / _loose_fp / _loose_fp_blank ở đây ...

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
```

- [ ] **Step 2: Sửa `gsheet_ledger_import.py` — xóa 4 hàm fingerprint tại chỗ (dòng 363-405), thay bằng re-export ngay đầu file (sau block import chuẩn):**

```python
# Fingerprint chuyển sang ledger_recon (module chung với audit A1).
# Re-export giữ tương thích: dedup_gsheet_ledger.py, xlsx_ledger_import.py,
# tests/ đang import từ đây.
from ledger_recon import (  # noqa: F401
    _fp_clean,
    _loose_fp,
    _loose_fp_blank,
    row_fingerprint,
)
```

- [ ] **Step 3: Verify không vỡ ai — chạy:**

```bash
cd backend && python -c "import gsheet_ledger_import, xlsx_ledger_import, ledger_recon; print('OK')"
cd backend && python -m pytest tests/test_gsheet_dedup.py tests/test_gmv_locale_fix.py -v
```

Expected: `OK` + toàn bộ test pass (chưa đổi hành vi gì — mới chuyển nhà).

### Task 1.2: Test contract mới `tests/test_recon_matching.py`

**Files:**
- Create: `backend/tests/test_recon_matching.py`

- [ ] **Step 1: Viết đủ 8 test (nguyên văn):**

```python
"""Contract của ledger_recon.reconcile — consumption + guard + global pass.

Mỗi test = 1 ca thật đã gặp 23/7/2026 (xem plan 2026-07-23-import-consumption-dedup.md).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ledger_recon import reconcile


def row(uid, day, vnd, sale="Sale A", name="Khach", sdt="0900000001", **kw):
    base = {"uid": uid, "ngay_tien_ve": day, "pay_time": f"{day}T10:00:00",
            "so_tien_vnd": vnd, "ten_khach": name, "sdt": sdt,
            "sale_crm_name": sale, "loai_nhap": "tay",
            "created_by_email": "import:gsheet:SM Hanoi", "id": f"id-{uid}-{day}-{vnd}"}
    base.update(kw)
    return base


def buckets(r):
    out = {k: len(v) for k, v in r["matches"].items()}
    out["dup_suspect"] = len(r["dup_suspect"])
    out["sheet_only"] = len(r["sheet_only"])
    out["db_only"] = len(r["db_only"])
    return out


def test_mine_does_not_eat_new_customer():
    """Ca Ryan 23/7: mìn UID-trống 'Huy Anh' + sheet có cả Huy Anh (đã điền
    UID) lẫn Ryan (khách khác, cùng sale+tháng+giá). Huy Anh ghép mìn qua
    guard tên; Ryan phải ra sheet_only (được insert) — mọi thứ tự sheet."""
    db = [row("", "2026-06-28", 18_820_000, name="Huy Anh", sdt="84-111")]
    huy = row("3313488097", "2026-06-27", 18_820_000, name="Huy Anh", sdt="84-111")
    ryan = row("3313266573", "2026-06-28", 18_820_000, name="Ryan", sdt="82-222")
    for order in ([huy, ryan], [ryan, huy]):
        r = reconcile(list(order), list(db))
        b = buckets(r)
        assert b["loose_blank"] == 1 and b["sheet_only"] == 1, b
        assert r["sheet_only"][0]["ten_khach"] == "Ryan"


def test_pattern_b_blank_absorbed_with_name_match():
    """Pattern B giữ nguyên: dòng sớm UID trống (CÓ tên), Hiền điền UID đợt
    sau → ghép, không nhân đôi."""
    db = [row("", "2026-05-28", 9_010_000, name="Minh", sdt="")]
    filled = row("3312123609", "2026-05-28", 9_010_000, name="Minh", sdt="0911")
    b = buckets(reconcile([filled], db))
    assert b["loose_blank"] == 1 and b["sheet_only"] == 0


def test_degenerate_blank_not_absorbed():
    """Dòng trống KHÔNG tên KHÔNG SĐT không được nuốt ai — khách mới vẫn
    insert (chấp nhận rủi ro thừa, backfill dọn; thà thừa hơn âm thầm thiếu)."""
    db = [row("", "2026-06-01", 9_080_000, name="", sdt="")]
    new_cust = row("3176063446", "2026-06-23", 9_080_000, name="Ngọc Diệp", sdt="84-987")
    b = buckets(reconcile([new_cust], db))
    assert b["sheet_only"] == 1 and b["db_only"] == 1


def test_second_installment_same_month_inserted():
    """2 lần đóng hợp lệ cùng uid+sale+tháng+tiền, khác ngày; DB mới có 1
    → lần 2 phải insert (membership cũ nuốt vĩnh viễn)."""
    db = [row("500", "2026-06-05", 5_000_000)]
    p1 = row("500", "2026-06-05", 5_000_000)
    p2 = row("500", "2026-06-20", 5_000_000)
    b = buckets(reconcile([p1, p2], db))
    assert b["exact"] == 1 and b["sheet_only"] == 1


def test_exact_dup_sheet_row_flagged_dup_suspect():
    """Ca Đô Đô: sheet 2 dòng Y HỆT uid+ngày+tiền, DB 1 → dòng 2 KHÔNG auto
    insert, vào dup_suspect chờ người quyết. Cũng cover pattern-X-2-dòng."""
    db = [row("3299959930", "2026-07-15", 31_800_000)]
    s1 = row("3299959930", "2026-07-15", 31_800_000, sdt="84-358511220")
    s2 = row("3299959930", "2026-07-15", 31_800_000, sdt="84-358511221")
    b = buckets(reconcile([s1, s2], db))
    assert b["exact"] == 1 and b["dup_suspect"] == 1 and b["sheet_only"] == 0


def test_idempotent_second_run_zero():
    """Chạy 2 lần: sau khi 'insert' sheet_only vào DB, lần 2 phải 0 insert."""
    db = [row("", "2026-06-28", 18_820_000, name="Huy Anh", sdt="84-111")]
    huy = row("3313488097", "2026-06-27", 18_820_000, name="Huy Anh", sdt="84-111")
    ryan = row("3313266573", "2026-06-28", 18_820_000, name="Ryan", sdt="82-222")
    r1 = reconcile([huy, ryan], list(db))
    db2 = list(db) + [dict(s) for s in r1["sheet_only"]]
    r2 = reconcile([huy, ryan], db2)
    assert len(r2["sheet_only"]) == 0 and len(r2["dup_suspect"]) == 0


def test_amount_mismatch_uid_day():
    db = [row("500", "2026-06-20", 5_500_000)]
    b = buckets(reconcile([row("500", "2026-06-20", 5_000_000)], db))
    assert b["uid_day"] == 1 and b["sheet_only"] == 0


def test_weak_tier_cannot_steal_from_exact_pair():
    """Ca Hiểu Minh (artifact 23/7): global pass — dòng lạc (không khớp gì)
    KHÔNG được cướp DB row của cặp exact, dù xử lý trước theo thứ tự sheet."""
    db = [row("3313146255", "2026-06-30", 4_550_000, name="Hiểu Minh")]
    stray = row("", "2026-06-30", 4_550_000, sale="Sale Z", name="Ai Đó", sdt="84-999")
    hieu = row("3313146255", "2026-06-30", 4_550_000, name="Hiểu Minh")
    r = reconcile([stray, hieu], db)
    b = buckets(r)
    assert b["exact"] == 1, b            # Hiểu Minh giữ được cặp exact
    assert b["sheet_only"] == 1          # stray tự lo, không phá cặp
    assert r["sheet_only"][0]["ten_khach"] == "Ai Đó"
```

- [ ] **Step 2: Chạy — phải FAIL nếu Task 1.1 chưa xong, PASS nếu xong:**

```bash
cd backend && python -m pytest tests/test_recon_matching.py -v
```

Expected: 8 passed.

### Task 1.3: Rewire `sync_gsheet_to_ledger` sang reconcile

**Files:**
- Modify: `backend/gsheet_ledger_import.py:680-812` (thân hàm sync)
- Modify: `backend/tests/test_gsheet_dedup.py` (2 test đổi assertion — ghi rõ dưới)

- [ ] **Step 1: Thay thân hàm.** Giữ nguyên signature + thêm `min_insert_day`:

```python
DEFAULT_MIN_INSERT_DAY = "2026-01-01"
# Floor: chỉ insert dòng có ngày >= mốc. Dòng cũ hơn (seed-era, sheet edit
# drift) chỉ báo cáo, không tự nạp — tránh nút "Sync Data" nạp dup lịch sử.
```

Cấu trúc mới của thân hàm (thay toàn bộ phần từ `existing = _load_existing_import_fingerprints…` đến hết; GIỮ NGUYÊN: load team cache, `iter_payloads_by_tab` loop để gom payload, block insert batch + retry `sb_factory` + timestamp `base_ts + timedelta(milliseconds=idx)`):

```python
    # 1) Gom payload mọi tab (giữ iter streaming để fetch từng tab)
    seen_payloads: set[str] = set()
    all_payloads: list[dict[str, Any]] = []
    samples: list[dict[str, Any]] = []
    for tab, payloads in iter_payloads_by_tab(...):  # args như cũ
        for p in payloads:
            fp = row_fingerprint(p)
            if fp in seen_payloads:
                continue
            seen_payloads.add(fp)
            if len(samples) < 3:
                samples.append(p)
            all_payloads.append(p)
        del payloads

    # 2) Đọc Sổ + reconcile (consumption — xem ledger_recon docstring)
    log("Đọc so_doanh_thu (phân trang)…")
    db_rows = fetch_ledger_rows(sb)
    log(f"  Sổ: {len(db_rows)} dòng")
    log("Reconcile (consumption, 6 tầng)…")
    result = reconcile(all_payloads, db_rows)
    m = result["matches"]

    # 3) Floor + chuẩn bị insert
    floor = min_insert_day or ""
    to_insert = [s for s in result["sheet_only"] if _primary_day(s) >= floor]
    below_floor = len(result["sheet_only"]) - len(to_insert)
    for p in to_insert:
        p["updated_by_email"] = actor_email
        if not p.get("created_by_email"):
            p["created_by_email"] = actor_email

    totals = {
        "fetched": len(all_payloads),
        "skippedExisting": len(m["exact"]),
        "skippedLoose": len(m["loose"]) + len(m["loose_blank"]),
        "skippedWeak": len(m["day_vnd"]),
        "amountMismatch": len(m["uid_day"]),
        "dupSuspect": len(result["dup_suspect"]),
        "belowFloor": below_floor,
        "plannedInsert": len(to_insert),
        "inserted": 0,
    }
    for s in result["dup_suspect"]:
        log(f"  ⚠ dup_suspect (không insert): {_primary_day(s)} | "
            f"uid={s.get('uid')} | {s.get('ten_khach')} | {s.get('so_tien_vnd')}")
    for s, d in m["uid_day"]:
        log(f"  ⚠ lệch tiền: uid={s.get('uid')} {_primary_day(s)} "
            f"file={s.get('so_tien_vnd')} sổ={d.get('so_tien_vnd')}")
    if below_floor:
        log(f"  {below_floor} dòng < {floor} chỉ báo cáo, không insert")
```

Sau đó block insert như cũ (batch 50, retry, đắp `created_at`), chạy 1 lần trên `to_insert` toàn cục (không còn per-tab). Return dict: giữ key cũ (`spreadsheetId, tabs, fetched, skippedExisting, skippedLoose, plannedInsert, inserted, dryRun, samples`) + thêm `skippedWeak, amountMismatch, dupSuspect, belowFloor`. Import đầu file thêm: `from ledger_recon import reconcile, fetch_ledger_rows, _primary_day`. Xóa 2 hàm `_load_existing_import_fingerprints`, `_load_existing_loose_fps` (không còn ai gọi — verify bằng grep trước khi xóa).

- [ ] **Step 2: Cập nhật 2 test trong `test_gsheet_dedup.py` (CHỈ 2 test này):**

`test_pattern_x_with_exact_match_payload_present` — semantics mới: dòng renamed y hệt uid+ngày+tiền = dup_suspect (không còn skippedLoose):

```python
    assert result["skippedExisting"] == 1
    assert result["dupSuspect"] == 1
    assert result["plannedInsert"] == 0
```

`test_blank_uid_early_row_absorbs_filled_version` — guard cần tên trùng, thêm `"ten_khach": "Minh"` vào dict `early_blank` (dòng sớm thực tế có tên, chỉ thiếu UID). Assertion giữ nguyên.

Lưu ý `_FakeSupabase`: sync mới select cột qua `fetch_ledger_rows` — `_FakeQuery.select` đã bỏ qua args nên fake rows dùng thẳng; các dict fake row thiếu `ten_khach` mặc định coi là "" (guard xử lý). `test_pattern_b` sau khi thêm tên sẽ ghép qua guard tên. Nếu test khác gãy vì `order()` chưa có trong `_FakeQuery` → thêm method `def order(self, *_a, **_k): return self` vào `_FakeQuery` (được phép — fake infra, không phải đổi hành vi).

- [ ] **Step 3: Đọc `tests/test_gsheet_streaming.py`, sửa tối thiểu.** Test này khắc hành vi streaming per-tab (`del payloads`). Flow mới vẫn stream FETCH per-tab nhưng gom payload toàn cục trước reconcile (~16k dict ≈ 15-20MB, chấp nhận — OOM 9/7 do storage calls, không phải payload). Sửa assertion cho khớp flow mới, GIỮ ý test (không tràn bộ nhớ khi nhiều tab). Nếu test không sửa nổi trong 15 phút → DỪNG, báo Minh kèm nội dung test.

- [ ] **Step 4: Chạy toàn bộ:**

```bash
cd backend && python -m pytest tests/ -v --ignore=tests/test_be_bug_hunt_1306.py -x
```

Expected: pass hết. (`test_be_bug_hunt_1306.py` đụng nhiều module khác — chỉ chạy nếu nhanh; fail sẵn từ trước thì bỏ qua, ghi chú lại.)

### Task 1.4: Audit script dùng module chung + bucket `dup_suspect`

**Files:**
- Modify: `backend/scripts/audit_so_vs_allfile.py`
- Modify: `backend/scripts/AUDIT_SO_VS_ALLFILE.md`

- [ ] **Step 1:** Xóa trong audit script: `_clean, _primary_day, _vnd, _k_exact, _k_uid_day, _k_day_vnd, Pool, reconcile, fetch_db_rows` (dòng 81-232). Thay import:

```python
from ledger_recon import (  # noqa: E402
    _clean, _primary_day, _vnd, fetch_ledger_rows, reconcile,
)
```

(`fetch_db_rows(sb)` → đổi call site thành `fetch_ledger_rows(sb)`.)

- [ ] **Step 2:** `build_summary` + `write_outputs` thêm bucket mới:
  - Bảng tổng thêm dòng: `| Nghi sheet trùng (không tự nạp) | {len(result['dup_suspect'])} dòng / {_fmt_vnd(...)} ₫ |`
  - CSV mới `dup_suspect.csv` — cột như `sheet_only.csv` (dùng `_sheet_csv_row`).
  - `run_selftest()`: thay bằng gọi 3 case tiêu biểu từ contract (mine-not-eat, dup_suspect, idempotent) — copy logic từ `tests/test_recon_matching.py`, giữ chạy được không cần pytest/creds. In `SELFTEST PASS`.
- [ ] **Step 3:** Chạy selftest + audit T6–T7 + audit full-2026 (read-only prod):

```bash
cd backend && python scripts/audit_so_vs_allfile.py --selftest
cd backend && python scripts/audit_so_vs_allfile.py
cd backend && python scripts/audit_so_vs_allfile.py --start 2026-01-01 --end 2026-12-31
```

**So với bảng oracle. Lệch → DỪNG báo Minh.** Chạy thêm full-history đo drift tiền-2026 (chỉ ghi nhận số, không hành động):

```bash
cd backend && python scripts/audit_so_vs_allfile.py --start 2024-01-01 --end 2026-12-31
```

- [ ] **Step 4:** Cập nhật `AUDIT_SO_VS_ALLFILE.md`: thêm `dup_suspect.csv` vào bảng output; thêm mục "Danang REV: chi nhánh đóng, 49 dòng 2024–2025, không import — quyết định Minh 23/7/2026".

### Task 1.5: Kiểm tra 2 đường import còn lại + commit Phase 1

**Files:**
- Modify (có điều kiện): `backend/xlsx_ledger_import.py`
- Đọc-only: `backend/revenue_routes.py:1700-1740`

- [ ] **Step 1:** Đọc `xlsx_ledger_import.py`. Nếu có block skip kiểu `_loose_fp(p) in ... or _loose_fp_blank(p) in ...` (cùng bug) và cấu trúc là gom payloads rồi insert → thay bằng gọi `reconcile` + insert `sheet_only` (floor như 1.3). Nếu cấu trúc KHÁC (streaming phức tạp, side-effects) → KHÔNG sửa, ghi vào báo cáo cuối: "xlsx path còn bug X tại dòng Y, cần plan riêng". Không được kéo dài quá 30 phút.
- [ ] **Step 2:** Đọc `revenue_routes.py:1711` (`sync_ledger_from_gsheet`) — confirm chỉ forward kwargs + trả JSON. Key cũ giữ nguyên nên route không cần sửa. Nếu route đọc key bị xóa → sửa tối thiểu cho chạy.
- [ ] **Step 3:** Commit:

```bash
git add backend/ledger_recon.py backend/gsheet_ledger_import.py backend/xlsx_ledger_import.py backend/scripts/audit_so_vs_allfile.py backend/scripts/AUDIT_SO_VS_ALLFILE.md backend/tests/test_recon_matching.py backend/tests/test_gsheet_dedup.py backend/tests/test_gsheet_streaming.py
git commit -m "fix(import): dedup membership→consumption, chặn dòng UID-trống nuốt khách mới

- ledger_recon.py: Pool+reconcile chung import↔audit, global tier-pass, guard tên/SĐT tầng blank
- dup_suspect: sheet trùng y hệt uid+ngày+tiền không tự nạp, đưa người quyết
- floor 2026-01-01: dòng lịch sử chỉ báo cáo không insert
- bug nuốt 11 GD/175tr 2026 (audit A1 23/7)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### ✅ Điều kiện xong Phase 1
- pytest pass hết, selftest PASS
- Audit T6–T7 + full-2026 khớp oracle từng dòng
- Chưa ghi 1 byte nào vào prod

---

## Phase 2 — Sửa data prod (mọi bước ghi đều có cổng STOP)

### Task 2.1: Dry-run import + đối chiếu oracle

- [ ] **Step 1:** Viết script tạm `backend/scripts/run_import.py` (committed, dùng lại được):

```python
#!/usr/bin/env python3
"""Chạy sync_gsheet_to_ledger từ CLI. Mặc định DRY-RUN. --apply mới ghi."""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

import os
from supabase import create_client
from gsheet_ledger_import import sync_gsheet_to_ledger, DEFAULT_MIN_INSERT_DAY


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="GHI THẬT (mặc định dry-run)")
    ap.add_argument("--min-day", default=DEFAULT_MIN_INSERT_DAY)
    args = ap.parse_args()

    url = os.getenv("SUPABASE_URL", "")
    assert "jozcvbbypwvzaefteoxn" in url, f"KHÔNG phải prod: {url}"
    sb = create_client(url, os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    res = sync_gsheet_to_ledger(
        sb, dry_run=not args.apply, min_insert_day=args.min_day,
        actor_email="import:gsheet:cli",
    )
    print(json.dumps({k: v for k, v in res.items() if k != "samples"},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2:** Dry-run + so oracle (`plannedInsert` = 9 dòng chốt + dòng mới ≥ 22/7 nếu sheet đã ghi thêm; log liệt kê từng khách):

```bash
cd backend && python scripts/run_import.py
```

- [ ] **Step 3:** ⛔ **STOP — chờ Minh OK.** Gửi Minh: danh sách đầy đủ dòng sẽ insert (tách rõ "9 dòng bug cũ" vs "dòng mới sau 22/7") + 1 dup_suspect Đô Đô + nhắc gửi Thu Hiền 4 câu hỏi (Task 2.4 có sẵn nội dung). Chưa OK → không sang step sau.
- [ ] **Step 4 (sau OK):** `cd backend && python scripts/run_import.py --apply` → expected `inserted` = đúng số plannedInsert ở dry-run (chạy cách nhau lâu thì dry-run lại trước khi apply).
- [ ] **Step 5:** Verify: chạy lại audit full-2026 → `sheet_only = 0`, `dup_suspect = 1`. Lệch → DỪNG báo ngay (đã ghi prod, không tự "sửa tiếp").

### Task 2.2 (tùy kết quả Thu Hiền): Đô Đô

- Nếu Thu Hiền xác nhận sheet trùng → chị xóa dòng thừa trên sheet → chạy lại audit: `dup_suspect = 0`. Xong.
- Nếu xác nhận 2 lần đóng thật → Minh quyết cách nạp (thêm dòng qua UI app là gọn nhất — app cho phép, dup_suspect không chặn dòng nhập tay). KHÔNG viết code mới cho ca này.

### Task 2.3: Backfill UID 21 dòng trống

**Files:**
- Create: `backend/scripts/backfill_blank_uid.py`

- [ ] **Step 1:** Viết script:

```python
#!/usr/bin/env python3
"""Backfill UID cho dòng so_doanh_thu UID trống, ghép từ All File.

2 bước bắt buộc:
  1. python scripts/backfill_blank_uid.py            # tạo CSV preview (read-only)
  2. Minh duyệt/sửa CSV → python scripts/backfill_blank_uid.py --apply <csv>

--apply: backup JSON các dòng sẽ sửa vào backups/ TRƯỚC khi update;
chỉ update cột uid; mỗi update in ra 1 dòng.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

import os
from supabase import create_client
from ledger_recon import _clean, _primary_day, fetch_ledger_rows, _loose_fp_blank
from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID, TeamLookupCache, collect_payloads_from_gsheet,
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", default=None, metavar="CSV",
                    help="Đường dẫn CSV preview ĐÃ DUYỆT — ghi thật")
    args = ap.parse_args()

    url = os.getenv("SUPABASE_URL", "")
    assert "jozcvbbypwvzaefteoxn" in url, f"KHÔNG phải prod: {url}"
    sb = create_client(url, os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))

    db_rows = fetch_ledger_rows(sb)
    blanks = [r for r in db_rows if not _clean(r.get("uid"))]
    print(f"Dòng UID trống: {len(blanks)}")

    if args.apply:
        _apply(sb, args.apply, {r["id"]: r for r in blanks})
        return

    team_cache = TeamLookupCache(sb)
    payloads = collect_payloads_from_gsheet(
        team_cache, spreadsheet_id=os.environ.get("GOOGLE_SHEETS_ID")
        or DEFAULT_SPREADSHEET_ID)
    used: set[int] = set()
    out = []
    for b in blanks:
        bk = _loose_fp_blank(b)
        cands = []
        for i, p in enumerate(payloads):
            if i in used or not _clean(p.get("uid")):
                continue
            if _loose_fp_blank(p) != bk:
                continue
            phone_ok = _clean(p.get("sdt")) and _clean(p.get("sdt")) == _clean(b.get("sdt"))
            name_ok = (_clean(p.get("ten_khach")).lower()
                       and _clean(p.get("ten_khach")).lower() == _clean(b.get("ten_khach")).lower())
            if phone_ok or name_ok:
                cands.append(i)
        if len(cands) == 1:
            used.add(cands[0])
            p = payloads[cands[0]]
            conf, uid, ev = "single", _clean(p.get("uid")), p.get("ten_khach")
        elif len(cands) > 1:
            conf, uid, ev = "ambiguous", "", f"{len(cands)} ứng viên"
        else:
            conf, uid, ev = "none", "", ""
        out.append([b["id"], _primary_day(b), _clean(b.get("ten_khach")),
                    _clean(b.get("sdt")), b.get("so_tien_vnd"),
                    _clean(b.get("sale_crm_name")), uid, conf, ev])

    tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = BACKEND_DIR / "backups" / f"backfill_blank_uid_preview_{tag}.csv"
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["db_id", "ngay", "ten_khach", "sdt", "vnd", "sale",
                    "proposed_uid", "confidence", "evidence"])
        w.writerows(out)
    n_single = sum(1 for r in out if r[7] == "single")
    print(f"Preview: {path}\n  single: {n_single} | ambiguous/none: {len(out) - n_single}")
    print("→ Minh duyệt CSV (xóa/sửa proposed_uid tùy ý) rồi chạy --apply <csv>")


def _apply(sb, csv_path: str, blank_by_id: dict) -> None:
    with open(csv_path, encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if _clean(r.get("proposed_uid"))]
    ids = [r["db_id"] for r in rows]
    assert len(ids) == len(set(ids)), "CSV có db_id trùng"
    assert all(i in blank_by_id for i in ids), "CSV chứa db_id không còn trống trong Sổ"

    tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    bpath = BACKEND_DIR / "backups" / f"backfill_blank_uid_backup_{tag}.json"
    bpath.write_text(json.dumps([blank_by_id[i] for i in ids],
                                ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Backup {len(ids)} dòng → {bpath}")
    for r in rows:
        sb.table("so_doanh_thu").update({"uid": r["proposed_uid"].strip()}) \
          .eq("id", r["db_id"]).execute()
        print(f"  ✓ {r['db_id']}: uid ← {r['proposed_uid']}")
    print(f"Xong {len(rows)} dòng.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2:** Chạy preview (read-only): `cd backend && python scripts/backfill_blank_uid.py` → báo Minh file CSV + số single/ambiguous.
- [ ] **Step 3:** ⛔ **STOP — chờ Minh duyệt CSV.** Ambiguous/none → Minh tự điền hoặc bỏ trống (bỏ trống = giữ nguyên).
- [ ] **Step 4 (sau duyệt):** `python scripts/backfill_blank_uid.py --apply backups/<file đã duyệt>.csv` → verify đếm blank còn lại khớp số Minh chủ ý giữ.

### Task 2.4: Bộ 4 câu hỏi Thu Hiền (soạn sẵn, Minh gửi)

- [ ] Tạo `backend/backups/cau_hoi_thu_hien_2026-07-23.md`:

```markdown
Chị Hiền ơi, em đối chiếu Sổ doanh thu trên app với All File, nhờ chị xác nhận 4 điểm:

1. **Đô Đô (UID 3299959930, 15/7)**: file có 2 dòng cùng 31.800.000 (đợt 4) — SĐT lệch nhau 1 số cuối. Là 2 lần đóng thật hay 1 dòng bị nhập đúp ạ? Nếu đúp chị xóa giúp em 1 dòng nhé.
2. **8 giao dịch app tự bắt mà file chưa có** (em gửi kèm danh sách db_only loại tu_dong): chị xem còn thiếu trên file không — nếu thiếu thật thì đây là phần app bắt giúp được ạ.
3. **3 dòng trên app không có UID không có tên** (nhập tay, em gửi id kèm): chị/em bên nào nhập nhầm không, xử sao ạ?
4. **1 dòng ngày 04/10/2026** (tương lai) trên cả file lẫn app — chắc gõ nhầm năm/tháng, chị sửa file giúp em nhé.
```

Kèm 2 CSV trích từ audit gần nhất (`db_only.csv` lọc tu_dong; 3 dòng tay rỗng).

### Task 2.5: Commit Phase 2

```bash
git add backend/scripts/run_import.py backend/scripts/backfill_blank_uid.py
git commit -m "feat(scripts): CLI import (dry-run mặc định) + backfill UID dòng trống có duyệt

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### ✅ Điều kiện xong Phase 2
- Audit full-2026: `sheet_only = 0`; `dup_suspect` = 0 hoặc 1-đã-có-quyết-định
- Blank UID = 0 (hoặc danh sách Minh chủ ý giữ)
- 2 lần ⛔ STOP đều có OK của Minh trong chat trước khi ghi

---

## Phase 3 — Pipeline niềm tin tới switch-day

### Task 3.1: Một lệnh import + audit ra một báo cáo

**Files:**
- Create: `backend/scripts/sync_and_audit.py`

- [ ] **Step 1:**

```python
#!/usr/bin/env python3
"""1 lệnh: import GSheet (apply) → audit 2 tháng gần nhất → 1 báo cáo.

Chạy hàng tuần tới ngày Thu Hiền chuyển hẳn sang Sổ. Exit code != 0 nếu
recent-month còn lệch (sheet_only/amount_mismatch > 0) — nhìn phát biết ngay.
KHÔNG tự lên cron — Minh chạy tay hoặc tự quyết lịch.
"""
from __future__ import annotations

import io
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND = Path(__file__).resolve().parents[1]
today = date.today()
prev = (today.replace(day=1) - timedelta(days=1)).replace(day=1)

r1 = subprocess.run([sys.executable, "scripts/run_import.py", "--apply"], cwd=BACKEND)
if r1.returncode != 0:
    sys.exit("Import lỗi — dừng, không audit.")
r2 = subprocess.run(
    [sys.executable, "scripts/audit_so_vs_allfile.py",
     "--start", prev.isoformat(), "--end", today.isoformat()],
    cwd=BACKEND, capture_output=True, text=True, encoding="utf-8")
print(r2.stdout)
ok = ("File có, app THIẾU | 0 dòng" in r2.stdout
      and "Lệch số tiền (cùng khách cùng ngày) | 0 dòng" in r2.stdout)
print("\n=== " + ("✅ KHỚP SẠCH 2 tháng gần nhất" if ok else "❌ CÒN LỆCH — mở CSV") + " ===")
sys.exit(0 if ok else 2)
```

- [ ] **Step 2:** ⛔ **STOP — hỏi Minh trước lần chạy đầu** (vì có `--apply`). Sau đó chạy thử 1 lần, expected exit 0 + `✅ KHỚP SẠCH`.

### Task 3.2: Learning note (Learning Law bắt buộc)

**Files:**
- Create: `docs/learnings/2026-07-23-membership-dedup-eats-real-rows.md`

- [ ] **Step 1:**

```markdown
# Membership-dedup nuốt giao dịch thật (import GSheet → Sổ doanh thu)

**Problem:** 11 GD / 175tr (2026) có trên All File nhưng không vào Sổ. Tỷ lệ khớp
recent-month tụt (T6 −42tr, T7 −11tr) dù full-year vẫn "đạt" 99.66%.

**Trap:** Dedup bằng membership (`key in existing_set`) — 1 dòng UID-trống trong DB
tạo key `|sale|tháng|tiền` chặn VĨNH VIỄN mọi khách mới trùng bộ ba đó. Giá gói cố
định → trùng là chuyện thường. Trap kép: (1) trung bình cả năm che vết rò đang phình
(seed 29/5 sạch → lỗi chỉ hiện từ T6, nhìn aggregate không thấy); (2) suýt vá sai —
"bỏ check blank cho dòng có UID" sẽ mở lại pattern-B dup (vụ 15/6, 18 cặp X).

**Insight:** Membership hỏi "key này TỒN TẠI chưa?" — sai câu hỏi. Câu đúng: "còn dòng
DB nào CHƯA ĐƯỢC GHÉP không?" = consumption. Audit A1 dùng consumption nên ra số đúng
trong khi import sai. Fix triệt để = import và audit dùng CHUNG reconcile() → audit
thành dry-run của import, hai bên không thể lệch nhau. Kèm: tầng blank phải guard
tên/SĐT (không thì thứ tự sheet quyết ai bị nuốt), global tier-pass (không thì tầng
yếu cướp dòng của cặp exact — artifact Hiểu Minh), sheet-dup y hệt → dup_suspect chờ
người quyết chứ không auto gì cả.

**Rule:** Sổ tiền dedup bằng CONSUMPTION, không membership. Mọi key dedup bỏ-trường
(blank-fallback) phải có guard bằng trường định danh khác + chỉ tiêu thụ 1:1. Nghi
ngờ giữa thừa và thiếu → chọn hướng lộ ra cho người quyết (dup_suspect), không chọn
hướng âm thầm.
```

### Task 3.3: Cập nhật docs + MODULES.md + skill

**Files:**
- Modify: `MODULES.md` (mục 5 Sổ doanh thu)
- Modify: `.claude/skills/so-doanh-thu-revenue/SKILL.md`

- [ ] **Step 1:** `MODULES.md` mục Sổ doanh thu, thêm/sửa các dòng:

```
- Matching chung import↔audit: backend/ledger_recon.py (consumption Pool, 6 tầng, guard tên/SĐT)
- CLI: backend/scripts/run_import.py (dry-run mặc định) · backfill_blank_uid.py (preview→duyệt→apply) · sync_and_audit.py (import+audit 1 báo cáo)
- Danang REV: chi nhánh đóng, không import (quyết định 23/7/2026)
```

- [ ] **Step 2:** Skill `so-doanh-thu-revenue`: thêm mục Gotchas: bug membership-dedup 23/7 (1 câu + trỏ learning note + plan này). Facts drift: import giờ qua `ledger_recon.reconcile`, floor `2026-01-01`, bucket `dup_suspect`.
- [ ] **Step 3:** Commit:

```bash
git add backend/scripts/sync_and_audit.py docs/learnings/2026-07-23-membership-dedup-eats-real-rows.md MODULES.md .claude/skills/so-doanh-thu-revenue/
git commit -m "docs(so-doanh-thu): learning membership→consumption + sync_and_audit 1 lệnh + cập nhật index

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### ✅ Điều kiện xong Phase 3 (= sẵn sàng switch-day)
- `sync_and_audit.py` exit 0 (`✅ KHỚP SẠCH`) — chạy lặp hàng tuần, 2 tuần liên tiếp ✅ là đủ bằng chứng A3 công bố thay All File
- Learning note + MODULES.md + skill đã cập nhật

---

## Ngoài scope plan này (đừng làm — kể cả khi "tiện tay")

1. **Validation form thêm dòng Sổ trên app** (bắt buộc UID/tên+SĐT, cảnh báo trùng khi nhập tay) — plan FE/BE riêng, Minh giao sau.
2. **One-time import 49 dòng Danang REV** cho báo cáo all-time — chờ Minh quyết (tab cột khác, cần mapper riêng).
3. **Cron/schedule cho sync_and_audit** — Minh tự quyết lịch chạy.
4. **Đồng bộ khi Thu Hiền SỬA field trên sheet** (update-sync) — chủ ý không làm: file sắp nghỉ, lệch field nổi qua audit, sửa tay trong app.
5. Mọi thứ dính DingTalk notify, Zalo, FE components — không liên quan.
```