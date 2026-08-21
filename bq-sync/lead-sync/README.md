# lead-sync — Cloud Function: BigQuery → Supabase

Sync bảng `app_lookup.lead_phone_lookup` (BQ) xuống `leads_lookup` (Supabase prod) mỗi giờ.
Là tầng 3 trong pipeline 4 tầng của tính năng đối soát GMV-Lead.

## Pipeline tổng thể

```
Chatpage (GSheet)
  ↓ Hiếu ETL — 7h sáng/ngày
crm_leads.leads_all  (BQ, Hiếu sở hữu)
  ↓ BQ scheduled query "lead_phone_lookup refresh" — mỗi 1h
app_lookup.lead_phone_lookup  (BQ, ~68k dòng)
  ↓ Cloud Function này — mỗi 1h (phút :15)
Supabase leads_lookup  (app đọc, tính năng tra cứu lead trên form tạo đơn)
```

## GCP Resources (project `pf-salary`, region `asia-southeast1`)

| Resource | Tên |
|----------|-----|
| Cloud Function (gen2) | `lead-sync` |
| Cloud Scheduler | `lead-sync-hourly` — cron `15 * * * *` |
| Service Account | `palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com` |
| Secret Manager | `supabase-gmv-url` + `supabase-gmv-service-key` |

SA có: `bigquery.dataViewer` trên dataset `app_lookup`, `bigquery.jobUser` trên project `pf-salary`.

## Deploy

```bash
gcloud functions deploy lead-sync \
  --gen2 \
  --region=asia-southeast1 \
  --runtime=python312 \
  --trigger-http \
  --service-account=palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com \
  --set-secrets=SUPABASE_URL=supabase-gmv-url:latest,SUPABASE_SERVICE_KEY=supabase-gmv-service-key:latest \
  --memory=512Mi \
  --source=.
```

Chạy từ thư mục `bq-sync/lead-sync/`.

## Trigger thủ công (khi cần sync gấp)

```bash
gcloud functions call lead-sync --region=asia-southeast1
```

## Bẫy đã gặp

| Bẫy | Fix |
|-----|-----|
| BQ 403 "jobs.create" — SA chạy job trên project Hiếu | `JOB_PROJECT = "pf-salary"` + fully-qualified table name |
| OOM với supabase SDK | Dùng `urllib.request` thay SDK — tiết kiệm ~200MB RAM |
| Supabase legacy JWT key disabled | Dùng key `sb_secret_*` mới, không dùng `eyJ...` |
| PowerShell `\r\n` inject vào secret | `.strip()` trên `os.environ` reads |
| `lead_id` là bytes từ BQ MD5 | `.hex()` trước khi serialize JSON |

## Liên quan

- BQ scheduled query: `daily-report-smai-to-openclaw` → Scheduled queries → `lead_phone_lookup refresh`
- Spec đầy đủ: `docs/specs/huong-dan-IT-doi-chieu-SDT-lead.md`
- Plan pipeline: `docs/plans/PLAN_LEAD_SYNC_AUTO_2026-08-19.md`
- App gate code: `frontend/src/components/payment-request/CreatePaymentRequestModal.tsx:128`
