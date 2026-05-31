# Cấu hình Auth — SMTP (fix rate limit) & Google OAuth

> Làm trên Supabase Dashboard. Không cần sửa code app (trừ redirect Google đã có sẵn trong `useAuth.tsx`).

---

## 0. Fix lỗi "Error sending confirmation email" (khuyến nghị production)

**Cách nhanh + free nhất:** Supabase Dashboard → **Authentication** → **Providers** → **Email** → tắt **Confirm email** → **Save**.

- Đúng toggle: **Confirm email** (User Signups). **Không** nhầm **Secure email change** (toggle khác).
- User đăng ký qua Google hoặc magic link → vào app ngay, không cần email xác nhận.
- FE đã ưu tiên nút **Đăng ký bằng Google** trên `SignUpPage`.
- Nếu vẫn bật Confirm email: cần Resend domain verify (§1) — `onboarding@resend.dev` chỉ gửi được tới email chủ tài khoản Resend.

---

## 1. Fix lỗi `email rate limit exceeded` (Resend — free)

Supabase built-in SMTP free chỉ ~**3–4 email/giờ** → dễ chặn khi nhiều người đăng ký/đăng nhập.

### Bước 1 — Resend

1. Đăng ký [resend.com](https://resend.com) (free, không cần thẻ).
2. **API Keys** → Create API Key → copy key.

### Bước 2 — Supabase Custom SMTP

**Authentication** → **Emails** → **SMTP Settings** → Enable:

| Field | Giá trị |
|-------|--------|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | API key Resend |
| Sender email | Domain đã verify, hoặc tạm `onboarding@resend.dev` |
| Sender name | `PalFish GMV` |

### Bước 3 — Tăng rate limit

**Authentication** → **Rate Limits** → **Emails per hour** → đặt **30** hoặc cao hơn.

### Bước 4 — Unblock email Giang

**Authentication** → **Users** → tìm `dinhgiang6492@gmail.com` → đợi 1h hoặc xóa user test cũ → gửi lại magic link.

---

## 2. Google Sign-in

Code FE đã có nút **Đăng nhập bằng Google** (`LoginPage`, `useAuth.signInWithGoogle`).

### Bước 1 — Google Cloud Console

1. [console.cloud.google.com](https://console.cloud.google.com) → project → **APIs & Services** → **Credentials**.
2. **Create OAuth client ID** → **Web application**.
3. **Authorized redirect URIs** (lấy từ Supabase):

   ```
   https://jozcvbbypwvzaefteoxn.supabase.co/auth/v1/callback
   ```

4. Lưu **Client ID** + **Client Secret**.

### Bước 2 — Supabase

**Authentication** → **Providers** → **Google** → Enable → paste Client ID + Secret.

**URL Configuration** (đã deploy Vercel):

| Mục | Giá trị |
|-----|---------|
| Site URL | `https://palfish-gmv-manager.vercel.app` |
| Redirect URLs | `https://palfish-gmv-manager.vercel.app/**` |
| Redirect URLs (local dev) | Thêm từng dòng — **bắt buộc** nếu login trên `localhost`: |
| | `http://localhost:5173/**` |
| | `http://localhost:5174/**` |
| | `http://localhost:5175/**` |
| | `http://127.0.0.1:5173/**` |

**Lưu ý:** Site URL giữ Vercel (production). Redirect URLs phải có localhost — nếu thiếu, Google/magic link sau login nhảy về `vercel.app` dù mở app từ `localhost:5175`.

### Bước 3 — Test

Production → Login → **Đăng nhập bằng Google** → consent → về app có session.

Lỗi `Unsupported provider: provider is not enabled` → chưa Enable Google trên Supabase Providers.

---

## 3. Troubleshooting

| Lỗi | Fix |
|-----|-----|
| `email rate limit exceeded` | Bật Resend SMTP (§1), tăng Rate Limits, đợi 1h hoặc dùng Google |
| Google provider not enabled | Supabase → Providers → Google → Enable + Client ID/Secret |
| `/me` fail, UI role `(sale)` | Render thiếu `SUPABASE_SERVICE_ROLE_KEY` — xem `DEPLOY.md` §3.1 |
| `Error sending confirmation email` | Confirm email vẫn bật hoặc SMTP chưa verify | §0: tắt Confirm email; ưu tiên Google signup |
| Reset MK email có link, không có OTP | Template Reset Password chưa đổi sang `{{ .Token }}` | §5: sửa template, xóa `ConfirmationURL` |
| Bấm link reset → về trang login | Route `/reset-password` thiếu hoặc GuestRoute redirect | Đã fix FE: route + `AuthFlowRoute` |
| Gửi OTP / gửi lại không thấy mail | Rate limit SMTP, email chưa đăng ký password, spam | §1 Resend SMTP; dùng email đã signup Email+Password |

**Session (Supabase Free):** không cấu hình Time-box / Inactivity timeout (chỉ Pro). Session giữ qua refresh token + browser; đăng xuất thủ công hoặc xóa site data.

---

## 4. Checklist

```
[x] Resend SMTP bật trên Supabase
[x] Rate limit email ≥ 30/giờ
[x] Google OAuth client + Supabase provider bật
[x] Google login production OK
[ ] Tắt Confirm email trên Supabase (khuyến nghị — §0)
[ ] Verify domain Resend (thay onboarding@resend.dev) — chỉ khi vẫn bật Confirm email
```

---

## 5. Login mới + kích hoạt tài khoản (2026-05-31)

### Supabase Authentication

| Mục | Khuyến nghị |
|-----|-------------|
| Email + Password | **Bật** |
| Google OAuth | **Bật** (vẫn qua gate `is_activated`) |
| Confirm email (signup) | **Tắt** — user chờ admin kích hoạt, không cần confirm thêm |

### Quên mật khẩu — OTP (khớp FE)

FE dùng **3 bước OTP nhập tay** (`ForgotPasswordPage` + `verifyOtp type: recovery`).

**Bắt buộc** sửa template **Reset Password** trên Supabase — template mặc định chỉ có **link** (`ConfirmationURL`), không có mã OTP:

Supabase → Authentication → **Email Templates** → **Reset Password**:

1. **Xóa** mọi thẻ `<a href="{{ .ConfirmationURL }}">` — nếu giữ link, user bấm vào sẽ nhảy trang web thay vì nhập OTP.
2. **Subject:** `Mã đặt lại mật khẩu PalFish GMV`
3. **Body** (chỉ OTP, không link):

```html
<h2>Đặt lại mật khẩu PalFish GMV</h2>
<p>Mã xác minh của bạn (hết hạn sau 1 giờ):</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Nhập mã này tại trang Quên mật khẩu trong app. Nếu bạn không yêu cầu, bỏ qua email.</p>
```

> `{{ .Token }}` = mã 6 chữ số. Không dùng `{{ .ConfirmationURL }}` nếu muốn luồng OTP.

### Redirect URLs (URL Configuration)

Thêm cùng Site URL production:

```
https://palfish-gmv-manager.vercel.app/**
https://palfish-gmv-manager.vercel.app/forgot-password
https://palfish-gmv-manager.vercel.app/reset-password
http://localhost:5173/**
http://localhost:5173/forgot-password
http://localhost:5173/reset-password
```

Site URL: `https://palfish-gmv-manager.vercel.app`

FE gọi `resetPasswordForEmail` với `redirectTo: /forgot-password` (fallback khi template vẫn còn link cũ).

### Migration user cũ (chạy 1 lần trên prod)

```bash
cd backend
python migrate_activate_existing_users.py          # dry-run
python migrate_activate_existing_users.py --apply  # sau khi duyệt list
```

- **Tier A:** `SYSTEM_ADMIN_EMAILS` → `is_activated=true`
- **Tier B:** email đã link `nhan_su_sale` + có `crm_name` → `is_activated=true`
- **Tier C:** còn lại → `is_activated=false`

Script **merge** `user_metadata` (không ghi đè field khác).

### Checklist login v2

```
[ ] Email+Password provider bật
[ ] Confirm email signup tắt
[ ] Reset password template dùng {{ .Token }}
[ ] Redirect URLs có localhost + Vercel
[ ] migrate_activate_existing_users.py --apply trên prod
[ ] Test: signup → PendingActivationPage → admin link CRM + activate → login OK
```
