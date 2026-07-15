#!/usr/bin/env python3
"""E2E smoke test — Module 1→2→3→4 (PayOS + bank-simulate + invoice export).

Uses real Supabase + PayOS via local or production API.
Requires backend/.env with SUPABASE_* and PAYOS_* (or production Render).

Usage:
  python scripts/e2e_m1_m4_flow.py
  python scripts/e2e_m1_m4_flow.py --base-url https://palfish-gmv-api.onrender.com
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")
load_dotenv(ROOT / "api_pipe" / ".env")

DEFAULT_BASE = os.getenv("E2E_API_BASE_URL", "http://127.0.0.1:8000")
OPS_EMAIL = os.getenv("E2E_OPS_EMAIL", "anhminhcv0512@gmail.com")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Minimal test payload — UID synthetic, marked in ghiChu for cleanup
TEST_UID = f"E2E-{datetime.now(timezone.utc).strftime('%y%m%d%H%M%S')}"
TEST_AMOUNT = 100_000  # 100k VND — small real PayOS link


def verify_db_field(order_id: str, field: str, expected) -> bool:
    """Direct Supabase read — bypasses API mapping gaps."""
    if not SUPABASE_URL or not SERVICE_KEY:
        return False
    headers = {"Authorization": f"Bearer {SERVICE_KEY}", "apikey": SERVICE_KEY}
    with httpx.Client(timeout=15) as client:
        r = client.get(
            f"{SUPABASE_URL}/rest/v1/don_hang?id=eq.{order_id}&select={field}",
            headers=headers,
        )
        if r.status_code != 200 or not r.json():
            return False
        return r.json()[0].get(field) == expected

    pass


def log(ok: bool, msg: str) -> None:
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {msg}")


def get_ops_jwt() -> str:
    """Obtain bearer JWT for ops user via Supabase admin magic-link exchange."""
    if not SUPABASE_URL or not SERVICE_KEY or "PASTE" in SERVICE_KEY:
        raise StepError("SUPABASE_URL / SERVICE_ROLE_KEY missing in backend/.env")

    headers = {
        "Authorization": f"Bearer {SERVICE_KEY}",
        "apikey": SERVICE_KEY,
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30) as client:
        gen = client.post(
            f"{SUPABASE_URL}/auth/v1/admin/generate_link",
            headers=headers,
            json={"type": "magiclink", "email": OPS_EMAIL},
        )
        if gen.status_code != 200:
            raise StepError(f"generate_link failed ({gen.status_code}): {gen.text[:200]}")
        data = gen.json()
        token_hash = data.get("hashed_token") or (data.get("properties") or {}).get("hashed_token")
        if not token_hash:
            raise StepError("No hashed_token in generate_link response")

        verify = client.post(
            f"{SUPABASE_URL}/auth/v1/verify",
            headers={**headers, "Authorization": f"Bearer {SERVICE_KEY}"},
            json={"type": "magiclink", "token_hash": token_hash},
        )
        if verify.status_code != 200:
            raise StepError(f"verify failed ({verify.status_code}): {verify.text[:200]}")
        session = verify.json()
        access = session.get("access_token")
        if not access:
            raise StepError("No access_token after verify")
        return access


def run(base_url: str) -> int:
    base = base_url.rstrip("/")
    failures: list[str] = []
    order_id: str | None = None
    ma_don: str | None = None
    info_code: str | None = None

    print(f"\n=== E2E M1->M4 @ {base} ===")
    print(f"  Test UID: {TEST_UID}  Amount: {TEST_AMOUNT:,} VND\n")

    with httpx.Client(timeout=60) as client:
        # --- Health ---
        try:
            hz = client.get(f"{base}/healthz")
            hz.raise_for_status()
            h = hz.json()
            log(h.get("status") == "ok", f"healthz status={h.get('status')}")
            log(h.get("supabase_configured"), f"supabase_configured={h.get('supabase_configured')}")
            log(h.get("payos_configured"), f"payos_configured={h.get('payos_configured')}")
            if not h.get("supabase_configured"):
                failures.append("Supabase not configured on API")
        except Exception as exc:
            failures.append(f"healthz: {exc}")
            log(False, str(exc))
            return 1

        # --- M1: Create order ---
        print("\n--- Module 1: Tao don + QR PayOS ---")
        create_body = {
            "uid": TEST_UID,
            "tenKhach": "E2E Test Khách",
            "diaChi": "123 Test St, Hà Nội",
            "sdt": "912345678",
            "maVung": "+84",
            "goiHoc": "Gói test E2E 1 tháng",
            "tongTien": TEST_AMOUNT,
            "nguon": "Inhouse",
            "ghiChu": "[E2E-AUTO-TEST — có thể xóa]",
            "createdBy": "e2e-script@local",
        }
        try:
            r = client.post(f"{base}/orders", json=create_body)
            if r.status_code != 201:
                raise StepError(f"POST /orders → {r.status_code}: {r.text[:300]}")
            order = r.json()
            order_id = order["id"]
            ma_don = order["maDonHang"]
            info_code = order["infoCode"]
            log(bool(ma_don), f"maDonHang={ma_don}")
            log(bool(info_code), f"infoCode={info_code}")
            log(order.get("tongTien") == TEST_AMOUNT, f"tongTien={order.get('tongTien')}")
        except Exception as exc:
            failures.append(f"M1 create: {exc}")
            log(False, str(exc))
            return 1

        # --- M1: PayOS link ---
        try:
            pr = client.post(
                f"{base}/payos/create-link",
                json={"amount": TEST_AMOUNT, "infoCode": info_code, "maDonHang": ma_don},
            )
            if pr.status_code != 200:
                raise StepError(f"POST /payos/create-link → {pr.status_code}: {pr.text[:300]}")
            payos = pr.json()
            has_qr = bool(payos.get("qrCode"))
            has_checkout = bool(payos.get("checkoutUrl"))
            has_transfer = bool(payos.get("transferContent") or payos.get("description"))
            log(has_qr, f"qrCode present (len={len(payos.get('qrCode') or '')})")
            log(has_checkout, f"checkoutUrl={payos.get('checkoutUrl', '')[:60]}...")
            log(has_transfer, f"transferContent={payos.get('transferContent') or payos.get('description')}")
            if not (has_qr and has_transfer):
                failures.append("M1 PayOS missing QR or transfer content")
        except Exception as exc:
            failures.append(f"M1 PayOS: {exc}")
            log(False, str(exc))

        # --- M2: Simulate payment (PayOS webhook equivalent) ---
        print("\n--- Module 2: Xac nhan tien ve (bank-simulate) ---")
        try:
            sim = client.post(
                f"{base}/webhook/bank-simulate",
                json={"infoCode": info_code, "amount": TEST_AMOUNT},
            )
            if sim.status_code != 200:
                raise StepError(f"bank-simulate → {sim.status_code}: {sim.text[:300]}")
            sim_data = sim.json()
            log(sim_data.get("matched"), "bank-simulate matched order")
            log(sim_data.get("amountOk"), "amount matches")
        except Exception as exc:
            failures.append(f"M2 simulate: {exc}")
            log(False, str(exc))

        # Verify order state in list
        try:
            time.sleep(0.5)
            lr = client.get(f"{base}/orders")
            lr.raise_for_status()
            orders = lr.json().get("orders") or []
            found = next((o for o in orders if o.get("id") == order_id), None)
            if not found:
                raise StepError("Order not found in GET /orders")
            log(found.get("tienVe") is True, f"tienVe={found.get('tienVe')}")
            db_tt = verify_db_field(order_id, "trang_thai_thu_tuc", "CHO_XAC_NHAN")
            log(db_tt, f"DB trang_thai_thu_tuc=CHO_XAC_NHAN (API field trangThaiThuTuc={found.get('trangThaiThuTuc')!r})")
            if not found.get("tienVe"):
                failures.append("M2 tien_ve not set after simulate")
            if not db_tt:
                failures.append("M2 trang_thai_thu_tuc not CHO_XAC_NHAN in DB")
        except Exception as exc:
            failures.append(f"M2 verify: {exc}")
            log(False, str(exc))

        # --- Ops JWT for M3/M4 ---
        print("\n--- Auth: ops JWT ---")
        try:
            jwt = get_ops_jwt()
            auth_hdr = {"Authorization": f"Bearer {jwt}"}
            log(True, f"JWT obtained for {OPS_EMAIL}")
        except Exception as exc:
            failures.append(f"Auth: {exc}")
            log(False, str(exc))
            auth_hdr = {}

        # --- M3: Pending list ---
        print("\n--- Module 3: Kich hoat khoa hoc ---")
        test_crm_id = f"CRM-E2E-{int(time.time())}"
        if auth_hdr:
            try:
                m3 = client.get(f"{base}/invoice/m3-pending", headers=auth_hdr)
                if m3.status_code != 200:
                    raise StepError(f"m3-pending → {m3.status_code}: {m3.text[:200]}")
                m3_orders = m3.json().get("orders") or []
                in_m3 = any(o.get("id") == order_id for o in m3_orders)
                log(in_m3, f"order appears in M3 pending ({len(m3_orders)} total)")

                # Save CRM ID
                save = client.post(
                    f"{base}/invoice/m3-save",
                    headers=auth_hdr,
                    json={"id": order_id, "crmOrderId": test_crm_id},
                )
                if save.status_code != 200:
                    raise StepError(f"m3-save → {save.status_code}: {save.text[:200]}")
                saved = save.json()
                log(saved.get("crmOrderId") == test_crm_id, f"crmOrderId saved={test_crm_id}")

                # Approve → CHO_XUAT_HD (xuất hóa đơn button)
                approve = client.post(
                    f"{base}/invoice/m3-approve",
                    headers=auth_hdr,
                    json={
                        "id": order_id,
                        "taxProductName": "Gói test E2E 1 tháng",
                        "crmOrderId": test_crm_id,
                    },
                )
                if approve.status_code != 200:
                    raise StepError(f"m3-approve → {approve.status_code}: {approve.text[:200]}")
                approved = approve.json()
                log(
                    approved.get("trangThaiThuTuc") == "CHO_XUAT_HD",
                    f"trangThaiThuTuc={approved.get('trangThaiThuTuc')}",
                )
            except Exception as exc:
                failures.append(f"M3: {exc}")
                log(False, str(exc))

            # Verify TT CRM in module 2 list
            try:
                lr2 = client.get(f"{base}/orders", headers=auth_hdr)
                found2 = next(
                    (o for o in (lr2.json().get("orders") or []) if o.get("id") == order_id),
                    None,
                )
                if found2:
                    log(found2.get("donCRM") is True, f"donCRM (TT CRM)={found2.get('donCRM')}")
            except Exception as exc:
                log(False, f"TT CRM check: {exc}")

        # --- M4: Queue + export ZIP ---
        print("\n--- Module 4: Xuat hoa don ---")
        if auth_hdr:
            try:
                m4 = client.get(f"{base}/invoice/m4-queue", headers=auth_hdr)
                if m4.status_code != 200:
                    raise StepError(f"m4-queue → {m4.status_code}: {m4.text[:200]}")
                m4_orders = m4.json().get("orders") or []
                in_m4 = any(o.get("id") == order_id for o in m4_orders)
                log(in_m4, f"order in M4 queue ({len(m4_orders)} total)")

                exp = client.post(f"{base}/invoice/export-batch", headers=auth_hdr)
                if exp.status_code != 200:
                    raise StepError(f"export-batch → {exp.status_code}: {exp.text[:200]}")
                ct = exp.headers.get("content-type", "")
                log("zip" in ct or "octet" in ct, f"content-type={ct}")

                zbuf = io.BytesIO(exp.content)
                with zipfile.ZipFile(zbuf) as zf:
                    names = zf.namelist()
                    log(len(names) == 3, f"ZIP contains {len(names)} files: {names}")
                    expected_prefixes = ("01_1don_hang_", "02_khach_hang1_", "03_sanpham1_")
                    for prefix in expected_prefixes:
                        has = any(n.startswith(prefix) for n in names)
                        log(has, f"file {prefix}*.xlsx present")
                        if not has:
                            failures.append(f"M4 missing {prefix}")
                    # Spot-check xlsx non-empty
                    for n in names:
                        data = zf.read(n)
                        log(len(data) > 500, f"{n} size={len(data)} bytes")
            except Exception as exc:
                failures.append(f"M4: {exc}")
                log(False, str(exc))

            # Final state
            try:
                m3_after = client.get(f"{base}/invoice/m3-pending", headers=auth_hdr)
                final = next(
                    (o for o in (m3_after.json().get("orders") or []) if o.get("id") == order_id),
                    None,
                )
                if final:
                    log(
                        final.get("trangThaiThuTuc") == "DA_XUAT_HD",
                        f"final trangThaiThuTuc={final.get('trangThaiThuTuc')}",
                    )
                    log(bool(final.get("taxInvoiceCode")), f"taxInvoiceCode={final.get('taxInvoiceCode')}")
                    log(bool(final.get("taxProductCode")), f"taxProductCode={final.get('taxProductCode')}")
            except Exception as exc:
                log(False, f"final state: {exc}")

    # --- Summary ---
    print("\n=== SUMMARY ===")
    if failures:
        print(f"FAILED - {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        print(f"\nTest order left in DB: {ma_don} (id={order_id}) - tag [E2E-AUTO-TEST]")
        return 1
    print("ALL STEPS PASSED - M1->M2->M3->M4 flow OK on real API + Supabase.")
    print(f"Test order: {ma_don} (id={order_id}) - co the xoa thu cong neu can.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="E2E M1-M4 flow test")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help="API base URL")
    args = parser.parse_args()
    sys.exit(run(args.base_url))


if __name__ == "__main__":
    main()
