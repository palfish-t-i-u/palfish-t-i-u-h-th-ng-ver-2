"""M0-T1/T2 — Probe Metabase cho BC02 (CHỈ ĐỌC, không ghi gì).

Mục tiêu: biết Q12749 (leads-status) / Q14385 (referral) / Q14393 (remaining-lesson)
trả về cột gì, dải ngày nào, phân bố team/channel ra sao → đối chiếu với số tay
chị Hiền ("Thống kê TVTS": Mời học thử / L4 đã học thử) để quyết Trial có dùng
Metabase được không (M0-T2).

CHẠY (sau khi bật VPN ipalfish HK):
    # KHÔNG hardcode mật khẩu. Đặt biến môi trường rồi chạy:
    #   PowerShell:  $env:METABASE_USER="..."; $env:METABASE_PASS="..."; python scripts/probe_metabase_bc02.py
    #   bash:        METABASE_USER=... METABASE_PASS=... python scripts/probe_metabase_bc02.py
    #
    # Lọc theo ngày (tuỳ chọn) để so đúng 1 ngày với số tay chị Hiền:
    #   python scripts/probe_metabase_bc02.py --day 2026-10-06

An toàn: script này chỉ GET, không POST data. In ra cột + 3 dòng mẫu + dải ngày +
phân bố team/channel. KHÔNG in mật khẩu. Repo code PUBLIC → đừng dán nguyên output
chứa data khách vào file commit; chỉ dán phần cột + thống kê khi báo lại.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter

import requests

BASE = "https://metabase.ibanyu.com/api"
QUESTIONS = [
    (12749, "leads-status-update"),
    (14385, "referral-details-vn"),
    (14393, "remaining-lesson-vn"),
]


def _get_creds() -> tuple[str, str]:
    user = os.environ.get("METABASE_USER")
    pwd = os.environ.get("METABASE_PASS")
    if not user or not pwd:
        sys.exit(
            "Thiếu METABASE_USER / METABASE_PASS trong biến môi trường.\n"
            "KHÔNG hardcode. Đặt env rồi chạy lại (xem docstring đầu file)."
        )
    return user, pwd


def _login(user: str, pwd: str) -> dict[str, str]:
    try:
        r = requests.post(
            f"{BASE}/session",
            json={"username": user, "password": pwd},
            timeout=30,
        )
    except requests.RequestException as e:
        sys.exit(f"Không kết nối được Metabase (đã bật VPN chưa?): {e}")
    if r.status_code != 200:
        sys.exit(f"Login hỏng HTTP {r.status_code}: {r.text[:300]}")
    return {"X-Metabase-Session": r.json()["id"]}


def _looks_like_date_col(name: str) -> bool:
    return any(t in name.lower() for t in ("date", "time", "day", "ngay", "crm_time"))


def probe(headers: dict[str, str], day: str | None) -> None:
    for qid, name in QUESTIONS:
        print(f"\n===== Q{qid} {name} =====")
        try:
            r = requests.get(f"{BASE}/card/{qid}/query/json", headers=headers, timeout=120)
        except requests.RequestException as e:
            print(f"  LỖI gọi: {e}")
            continue
        if r.status_code != 200:
            print(f"  HTTP {r.status_code}: {r.text[:300]}")
            continue
        rows = r.json()
        print(f"  Tổng số dòng: {len(rows)}")
        if not rows:
            continue
        cols = list(rows[0].keys())
        print(f"  CỘT ({len(cols)}): {cols}")

        # Dải ngày từng cột giống-ngày → biết question có sẵn filter ngày không
        for k in cols:
            if _looks_like_date_col(k):
                vals = [str(x.get(k)) for x in rows if x.get(k) is not None]
                if vals:
                    print(f"  cột ngày '{k}': min={min(vals)} max={max(vals)} (mẫu: {vals[:3]})")

        # Phân bố team/channel → biết có tách HN/HCM sẵn không
        for k in cols:
            if "team" in k.lower() or "channel" in k.lower():
                print(f"  phân bố '{k}': {Counter(str(x.get(k)) for x in rows).most_common(10)}")

        # Nếu lọc 1 ngày: đếm theo team để so số tay chị Hiền
        if day:
            date_cols = [k for k in cols if _looks_like_date_col(k)]
            matched = [
                x for x in rows
                if any(day in str(x.get(k) or "") for k in date_cols)
            ]
            print(f"  --- Lọc ngày {day}: {len(matched)} dòng ---")
            team_cols = [k for k in cols if "team" in k.lower()]
            for tk in team_cols:
                print(f"    theo '{tk}': {Counter(str(x.get(tk)) for x in matched).most_common()}")

        print("  3 DÒNG MẪU:")
        for x in rows[:3]:
            print("   ", json.dumps(x, ensure_ascii=False)[:400])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", help="Lọc 1 ngày YYYY-MM-DD để so số tay chị Hiền", default=None)
    args = ap.parse_args()
    user, pwd = _get_creds()
    headers = _login(user, pwd)
    probe(headers, args.day)
    print("\nXong. (Chỉ đọc — không ghi gì lên Metabase.)")


if __name__ == "__main__":
    main()
