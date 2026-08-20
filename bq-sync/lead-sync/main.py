import os
import datetime
import logging
import urllib.request
import json

import functions_framework
from google.cloud import bigquery

logger = logging.getLogger(__name__)

JOB_PROJECT = "pf-salary"
BQ_TABLE = "daily-report-smai-to-openclaw.app_lookup.lead_phone_lookup"

BATCH_SIZE = 500


def sb_request(url, key, method, path, body=None):
    """Minimal Supabase REST call — no heavy SDK, saves ~200MB RAM."""
    req_url = f"{url}/rest/v1/{path}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(req_url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        return resp.status


@functions_framework.http
def sync(request):
    sb_url = os.environ["SUPABASE_URL"].strip()
    sb_key = os.environ["SUPABASE_SERVICE_KEY"].strip()

    bq = bigquery.Client(project=JOB_PROJECT)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    query = f"SELECT * FROM `{BQ_TABLE}`"
    result = bq.query(query).result()

    # Delete all existing rows
    sb_request(sb_url, sb_key, "DELETE", "leads_lookup?lead_id=neq.__impossible__")

    count = 0
    batch = []

    for row in result:
        d = dict(row)
        if d.get("lead_date"):
            d["lead_date"] = d["lead_date"].isoformat()
        if d.get("lead_id") and isinstance(d["lead_id"], bytes):
            d["lead_id"] = d["lead_id"].hex()
        d["synced_at"] = now
        batch.append(d)

        if len(batch) >= BATCH_SIZE:
            sb_request(sb_url, sb_key, "POST", "leads_lookup", batch)
            count += len(batch)
            batch = []

    if batch:
        sb_request(sb_url, sb_key, "POST", "leads_lookup", batch)
        count += len(batch)

    logger.info("Synced %d rows to leads_lookup", count)
    return ({"ok": True, "rows": count, "synced_at": now}, 200)
