"""BC02 Nguồn 3 (Trial) — pull "Mời học thử" + "L4 đã học thử" từ PalFish Class CRM.

Tái tạo đúng luồng nút "Xuất file Excel" trên trang Thống kê TVTS (đã bắt network 14/10):
  1. POST .../report/record/download  → trả về URL file CSV trên Aliyun OSS
  2. GET <url csv>                     → đọc CSV, lấy 邀约数 (Mời học thử) + 完课数 (L4)

AUTH = session cookie của phiên đăng nhập (tài khoản anh Hiếu — tk có quyền xem team).
KHÔNG hardcode cookie. Đặt biến môi trường CRM_COOKIE rồi chạy:
  PowerShell:  $env:CRM_COOKIE="<dán cookie>"; py scripts/pull_trial_bc02.py --day 2026-10-13
  (lấy cookie thế nào: xem HƯỚNG DẪN cuối file)

Cookie là CHÌA KHÓA ĐĂNG NHẬP — đừng commit, đừng dán lên chat. Cất trong env/secret.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
from datetime import date, timedelta

import requests

CRM_BASE = "https://sea.pri.ibanyu.com"
DOWNLOAD_PATH = "/opapi/crmi18n/crmopapii18n/report/record/download"

# department_id của từng vùng (bắt từ body request lúc tải).
#   HN (越南河内团队) = 2844208  — ĐÃ verify 14/10 (ra 邀约数 117 / 完课数 73).
#   HCM (越南胡志明团队) = ???    — CẦN BẮT 1 lần: đổi team sang HCM, bấm tải, xem department_id.
REGIONS: dict[str, int | None] = {
    "HN": 2844208,   # 越南河内团队 — verify 14/10: 邀约数 117 / 完课数 73
    "HCM": 2210691,  # 越南胡志明团队 — bắt 14/10 (kỳ vọng 4 / 4)
}

# Cột trong CSV xuất ra (0-based, theo header thật 14/10):
COL_DEPT = 0      # 部门
COL_SALE = 1      # 销售 (dòng tổng = "汇总")
COL_INVITED = 9   # 邀约数  = Mời học thử
COL_L4 = 12       # 完课数  = L4 đã học thử


def _cookie() -> str:
    c = os.environ.get("CRM_COOKIE", "").strip()
    if not c:
        sys.exit(
            "Thiếu CRM_COOKIE. Lấy cookie phiên đăng nhập anh Hiếu rồi đặt env.\n"
            "Xem HƯỚNG DẪN ở cuối file scripts/pull_trial_bc02.py."
        )
    return c


def _headers() -> dict[str, str]:
    return {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json;charset=UTF-8",
        "origin": CRM_BASE,
        "referer": f"{CRM_BASE}/kid-oversea-crm/dataMarket",
        "subject": "0",
        "cookie": _cookie(),
        "user-agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
        ),
    }


def pull_region(region: str, dept_id: int, day: str) -> None:
    body = {
        "time_start": day,
        "time_end": day,
        "department_id": dept_id,
        "show_type": 1,
        "customer_type": 0,
        "is_asc": False,
        "zone_name": "Asia/Saigon",
        "h_lc": "vi",
    }
    try:
        r = requests.post(
            f"{CRM_BASE}{DOWNLOAD_PATH}", headers=_headers(),
            data=json.dumps(body), timeout=60,
        )
    except requests.RequestException as e:
        print(f"[{region}] LỖI gọi download (đã bật VPN chưa?): {e}")
        return
    if r.status_code != 200:
        print(f"[{region}] download HTTP {r.status_code}: {r.text[:200]}")
        return
    try:
        url = r.json()["data"]["ent"]["items"]["url"]
    except Exception:
        print(f"[{region}] response lạ (cookie hết hạn?): {r.text[:200]}")
        return

    csv_resp = requests.get(url, timeout=60)
    text = csv_resp.content.decode("utf-8-sig", errors="replace")
    rows = list(csv.reader(io.StringIO(text)))
    data_rows = [row for row in rows[2:] if len(row) > COL_L4]  # bỏ 2 dòng header
    if not data_rows:
        print(f"[{region}] CSV RỖNG — tài khoản không có quyền xem team này? (dùng tk anh Hiếu)")
        return

    print(f"\n[{region}] dept_id={dept_id} ngày {day}:")
    for row in data_rows:
        if row[COL_SALE].strip() == "汇总":  # chỉ in các dòng TỔNG
            print(
                f"   {row[COL_DEPT]:<22} | Mời học thử (邀约数) = {row[COL_INVITED]:>4}"
                f" | L4 đã học thử (完课数) = {row[COL_L4]:>4}"
            )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default=str(date.today() - timedelta(days=1)),
                    help="ngày YYYY-MM-DD (mặc định = hôm qua)")
    args = ap.parse_args()
    for region, dept_id in REGIONS.items():
        if dept_id is None:
            print(f"[{region}] CHƯA có department_id — bỏ qua (xem REGIONS trong file).")
            continue
        pull_region(region, dept_id, args.day)
    print("\nXong. (Chỉ đọc — không ghi gì lên CRM.)")


if __name__ == "__main__":
    main()


# ============================ HƯỚNG DẪN LẤY COOKIE ============================
# (làm trên máy đang đăng nhập PalFish Class CRM bằng TÀI KHOẢN ANH HIẾU, có VPN)
#
# Cách 1 — nhanh nhất (từ 1 request đã có):
#   1. Mở trang Thống kê TVTS, F12 → tab Network.
#   2. Bấm nút "Xuất file Excel" (để sinh 1 request download).
#   3. Bấm vào dòng "download" → tab Headers → kéo xuống "Request Headers".
#   4. Tìm dòng bắt đầu bằng  cookie:  → copy TOÀN BỘ giá trị sau "cookie:".
#      (file .har xuất ra KHÔNG chứa cookie — Chrome tự cắt — nên phải copy ở đây.)
#
# Cách 2 — chắc chắn (Application tab):
#   F12 → Application → Storage → Cookies → https://sea.pri.ibanyu.com
#   → copy đủ các cặp Name=Value, nối bằng "; " thành 1 chuỗi.
#
# Đặt env rồi chạy (KHÔNG dán cookie lên chat):
#   $env:CRM_COOKIE="<chuỗi cookie vừa copy>"
#   py scripts/pull_trial_bc02.py --day 2026-10-13
#
# Nếu ra đúng HN: Mời học thử = 117 | L4 = 73  → cookie + luồng OK.
# Rồi bắt thêm department_id HCM (đổi team sang HCM, tải 1 lần, xem body request),
# điền vào REGIONS["HCM"] ở trên là pull được cả 2 vùng.
