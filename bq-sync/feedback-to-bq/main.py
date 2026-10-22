"""Cloud Function: Supabase lead_feedback -> BigQuery (pf-feedback-dashboard.lead_quality.lead_feedback).

Chiều NGƯỢC với lead-sync (BQ->Supabase). Đọc toàn bộ bảng lead_feedback trên Supabase prod
qua REST (service key) rồi WRITE_TRUNCATE full-load vào BQ. Full-load (không incremental) để
phản ánh đúng cả SỬA (MKT nhận xét) lẫn XOÁ — bảng nhỏ nên rẻ.

Tầng này để anh Hiếu join feedback với pancake + CRM Note + CRM Phone record + dữ liệu quảng cáo.
"""

import os
import datetime
import logging
import urllib.request
import json

import functions_framework
from google.cloud import bigquery

logger = logging.getLogger(__name__)

# Project chạy job BQ load (= project đích luôn cho gọn IAM)
BQ_PROJECT = "pf-feedback-dashboard"
BQ_TABLE = "pf-feedback-dashboard.lead_quality.lead_feedback"

PAGE = 1000  # Supabase REST trả tối đa ~1000 dòng/req -> phân trang bằng Range header

# jsonb (sale_images/mkt_images) PostgREST trả về dạng JSON lồng -> ta json.dumps thành STRING.
SELECT_COLS = (
    "id,created_at,sale_email,sale_name,phone,phone9,uid,customer_name,"
    "lead_source,lead_channel,lead_id,sale_note,sale_images,status,"
    "mkt_note,mkt_images,mkt_by,mkt_at"
)

SCHEMA = [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("created_at", "TIMESTAMP"),
    bigquery.SchemaField("sale_email", "STRING"),
    bigquery.SchemaField("sale_name", "STRING"),
    bigquery.SchemaField("phone", "STRING"),
    bigquery.SchemaField("phone9", "STRING"),
    bigquery.SchemaField("uid", "STRING"),
    bigquery.SchemaField("customer_name", "STRING"),
    bigquery.SchemaField("lead_source", "STRING"),
    bigquery.SchemaField("lead_channel", "STRING"),
    bigquery.SchemaField("lead_id", "STRING"),
    bigquery.SchemaField("sale_note", "STRING"),
    bigquery.SchemaField("sale_images", "STRING"),
    bigquery.SchemaField("status", "STRING"),
    bigquery.SchemaField("mkt_note", "STRING"),
    bigquery.SchemaField("mkt_images", "STRING"),
    bigquery.SchemaField("mkt_by", "STRING"),
    bigquery.SchemaField("mkt_at", "TIMESTAMP"),
    bigquery.SchemaField("synced_at", "TIMESTAMP"),
]


def sb_get_all(url, key, table, select):
    """Đọc toàn bộ bảng Supabase qua REST, phân trang bằng Range header."""
    rows = []
    start = 0
    while True:
        req_url = f"{url}/rest/v1/{table}?select={select}&order=created_at.asc"
        req = urllib.request.Request(
            req_url,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Range-Unit": "items",
                "Range": f"{start}-{start + PAGE - 1}",
            },
            method="GET",
        )
        with urllib.request.urlopen(req) as resp:
            chunk = json.loads(resp.read().decode())
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        start += PAGE
    return rows


def _json_text(v):
    """jsonb -> JSON text cho cột STRING của BQ."""
    if v is None:
        return "[]"
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)


@functions_framework.http
def sync(request):
    sb_url = os.environ["SUPABASE_URL"].strip()
    sb_key = os.environ["SUPABASE_SERVICE_KEY"].strip()

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    raw = sb_get_all(sb_url, sb_key, "lead_feedback", SELECT_COLS)

    rows = []
    for r in raw:
        rows.append({
            "id": r.get("id"),
            "created_at": r.get("created_at"),
            "sale_email": r.get("sale_email"),
            "sale_name": r.get("sale_name"),
            "phone": r.get("phone"),
            "phone9": r.get("phone9"),
            "uid": r.get("uid"),
            "customer_name": r.get("customer_name"),
            "lead_source": r.get("lead_source"),
            "lead_channel": r.get("lead_channel"),
            "lead_id": r.get("lead_id"),
            "sale_note": r.get("sale_note"),
            "sale_images": _json_text(r.get("sale_images")),
            "status": r.get("status"),
            "mkt_note": r.get("mkt_note"),
            "mkt_images": _json_text(r.get("mkt_images")),
            "mkt_by": r.get("mkt_by"),
            "mkt_at": r.get("mkt_at"),
            "synced_at": now,
        })

    bq = bigquery.Client(project=BQ_PROJECT)

    if not rows:
        # Không còn dòng nào (hiếm) -> xoá sạch BQ cho khớp.
        bq.query(f"DELETE FROM `{BQ_TABLE}` WHERE TRUE").result()
        logger.info("Synced 0 rows (truncated) to %s", BQ_TABLE)
        return ({"ok": True, "rows": 0, "synced_at": now}, 200)

    job_config = bigquery.LoadJobConfig(
        schema=SCHEMA,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    bq.load_table_from_json(rows, BQ_TABLE, job_config=job_config).result()

    logger.info("Synced %d rows to %s", len(rows), BQ_TABLE)
    return ({"ok": True, "rows": len(rows), "synced_at": now}, 200)
