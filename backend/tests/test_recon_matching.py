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
