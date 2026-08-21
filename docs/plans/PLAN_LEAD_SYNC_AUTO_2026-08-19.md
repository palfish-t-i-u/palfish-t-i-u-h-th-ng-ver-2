# PLAN — Đồng bộ kho lead tự động (BQ → Supabase, 1h/lần)

**Ngày:** 2026-08-19 · **Owner:** Minh (= "IT" trong spec Hiếu) · **Status:** G1-G3 ✅ DONE (19/8) · G4 đang verify

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

### G1 — Setup BQ (spec Hiếu §4.1–4.3) — ✅ DONE 19/8
- **G1-T1** ✅ Dataset `app_lookup` tạo xong
- **G1-T2** ✅ Bảng `lead_phone_lookup` tạo xong (SQL mở rộng Phụ lục A + sale_name + lead_id)
- **G1-T3** ✅ BQ scheduled query `lead_phone_lookup refresh` — cron 1h, owner Minh
- **G1-T4** ✅ SA `palfish-lead-app-sync@pf-salary.iam` có dataViewer trên `app_lookup`
- **G1-T5** ✅ Verify: 67.931 dòng, max_lead_date = 2026-08-18

### G2 — Cloud Function sync BQ→Supabase — ✅ DONE 19/8
- **G2-T1** ✅ `bq-sync/lead-sync/` — main.py + requirements.txt
- **G2-T2** ✅ HTTP trigger, urllib (không dùng supabase SDK — tiết kiệm ~200MB RAM), TRUNCATE + batch INSERT 500/batch
- **G2-T3** ✅ Test local + sandbox OK
- **G2-T4** ✅ Deploy gen2, revision 00007-lap (6 revision cũ đã xoá)

### G3 — Cloud Scheduler + SA — ✅ DONE 19/8
- **G3-T1** ✅ SA `palfish-lead-app-sync@pf-salary.iam` — dataViewer + jobUser (job chạy trên pf-salary, không phải project Hiếu)
- **G3-T2** ✅ Secret Manager: `supabase-gmv-url` v1, `supabase-gmv-service-key` v2
- **G3-T3** ✅ Scheduler `lead-sync-hourly` — cron `15 * * * *`
- **G3-T4** ✅ Trigger thủ công OK — 67.931 rows sync

### G4 — Verify end-to-end + bật gate — ⏳ ĐANG VERIFY
- **G4-T1** ✅ Test sandbox — tra SĐT OK
- **G4-T2** ✅ Test prod — SĐT `1089367529` khớp
- **G4-T3** ⏳ Monitoring: Cloud Function sync đều (last_sync 20/8 02:15 UTC). Chờ lead ngày mới xuất hiện (bottleneck = tầng 1 Hiếu ETL)
- **G4-T4** ⏳ Chưa bật gate — điều kiện: data sync ổn ≥ 3 ngày + lead ngày mới có đều đặn
- **G4-T5** ⏳ Xoá cam kết seed tay — chờ gate bật xong

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

### Quyền & phạm vi (Hiếu cấp Editor 19/8, kèm điều kiện)

> **"đừng có sờ vào bất kỳ file cũ và logic nào của anh, vì nó liên quan nhiều thứ lắm"** — Hiếu, 19/8

1. **CHỈ tạo mới dataset `app_lookup`** — không sửa/xoá/đổi tên bất kỳ object nào trong dataset `crm_leads`, `ad_raw`, `report`
2. **Chỉ SELECT từ object Hiếu** — scheduled query ĐỌC `crm_leads.leads_all` + `crm_leads.dim_sale`, KHÔNG INSERT/UPDATE/DELETE/ALTER
3. **Không sửa scheduled query / view / table có sẵn** — kể cả "sửa cho tốt hơn"
4. **Không đổi quyền user khác** — chỉ grant quyền cho SA của Minh trên dataset `app_lookup` (Minh tạo)
5. **SA `palfish-lead-app-sync` chỉ có Data Viewer trên `app_lookup`** — không cấp Editor/Owner/admin

### Kỹ thuật

6. **Không log SĐT** — Cloud Function log count, không log phone/phone9
7. **Data freshness ≤ 1h15'** — BQ scheduled query chạy đầu giờ, Cloud Function chạy phút 15
8. **Phụ lục A giữ nguyên logic** — WHERE, dedup, LENGTH=9 không đổi; chỉ thêm 2 cột output
9. **Scheduled query owner = Minh** (anhminhcv0512@gmail.com) — transfer cho Hiếu nếu cần sau

---

## 4. Phân công & blockers (updated 19/8 — Hiếu cấp Editor)

| # | Việc | Ai làm | Project | Status |
|---|---|---|---|---|
| 1 | Tạo dataset `app_lookup` + bảng + scheduled query (G1) | **Minh** | `daily-report-smai-to-openclaw` | ✅ Có Editor (19/8) |
| 2 | Cấp `dataViewer` trên `app_lookup` cho SA (G1-T4) | **Minh** | `daily-report-smai-to-openclaw` | Tự làm (Editor) |
| 3 | ~~Tạo SA~~ `palfish-lead-app-sync@pf-salary.iam.gserviceaccount.com` | **Minh** | `pf-salary` | ✅ DONE 19/8 |
| 4 | Bật API + deploy Cloud Function + Scheduler (G2-G3) | **Minh** | `pf-salary` | Minh sở hữu project |
| 5 | Lưu Supabase service-role key vào Secret Manager | **Minh** | `pf-salary` | Key đã có trên Render |

**Không còn blocker.** Minh tự làm toàn bộ G1-G4.

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
