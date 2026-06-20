#!/usr/bin/env python3
"""Dọn dòng trùng trong so_doanh_thu do Sync Data import nhiều đợt từ Google Sheet.

Pattern trùng: dòng đợt sync sớm có UID + sale + tiền nhưng trống tên/SĐT (sheet
chưa điền). Đợt sync sau sheet đã điền đủ → fingerprint chính xác đổi → bản
mới được import → đếm đôi.

Phát hiện 2 loại:
  A — cùng UID + ngày tiền về + số tiền, khác đợt sync; dòng thiếu thông tin
      (tên/SĐT trống) là bản sao đợt sớm của dòng đầy đủ hơn đợt sau.
  B — UID trống đợt sớm, khớp dòng đã điền đủ (UID + tên + SĐT) đợt sau trên
      (ngày, số tiền), không mâu thuẫn trường nào.

Nguyên tắc an toàn:
  - Không ghép 2 dòng cùng một đợt sync (cùng đợt = cùng tồn tại trên sheet
    tại một thời điểm = 2 giao dịch thật).
  - Chỉ xóa dòng do import tạo (created_by_email LIKE 'import:%').
  - Dòng tu_dong / đã link đơn / đã bị sửa tay trong app (có audit update) →
    KHÔNG xóa, đưa vào danh sách review.
  - Dry-run mặc định. --apply mới xóa thật: backup SELECT * ra JSON trước khi
    xóa; --restore <file> để khôi phục.

Usage:
    python scripts/dedup_gsheet_ledger.py                    # dry-run + report
    python scripts/dedup_gsheet_ledger.py --apply            # xóa thật (có backup)
    python scripts/dedup_gsheet_ledger.py --restore <file>   # khôi phục
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
BACKUP_DIR = BACKEND_DIR / "backups"

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    print("❌ Thiếu package: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("[ERROR] Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong backend/.env")
    sys.exit(1)

FETCH_COLS = (
    "id, created_at, created_by_email, updated_by_email, uid, ngay_tien_ve, "
    "pay_time, bank_time, so_tien_vnd, gmv_rmb, ten_khach, sdt, goi_hoc, "
    "sale_crm_name, team, gateway, payment_method, loai, loai_nhap, "
    "don_hang_id, ma_don_hang, crm_order_id"
)

RUN_GAP = timedelta(minutes=30)
COMPAT = ("uid", "ten_khach", "sdt", "sale_crm_name", "goi_hoc")
COMPLETE = ("ten_khach", "sdt", "uid", "goi_hoc", "sale_crm_name",
            "gateway", "payment_method", "loai", "bank_time")


def _n(v):
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() == "nan" else s.casefold()


def _is_import(r):
    return str(r.get("created_by_email") or "").startswith("import:")


def _score(r):
    s = sum(1 for f in COMPLETE if _n(r.get(f)))
    pt = str(r.get("pay_time") or "")
    if len(pt) > 10 and not pt[11:19].startswith("00:00:00"):
        s += 1
    return s


def _compat(r, s):
    return all(_n(r.get(f)) == "" or _n(r.get(f)) == _n(s.get(f)) for f in COMPAT)


def _fills(r, s):
    return any(_n(r.get(f)) == "" and _n(s.get(f)) != "" for f in COMPAT)


def _parse_ts(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def _vnd(n):
    return f"{int(n):,}".replace(",", ".")


def _pay_date(r):
    pt = str(r.get("pay_time") or "")[:10]
    return pt or str(r.get("ngay_tien_ve") or "")


def fetch_all_rows(sb):
    rows = []
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select(FETCH_COLS)
            .order("created_at")
            .order("id")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def fetch_edited_ids(sb):
    ids = set()
    offset = 0
    while True:
        res = (
            sb.table("so_doanh_thu_audit")
            .select("so_doanh_thu_id")
            .eq("action", "update")
            .range(offset, offset + 999)
            .execute()
        )
        chunk = res.data or []
        for r in chunk:
            ids.add(r["so_doanh_thu_id"])
        if len(chunk) < 1000:
            break
        offset += 1000
    return ids


def assign_runs(rows):
    imp = sorted((r for r in rows if _is_import(r)), key=lambda r: str(r["created_at"]))
    run_of = {}
    meta = []
    prev = None
    for r in imp:
        t = _parse_ts(r["created_at"])
        if prev is None or (t - prev) > RUN_GAP:
            meta.append({"run": len(meta) + 1, "start": str(r["created_at"]), "count": 0})
        run_of[r["id"]] = len(meta)
        meta[-1]["count"] += 1
        meta[-1]["end"] = str(r["created_at"])
        prev = t
    return run_of, meta


def _protected_reason(r, edited_ids):
    if str(r.get("loai_nhap") or "") != "tay":
        return "tu_dong (M3)"
    if not _is_import(r):
        return "không phải dòng import"
    if r.get("don_hang_id") or r.get("ma_don_hang") or r.get("crm_order_id"):
        return "đã link đơn hàng/CRM"
    if r["id"] in edited_ids:
        return "đã sửa tay trong app (audit)"
    return None


def detect(rows, run_of, edited_ids):
    """Phát hiện trùng theo 3 pattern:

    A — cùng UID + ngày + tiền, khác đợt sync, bản thiếu thông tin (tên/SĐT trống).
    B — UID trống đợt sớm, khớp dòng đã điền đủ đợt sau (ngày + tiền) không
        mâu thuẫn trường nào.
    X — cùng UID + cùng sale + cùng ngày + cùng tiền, khác đợt sync; tên/SĐT
        có thể khác (do sheet bị sửa giữa các đợt). UID PalFish = unique
        customer ID → cùng UID = cùng khách = trùng.

    KHÔNG ghép 2 dòng cùng một đợt sync (cùng đợt = 2 giao dịch thật trên sheet).
    """
    deletions = []
    review = []
    deleted_ids = set()
    absorbed = set()

    def mark(r, keep, category, note):
        reason = _protected_reason(r, edited_ids)
        entry = {"row": r, "keep_id": keep["id"], "category": category, "note": note}
        if reason:
            entry["protected"] = reason
            review.append(entry)
        else:
            deletions.append(entry)
            deleted_ids.add(r["id"])

    blocks = defaultdict(list)
    for r in rows:
        blocks[(str(r.get("ngay_tien_ve") or ""), int(r.get("so_tien_vnd") or 0))].append(r)

    for block in blocks.values():
        if len(block) < 2:
            continue
        cands = sorted(
            (r for r in block if _is_import(r)),
            key=lambda r: (_score(r), str(r["created_at"])),
        )
        for r in cands:
            if r["id"] in deleted_ids:
                continue
            r_run = run_of.get(r["id"])
            best = None
            best_rank = None
            best_cat = None
            for s in block:
                if s["id"] == r["id"] or s["id"] in deleted_ids:
                    continue
                s_run = run_of.get(s["id"])
                if r_run is not None and s_run is not None and s_run == r_run:
                    continue
                if r_run is not None and (s["id"], r_run) in absorbed:
                    continue
                if _score(s) < _score(r):
                    continue
                uid_match = _n(r.get("uid")) != "" and _n(r.get("uid")) == _n(s.get("uid"))
                sale_match = _n(r.get("sale_crm_name")) != "" and _n(r.get("sale_crm_name")) == _n(s.get("sale_crm_name"))
                # Pattern X: UID khớp + sale khớp → chắc chắn trùng (bỏ qua compat/fills)
                if uid_match and sale_match:
                    cat = "X"
                # Pattern A: UID khớp, r thiếu thông tin so s, không mâu thuẫn
                elif uid_match and _compat(r, s) and _fills(r, s):
                    cat = "A"
                # Pattern B: UID r trống, khớp tất cả trường còn lại
                elif _n(r.get("uid")) == "" and _compat(r, s) and _fills(r, s):
                    cat = "B"
                else:
                    continue
                rank = (
                    0 if cat == "X" else (1 if cat == "A" else 2),
                    -_score(s),
                    str(s["created_at"]),
                )
                if best is None or rank < best_rank:
                    best, best_rank, best_cat = s, rank, cat
            if best is not None:
                note = f"giữ {best['id'][:8]} (đợt {run_of.get(best['id'], '-')}, khách «{best.get('ten_khach') or ''}»)"
                mark(r, best, best_cat, note)
                if r["id"] in deleted_ids and r_run is not None:
                    absorbed.add((best["id"], r_run))

    return deletions, review


def _slice_stats(rows, deleted_ids, *, team, month):
    before_n = before_s = after_n = after_s = 0
    for r in rows:
        if str(r.get("team") or "") != team:
            continue
        if _pay_date(r)[:7] != month:
            continue
        vnd = int(r.get("so_tien_vnd") or 0)
        before_n += 1
        before_s += vnd
        if r["id"] not in deleted_ids:
            after_n += 1
            after_s += vnd
    return before_n, before_s, after_n, after_s


def print_report(rows, run_meta, deletions, review):
    print(f"\n═══ {len(run_meta)} ĐỢT SYNC ═══")
    for m in run_meta:
        print(f"  Đợt {m['run']:>2}: {m['start'][:16]} → {m['end'][:16]} ({m['count']} dòng)")

    deleted_ids = {d["row"]["id"] for d in deletions}
    by_cat = defaultdict(list)
    for d in deletions:
        by_cat[d["category"]].append(d)

    print("\n═══ DÒNG TRÙNG SẼ XÓA ═══")
    label = {
        "A": "A — cùng UID, cùng ngày + tiền, bản thiếu thông tin",
        "B": "B — UID trống đợt sớm, khớp dòng đã điền đủ",
        "X": "X — cùng UID + sale + ngày + tiền, khác đợt sync (sheet sửa tên/SĐT)",
    }
    for cat in ("X", "A", "B"):
        items = by_cat.get(cat, [])
        s = sum(int(d["row"]["so_tien_vnd"] or 0) for d in items)
        print(f"\n  [{label[cat]}]: {len(items)} dòng / {_vnd(s)} ₫")
        for d in items[:10]:
            r = d["row"]
            print(
                f"    · {r['ngay_tien_ve']} | {_vnd(r['so_tien_vnd'])} ₫ | "
                f"uid={r.get('uid') or '∅'} | «{r.get('ten_khach') or '∅'}» | "
                f"{r.get('sale_crm_name') or '∅'} | {r.get('team') or '∅'} | "
                f"đợt {d['note']}"
            )
        if len(items) > 10:
            print(f"    … +{len(items) - 10} dòng nữa (xem report)")

    total = sum(int(d["row"]["so_tien_vnd"] or 0) for d in deletions)
    print(f"\n  TỔNG XÓA: {len(deletions)} dòng / {_vnd(total)} ₫")

    print("\n═══ PHÂN BỔ THEO THÁNG (ngày tiền về) × TEAM ═══")
    by_mt = defaultdict(lambda: [0, 0])
    for d in deletions:
        r = d["row"]
        key = (str(r["ngay_tien_ve"])[:7], str(r.get("team") or "?"))
        by_mt[key][0] += 1
        by_mt[key][1] += int(r["so_tien_vnd"] or 0)
    for (month, team), (n, s) in sorted(by_mt.items()):
        print(f"  {month} | {team:<18} | {n:>4} dòng | {_vnd(s):>16} ₫")

    if review:
        print(f"\n═══ CẦN REVIEW TAY (được bảo vệ): {len(review)} dòng ═══")
        for d in review[:10]:
            r = d["row"]
            print(
                f"    · [{d['protected']}] {r['ngay_tien_ve']} | {_vnd(r['so_tien_vnd'])} ₫ | "
                f"uid={r.get('uid') or '∅'} | «{r.get('ten_khach') or '∅'}» | loại {d['category']}"
            )

    print("\n═══ ĐỐI CHIẾU T5/2026 — INHOUSE 1 (lọc pay_time) ═══")
    bn, bs, an, as_ = _slice_stats(rows, deleted_ids, team="Inhouse 1", month="2026-05")
    print(f"  Trước dọn: {bn} đơn / {_vnd(bs)} ₫")
    print(f"  Sau dọn  : {an} đơn / {_vnd(as_)} ₫")
    print(f"  Kỳ vọng đối chiếu sheet: ~576 đơn / ~7,15 tỷ ₫")


def write_report(deletions, review, run_meta, *, tag):
    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"dedup_report_{tag}.json"
    payload = {
        "generated_at": datetime.now().isoformat(),
        "runs": run_meta,
        "deletions": [{**{k: v for k, v in d.items() if k != "row"}, "row": d["row"]} for d in deletions],
        "review": review,
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return path


def apply_deletions(sb, deletions, *, tag):
    ids = [d["row"]["id"] for d in deletions]
    full = []
    for i in range(0, len(ids), 100):
        chunk = ids[i : i + 100]
        res = sb.table("so_doanh_thu").select("*").in_("id", chunk).execute()
        full.extend(res.data or [])
    if len(full) != len(ids):
        print(f"⚠️  Backup chỉ lấy được {len(full)}/{len(ids)} dòng — DỪNG, không xóa.")
        sys.exit(1)

    BACKUP_DIR.mkdir(exist_ok=True)
    backup_path = BACKUP_DIR / f"dedup_backup_{tag}.json"
    backup_path.write_text(json.dumps(full, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    print(f"💾 Backup {len(full)} dòng → {backup_path}")

    deleted = 0
    for i in range(0, len(ids), 100):
        chunk = ids[i : i + 100]
        sb.table("so_doanh_thu").delete().in_("id", chunk).execute()
        deleted += len(chunk)
        print(f"  Đã xóa {deleted}/{len(ids)}…")
    return backup_path


def restore(sb, backup_file):
    rows = json.loads(backup_file.read_text(encoding="utf-8"))
    print(f"Khôi phục {len(rows)} dòng từ {backup_file}…")
    inserted = 0
    for i in range(0, len(rows), 100):
        chunk = rows[i : i + 100]
        sb.table("so_doanh_thu").insert(chunk).execute()
        inserted += len(chunk)
        print(f"  Đã insert {inserted}/{len(rows)}…")
    print("✅ Khôi phục xong.")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="Xóa thật (mặc định dry-run)")
    ap.add_argument("--restore", metavar="FILE", help="Khôi phục từ backup JSON")
    args = ap.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    if args.restore:
        restore(sb, Path(args.restore))
        return

    print("Tải so_doanh_thu…")
    rows = fetch_all_rows(sb)
    print(f"  {len(rows)} dòng")
    print("Tải audit…")
    edited = fetch_edited_ids(sb)
    print(f"  {len(edited)} dòng từng bị sửa trong app")

    run_of, meta = assign_runs(rows)
    deletions, review = detect(rows, run_of, edited)
    print_report(rows, meta, deletions, review)

    tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = write_report(deletions, review, meta, tag=tag)
    print(f"\n📄 Report: {report_path}")

    if not deletions:
        print("Không có gì để xóa.")
        return

    if args.apply:
        backup_path = apply_deletions(sb, deletions, tag=tag)
        print(f"\n✅ Đã xóa {len(deletions)} dòng.")
        print(f"   Khôi phục nếu cần: python scripts/dedup_gsheet_ledger.py --restore {backup_path}")
    else:
        print("\n🔍 DRY-RUN. Chạy --apply để xóa thật.")


if __name__ == "__main__":
    main()
