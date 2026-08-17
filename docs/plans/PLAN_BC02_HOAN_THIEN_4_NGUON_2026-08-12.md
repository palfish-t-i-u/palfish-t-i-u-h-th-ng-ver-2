# PLAN — Hoàn thiện BC02 Key Data: tích hợp 4 nguồn dữ liệu

**Ngày**: 2026-08-12 · **Nguồn yêu cầu**: Chị Thu Hiền (Lark doc N4)
**Status**: DRAFT — chờ anh Minh duyệt. Hướng đã chốt: **tự động (Phương án B+)**, KHÔNG nhập tay.
**Cập nhật cuối**: 12/8/2026 chiều — thêm Metabase API approach + bước điều tra

---

## Bối cảnh

BC02 hiện tại chỉ có **1 nguồn**: sổ doanh thu (`so_doanh_thu`) → pivot theo ngày × loại nguồn → đếm đơn + GMV (RMB).

Chị Hiền feedback: thiếu 4 nhóm số liệu để thành báo cáo Key Data hoàn chỉnh (theo sheet GMV All File hiện tại):

| # | Nguồn | Nội dung | Nguồn gốc chị Hiền | Ứng viên tự động |
|---|---|---|---|---|
| 1 | **BI Leads** | SL lead Facebook (kênh 300265 HN), CRM Leads, chia HN/HCM | Dashboard BI `sea.pri.ibanyu.com` (VPN) → tải Excel → lọc ngày | **Metabase Q12749** (leads-status-update) — cần verify |
| 2 | **Chatpage** | SĐT từ trực page (HN/Linh Đàm/HCM) | 3 Google Sheets | Google Sheets API (SA) hoặc **có thể** đã nằm trong Metabase |
| 3 | **Trial** | Số L1 lên học thử, chia HN/HCM | CRM > Thống kê TVTS (VPN) | **Metabase Q12749** (leads-status-update, có trial status) — cần verify |
| 4 | **Budget ADS** | Chi phí QC theo kênh/ngày | Google Sheet "Daily Report" | Google Sheets API (SA) hoặc **có thể** đã nằm trong Metabase |

**Google Sheets link** (từ Lark doc N4):
- Chatpage HN: `1h58XWvtuH8fvX88EFanzyVjTJlIbLVNAOJy90Mw5uv0`
- Chatpage Linh Đàm: `1rC-rNeGthzK1mwuMCpHNA1BrwPR1TN3t-k8ko3vCk88`
- Chatpage HCM: `14kfCV7p3WrBBK2UQDv4akcGnVkYIKVD9T_x5gWhjXxo`
- Budget ADS: `15hbb2Qr7QolqpJzre-AZ4FkDS9U_cMw66ysA8JfKhr8` (sheet "越南总")

**Deadline hằng ngày**: trước 10h ngày N+1 phải xong báo cáo ngày N.
**Lark doc N4 (Thu Hiền)**: https://ajpiov2uned8.jp.larksuite.com/wiki/IDZ5wbEANiPFAakyFFejuqYwpYc

---

## Quyết định hướng đi (12/8)

~~Phương án A (form nhập tay)~~ — **BỎ**. Mục tiêu dự án là tự động hóa, để Hiền nhập tay = không giải quyết gốc.

### ✅ Phương án B+ — Tự động qua Metabase API + Google Sheets API

**Phát hiện quan trọng**: Metabase (`metabase.ibanyu.com`) có REST API:
```
POST /api/session          → session token (email + password)
GET  /api/card/{id}/query/json  → data dạng JSON
```
VPN chỉ là lớp mạng, KHÔNG phải barrier logic. Script gọi API bình thường sau khi connect VPN.

**Metabase saved questions đã biết**:
- `12749` — leads-status-update (báo cáo trạng thái KH → leads + trials?)
- `14385` — referral-details-vn (KH giới thiệu → referral data)
- `14393` — remaining-lesson-vn (buổi học còn lại — không liên quan BC02)

**Luồng tự động**:
```
[Machine có VPN] → Metabase API (Q12749, Q14385) → parse JSON
                 → Google Sheets API (chatpage, budget)  → parse
                 → Transform + push Supabase bc02_daily_metrics
                 → BC02 UI tự hiện data mới
```

**Chạy khi nào**: cron ~7h sáng N+1 (buffer 3h trước deadline 10h)

**Chạy ở đâu** (chưa chốt):

| Hướng | Cách | Ưu | Nhược |
|---|---|---|---|
| GitHub Actions cron | .ovpn + credentials → GitHub Secrets; workflow chạy 7h30 VN daily | Tự động 100%, không phụ thuộc máy | Cần upload .ovpn Secret; repo public nhưng Secret encrypted |
| Script local + Task Scheduler | Python script trên máy Minh (VPN sẵn) | Đơn giản nhất, 0 setup | Máy phải bật đúng giờ |

**VPN access**: OpenVPN Connect + profile `ipalfish(HK)2025.ovpn`. Hướng dẫn: https://ljp6cf2vh7zv.jp.larksuite.com/docx/WJcHdyyvroruCtxLa4ejMmRXpjd. Credentials dùng chung VPN + Metabase (lưu riêng, KHÔNG commit vào repo).

---

## ⚠️ BƯỚC TIẾP THEO — Điều tra Metabase (CHẶN CODE)

**Phải xong trước khi code**. Mục tiêu: biết chính xác Metabase cover nguồn nào → nguồn nào phải pull từ Google Sheets.

### Cách làm

1. Bật VPN (OpenVPN + profile ipalfish HK)
2. Chạy script điều tra (hoặc curl tay):

```python
import requests

BASE = "https://metabase.ibanyu.com/api"
# Login
s = requests.post(f"{BASE}/session", json={
    "username": "hoanghieuw00617@ipalfish.com",
    "password": "<password_trong_lark_doc>"
}).json()
token = s["id"]
headers = {"X-Metabase-Session": token}

# Pull question 12749 (leads-status)
r1 = requests.get(f"{BASE}/card/12749/query/json", headers=headers)
print("=== Q12749 COLUMNS ===")
print([list(row.keys()) for row in r1.json()[:1]])
print("=== Q12749 SAMPLE (3 rows) ===")
for row in r1.json()[:3]:
    print(row)

# Pull question 14385 (referral)
r2 = requests.get(f"{BASE}/card/14385/query/json", headers=headers)
print("\n=== Q14385 COLUMNS ===")
print([list(row.keys()) for row in r2.json()[:1]])
print("=== Q14385 SAMPLE (3 rows) ===")
for row in r2.json()[:3]:
    print(row)
```

3. Paste kết quả JSON → map cột nào → metric nào của Thu Hiền
4. Xác nhận nguồn nào Metabase KHÔNG có → cần Google Sheets API

### Kết quả mong đợi

| Nguồn Hiền | Metabase cover? | Fallback |
|---|---|---|
| BI Leads (FB + CRM) | Q12749 có? | Nếu không: Google Sheet BI hoặc form tay |
| Chatpage SĐT | Q12749 có? | Nếu không: Google Sheets API (3 sheet) |
| Trial L1 | Q12749 có? | Nếu không: Google Sheets API hoặc form tay |
| Budget ADS | Không chắc | Google Sheets API (sheet 越南总) |

---

## Schema (dự kiến — có thể thêm/bớt cột sau điều tra)

```sql
CREATE TABLE bc02_daily_metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_date date NOT NULL,
  team text NOT NULL CHECK (team IN ('HN', 'HCM')),

  -- Nguồn 1: BI Leads
  fb_leads integer,          -- Facebook Leads (kênh 300265 HN / kênh HCM)
  crm_leads integer,         -- CRM Leads

  -- Nguồn 2: Chatpage
  chatpage_sdt integer,      -- SĐT từ trực page

  -- Nguồn 3: Trial
  trial_l1 integer,          -- Số L1 lên học thử

  -- Nguồn 4: Budget ADS
  budget_ads numeric(12,2),  -- Chi phí QC (VNĐ)

  -- Metadata
  source text DEFAULT 'manual', -- 'metabase_api' | 'sheets_api' | 'manual'
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (report_date, team)
);

ALTER TABLE bc02_daily_metrics ENABLE ROW LEVEL SECURITY;
```

---

## Milestones (sau khi điều tra xong)

### M0 — Điều tra Metabase API (ĐANG LÀM)

- **M0-T1**: Bật VPN + chạy script soi Q12749, Q14385
- **M0-T2**: Map cột Metabase → 4 nguồn Thu Hiền
- **M0-T3**: Xác nhận nguồn nào cần Google Sheets API
- **M0-T4**: Cập nhật schema + milestones bên dưới

### M1 — Backend: bảng + pipeline pull data

- **M1-T1 · Migration**: tạo bảng `bc02_daily_metrics` + RLS
- **M1-T2 · Metabase puller**: script Python pull Q12749/Q14385 → parse → upsert Supabase
- **M1-T3 · Sheets puller** (nếu cần): Google Sheets API pull chatpage/budget → parse → upsert
- **M1-T4 · Endpoint GET**: `/bc02-metrics?from=&to=` cho FE
- **M1-T5 · Merge pivot**: sửa `_build_key_data_pivot()` ghép daily_metrics vào BC02

### M2 — Automation: cron / scheduler

- **M2-T1**: Chọn nền (GitHub Actions vs Task Scheduler) → setup cron 7h30 VN
- **M2-T2**: Lưu credentials (VPN profile + Metabase + Google SA) vào secrets
- **M2-T3**: Alert khi pull fail (DingTalk notify?)

### M3 — Frontend: mở rộng bảng BC02

- **M3-T1 · Cột mới**: thêm cột leads/chatpage/trial/budget vào pivot table
- **M3-T2 · Tổng cộng**: hàng tổng sum thêm metrics mới
- **M3-T3 · Trạng thái**: badge ngày nào đã có data / chưa có

### M4 — Validate + deploy

- **M4-T1**: Unit test puller + merge pivot + FE
- **M4-T2**: `tsc -b` + build pass
- **M4-T3**: Deploy sandbox → prod

---

## Deadline (1 dev full-time, sau khi M0 xong)

| Milestone | Est |
|---|---|
| M0 — Điều tra Metabase | 0.5 ngày (chặn tất cả) |
| M1 — BE bảng + pipeline | 1.5 ngày |
| M2 — Automation cron | 0.5 ngày |
| M3 — FE mở rộng bảng | 0.5 ngày |
| M4 — Test + deploy | 0.5 ngày |
| **Tổng** | **~3.5 ngày** |

## Đối chiếu 5 tiêu chí

1. **Triệt để**: auto-pull hết nguồn có API (Metabase + Sheets); form tay chỉ cho nguồn không có API; phủ schema→pipeline→cron→FE→deploy
2. **Không lỗi con**: upsert UNIQUE; source tracking; alert khi fail; nullable columns cho data chưa có
3. **Không tăng hạ tầng quá mức**: Metabase API đã có sẵn; Google SA miễn phí; cron = GitHub Actions (free) hoặc local script; không thêm server/DB
4. **Tối ưu token**: M0 điều tra trước tránh code mù; plan self-contained
5. **Bền vững**: pipeline idempotent (upsert); thêm nguồn mới = thêm puller + cột; không phụ thuộc context hội thoại
