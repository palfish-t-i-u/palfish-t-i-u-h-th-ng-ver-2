"""
Migration script: Set is_activated=True for ALL existing Supabase auth users.
Run ONCE before deploying the activation gate to prevent existing users from being locked out.

Usage:
    cd backend
    python migrate_activate_existing_users.py

Required env vars (same as backend/.env):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import os
import sys

# Load .env nếu có
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

if not SUPABASE_URL or not SERVICE_KEY:
    print("❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong env")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("❌ Chưa cài supabase-py: pip install supabase")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SERVICE_KEY)

print("🔍 Đang lấy danh sách tất cả users từ Supabase Auth...")

# List users — Supabase có thể phân trang, cần lặp
all_users = []
page = 1
per_page = 1000
while True:
    try:
        res = sb.auth.admin.list_users(page=page, per_page=per_page)
        batch = res if isinstance(res, list) else getattr(res, "users", []) or []
        if not batch:
            break
        all_users.extend(batch)
        if len(batch) < per_page:
            break
        page += 1
    except Exception as exc:
        print(f"❌ Lỗi lấy users trang {page}: {exc}")
        sys.exit(1)

print(f"✅ Tổng cộng {len(all_users)} users")

# Filter những user chưa có is_activated=True
to_activate = []
for u in all_users:
    if hasattr(u, "model_dump"):
        u_dict = u.model_dump()
    elif hasattr(u, "__dict__"):
        u_dict = u.__dict__
    else:
        u_dict = u

    uid = u_dict.get("id") or getattr(u, "id", None)
    email = u_dict.get("email") or getattr(u, "email", None)
    meta = u_dict.get("user_metadata") or getattr(u, "user_metadata", None) or {}

    if not meta.get("is_activated", False):
        to_activate.append((uid, email))

print(f"📋 {len(to_activate)} users cần set is_activated=True")

if not to_activate:
    print("✅ Tất cả users đã có is_activated=True. Không cần migrate.")
    sys.exit(0)

# Confirm
print("\nDanh sách users sẽ được kích hoạt:")
for uid, email in to_activate[:20]:
    print(f"  - {email} ({uid})")
if len(to_activate) > 20:
    print(f"  ... và {len(to_activate) - 20} users nữa")

confirm = input(f"\n⚠️  Set is_activated=True cho {len(to_activate)} users? (yes/no): ").strip().lower()
if confirm != "yes":
    print("❌ Đã huỷ.")
    sys.exit(0)

# Thực hiện migrate
success = 0
failed = 0
for uid, email in to_activate:
    try:
        sb.auth.admin.update_user_by_id(uid, {"user_metadata": {"is_activated": True}})
        print(f"  ✅ {email}")
        success += 1
    except Exception as exc:
        print(f"  ❌ {email} — {exc}")
        failed += 1

print(f"\n🎉 Hoàn thành! Thành công: {success} | Thất bại: {failed}")
if failed > 0:
    print("⚠️  Kiểm tra lại các users thất bại trước khi deploy activation gate!")
    sys.exit(1)
print("✅ An toàn để deploy activation gate.")
