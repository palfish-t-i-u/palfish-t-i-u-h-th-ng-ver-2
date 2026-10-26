# MẪU BÀN GIAO TÀI NGUYÊN CÔNG TY (khi nghỉ / rời dự án)

> **Cách dùng:** Mỗi người copy file này thành 1 bản riêng (ví dụ `BAN_GIAO_Duc_2026-10.md`,
> `BAN_GIAO_Dat_2026-10.md`), điền đầy đủ rồi gửi lại cho người quản lý.
>
> **Phạm vi:** Chỉ bàn giao **tài nguyên công ty phục vụ công việc** — tài khoản đăng ký cho
> công việc, quyền truy cập các hệ thống (GMV, repo code, hạ tầng, sheet, kênh thông báo...).
> Email/tài khoản **cá nhân không liên quan dự án thì KHÔNG cần đưa vào**.
>
> Nghiệp vụ không cần bàn giao (đã có tài liệu trong dự án).

---

## 1. Thông tin người bàn giao

| Mục | Nội dung |
|---|---|
| Họ tên | |
| Vai trò / mảng phụ trách | |
| Ngày làm việc cuối | |
| Người nhận bàn giao (quản lý/đồng nghiệp) | |
| Email công ty (nếu có) | |
| Ngày điền form | |

---

## 2. Danh sách tài khoản & tài nguyên

> Với mỗi dòng: điền **định danh** (username/email/tên tài khoản), **cách truy cập**
> (link + cách đăng nhập), **nơi lưu mật khẩu/credential**, và **việc cần làm khi rời đi**
> (đổi mật khẩu / gỡ quyền / chuyển owner). Dòng nào không dùng thì ghi `Không có`.

### 2.1. Mã nguồn & GitHub

| Tài nguyên | Định danh (user/email) | Cách truy cập | Nơi lưu credential | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|---|---|
| Tài khoản GitHub dùng cho công việc | | | | Gỡ khỏi org `GiganticBakery` / `palfish-t-i-u` | ☐ |
| Quyền truy cập các repo (liệt kê repo) | | | | Thu hồi collaborator / rời org | ☐ |
| Personal Access Token / SSH key (nếu tạo cho CI, deploy, script) | | | | Thu hồi/xoá token, xoá SSH key | ☐ |
| Quyền owner/admin các repo (nếu là owner duy nhất) | | | | Chuyển owner trước khi rời | ☐ |

### 2.2. Ứng dụng GMV (app đối soát)

| Tài nguyên | Định danh | Cách truy cập | Nơi lưu credential | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|---|---|
| Tài khoản đăng nhập app GMV (link Vercel) | | | | Vô hiệu hoá tài khoản / hạ quyền admin | ☐ |
| Tài khoản có quyền quản trị (RBAC / System Admin) | | | | Gỡ khỏi `SYSTEM_ADMIN_EMAILS` nếu có | ☐ |

### 2.3. Hạ tầng & dịch vụ cloud

| Tài nguyên | Định danh | Cách truy cập | Nơi lưu credential | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|---|---|
| Supabase (prod + sandbox) | | | | Gỡ thành viên project / đổi key nếu nắm service_role | ☐ |
| Vercel (frontend) | | | | Gỡ thành viên team | ☐ |
| Render (backend + cron) | | | | Gỡ thành viên / đổi deploy hook nếu lộ | ☐ |
| Google Cloud / BigQuery (project, service account, file JSON key) | | | | Gỡ IAM / revoke key / xoá key JSON đã tải về | ☐ |
| Máy chủ ECS (SSH, file `.pem`) — ghi rõ IP | | | | Xoá public key khỏi server, thu hồi `.pem` | ☐ |
| Tài khoản cloud khác (Alibaba, AWS...) | | | | Gỡ quyền | ☐ |

### 2.4. Dữ liệu & bảng tính

| Tài nguyên | Định danh | Cách truy cập | Nơi lưu credential | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|---|---|
| Google Sheet công việc (Sổ doanh thu, All File, báo cáo...) | | | | Gỡ quyền chia sẻ, chuyển owner nếu là owner | ☐ |
| Tài khoản Google dùng để chia sẻ/chạy script | | | | Gỡ quyền | ☐ |
| Metabase / BI (qua OpenVPN) | | | | Thu hồi tài khoản + VPN | ☐ |
| OpenVPN / VPN nội bộ | | | | Thu hồi cấu hình/cert | ☐ |

### 2.5. Kênh thông báo & nền tảng ngoài

| Tài nguyên | Định danh | Cách truy cập | Nơi lưu credential | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|---|---|
| DingTalk (robot/app admin, token) | | | | Chuyển admin / đổi token nếu nắm | ☐ |
| Zalo OA (quản trị, token) | | | | Gỡ quản trị viên | ☐ |
| Lark / Feishu (tài khoản, app CLI, token) | | | | Gỡ quyền / thu hồi app token | ☐ |
| Facebook / Meta (BM, ad account, system user token) | | | | Gỡ quyền khỏi BM | ☐ |
| Pancake / chatbot | | | | Gỡ quyền | ☐ |
| Nền tảng khác (ghi rõ) | | | | | ☐ |

### 2.6. Bí mật / khoá / token khác

| Tài nguyên | Vị trí lưu (biến môi trường, file, password manager...) | Việc cần làm khi rời đi | Trạng thái |
|---|---|---|---|
| API key / token cá nhân tạo cho dự án | | Thu hồi & rotate | ☐ |
| File chứa secret tải về máy cá nhân | | Xoá khỏi máy | ☐ |

---

## 3. Nơi lưu mật khẩu / cách truyền credential an toàn

- Cách bạn đang lưu mật khẩu các tài khoản trên (password manager nào / file nào):
  _______________________________________________
- Mật khẩu/khoá sẽ truyền cho người nhận qua kênh nào (KHÔNG gửi chat công khai):
  _______________________________________________

> ⚠️ Với tài khoản dùng chung do công ty cấp: **đổi mật khẩu sau khi bàn giao** và báo người nhận.
> Với token/khoá do cá nhân tạo: **thu hồi (revoke) rồi tạo mới**, đừng để nguyên.

---

## 4. Ghi chú thêm (tuỳ chọn)

- Công việc/dịch vụ nào **chỉ mình bạn có quyền** (dễ bị kẹt nếu không chuyển trước khi nghỉ):
  _______________________________________________
- Cron / job / script tự động đang chạy dưới tài khoản của bạn:
  _______________________________________________
- Việc đang dở cần người khác tiếp:
  _______________________________________________

---

## 5. Xác nhận

| | Họ tên | Chữ ký / xác nhận | Ngày |
|---|---|---|---|
| Người bàn giao | | | |
| Người nhận | | | |
| Quản lý duyệt | | | |

- [ ] Đã rà soát tất cả hệ thống ở Mục 2, không còn tài khoản/quyền nào bỏ sót
- [ ] Đã thu hồi/chuyển quyền các tài khoản đánh dấu ở cột "Việc cần làm"
- [ ] Đã xoá secret/khoá tải về trên máy cá nhân
