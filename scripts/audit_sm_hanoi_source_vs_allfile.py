#!/usr/bin/env python3
"""Đối chiếu SM Hanoi: DingTalk gốc vs All File Thu Hiền (Google Sheet)."""

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


def _load_dotenv() -> None:
    env_path = ROOT / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path, override=False)
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
    if isinstance(value, float) and value != value:  # NaN
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
    if s.endswith(".0") and s[:-2].replace(".", "").isdigit():
        return s[:-2]
    return s


def _norm_phone(v: Any) -> str:
    if v is None:
        return ""
    s = str(v).strip().replace(" ", "")
    digits = "".join(c for c in s if c.isdigit())
    if digits.startswith("84") and len(digits) >= 11:
        return f"84-{digits[2:11]}"
    if digits.startswith("0") and len(digits) == 10:
        return f"84-{digits[1:]}"
    return s


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


def _row_from_dict(
    d: dict[str, Any],
    *,
    sheet_row: int,
    bank_key: str,
    pay_key: str,
    vnd_key: str,
    gmv_key: str,
    uid_key: str,
    sdt_key: str,
    sale_key: str,
) -> RowRec | None:
    vnd_f = _parse_number(d.get(vnd_key))
    if vnd_f is None or vnd_f <= 0:
        return None
    vnd = int(vnd_f)
    bank = _parse_date(d.get(bank_key))
    pay = _parse_date(d.get(pay_key)) or bank
    gmv_raw = _parse_number(d.get(gmv_key))
    gmv = _gmv_round(gmv_raw)
    uid = _norm_uid(d.get(uid_key))
    sdt = _norm_phone(d.get(sdt_key))
    sale = str(d.get(sale_key) or "").strip().lower()
    pay_s = pay.isoformat() if pay else ""
    bank_s = bank.isoformat() if bank else ""
    fp = "|".join([uid, pay_s, str(vnd), sale, sdt])
    return RowRec(
        sheet_row=sheet_row,
        bank_day=bank_s,
        pay_time=pay_s,
        vnd=vnd,
        gmv=gmv,
        gmv_raw=gmv_raw,
        uid=uid,
        sdt=sdt,
        sale=sale,
        fingerprint=fp,
    )


def load_source_pandas(path: Path, anchor: int) -> list[RowRec]:
    import pandas as pd

    df = pd.read_excel(path, sheet_name="INCOME", header=0, nrows=anchor - 1)
    sale_col = "Sales" if "Sales" in df.columns else None
    if not sale_col:
        for c in df.columns:
            if str(c).strip().lower() == "sales":
                sale_col = c
                break
    if not sale_col:
        sale_col = df.columns[23] if len(df.columns) > 23 else df.columns[-1]

    out: list[RowRec] = []
    for i, row in df.iterrows():
        sheet_row = int(i) + 2
        rec = _row_from_dict(
            row.to_dict(),
            sheet_row=sheet_row,
            bank_key="bank day",
            pay_key="Pay Time",
            vnd_key="Real Pay(VND)",
            gmv_key="GMV (RMB)",
            uid_key="UID",
            sdt_key="Phone",
            sale_key=sale_col,
        )
        if rec:
            out.append(rec)
    return out


def load_allfile_gsheet(anchor: int, cred_path: str | None) -> list[RowRec]:
    from gsheet_ledger_import import DEFAULT_SPREADSHEET_ID, fetch_gsheet_tab_values

    raw = fetch_gsheet_tab_values(
        spreadsheet_id=DEFAULT_SPREADSHEET_ID,
        tab="SM Hanoi",
        credentials_path=cred_path,
    )
    if not raw:
        return []
    header = [str(h).strip() for h in raw[0]]

    def col_idx(name: str, fallback: int) -> int:
        for i, h in enumerate(header):
            if h.lower() == name.lower():
                return i
        return fallback

    idx = {
        "bank": col_idx("bank day", 0),
        "pay": col_idx("Pay Time", 8),
        "vnd": col_idx("Real Pay(VND)", 10),
        "gmv": col_idx("GMV (RMB)", 11),
        "uid": col_idx("UID", 5),
        "sdt": col_idx("Phone", 4),
        "sale": col_idx("Sales", 21),
    }

    out: list[RowRec] = []
    for sheet_row, cells in enumerate(raw[1:], start=2):
        if sheet_row > anchor:
            break
        row = list(cells) + [""] * (40 - len(cells))

        def get(k: str) -> Any:
            return row[idx[k]] if idx[k] < len(row) else None

        rec = _row_from_dict(
            {
                "bank day": get("bank"),
                "Pay Time": get("pay"),
                "Real Pay(VND)": get("vnd"),
                "GMV (RMB)": get("gmv"),
                "UID": get("uid"),
                "Phone": get("sdt"),
                "Sales": get("sale"),
            },
            sheet_row=sheet_row,
            bank_key="bank day",
            pay_key="Pay Time",
            vnd_key="Real Pay(VND)",
            gmv_key="GMV (RMB)",
            uid_key="UID",
            sdt_key="Phone",
            sale_key="Sales",
        )
        if rec:
            out.append(rec)
    return out


def method1_row_index(src: list[RowRec], af: list[RowRec]) -> dict[str, Any]:
    by_row_s = {r.sheet_row: r for r in src}
    by_row_a = {r.sheet_row: r for r in af}
    rows = sorted(set(by_row_s) & set(by_row_a))
    gmv_mismatch = []
    date_mismatch = []
    vnd_mismatch = []
    for r in rows:
        s, a = by_row_s[r], by_row_a[r]
        if s.vnd != a.vnd:
            vnd_mismatch.append({"row": r, "src_vnd": s.vnd, "af_vnd": a.vnd})
        if s.pay_time != a.pay_time or s.bank_day != a.bank_day:
            date_mismatch.append(
                {
                    "row": r,
                    "src_pay": s.pay_time,
                    "af_pay": a.pay_time,
                    "src_bank": s.bank_day,
                    "af_bank": a.bank_day,
                }
            )
        if s.gmv != a.gmv:
            af_int = int(a.gmv_raw) if a.gmv_raw is not None else None
            src_int = int(s.gmv) if s.gmv is not None else None
            gmv_mismatch.append(
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
                    "af_trunc_matches_src_rounded": af_int == src_int if af_int is not None and src_int is not None else False,
                }
            )
    return {
        "matched_rows": len(rows),
        "gmv_mismatch_count": len(gmv_mismatch),
        "date_mismatch_count": len(date_mismatch),
        "vnd_mismatch_count": len(vnd_mismatch),
        "missing_in_source_rows": len(set(by_row_a) - set(by_row_s)),
        "missing_in_allfile_rows": len(set(by_row_s) - set(by_row_a)),
        "sum_src_gmv": round(sum(r.gmv or 0 for r in src), 2),
        "sum_af_gmv": round(sum(r.gmv or 0 for r in af), 2),
        "sum_delta_af_minus_src": round(
            sum(r.gmv or 0 for r in af) - sum(r.gmv or 0 for r in src), 2
        ),
        "gmv_mismatch_all": gmv_mismatch,
        "date_mismatch_sample": date_mismatch[:25],
        "vnd_mismatch_sample": vnd_mismatch[:15],
    }


def method2_fingerprint(src: list[RowRec], af: list[RowRec]) -> dict[str, Any]:
    fps = {r.fingerprint: r for r in src}
    fpa = {r.fingerprint: r for r in af}
    only_src = set(fps) - set(fpa)
    only_af = set(fpa) - set(fps)
    gmv_diff = []
    row_shift = []
    for fp in set(fps) & set(fpa):
        s, a = fps[fp], fpa[fp]
        if s.gmv != a.gmv:
            gmv_diff.append(
                {
                    "fp": fp,
                    "src_row": s.sheet_row,
                    "af_row": a.sheet_row,
                    "src_gmv": s.gmv,
                    "af_gmv": a.gmv,
                    "src_raw": s.gmv_raw,
                    "af_raw": a.gmv_raw,
                }
            )
        if s.sheet_row != a.sheet_row:
            row_shift.append({"fp": fp, "src_row": s.sheet_row, "af_row": a.sheet_row})
    return {
        "only_source": len(only_src),
        "only_allfile": len(only_af),
        "gmv_diff_count": len(gmv_diff),
        "row_number_shift_count": len(row_shift),
        "gmv_diff_sample": gmv_diff[:40],
        "only_source_sample": list(only_src)[:3],
        "only_allfile_sample": list(only_af)[:3],
    }


def method3_monthly(src: list[RowRec], af: list[RowRec]) -> dict[str, Any]:
    def agg(rows: list[RowRec]) -> dict[str, dict[str, float]]:
        m: dict[str, dict[str, float]] = defaultdict(lambda: {"gmv": 0.0, "n": 0})
        for r in rows:
            mo = r.pay_time[:7] if r.pay_time else "?"
            m[mo]["gmv"] += r.gmv or 0
            m[mo]["n"] += 1
        return {k: {"gmv": round(v["gmv"], 2), "n": int(v["n"])} for k, v in sorted(m.items())}

    ms, ma = agg(src), agg(af)
    deltas = []
    for mo in sorted(set(ms) | set(ma)):
        s, a = ms.get(mo, {"gmv": 0, "n": 0}), ma.get(mo, {"gmv": 0, "n": 0})
        deltas.append(
            {
                "month": mo,
                "src_gmv": s["gmv"],
                "af_gmv": a["gmv"],
                "delta": round(a["gmv"] - s["gmv"], 2),
                "src_n": s["n"],
                "af_n": a["n"],
            }
        )
    return {"months": deltas, "total_delta": round(sum(x["delta"] for x in deltas), 2)}


def classify_gmv_errors(m1: dict[str, Any]) -> dict[str, int]:
    c = Counter()
    for item in m1.get("gmv_mismatch_all", []):
        if item.get("af_trunc_matches_src_rounded"):
            c["allfile_lost_decimals_int_match"] += 1
        elif item.get("af_gmv") and item.get("src_gmv"):
            delta = abs(item["delta"] or 0)
            if delta >= 1:
                c["large_delta_ge_1_rmb"] += 1
            else:
                c["small_rounding_diff"] += 1
        else:
            c["missing_gmv_one_side"] += 1
    return dict(c)


def main() -> int:
    _load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-xlsx", default=r"E:\PalFish\DA\SM HANOI daily report.xlsx")
    ap.add_argument("--anchor", type=int, default=13943)
    ap.add_argument("--out-dir", default=r"E:\PalFish\DA\Report")
    ap.add_argument("--credentials", default=os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", ""))
    args = ap.parse_args()

    src_path = Path(args.source_xlsx)
    if not src_path.exists():
        print("Missing:", src_path, file=sys.stderr)
        return 1

    print("Load source (pandas)...", flush=True)
    src = load_source_pandas(src_path, args.anchor)
    print("  rows:", len(src), flush=True)

    print("Load All File SM Hanoi (API)...", flush=True)
    af = load_allfile_gsheet(args.anchor, args.credentials or None)
    print("  rows:", len(af), flush=True)

    m1 = method1_row_index(src, af)
    m2 = method2_fingerprint(src, af)
    m3 = method3_monthly(src, af)
    patterns = classify_gmv_errors(m1)

    report = {
        "anchor_row": args.anchor,
        "source": str(src_path),
        "method1": {k: v for k, v in m1.items() if k != "gmv_mismatch_all"},
        "gmv_error_patterns": patterns,
        "method2": m2,
        "method3": m3,
        "top_gmv_mismatches": sorted(
            m1.get("gmv_mismatch_all", []),
            key=lambda x: abs(x.get("delta") or 0),
            reverse=True,
        )[:50],
    }

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    jpath = out_dir / "audit_sm_hanoi_source_vs_allfile.json"
    tpath = out_dir / "audit_sm_hanoi_source_vs_allfile.txt"
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    lines = [
        "=== AUDIT SM HANOI (row 2..%d) ===" % args.anchor,
        "",
        "Method 1 - same Excel row number:",
        "  matched: %s" % m1["matched_rows"],
        "  SUM GMV source (DingTalk col N): %s" % m1["sum_src_gmv"],
        "  SUM GMV All File (col L): %s" % m1["sum_af_gmv"],
        "  DELTA (AF - source): %s RMB" % m1["sum_delta_af_minus_src"],
        "  GMV row mismatches: %s" % m1["gmv_mismatch_count"],
        "  Date mismatches: %s" % m1["date_mismatch_count"],
        "  VND mismatches: %s" % m1["vnd_mismatch_count"],
        "  GMV error patterns: %s" % patterns,
        "",
        "Method 2 - fingerprint (uid|pay|vnd|sale|phone):",
        "  only source: %s | only allfile: %s" % (m2["only_source"], m2["only_allfile"]),
        "  gmv diff on matched fp: %s" % m2["gmv_diff_count"],
        "  row index shifted: %s" % m2["row_number_shift_count"],
        "",
        "Method 3 - monthly SUM GMV:",
        "  total delta: %s" % m3["total_delta"],
    ]
    for d in m3["months"][-8:]:
        lines.append(
            "  %s: src=%s af=%s delta=%s" % (d["month"], d["src_gmv"], d["af_gmv"], d["delta"])
        )

    text = "\n".join(lines)
    tpath.write_text(text, encoding="utf-8")
    print(text)
    print("\nSaved:", jpath)
    print("Saved:", tpath)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
