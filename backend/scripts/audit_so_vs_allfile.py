#!/usr/bin/env python3
"""A1 — Đối chiếu Sổ doanh thu (so_doanh_thu) ↔ All File Thu Hiền (Google Sheet).

READ-ONLY: không ghi/xóa gì trên Supabase. Chỉ đọc sheet + đọc bảng, xuất báo cáo.

So khớp từng dòng theo 5 tầng (mạnh → yếu), tái dùng đúng fingerprint production
của luồng import (gsheet_ledger_import) để kết quả nhất quán với dedup:

  1. exact       — uid + ngày tiền về + số tiền VND
  2. loose       — uid + sale + tháng pay_time + số tiền  (_loose_fp production)
  3. loose_blank — sale + tháng + số tiền, một bên trống UID (pattern B)
  4. day_vnd     — ngày + số tiền (match YẾU, cần spot-check)
  5. uid_day     — uid + ngày khớp nhưng LỆCH SỐ TIỀN (báo cả 2 giá trị)

Còn lại: sheet_only (file có, app thiếu) / db_only (app có, file thiếu).

Output: backend/backups/audit_so_vs_allfile_<tag>/
  summary.md            — báo cáo 1 trang (paste thẳng lên Lark)
  summary.json          — máy đọc
  sheet_only.csv        — dòng file có, app thiếu
  db_only.csv           — dòng app có, file thiếu (kèm loai_nhap)
  amount_mismatch.csv   — cùng uid+ngày, lệch tiền
  matched_weak.csv      — match tầng yếu (ngày+tiền) để spot-check

Usage (chạy từ thư mục backend, dùng đúng python env backend):
    python scripts/audit_so_vs_allfile.py --selftest        # test logic, KHÔNG cần creds
    python scripts/audit_so_vs_allfile.py                   # đối chiếu T6–T7/2026 (mặc định)
    python scripts/audit_so_vs_allfile.py --start 2026-01-01 --end 2026-07-31

Env cần trong backend/.env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
GOOGLE_SERVICE_ACCOUNT_JSON (path), GOOGLE_SHEETS_ID (optional — có default).
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
from datetime import datetime
from collections import defaultdict
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf-8-sig"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

try:
    from dotenv import load_dotenv
    load_dotenv(BACKEND_DIR / ".env")
except ImportError:
    pass

from gsheet_ledger_import import (  # noqa: E402
    DEFAULT_SHEET_TABS,
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    collect_payloads_from_gsheet,
)
from ledger_recon import (  # noqa: E402
    _clean, _primary_day, _vnd, fetch_ledger_rows, reconcile,
)

DEFAULT_START = "2026-06-01"
DEFAULT_END = "2026-07-31"
PASS_PCT_VND = 99.5
PASS_MAX_MISMATCH = 10


def _fmt_vnd(n: int) -> str:
    return f"{int(n):,}".replace(",", ".")


# ---------- report ----------

def _month(row: dict) -> str:
    return _primary_day(row)[:7] or "?"


def build_summary(result: dict, sheet_rows: list[dict], db_rows: list[dict],
                  start: str, end: str) -> tuple[list[str], dict]:
    m = result["matches"]
    n_sheet = len(sheet_rows)
    vnd_sheet = sum(_vnd(r) for r in sheet_rows)
    n_db = len(db_rows)
    vnd_db = sum(_vnd(r) for r in db_rows)

    n_strong = len(m["exact"]) + len(m["loose"]) + len(m["loose_blank"])
    n_weak = len(m["day_vnd"])
    n_mismatch = len(m["uid_day"])
    n_dup = len(result.get("dup_suspect", []))
    n_only = len(result["sheet_only"])

    vnd_strong = sum(_vnd(s) for s, _ in m["exact"] + m["loose"] + m["loose_blank"])
    vnd_weak = sum(_vnd(s) for s, _ in m["day_vnd"])
    vnd_dup = sum(_vnd(s) for s in result.get("dup_suspect", []))
    vnd_only = sum(_vnd(s) for s in result["sheet_only"])

    pct_rows_ok = 100.0 * (n_strong + n_weak) / n_sheet if n_sheet else 0.0
    pct_vnd_ok = 100.0 * (vnd_strong + vnd_weak) / vnd_sheet if vnd_sheet else 0.0

    db_only = result["db_only"]
    db_only_auto = [r for r in db_only if _clean(r.get("loai_nhap")) != "tay"]
    db_only_manual = [r for r in db_only if _clean(r.get("loai_nhap")) == "tay"]

    mismatch_delta = sum(_vnd(s) - _vnd(d) for s, d in m["uid_day"])

    verdict_pass = pct_vnd_ok >= PASS_PCT_VND and n_mismatch <= PASS_MAX_MISMATCH

    lines: list[str] = []
    add = lines.append
    add(f"# Đối chiếu Sổ doanh thu ↔ All File Thu Hiền ({start} → {end})")
    add("")
    add(f"*Chạy lúc: {datetime.now().strftime('%Y-%m-%d %H:%M')} — script read-only, "
        f"không sửa dữ liệu.*")
    add("")
    add("## Kết quả tổng")
    add("")
    add("| Chỉ số | Giá trị |")
    add("|---|---|")
    add(f"| Dòng trên All File (trong kỳ) | {n_sheet} dòng / {_fmt_vnd(vnd_sheet)} ₫ |")
    add(f"| Dòng trên Sổ doanh thu (trong kỳ) | {n_db} dòng / {_fmt_vnd(vnd_db)} ₫ |")
    add(f"| Khớp chắc chắn (uid/sale-based) | {n_strong} dòng / {_fmt_vnd(vnd_strong)} ₫ |")
    add(f"| Khớp yếu (ngày+tiền — cần spot-check) | {n_weak} dòng / {_fmt_vnd(vnd_weak)} ₫ |")
    add(f"| **Tỷ lệ khớp theo số tiền** | **{pct_vnd_ok:.2f}%** (ngưỡng đạt {PASS_PCT_VND}%) |")
    add(f"| Tỷ lệ khớp theo số dòng | {pct_rows_ok:.2f}% |")
    add(f"| Lệch số tiền (cùng khách cùng ngày) | {n_mismatch} dòng / chênh "
        f"{_fmt_vnd(mismatch_delta)} ₫ (file − app) |")
    add(f"| Nghi sheet trùng (không tự nạp) | {n_dup} dòng / {_fmt_vnd(vnd_dup)} ₫ |")
    add(f"| File có, app THIẾU | {n_only} dòng / {_fmt_vnd(vnd_only)} ₫ |")
    add(f"| App có, file KHÔNG có — app tự ghi (tu_dong/import khác) | "
        f"{len(db_only_auto)} dòng / {_fmt_vnd(sum(_vnd(r) for r in db_only_auto))} ₫ |")
    add(f"| App có, file KHÔNG có — nhập tay/import | "
        f"{len(db_only_manual)} dòng / {_fmt_vnd(sum(_vnd(r) for r in db_only_manual))} ₫ |")
    add("")
    add(f"## KẾT LUẬN SƠ BỘ: {'✅ ĐẠT ngưỡng thay thế' if verdict_pass else '❌ CHƯA đạt — xem việc cần làm'}")
    add("")
    if not verdict_pass:
        add("Việc cần làm trước khi công bố thay thế:")
        if pct_vnd_ok < PASS_PCT_VND:
            add(f"- Tỷ lệ khớp tiền {pct_vnd_ok:.2f}% < {PASS_PCT_VND}% — xử lý danh sách "
                "`sheet_only.csv` (file có, app thiếu) trước.")
        if n_mismatch > PASS_MAX_MISMATCH:
            add(f"- {n_mismatch} dòng lệch số tiền — rà `amount_mismatch.csv` cùng Thu Hiền.")
        add("- Dòng `db_only.csv` loại tu_dong = app bắt được mà file chưa ghi "
            "→ khả năng FILE thiếu, xác nhận với Thu Hiền (điểm cộng cho app).")
    add("")
    add("## Theo tháng (ngày tiền về)")
    add("")
    add("| Tháng | File: dòng / ₫ | App: dòng / ₫ | Chênh ₫ (file − app) |")
    add("|---|---|---|---|")
    by_month: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for r in sheet_rows:
        b = by_month[_month(r)]
        b[0] += 1
        b[1] += _vnd(r)
    for r in db_rows:
        b = by_month[_month(r)]
        b[2] += 1
        b[3] += _vnd(r)
    for month in sorted(by_month):
        n1, s1, n2, s2 = by_month[month]
        add(f"| {month} | {n1} / {_fmt_vnd(s1)} | {n2} / {_fmt_vnd(s2)} | {_fmt_vnd(s1 - s2)} |")
    add("")
    add("## File chi tiết kèm theo")
    add("")
    add("- `sheet_only.csv` — file có, app thiếu (ưu tiên xử lý #1)")
    add("- `dup_suspect.csv` — nghi sheet trùng, chờ người quyết")
    add("- `amount_mismatch.csv` — cùng khách cùng ngày, lệch tiền (ưu tiên #2)")
    add("- `db_only.csv` — app có, file không có (xác nhận file thiếu hay app dư)")
    add("- `matched_weak.csv` — khớp ngày+tiền không có UID (spot-check 10 dòng ngẫu nhiên)")

    summary_json = {
        "window": {"start": start, "end": end},
        "sheet": {"rows": n_sheet, "vnd": vnd_sheet},
        "db": {"rows": n_db, "vnd": vnd_db},
        "matched": {
            "exact": len(m["exact"]),
            "loose": len(m["loose"]),
            "loose_blank": len(m["loose_blank"]),
            "weak_day_vnd": n_weak,
            "vnd_strong": vnd_strong,
            "vnd_weak": vnd_weak,
        },
        "amount_mismatch": {"rows": n_mismatch, "delta_vnd": mismatch_delta},
        "dup_suspect": {"rows": n_dup, "vnd": vnd_dup},
        "sheet_only": {"rows": n_only, "vnd": vnd_only},
        "db_only": {
            "auto_rows": len(db_only_auto),
            "manual_rows": len(db_only_manual),
            "vnd": sum(_vnd(r) for r in db_only),
        },
        "pct_rows_ok": round(pct_rows_ok, 2),
        "pct_vnd_ok": round(pct_vnd_ok, 2),
        "verdict_pass": verdict_pass,
    }
    return lines, summary_json


SHEET_CSV_COLS = ("ngay", "uid", "ten_khach", "sdt", "sale_crm_name", "team",
                  "so_tien_vnd", "gmv_rmb", "nguon_tab")
DB_CSV_COLS = ("ngay", "uid", "ten_khach", "sdt", "sale_crm_name", "team",
               "so_tien_vnd", "gmv_rmb", "loai_nhap", "created_by_email", "id")


def _sheet_csv_row(r: dict) -> list:
    return [_primary_day(r), _clean(r.get("uid")), _clean(r.get("ten_khach")),
            _clean(r.get("sdt")), _clean(r.get("sale_crm_name")), _clean(r.get("team")),
            _vnd(r), r.get("gmv_rmb"), _clean(r.get("created_by_email"))]


def _db_csv_row(r: dict) -> list:
    return [_primary_day(r), _clean(r.get("uid")), _clean(r.get("ten_khach")),
            _clean(r.get("sdt")), _clean(r.get("sale_crm_name")), _clean(r.get("team")),
            _vnd(r), r.get("gmv_rmb"), _clean(r.get("loai_nhap")),
            _clean(r.get("created_by_email")), _clean(r.get("id"))]


def write_outputs(out_dir: Path, result: dict, lines: list[str], summary_json: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "summary.md").write_text("\n".join(lines), encoding="utf-8")
    (out_dir / "summary.json").write_text(
        json.dumps(summary_json, ensure_ascii=False, indent=1), encoding="utf-8")

    def _csv(name: str, header: tuple, rows: list[list]) -> None:
        with (out_dir / name).open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(header)
            w.writerows(rows)

    _csv("sheet_only.csv", SHEET_CSV_COLS, [_sheet_csv_row(r) for r in result["sheet_only"]])
    _csv("dup_suspect.csv", SHEET_CSV_COLS,
         [_sheet_csv_row(r) for r in result.get("dup_suspect", [])])
    _csv("db_only.csv", DB_CSV_COLS, [_db_csv_row(r) for r in result["db_only"]])
    _csv(
        "amount_mismatch.csv",
        ("ngay", "uid", "ten_khach", "sale", "vnd_file", "vnd_app", "chenh", "db_id"),
        [[_primary_day(s), _clean(s.get("uid")), _clean(s.get("ten_khach")),
          _clean(s.get("sale_crm_name")), _vnd(s), _vnd(d), _vnd(s) - _vnd(d),
          _clean(d.get("id"))]
         for s, d in result["matches"]["uid_day"]],
    )
    _csv(
        "matched_weak.csv",
        ("ngay", "vnd", "file_khach", "file_sale", "app_khach", "app_sale", "app_loai_nhap", "db_id"),
        [[_primary_day(s), _vnd(s), _clean(s.get("ten_khach")), _clean(s.get("sale_crm_name")),
          _clean(d.get("ten_khach")), _clean(d.get("sale_crm_name")),
          _clean(d.get("loai_nhap")), _clean(d.get("id"))]
         for s, d in result["matches"]["day_vnd"]],
    )


# ---------- selftest (không cần creds / mạng) ----------

def run_selftest() -> None:
    def row(uid, day, vnd, sale="Sale A", name="K", sdt="09", **kw):
        base = {"uid": uid, "ngay_tien_ve": day, "pay_time": f"{day}T10:00:00",
                "so_tien_vnd": vnd, "gmv_rmb": round(vnd / 3700, 2), "ten_khach": name,
                "sdt": sdt, "sale_crm_name": sale, "team": "Inhouse 1",
                "loai_nhap": "tay", "created_by_email": "import:gsheet:SM Hanoi", "id": f"id-{uid}-{day}-{vnd}"}
        base.update(kw)
        return base

    # --- case 1: mine-not-eat (ca Ryan 23/7) ---
    db1 = [row("", "2026-06-28", 18_820_000, name="Huy Anh", sdt="84-111")]
    huy = row("3313488097", "2026-06-27", 18_820_000, name="Huy Anh", sdt="84-111")
    ryan = row("3313266573", "2026-06-28", 18_820_000, name="Ryan", sdt="82-222")
    r1 = reconcile([huy, ryan], db1)
    assert len(r1["sheet_only"]) == 1 and r1["sheet_only"][0]["ten_khach"] == "Ryan", \
        f"SELFTEST FAIL mine-not-eat: sheet_only={[s.get('ten_khach') for s in r1['sheet_only']]}"

    # --- case 2: dup_suspect (ca Đô Đô) ---
    db2 = [row("3299959930", "2026-07-15", 31_800_000)]
    s1 = row("3299959930", "2026-07-15", 31_800_000, sdt="84-358511220")
    s2 = row("3299959930", "2026-07-15", 31_800_000, sdt="84-358511221")
    r2 = reconcile([s1, s2], db2)
    assert len(r2["dup_suspect"]) == 1 and len(r2["sheet_only"]) == 0, \
        f"SELFTEST FAIL dup_suspect: dup={len(r2['dup_suspect'])} only={len(r2['sheet_only'])}"

    # --- case 3: idempotent (insert rồi chạy lại = 0) ---
    db3 = list(db1) + [dict(s) for s in r1["sheet_only"]]
    r3 = reconcile([huy, ryan], db3)
    assert len(r3["sheet_only"]) == 0, f"SELFTEST FAIL idempotent: {len(r3['sheet_only'])}"

    # --- case 4: full summary works ---
    sheet4 = [
        row("100", "2026-06-01", 1_000_000),
        row("200", "2026-06-05", 2_000_000),
        row("300", "2026-06-10", 3_000_000, name="K", sdt="09"),
        row("",    "2026-06-15", 4_000_000, sale="Sale B"),
        row("500", "2026-06-20", 5_000_000),
        row("600", "2026-06-25", 6_000_000),
    ]
    db4 = [
        row("100", "2026-06-01", 1_000_000),
        row("200", "2026-06-07", 2_000_000, pay_time="2026-06-07T09:00:00"),
        row("",    "2026-06-10", 3_000_000, name="K", sdt="09"),
        row("",    "2026-06-15", 4_000_000, sale="Sale C"),
        row("500", "2026-06-20", 5_500_000),
        row("700", "2026-06-28", 7_000_000, loai_nhap="tu_dong"),
    ]
    r4 = reconcile(sheet4, db4)
    lines, sj = build_summary(r4, sheet4, db4, "2026-06-01", "2026-06-30")
    assert sj["verdict_pass"] is False
    print("SELFTEST PASS — 4 cases OK")


# ---------- main ----------

def main() -> None:
    ap = argparse.ArgumentParser(description="Đối chiếu so_doanh_thu ↔ All File (read-only)")
    ap.add_argument("--start", default=DEFAULT_START, help=f"YYYY-MM-DD (mặc định {DEFAULT_START})")
    ap.add_argument("--end", default=DEFAULT_END, help=f"YYYY-MM-DD (mặc định {DEFAULT_END})")
    ap.add_argument("--spreadsheet-id", default=None, help="Override GOOGLE_SHEETS_ID")
    ap.add_argument("--limit", type=int, default=0, help="Giới hạn dòng sheet (debug)")
    ap.add_argument("--selftest", action="store_true", help="Test logic khớp, không cần creds")
    args = ap.parse_args()

    if args.selftest:
        run_selftest()
        return

    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        print("[ERROR] Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY trong backend/.env")
        sys.exit(1)

    from supabase import create_client
    sb = create_client(supabase_url, supabase_key)
    print(f"Supabase: {supabase_url}")

    sid = (args.spreadsheet_id or os.environ.get("GOOGLE_SHEETS_ID")
           or DEFAULT_SPREADSHEET_ID).strip()
    print("Load team cache (nhan_su_sale)…")
    team_cache = TeamLookupCache(sb)

    print(f"Đọc All File (spreadsheet {sid[:12]}…, tabs {DEFAULT_SHEET_TABS})…")
    payloads = collect_payloads_from_gsheet(
        team_cache, spreadsheet_id=sid, limit=args.limit)
    sheet_rows = [p for p in payloads if args.start <= _primary_day(p) <= args.end]
    print(f"  Sheet: {len(payloads)} dòng hợp lệ, {len(sheet_rows)} trong kỳ "
          f"{args.start} → {args.end}")

    print("Đọc so_doanh_thu (toàn bộ, phân trang)…")
    db_all = fetch_ledger_rows(sb)
    db_rows = [r for r in db_all if args.start <= _primary_day(r) <= args.end]
    print(f"  Sổ: {len(db_all)} dòng, {len(db_rows)} trong kỳ")

    print("Đối chiếu…")
    result = reconcile(sheet_rows, db_rows)
    lines, summary_json = build_summary(result, sheet_rows, db_rows, args.start, args.end)

    tag = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = BACKEND_DIR / "backups" / f"audit_so_vs_allfile_{tag}"
    write_outputs(out_dir, result, lines, summary_json)

    print()
    print("\n".join(lines))
    print(f"\n📄 Báo cáo + CSV: {out_dir}")


if __name__ == "__main__":
    main()
