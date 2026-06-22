# Handoff: Tự động đẩy thông báo Payment / Activation vào group Zalo (22/06/2026)

> **Người nhận**: Đức / Đạt / Giang
> **Người giao**: Minh
> **Trạng thái**: 🟡 **BẢN NHÁP ĐẦU** — chưa final, Minh sẽ sửa tiếp. Up lên sandbox để dễ collab.
> **Mục tiêu**: Khi thanh toán được xác nhận (auto từ PayOS/SePay hoặc kế toán tick tay) → tự động gửi tin vào group Zalo của team sale tương ứng. Tương tự khi kích hoạt khoá học.
> **Lý do làm**: Feedback họp 21/6 từ anh Hiếu — "Trong tuần tới cần phải đẩy tự động thông tin tiền về và thông tin kích hoạt khoá học lên Zalo của IH2 và Offline."

---

## 0. TL;DR

```
Phase 1 (tuần này):  Anh tạo nhóm IH2 trên OA Palfish → 3 đứa code song song
Phase 2 (tuần 2-3):  Anh nâng gói OA Tăng trưởng 2.5tr/năm + tạo nhóm Offline
Phase 3 (tuần 4):    Soft launch + cutover
```

**Phương án đã chốt**: Zalo OA + GMF (Group Management Function) — official API, không vi phạm TOS.

**Kiến trúc**: DB trigger trên `payment_lines` / `active_requests` → ghi vào bảng `zalo_outbox` → worker chạy nền poll mỗi 30s → gọi Zalo OA API → retry exponential backoff nếu fail.

---

## 1. Bối cảnh

### 1.1 OA Palfish Vietnam hiện trạng

- **Gói**: OA Nâng cao (gói cũ trước cải tổ 1/6/2026 của Zalo)
- **Hết hạn**: 22/08/2026 — gia hạn tự động **ĐANG TẮT** ⚠️
- **Quota GMF**: 1 nhóm GMF-100 free (0/1 đã dùng)
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
                                       ▼ Postgres TRIGGER (Đạt làm)
                          ┌────────────────────────┐
                          │ zalo_outbox (bảng mới) │
                          │ event_type, group_id,  │
                          │ message, sent_at,      │
                          │ retries, next_retry_at │
                          └───────────┬────────────┘
                                      │ Background task poll 30s (Đạt làm)
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
                                │ Group IH2 / │
                                │ Offline     │
                                └─────────────┘
```

**Lợi ích**:
- Zalo lag → tin vẫn nằm outbox → retry sau 30s, 2min, 5min, 15min
- Dev mới sau này thêm flow update `payment_lines` trực tiếp → vẫn tự fire trigger
- Idempotency: outbox check duplicate theo `(source_table, source_id)` → webhook retry không gửi trùng

---

## 3. 3 vấn đề tồn đọng (Minh xử lý)

| # | Vấn đề | Hành động | Deadline |
|---|---|---|---|
| **V1** | Gói Nâng cao chỉ 1 GMF-100 free — đủ IH2, KHÔNG đủ Offline | Nâng gói **Tăng trưởng 2.5tr/năm** (3 GMF-100 free) hoặc mua thêm 1 GMF-100 (900k/năm) | Trước khi tạo Offline |
| **V2** | Gói hết hạn 22/08/2026, auto renew TẮT | Quyết định gia hạn / nâng gói + BẬT auto renew | Trước 15/08/2026 |
| **V3** | App Pancake V2 đang chiếm slot — không dùng được cho GMV | Tạo App mới ở developers.zalo.me cho dự án GMV | Tuần này |

---

## 4. Phân chia việc

### 4.A — Việc của MINH (trên Zalo, không giao 3 đứa)

| # | Việc |
|---|---|
| A1 | Tạo nhóm GMF-100 "IH2 — GMV Notify" trên oa.zalo.me, mời 12 sale + leader + manager IH2 |
| A2 | Quyết định nâng gói Tăng trưởng 2.5tr/năm |
| A3 | Tạo nhóm GMF "Offline — GMV Notify" sau khi nâng gói |
| A4 | Tạo App "PalFish GMV Notifier" ở developers.zalo.me → lấy `App ID` + `App Secret` |
| A5 | Request permission `send_message_to_group`, `manage_group` |
| A6 | Chạy OAuth flow → lấy `access_token` + `refresh_token` ban đầu |
| A7 | Lấy `group_id` của 2 nhóm IH2 + Offline |
| A8 | Paste 6 giá trị (App ID, App Secret, access/refresh token, 2 group_id) vào Admin UI mà Giang build |

→ Anh **không đụng env Render**, không đụng code. Chỉ thao tác Zalo + paste qua UI.

---

### 4.B — Việc của 3 ĐỨA (code + setup môi trường trong repo GMV)

#### 🟦 ĐỨC — Khối Zalo Integration

**Vai trò**: Người duy nhất chạm Zalo API. Đạt + Giang gọi function của Đức, không cần biết Zalo API.

| # | Việc | Deliverable | Effort |
|---|---|---|---|
| Đ1 | Module `backend/zalo_notifier.py` — function `send_text_to_group(group_id, message) → message_id`. Đọc `access_token` từ bảng `zalo_oa_credentials` (Đạt cung cấp), POST Zalo OA API `/openapi/v3.0/oa/group/message`. Throw `ZaloAPIError` khi fail | File + unit test mock | 4h |
| Đ2 | Logic refresh access_token: function `refresh_access_token()` gọi Zalo refresh endpoint, update DB. Tự gọi khi `send_text_to_group` gặp 401 | Trong cùng module | 2h |
| Đ3 | Cron daily check token expire — nếu còn ≤7 ngày thì auto refresh, fail thì insert `notifications` table cho admin | Background task | 1h |
| Đ4 | Unit test toàn module: mock Zalo trả 200/401/500, test retry, test refresh tự động | Test pass | 2h |
| Đ5 | Cập nhật `backend/env_utils.py` + `.env.example` — thêm `ZALO_OA_ID` (không bí mật) | PR | 30m |

**Effort Đức**: ~9.5h

**Interface Đức expose**:
```python
# backend/zalo_notifier.py
def send_text_to_group(group_id: str, message: str) -> str:
    """Gửi text vào group Zalo GMF. Tự refresh token nếu cần.
    Return: message_id của Zalo. Raise ZaloAPIError nếu fail sau retry."""
```

---

#### 🟩 ĐẠT — Khối Database & Worker

**Vai trò**: Người duy nhất chạm DB layer + worker chạy nền.

| # | Việc | Deliverable | Effort |
|---|---|---|---|
| Đa1 | Migration SQL `docs/migrations/2026-06-XX-zalo-outbox.sql` — 3 bảng: `zalo_outbox`, `zalo_team_groups`, `zalo_oa_credentials` | File SQL apply sandbox | 2h |
| Đa2 | Postgres trigger trên `payment_lines` — khi `status` chuyển sang `paid` thì insert outbox. Gọi function `build_payment_paid_message()` của Giang. Lookup group_id từ `zalo_team_groups` qua team của sale | Trigger SQL + test UPDATE | 2h |
| Đa3 | Postgres trigger trên `active_requests` tương tự khi `status='activated'` | Trigger SQL | 1h |
| Đa4 | Worker `backend/zalo_outbox_worker.py` — FastAPI background task 30s/lần. Đọc 20 row pending → gọi `zalo_notifier.send_text_to_group()` → success: mark `sent_at`; fail: `next_retry_at` exponential 30s/2min/5min/15min; sau 4 lần fail → mark `dead` + alert | File + register vào `main.py` | 3h |
| Đa5 | Unit test trigger + worker — test trigger fire đúng, test retry, test idempotency (webhook retry không trùng) | Test pass | 2h |
| Đa6 | Cron weekly archive — xoá row `sent_at IS NOT NULL` cũ hơn 30 ngày | Cron task | 30m |

**Effort Đạt**: ~10.5h

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
  UNIQUE (source_table, source_id, event_type)  -- idempotency
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

#### 🟨 GIANG — Khối Business Logic + Admin UI

**Vai trò**: Format tin nhắn, mapping team, và **xây 3 trang Admin UI** cho Minh nhập credentials Zalo + monitor outbox.

| # | Việc | Deliverable | Effort |
|---|---|---|---|
| G1 | SQL function `build_payment_paid_message(line_row)` — lookup `created_by` → user → team_code → tên sale. Build: `"💰 PAID — KH {customer} \| {amount}đ \| sale {sale_name} \| {method} \| {time}"` | SQL function | 2h |
| G2 | SQL function `build_course_activated_message(ar_row)` — tương tự: `"✅ KÍCH HOẠT — KH {customer} \| gói {package} \| sale {sale_name}"` | SQL function | 1h |
| G3 | Logic lookup `created_by → team_code` — dùng pattern có sẵn ở `backend/revenue_routes.py:71`. Cần xác định "IH2" map từ field nào trong user table | Helper function | 1.5h |
| G4 | **Admin UI — Cấu hình Zalo OA** ⭐ trang `/admin/zalo-config`: form paste App ID, App Secret, access/refresh token. Submit lưu `zalo_oa_credentials`. Hiển thị trạng thái token + nút "Test gửi tin" | React component + API | 4h |
| G5 | **Admin UI — Mapping team→group** ⭐ trang `/admin/zalo-groups`: bảng team_code \| group_id \| tên nhóm \| bật/tắt. Edit inline → update `zalo_team_groups` | React component + API | 2h |
| G6 | **Admin UI — Outbox viewer** trang `/admin/zalo-outbox`: hiển thị 50 row gần nhất, status, message, error, thời gian. Nút "Retry tay" reset `next_retry_at = now()` | React component + API | 3h |
| G7 | Integration test full flow — mock PayOS webhook → DB update → trigger fire → outbox row → worker mock gửi → verify message format + group đúng | Test pass | 3h |

**Effort Giang**: ~16.5h

⭐ **G4, G5, G6 quan trọng**: là giao diện Minh dùng để paste token + monitor. Nếu thiếu UI, Minh phải SSH Render set env tay → bất tiện + rủi ro.

---

## 5. Timeline & dependencies

```
Tuần 1 (22/6 - 28/6):
├─ MINH: A1 (tạo nhóm IH2), A4 (tạo App), A5 (request permission)
├─ Đức: Đ1, Đ2 (code zalo_notifier — mock token được, không cần chờ Minh)
├─ Đạt: Đa1, Đa6 (migration — không phụ thuộc ai)
└─ Giang: G1, G2, G3 (SQL functions — không phụ thuộc ai)

Tuần 2 (29/6 - 5/7):
├─ MINH: A2 (quyết nâng gói), A6 (OAuth lấy token), A7 (group_id IH2)
├─ Đức: Đ3, Đ4, Đ5
├─ Đạt: Đa2, Đa3, Đa4 (cần Đ1 của Đức để worker gọi)
└─ Giang: G4 (Admin UI config) — ưu tiên để Minh có chỗ paste token

Tuần 3 (6/7 - 12/7):
├─ MINH: A3 (tạo Offline), A7 group_id Offline, A8 paste vào UI Giang
├─ Đức + Đạt: hoàn thiện test
└─ Giang: G5, G6, G7

Tuần 4 (13/7 - 19/7):
└─ Soft launch 1 tuần + cutover
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

| Mục | Năm 2026 | Năm 2027+ |
|---|---|---|
| Gói OA Nâng cao hiện tại (hết 22/8) | Đã trả | — |
| Nâng cấp gói Tăng trưởng (sau 22/8) | ~2.500.000đ | 2.500.000đ |
| Phí tin nhắn GMF | **0đ** (free đến 31/12/2026) | TBD — dự phòng 1.5tr/năm |
| Phí GMF bổ sung | 0đ (3 free đủ IH2 + Offline + 1 dự phòng) | 0đ |
| **TỔNG** | **2.500.000đ** | **~4.000.000đ** (gồm dự phòng) |

**Effort code 3 đứa**: ~37h spread 3-4 tuần.

**Lưu ý chi phí tin nhắn 2027**: Zalo chưa công bố giá sau khuyến mãi. Worst case (55đ/tin × ~1800 tin/tháng) = ~1.2tr/năm.

---

## 8. Tham chiếu

- Bảng giá Zalo OA: https://zalo.solutions/oa/pricing
- Chính sách GMF: https://oa.zalo.me/home/documents/policy/tinh-nang-quan-ly-nhom
- Developer docs: https://developers.zalo.me/docs/official-account/nhom-chat-gmf/general
- OAuth flow: https://developers.zalo.me/docs/api/official-account-api/access-token

---

## 9. Lưu ý

- 🟡 **Đây là bản nháp đầu** — Minh sẽ review/sửa tiếp. Đừng bắt đầu code dựa hoàn toàn vào doc này, chờ Minh confirm phiên bản final.
- Các effort estimate là dự kiến của Minh, 3 đứa free push back nếu thấy không khả thi.
- Format message ở G1/G2 chỉ là gợi ý — Minh sẽ chốt lại sau khi xem nhóm IH2 thật.
