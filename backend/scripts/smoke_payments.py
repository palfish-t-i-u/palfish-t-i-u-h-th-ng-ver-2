#!/usr/bin/env python3
"""Smoke test payments module API against sandbox Supabase."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv(BACKEND / ".env.sandbox")
load_dotenv(BACKEND / ".env")


def _jwt_for(email: str) -> str:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=30) as client:
        gen = client.post(
            f"{url}/auth/v1/admin/generate_link",
            headers=headers,
            json={"type": "magiclink", "email": email},
        )
        gen.raise_for_status()
        data = gen.json()
        token_hash = data.get("hashed_token") or (data.get("properties") or {}).get(
            "hashed_token"
        )
        verify = client.post(
            f"{url}/auth/v1/verify",
            headers=headers,
            json={"type": "magiclink", "token_hash": token_hash},
        )
        verify.raise_for_status()
        return verify.json()["access_token"]


def _check(name: str, status: int, expected: int = 200) -> bool:
    ok = status == expected
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: {status}")
    return ok


def main() -> int:
    email = (os.getenv("SYSTEM_ADMIN_EMAILS") or "system_admin@palfish.vn").split(",")[
        0
    ].strip()
    token = _jwt_for(email)
    print(f"Auth OK: {email}")

    from fastapi.testclient import TestClient

    import main as app_main

    client = TestClient(app_main.app)
    headers = {"Authorization": f"Bearer {token}"}
    ok_all = True

    r = client.get("/healthz")
    ok_all &= _check("GET /healthz", r.status_code)
    body = r.json()
    print(f"    env={body.get('env')} sandbox={body.get('sandbox')}")

    r = client.get(
        "/api/v1/payments",
        params={"page_size": 5, "team": "HCM"},
        headers=headers,
    )
    ok_all &= _check("GET /api/v1/payments", r.status_code)
    data = r.json() if r.status_code == 200 else {}
    if r.status_code == 200:
        print(
            f"    total={data.get('total')} items={len(data.get('items') or [])} "
            f"summary.count={(data.get('summary') or {}).get('count')}"
        )
    pid = (data.get("items") or [{}])[0].get("payment_id") if data else None

    r = client.get("/api/v1/customers/search", params={"q": "3311"}, headers=headers)
    ok_all &= _check("GET /api/v1/customers/search", r.status_code)
    if r.status_code == 200:
        print(f"    hits={len(r.json())}")

    r = client.get("/api/v1/payments/master/sales", headers=headers)
    ok_all &= _check("GET master/sales", r.status_code)
    sales = r.json() if r.status_code == 200 else []
    print(f"    sales={len(sales)}")
    sale_id = sales[0]["id"] if sales else None

    ok_all &= _check(
        "GET master/channels",
        client.get("/api/v1/payments/master/channels", headers=headers).status_code,
    )
    ok_all &= _check(
        "GET master/packages",
        client.get("/api/v1/payments/master/packages", headers=headers).status_code,
    )

    if pid:
        ok_all &= _check(
            "POST refund",
            client.post(f"/api/v1/payments/{pid}/refund", headers=headers).status_code,
        )
        ok_all &= _check(
            "POST restore",
            client.post(f"/api/v1/payments/{pid}/restore", headers=headers).status_code,
        )
        ok_all &= _check(
            "POST link-crm",
            client.post(
                f"/api/v1/payments/{pid}/link-crm",
                headers=headers,
                json={"crm_order_id": "SMOKE-CRM-001"},
            ).status_code,
        )

    if sale_id:
        r = client.post(
            "/api/v1/payments",
            headers=headers,
            json={
                "uid": "SMOKE-PAY-UID-001",
                "pay_time": datetime.now(timezone.utc).isoformat(),
                "sale_id": sale_id,
                "real_pay_vnd": 3_700_000,
                "gmv_rmb": 1000,
                "customer_name": "Smoke Test",
                "customer_phone": "0900000001",
            },
        )
        ok_all &= _check("POST create payment", r.status_code)
        if r.status_code == 200:
            new_id = r.json().get("payment_id")
            ok_all &= _check(
                "DELETE soft-delete",
                client.delete(f"/api/v1/payments/{new_id}", headers=headers).status_code,
            )
            r2 = client.get(
                "/api/v1/payments",
                params={"search": "SMOKE-PAY-UID-001"},
                headers=headers,
            )
            ok_all &= _check("GET list after delete", r2.status_code)
            print(f"    visible after delete: {r2.json().get('total')}")

    from supabase import create_client

    sb = create_client(
        os.environ["SUPABASE_URL"].strip(),
        os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip(),
    )
    rev_count = sb.table("so_doanh_thu").select("*", count="exact").limit(0).execute().count
    print(f"  [INFO] so_doanh_thu rows={rev_count} (module cũ — không đụng payments import)")

    print("SMOKE:", "ALL PASS" if ok_all else "SOME FAIL")
    return 0 if ok_all else 1


if __name__ == "__main__":
    raise SystemExit(main())
