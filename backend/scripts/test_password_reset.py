"""Test resetPasswordForEmail for one address (prints Supabase error)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import httpx

email = (sys.argv[1] if len(sys.argv) > 1 else "yuusha2006@gmail.com").strip()
url = os.environ["SUPABASE_URL"].strip().rstrip("/")
anon = os.environ.get("VITE_SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_ANON_KEY")
if not anon:
    # read from frontend/.env
    fe_env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "frontend", ".env")
    if os.path.isfile(fe_env):
        for line in open(fe_env, encoding="utf-8"):
            if line.startswith("VITE_SUPABASE_ANON_KEY="):
                anon = line.split("=", 1)[1].strip()
                break

if not anon:
    print("Missing anon key")
    sys.exit(1)

redirect = "http://localhost:5173/forgot-password"
resp = httpx.post(
    f"{url}/auth/v1/recover",
    headers={
        "apikey": anon,
        "Authorization": f"Bearer {anon}",
        "Content-Type": "application/json",
    },
    json={"email": email, "redirect_to": redirect},
    timeout=30,
)
print("status:", resp.status_code)
print("body:", resp.text)
