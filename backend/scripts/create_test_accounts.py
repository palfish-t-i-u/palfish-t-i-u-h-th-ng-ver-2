"""One-shot script: create test.user@dev, test.leader@dev, test.admin@dev accounts.

Usage:
  cd backend
  set SUPABASE_URL=https://jozcvbbypwvzaefteoxn.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
  python scripts/create_test_accounts.py
"""

import os
import sys

from supabase import create_client

ACCOUNTS = [
    {
        "email": "test.user@dev",
        "password": "123456",
        "user_metadata": {
            "full_name": "Test User",
            "role": "sale",
            "department": "ban_hang",
            "team": "Inhouse 1",
            "is_activated": True,
        },
    },
    {
        "email": "test.leader@dev",
        "password": "123456",
        "user_metadata": {
            "full_name": "Test Leader",
            "role": "leader",
            "department": "ban_hang",
            "team": "Inhouse 1",
            "is_activated": True,
        },
    },
    {
        "email": "test.admin@dev",
        "password": "123456",
        "user_metadata": {
            "full_name": "Test Admin",
            "role": "system",
            "department": "nhan_su_quan_tri",
            "is_activated": True,
        },
    },
]


def main():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.")
        sys.exit(1)

    sb = create_client(url, key)

    for acct in ACCOUNTS:
        email = acct["email"]
        print(f"\nCreating {email} ...")
        try:
            result = sb.auth.admin.create_user(
                {
                    "email": email,
                    "password": acct["password"],
                    "user_metadata": acct["user_metadata"],
                    "email_confirm": True,
                }
            )
            user = result.user if hasattr(result, "user") else result
            uid = user.id if hasattr(user, "id") else user.get("id")
            print(f"  OK — id: {uid}")
        except Exception as exc:
            if "already been registered" in str(exc).lower() or "already exists" in str(exc).lower():
                print(f"  SKIP — {email} already exists")
            else:
                print(f"  FAIL — {exc}")

    print("\nDone. You can now log in with:")
    print("  test.user@dev   / 123456  (role: sale)")
    print("  test.leader@dev / 123456  (role: leader)")
    print("  test.admin@dev  / 123456  (role: system/admin)")
    print("\nDọn dữ liệu test: tìm PR/giao dịch có sale_email chứa '@dev'")


if __name__ == "__main__":
    main()
