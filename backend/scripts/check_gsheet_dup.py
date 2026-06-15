#!/usr/bin/env python3
"""Quét nhanh dòng trùng trong so_doanh_thu sau khi Sync Data chạy.

READ-ONLY. Phát hiện 2 loại:
  A — cùng UID + ngày tiền về + số tiền, khác đợt sync, dòng thiếu thông tin
  B — UID trống đợt sớm, khớp dòng đã điền đủ đợt sau (ngày + số tiền)

Usage: python scripts/check_gsheet_dup.py [--since YYYY-MM-DD]
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
except ImportError:
    pass

from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

COLS = (
    "id, created_at, created_by_email, uid, ngay_tien_ve, pay_time, "
    "so_tien_vnd, ten_khach, sdt, sale_crm_name, team, goi_hoc, "
    "loai_nhap, don_hang_id"
)
RUN_GAP = timedelta(minutes=30)
COMPAT = ("uid", "ten_khach", "sdt", "sale_crm_name", "goi_hoc")
COMPLETE = ("ten_khach", "sdt", "uid", "goi_hoc", "sale_crm_name")


def n(v) -> str:
    if v is None:
        return ""
    s = str(v).strip()
    return "" if s.lower() == "nan" else s.casefold()


def is_import(r):
    return str(r.get("created_by_email") or "").startswith("import:")


def score(r):
    s = sum(1 for f in COMPLETE if n(r.get(f)))
    pt = str(r.get("pay_time") or "")
    if len(pt) > 10 and not pt[11:19].startswith("00:00:00"):
        s += 1
    return s


def compat(r, s):
    return all(n(r.get(f)) == "" or n(r.get(f)) == n(s.get(f)) for f in COMPAT)


def fills(r, s):
    return any(n(r.get(f)) == "" and n(s.get(f)) != "" for f in COMPAT)


def vnd(x):
    return f"{int(x):,}".replace(",", ".")


def parse_ts(s):
    return datetime.fromisoformat(str(s).replace("Z", "+00:00"))


def fetch_all(since: str | None):
    rows = []
    offset = 0
    while True:
        q = sb.table("so_doanh_thu").select(COLS).order("created_at").order("id")
        if since:
            q = q.gte("created_at", since)
        res = q.range(offset, offset + 999).execute()
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
    return rows


def assign_runs(rows):
    imp = sorted((r for r in rows if is_import(r)), key=lambda r: str(r["created_at"]))
    run_of = {}
    meta = []
    prev = None
    for r in imp:
        t = parse_ts(r["created_at"])
        if prev is None or (t - prev) > RUN_GAP:
            meta.append({"run": len(meta) + 1, "start": str(r["created_at"]), "count": 0})
        run_of[r["id"]] = len(meta)
        meta[-1]["count"] += 1
        meta[-1]["end"] = str(r["created_at"])
        prev = t
    return run_of, meta


def detect(rows, run_of):
    dups = []
    consumed = set()
    blocks = defaultdict(list)
    for r in rows:
        blocks[(str(r.get("ngay_tien_ve") or ""), int(r.get("so_tien_vnd") or 0))].append(r)
    for block in blocks.values():
        if len(block) < 2:
            continue
        cands = sorted(
            (r for r in block if is_import(r)),
            key=lambda r: (score(r), str(r["created_at"])),
        )
        for r in cands:
            if r["id"] in consumed:
                continue
            r_run = run_of.get(r["id"])
            best = None
            best_rank = None
            for s in block:
                if s["id"] == r["id"] or s["id"] in consumed:
                    continue
                s_run = run_of.get(s["id"])
                if r_run is not None and s_run is not None and s_run == r_run:
                    continue
                if score(s) < score(r):
                    continue
                if not compat(r, s) or not fills(r, s):
                    continue
                uid_match = n(r.get("uid")) != "" and n(r.get("uid")) == n(s.get("uid"))
                rank = (0 if uid_match else 1, -score(s), str(s["created_at"]))
                if best is None or rank < best_rank:
                    best, best_rank = s, rank
            if best is not None:
                uid_match = n(r.get("uid")) != "" and n(r.get("uid")) == n(best.get("uid"))
                cat = "A" if uid_match else "B"
                dups.append({"row": r, "keep": best, "cat": cat})
                consumed.add(r["id"])
    return dups


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="Chỉ scan dòng created_at >= ngày này (YYYY-MM-DD)")
    args = ap.parse_args()

    print(f"Tải so_doanh_thu{f' (since {args.since})' if args.since else ''}…")
    rows = fetch_all(args.since)
    print(f"  {len(rows)} dòng")

    run_of, meta = assign_runs(rows)
    print(f"\n═══ {len(meta)} ĐỢT SYNC PHÁT HIỆN ═══")
    for m in meta[-6:]:
        print(f"  Đợt {m['run']}: {m['start'][:16]} → {m['end'][:16]} ({m['count']} dòng)")

    dups = detect(rows, run_of)
    by_cat = defaultdict(list)
    for d in dups:
        by_cat[d["cat"]].append(d)

    print(f"\n═══ KẾT QUẢ: {len(dups)} dòng nghi trùng ═══")
    for cat, label in [("A", "cùng UID + ngày + tiền (khác đợt sync, bản thiếu thông tin)"),
                       ("B", "UID trống đợt sớm, khớp dòng đã điền đủ đợt sau")]:
        items = by_cat.get(cat, [])
        total = sum(int(d["row"]["so_tien_vnd"] or 0) for d in items)
        print(f"\n  [{cat}] {label}: {len(items)} dòng / {vnd(total)} ₫")
        for d in items:
            r, k = d["row"], d["keep"]
            print(
                f"    · {r['ngay_tien_ve']} | {vnd(r['so_tien_vnd'])} ₫ | "
                f"uid={r.get('uid') or '∅'} | «{r.get('ten_khach') or '∅'}» | "
                f"{r.get('sale_crm_name') or '∅'} | {r.get('team') or '∅'} | "
                f"đợt {run_of.get(r['id'])} → giữ đợt {run_of.get(k['id'])} «{k.get('ten_khach') or '∅'}»"
            )

    if dups:
        by_run = defaultdict(int)
        for d in dups:
            by_run[run_of.get(d["row"]["id"])] += 1
        print("\n  Phân bổ theo đợt (đợt nào tạo ra bản trùng):")
        for run, n_ in sorted(by_run.items()):
            print(f"    Đợt {run}: {n_} dòng")
    else:
        print("  ✅ Không phát hiện trùng.")


if __name__ == "__main__":
    main()
