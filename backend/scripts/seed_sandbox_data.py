#!/usr/bin/env python3
"""Seed clean, idempotent sandbox data for PalFish GMV.

Default mode is dry-run. Use --apply to write to the Supabase project pointed to
by SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class UpsertPlan:
    table: str
    rows: list[dict[str, Any]]
    on_conflict: str


@dataclass(frozen=True)
class SequenceEnsure:
    table: str
    year_key: str
    min_current_val: int


def load_sandbox_env(extra_env: str | None = None) -> list[Path]:
    loaded: list[Path] = []
    candidates = []
    if extra_env:
        candidates.append(Path(extra_env))
    candidates.extend([ROOT / ".env.sandbox", BACKEND_DIR / ".env.sandbox"])

    try:
        from dotenv import load_dotenv
    except ImportError:
        load_dotenv = None  # type: ignore[assignment]

    for path in candidates:
        if not path.exists():
            continue
        loaded.append(path)
        if load_dotenv:
            load_dotenv(path, override=False)
        else:
            for raw in path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key and key not in os.environ:
                    os.environ[key] = value.strip().strip('"').strip("'")
    return loaded


def iso(day: str, clock: str) -> str:
    return f"{day}T{clock}+00:00"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def staff_rows() -> list[dict[str, Any]]:
    now = now_iso()
    rows = [
        ("Sandbox Sale HN", "sale_hn@palfish.vn", "sale", "HN 1", "HN 1", "leader_hn@palfish.vn"),
        ("Sandbox Leader HN", "leader_hn@palfish.vn", "leader", "HN 1", "HN 1", ""),
        ("Sandbox Sale HCM", "sale_hcm@palfish.vn", "sale", "HCM 1", "HCM 1", "leader_hcm@palfish.vn"),
        ("Sandbox Leader HCM", "leader_hcm@palfish.vn", "leader", "HCM 1", "HCM 1", ""),
        ("Sandbox Manager", "manager@palfish.vn", "manager", "System", "", ""),
        ("Sandbox System Admin", "system_admin@palfish.vn", "system", "System", "", ""),
    ]
    out = []
    for idx, (name, email, role, team, sub_team, leader_email) in enumerate(rows, start=1):
        out.append(
            {
                "crm_name": name,
                "email": email,
                "display_name": name,
                "sdt": f"090000000{idx}",
                "depart6_name": "Sandbox",
                "depart7_name": team,
                "depart8_name": sub_team or None,
                "team": team,
                "sub_team": sub_team or None,
                "role": role,
                "leader_email": leader_email or None,
                "manager_email": "manager@palfish.vn" if role in {"sale", "leader"} else None,
                "is_active": True,
                "synced_at": now,
            }
        )
    return out


def payment_request_rows(year: int) -> list[dict[str, Any]]:
    d = f"{year}-01-15"
    base = [
        ("9001", "Sandbox Pending Parent", "Ha Noi", "pending", 10_000_000, 0, "sale_hn@palfish.vn"),
        ("9002", "Sandbox Short Parent", "Ha Noi", "short", 10_000_000, 4_000_000, "sale_hn@palfish.vn"),
        ("9003", "Sandbox Done Parent", "Ho Chi Minh", "done", 12_000_000, 12_000_000, "sale_hcm@palfish.vn"),
        ("9004", "Sandbox Cancelled Parent", "Ho Chi Minh", "cancelled", 8_000_000, 0, "sale_hcm@palfish.vn"),
    ]
    rows: list[dict[str, Any]] = []
    for idx, (seq, name, province, state, target, received, sale_email) in enumerate(base, start=1):
        row = {
            "id": f"PR-{year}-{seq}",
            "name": name,
            "uid": f"SBX-{year}-UID-00{idx}",
            "phone": f"090100000{idx}",
            "country": "VN",
            "address": f"{idx} Sandbox Street",
            "ward": f"Ward {idx}",
            "province": province,
            "email": f"sandbox.{state}@example.com",
            "note": f"[SANDBOX-SEED] {state} PR",
            "target": target,
            "received": received,
            "state": state,
            "sale_email": sale_email,
            "created_at": iso(d, f"0{idx}:00:00"),
            "updated_at": iso(d, f"0{idx}:00:00"),
            "cancelled_at": None,
            "cancelled_reason": None,
        }
        if state == "cancelled":
            row["cancelled_at"] = iso(d, "04:30:00")
            row["cancelled_reason"] = "Sandbox cancelled sample"
        rows.append(row)
    return rows


def payment_line_rows(year: int) -> list[dict[str, Any]]:
    d = f"{year}-01-15"
    return [
        line("11111111-1111-4111-8111-111111111111", year, "9001", "qr", 10_000_000, "pending", "001", d),
        line("22222222-2222-4222-8222-222222222222", year, "9002", "cash", 4_000_000, "paid", "001", d, paid_clock="02:15:00"),
        line("33333333-3333-4333-8333-333333333333", year, "9002", "qr", 6_000_000, "pending", "002", d),
        line("44444444-4444-4444-8444-444444444444", year, "9003", "qr", 12_000_000, "paid", "001", d, paid_clock="03:20:00"),
        line(
            "55555555-5555-4555-8555-555555555555",
            year,
            "9004",
            "qr",
            8_000_000,
            "rejected",
            "001",
            d,
            reject_reason="Sandbox rejected sample",
        ),
    ]


def line(
    row_id: str,
    year: int,
    pr_seq: str,
    method: str,
    amount: int,
    status: str,
    idx: str,
    day: str,
    *,
    paid_clock: str | None = None,
    reject_reason: str | None = None,
) -> dict[str, Any]:
    transfer_code = f"TT-{year}{pr_seq}-{idx}"
    is_qr = method == "qr"
    return {
        "id": row_id,
        "payment_request_id": f"PR-{year}-{pr_seq}",
        "method": method,
        "amount": amount,
        "status": status,
        "payos_order_code": f"{year}{pr_seq}{idx}" if is_qr else None,
        "transfer_code": transfer_code,
        "qr_code": f"SANDBOX_QR_{pr_seq}_{idx}" if is_qr else "",
        "checkout_url": f"https://pay.payos.vn/web/sandbox-{pr_seq}-{idx}" if is_qr else "",
        "paid_at": iso(day, paid_clock) if paid_clock else None,
        "reject_reason": reject_reason,
        "bill_image": None,
        "created_at": iso(day, "01:05:00"),
        "updated_at": iso(day, paid_clock or "01:05:00"),
    }


def course(
    code: str,
    name: str,
    amount: int,
    *,
    order_id: str = "",
    invoice_requested_at: str = "",
    invoiced: bool = False,
    invoice_id: str = "",
    invoiced_at: str = "",
    tax_invoice_code: str = "",
    tax_product_code: str = "",
) -> dict[str, Any]:
    return {
        "code": code,
        "name": name,
        "amount": amount,
        "order_id": order_id,
        "invoice_requested_at": invoice_requested_at,
        "invoiced": invoiced,
        "invoice_id": invoice_id,
        "invoiced_at": invoiced_at,
        "tax_invoice_code": tax_invoice_code,
        "tax_product_code": tax_product_code,
    }


def active_request_rows(year: int) -> list[dict[str, Any]]:
    d = f"{year}-01-15"
    return [
        ar_row(
            year,
            "9001",
            "pending_order",
            [course(f"CC-{year}-9001-001", "Sandbox Trial Package", 4_000_000)],
            iso(d, "05:00:00"),
        ),
        ar_row(
            year,
            "9002",
            "ready_invoice",
            [
                course(
                    f"CC-{year}-9002-001",
                    "Sandbox Ready Invoice Package",
                    4_000_000,
                    order_id=f"ORD-SBX-{year}-9002",
                    invoice_requested_at=iso(d, "06:30:00"),
                )
            ],
            iso(d, "06:00:00"),
        ),
        ar_row(
            year,
            "9003",
            "invoiced",
            [
                course(
                    f"CC-{year}-9003-001",
                    "Sandbox Invoiced Package",
                    4_000_000,
                    order_id=f"ORD-SBX-{year}-9003",
                    invoice_requested_at=iso(d, "07:15:00"),
                    invoiced=True,
                    invoice_id=f"INV-{year}-9003",
                    invoiced_at=iso(d, "07:30:00"),
                    tax_invoice_code=f"M{year}0115001",
                    tax_product_code=f"PF{year}9003",
                )
            ],
            iso(d, "07:00:00"),
        ),
    ]


def ar_row(year: int, seq: str, status: str, courses: list[dict[str, Any]], created_at: str) -> dict[str, Any]:
    return {
        "id": f"AR-{year}-{seq}",
        "pr_id": f"PR-{year}-9003",
        "customer_name": "Sandbox Done Parent",
        "uids_data": [
            {
                "uid": f"SBX-{year}-UID-003",
                "phone": "0901000003",
                "country": "VN",
                "courses": courses,
            }
        ],
        "status": status,
        "created_at": created_at,
        "updated_at": created_at,
    }


def bc03_kpi_rows(month_key: str) -> list[dict[str, Any]]:
    return [
        {"month_key": month_key, "sale_name": "Sandbox Sale HN", "b2_orders": 2, "b4_gmv_vnd": 20_000_000, "sort_order": 1},
        {"month_key": month_key, "sale_name": "Sandbox Leader HN", "b2_orders": 0, "b4_gmv_vnd": 0, "sort_order": 2},
        {"month_key": month_key, "sale_name": "Sandbox Sale HCM", "b2_orders": 1, "b4_gmv_vnd": 12_000_000, "sort_order": 3},
        {"month_key": month_key, "sale_name": "Sandbox Leader HCM", "b2_orders": 0, "b4_gmv_vnd": 0, "sort_order": 4},
    ]


def build_seed_plan(year: int, month_key: str) -> tuple[list[UpsertPlan], list[SequenceEnsure]]:
    plans = [
        UpsertPlan("nhan_su_sale", staff_rows(), "crm_name"),
        UpsertPlan("bc03_month_settings", [{"month_key": month_key, "exchange_rate": 3700, "updated_by": "seed_sandbox_data"}], "month_key"),
        UpsertPlan("bc03_kpi_rows", bc03_kpi_rows(month_key), "month_key,sale_name"),
        UpsertPlan("payment_requests", payment_request_rows(year), "id"),
        UpsertPlan("payment_lines", payment_line_rows(year), "id"),
        UpsertPlan("active_requests", active_request_rows(year), "id"),
    ]
    sequences = [
        SequenceEnsure("payment_request_sequences", str(year), 9100),
        SequenceEnsure("invoice_sequences", str(year), 9100),
    ]
    return plans, sequences


def print_plan(plans: list[UpsertPlan], sequences: list[SequenceEnsure], *, apply: bool) -> None:
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[{mode}] Sandbox seed plan")
    for seq in sequences:
        print(f"- ensure {seq.table}: year_key={seq.year_key} current_val>={seq.min_current_val}")
    for plan in plans:
        print(f"- upsert {plan.table}: {len(plan.rows)} row(s), on_conflict={plan.on_conflict}")
        for row in plan.rows:
            token = row.get("id") or row.get("crm_name") or row.get("month_key") or row.get("sale_name")
            print(f"  - {token}")


def apply_sequence(sb, seq: SequenceEnsure) -> str:
    current_res = (
        sb.table(seq.table)
        .select("year_key,current_val")
        .eq("year_key", seq.year_key)
        .limit(1)
        .execute()
    )
    current = int(current_res.data[0].get("current_val") or 0) if current_res.data else None
    if current is not None and current >= seq.min_current_val:
        return f"kept {seq.table}:{seq.year_key} current_val={current}"
    sb.table(seq.table).upsert(
        {"year_key": seq.year_key, "current_val": seq.min_current_val},
        on_conflict="year_key",
    ).execute()
    return f"upserted {seq.table}:{seq.year_key} current_val={seq.min_current_val}"


def apply_plan(sb, plans: list[UpsertPlan], sequences: list[SequenceEnsure]) -> None:
    for seq in sequences:
        print(f"[apply] {apply_sequence(sb, seq)}")
    for plan in plans:
        print(f"[apply] upsert {plan.table} ({len(plan.rows)} rows)")
        sb.table(plan.table).upsert(plan.rows, on_conflict=plan.on_conflict).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed clean sandbox data into Supabase")
    parser.add_argument("--apply", action="store_true", help="Write data. Without this flag, only prints a dry-run plan.")
    parser.add_argument("--env-file", default="", help="Optional explicit .env.sandbox path")
    parser.add_argument("--year", type=int, default=datetime.now(timezone.utc).year)
    parser.add_argument("--month", default=datetime.now(timezone.utc).strftime("%Y-%m"))
    args = parser.parse_args()

    loaded = load_sandbox_env(args.env_file or None)
    plans, sequences = build_seed_plan(args.year, args.month)
    print_plan(plans, sequences, apply=args.apply)
    if loaded:
        print("[env] loaded " + ", ".join(str(p) for p in loaded))
    else:
        print("[env] no .env.sandbox file loaded; using current process environment")

    if not args.apply:
        print("[dry-run] No database writes performed. Re-run with --apply to seed sandbox.")
        return 0

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply", file=sys.stderr)
        return 2

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package is not installed. Install backend requirements first.", file=sys.stderr)
        return 2

    sb = create_client(url, key)
    apply_plan(sb, plans, sequences)
    print("[done] Sandbox seed completed.")
    print(json.dumps({"year": args.year, "month": args.month, "tables": [p.table for p in plans]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
