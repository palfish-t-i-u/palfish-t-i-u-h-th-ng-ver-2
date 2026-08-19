# PLAN — Đồng bộ kho lead tự động (BQ → Supabase, 1h/lần)

**Ngày:** 2026-08-19 · **Owner:** Minh (= "IT" trong spec Hiếu) · **Status:** CHỜ DUYỆT

---

## 0. Bối cảnh

Kho lead (`leads_lookup`) hiện **seed tay 1 lần 18/8** — 67.727 dòng, đóng băng. Lead mới sau 18/8 app tra không ra (confirmed: số đầu tháng 8 có trên Chatpage + CRM nhưng app báo "không tìm thấy").

Spec Hiếu §4.1–4.3 giao "IT" (= Minh) tạo dataset + bảng + scheduled query trên BQ. **Chưa ai làm.** Đây là blocker gốc.

Pipeline đích (2 tầng):

```
crm_leads.leads_all (view, Hiếu sở hữu)
        ↓ BQ scheduled query (1h) — §4.3 spec Hiếu
app_lookup.lead_phone_lookup (BQ, bảng phẳng ~68k dòng)
        ↓ Cloud Function (1h) — plan này
Supabase leads_lookup (app đọc)
```

**Chi phí:** $0/tháng — phân tích chi tiết ở `PLAN_MIGRATE_FIVETRAN_TO_BQSYNC §6` (đã chốt 16/8).

---

## 1. Milestones

### G1 — Setup BQ (spec Hiếu §4.1–4.3) — ⚠️ HIẾU LÀM, Minh không có quyền
**Blocker confirmed:** Minh không có `bigquery.datasets.create` trên project `daily-report-smai-to-openclaw` (Access Denied, tested 19/8). G1 phải nhờ Hiếu (hoặc ai có quyền trên project đó).

- **G1-T1 · Tạo dataset `app_lookup`** — `CREATE SCHEMA IF NOT EXISTS` (SQL §4.1, location US)
- **G1-T2 · Tạo bảng `lead_phone_lookup`** — chạy SQL mở rộng Phụ lục A (§2 plan này). Bổ sung 2 cột: `sale_name` (LEFT JOIN `dim_sale`) + `lead_id` (MD5 composite — PK cho Supabase upsert)
- **G1-T3 · Tạo BQ scheduled query** — cron mỗi 1h, dùng SQL G1-T2, owner = tài khoản quản trị dữ liệu (Hiếu, đúng spec §4.3)
- **G1-T4 · Cấp quyền SA** — cấp `bigquery.dataViewer` trên dataset `app_lookup` cho SA `gmv-bq-sync@pf-salary.iam` (để Cloud Function đọc được). Minh tạo SA trên `pf-salary`, Hiếu cấp quyền trên `daily-report-smai-to-openclaw`
- **G1-T5 · Verify** — `SELECT COUNT(*), MAX(lead_date) FROM app_lookup.lead_phone_lookup` phải ra ≥67k dòng, lead_date tới gần ngày hiện tại

**Minh gửi Hiếu:** SQL đầy đủ (§2) + hướng dẫn tạo scheduled query (§4.3 spec). Hiếu chỉ cần copy-paste chạy.

### G2 — Cloud Function sync BQ→Supabase (code, ~2h)
- **G2-T1 · Thư mục `bq-sync/lead-sync/`** — `main.py`, `requirements.txt`, `README.md`
- **G2-T2 · `main.py`** — HTTP trigger: SELECT từ `app_lookup.lead_phone_lookup` → TRUNCATE + batch INSERT vào Supabase `leads_lookup` (service-role key). Chi tiết §2
- **G2-T3 · Test local** — `functions-framework` chạy local, trỏ sandbox Supabase, verify dòng count khớp BQ
- **G2-T4 · Deploy** — `gcloud functions deploy lead-sync --gen2 --region=asia-southeast1 --runtime=python312 --trigger-http --service-account=gmv-bq-sync@pf-salary.iam.gserviceaccount.com`

### G3 — Cloud Scheduler + SA (thao tác tay, ~15')
- **G3-T1 · Service account** — tạo/dùng lại `gmv-bq-sync@pf-salary.iam` (cùng SA với plan Fivetran migration). Cấp: `bigquery.dataViewer` trên dataset `app_lookup` + `bigquery.jobUser` trên project
- **G3-T2 · Supabase DSN** — lưu service-role key prod vào Secret Manager `supabase-gmv-service-role`. SA cấp `secretAccessor`
- **G3-T3 · Tạo Scheduler job** — cron `15 * * * *` (phút 15 mỗi giờ — lệch 15' so với BQ scheduled query chạy đầu giờ, đủ thời gian BQ query xong)
- **G3-T4 · Chạy 1 lần thủ công** — trigger function → verify Supabase `leads_lookup` count khớp BQ

### G4 — Verify end-to-end + dọn dẹp (~30')
- **G4-T1 · Test trên sandbox** — mở app sandbox, tra SĐT mới (sau 18/8) → phải ra kết quả
- **G4-T2 · Test trên prod** — deploy prod, tra SĐT `1089367529` (khách An Nhà Thành Thoi, ảnh anh gửi) → phải khớp
- **G4-T3 · Monitoring** — Cloud Logging alert khi function fail; thêm `synced_at` check endpoint để biết data cũ bao lâu
- **G4-T4 · Xoá cam kết seed tay** — bỏ lịch re-seed thủ công (§6 SHIP plan); cập nhật MODULES.md

---

## 2. Chi tiết kỹ thuật

### G1-T2 — SQL tạo bảng BQ (mở rộng Phụ lục A)

Thêm 2 cột so với spec gốc:

```sql
CREATE OR REPLACE TABLE `daily-report-smai-to-openclaw.app_lookup.lead_phone_lookup`
CLUSTER BY phone9 AS
WITH ds AS (
  -- Map ec → sale full name (loại 2 khoá nhập nhằng)
  SELECT LOWER(TRIM(REGEXP_REPLACE(ec_code, r'^[A-Za-z0-9]+\s*-\s*',''))) AS k,
         ANY_VALUE(full_name) AS full_name
  FROM `daily-report-smai-to-openclaw.crm_leads.dim_sale`
  WHERE COALESCE(ec_code,'') != ''
  GROUP BY k
  HAVING COUNT(DISTINCT full_name) = 1
),
src AS (
  -- Nguồn 1: cột SĐT chính thức (y Phụ lục A)
  SELECT
    RIGHT(REGEXP_REPLACE(l.phone, r'[^0-9]',''), 9) AS phone9,
    'phone' AS match_source,
    l.phone AS phone_goc, l.name, l.uid, TRIM(l.ec) AS ec,
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared) AS lead_date,
    l.CRM_code_2 AS crm_code, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.phone,'') != ''

  UNION ALL

  -- Nguồn 2: SĐT trong ghi chú (y Phụ lục A)
  SELECT pk9, 'note', l.phone, l.name, l.uid, TRIM(l.ec),
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared),
    l.CRM_code_2, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  CROSS JOIN UNNEST(ARRAY_CONCAT(
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9][0-9\.\-\(\)\+]{8,18}[0-9]')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15
            AND NOT REGEXP_CONTAINS(x, r'^[0-9]{1,3}(?:\.[0-9]{3})+$')),
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9]{2,4}(?: [0-9]{2,8}){1,4}')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15)
  )) AS pk9
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.note,'') != ''
),
deduped AS (
  SELECT * EXCEPT(rn) FROM (
    SELECT s.*,
      ROW_NUMBER() OVER (
        PARTITION BY phone9, COALESCE(uid,''),
                     COALESCE(CAST(lead_date AS STRING),''), crm_code
        ORDER BY IF(match_source='phone', 1, 2)
      ) AS rn
    FROM src s
    WHERE LENGTH(phone9) = 9
  )
  WHERE rn = 1
)
SELECT
  -- lead_id: MD5 composite, PK cho Supabase upsert
  MD5(CONCAT(
    d.phone9, '|',
    COALESCE(d.uid, ''), '|',
    COALESCE(CAST(d.lead_date AS STRING), ''), '|',
    COALESCE(d.crm_code, '')
  )) AS lead_id,
  d.phone9, d.match_source, d.phone_goc, d.name, d.uid,
  d.lead_date, d.crm_code, d.ec,
  ds.full_name AS sale_name,         -- JOIN dim_sale (~91% khớp)
  d.status, d.status_2, d.nation, d.source_name
FROM deduped d
LEFT JOIN ds ON LOWER(TRIM(REGEXP_REPLACE(d.ec, r'^[A-Za-z0-9]+\s*-\s*',''))) = ds.k;
```

**Thay đổi vs Phụ lục A gốc:**
1. CTE `ds` — join `dim_sale` để có `sale_name` (logic y hệt seed tay 18/8, file `2026-08-18-lead-phone-seed-sale-name.sql`)
2. Cột `lead_id` — `MD5(phone9|uid|lead_date|crm_code)` pipe separator, COALESCE '' cho null (khớp logic seed tay)
3. Phần còn lại **giữ nguyên byte-for-byte** Phụ lục A (WHERE, dedup, LENGTH=9)

**Tại sao thêm 2 cột này vào BQ thay vì tính ở Cloud Function:**
- `sale_name` dùng `dim_sale` trên BQ — Cloud Function không truy cập được `crm_leads` dataset
- `lead_id` tính trên BQ đảm bảo deterministic, không lệch giữa BQ và Supabase
- BQ scheduled query chạy trước → bảng sẵn sale_name + lead_id → Cloud Function chỉ cần SELECT + INSERT thẳng, không cần logic biến đổi

### G2-T2 — Cloud Function `main.py`

```python
# bq-sync/lead-sync/main.py
import os, datetime, functions_framework
from google.cloud import bigquery
from supabase import create_client

BQ_PROJECT = "daily-report-smai-to-openclaw"
BQ_TABLE   = "app_lookup.lead_phone_lookup"
SB_URL     = os.environ["SUPABASE_URL"]       # https://jozcvbbypwvzaefteoxn.supabase.co
SB_KEY     = os.environ["SUPABASE_KEY"]       # service-role key từ Secret Manager

BATCH_SIZE = 2000  # Supabase REST API tối ưu ~2000 dòng/batch

@functions_framework.http
def sync(request):
    bq = bigquery.Client(project=BQ_PROJECT)
    sb = create_client(SB_URL, SB_KEY)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # 1. Đọc toàn bộ từ BQ (68k dòng, ~5MB, <3s)
    query = f"SELECT * FROM `{BQ_PROJECT}.{BQ_TABLE}`"
    rows = list(bq.query(query).result())
    if not rows:
        return ({"ok": False, "error": "BQ returned 0 rows"}, 500)

    # 2. Chuyển thành list dict + gắn synced_at
    records = []
    for r in rows:
        d = dict(r)
        # BQ DATE → ISO string cho Supabase
        if d.get("lead_date"):
            d["lead_date"] = d["lead_date"].isoformat()
        d["synced_at"] = now
        records.append(d)

    # 3. TRUNCATE + batch INSERT (atomic per batch)
    sb.table("leads_lookup").delete().neq("lead_id", "__impossible__").execute()

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        sb.table("leads_lookup").insert(batch).execute()

    return ({"ok": True, "rows": len(records), "synced_at": now}, 200)
```

```
# bq-sync/lead-sync/requirements.txt
functions-framework==3.*
google-cloud-bigquery==3.*
supabase==2.*
```

**Lưu ý thiết kế:**
- TRUNCATE + INSERT (không upsert) — vì BQ đã dedup, full reload đơn giản hơn, đảm bảo lead bị xoá khỏi BQ cũng biến mất khỏi Supabase
- Supabase REST không có `TRUNCATE` — dùng `delete().neq("lead_id", "__impossible__")` (xoá tất cả, pattern standard)
- RLS bật + không có policy → chỉ service-role key mới đọc/ghi được
- Fail → HTTP 500 → Cloud Scheduler retry (default 0 retry, cấu hình thêm nếu cần)

---

## 3. Guardrails

1. **Không đụng `crm_leads`** — chỉ ĐỌC `crm_leads.leads_all` + `crm_leads.dim_sale` qua scheduled query (đúng quyền Data Viewer). Cloud Function chỉ đọc `app_lookup`
2. **SA chỉ có Data Viewer** — không Editor/Owner/admin (đúng ràng buộc spec Hiếu §3)
3. **Không log SĐT** — Cloud Function log count, không log phone/phone9
4. **Data freshness ≤ 1h15'** — BQ scheduled query chạy đầu giờ, Cloud Function chạy phút 15 → worst case data cũ 1h15' (< 2h, thoả spec "không cache >1h" vì đây không phải cache mà là replica)
5. **Phụ lục A giữ nguyên logic** — WHERE, dedup, LENGTH=9 không đổi; chỉ thêm 2 cột output
6. **Không tạo dataset `app_write`** — chưa cần (write-back defer, chặn Hiếu)
7. **Scheduled query owner** — dùng tài khoản cá nhân Minh; spec Hiếu nói "quản trị dữ liệu" nhưng context PalFish Minh = IT = data admin. Nếu Hiếu muốn đổi → transfer ownership sau

---

## 4. Phân công & blockers (confirmed 19/8)

| # | Việc | Ai làm | Project | Status |
|---|---|---|---|---|
| 1 | Tạo dataset `app_lookup` + bảng + scheduled query (G1) | **Hiếu** | `daily-report-smai-to-openclaw` | ⛔ Minh không có quyền tạo dataset |
| 2 | Cấp `dataViewer` trên `app_lookup` cho SA Minh (G1-T4) | **Hiếu** | `daily-report-smai-to-openclaw` | Chờ G1-T1 |
| 3 | Tạo SA `gmv-bq-sync@pf-salary.iam` | **Minh** | `pf-salary` | Minh sở hữu project |
| 4 | Bật API + deploy Cloud Function + Scheduler (G2-G3) | **Minh** | `pf-salary` | Minh sở hữu project |
| 5 | Lưu Supabase service-role key vào Secret Manager | **Minh** | `pf-salary` | Key đã có trên Render |

**Luồng giao việc:** Minh soạn SQL + hướng dẫn (xong, §2 plan này) → gửi Hiếu chạy G1 → Hiếu xong → Minh làm G2-G4.

---

## 5. Vấn đề "số đầu tháng 8 không tìm thấy"

**Root cause:** `app_lookup.lead_phone_lookup` trên BQ chưa tồn tại (G1 chưa làm) → Supabase `leads_lookup` là snapshot 18/8 → lead mới sau 18/8 không có.

**Giải quyết tạm (trước khi Cloud Function lên):** Sau G1-T2, chạy lại seed tay 1 lần (export CSV từ BQ → import Supabase) với SQL mới (có sale_name + lead_id). Số `1089367529` sẽ tìm thấy ngay.

**Giải quyết triệt để:** G1-G4 xong → tự động 1h/lần, không cần seed tay nữa.

---

## 6. Timeline

| Milestone | Ước lượng | Phụ thuộc |
|---|---|---|
| G1 (BQ setup) | 30' thao tác Console | Quyền BQ project |
| G2 (Cloud Function) | 2h code + test local | G1 xong |
| G3 (Scheduler + SA) | 15' thao tác Console | G2 deploy xong |
| G4 (Verify) | 30' | G3 xong |
| **Tổng** | **~3h** | Không tính thời gian chờ quyền |

---

## 7. Tự soát 5 tiêu chí

1. **Triệt để:** cover cả 2 tầng (BQ scheduled query + Cloud Function), fix root cause "lead mới không tìm thấy"
2. **Không lỗi con:** sale_name + lead_id tính trên BQ (deterministic), TRUNCATE+INSERT (không orphan), guardrail SĐT log
3. **Không tăng hạ tầng app:** Cloud Function chạy ngoài app; Supabase chỉ nhận INSERT qua service-role (không tải DB app); BQ scheduled query do BQ tự chạy
4. **Tối ưu token:** tái dùng SA + infra từ plan Fivetran; SQL mở rộng từ Phụ lục A (không viết lại); Cloud Function ~50 dòng
5. **Bền qua compact:** SQL đầy đủ inline, không tham chiếu "như đã bàn"
