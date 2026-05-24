#!/usr/bin/env python3
"""Replicate GMV tab COUNTIFS vs BC02 — SM Hanoi col AH + Pay Time col I."""

from __future__ import annotations

import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from dotenv import load_dotenv

load_dotenv(ROOT / "backend" / ".env")

from gsheet_ledger_import import (
    DEFAULT_SPREADSHEET_ID,
    TeamLookupCache,
    _cell,
    _parse_pay_time,
    _parse_date,
    _to_int_vnd,
    fetch_gsheet_tab_values,
    map_sm_hanoi_row,
)
from revenue_routes import team_to_canonical, _build_key_data_pivot, _fetch_so_doanh_thu


def col_letter(idx: int) -> str:
    """0-based column index → Excel letter."""
    n = idx + 1
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def main() -> int:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from supabase import create_client

    cred_path = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"].strip().strip('"').strip("'")
    creds = service_account.Credentials.from_service_account_file(
        cred_path, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"]
    )
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    sid = DEFAULT_SPREADSHEET_ID

    gmv_top = service.spreadsheets().values().get(
        spreadsheetId=sid, range="'GMV'!A1:B1"
    ).execute()
    b1 = (gmv_top.get("values") or [[""]])[0]
    print(f"GMV B1 (COUNTIFS team filter): {b1!r}")

    # Full SM Hanoi through column AH (index 33)
    raw = fetch_gsheet_tab_values(spreadsheet_id=sid, tab="SM Hanoi")
    if not raw:
        print("No SM Hanoi data")
        return 1

    header = raw[0]
    print(f"\nSM Hanoi columns: {len(header)}")
    ah_idx = 33  # AH
    for i in range(max(0, len(header) - 6), len(header)):
        print(f"  {col_letter(i)} (idx {i}): {header[i]!r}")

    if len(header) <= ah_idx:
        print(f"WARNING: only {len(header)} cols, AH (33) missing — fetch wider range")
        raw = service.spreadsheets().values().get(
            spreadsheetId=sid, range="'SM Hanoi'!A:AH"
        ).execute().get("values", [])
        header = raw[0]
        print(f"After refetch: {len(header)} cols, AH={header[ah_idx]!r}" if len(header) > ah_idx else "still missing AH")

    team_filter = (b1[1] if len(b1) > 1 else b1[0] if b1 else "").strip() or "In-house"
    print(f"\nCOUNTIFS criteria: SM Hanoi!AH = {team_filter!r}, Pay Time in month")

    def pay_month(row: list) -> str | None:
        bank = _parse_date(_cell(row, 0))
        pt = _parse_pay_time(_cell(row, 8), bank)
        if not pt:
            return None
        return f"{pt.year}/{pt.month}"

    def ah_val(row: list) -> str:
        return str(_cell(row, ah_idx) or "").strip()

    # Replicate COUNTIFS for 2026/4
    target_month = "2026/4"
    countifs_apr = 0
    ah_counter: Counter[str] = Counter()
    apr_by_ah: dict[str, list] = defaultdict(list)

    for i, row in enumerate(raw):
        if i == 0:
            continue
        vnd = _to_int_vnd(_cell(row, 10))
        if vnd <= 0:
            continue
        mk = pay_month(row)
        if mk != target_month:
            continue
        ah = ah_val(row)
        ah_counter[ah] += 1
        if ah == team_filter:
            countifs_apr += 1
            apr_by_ah[ah].append(row)

    print(f"\nSM Hanoi Apr 2026 (Real Pay>0) by col AH:")
    for k, v in ah_counter.most_common():
        print(f"  {k!r}: {v}")

    print(f"\nCOUNTIFS(AH={team_filter!r}, month={target_month}): {countifs_apr} orders")
    print(f"GMV tab B37 expected: 550")

    # Compare with app team assignment
    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    team_cache = TeamLookupCache(sb)

    app_inhouse1 = 0
    app_by_team: Counter[str] = Counter()
    mismatch_rows = []

    for i, row in enumerate(raw):
        if i == 0:
            continue
        vnd = _to_int_vnd(_cell(row, 10))
        if vnd <= 0:
            continue
        mk = pay_month(row)
        if mk != target_month:
            continue
        p = map_sm_hanoi_row(team_cache, row, tab="SM Hanoi")
        if not p:
            continue
        t = p.get("team") or "?"
        app_by_team[t] += 1
        if t == "Inhouse 1":
            app_inhouse1 += 1
        ah = ah_val(row)
        if ah == team_filter and t != "Inhouse 1":
            mismatch_rows.append((ah, t, p))
        if ah != team_filter and t == "Inhouse 1":
            mismatch_rows.append((ah, t, p))

    print(f"\nApp team assignment Apr 2026:")
    for k, v in app_by_team.most_common():
        print(f"  {k}: {v}")
    print(f"App Inhouse 1 (BC02 filter): {app_inhouse1}")

    db_rows = _fetch_so_doanh_thu(
        sb,
        "pay_time, gmv_rmb, loai, loai_2, team, team_pivot_label",
        from_date="2026-04-01",
        to_date="2026-04-30",
    )
    pivot = _build_key_data_pivot(db_rows, team_filter="Inhouse 1")
    print(f"BC02 Inhouse 1: {pivot['grandTotal']['totalOrders']} orders")

    print(f"\nRows where AH vs app team disagree (sample {min(15, len(mismatch_rows))}):")
    for ah, t, p in mismatch_rows[:15]:
        print(
            f"  AH={ah!r} app_team={t} pay={(p.get('pay_time') or '')[:10]} "
            f"gmv={p.get('gmv_rmb')} {p.get('ten_khach')} sale={p.get('sale_crm_name')}"
        )
    print(f"Total AH vs app team mismatches: {len(mismatch_rows)}")

    # Rows in COUNTIFS but not Inhouse 1 in app
    only_countifs = countifs_apr - app_inhouse1
    print(f"\nCOUNTIFS count - App Inhouse1 = {countifs_apr - app_inhouse1}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
