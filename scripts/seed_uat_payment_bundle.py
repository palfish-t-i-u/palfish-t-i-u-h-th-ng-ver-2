#!/usr/bin/env python3
"""Seed a compact UAT dataset for payment flow (PR + lines + AR).

Creates:
- 4 payment_requests (pending/short/done/cancelled)
- payment_lines for each request
- 3 active_requests (partial_order/ready_invoice/pending_order standalone)

Default is dry-run. Use --apply to write DB.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))


def _load_dotenv() -> None:
    env_path = ROOT / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path)
        except ImportError:
            pass


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _next_seq_from_ids(ids: list[str], prefix: str) -> int:
    max_seq = 0
    pat = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    for raw in ids:
        m = pat.match(str(raw or ""))
        if not m:
            continue
        max_seq = max(max_seq, int(m.group(1)))
    return max_seq + 1


def _fetch_all_ids(sb, table: str, id_col: str = "id") -> list[str]:
    out: list[str] = []
    offset = 0
    page = 500
    while True:
        res = (
            sb.table(table)
            .select(id_col)
            .order("created_at", desc=False)
            .range(offset, offset + page - 1)
            .execute()
        )
        rows = res.data or []
        if not rows:
            break
        out.extend(str(r.get(id_col) or "") for r in rows if r.get(id_col))
        if len(rows) < page:
            break
        offset += page
    return out


def _pick_sale_email(sb, override: str | None) -> str:
    if override and override.strip():
        return override.strip().lower()
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("email, role, is_active")
            .eq("is_active", True)
            .limit(200)
            .execute()
        )
        rows = res.data or []
        # priority: system/manager/leader/sale
        order = {"system": 0, "manager": 1, "leader": 2, "sale": 3}
        rows.sort(key=lambda r: order.get(str(r.get("role") or "sale").lower(), 99))
        for row in rows:
            email = str(row.get("email") or "").strip().lower()
            if email:
                return email
    except Exception:
        pass
    return "dinghiang6492@gmail.com"


def _cleanup_previous(sb, marker: str) -> dict[str, int]:
    pr_res = (
        sb.table("payment_requests")
        .select("id,note")
        .ilike("note", f"%{marker}%")
        .execute()
    )
    pr_ids = [str(r.get("id")) for r in (pr_res.data or []) if r.get("id")]
    ar_res = (
        sb.table("active_requests")
        .select("id,pr_id,customer_name")
        .or_(f"customer_name.ilike.%{marker}%,pr_id.in.({','.join(pr_ids)})" if pr_ids else f"customer_name.ilike.%{marker}%")
        .execute()
    )
    ar_ids = [str(r.get("id")) for r in (ar_res.data or []) if r.get("id")]

    pl_deleted = 0
    if pr_ids:
        pl = sb.table("payment_lines").delete().in_("payment_request_id", pr_ids).execute()
        pl_deleted = len(pl.data or [])

    ar_deleted = 0
    if ar_ids:
        ar = sb.table("active_requests").delete().in_("id", ar_ids).execute()
        ar_deleted = len(ar.data or [])

    pr_deleted = 0
    if pr_ids:
        pr = sb.table("payment_requests").delete().in_("id", pr_ids).execute()
        pr_deleted = len(pr.data or [])

    return {"payment_lines": pl_deleted, "active_requests": ar_deleted, "payment_requests": pr_deleted}


def main() -> int:
    _load_dotenv()
    parser = argparse.ArgumentParser(description="Seed UAT payment dataset")
    parser.add_argument("--apply", action="store_true", help="Write data to DB")
    parser.add_argument("--sale-email", default="", help="sale_email for seeded PRs")
    parser.add_argument("--cleanup-previous", action="store_true", help="Delete previous seeds with same marker")
    parser.add_argument("--marker", default="UAT-DAT", help="Marker in note/customer_name")
    args = parser.parse_args()

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env", file=sys.stderr)
        return 1

    from supabase import create_client

    sb = create_client(url, key)
    sale_email = _pick_sale_email(sb, args.sale_email)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    tag = f"[{args.marker}-{ts}]"

    pr_ids = _fetch_all_ids(sb, "payment_requests")
    ar_ids = _fetch_all_ids(sb, "active_requests")
    pr_seq = _next_seq_from_ids(pr_ids, "PR-2026-")
    ar_seq = _next_seq_from_ids(ar_ids, "AR-2026-")

    def next_pr_id() -> str:
        nonlocal pr_seq
        v = f"PR-2026-{pr_seq:04d}"
        pr_seq += 1
        return v

    def next_ar_id() -> str:
        nonlocal ar_seq
        v = f"AR-2026-{ar_seq:04d}"
        ar_seq += 1
        return v

    pr_pending = next_pr_id()
    pr_short = next_pr_id()
    pr_done = next_pr_id()
    pr_cancelled = next_pr_id()

    u1 = f"uatdat-{ts}-001"
    u2 = f"uatdat-{ts}-002"
    u3 = f"uatdat-{ts}-003"
    u4 = f"uatdat-{ts}-004"

    payment_requests = [
        {
            "id": pr_pending,
            "name": f"{tag} PR Pending",
            "uid": u1,
            "phone": "0900001001",
            "country": "VN",
            "address": "HN",
            "ward": "",
            "province": "Ha Noi",
            "note": tag,
            "email": "",
            "sale_email": sale_email,
            "target": 300000,
            "received": 0,
            "state": "pending",
        },
        {
            "id": pr_short,
            "name": f"{tag} PR Short",
            "uid": u2,
            "phone": "0900001002",
            "country": "VN",
            "address": "HN",
            "ward": "",
            "province": "Ha Noi",
            "note": tag,
            "email": "",
            "sale_email": sale_email,
            "target": 500000,
            "received": 200000,
            "state": "short",
        },
        {
            "id": pr_done,
            "name": f"{tag} PR Done",
            "uid": u3,
            "phone": "0900001003",
            "country": "VN",
            "address": "HCM",
            "ward": "",
            "province": "Ho Chi Minh",
            "note": tag,
            "email": "",
            "sale_email": sale_email,
            "target": 400000,
            "received": 400000,
            "state": "done",
        },
        {
            "id": pr_cancelled,
            "name": f"{tag} PR Cancelled",
            "uid": u4,
            "phone": "0900001004",
            "country": "VN",
            "address": "HN",
            "ward": "",
            "province": "Ha Noi",
            "note": tag,
            "email": "",
            "sale_email": sale_email,
            "target": 250000,
            "received": 0,
            "state": "cancelled",
            "cancelled_at": _now_iso(),
            "cancelled_reason": f"{tag} seeded cancelled sample",
        },
    ]

    payment_lines = [
        {
            "payment_request_id": pr_pending,
            "method": "cash",
            "amount": 300000,
            "status": "pending",
            "transfer_code": f"TT-{pr_pending}-001",
        },
        {
            "payment_request_id": pr_short,
            "method": "qr",
            "amount": 200000,
            "status": "paid",
            "transfer_code": f"TT-{pr_short}-001",
            "paid_at": _now_iso(),
            "checkout_url": "",
            "qr_code": "",
        },
        {
            "payment_request_id": pr_short,
            "method": "qr",
            "amount": 300000,
            "status": "pending",
            "transfer_code": f"TT-{pr_short}-002",
            "checkout_url": "",
            "qr_code": "",
        },
        {
            "payment_request_id": pr_done,
            "method": "cash",
            "amount": 400000,
            "status": "paid",
            "transfer_code": f"TT-{pr_done}-001",
            "paid_at": _now_iso(),
        },
        {
            "payment_request_id": pr_cancelled,
            "method": "card",
            "amount": 250000,
            "status": "pending",
            "transfer_code": f"TT-{pr_cancelled}-001",
        },
    ]

    ar_partial = next_ar_id()
    ar_ready = next_ar_id()
    ar_standalone = next_ar_id()

    active_requests = [
        {
            "id": ar_partial,
            "pr_id": pr_short,
            "customer_name": f"{tag} AR Partial",
            "status": "partial_order",
            "uids_data": [
                {
                    "uid": u2,
                    "phone": "0900001002",
                    "country": "VN",
                    "courses": [
                        {
                            "code": f"CC-{pr_short[-4:]}-001",
                            "name": f"{tag} Course A",
                            "amount": 200000,
                            "order_id": f"ORD-{ts}-A1",
                            "invoiced": False,
                            "invoice_id": "",
                        },
                        {
                            "code": f"CC-{pr_short[-4:]}-002",
                            "name": f"{tag} Course B",
                            "amount": 300000,
                            "order_id": "",
                            "invoiced": False,
                            "invoice_id": "",
                        },
                    ],
                }
            ],
        },
        {
            "id": ar_ready,
            "pr_id": pr_done,
            "customer_name": f"{tag} AR Ready",
            "status": "ready_invoice",
            "uids_data": [
                {
                    "uid": u3,
                    "phone": "0900001003",
                    "country": "VN",
                    "courses": [
                        {
                            "code": f"CC-{pr_done[-4:]}-001",
                            "name": f"{tag} Course C",
                            "amount": 400000,
                            "order_id": f"ORD-{ts}-C1",
                            "invoiced": False,
                            "invoice_id": "",
                        }
                    ],
                }
            ],
        },
        {
            "id": ar_standalone,
            "pr_id": None,
            "customer_name": f"{tag} Standalone",
            "status": "pending_order",
            "uids_data": [
                {
                    "uid": f"{u1}-extra",
                    "phone": "",
                    "country": "VN",
                    "courses": [
                        {
                            "code": f"CC-{ar_standalone[-4:]}-001",
                            "name": f"{tag} Standalone Course",
                            "amount": 150000,
                            "order_id": "",
                            "invoiced": False,
                            "invoice_id": "",
                        }
                    ],
                }
            ],
        },
    ]

    print("=== UAT Seed Preview ===")
    print(f"marker      : {tag}")
    print(f"sale_email  : {sale_email}")
    print("payment_requests:")
    for row in payment_requests:
        print(f"  - {row['id']} | {row['name']} | state={row['state']} | target={row['target']} | received={row['received']}")
    print("active_requests:")
    for row in active_requests:
        print(f"  - {row['id']} | pr_id={row.get('pr_id')} | status={row['status']}")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write DB.")
        return 0

    if args.cleanup_previous:
        deleted = _cleanup_previous(sb, args.marker)
        print(f"cleanup_previous deleted: {deleted}")

    pr_ins = sb.table("payment_requests").insert(payment_requests).execute()
    pl_ins = sb.table("payment_lines").insert(payment_lines).execute()
    ar_ins = sb.table("active_requests").insert(active_requests).execute()

    print("\n=== Seeded ===")
    print(f"payment_requests: {len(pr_ins.data or [])}")
    print(f"payment_lines   : {len(pl_ins.data or [])}")
    print(f"active_requests : {len(ar_ins.data or [])}")
    print("PR IDs:", ", ".join([pr_pending, pr_short, pr_done, pr_cancelled]))
    print("AR IDs:", ", ".join([ar_partial, ar_ready, ar_standalone]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
