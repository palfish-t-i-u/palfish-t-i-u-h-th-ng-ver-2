#!/usr/bin/env python3
"""Weekly cron script: deletes zalo_outbox rows older than 30 days that have been sent."""

import os
import sys
import datetime
from pathlib import Path

# Setup paths to allow importing from backend directory
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# Load .env
try:
    from dotenv import load_dotenv
    env_file = BACKEND_DIR / ".env"
    if env_file.exists():
        load_dotenv(env_file)
except ImportError:
    pass

try:
    from supabase import create_client
except ImportError:
    print("Missing package: pip install supabase")
    sys.exit(1)

def run_archive():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    if not url or not key:
        print("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars not set.")
        sys.exit(1)

    sb = create_client(url, key)
    
    # Calculate cutoff time (30 days ago)
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=30)
    cutoff_iso = cutoff.isoformat()
    
    print("Archive Zalo Outbox starting...")
    print(f"- Deleting sent messages older than: {cutoff_iso}")
    
    try:
        res = (
            sb.table("zalo_outbox")
            .delete()
            .not_.is_("sent_at", "null")
            .lt("sent_at", cutoff_iso)
            .execute()
        )
        deleted_rows = res.data or []
        print(f"Successfully archived/deleted {len(deleted_rows)} rows from zalo_outbox.")
    except Exception as exc:
        print(f"Error during archive cron execution: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    run_archive()
