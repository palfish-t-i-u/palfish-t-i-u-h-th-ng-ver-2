# feedback-to-bq — Cloud Function: Supabase → BigQuery

Sync bảng `lead_feedback` (Supabase prod, DB app) lên `pf-feedback-dashboard.lead_quality.lead_feedback` (BQ).
Chiều NGƯỢC với `lead-sync` (BQ→Supabase). Để anh Hiếu join feedback của sale với
**pancake + CRM Note + CRM Phone record + dữ liệu quảng cáo** cho việc đối soát chất lượng lead.

## Pipeline

```
App GMV (sale/MKT) → Supabase lead_feedback  (DB app, nguồn sự thật)
  ↓ Cloud Function này — WRITE_TRUNCATE full-load, mỗi 1h
BQ pf-feedback-dashboard.lead_quality.lead_feedback  (anh Hiếu join)
```

**Full-load mỗi lần** (không incremental): bảng nhỏ, và phải phản ánh đúng cả **sửa** (MKT nhận xét
→ đổi status/mkt_note) lẫn **xoá** (tính năng xoá feedback). Incremental sẽ bỏ sót 2 việc này.

## Schema BQ (snake_case, khớp Supabase)

`id, created_at, sale_email, sale_name, phone, phone9, uid, customer_name, lead_source,
lead_channel, lead_id, sale_note, sale_images(JSON text), status, mkt_note, mkt_images(JSON text),
mkt_by, mkt_at, synced_at`

Khoá join cho anh Hiếu: `phone` / `phone9` (CRM Phone record, pancake) · `uid` ·
`lead_source` / `lead_channel` (dữ liệu quảng cáo). Ảnh lưu dạng JSON text (chỉ URL, không kéo blob).

## GCP Resources

| Resource | Tên |
|----------|-----|
| Cloud Function (gen2) | `feedback-to-bq` (project `pf-salary`, region `asia-southeast1`) — **ACTIVE 8/10/2026** |
| URL | `https://feedback-to-bq-kpirpqfb3a-as.a.run.app` |
| Cloud Scheduler | `feedback-to-bq-hourly` — cron `35 * * * *` (lệch phút với lead-sync :15) — **ENABLED** |
| Service Account | `palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com` (dùng lại của lead-sync) |
| Secret Manager | `supabase-gmv-url` + `supabase-gmv-service-key` (dùng lại) |
| BQ đích | `pf-feedback-dashboard.lead_quality.lead_feedback` |
| Entry point | `sync` (hàm trong `main.py`) |

SA đã được cấp (8/10/2026): `roles/bigquery.jobUser` + `roles/bigquery.dataEditor` trên project
`pf-feedback-dashboard` (mức PROJECT vì dataset-level IAM đang "requires allowlisting") +
`roles/run.invoker` trên Cloud Run service `feedback-to-bq` (cho Scheduler gọi).

## Deploy (lệnh THỰC TẾ đã chạy — PowerShell/Windows)

```bash
# 1) Cấp quyền BQ cho SA (mức project vì dataset-level cần allowlisting)
gcloud projects add-iam-policy-binding pf-feedback-dashboard \
  --member="serviceAccount:palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com" \
  --role="roles/bigquery.jobUser" --condition=None
gcloud projects add-iam-policy-binding pf-feedback-dashboard \
  --member="serviceAccount:palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataEditor" --condition=None

# 2) Deploy function (từ thư mục này). LƯU Ý: --entry-point=sync (hàm tên sync, KHÁC tên deploy).
#    Trên PowerShell phải BỌC NHÁY giá trị --set-secrets vì dấu phẩy bị cắt thành mảng.
gcloud functions deploy feedback-to-bq \
  --gen2 --region=asia-southeast1 --runtime=python312 --entry-point=sync --trigger-http \
  --no-allow-unauthenticated \
  --service-account=palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com \
  --set-secrets "SUPABASE_URL=supabase-gmv-url:latest,SUPABASE_SERVICE_KEY=supabase-gmv-service-key:latest" \
  --memory=512Mi --source=. --project=pf-salary

# 3) Cho SA quyền gọi function (gen2 = Cloud Run) + tạo Scheduler mỗi giờ (OIDC)
gcloud run services add-iam-policy-binding feedback-to-bq --region=asia-southeast1 \
  --member="serviceAccount:palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com" \
  --role="roles/run.invoker" --project=pf-salary
gcloud scheduler jobs create http feedback-to-bq-hourly \
  --location=asia-southeast1 --schedule="35 * * * *" \
  --uri="https://feedback-to-bq-kpirpqfb3a-as.a.run.app" --http-method=GET \
  --oidc-service-account-email=palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com \
  --oidc-token-audience="https://feedback-to-bq-kpirpqfb3a-as.a.run.app" --project=pf-salary
```

## Trigger thủ công

```bash
gcloud functions call feedback-to-bq --region=asia-southeast1 --project=pf-salary
```

## Liên quan
- Mẫu chiều ngược: `bq-sync/lead-sync/` (BQ→Supabase)
- Bảng nguồn: Supabase prod `lead_feedback` (migration `backend/migrations/2026-10-07-lead-feedback.sql`)
- Lần load đầu (2 dòng) đã làm tay bằng `bq load` ngày 8/10/2026 trước khi dựng function.
