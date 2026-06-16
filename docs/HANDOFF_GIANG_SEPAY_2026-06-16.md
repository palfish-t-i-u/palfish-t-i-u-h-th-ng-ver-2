# HANDOFF — Giang: Tích hợp SePay vào App GMV

> Tạo: 2026-06-16 · Branch: `feature/sepay-integration`
> Spec kỹ thuật: `docs/sepay_integration_spec_v1.md`

---

## TỔNG QUAN

SePay thay thế Casso — nhận biến động số dư MB Bank (và VCB sau này) realtime qua webhook, tự động khớp với payment_lines trong app, giảm thao tác thủ công cho kế toán.

**Hiện trạng 16/06:**
- Tài khoản SePay đã đăng ký, đã liên kết MB Bank qua API (OTP xong).
- Giang có Admin trên SePay (ID 64529).
- Code backend đã xong trên nhánh `feature/sepay-integration` (3 commits).
- **Chưa deploy, chưa chạy migration, chưa cấu hình webhook.**

---

## CODE ĐÃ CÓ TRÊN NHÁNH

| File | Chức năng |
|------|-----------|
| `backend/sepay_routes.py` | Webhook receiver + cron sync + manual match endpoint |
| `backend/mpos_import.py` | Import file transaction.xls / settlement.xls từ mPOS portal |
| `backend/test_webhook_local.py` | Script test webhook ở local |
| `backend/tests/test_sepay_webhook.py` | Unit test webhook + matching |
| `backend/tests/test_mpos_import.py` | Unit test mPOS import |
| `docs/migrations/2026-06-13-sepay-bank-transactions.sql` | Migration upgrade bảng `bank_transactions` |
| `docs/sepay_integration_spec_v1.md` | Đặc tả kỹ thuật đầy đủ |

### Endpoints đã code:

| Method | Path | Chức năng |
|--------|------|-----------|
| POST | `/webhook/sepay` | Nhận webhook từ SePay (public, verify HMAC/IP) |
| POST | `/api/v1/sepay/sync-pending` | Cron fallback — poll SePay API lấy GD bị miss |
| PATCH | `/api/v1/bank-transactions/{txn_id}/match` | Kế toán khớp tay GD → payment_line |
| POST | `/api/v1/mpos/import-transactions` | Upload file transaction.xls mPOS |
| POST | `/api/v1/mpos/import-settlements` | Upload file settlement.xls mPOS |

---

## VIỆC CẦN LÀM — THEO THỨ TỰ

### Bước 1: Rebase nhánh lên main mới nhất

Nhánh `feature/sepay-integration` đang thiếu ~5 commits từ main (bug hunt 13/06, KPI fixes...).

```bash
git checkout feature/sepay-integration
git fetch origin
git rebase origin/main
# Resolve conflicts nếu có (khả năng cao ở main.py)
git push --force-with-lease
```

### Bước 2: Chạy migration SQL trên Supabase

Mở Supabase SQL Editor → paste nội dung `docs/migrations/2026-06-13-sepay-bank-transactions.sql` → Run.

File này thêm các cột vào bảng `bank_transactions` đã có:
- `sepay_id` (bigint, UNIQUE) — chống duplicate/race condition
- `gateway` — phân biệt nguồn: `sepay_webhook` / `sepay_poll` / `mpos_import` / `manual`
- `match_status` — `pending` / `auto_matched` / `needs_review` / `ignored`
- `raw` (JSONB) — lưu nguyên payload webhook cho audit
- `payment_line_id` — link tới payment_line khi khớp
- `parent_transaction_id` — self-ref FK cho refund/reversal

**Chạy trên Supabase TRƯỚC khi bật webhook, nếu không webhook nhận data mà DB thiếu cột → lỗi.**

### Bước 3: Lấy API Key + Webhook Secret từ SePay

Đăng nhập SePay dashboard (Giang đã có Admin):

1. **API Key:** Sidebar trái → **API Access** → copy API Key
2. **Webhook Secret:** Sidebar trái → **Cấu hình chung** hoặc **API Access** → phần Webhook → copy Secret Key (hoặc tự đặt)

### Bước 4: Set env vars trên Render

Vào Render dashboard → service `palfish-gmv-api` → Environment:

```
SEPAY_WEBHOOK_SECRET=<secret từ bước 3>
SEPAY_API_TOKEN=<api key từ bước 3>
```

Tùy chọn (bật khi go-live thật):
```
SEPAY_ALLOWED_IPS=<dải IP SePay, phân cách bằng dấu phẩy>
```
> Hiện code cho phép tất cả IP khi biến này trống (dev mode). Khi production nên set IP SePay chính thức.

### Bước 5: Đăng ký route trong main.py

Kiểm tra `backend/main.py` đã có dòng register chưa. Nếu chưa, thêm:

```python
from sepay_routes import register_sepay_routes
from mpos_import import register_mpos_routes

register_sepay_routes(app, _supabase)
register_mpos_routes(app, _supabase)
```

### Bước 6: Deploy backend lên Render

Push nhánh hoặc merge vào main → Render auto-deploy.

### Bước 7: Cấu hình webhook trên SePay dashboard

Vào SePay → **Cấu hình chung** → phần Webhook:

- **URL:** `https://palfish-gmv-api.onrender.com/webhook/sepay`
- **Events:** Giao dịch tiền vào (đã tắt tiền ra ở bước liên kết MB)

### Bước 8: Test end-to-end với tiền thật

1. Chuyển khoản 10.000đ vào tài khoản MB đã liên kết, nội dung chứa mã Base36 của 1 payment_line test (vd: `FHB9T`)
2. Kiểm tra:
   - SePay dashboard có hiện GD không
   - Render logs có `[sepay] webhook processed: sepay_id=..., status=auto_matched` không
   - Supabase bảng `bank_transactions` có record mới không
   - `payment_lines` tương ứng đã chuyển status `pending` → `paid` chưa
3. Nếu webhook miss: gọi `POST /api/v1/sepay/sync-pending` để kiểm tra cron fallback

### Bước 9: Verify mPOS settle ignore

Khi có GD thật từ mPOS settle về MB, kiểm tra nội dung CK có match patterns:
- `MPOS SETTLE`, `KET TOAN.*MPOS`, `PAYOO.*SETTLE`, `THANH TOAN THE.*MPOS`

Nếu match → `match_status = ignored` (không cộng nhầm vào doanh thu). Nếu pattern thực tế khác → update regex trong `sepay_routes.py:MPOS_SETTLE_PATTERNS`.

---

## CHƯA LÀM (PHASE SAU)

| Việc | Mô tả | Ưu tiên |
|------|-------|---------|
| FE tab "Biến động số dư" | UI danh sách bank_transactions + filter + manual match | Cao — cần cho kế toán |
| VCB OneQR | Chờ pháp nhân ra chi nhánh VCB mở theo công văn 9335 | Chờ anh Hiếu/anh Uy |
| Payoo API | Chờ Payoo cấp bộ khóa tích hợp + sandbox (đang liên hệ) | Chờ Payoo phản hồi |
| mPOS API | Tạm chặn — mPOS ngừng hỗ trợ tích hợp. Dùng import file Excel thay thế | Chặn bởi mPOS |
| Cron job tự động sync | Render scheduled job gọi `/api/v1/sepay/sync-pending` mỗi 15-30 phút | Sau khi test OK |
| IP Whitelist production | Set `SEPAY_ALLOWED_IPS` khi có dải IP chính thức từ SePay | Trước go-live |

---

## THAM KHẢO

- Handoff cũ (Casso, đã thay): `docs/HANDOFF_task8_casso.md` — FE tab design vẫn tái dùng được
- Pattern webhook: `backend/main.py` → `/webhook/payos`
- RBAC: `backend/rbac.py` → `resolve_actor`, `require_min_role`
- Payment matching: `backend/payment_request_routes.py:917` → `reconcile_payment_line_webhook`

---

## LIÊN HỆ

- **Minh** (Super Admin SePay, ID 64401): setup tài khoản, liên kết bank, env vars
- **Giang** (Admin SePay, ID 64529): code, deploy, cấu hình webhook
- **anh Hiếu**: escalation mPOS, sắp xếp VCB
- **anh Uy**: đại diện pháp nhân
