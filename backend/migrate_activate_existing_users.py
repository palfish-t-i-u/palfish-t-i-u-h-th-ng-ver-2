"""
Migration: set is_activated for existing Supabase Auth users before activation gate.

Tier A — SYSTEM_ADMIN_EMAILS env → is_activated=True
Tier B — email linked in nhan_su_sale with crm_name → is_activated=True
Tier C — everyone else → is_activated=False (explicit, for new-signup parity)

Usage:
    cd backend
    python migrate_activate_existing_users.py              # dry-run (default)
    python migrate_activate_existing_users.py --apply      # write changes

Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (backend/.env)
Optional: SYSTEM_ADMIN_EMAILS (comma-separated)
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _user_dict(u: Any) -> dict[str, Any]:
    if hasattr(u, "model_dump"):
        return u.model_dump()
    if isinstance(u, dict):
        return u
    return {
        "id": getattr(u, "id", None),
        "email": getattr(u, "email", None),
        "user_metadata": getattr(u, "user_metadata", None) or {},
    }


def _load_admin_emails() -> set[str]:
    raw = os.getenv("SYSTEM_ADMIN_EMAILS") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _list_all_users(sb) -> list[dict[str, Any]]:
    all_users: list[dict[str, Any]] = []
    page = 1
    per_page = 1000
    while True:
        res = sb.auth.admin.list_users(page=page, per_page=per_page)
        batch = res if isinstance(res, list) else getattr(res, "users", []) or []
        if not batch:
            break
        all_users.extend(_user_dict(u) for u in batch)
        if len(batch) < per_page:
            break
        page += 1
    return all_users


def _load_linked_emails(sb) -> set[str]:
    res = sb.table("nhan_su_sale").select("email, crm_name").execute()
    linked: set[str] = set()
    for row in res.data or []:
        email = str(row.get("email") or "").strip().lower()
        crm = str(row.get("crm_name") or "").strip()
        if email and crm:
            linked.add(email)
    return linked


def _classify_user(
    user: dict[str, Any],
    admin_emails: set[str],
    linked_emails: set[str],
) -> tuple[str, bool]:
    email = str(user.get("email") or "").strip().lower()
    meta = dict(user.get("user_metadata") or {})
    current = _is_truthy(meta.get("is_activated", False))

    if email in admin_emails:
        target = True
        tier = "A-admin"
    elif email in linked_emails:
        target = True
        tier = "B-crm-linked"
    else:
        target = False
        tier = "C-pending"

    if current == target:
        return tier, target  # no change needed marker handled by caller
    return tier, target


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate is_activated for auth users")
    parser.add_argument("--apply", action="store_true", help="Apply changes (default: dry-run)")
    args = parser.parse_args()

    if not SUPABASE_URL or not SERVICE_KEY:
        print("[ERR] Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY")
        return 1

    try:
        from supabase import create_client
    except ImportError:
        print("[ERR] pip install supabase")
        return 1

    sb = create_client(SUPABASE_URL, SERVICE_KEY)
    admin_emails = _load_admin_emails()
    linked_emails = _load_linked_emails(sb)

    print(f"Loading auth users... (admin emails: {len(admin_emails)}, CRM-linked: {len(linked_emails)})")
    users = _list_all_users(sb)
    print(f"OK {len(users)} auth users")

    to_update: list[tuple[str, str, str, bool, bool]] = []
    counts = {"A-admin": 0, "B-crm-linked": 0, "C-pending": 0, "skip": 0}

    for user in users:
        uid = user.get("id")
        email = str(user.get("email") or "")
        meta = dict(user.get("user_metadata") or {})
        current = _is_truthy(meta.get("is_activated", False))
        tier, target = _classify_user(user, admin_emails, linked_emails)
        if current == target:
            counts["skip"] += 1
            continue
        counts[tier] += 1
        to_update.append((uid, email, tier, current, target))

    print("\nPlanned changes:")
    print(f"  Tier A (admin activate):     {counts['A-admin']}")
    print(f"  Tier B (CRM-linked activate): {counts['B-crm-linked']}")
    print(f"  Tier C (set pending):        {counts['C-pending']}")
    print(f"  Unchanged:                   {counts['skip']}")

    for uid, email, tier, current, target in to_update[:25]:
        print(f"  [{tier}] {email}: is_activated {current} -> {target}")
    if len(to_update) > 25:
        print(f"  … và {len(to_update) - 25} users nữa")

    if not to_update:
        print("\nOK Khong can migrate.")
        return 0

    if not args.apply:
        print("\n[WARN] Dry-run only. Chay lai voi --apply de ghi Supabase.")
        return 0

    ok = fail = 0
    for uid, email, tier, _current, target in to_update:
        if not uid:
            fail += 1
            continue
        try:
            res = sb.auth.admin.get_user_by_id(uid)
            user_data = _user_dict(getattr(res, "user", res))
            merged = dict(user_data.get("user_metadata") or {})
            merged["is_activated"] = target
            sb.auth.admin.update_user_by_id(uid, {"user_metadata": merged})
            print(f"  OK [{tier}] {email}")
            ok += 1
        except Exception as exc:
            print(f"  FAIL {email} — {exc}")
            fail += 1

    print(f"\nDone: {ok} ok | {fail} failed")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
