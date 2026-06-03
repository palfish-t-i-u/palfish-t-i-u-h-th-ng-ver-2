# Backend Audit Handoff — 2026-06-03

> Kết quả kiểm tra toàn bộ 13 module backend (FastAPI/Python).
> Mỗi task có: **Chuyện gì xảy ra?** (ví dụ thực tế), hướng fix kỹ thuật, và mức ưu tiên.

---

## Phân công

| Người | Phạm vi | Tasks |
|-------|---------|-------|
| **Đức** | Database — schema, query, race condition | DB-01 → DB-07 |
| **Đạt** | Quyền — auth, RBAC, CORS | AUTH-01 → AUTH-07 |
| **Giang** | Còn lại — webhook, encrypt, audit, config | OTHER-01 → OTHER-08 |

> **Fallback**: Nếu cả 3 không có thời gian → giao cho Claude. Xem mục [Hướng dẫn giao cho Claude](#hướng-dẫn-giao-cho-claude) cuối tài liệu.

---

## Đức — Database Tasks

### DB-01 · P0 · Trùng mã đơn hàng khi 2 sale tạo đơn cùng lúc

**File**: `backend/main.py` ~dòng 228

**Chuyện gì xảy ra?**
Sale An tạo đơn hàng lúc 10:05:03, cùng lúc sale Bình cũng bấm tạo đơn. Hệ thống đọc mã cuối là KH042, rồi cấp KH043 cho **cả hai đơn**. Kết quả: 2 đơn hàng của 2 khách hàng khác nhau nhưng mang **cùng mã KH043**. Khi đối soát hoặc xuất hoá đơn, kế toán không phân biệt được đơn nào là đơn nào. Bug này hiếm khi xảy ra (chỉ khi bấm đúng cùng giây), nhưng **một lần xảy ra = rất khó phát hiện và sửa**.

**Fix**:
1. Tạo Postgres sequence:
```sql
CREATE SEQUENCE IF NOT EXISTS don_hang_seq START 1;
```
2. Thay logic Python bằng:
```python
result = supabase.rpc("nextval_don_hang").execute()
seq = result.data  # số tự tăng, DB đảm bảo không trùng
ma_don = f"KH{seq:03d}"
```
3. Hoặc tạo DB function:
```sql
CREATE OR REPLACE FUNCTION next_ma_don(prefix text DEFAULT 'KH')
RETURNS text AS $$
DECLARE seq_val bigint;
BEGIN
  seq_val := nextval('don_hang_seq');
  RETURN prefix || lpad(seq_val::text, 3, '0');
END;
$$ LANGUAGE plpgsql;
```

**Test**: Gọi 10 request tạo đơn đồng thời → verify không trùng mã.

---

### DB-02 · P0 · Trùng mã hoá đơn thuế khi 2 người bấm "Xuất HD" cùng lúc

**File**: `backend/invoice_routes.py` ~dòng 96

**Chuyện gì xảy ra?**
Ops Lan và ops Mai cùng vào Module 4, mỗi người chọn 1 batch đơn hàng khác nhau rồi bấm "Xuất hoá đơn". Hệ thống cấp mã hoá đơn **M-030626-001** cho cả 2 batch. Kết quả: **2 file hoá đơn thuế khác nhau nhưng mang cùng số**. Khi nộp cho cơ quan thuế hoặc gửi khách hàng → trùng số hoá đơn = **vi phạm quy định thuế**, phải huỷ và xuất lại.

**Fix**: Tương tự DB-01 — tạo 2 sequence:
```sql
CREATE SEQUENCE IF NOT EXISTS invoice_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;
```
Thay `_alloc_sequences()` bằng `nextval()` call.

**Test**: 2 người bấm "Xuất hoá đơn" cùng lúc → verify mã không trùng.

---

### DB-03 · P0 · Trùng mã phiếu thu khi 2 sale tạo phiếu thu cùng lúc

**File**: `backend/payment_request_routes.py` ~dòng 707

**Chuyện gì xảy ra?**
Sale Cường tạo phiếu thu cho học viên A, cùng lúc sale Dung tạo phiếu thu cho học viên B. Cả hai phiếu đều nhận mã **PR-2026-0088**. Khi ops đối soát ngân hàng, thấy 1 khoản chuyển ghi PR-2026-0088 nhưng **không biết khớp với phiếu nào** → phải liên hệ từng sale hỏi lại.

**Fix**: Tạo sequence:
```sql
CREATE SEQUENCE IF NOT EXISTS payment_request_seq START 1;
```

---

### DB-04 · P1 · 2 người sửa cùng 1 yêu cầu kích hoạt → thay đổi của người trước bị mất

**File**: `backend/activation_routes.py` ~dòng 1182

**Chuyện gì xảy ra?**
Yêu cầu kích hoạt AR-100 có 3 học viên. Sale An vào sửa UID của học viên 1, cùng lúc sale Bình sửa UID của học viên 2. Hệ thống đọc dữ liệu cũ cho cả hai → An lưu trước (UID 1 đã sửa) → Bình lưu sau (ghi đè bằng bản cũ + chỉ thay UID 2). Kết quả: **thay đổi của An bị mất**, UID học viên 1 quay lại giá trị cũ mà không ai biết.

**Fix**: Dùng Postgres `jsonb_set()` trong 1 query duy nhất thay vì read-modify-write:
```sql
UPDATE active_requests
SET uids_data = jsonb_set(uids_data, '{key}', '"new_value"')
WHERE id = $1;
```
Hoặc dùng RPC function để đảm bảo atomic.

---

### DB-05 · P1 · Lưu KPI tháng bị lỗi giữa chừng → mất toàn bộ KPI tháng đó

**File**: `backend/report_routes.py` ~dòng 103

**Chuyện gì xảy ra?**
Manager vào cài đặt KPI tháng 6: tỷ giá, chỉ tiêu từng sale, v.v. Bấm Lưu → hệ thống **xoá hết KPI cũ của tháng 6 trước**, rồi mới ghi KPI mới. Nếu lúc ghi mới bị lỗi (mạng đứt, server quá tải) → KPI cũ đã bị xoá, KPI mới chưa ghi xong → **toàn bộ KPI tháng 6 biến mất**. Manager phải nhập lại từ đầu.

**Fix**: Wrap trong transaction:
```python
# Dùng supabase.rpc() gọi một function PL/pgSQL
# hoặc dùng pattern: insert mới trước, rồi delete cũ
```
Pattern an toàn hơn: **insert new rows → delete old rows** (thay vì ngược lại).

---

### DB-06 · P1 · Dashboard BXH bị đơ/crash khi có nhiều dữ liệu doanh thu

**File**: `backend/dashboard_routes.py` ~dòng 177

**Chuyện gì xảy ra?**
Sale vào Dashboard xem BXH doanh thu. Hệ thống phải load **toàn bộ** bảng sổ doanh thu vào bộ nhớ server để tính xếp hạng. Hiện tại dữ liệu còn ít nên chạy ổn. Nhưng khi dữ liệu tích luỹ (vài tháng, nhiều sale) → server phải giữ hàng chục nghìn dòng trong RAM cùng lúc → **app bị chậm hoặc crash**, ảnh hưởng tất cả user đang dùng app, không chỉ người mở Dashboard.

**Fix**: Thêm giới hạn số dòng tối đa:
```python
MAX_ROWS = 50_000
rows = []
while len(rows) < MAX_ROWS:
    page = query.range(offset, offset + 999).execute()
    rows.extend(page.data)
    if len(page.data) < 1000:
        break
    offset += 1000
```

---

### DB-07 · P1 · Báo cáo BC01/BC02 bị chậm/đơ khi date range rộng

**File**: `backend/revenue_routes.py` ~dòng 661

**Chuyện gì xảy ra?**
Manager mở báo cáo BC01 (đối chiếu thu hiện) chọn date range cả năm 2026. Hệ thống load **tất cả dòng doanh thu trong năm** vào bộ nhớ. Cùng vấn đề như DB-06 — dữ liệu càng nhiều → server càng chậm, có thể crash.

**Fix**: Cùng pattern — thêm hard cap + log warning khi gần limit.

---

## Đạt — Permission/Auth Tasks

### AUTH-01 · P0 · Ai cũng xem/tạo/xoá được yêu cầu kích hoạt — không cần đăng nhập

**File**: `backend/activation_routes.py`

**Endpoints thiếu auth**:
- `GET /api/v1/active-requests` (~dòng 903)
- `POST /api/v1/active-requests` (~dòng 1092)
- `DELETE /api/v1/active-requests/{id}` (~dòng 997)
- `PATCH /api/v1/active-requests/{id}` và các sub-routes

**Chuyện gì xảy ra?**
Module B3 (yêu cầu kích hoạt khoá học) hiện **không kiểm tra ai đang gọi**. Bình thường user đăng nhập qua app nên không thấy vấn đề. Nhưng: một nhân viên cũ đã bị xoá tài khoản app vẫn có thể mở Postman/trình duyệt, gõ URL API trực tiếp → **xem toàn bộ danh sách kích hoạt, tạo yêu cầu giả, hoặc xoá yêu cầu của người khác** mà hệ thống không chặn. Hoặc đơn giản: ai đó vô tình share link API → bất kỳ ai mở link đều thấy dữ liệu.

**Fix**: Thêm `resolve_actor()` giống pattern đã dùng trong các module khác:
```python
@router.get("/api/v1/active-requests")
async def list_active_requests(request: Request, ...):
    actor = await resolve_actor(request)  # thêm dòng này
    if not actor:
        raise HTTPException(401, "Unauthorized")
    # ... phần còn lại giữ nguyên
```

`resolve_actor()` đã có sẵn trong `rbac.py`, FE đã gửi token trong header → **user không cần làm gì khác**.

---

### AUTH-02 · P0 · Ai cũng xem được báo cáo doanh thu BC03 — không cần đăng nhập

**File**: `backend/report_routes.py` ~dòng 431

**Chuyện gì xảy ra?**
Báo cáo BC03 chứa **doanh thu chi tiết theo từng sale, từng team, từng tháng** — thông tin nhạy cảm nhất của công ty. Nhưng API này không kiểm tra đăng nhập. Nếu ai biết URL (ví dụ nhân viên cũ, đối thủ) → mở trình duyệt gõ vào → **thấy hết doanh thu toàn công ty**.

**Fix**: Tương tự AUTH-01. Thêm `resolve_actor()` + check role ≥ leader hoặc manager.

---

### AUTH-03 · P0 · Ai cũng ghi đè được CRM token — phá hỏng luồng đồng bộ CRM

**File**: `backend/crm_routes.py` ~dòng 1291

**Chuyện gì xảy ra?**
CRM token là "chìa khoá" để hệ thống tự động kéo dữ liệu từ PalFish CRM về. Endpoint cập nhật token này **không kiểm tra ai đang gọi**. Nếu ai đó (vô tình hay cố ý) gửi request ghi đè token bằng giá trị rác → **toàn bộ luồng đồng bộ CRM chết**, Module 5 không kéo được dữ liệu mới cho đến khi team phát hiện và cập nhật lại token đúng.

**Fix**:
```python
@router.post("/system/update-crm-token")
async def update_crm_token(request: Request, ...):
    actor = await resolve_actor(request)
    if not actor or actor.role_level < 3:  # chỉ manager+
        raise HTTPException(403, "Forbidden")
    # ...
```

---

### AUTH-04 · P0 · Ai cũng đánh dấu "đã thanh toán" được — không cần đăng nhập

**File**: `backend/payment_request_routes.py`

**Endpoints**:
- `PATCH /transactions/{id}/status` (~dòng 1319)
- `POST /sync-pending-payos` (~dòng 1178)
- `DELETE /payment-lines/{id}/bills/latest` (~dòng 1443)

**Chuyện gì xảy ra?**
Endpoint thay đổi trạng thái giao dịch (chưa thanh toán → đã thanh toán) **không kiểm tra quyền**. Một sale có thể tự đánh dấu phiếu thu của mình là "đã thanh toán" dù khách chưa chuyển tiền → **doanh thu ảo**, ops tin rằng tiền đã về nhưng thực tế chưa. Ngoài ra, endpoint xoá bill cũng không kiểm tra → ai cũng xoá được ảnh bill của người khác.

**Fix**: Thêm `resolve_actor()`. Với `PATCH status` → check `can_confirm_payment()`.

---

### AUTH-05 · P0 · Ai cũng xem được danh sách team/nhân sự — không cần đăng nhập

**File**: `backend/dashboard_routes.py` ~dòng 861

**Chuyện gì xảy ra?**
Endpoint lọc Dashboard trả về **tên tất cả team, tên tất cả sale, cấu trúc phòng ban**. Không cần đăng nhập. Đây là thông tin nội bộ — lộ ra ngoài thì biết công ty có bao nhiêu sale, team nào, ai phụ trách gì.

**Fix**: Thêm `resolve_actor()`. Endpoint này trả về tên team/sale → cần ít nhất role sale.

---

### AUTH-06 · P1 · Website lạ trên Vercel có thể gọi API như thể là app chính thức

**File**: `backend/main.py` ~dòng 71

**Chuyện gì xảy ra?**
Hiện tại backend cho phép **bất kỳ website nào đặt trên Vercel** (hàng triệu site) gọi API. Giả sử ai đó tạo 1 trang web giả trên Vercel, gửi link cho sale bảo "vào xem thông tin mới" → khi sale đã login app chính trước đó, trang giả này có thể **âm thầm gọi API lấy dữ liệu** bằng phiên đăng nhập của sale đó.

**Hiện tại**: `allow_origin_regex=r"https://.*\.vercel\.app"` → mọi app Vercel đều gọi được.

**Fix**: Siết regex theo project name:
```python
allow_origin_regex=r"https://(pf-gmv|palfish).*\.vercel\.app"
```
Hoặc dùng whitelist chính xác:
```python
allow_origins=[
    "https://pf-gmv-reconciliation.vercel.app",
    "http://localhost:5173",
]
```

**Lưu ý**: Test với Vercel preview URLs trước khi deploy.

---

### AUTH-07 · P2 · Mỗi lần kiểm tra quyền, hệ thống đọc thừa 500 dòng vô nghĩa

**File**: `backend/rbac.py` ~dòng 102

**Chuyện gì xảy ra?**
Khi user gọi bất kỳ API nào cần kiểm tra quyền, nếu email không tìm thấy trong bảng nhân sự → hệ thống đọc thêm 500 dòng dữ liệu nhân sự **không có email** rồi... không dùng gì cả. Không gây lỗi, nhưng **mỗi request chậm thêm vài chục mili giây** vô ích, và tạo tải thừa lên database.

**Fix**: Bỏ query thừa, return `None` trực tiếp khi không match email.

---

## Giang — Other Tasks

### OTHER-01 · P0 · Ai cũng có thể giả thông báo "đã thanh toán" từ PayOS

**File**: `backend/main.py` ~dòng 1026

**Chuyện gì xảy ra?**
Khi khách thanh toán qua QR, PayOS gửi thông báo (webhook) về server: "đơn X đã thanh toán xong". Hiện tại server **tin bất kỳ ai gửi thông báo đến**, không kiểm tra xem có thật sự từ PayOS hay không. Nếu ai đó biết URL webhook (ví dụ từ log cũ, từ code) → gửi 1 thông báo giả: "đơn Y đã thanh toán" → hệ thống **tự động đánh dấu đơn đó = đã thu tiền** dù thực tế khách chưa chuyển đồng nào. Ops nhìn vào thấy "done" → không đòi tiền nữa.

**Fix**:
```python
import hmac, hashlib

@app.post("/payos-webhook")
async def payos_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-payos-signature", "")
    
    expected = hmac.new(
        PAYOS_CHECKSUM_KEY.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(400, "Invalid signature")
    
    # ... xử lý webhook bình thường
```

**Lưu ý**: `PAYOS_CHECKSUM_KEY` lấy từ PayOS dashboard → thêm vào env var trên Render.

---

### OTHER-02 · P0 · 2 link thanh toán QR tạo cùng lúc có thể bị trùng mã

**File**: `backend/payos_qr.py` ~dòng 79

**Chuyện gì xảy ra?**
Sale An gửi link QR cho khách A, cùng lúc sale Bình gửi link cho khách B. Mã giao dịch PayOS được tạo từ thời gian hiện tại (tính bằng mili giây). Nếu 2 request rơi vào cùng 1 mili giây → **trùng mã**. PayOS sẽ **từ chối tạo link thứ 2**, sale Bình nhận lỗi, phải thử lại. Hoặc tệ hơn: link thứ 2 bị map nhầm vào đơn của khách A.

**Fix**: Dùng DB sequence (phối hợp với Đức) hoặc thêm random suffix:
```python
import random
order_code = int(time.time() * 1000) * 1000 + random.randint(0, 999)
order_code = order_code % 9_007_199_254_740_991
```
Hoặc tốt hơn — dùng Postgres sequence riêng cho PayOS order code.

---

### OTHER-03 · P1 · Nếu database bị lộ → mất luôn quyền truy cập CRM PalFish

**File**: `backend/crm_routes.py` ~dòng 1302

**Chuyện gì xảy ra?**
CRM token (cookie đăng nhập PalFish) được lưu trong DB **dưới dạng đọc được** (plaintext). Ai có quyền xem database (nhân viên kỹ thuật, hoặc nếu DB bị hack) → đọc được token → **đăng nhập vào CRM PalFish bằng tài khoản của công ty**, xem toàn bộ dữ liệu khách hàng, đơn hàng, hoặc thao tác trên CRM.

**Fix**: Encrypt bằng Fernet (symmetric):
```python
from cryptography.fernet import Fernet

# Key từ env var
FERNET_KEY = os.getenv("CRM_ENCRYPT_KEY")
cipher = Fernet(FERNET_KEY)

# Khi lưu:
encrypted = cipher.encrypt(token_json.encode()).decode()

# Khi đọc:
decrypted = cipher.decrypt(encrypted.encode()).decode()
```

**Setup**:
1. Generate key: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
2. Thêm `CRM_ENCRYPT_KEY` vào Render env vars
3. Thêm `cryptography` vào `requirements.txt`
4. Migrate data cũ: đọc plaintext → encrypt → write lại

---

### OTHER-04 · P1 · Xoá dòng doanh thu không để lại dấu vết — không biết ai xoá, khi nào

**File**: `backend/revenue_routes.py` ~dòng 1385

**Chuyện gì xảy ra?**
Sổ doanh thu có ghi lại lịch sử khi **tạo mới** và **sửa** (ai làm, lúc nào, sửa gì). Nhưng khi **xoá** thì không ghi gì cả. Nếu một dòng doanh thu 50 triệu biến mất → không có cách nào biết ai đã xoá, lúc mấy giờ, dòng đó chứa gì. Manager phải hỏi từng người.

**Fix**:
```python
@router.delete("/api/v1/revenue-ledger/{id}")
async def delete_ledger(id: str, request: Request):
    actor = await resolve_actor(request)
    # ... xoá logic ...
    
    # Thêm audit log
    _write_audit(
        supabase, actor,
        action="delete",
        entity_type="revenue_ledger",
        entity_id=id,
        old_data=existing_record  # snapshot trước khi xoá
    )
```

---

### OTHER-05 · P1 · Xuất hoá đơn bị lỗi giữa chừng → đơn "đã xuất" nhưng không có file

**File**: `backend/invoice_routes.py` ~dòng 714

**Chuyện gì xảy ra?**
Ops bấm "Xuất hoá đơn" cho 10 đơn. Hệ thống đánh dấu 10 đơn = "Đã xuất HD" trong DB, rồi bắt đầu tạo file ZIP. Nếu tạo file bị lỗi (thiếu dữ liệu, server quá tải) → ops **không nhận được file ZIP**, nhưng 10 đơn đã bị chuyển trạng thái "Đã xuất HD". Ops không thể bấm xuất lại (vì hệ thống nghĩ đã xuất rồi). Phải nhờ dev sửa tay trạng thái trong DB.

**Fix**: Thêm `export_batch_id` (UUID) vào request. Check nếu batch đã export trước đó → trả lại ZIP cũ thay vì allocate sequence mới.

---

### OTHER-06 · P2 · Xoá hàng loạt user bị lỗi giữa chừng → xoá một nửa, một nửa còn lại

**File**: `backend/admin_routes.py` ~dòng 881

**Chuyện gì xảy ra?**
Admin chọn 5 tài khoản nhân viên cũ để xoá. Hệ thống xoá từng cái một. Xoá được 3 rồi lỗi → 3 cái đã xoá (không rollback), 2 cái còn nguyên, nhưng API trả về lỗi chung → admin **không biết cái nào đã xoá cái nào chưa**.

**Fix**: Collect errors, return partial result rõ ràng:
```python
results = {"deleted": [], "failed": []}
for uid in user_ids:
    try:
        # delete logic
        results["deleted"].append(uid)
    except Exception as e:
        results["failed"].append({"uid": uid, "error": str(e)})
return results
```

---

### OTHER-07 · P2 · Server chưa cấu hình → tự chạy production → gửi thông báo thật, dùng PayOS thật

**File**: `backend/env_utils.py` ~dòng 9

**Chuyện gì xảy ra?**
Khi setup server mới mà quên đặt biến môi trường `APP_ENV`, hệ thống **tự mặc định = production**. Nghĩa là: gửi thông báo DingTalk thật (team nhận alert giả), dùng PayOS production (tạo link thanh toán thật). Nếu dev test trên server mới mà quên cấu hình → vô tình tạo ra giao dịch thật hoặc spam nhóm DingTalk.

**Fix**: Đổi default thành `"development"`:
```python
def app_env() -> str:
    return os.getenv("APP_ENV", "development")  # safe default
```

---

### OTHER-08 · P2 · Thêm team mới (VD: "Tele Sale Thái") phải sửa code, và tên team viết khác chữ hoa/thường thì bị lọt

**File**: `backend/vn_staff.py`

**Chuyện gì xảy ra?**
Hệ thống lọc nhân sự VN bằng cách loại trừ team Thái/Úc. Danh sách team bị loại trừ **viết cứng trong code**. Nếu công ty mở thêm team mới (ví dụ "Sales Lào") → phải nhờ dev sửa code và deploy lại. Ngoài ra, nếu trong CRM ghi "tele sale" (viết thường) thay vì "Tele Sale" (viết hoa) → hệ thống **không nhận ra**, nhân viên Thái/Úc lọt vào báo cáo VN → sai số liệu.

**Fix**:
```python
NON_VN_TEAMS = {t.lower() for t in os.getenv("NON_VN_TEAMS", "Tele Sale,...").split(",")}

def is_vn_staff(team: str) -> bool:
    return team.lower() not in NON_VN_TEAMS
```

---

## Checklist tổng hợp

| Task | Mô tả ngắn | Người | P | Status |
|------|------------|-------|---|--------|
| DB-01 | Trùng mã đơn hàng khi 2 sale tạo cùng lúc | Đức | P0 | ⬜ |
| DB-02 | Trùng mã hoá đơn thuế khi 2 người xuất cùng lúc | Đức | P0 | ⬜ |
| DB-03 | Trùng mã phiếu thu khi 2 sale tạo cùng lúc | Đức | P0 | ⬜ |
| DB-04 | Sửa yêu cầu kích hoạt cùng lúc → mất thay đổi | Đức | P1 | ⬜ |
| DB-05 | Lưu KPI lỗi giữa chừng → mất KPI cả tháng | Đức | P1 | ⬜ |
| DB-06 | Dashboard BXH bị đơ khi nhiều dữ liệu | Đức | P1 | ⬜ |
| DB-07 | Báo cáo BC01/BC02 chậm/đơ khi date range rộng | Đức | P1 | ⬜ |
| AUTH-01 | Ai cũng xem/xoá được yêu cầu kích hoạt (B3) | Đạt | P0 | ⬜ |
| AUTH-02 | Ai cũng xem được báo cáo doanh thu BC03 | Đạt | P0 | ⬜ |
| AUTH-03 | Ai cũng ghi đè được CRM token | Đạt | P0 | ⬜ |
| AUTH-04 | Ai cũng đánh dấu "đã thanh toán" được | Đạt | P0 | ⬜ |
| AUTH-05 | Ai cũng xem được danh sách team/nhân sự | Đạt | P0 | ⬜ |
| AUTH-06 | Website lạ trên Vercel gọi được API | Đạt | P1 | ⬜ |
| AUTH-07 | Kiểm tra quyền đọc thừa 500 dòng vô nghĩa | Đạt | P2 | ⬜ |
| OTHER-01 | Giả thông báo PayOS → doanh thu ảo | Giang | P0 | ⬜ |
| OTHER-02 | Trùng mã QR khi 2 link tạo cùng lúc | Giang | P0 | ⬜ |
| OTHER-03 | CRM token đọc được nếu DB bị lộ | Giang | P1 | ⬜ |
| OTHER-04 | Xoá doanh thu không để lại dấu vết | Giang | P1 | ⬜ |
| OTHER-05 | Xuất HD lỗi → đơn "đã xuất" nhưng không có file | Giang | P1 | ⬜ |
| OTHER-06 | Xoá user hàng loạt lỗi → xoá nửa chừng | Giang | P2 | ⬜ |
| OTHER-07 | Server mới tự chạy production, gửi thông báo thật | Giang | P2 | ⬜ |
| OTHER-08 | Thêm team mới phải sửa code, chữ hoa/thường bị lọt | Giang | P2 | ⬜ |

---

## Thứ tự triển khai đề xuất

**Đợt 1 — P0** (tuần này):
1. AUTH-01 → AUTH-05: Thêm auth vào tất cả endpoint thiếu (ít rủi ro, pattern đã có sẵn)
2. OTHER-01: Verify PayOS webhook (ngăn giả thanh toán)
3. DB-01 → DB-03: Postgres sequences cho mã đơn/hoá đơn/PR

**Đợt 2 — P1** (tuần sau):
4. AUTH-06: Siết CORS (test kỹ Vercel preview URLs)
5. DB-04 → DB-07: Atomic operations + bounded queries
6. OTHER-03 → OTHER-05: Encrypt, audit log, idempotency

**Đợt 3 — P2** (khi rảnh):
7. AUTH-07, OTHER-06 → OTHER-08: Cleanup

---

## Bộ test kiểm tra tự động

Đã có bộ test pytest tại `backend/tests/` — 31 test cases cover toàn bộ 22 tasks.

**Chạy nhanh**:
```bash
cd backend && pip install pytest && python -m pytest tests/ -q
```

**Chạy theo người phụ trách**:
```bash
python -m pytest tests/test_audit_auth.py -q    # Đạt
python -m pytest tests/test_audit_db.py -q       # Đức
python -m pytest tests/test_audit_other.py -q    # Giang
```

**Cách verify commit của team BE**:
1. Checkout commit/branch cần kiểm tra
2. Chạy `cd backend && python -m pytest tests/ -q`
3. Test PASS = fix đã đúng. Test FAIL = chưa fix hoặc fix chưa đúng.

Trạng thái baseline (commit `8531f62`): **29 FAIL, 2 PASS** — đúng (chưa fix gì).

---

## Hướng dẫn giao cho Claude

Nếu team BE không có thời gian, giao lại cho Minh → Minh bảo Claude fix.

**Cách dùng**: Mở Claude Code trong project này, nói:

```
Đọc file docs/HANDOFF_BE_AUDIT_2026-06-03.md, sau đó fix task [MÃ TASK]
```

Ví dụ:
- "Đọc handoff rồi fix AUTH-01" → Claude sẽ thêm auth vào activation routes
- "Đọc handoff rồi fix DB-01, DB-02, DB-03" → Claude sẽ tạo Postgres sequences
- "Đọc handoff rồi fix tất cả P0" → Claude sẽ fix toàn bộ P0 theo thứ tự

**Lưu ý cho Claude**: Mỗi task fix xong → chạy `cd backend && python -m pytest tests/ -q` để verify fix đã đúng. Với DB tasks → tạo SQL migration file trong `docs/` trước khi apply.
