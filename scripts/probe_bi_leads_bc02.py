"""BC02 Nguồn 1 (BI Leads) — BƯỚC 1 (v2): soi MỌI lượt gọi Metabase + bắt mọi gói JSON.

Dashboard BI 1386 = Metabase embed. v1 đoán mẫu URL card sai (14 lượt gọi metabase
nhưng 0 khớp). v2 KHÔNG đoán: log mọi URL metabase (ẩn JWT) + lưu MỌI response JSON
từ metabase → để thấy đúng endpoint nào chứa bảng leads.

CẦN: VPN · py -m pip install playwright + py -m playwright install chromium · $env:CRM_COOKIE=...
CHẠY: py scripts/probe_bi_leads_bc02.py   (--headless để chạy ngầm)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile

DASH_URL = "https://sea.pri.ibanyu.com/picture-bi/picinter1v1/picinter-leadsapply?dashboard=1386"
MAX_WAIT = 50
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_\-.]+")


def parse_cookie(raw: str) -> list[dict]:
    out = []
    for part in raw.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, val = part.split("=", 1)
        out.append({"name": name.strip(), "value": val.strip(),
                    "domain": ".ibanyu.com", "path": "/"})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--headless", action="store_true")
    args = ap.parse_args()

    cookie = os.environ.get("CRM_COOKIE", "").strip()
    if not cookie:
        sys.exit("Thiếu CRM_COOKIE.")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit("Chưa cài Playwright: py -m pip install playwright ; py -m playwright install chromium")

    outdir = os.path.join(tempfile.gettempdir(), "bi_leads_cards")
    os.makedirs(outdir, exist_ok=True)
    mb_log: list[str] = []      # mọi URL metabase (ẩn JWT) + status + content-type
    json_saved: list[str] = []  # dòng mô tả mỗi gói JSON đã lưu
    leads_found = {"flag": False}
    seq = {"n": 0}

    def on_response(resp):
        url = resp.url
        if "metabase.ibanyu.com" not in url:
            return
        try:
            ct = (resp.headers or {}).get("content-type", "")
        except Exception:
            ct = ""
        clean = JWT_RE.sub("JWT", url)
        suffix = clean.split("metabase.ibanyu.com", 1)[-1]
        mb_log.append(f"[{resp.status} {ct.split(';')[0] or '?'}] {suffix[:150]}")

        if "json" in ct.lower():
            try:
                body = resp.text()
            except Exception:
                return
            seq["n"] += 1
            fname = f"mb_{seq['n']:02d}.json"
            try:
                with open(os.path.join(outdir, fname), "w", encoding="utf-8") as f:
                    f.write(body)
            except Exception:
                pass
            cols_hint = ""
            try:
                data = json.loads(body)
                # Metabase embed card thường trả {"data":{"cols":[{"name":..}],"rows":[[...]]}}
                cols = None
                if isinstance(data, dict):
                    d = data.get("data") or {}
                    if isinstance(d.get("cols"), list):
                        cols = [c.get("name") for c in d["cols"] if isinstance(c, dict)]
                        nrows = len(d.get("rows") or [])
                        cols_hint = f" | {nrows} dòng | cột: " + ", ".join([str(c) for c in cols[:16]])
                elif isinstance(data, list) and data and isinstance(data[0], dict):
                    cols = list(data[0].keys())
                    cols_hint = f" | {len(data)} dòng | cột: " + ", ".join(cols[:16])
                if cols and any((c or "") in
                                ("channel_name", "actural_leads", "actual_leads", "team_name", "channel")
                                for c in cols):
                    leads_found["flag"] = True
                    cols_hint += "   <<< CÓ VẺ LÀ BẢNG LEADS"
            except Exception:
                cols_hint = f" | (không parse JSON, {len(body)} bytes)"
            json_saved.append(f"  {fname} [{len(body)} bytes]{cols_hint}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        ctx = browser.new_context()
        ctx.add_cookies(parse_cookie(cookie))
        page = ctx.new_page()
        page.on("response", on_response)
        print(f"Mở {DASH_URL} ...")
        try:
            page.goto(DASH_URL, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            print(f"goto lỗi: {e}")
        # Chờ ĐỦ thời gian — KHÔNG dừng sớm (bảng chi tiết tải muộn hơn các card tổng)
        waited = 0
        while waited < MAX_WAIT:
            page.wait_for_timeout(2500)
            waited += 2.5
        browser.close()

    print("\n===== MỌI LƯỢT GỌI METABASE =====")
    for line in mb_log:
        print(" ", line)
    print("\n===== CÁC GÓI JSON ĐÃ LƯU =====")
    if json_saved:
        for line in json_saved:
            print(line)
    else:
        print("  (không có gói JSON nào từ metabase)")
    print(f"\nFile lưu ở: {outdir}")
    print("Gửi em TOÀN BỘ 2 danh sách trên (nhất là dòng có 'CÓ VẺ LÀ BẢNG LEADS').")


if __name__ == "__main__":
    main()
