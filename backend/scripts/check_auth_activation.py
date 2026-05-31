"""One-off: print is_activated from Supabase Auth user_metadata."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from supabase import create_client

sb = create_client(
    os.environ["SUPABASE_URL"].strip(),
    os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip(),
)
admins = {
    e.strip().lower()
    for e in (os.getenv("SYSTEM_ADMIN_EMAILS") or "").split(",")
    if e.strip()
}
res = sb.auth.admin.list_users()
users = res if isinstance(res, list) else getattr(res, "users", [])
print(f"{'email':<35} is_activated")
for u in users:
    d = u.model_dump() if hasattr(u, "model_dump") else u
    email = d.get("email") or ""
    meta = d.get("user_metadata") or {}
    act = meta.get("is_activated")
    tag = " [ADMIN]" if email.lower() in admins else ""
    print(f"{email:<35} {act!r}{tag}")
