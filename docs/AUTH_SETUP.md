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
