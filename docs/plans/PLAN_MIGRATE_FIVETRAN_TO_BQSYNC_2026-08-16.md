# PLAN — Migrate Fivetran → self-hosted Supabase→BigQuery sync

**Ngày**: 2026-08-16 · **Status**: **CHỜ DUYỆT** (chưa code)
**Lý do**: Fivetran hết trial 14 ngày (còn ~8 ngày). Sau trial gói Standard ~$50+/tháng cho đúng việc đang làm. Tự host = $0.
**Deadline mềm**: xong cutover trước khi Fivetran trial hết (≈ 24/8) để không đứt sync GMV → BigQuery.

---

## 1. Mục tiêu

Thay Fivetran bằng pipeline tự host, giữ **nguyên trạng** dữ liệu GMV chảy từ Supabase (Postgres) → BigQuery, để mọi downstream (view + tính lương) không phải sửa. Tần suất tiệm cận realtime (1h) mà **$0** và **không tăng tải DB app**.

## 2. Ground truth — điều tra thực tế 16/8 (KHÔNG cần điều tra lại)

### Nguồn (Supabase prod `jozcvbbypwvzaefteoxn`)
3 bảng Fivetran đang sync (`palfish_gmv` connection, ID `pushiness_atone`):

| Bảng | Rows | Size | PK | Cursor `updated_at` | Đổi/24h | Tính chất |
|---|---|---|---|---|---|---|
| `so_doanh_thu` | 16.751 | 7.8 MB | `id` uuid | NOT NULL, 0 null ✅ | 12 | Sổ DT chính |
| `nhan_su_sale` | 156 | 176 KB | `id` uuid | 0 null ✅ | 0 | Gần như tĩnh |
| `so_doanh_thu_backup_nguon_20260812` | 16.695 | 5.2 MB | `id` (nullable) | — | 0 | **Snapshot tĩnh 1 lần** |

- **Tổng ~13 MB**, thay đổi thực tế 0–15 dòng mỗi lần sync.
- Kết nối Fivetran đang dùng: host `aws-1-ap-southeast-2.pooler.supabase.com:5432`, db `postgres`, user **`bq_readonly.jozcvbbypwvzaefteoxn`** (role read-only riêng, qua pooler), method `QUERY_BASED_WITH_DELETES`.

### Đích (BigQuery)
- Project **`pf-salary`**, dataset **`palfish_gmv_public`** (location `asia-southeast1`).
- Fivetran thêm 3 cột hệ thống vào **cả 3 bảng**: `_fivetran_deleted`, `_fivetran_synced`, `ctid_fivetran_id`.

### ⚠️ Downstream phụ thuộc (điểm dễ vỡ nhất)
Trong `palfish_gmv_public` có 3 VIEW nối chuỗi, đọc thẳng bảng:
```
so_doanh_thu
  └─ C_v_so_doanh_thu_dedup        ← LỌC COALESCE(_fivetran_deleted, FALSE) = FALSE
       └─ C_v_so_doanh_thu_nhom_loai
            └─ C_v_gmv_thang_truoc_theo_nhan_vien
```
- **View `C_v_so_doanh_thu_dedup` dùng cột `_fivetran_deleted`.** Nếu pipeline mới tạo bảng thiếu cột này → view vỡ.
- Dataset `payroll` (pipeline tính lương) **không** tham chiếu trực tiếp `palfish_gmv_public` (đã grep INFORMATION_SCHEMA.VIEWS = rỗng) → blast radius gói trong 3 view trên. Nhưng **ai/đâu đọc 3 view đó** (Looker Studio / Metabase / app) thì BQ không thấy được → xem "Câu hỏi mở".

## 3. Nền tảng đã chọn: Cloud Function (2nd gen) + Cloud Scheduler

| Thành phần | Lựa chọn | Lý do |
|---|---|---|
| Compute | **Cloud Function 2nd gen**, region `asia-southeast1` (cạnh BQ) | Serverless, $0, cùng vùng BQ giảm egress |
| Trigger | **Cloud Scheduler** (cron `0 */6 * * *` = mỗi 6 giờ, giữ như Fivetran), gọi function qua OIDC | 3 job free, hẹn giờ chính xác. Đổi 1h/15' chỉ là sửa 1 dòng cron |
| BQ auth | **Runtime service account** của function (IAM) — KHÔNG export key JSON | An toàn hơn: không có key dài hạn trôi nổi |
| Supabase secret | Connection string trong **Secret Manager**, mount vào function | Không hard-code mật khẩu |
| Kết nối nguồn | **Direct Postgres** qua `bq_readonly` pooler (dùng lại y hệt Fivetran) | Không cần phân trang như REST; role read-only tách khỏi app |

**Vì sao không phải phương án khác:**
- *GitHub Actions*: cũng $0 nhưng phải export **service-account key JSON** làm secret (key dài hạn = rủi ro bảo mật) + cron GitHub hay trễ 5–15'. Loại (giữ làm fallback).
- *Render cron*: $1/tháng + chạy chung instance app → tăng tải hạ tầng app. Loại.
- *Supabase pg_cron/Edge Function*: pg_cron chạy tải **trực tiếp lên DB app**. Loại.
- *BigQuery Data Transfer*: không có connector Postgres. Loại.

## 4. Chiến lược đồng bộ: FULL RELOAD (không incremental)

Với ~13 MB, mỗi bảng **nạp lại toàn bộ** mỗi lần chạy bằng BQ **load job `WRITE_TRUNCATE`** (atomic, thay nguyên bảng).

**Vì sao full reload thay vì incremental (dù cursor tin cậy):**
- **Triệt để**: miễn nhiễm với xoá cứng (hard-delete) và sửa cũ — thứ mà incremental theo `updated_at` dễ bỏ sót. Fivetran phải dùng `QUERY_BASED_WITH_DELETES` chính vì lý do này; full reload đạt cùng độ đúng mà đơn giản hơn.
- **Không lỗi con**: không cần bảng watermark, không cần state, không có edge case "sync trùng giờ updated_at".
- **$0**: BQ **batch load job miễn phí** (khác streaming insert có phí). Nạp 13 MB/giờ = không đáng kể.
- Bảng backup tĩnh → **nạp 1 lần rồi loại khỏi lịch** (không sync hàng giờ).

**Giữ tương thích downstream (cutover không sửa view):** bảng đích giữ **đúng tên cột cũ** + phát sinh 2 cột hệ thống để 3 view chạy y nguyên:
- `_fivetran_deleted` = `FALSE` (full reload: dòng xoá ở nguồn tự biến mất → nghĩa được bảo toàn vì view lọc `COALESCE(...,FALSE)=FALSE`).
- `_fivetran_synced` = thời điểm sync (`CURRENT_TIMESTAMP`).
- `ctid_fivetran_id`: bỏ (không view nào dùng — đã kiểm).

## 5. Ảnh hưởng hạ tầng DB app (giải toả lo ngại "nghẽn / tăng tải")

- Đọc qua role **`bq_readonly`** riêng, **không** phải connection pool của app.
- Mỗi giờ: 1 lần `SELECT *` bảng 8 MB (seq scan ~50–200ms) + 2 bảng nhỏ. `SELECT` chỉ lấy MVCC snapshot → **không khoá ghi**, không chặn app.
- So với tải thường ngày của app: gần như vô hình. Full reload 13 MB/giờ ≪ mọi ngưỡng.
- Có thể chỉ đọc **replica pooler** (session mode 5432) như Fivetran đang làm → tách hẳn khỏi đường ghi.

## 6. Chi phí — $0/tháng (biên rất rộng)

| Resource | Free tier/tháng | Dùng thực (1h sync) | % free |
|---|---|---|---|
| Cloud Functions invocations | 2.000.000 | 120 (6h) | 0,006% |
| Cloud Functions GB-giây | 400.000 | ~300 (6h) | 0,08% |
| Cloud Scheduler jobs | 3 | 1 | — |
| BigQuery load job | Miễn phí | 120 job | $0 |
| BigQuery storage | 10 GB | ~13 MB | 0,1% |
| Secret Manager | 6 secret + 10k access free | 1 secret, 120 access | ~1% |
| Egress Supabase→GCP | — | ~13 MB×120 ≈ 1,5 GB | Supabase Pro không tính egress API |

> Chạy **6h** (giữ như Fivetran). Đổi 1h/15' vẫn $0 — chỉ sửa cron.

**Phải scale hàng nghìn lần mới chạm billing.** So với Fivetran Standard sau trial ~**$50+/tháng**.

## 7. Kế hoạch triển khai theo phase

### Phase 0 — Chuẩn bị hạ tầng GCP (thủ công, ~30')
- [ ] 0.1 Chốt project host (`pf-salary` — nơi BQ) + bật API: `cloudfunctions`, `cloudscheduler`, `secretmanager`, `run`, `cloudbuild`.
- [ ] 0.2 Tạo/dùng lại **service account** `gmv-bq-sync@<project>.iam` — cấp `roles/bigquery.dataEditor` + `roles/bigquery.jobUser` trên project BQ.
- [ ] 0.3 Lấy/đặt lại mật khẩu `bq_readonly` trong Supabase → lưu connection string vào Secret Manager `supabase-gmv-readonly-dsn`. Cấp SA quyền `secretAccessor`.
- [ ] 0.4 Xác nhận `bq_readonly` có `SELECT` trên 3 bảng (Fivetran đang dùng → chắc chắn có).

### Phase 1 — Viết script sync (code, ~2–3h)
- [ ] 1.1 Repo/thư mục `bq-sync/` (quyết định vị trí — xem §10): `main.py`, `requirements.txt`, `config.py`, `README.md`.
- [ ] 1.2 `main.py` (skeleton §8): đọc DSN từ Secret Manager env → với mỗi bảng: `SELECT *` → thêm `_fivetran_deleted=False`, `_fivetran_synced=now` → BQ load `WRITE_TRUNCATE` vào **dataset shadow** trước.
- [ ] 1.3 Type mapping Postgres→BQ: uuid→STRING, numeric→NUMERIC, bigint→INT64, timestamptz→TIMESTAMP, date→DATE, time→TIME, boolean→BOOL, text/varchar→STRING. Dùng **explicit schema** (không autodetect) để khớp bảng Fivetran.
- [ ] 1.4 Idempotent + log rõ (số dòng/bảng/thời gian). Fail 1 bảng không làm hỏng bảng khác; trả HTTP 500 nếu có lỗi để Scheduler retry.
- [ ] 1.5 Chạy local (`functions-framework`) trỏ shadow dataset → kiểm smoke.

### Phase 2 — Shadow + đối chiếu parity (~1h, CHẠY SONG SONG Fivetran)
- [ ] 2.1 Deploy function + tạo Scheduler.
- [ ] 2.2 Đổ vào dataset **`palfish_gmv_shadow`** (KHÔNG đụng `palfish_gmv_public` để không đua ghi với Fivetran).
- [ ] 2.3 Đối chiếu shadow vs Fivetran sau vài lần sync: `COUNT(*)`, `SUM(so_tien_vnd)`, `MAX(updated_at)`, checksum theo `id`. Phải khớp.
- [ ] 2.4 Chạy thử 3 view trên shadow (tạo bản copy view trỏ shadow) → khớp kết quả.

### Phase 3 — Cutover (điểm cắt, ~15')
- [ ] 3.1 **Tắt Fivetran** connection (Disable — chưa xoá) để ngừng ghi `palfish_gmv_public`.
- [ ] 3.2 Đổi target function: `palfish_gmv_shadow` → **`palfish_gmv_public`** (đúng dataset/bảng cũ, schema y hệt gồm `_fivetran_deleted/_synced`).
- [ ] 3.3 Chạy 1 lần thủ công → verify 3 view (`C_v_so_doanh_thu_dedup`…) trả đúng.
- [ ] 3.4 Nạp bảng backup tĩnh 1 lần → loại khỏi lịch sync định kỳ.

### Phase 4 — Soak + gỡ Fivetran (2–3 ngày)
- [ ] 4.1 Theo dõi 2–3 ngày: Cloud Logging không lỗi, view + báo cáo GMV ổn.
- [ ] 4.2 Alert: Cloud Monitoring gửi mail nếu function fail (thay "Connection activity alert" của Fivetran).
- [ ] 4.3 Sau soak: **xoá** Fivetran connection + destination (huỷ trước khi trial charge). Xoá dataset `fivetran_metadata_*`, `fivetran_*_staging`, `palfish_gmv_shadow`.

### Phase 5 — Dọn dẹp (tuỳ chọn, sau khi ổn định)
- [ ] 5.1 (Optional) Bỏ cột `_fivetran_*`: sửa **1 view** `C_v_so_doanh_thu_dedup` (bỏ filter `_fivetran_deleted`) → pipeline thôi phát cột rác. Làm CÓ CHỦ ĐÍCH, sau khi mọi thứ đã chạy.
- [ ] 5.2 Cập nhật `MODULES.md` + doc: nguồn BQ giờ do pipeline nội bộ đẩy.

## 8. Skeleton script (Phase 1 — để review trước)

```python
# main.py — Cloud Function 2nd gen, HTTP trigger, chạy bởi Cloud Scheduler
import os, datetime, functions_framework, psycopg2
from google.cloud import bigquery

BQ_PROJECT = os.environ["BQ_PROJECT"]          # pf-salary
BQ_DATASET = os.environ["BQ_DATASET"]          # palfish_gmv_shadow (Phase 2) → palfish_gmv_public (Phase 3)
PG_DSN     = os.environ["SUPABASE_DSN"]         # từ Secret Manager

# Bảng sync định kỳ (backup tĩnh KHÔNG nằm đây — nạp 1 lần riêng)
TABLES = ["so_doanh_thu", "nhan_su_sale"]

# Schema BQ explicit, khớp bảng Fivetran (rút gọn — điền đủ khi code)
SCHEMAS = {
  "so_doanh_thu": [
    bigquery.SchemaField("id", "STRING"),
    bigquery.SchemaField("ngay_tien_ve", "DATE"),
    bigquery.SchemaField("so_tien_vnd", "INT64"),
    bigquery.SchemaField("gmv_rmb", "NUMERIC"),
    # ... đủ 34 cột nghiệp vụ ...
    bigquery.SchemaField("_fivetran_deleted", "BOOL"),
    bigquery.SchemaField("_fivetran_synced", "TIMESTAMP"),
  ],
  # "nhan_su_sale": [...],
}

@functions_framework.http
def sync(request):
    bq = bigquery.Client(project=BQ_PROJECT)
    now = datetime.datetime.now(datetime.timezone.utc)
    results = {}
    errors = []
    with psycopg2.connect(PG_DSN) as conn:
        for tbl in TABLES:
            try:
                rows = fetch_rows(conn, tbl, now)         # SELECT * + gắn _fivetran_deleted/_synced
                load_truncate(bq, tbl, rows, SCHEMAS[tbl]) # WRITE_TRUNCATE (atomic, free)
                results[tbl] = len(rows)
            except Exception as e:
                errors.append(f"{tbl}: {e}")
    if errors:
        return ({"ok": False, "errors": errors, "loaded": results}, 500)  # Scheduler retry
    return ({"ok": True, "loaded": results}, 200)

def fetch_rows(conn, tbl, now):
    with conn.cursor() as cur:
        cur.execute(f'SELECT * FROM public."{tbl}"')      # 8 MB seq scan, read-only snapshot
        cols = [d[0] for d in cur.description]
        out = []
        for r in cur.fetchall():
            d = dict(zip(cols, r))
            d["_fivetran_deleted"] = False
            d["_fivetran_synced"]  = now.isoformat()
            out.append(d)
        return out

def load_truncate(bq, tbl, rows, schema):
    ref = f"{BQ_PROJECT}.{BQ_DATASET}.{tbl}"
    job = bq.load_table_from_json(
        rows, ref,
        job_config=bigquery.LoadJobConfig(
            schema=schema,
            write_disposition="WRITE_TRUNCATE",           # thay nguyên bảng, atomic
        ),
    )
    job.result()                                          # chờ xong, raise nếu lỗi
```
```
# requirements.txt
functions-framework==3.*
google-cloud-bigquery==3.*
psycopg2-binary==2.*
```

## 9. Rollback

- **Bất kỳ phase nào trước 4.3**: Fivetran vẫn còn (chỉ Disable ở 3.1) → bật lại Fivetran + trỏ function về shadow. Zero mất mát.
- Rào an toàn: **KHÔNG xoá Fivetran cho tới hết soak** (4.3). Trước đó luôn có đường lùi.
- Rủi ro thời gian: nếu chưa kịp trước khi trial charge → có thể Disable Fivetran (ngừng usage) trong lúc hoàn tất pipeline.

## 10. Quyết định — ĐÃ CHỐT (anh Minh 16/8)

1. **Nền tảng**: ✅ Cloud Function 2nd gen + Cloud Scheduler (no-key, $0).
2. **Project host**: ✅ **`pf-salary`** (cùng project BQ → không IAM chéo).
3. **Tần suất**: ✅ **6 giờ** (cron `0 */6 * * *`, giữ như Fivetran). Nâng 1h/15' sau chỉ sửa cron, vẫn $0.
4. **Vị trí code**: ✅ **`bq-sync/`** trong repo GMV (versioned chung).
5. **Cutover schema**: ✅ **Giữ nguyên `_fivetran_*`** (zero-risk) → dọn có chủ đích ở Phase 5.

## 11. Câu hỏi mở (không chặn, cần trước Phase 3)

- **Ai/đâu đọc dataset `palfish_gmv_public` + 3 view?** (Looker Studio, Metabase, app tính lương thủ công?). Cutover giữ nguyên tên nên dù không biết consumer vẫn an toàn — nhưng nên biết để verify sau cutover.
- Bảng `so_doanh_thu_backup_nguon_20260812` có thật sự cần trên BQ không, hay là backup tạm ngày 12/8 → có thể **bỏ hẳn** khỏi sync?
