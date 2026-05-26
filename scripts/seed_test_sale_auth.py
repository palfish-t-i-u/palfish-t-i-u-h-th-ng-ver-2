#!/usr/bin/env python3
"""Tạo Supabase Auth user cấp sale để QA — không gắn nhan_su_sale.

Cần backend/.env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

Login app: magic link (email) hoặc Google nếu email đó có Google account.
Không dùng password — UI chưa có form password.

Usage:
  python scripts/seed_test_sale_auth.py --email boss+gmv-sale-test@gmail.com
  TEST_SALE_EMAIL=... python scripts/seed_test_sale_auth.py
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore


def _load_env() -> None:
    env_path = ROOT / "backend" / ".env"
    if load_dotenv:
        load_dotenv(env_path)
    elif env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _list_users(sb):
    res = sb.auth.admin.list_users()
    if isinstance(res, list):
        return res
    return getattr(res, "users", []) or []


def _user_email(u) -> str:
    if hasattr(u, "email"):
        return (u.email or "").strip().lower()
    if isinstance(u, dict):
        return (u.get("email") or "").strip().lower()
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Create unlinked sale-level Supabase Auth test user")
    parser.add_argument(
        "--email",
        default=os.environ.get("TEST_SALE_EMAIL", "").strip(),
        help="Email inbox boss controls (magic link login)",
    )
    parser.add_argument("--name", default="Test Sale (QA)", help="Display name in user_metadata")
    parser.add_argument("--team", default="Inhouse 1", help="Team label in metadata only")
    args = parser.parse_args()

    email = (args.email or "").strip().lower()
    if not email or "@" not in email:
        print("ERROR: --email required (inbox boss can read for magic link).", file=sys.stderr)
        print("Example: python scripts/seed_test_sale_auth.py --email boss+gmv-sale-test@gmail.com")
        return 1

    _load_env()
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in backend/.env", file=sys.stderr)
        return 1

    from supabase import create_client

    sb = create_client(url, key)

    staff = sb.table("nhan_su_sale").select("crm_name, role").eq("email", email).limit(1).execute()
    if staff.data:
        row = staff.data[0]
        print(
            f"ERROR: {email} already linked to nhan_su_sale ({row.get('crm_name')}). "
            "Pick another email or clear nhan_su_sale.email first.",
            file=sys.stderr,
        )
        return 1

    for u in _list_users(sb):
        if _user_email(u) == email:
            print(f"OK: Auth user already exists for {email}")
            print("Role: sale (default when not in nhan_su_sale)")
            print("Login: app → Đăng nhập → nhập email → magic link")
            return 0

    password = secrets.token_urlsafe(24)
    meta = {
        "role": "sale",
        "full_name": args.name,
        "phone": "0900000001",
        "team": args.team,
    }
    sb.auth.admin.create_user(
        {
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": meta,
        }
    )

    print("Created sale test Auth user (NOT linked to nhan_su_sale)")
    print(f"  Email:     {email}")
    print(f"  Name:      {args.name}")
    print("  Role:      sale")
    print("  CRM link:  none")
    print()
    print("Login: app -> Dang nhap -> nhap email -> magic link")
    print("Scope: chi thay don minh tao; khong tab Quan ly quyen")
    print("Verify: Quan ly quyen -> Tai khoan Auth -> khong co CRM name")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
