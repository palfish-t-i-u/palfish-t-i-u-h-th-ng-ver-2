# BE Handoff: Hệ thống đăng nhập mới + Module Tài khoản Auth

**Ngày**: 2026-05-31  
**FE status**: Login/Signup/ForgotPassword → đã hoàn thành. Tài khoản Auth → đang làm.  
**BE PIC**: Đạt

---

## Phần A — Hệ thống đăng nhập mới

### Tổng quan

FE đã xây xong hệ thống login mới gồm 3 màn hình:
- **LoginPage** — Đăng nhập bằng Email + Password (primary), Google OAuth (secondary)
- **SignUpPage** — Form đăng ký đầy đủ: bộ phận, team, email, password, họ tên, SĐT → trạng thái "Chờ admin kích hoạt"
- **ForgotPasswordPage** — 3 bước: nhập email → nhập OTP 6 chữ số → đặt mật khẩu mới

### FE đã thay đổi gì

#### 1. `useAuth.tsx` — Auth hook mới

Các method cũ bị xoá:
- `signInWithEmail(email)` — OTP magic link login
- `signUp(email, meta)` — OTP-based signup

Các method mới:
```typescript
signInWithPassword(email, password)       // → supabase.auth.signInWithPassword()
signUpWithPassword(email, password, meta) // → supabase.auth.signUp()
sendPasswordReset(email)                  // → supabase.auth.resetPasswordForEmail()
verifyOtp(email, token)                   // → supabase.auth.verifyOtp({ type: 'recovery' })
updatePassword(newPassword)               // → supabase.auth.updateUser({ password })
```

#### 2. SignUp metadata

FE gửi metadata khi đăng ký:
```typescript
interface SignUpMeta {
  full_name: string;    // Họ tên trên CRM
  phone: string;        // SĐT (optional)
  department: string;   // "Đội Sale" | "Đội CS" | "Đội HR" | "Marketing"
  team: string;         // "Inhouse 1" | "Inhouse 2" | "HCM" | "Offline Linh Đan" (chỉ khi department=Sale)
}
```

Metadata được truyền vào `supabase.auth.signUp({ options: { data: meta } })` → lưu trong `user_metadata`.

#### 3. Forgot password redirect

```typescript
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/reset-password`
})
```

#### 4. Các file FE đã sửa/tạo

| File | Thay đổi |
|------|----------|
| `frontend/src/hooks/useAuth.tsx` | Xoá OTP methods, thêm password-based methods |
| `frontend/src/pages/LoginPage.tsx` | Viết lại: Email+Password login, Google secondary, link quên MK |
| `frontend/src/pages/SignUpPage.tsx` | Viết lại: form đăng ký đầy đủ, hiện "chờ kích hoạt" sau submit |
| `frontend/src/pages/ForgotPasswordPage.tsx` | **Mới**: 3-step flow (email → OTP → reset password) |
| `frontend/src/components/auth/AuthLayout.tsx` | **Mới**: layout 2 panel (brand left + form right) |
| `frontend/src/components/auth/auth.css` | **Mới**: CSS cho toàn bộ auth UI |
| `frontend/src/components/auth/GoogleIcon.tsx` | **Mới**: Google SVG icon dùng chung |
| `frontend/src/App.tsx` | Thêm route `/forgot-password` |

---

### BE cần làm

#### Task 1: Bật Password-based Auth trên Supabase

Vào Supabase Dashboard → Authentication → Providers:
- Đảm bảo **Email (Password)** provider đã bật
- Đảm bảo **Google OAuth** vẫn bật
- Cấu hình email templates cho: Confirm signup, Reset password

#### Task 2: Middleware chặn tài khoản chưa kích hoạt

Hiện tại `resolve_actor()` trong `rbac.py` cho phép mọi user đã auth vào hệ thống. Cần thêm logic:

```
Flow:
  User đăng ký → user_metadata.is_activated = false (mặc định, Supabase không tự set)
  Admin kích hoạt → set user_metadata.is_activated = true qua PATCH /admin/auth-users/{id}
  Middleware kiểm tra: nếu is_activated != true → trả 403
```

**Lưu ý quan trọng**: Google OAuth user cũng phải qua bước kích hoạt. Khi user Google đăng nhập lần đầu, Supabase tự tạo account nhưng `is_activated` chưa set → cũng bị chặn.

Cụ thể sửa `rbac.py`:
```python
# Trong resolve_actor() hoặc middleware, sau khi lấy user:
user_meta = user.user_metadata or {}
if not user_meta.get("is_activated", False):
    # Cho phép system admin bypass (để admin không tự khoá mình)
    if user.email not in system_admin_emails:
        raise HTTPException(403, "Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin.")
```

#### Task 3: Cập nhật PATCH /admin/auth-users/{id}

Endpoint hiện tại (`admin_routes.py:390`) đã hỗ trợ `banned`, `role`, `crmName`. Cần thêm:

```python
# Body thêm field:
is_activated: Optional[bool] = None

# Logic:
if body.is_activated is not None:
    supabase.auth.admin.update_user_by_id(user_id, {
        "user_metadata": {"is_activated": body.is_activated}
    })
```

Thêm validation: **khi kích hoạt tài khoản (`is_activated=true`), bắt buộc tài khoản đó phải đã liên kết CRM** (có `crmName` hoặc `staff_id`). Nếu chưa liên kết → trả 400 "Cần liên kết CRM trước khi kích hoạt".

#### Task 4: Cập nhật GET /admin/auth-users response

Thêm fields vào response để FE module Tài khoản Auth mới sử dụng:
```python
{
  "id": "...",
  "email": "...",
  "providers": [...],
  "lastSignIn": "...",
  "createdAt": "...",
  "crmName": "...",       # đã có
  "staffRole": "...",     # đã có
  "isBanned": false,      # đã có
  "isActivated": false,   # MỚI — từ user_metadata.is_activated
  "department": "...",    # MỚI — từ user_metadata.department
  "team": "...",          # MỚI — từ user_metadata.team
  "fullName": "...",      # MỚI — từ user_metadata.full_name
  "phone": "..."          # MỚI — từ user_metadata.phone
}
```

#### Task 5: Validate liên kết CRM không trùng lặp

Khi admin liên kết 1 tài khoản Auth với 1 nhân sự CRM (qua `PATCH /admin/auth-users/{id}` với `crmName`):
- Check bảng `nhan_su_sale` có tồn tại `crm_name` này không → 404 nếu không tìm thấy
- Check không có tài khoản Auth nào khác đã liên kết với cùng `crm_name` → 409 nếu trùng
- Mỗi nhân sự CRM chỉ liên kết được với đúng 1 tài khoản Auth (1:1)

#### Task 6: Cấu hình Supabase Redirect URLs

Vào Supabase Dashboard → Authentication → URL Configuration:
- Thêm `https://<production-domain>/reset-password` vào Redirect URLs
- Thêm `http://localhost:5173/reset-password` cho local dev

#### Task 7: Email templates

Customize email templates tại Supabase Dashboard → Authentication → Email Templates:
- **Reset Password**: gửi OTP code 6 chữ số (không phải link) — FE đã xây UI nhập OTP
- **Confirm signup**: thông báo đã đăng ký thành công, chờ admin kích hoạt (không auto-confirm)

---

## Phần B — Module Tài khoản Auth mới (liên quan BE)

### Bối cảnh

Anh Hiếu yêu cầu gộp module "Nhân sự Sale" vào "Tài khoản Auth", biến thành 1 module quản lý tài khoản + liên kết CRM hoàn chỉnh. Prototype HTML đã gửi kèm.

### BE cần hỗ trợ gì cho FE mới

#### 1. GET /admin/auth-users — cần trả thêm data

Ngoài các field đã nêu ở Task 4, FE cần:
- **Thống kê tổng hợp** cho KPI cards: tổng tài khoản, số đã kích hoạt, số đã liên kết CRM, số Leader+Admin. Có thể tính ở FE từ list, hoặc BE trả summary riêng.
- **Filter/search server-side** nếu danh sách lớn: `?q=keyword&department=sale&role=leader&linked=true&activated=true`

#### 2. GET /admin/sales — giữ nguyên cho popup liên kết CRM

Endpoint list nhân sự từ Metabase (`admin_routes.py:176`) giữ nguyên. FE sẽ gọi endpoint này trong popup liên kết CRM (thay vì hiện tab Nhân sự Sale riêng).

#### 3. POST /admin/sales/sync — giữ nguyên

Nút "Sync Metabase" trong popup vẫn gọi endpoint này (`admin_routes.py:251`).

**Lưu ý từ anh Hiếu**: Sync chỉ THÊM nhân sự mới, không xoá nhân sự đã có. Dữ liệu tích luỹ qua mỗi lần sync (hôm nay 50 người, mai sync thêm 5 → 55 người, không bao giờ giảm).

#### 4. POST /admin/auth-users (MỚI — Optional)

Nút "Thêm tài khoản" cho phép admin tạo account trực tiếp (không cần user tự đăng ký):
```python
# Body:
{
  "email": "...",
  "password": "...",       # admin set mật khẩu ban đầu, user đổi sau
  "full_name": "...",
  "phone": "...",
  "department": "...",
  "team": "...",
  "crmName": "...",        # optional — liên kết CRM luôn
  "role": "user",          # optional
  "is_activated": true     # optional — kích hoạt luôn
}

# Logic:
supabase.auth.admin.create_user({
  "email": body.email,
  "password": body.password,
  "user_metadata": { full_name, phone, department, team, is_activated },
  "email_confirm": True  # skip email verification vì admin tạo
})
```

---

## Test plan

### Đăng nhập / Đăng ký
1. Đăng ký account mới → verify `user_metadata` có đủ `full_name`, `phone`, `department`, `team`
2. Thử đăng nhập account chưa kích hoạt → expect 403 "Tài khoản chưa được kích hoạt"
3. Admin liên kết CRM cho account mới → verify `crmName` được set
4. Admin kích hoạt account (đã liên kết CRM) → verify `is_activated=true`
5. Thử kích hoạt account chưa liên kết CRM → expect 400 "Cần liên kết CRM trước"
6. Đăng nhập account đã kích hoạt → expect success
7. Google OAuth lần đầu → expect tài khoản tạo với `is_activated=false`, xuất hiện trong danh sách Tài khoản Auth

### Quên mật khẩu
8. Forgot password → nhập email tồn tại → nhận OTP 6 số qua email
9. Nhập OTP đúng → đặt mật khẩu mới → đăng nhập bằng mật khẩu mới thành công
10. Nhập OTP sai/hết hạn → expect lỗi "Mã OTP không đúng hoặc đã hết hạn"

### Liên kết CRM
11. Admin liên kết 2 tài khoản với cùng 1 `crmName` → expect 409 trùng lặp
12. Admin liên kết tài khoản với `crmName` không tồn tại → expect 404

### Tài khoản Auth module
13. GET /admin/auth-users trả đầy đủ fields mới (isActivated, department, team, fullName, phone)
14. Sync Metabase → dữ liệu nhân sự chỉ thêm, không mất record cũ
