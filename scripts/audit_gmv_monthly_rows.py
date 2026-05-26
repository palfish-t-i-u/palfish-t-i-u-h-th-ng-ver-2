#!/usr/bin/env python3
"""Inspect GMV tab monthly summary rows vs daily rows — verify column C totals."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import DEFAULT_SPREADSHEET_ID, _parse_sheet_number, fetch_gsheet_tab_values


MONTH_ONLY = re.compile(r"^(\d{4})[/-](\d{1,2})$")
DAY_ROW = re.compile(r"^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$")


def num(row: list, idx: int) -> float:
    return float(_parse_sheet_number(row[idx] if len(row) > idx else None) or 0)


def main() -> int:
    rows = fetch_gsheet_tab_values(spreadsheet_id=DEFAULT_SPREADSHEET_ID, tab="GMV")
    print(f"GMV tab: {len(rows)} rows\n")

    # Print header row(s)
    for i in range(min(5, len(rows))):
        r = rows[i]
        a = str(r[0]).strip() if r else ""
        print(f"Row {i+1} A={a!r}  B={r[1] if len(r)>1 else ''!r}  C={r[2] if len(r)>2 else ''!r}")

    # Find monthly summary rows for 2026/1..5 in block A (first In-house section)
    monthly: list[tuple[int, str, float, float]] = []
    for i, row in enumerate(rows):
        if not row:
            continue
        a = str(row[0]).strip()
        m = MONTH_ONLY.match(a)
        if not m or m.group(1) != "2026":
            continue
        mo = int(m.group(2))
        if mo not in (1, 2, 3, 4, 5):
            continue
        monthly.append((i + 1, a, num(row, 1), num(row, 2)))

    print("\n=== Monthly summary rows (col A = YYYY/M) — block 1 ===")
    sum_b = 0
    sum_c = 0.0
    for rn, a, b, c in sorted(monthly, key=lambda x: x[1]):
        print(f"  row {rn:4d}  {a:8s}  B={int(b):4d}  C={c:,.0f}")
        sum_b += int(b)
        sum_c += c
    print(f"  SUM monthly rows: B={sum_b}, C={sum_c:,.0f}")

    # Verify Apr: monthly row vs sum of daily rows below
    print("\n=== April 2026: monthly row vs sum(daily col C) ===")
    apr_month_row = None
    apr_daily: list[tuple[int, str, float, float]] = []
    for i, row in enumerate(rows):
        if not row:
            continue
        a = str(row[0]).strip()
        if a in ("2026/4", "2026/04"):
            apr_month_row = (i + 1, num(row, 1), num(row, 2))
        dm = DAY_ROW.match(a)
        if dm and dm.group(1) == "2026" and int(dm.group(2)) == 4:
            apr_daily.append((i + 1, a, num(row, 1), num(row, 2)))

    if apr_month_row:
        rn, mb, mc = apr_month_row
        db = sum(int(x[2]) for x in apr_daily)
        dc = sum(x[3] for x in apr_daily)
        print(f"  Monthly row {rn}: B={int(mb)}, C={mc:,.0f}")
        print(f"  Daily rows ({len(apr_daily)}): B={db}, C={dc:,.0f}")
        print(f"  Match daily sum? B {int(mb)==db}, C {abs(mc-dc)<1}")

    # Second In-house block — col U (index 20)?
    print("\n=== Scan for duplicate monthly rows (other columns) ===")
    for i, row in enumerate(rows):
        if not row:
            continue
        for col_idx in (0, 20, 40):
            if len(row) <= col_idx:
                continue
            a = str(row[col_idx]).strip()
            m = MONTH_ONLY.match(a)
            if m and m.group(1) == "2026" and int(m.group(2)) in (1, 2, 3, 4, 5):
                b_col = col_idx + 1
                c_col = col_idx + 2
                print(
                    f"  row {i+1} col {chr(65+col_idx)}={a!r} "
                    f"B={num(row, b_col):,.0f} C={num(row, c_col):,.0f}"
                )

    # What partial sums give ~4671020?
    target = 4_671_020
    print(f"\n=== Subsets of monthly C summing near {target:,} ===")
    items = [(a, c) for _, a, _, c in monthly]
    from itertools import combinations

    for r in range(1, len(items) + 1):
        for combo in combinations(items, r):
            s = sum(c for _, c in combo)
            if abs(s - target) < 5000:
                months = [a for a, _ in combo]
                print(f"  {months} -> {s:,.0f}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
