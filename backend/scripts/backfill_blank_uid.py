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
