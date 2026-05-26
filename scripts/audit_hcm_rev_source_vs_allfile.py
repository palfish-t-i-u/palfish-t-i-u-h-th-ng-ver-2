#!/usr/bin/env python3
"""Đối chiếu HCM REV: HCM Revenue statement (REVENUE) vs All File tab HCM REV."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# Cùng layout map_hcm_rev_row (All File + REVENUE tab)
COL = {
    "bank_day": 0,
    "pay_time": 8,
    "vnd": 9,
    "gmv": 10,
    "uid": 5,
    "sdt": 4,
    "ten": 3,
    "sale": 13,
}


def _load_dotenv() -> None:
    p = ROOT / "backend" / ".env"
    if p.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(p, override=False)
        except ImportError:
            pass


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    import re

    m = re.match(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})", s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            pass
    m2 = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m2:
        try:
            return date(int(m2.group(3)), int(m2.group(1)), int(m2.group(2)))
        except ValueError:
            pass
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def _parse_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, float) and value != value:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().replace(" ", "")
    if not s:
        return None
    if s.count(".") > 1:
        s = s.replace(".", "")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def _norm_uid(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v != v:
        return ""
    if isinstance(v, (int, float)):
        return str(int(v))
    s = str(v).strip()
    if s.endswith(".0"):
        return s[:-2]
    return s


def _norm_phone(v: Any) -> str:
    if v is None:
        return ""
    digits = "".join(c for c in str(v).strip() if c.isdigit())
    if digits.startswith("84") and len(digits) >= 11:
        return f"84-{digits[2:11]}"
    if digits.startswith("0") and len(digits) == 10:
        return f"84-{digits[1:]}"
    return str(v).strip()


def _gmv_round(v: float | None) -> float | None:
    if v is None:
        return None
    return float(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


@dataclass
class RowRec:
    sheet_row: int
    bank_day: str
    pay_time: str
    vnd: int
    gmv: float | None
    gmv_raw: float | None
    uid: str
    sdt: str
    sale: str
    fingerprint: str


def _extract_cells(cells: list[Any], sheet_row: int) -> RowRec | None:
    row = list(cells) + [""] * 20

    def g(k: str) -> Any:
        i = COL[k]
        return row[i] if i < len(row) else None

    vnd_f = _parse_number(g("vnd"))
    if vnd_f is None or vnd_f <= 0:
        return None
    vnd = int(vnd_f)
    bank = _parse_date(g("bank_day"))
    pay = _parse_date(g("pay_time")) or bank
    gmv_raw = _parse_number(g("gmv"))
    gmv = _gmv_round(gmv_raw)
    uid = _norm_uid(g("uid"))
    sdt = _norm_phone(g("sdt"))
    sale = str(g("sale") or "").strip().lower()
    pay_s = pay.isoformat() if pay else ""
    bank_s = bank.isoformat() if bank else ""
    fp = "|".join([uid, pay_s, str(vnd), sale, sdt])
    return RowRec(sheet_row, bank_s, pay_s, vnd, gmv, gmv_raw, uid, sdt, sale, fp)


def load_source_revenue(path: Path, max_row: int | None) -> tuple[list[RowRec], int]:
    import pandas as pd

    nrows = (max_row - 1) if max_row else None
    df = pd.read_excel(path, sheet_name="REVENUE", header=0, nrows=nrows)
    out: list[RowRec] = []
    for i, ser in df.iterrows():
        sheet_row = int(i) + 2
        if max_row and sheet_row > max_row:
            break
        cells = [ser.get(c) for c in df.columns]
        # remap by name to COL order
        d = ser.to_dict()
        row = [None] * 16
        name_map = {
            0: "bank day",
            8: "Pay Time",
            9: "Real Pay(VND)",
            10: "GMV (RMB)",
            5: "UID",
            4: "Phone",
            13: "Sales",
        }
        for idx, colname in name_map.items():
            for k, v in d.items():
                if str(k).strip().lower() == colname.lower() or (
                    colname == "Pay Time" and "pay" in str(k).lower()
                ):
                    row[idx] = v
                    break
            if row[idx] is None:
                for k, v in d.items():
                    if colname.split()[0].lower() in str(k).lower():
                        row[idx] = v
                        break
        rec = _extract_cells(row, sheet_row)
        if rec:
            out.append(rec)
    return out, int(df.shape[0]) + 1


def load_source_revenue_by_index(path: Path, max_row: int | None) -> list[RowRec]:
    """Đọc REVENUE — cột A..P khớp map_hcm_rev_row (pandas, tránh sparse read_only)."""
    import pandas as pd

    end = max_row or 5000
    df = pd.read_excel(path, sheet_name="REVENUE", header=0, nrows=max(0, end - 1))
    col = {
        "bank day": COL["bank_day"],
        "Pay Time": COL["pay_time"],
        "Real Pay(VND)": COL["vnd"],
        "GMV (RMB)": COL["gmv"],
        "UID": COL["uid"],
        "Phone": COL["sdt"],
        "Sales": COL["sale"],
    }
    rename = {}
    for c in df.columns:
        cl = str(c).strip().lower()
        for want, idx in col.items():
            if cl == want.lower() or (want == "Pay Time" and "pay time" in cl):
                rename[c] = idx
                break
    out: list[RowRec] = []
    for i in range(len(df)):
        sheet_row = i + 2
        if sheet_row > end:
            break
        cells: list[Any] = [None] * 16
        for c, idx in rename.items():
            cells[idx] = df.iloc[i][c]
        rec = _extract_cells(cells, sheet_row)
        if rec:
            out.append(rec)
    return out


def load_allfile_hcm(max_row: int | None, cred: str | None) -> list[RowRec]:
    from gsheet_ledger_import import DEFAULT_SPREADSHEET_ID, fetch_gsheet_tab_values

    raw = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="HCM REV")
    out: list[RowRec] = []
    for sheet_row, cells in enumerate(raw[1:], start=2):
        if max_row and sheet_row > max_row:
            break
        rec = _extract_cells(cells, sheet_row)
        if rec:
            out.append(rec)
    return out


def detect_anchor_row(src_by_row: dict[int, RowRec], af_by_row: dict[int, RowRec]) -> int:
    """Dòng cuối cùng (số lớn nhất) mà cùng số dòng sheet và fingerprint khớp."""
    common = sorted(set(src_by_row) & set(af_by_row), reverse=True)
    for r in common:
        if src_by_row[r].fingerprint == af_by_row[r].fingerprint:
            return r
    return common[0] if common else 0


def method1_rows(src: list[RowRec], af: list[RowRec], anchor: int) -> dict[str, Any]:
    by_s = {r.sheet_row: r for r in src if r.sheet_row <= anchor}
    by_a = {r.sheet_row: r for r in af if r.sheet_row <= anchor}
    rows = sorted(set(by_s) & set(by_a))
    gmv_mm, date_mm, vnd_mm = [], [], []
    for r in rows:
        s, a = by_s[r], by_a[r]
        if s.vnd != a.vnd:
            vnd_mm.append({"row": r, "src": s.vnd, "af": a.vnd})
        if s.pay_time != a.pay_time or s.bank_day != a.bank_day:
            date_mm.append({"row": r, "src_pay": s.pay_time, "af_pay": a.pay_time, "src_bank": s.bank_day, "af_bank": a.bank_day})
        if s.gmv != a.gmv:
            gmv_mm.append(
                {
                    "row": r,
                    "uid": s.uid,
                    "pay": s.pay_time,
                    "vnd": s.vnd,
                    "src_gmv": s.gmv,
                    "af_gmv": a.gmv,
                    "src_raw": s.gmv_raw,
                    "af_raw": a.gmv_raw,
                    "delta": round((a.gmv or 0) - (s.gmv or 0), 4),
                    "af_int_eq_src": int(a.gmv_raw or 0) == int(s.gmv or 0) if s.gmv and a.gmv_raw else False,
                }
            )
    src_in_range = [r for r in src if r.sheet_row <= anchor]
    af_in_range = [r for r in af if r.sheet_row <= anchor]
    return {
        "anchor": anchor,
        "matched_same_row_both_vnd": len(rows),
        "src_vnd_rows_in_range": len(src_in_range),
        "af_vnd_rows_in_range": len(af_in_range),
        "sum_src_gmv": round(sum(r.gmv or 0 for r in src_in_range), 2),
        "sum_af_gmv": round(sum(r.gmv or 0 for r in af_in_range), 2),
        "sum_delta_af_minus_src": round(
            sum(r.gmv or 0 for r in af_in_range) - sum(r.gmv or 0 for r in src_in_range), 2
        ),
        "gmv_mismatch_count": len(gmv_mm),
        "date_mismatch_count": len(date_mm),
        "vnd_mismatch_count": len(vnd_mm),
        "gmv_mismatch_all": gmv_mm,
        "date_sample": date_mm[:20],
        "vnd_sample": vnd_mm[:10],
    }


def method2_fp(src: list[RowRec], af: list[RowRec]) -> dict[str, Any]:
    fs = {r.fingerprint: r for r in src}
    fa = {r.fingerprint: r for r in af}
    only_s, only_a = set(fs) - set(fa), set(fa) - set(fs)
    gmv_diff = []
    for fp in set(fs) & set(fa):
        s, a = fs[fp], fa[fp]
        if s.gmv != a.gmv:
            gmv_diff.append(
                {
                    "fp": fp,
                    "src_row": s.sheet_row,
                    "af_row": a.sheet_row,
                    "src_gmv": s.gmv,
                    "af_gmv": a.gmv,
                    "delta": round((a.gmv or 0) - (s.gmv or 0), 4),
                }
            )
    return {
        "src_fp_count": len(fs),
        "af_fp_count": len(fa),
        "only_source": len(only_s),
        "only_allfile": len(only_a),
        "matched_fp": len(set(fs) & set(fa)),
        "gmv_diff_on_matched": len(gmv_diff),
        "sum_src_matched": round(sum(fs[fp].gmv or 0 for fp in set(fs) & set(fa)), 2),
        "sum_af_matched": round(sum(fa[fp].gmv or 0 for fp in set(fs) & set(fa)), 2),
        "only_source_sample": [{"fp": x, "row": fs[x].sheet_row} for x in list(only_s)[:5]],
        "only_allfile_sample": [{"fp": x, "row": fa[x].sheet_row} for x in list(only_a)[:5]],
        "gmv_diff_sample": gmv_diff[:30],
    }


def method3_monthly(src: list[RowRec], af: list[RowRec]) -> dict[str, Any]:
    def agg(rows: list[RowRec]) -> dict[str, float]:
        m: dict[str, float] = defaultdict(float)
        for r in rows:
            mo = r.pay_time[:7] if r.pay_time else "?"
            m[mo] += r.gmv or 0
        return {k: round(v, 2) for k, v in sorted(m.items())}

    ms, ma = agg(src), agg(af)
    deltas = [
        {"month": mo, "src": ms.get(mo, 0), "af": ma.get(mo, 0), "delta": round(ma.get(mo, 0) - ms.get(mo, 0), 2)}
        for mo in sorted(set(ms) | set(ma))
    ]
    return {"months": deltas, "total_delta": round(sum(d["delta"] for d in deltas), 2)}


def classify_gmv(m1: dict[str, Any]) -> dict[str, int]:
    c = Counter()
    for item in m1.get("gmv_mismatch_all", []):
        if item.get("af_int_eq_src"):
            c["allfile_int_trunc"] += 1
        elif abs(item.get("delta") or 0) >= 1:
            c["large_delta_ge_1"] += 1
        else:
            c["small_rounding"] += 1
    return dict(c)


def main() -> int:
    _load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-xlsx", default=r"E:\PalFish\DA\HCM Revenue statement.xlsx")
    ap.add_argument("--anchor", type=int, default=0, help="0 = auto-detect")
    ap.add_argument("--out-dir", default=r"E:\PalFish\DA\Report")
    ap.add_argument("--credentials", default=os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
    args = ap.parse_args()

    src_path = Path(args.source_xlsx)
    if not src_path.exists():
        print("Missing", src_path, file=sys.stderr)
        return 1

    print("Load All File HCM REV...", flush=True)
    af_all = load_allfile_hcm(None, args.credentials or None)
    af_max_row = max((r.sheet_row for r in af_all), default=2)
    print("  rows", len(af_all), "max_row", af_max_row, flush=True)

    anchor_guess = args.anchor or af_max_row
    print("Load source REVENUE up to row", anchor_guess, "...", flush=True)
    src_all = load_source_revenue_by_index(src_path, anchor_guess + 50)
    src_by_row = {r.sheet_row: r for r in src_all}
    af_by_row = {r.sheet_row: r for r in af_all}
    anchor = args.anchor or detect_anchor_row(src_by_row, af_by_row) or af_max_row
    print("  anchor row", anchor, "src vnd rows total", len(src_all), flush=True)

    src = [r for r in src_all if r.sheet_row <= anchor]
    af = [r for r in af_all if r.sheet_row <= anchor]

    m1 = method1_rows(src, af, anchor)
    m2 = method2_fp(src_all, af_all)  # full dataset fingerprint
    m2_anchor = method2_fp(src, af)
    m3 = method3_monthly(src_all, af_all)
    patterns = classify_gmv(m1)

    report = {
        "anchor_row": anchor,
        "source": str(src_path),
        "allfile_tab": "HCM REV",
        "method1_row_aligned_to_anchor": {k: v for k, v in m1.items() if k != "gmv_mismatch_all"},
        "gmv_patterns_row_aligned": patterns,
        "method2_full_fingerprint": m2,
        "method2_anchor_fingerprint": m2_anchor,
        "method3_monthly_full": m3,
        "top_gmv_mismatch": sorted(m1.get("gmv_mismatch_all", []), key=lambda x: abs(x.get("delta") or 0), reverse=True)[:40],
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    jpath = out_dir / "audit_hcm_rev_source_vs_allfile.json"
    tpath = out_dir / "audit_hcm_rev_source_vs_allfile.txt"
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    lines = [
        "=== AUDIT HCM REV ===",
        "Anchor row: %s (auto = last same-row matching fingerprint)" % anchor,
        "",
        "Method 1 - same sheet row (<= anchor), both have VND:",
        "  rows both sides: %s" % m1["matched_same_row_both_vnd"],
        "  src vnd rows in range: %s | af: %s" % (m1["src_vnd_rows_in_range"], m1["af_vnd_rows_in_range"]),
        "  SUM GMV source: %s | All File: %s | delta: %s" % (m1["sum_src_gmv"], m1["sum_af_gmv"], m1["sum_delta_af_minus_src"]),
        "  GMV mismatches: %s | patterns: %s" % (m1["gmv_mismatch_count"], patterns),
        "",
        "Method 2 - fingerprint (FULL tabs):",
        "  src: %s | af: %s | matched: %s" % (m2["src_fp_count"], m2["af_fp_count"], m2["matched_fp"]),
        "  only source: %s | only allfile: %s" % (m2["only_source"], m2["only_allfile"]),
        "  GMV diff on matched fp: %s" % m2["gmv_diff_on_matched"],
        "  SUM matched src: %s | af: %s" % (m2["sum_src_matched"], m2["sum_af_matched"]),
        "",
        "Method 3 - monthly SUM (full):",
        "  total delta (af-src): %s" % m3["total_delta"],
    ]
    for d in m3["months"]:
        lines.append("  %s: src=%s af=%s delta=%s" % (d["month"], d["src"], d["af"], d["delta"]))

    tpath.write_text("\n".join(lines), encoding="utf-8")
    print("\n".join(lines))
    print("\nSaved:", jpath)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
