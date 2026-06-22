# Handoff: Tự động đẩy thông báo Payment / Activation vào group Zalo (22/06/2026)

> **Người nhận**: Đức / Đạt / Giang
> **Người giao**: Minh
> **Trạng thái**: 🟢 **SẴN SÀNG** — C1-C4 done, token + group verified. 3 đứa bắt đầu code D1-D5 được.
> **Mục tiêu**: Khi thanh toán được xác nhận (auto từ PayOS/SePay hoặc kế toán tick tay) → tự động gửi tin vào group Zalo của team sale tương ứng. Tương tự khi kích hoạt khoá học.
> **Lý do làm**: Feedback họp 21/6 từ anh Hiếu — "Trong tuần tới cần phải đẩy tự động thông tin tiền về và thông tin kích hoạt khoá học lên Zalo của IH2 và Offline."

---

## 0. TL;DR

```
Ngày 1-3: 3 đứa code song song (Đức + Đạt + Giang)
          Minh song song: tạo nhóm IH2, tạo App, OAuth flow
Ngày 4:   Minh paste credentials + test E2E với Đức
Ngày 5-7: Soft launch (leader IH2 + anh Hiếu)
Ngày 8:   Cutover toàn team IH2
```

**Scope giai đoạn này**: chỉ team IH2. **Nhóm Offline DEFER** — team Offline chưa onboard, làm sau.

**Phương án đã chốt**: Zalo OA + GMF (Group Management Function) — official API, không vi phạm TOS.

**Kiến trúc**: DB trigger trên `payment_lines` / `active_requests` → ghi vào bảng `zalo_outbox` → worker chạy nền poll mỗi 30s → gọi Zalo OA API → retry exponential backoff nếu fail.

---

## 1. Bối cảnh

### 1.1 OA Palfish Vietnam hiện trạng

- **Gói**: OA Nâng cao (gói cũ trước cải tổ 1/6/2026 của Zalo)
- **Hết hạn**: 22/08/2026 — gia hạn tự động **ĐANG TẮT** ⚠️
- **Quota GMF**: 1 nhóm GMF-100 free (0/1 đã dùng) → đủ cho IH2
- **ZBS account**: Palfish (ZBS ID `ZCA-256570`, liên kết bởi Hoàng Hiếu, 23/08/2025)
- **App đã cấp quyền**: Pancake V2 (CRM khác, KHÔNG dùng cho dự án này)

### 1.2 3 nguồn trigger payment hiện tại trong code

| # | Trigger | File | Đã gọi `_mark_line_paid()`? |
|---|---|---|---|
| 1 | PayOS webhook (auto KH chuyển QR) | `backend/payment_request_routes.py:1861` → :1173 | ✅ Có |
| 2 | Kế toán confirm tay (UI tick "Đã nhận tiền") | `backend/payment_request_routes.py:1264` | ✅ Có |
| 3 | SePay webhook (auto VCB báo có) | `backend/sepay_routes.py:291` | ❌ Update trực tiếp |

→ App-level hook không an toàn vì SePay bypass. **Phải dùng DB trigger** để bắt mọi UPDATE.

---

## 2. Kiến trúc — DB trigger + outbox + worker

```
[PayOS / SePay / Kế toán tick] → UPDATE payment_lines.status='paid'
                                       │
                                       ▼ Postgres TRIGGER (Đạt)
                          ┌────────────────────────┐
                          │ zalo_outbox (bảng mới) │
                          │ event_type, group_id,  │
                          │ message, sent_at,      │
                          │ retries, next_retry_at │
                          └───────────┬────────────┘
                                      │ Background task poll 30s (Đạt)
                                      ▼
                          ┌────────────────────────┐
                          │ zalo_outbox_worker.py  │
                          │ Đọc 20 row pending     │
                          └───────────┬────────────┘
                                      │ gọi function của Đức
                                      ▼
                          ┌────────────────────────┐
                          │ zalo_notifier.py       │
                          │ send_text_to_group()   │
                          │ + refresh token tự     │
                          └───────────┬────────────┘
                                      │ POST Zalo OA API
                                      ▼
                                ┌─────────────┐
                                │ Zalo GMF    │
                                │ Group IH2   │
                                └─────────────┘
```

**Lợi ích**:
- Zalo lag → tin vẫn nằm outbox → retry sau 30s, 2min, 5min, 15min
- Dev mới sau này thêm flow update `payment_lines` trực tiếp → vẫn tự fire trigger
- Idempotency: UNIQUE `(source_table, source_id, event_type)` → webhook retry không gửi trùng
- Mapping team↔group lưu DB → mở rộng cho Offline / team mới chỉ cần thêm row, không sửa code

---

## 3. 3 vấn đề tồn đọng (Minh xử lý)

| # | Vấn đề | Hành động | Deadline |
|---|---|---|---|
| **V1** | Gói Nâng cao 1 GMF-100 free đủ IH2. Khi Offline onboard sẽ thiếu | Nâng gói **Tăng trưởng 2.5tr/năm** (3 GMF) khi gần Offline onboard. Hoặc nâng luôn để sẵn | Trước Offline onboard / trước 22/8 |
| **V2** | Gói hết hạn 22/08/2026, auto renew TẮT | Quyết định gia hạn / nâng gói + BẬT auto renew | Trước 15/08/2026 |
| **V3** | ~~App Pancake V2 đang chiếm slot~~ | ✅ Đã tạo App mới "PalFish GMV Notifier" (ID `83298551201629166`) ngày 22/6 | Done |
| **V4** 🆕 | Bug Zalo portal: không lưu được SĐT/email → không kích hoạt app → block OAuth | Đã gửi ticket support Zalo 22/6. Chờ phản hồi | **BLOCKING** |

---

## 4. Phân chia việc

### 4.A — Việc của MINH (trên Zalo, không giao 3 đứa)

| # | Việc | Thời gian | Tiến độ | Ghi chú |
|---|---|---|---|---|
| A1 | OA Palfish Vietnam xác thực doanh nghiệp | — | ✅ Done | Đã có (194 người quan tâm) |
| A2 | Gói OA Nâng cao hiện tại (1 GMF-100 free, hết hạn 22/08/2026) | — | ✅ Đang dùng | Auto renew **ĐANG TẮT** ⚠️ |
| A3 | Nâng gói Tăng trưởng 2.5tr/năm (3 GMF-100 free, sẵn cho Offline) | 30 phút | ⬜ Chưa | Có thể defer đến khi Offline onboard, nhưng cần trước 22/8 |
| A4 | Bật gia hạn tự động trên ZBS (tuỳ chọn) | 5 phút | ⬜ Chưa | Tránh quên hết hạn → cắt nhóm. Minh chưa tự ý làm, vẫn đang tắt |
| B1 | Tạo nhóm GMF-100 "IH2 — GMV Notify" | 15 phút | ✅ Done 22/6 | Trong quota gói. Tên ≤30 ký tự |
| B2 | Add anh Hiếu vào nhóm trước | 2 phút | ✅ Done 22/6 | Theo yêu cầu anh Hiếu |
| B3 | Gửi link mời vào group Zalo team IH2 | 5 phút | ⬜ Chưa | Sale tự join khi rảnh |
| C1 | Tạo App "PalFish GMV Notifier" trên developers.zalo.me → App ID + Secret | 30 phút | ✅ Done 22/6 | App ID: `83298551201629166`. KHÔNG dùng App Pancake V2 (CRM khác) |
| C2 | Request permission `send_message_to_group`, `manage_group` | 15 phút | ✅ Done 22/6 | Tất cả quyền GMF đã duyệt |
| C3 | Chạy OAuth flow → access_token + refresh_token ban đầu | 30 phút | ✅ Done 22/6 | Token lấy thành công. access_token valid 25h, refresh_token valid 90 ngày |
| C4 | Lấy `group_id` nhóm IH2 + test gửi tin | 15 phút | ✅ Done 22/6 | group_id = `df7d5a31765c9f02c64d`. Test message OK |
| E1 | Paste credentials + group_id vào Admin UI Giang build | 15 phút | ⬜ Chờ C3+C4 | |
| E2 | Test E2E với Đức (nhóm test private) | 2 giờ | ⬜ | Ngày 4 |
| E3 | Soft launch — leader IH2 + anh Hiếu | 3 ngày (async) | ⬜ | Ngày 5-7 |
| E4 | Cutover toàn team IH2 | 15 phút | ⬜ | Ngày 8 |

**Blocker hiện tại**: Không còn. C1-C4 đã xong.

**Thông tin từ setup 22/6**:
- Domain verified: `palfish-gmv-manager-sandbox.vercel.app`
- Callback URL: `https://palfish-gmv-manager-sandbox.vercel.app/zalo-callback`
- OA linked: Palfish Vietnam
- App backup (phòng app chính hỏng): PalFish Notifier, ID `376625350414150801`
- **group_id (API)**: `df7d5a31765c9f02c64d` ⚠️ gid trong URL oa.zalo.me/chat (`df7d5a31765c9f02c64d8`) KHÁC — thừa chữ `8` cuối
- Nhóm GMF link: `https://zalo.me/g/tfymfx695`
- API Explorer: `developers.zalo.me/tools/explorer` → chọn OA Access Token + app PalFish GMV Notifier
- List groups: `GET https://openapi.zalo.me/v3.0/oa/group/getgroupsofoa?offset=0&count=5`

**API gửi tin nhóm (Đức cần biết)**:
```
POST https://openapi.zalo.me/v3.0/oa/group/message
Header: access_token: <token>
Body: {"recipient":{"group_id":"df7d5a31765c9f02c64d"},"message":{"text":"nội dung"}}
```

**Tổng thao tác Minh**: ~5 giờ + ~1 tuần async. Không đụng env Render, không đụng code.

---

### 4.B — Việc của 3 ĐỨA (chỉ code + setup môi trường trong repo GMV)

#### 🟦 ĐỨC — Khối Zalo Integration (~10h, Ngày 1-2)

**Vai trò**: Người duy nhất chạm Zalo API. Đạt + Giang gọi function của Đức, không cần biết Zalo API.

| # | Việc | Deliverable | Effort | Ngày |
|---|---|---|---|---|
| Đ1 | Module `backend/zalo_notifier.py` — `send_text_to_group(group_id, message) → message_id`. POST Zalo OA API `/openapi/v3.0/oa/group/message` | File + unit test mock | 4h | Ngày 1 |
| Đ2 | Logic `refresh_access_token()` tự động khi 401, update `zalo_oa_credentials` | Trong cùng module | 2h | Ngày 1 |
| Đ3 | Cron daily check token expire (≤7 ngày auto refresh, fail thì alert) | Background task | 1h | Ngày 2 |
| Đ4 | Unit test toàn module (mock 200/401/500, retry, refresh tự động) | Test pass | 2h | Ngày 2 |
| Đ5 | Cập nhật `env_utils.py` + `.env.example` thêm `ZALO_OA_ID` | PR | 0.5h | Ngày 2 |

**Interface Đức expose**:
```python
# backend/zalo_notifier.py
def send_text_to_group(group_id: str, message: str) -> str:
    """Gửi text vào group Zalo GMF. Tự refresh token nếu cần.
    Return: message_id của Zalo. Raise ZaloAPIError nếu fail sau retry."""
```

---

#### 🟩 ĐẠT — Khối Database & Worker (~10.5h, Ngày 1-2)

**Vai trò**: Người duy nhất chạm DB layer + worker chạy nền.

| # | Việc | Deliverable | Effort | Ngày |
|---|---|---|---|---|
| Đa1 | Migration SQL `docs/migrations/2026-06-XX-zalo-outbox.sql` — 3 bảng: `zalo_outbox`, `zalo_team_groups`, `zalo_oa_credentials` | File SQL apply sandbox | 2h | Ngày 1 |
| Đa2 | Postgres trigger trên `payment_lines` — UPDATE status='paid' → insert outbox. Gọi `build_payment_paid_message()` của Giang, lookup group_id từ `zalo_team_groups` qua team của sale | Trigger SQL + test | 2h | Ngày 1 |
| Đa3 | Postgres trigger trên `active_requests` tương tự khi `status='activated'` | Trigger SQL | 1h | Ngày 1 |
| Đa4 | Worker `backend/zalo_outbox_worker.py` — FastAPI background 30s/lần. Đọc 20 row pending → gọi `zalo_notifier.send_text_to_group()` → mark `sent_at` / `next_retry_at` (30s/2m/5m/15m); sau 4 lần fail → `dead` + alert | File + register `main.py` | 3h | Ngày 2 |
| Đa5 | Unit test trigger + worker (fire đúng, retry pattern, idempotency UNIQUE) | Test pass | 2h | Ngày 2 |
| Đa6 | Cron weekly archive — xoá row `sent_at IS NOT NULL` cũ >30 ngày | Cron task | 0.5h | Ngày 2 |

**Schema reference**:
```sql
CREATE TABLE zalo_outbox (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL CHECK (event_type IN ('payment_paid', 'course_activated')),
  source_table    TEXT NOT NULL,
  source_id       UUID NOT NULL,
  group_id        TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  retries         INT DEFAULT 0,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ,
  zalo_message_id TEXT,
  UNIQUE (source_table, source_id, event_type)
);

CREATE TABLE zalo_team_groups (
  team_code   TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL,
  group_name  TEXT,
  is_active   BOOLEAN DEFAULT true,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE zalo_oa_credentials (
  id              SERIAL PRIMARY KEY,
  app_id          TEXT NOT NULL,
  app_secret      TEXT NOT NULL,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_zalo_outbox_pending ON zalo_outbox(next_retry_at) WHERE sent_at IS NULL;
```

---

#### 🟨 GIANG — Khối Business Logic + Admin UI (~16.5h, Ngày 1-3)

**Vai trò**: Format tin nhắn, mapping team, và **xây 3 trang Admin UI** cho Minh nhập credentials Zalo + monitor outbox.

| # | Việc | Deliverable | Effort | Ngày |
|---|---|---|---|---|
| G1 | SQL function `build_payment_paid_message(line_row)` — lookup `created_by` → sale → team → tên. Format: `"💰 PAID — KH {customer} \| {amount}đ \| sale {sale_name} \| {method} \| {time}"` | SQL function | 2h | Ngày 1 |
| G2 | SQL function `build_course_activated_message(ar_row)` — format: `"✅ KÍCH HOẠT — KH {customer} \| gói {package} \| sale {sale_name}"` | SQL function | 1h | Ngày 1 |
| G3 | Logic lookup `created_by → team_code` (pattern `backend/revenue_routes.py:71`). Xác định "IH2" map từ field nào trong user table | Helper function | 1.5h | Ngày 1 |
| G4 | ⭐ Admin UI `/admin/zalo-config` — form paste App ID/Secret/token, hiển thị trạng thái token, nút "Test gửi tin" | React + API | 4h | Ngày 2 |
| G5 | ⭐ Admin UI `/admin/zalo-groups` — bảng mapping team↔group_id, edit inline | React + API | 2h | Ngày 3 |
| G6 | Admin UI `/admin/zalo-outbox` — list 50 row gần nhất, status, error, nút "Retry tay" | React + API | 3h | Ngày 3 |
| G7 | Integration test full flow (mock PayOS webhook → trigger → outbox → worker mock gửi → verify format + group đúng) | Test pass | 3h | Ngày 3 |

⭐ **G4, G5, G6 quan trọng**: là giao diện Minh dùng để paste token + monitor. Nếu thiếu UI, Minh phải SSH Render set env tay → bất tiện + rủi ro.

---

## 5. Timeline tổng — 8 ngày end-to-end

```
Ngày 1 (Code start):
├─ Minh: A3-A4 (gói + auto renew), B1-B3 (tạo nhóm IH2 + add anh Hiếu + gửi link),
│        C1-C2 (App + permission)
├─ Đức: Đ1, Đ2 (zalo_notifier — mock token, không chờ Minh)
├─ Đạt: Đa1, Đa2, Đa3 (migration + 2 trigger)
└─ Giang: G1, G2, G3 (SQL functions + mapping)

Ngày 2:
├─ Minh: C3 (OAuth lấy token), C4 (group_id IH2)
├─ Đức: Đ3, Đ4, Đ5
├─ Đạt: Đa4, Đa5, Đa6 (worker + test) — gọi function Đức (Đ1)
└─ Giang: G4 (Admin UI config — ưu tiên để Minh paste ngày 4)

Ngày 3:
└─ Giang: G5, G6, G7

Ngày 4: Minh paste credentials (E1) + test E2E (E2) với Đức
Ngày 5-7: Soft launch — leader IH2 + anh Hiếu nhận tin, feedback format
Ngày 8: Cutover toàn team IH2
```

---

## 6. Acceptance criteria

- [ ] 3 nguồn trigger (PayOS/SePay/kế toán) → tin đến nhóm đúng team trong **≤60 giây**
- [ ] Active request `activated` → tin đến nhóm trong **≤60 giây**
- [ ] Zalo API fail 1 lần → retry trong 30s, tin vẫn đến
- [ ] Zalo API fail liên tục 4 lần → admin nhận alert
- [ ] Token expire → auto refresh, không cần thao tác tay
- [ ] Sale chưa có team mapping → log warning, không crash
- [ ] Outbox không gửi trùng nếu webhook retry (UNIQUE constraint)
- [ ] Minh paste token qua Admin UI mà không cần SSH Render

---

## 7. Chi phí

| Mục | Năm 2026 | Năm 2027+ | Ghi chú |
|---|---|---|---|
| Gói OA Nâng cao hiện tại | Đã trả | — | Hết hạn 22/08/2026 |
| Nâng cấp gói Tăng trưởng (từ 22/8) | 2.500.000đ | 2.500.000đ | 3 nhóm GMF-100 free, API 100 req/phút |
| Phí tin nhắn GMF | **0đ** | TBD — dự phòng 1.500.000đ | Free đến 31/12/2026, sau chưa công bố giá |
| Phí GMF bổ sung | 0đ | 0đ | 3 free đủ IH2 + Offline tương lai + 1 dự phòng |
| Phí setup / kích hoạt | 0đ | 0đ | Không có |
| **TỔNG** | **2.500.000đ** | **~4.000.000đ** | |

---

## 8. Tham chiếu

- Bảng giá Zalo OA: https://zalo.solutions/oa/pricing
- Chính sách GMF: https://oa.zalo.me/home/documents/policy/tinh-nang-quan-ly-nhom
- Developer docs: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/general
- OAuth flow: https://developers.zalo.me/docs/api/official-account-api/access-token

---

## 9. Lưu ý

- 🟡 **Bản nháp** — Minh sẽ review/sửa tiếp. Đừng bắt đầu code dựa hoàn toàn vào doc này, chờ Minh confirm phiên bản final.
- Các effort estimate là dự kiến của Minh — 3 đứa free push back nếu thấy không khả thi.
- Format message ở G1/G2 chỉ là gợi ý — Minh sẽ chốt lại sau khi xem nhóm IH2 thật.
- **Offline DEFER**: code/trigger/worker xây generic (không hard-code IH2), Giang xây Admin UI mapping → khi Offline onboard chỉ cần thêm 1 row vào `zalo_team_groups`, không sửa code.
