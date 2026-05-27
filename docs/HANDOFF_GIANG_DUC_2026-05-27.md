# Handoff Giang / Đức — Feedback Hiếu 27/05/2026

> **Người viết:** Minh · **Ngày:** 2026-05-27  
> **Branch:** `ui/ux` @ `2f936840` (repo `palfish-t-i-u-h-th-ng-ver-2`)  
> **Backend repo:** `palfish-gmv-manager` (Render `palfish-gmv-api`)  
> **Supabase ref:** `jozcvbbypwvzaefteoxn`

Tài liệu này tóm gọn những việc **Giang/Đức cần làm** sau khi Hiếu review app ngày 27/05. Tất cả items FE đã có hoặc Minh sẽ làm — phần dưới chỉ là BE/DB.

---

## Bối cảnh nhanh (đọc trong 2 phút)

Hiếu test bản deploy `2f936840` và phát hiện **dữ liệu bị reset** sau khi sửa. Root cause đã được xác nhận qua code review:

> `updateRequest` và `updateActiveRequest` trong `PaymentFlowContext.tsx` **chỉ ghi local state**, không gọi API nào. Khi poll 12s fire hoặc user F5, dữ liệu về như cũ từ DB.

Có **2 endpoint PATCH chưa tồn tại** — đây là việc quan trọng nhất cần làm ngay.

---

## Việc cần làm — ưu tiên từ trên xuống

### 🔴 P0 — Làm trước (data integrity)

#### B-01 · `PATCH /api/v1/payment-requests/{id}`

**Vấn đề:** Sales sửa số tiền / địa chỉ / tên KH → nhấn "Lưu thay đổi" → dữ liệu reset về cũ sau vài giây.

**Root cause:** `updateRequest()` trong `PaymentFlowContext.tsx:163` chỉ làm:
```python
# Tương đương: không có API call nào. FE chỉ setState.
```

**Cần làm (BE):**
```
File: backend/payment_request_routes.py

Thêm route:
  PATCH /api/v1/payment-requests/{pr_id}
  Body (partial update, tất cả optional):
    {
      "target_amount": float,
      "customer_name": str,
      "customer_phone": str,
      "customer_address": str,
      "email": str,
      "notes": str
    }
  Auth: Bearer JWT (Sale chỉ sửa PR của mình; Manager+ sửa tất cả)
  Response: serialized PaymentRequest object (dùng lại _serialize_payment_request)
```

**Schema:** Bảng `payment_requests` — các cột này đã có (xem `supabase_schema_patch_payment_requests.sql`). Không cần thêm cột mới.

**FE kết nối:** Minh sẽ thêm `endpoints.paymentRequests.update(id, body)` vào `api.ts` và gọi từ `updateRequest()` sau khi Giang/Đức deploy.

---

#### B-02 · `PATCH /api/v1/active-requests/{id}` + `info_confirmed_at`

**Vấn đề:** Khi Sales cập nhật UID list hoặc course trong bước B3 (Kích hoạt khóa học), thay đổi bị ghi đè bởi poll 12s vì không lưu DB.

**Root cause:** `updateActiveRequest()` trong `PaymentFlowContext.tsx:167` tương tự B-01.

**Cần làm (BE):**
```
File: backend/activation_routes.py

Thêm route:
  PATCH /api/v1/active-requests/{ar_id}
  Body (partial):
    {
      "uids": list[str],             # danh sách UID học sinh
      "course_code": str,
      "customer_name": str,
      "notes": str,
      "info_confirmed": bool         # Thu Hiền xác nhận thông tin trước khi xuất HĐ
    }
  Auth: JWT — Sale chỉ sửa AR của mình; info_confirmed chỉ Ops/System
  Response: serialized ActiveRequest object (thêm info_confirmed_at: timestamptz)
```

**Schema — thêm cột:**
```sql
ALTER TABLE active_requests
  ADD COLUMN IF NOT EXISTS info_confirmed_at timestamptz;
NOTIFY pgrst, 'reload schema';
```

**Luồng nghiệp vụ:** Thu Hiền mở AR drawer → click "Mở PR" để xem thông tin KH → quay lại AR → click "Xác nhận thông tin" → FE gọi PATCH với `info_confirmed: true` → nút "Yêu cầu xuất HĐ B4" mới active.

**Schema:** Bảng `active_requests` — xem `supabase_schema_patch_active_requests.sql`.

---

### 🟡 P1 — Làm trong sprint này

#### B-03 · Multi-bill upload

**Vấn đề:** Hiện chỉ upload được 1 ảnh biên lai. Các đơn tiền mặt / trả góp có nhiều biên lai.

**Cần làm:**

1. **Schema migration** — tạo file `docs/supabase_schema_patch_payment_lines_multi_bill.sql`:
```sql
-- Thêm cột mảng; giữ bill_image cũ để không break
ALTER TABLE payment_lines
  ADD COLUMN IF NOT EXISTS bill_images text[] DEFAULT '{}';

-- Migrate dữ liệu cũ sang cột mới (optional, chạy 1 lần)
UPDATE payment_lines
  SET bill_images = ARRAY[bill_image]
  WHERE bill_image IS NOT NULL AND bill_images = '{}';

NOTIFY pgrst, 'reload schema';
```

2. **API** — cập nhật `upload_payment_line_bill` trong `payment_request_routes.py`:
```python
# Thay vì SET bill_image = url, thay bằng:
# array_append(bill_images, url)
# Trả về updated row với bill_images list
```

3. **Serializer** — `_serialize_payment_line` trả thêm `bill_images: list[str]`.

**FE:** Minh sẽ update `BillUploadZone` cho `<input multiple>` sau khi API sẵn.

---

#### B-04 · Cập nhật danh sách ngân hàng

**Vấn đề:** Bank list hiện là `["MB Bank","Vietcombank","Techcombank","BIDV","VPBank"]` — không phân biệt HN/HCM, gây nhầm lẫn cho Sales.

**Cần làm:**
- Giang/Đức confirm danh sách tên chính xác với Hiếu (F2705-H-01 trong TODO)
- Sau khi có list, update hardcode trong `PaymentRequestDetailDrawer.tsx` hoặc expose qua endpoint `GET /api/v1/config/banks`

**Tạm thời:** Đề xuất format: `"PalFish HN — MB Bank"`, `"PalFish HCM — MB Bank"`, v.v.

---

### 🟢 P2 — Backlog (sau khi P0/P1 xong)

#### B-05 · `payment_lines.downloaded_at`

**Vấn đề:** Khi Kế toán tải file thuế B4, hệ thống không track đơn nào đã được tải.

**Cần làm:**
```sql
ALTER TABLE payment_lines
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz;
```
Endpoint: `POST /api/v1/invoice-courses/{courseCode}/mark-downloaded` (hoặc PATCH batch).

---

#### Bug · Email KH không trả về từ API

**Vấn đề:** Khi Sales tạo PR có nhập Email, nhưng PR detail drawer không hiển thị email. Form tạo gửi `email` lên BE nhưng serializer không trả về.

**Cần làm:**
1. Verify cột `payment_requests.email text` đã tồn tại trên prod (xem `supabase_schema_patch_payment_requests_email.sql`)
2. Nếu chưa có → chạy SQL patch đó
3. Đảm bảo `_serialize_payment_request` trả `"email": row.get("email")` trong response
4. Verify `GET /api/v1/payment-requests` và `GET /api/v1/payment-requests/{id}` đều có field `email`

**FE:** Minh sẽ add hiển thị `pr.email` trong drawer sau khi BE confirm trả đúng.

---

## Checklist ops — SQL patches cần chạy trên prod

Sau khi code xong, chạy theo thứ tự trên **Supabase SQL Editor** (project `jozcvbbypwvzaefteoxn`):

| # | File | Mục đích | Ai chạy |
|---|------|----------|---------|
| 1 | `supabase_schema_patch_active_requests_nullable_pr.sql` | Standalone AR (chưa chạy prod) | Đức |
| 2 | `supabase_schema_patch_payment_requests_email.sql` | Email field trên PR | Đức |
| 3 | `supabase_schema_patch_payment_lines_multi_bill.sql` | Multi-bill (tạo mới) | Giang |
| 4 | `supabase_schema_patch_payment_requests_email.sql` | Email field PR — verify đã chạy chưa | Đức |
| 5 | SQL inline: `ALTER TABLE active_requests ADD COLUMN info_confirmed_at timestamptz` | Thu Hiền confirm AR trước xuất HĐ | Đức |

> Sau mỗi patch: `NOTIFY pgrst, 'reload schema';`

---

## Context kỹ thuật cần biết

### Luồng B1–B4 (Payment Flow)

```
B1: Tạo Payment Request (PR)
  └── Sales tạo PR với tổng tiền + thông tin KH

B2: Reconciliation — thêm lần thanh toán (Payment Lines)
  ├── QR (PayOS) — tự động confirm qua webhook
  └── Cash/Card — pending đến khi Kế toán confirm tay

B3: Activation — tạo Active Request (AR)
  └── Gắn AR vào PR; nhập UID học sinh + course code

B4: Invoice — xuất hóa đơn
  └── Kế toán xuất 3 file Excel ZIP
```

### Files quan trọng (FE)

| File | Vai trò |
|------|---------|
| `frontend/src/contexts/PaymentFlowContext.tsx` | State trung tâm — `updateRequest`, `updateActiveRequest`, `handleAddPayment` |
| `frontend/src/lib/api.ts` | Tất cả endpoint definitions — FE sẽ thêm `.update()` cho PR và AR |
| `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` | UI B1/B2 — nơi Sales sửa thông tin |
| `frontend/src/components/ActivationTab.tsx` | UI B3 — nơi Sales nhập UID/course |

### Files quan trọng (BE)

| File | Vai trò |
|------|---------|
| `backend/payment_request_routes.py` | Routes B1/B2 — thêm PATCH PR ở đây |
| `backend/activation_routes.py` | Routes B3 — thêm PATCH AR ở đây |
| `backend/tax_export.py` | Export XLSX B4 |

### Auth / RBAC

- JWT từ Supabase; decode trong `rbac.py`
- Sale chỉ thao tác trên dữ liệu của mình (`created_by = user_id`)
- Manager+ có thể thao tác tất cả
- `SYSTEM_ADMIN_EMAILS` trong Render env = role System

---

## Communication

Khi xong B-01 + B-02, ping Minh để kết nối FE. FE sẽ test ngay trên `ui/ux` branch.

Nếu cần thêm context về schema hay luồng FE, đọc:
- `docs/FE_HANDOFF_BE_PROMPTS.md` — handoff chi tiết từ sprint trước
- `docs/MODULE_3_4.md` — spec B3/B4 đầy đủ
- `docs/PROJECT.md` — tổng quan kiến trúc
