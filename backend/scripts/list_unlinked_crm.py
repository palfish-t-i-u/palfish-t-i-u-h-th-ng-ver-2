"""List nhan_su_sale rows without linked email (safe CRM picks for auth test)."""
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from supabase import create_client

LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 25

sb = create_client(
    os.environ["SUPABASE_URL"].strip(),
    os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip(),
)

cnt_res = (
    sb.table("nhan_su_sale")
    .select("crm_name", count="exact")
    .is_("email", "null")
    .eq("is_active", True)
    .execute()
)
total = cnt_res.count if cnt_res.count is not None else 0

res = (
    sb.table("nhan_su_sale")
    .select("crm_name, team, sub_team, role, is_active, display_name")
    .is_("email", "null")
    .eq("is_active", True)
    .order("crm_name")
    .limit(LIMIT)
    .execute()
)
rows = res.data or []

print(f"=== CRM active, chua co email (hien {len(rows)}/{total}) ===")
print(f"{'crm_name':<28} {'team':<14} {'sub_team':<12} role")
print("-" * 70)
for r in rows:
    print(
        f"{(r.get('crm_name') or ''):<28} "
        f"{(r.get('team') or '-'):<14} "
        f"{(r.get('sub_team') or '-'):<12} "
        f"{r.get('role') or 'sale'}"
    )
