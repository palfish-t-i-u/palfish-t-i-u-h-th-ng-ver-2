# Feature Spec: [Tên tính năng]

> **Prototype**: `prototype/ten-tinh-nang.html`
> **Ngày họp**: YYYY-MM-DD
> **Người thiết kế**: Hiếu / [tên]

## Mục đích

1-2 câu: tính năng giải quyết vấn đề gì, ai dùng.

---

## Design Spec

### Màu sắc

Liệt kê màu dùng trong prototype. Trùng token có sẵn → ghi tên token. Mới → ghi hex.

| Vai trò | Giá trị | Token có sẵn? |
|---------|---------|---------------|
| Nền trang | `#f6f7fb` | `--gmv-bg` |
| Nền card/bảng | `#ffffff` | `--gmv-canvas` |
| Text chính | `rgba(0,0,0,0.65)` | `--gmv-text` |
| Text đậm | `#1f2330` | `--gmv-text-strong` |
| Text phụ | `#5c7db8` | `--gmv-muted` |
| Primary | `#7260ff` | `--gmv-primary` |
| Viền | `#d6dae4` | `--gmv-border` |
| Thành công | `#2f9e44` / `#e7f5ea` | `--gmv-ok` / `--gmv-ok-soft` |
| Cảnh báo | `#f08c00` / `#fff4dc` | `--gmv-warn` / `--gmv-warn-soft` |
| Nguy hiểm | `#c92a2a` / `#fde2e6` | `--gmv-danger` / `--gmv-danger-soft` |
| *Màu mới (nếu có)* | `#hex` | Chưa có — cần thêm token |

### Typography

| Vai trò | Size | Weight |
|---------|------|--------|
| Body | 14px | 400 |
| Heading section | 16px | 600 |
| Heading page | 20px | 700 |
| Label bảng | 12px | 600, uppercase |
| Badge/tag | 12px | 500 |
| Số lớn (card) | 28px | 700 |

### Component styles

**Badges / Tags:**

| Badge | Nền | Text | Radius |
|-------|-----|------|--------|
| Bộ phận "Bán hàng" | `--gmv-primary-soft` | `--gmv-primary` | full (pill) |
| Trạng thái "Đã kích hoạt" | `--gmv-ok-soft` | `--gmv-ok` | full |

**Buttons:**

| Variant | Nền | Text | Dùng cho |
|---------|-----|------|----------|
| Primary | `--gmv-primary` | white | CTA: Thêm, Lưu |
| Secondary | `--gmv-canvas` | `--gmv-text` | Hủy, Đóng |
| Danger | `--gmv-danger` | white | Xóa |

### Spacing

- Sidebar: 220px, Content padding: 24px
- Gap cards: 16px, Gap filters: 12px
- Table row height: ~48px
- Dialog max-width: 520px (nhỏ) / 720px (lớn)

---

## Màn hình: [Tên]

### Nhìn thấy gì

**Thẻ tổng hợp:**

| Thẻ | Giá trị hiển thị | Cách tính |
|-----|-------------------|-----------|
| Tổng tài khoản | `20` | `count(*)` từ bảng accounts |
| Đã kích hoạt | `15` + "2 đứng" | `count(status='active')` + online count |

**Bộ lọc:** Tìm kiếm (text), Vai trò (dropdown), CRM liên kết (dropdown), Trạng thái (dropdown)

**Tabs:** Tất cả | Bán hàng | Nhân sự & Quản trị | Marketing | CS — filter theo `phong_ban`, badge đếm

**Bảng — các cột:** Mã yêu cầu, Họ tên CRM, SĐT, Đội (badge), Chọn Team, CRM liên kết, Đăng nhập cuối, Vai trò (badge), Trạng thái (badge)

---

### Bấm vào đâu → Xảy ra gì → Cần code gì

---

#### Nút "+ Thêm tài khoản"

**Mở dialog** "Thêm tài khoản mới" với các field:

| Field | Loại | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| Nhân sự CRM | Dropdown search | V | Chỉ hiện người chưa có tài khoản. Chọn → tự điền tên, SĐT |
| Email | Text | V | Validate email, không trùng |
| Vai trò | Dropdown | V | User / Leader / Admin |
| Team | Dropdown | — | Danh sách team thuộc bộ phận |

**Bấm "Lưu":**
1. Tạo tài khoản Supabase Auth (email + password tạm)
2. Tạo record liên kết auth_user ↔ nhân sự CRM
3. Quay lại bảng, hiện record mới trạng thái "Chưa kích hoạt"

**Lỗi:** Email trùng → toast "Email đã được sử dụng". Nhân sự đã có tài khoản → không hiện trong dropdown.

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `POST /auth/accounts` | Nhận `{ staff_id, email, role, team }`. Gọi Supabase Admin API tạo user. Insert vào bảng `auth_accounts`. Trả về record mới. Require: manager+ |
| BE | `GET /staff/unlinked` | Trả danh sách nhân sự chưa có tài khoản (để populate dropdown). Require: manager+ |
| FE | Dialog component | Form controlled, dropdown search gọi `/staff/unlinked`, validate email client-side trước khi submit |
| FE | Sau khi Lưu thành công | Close dialog → refetch danh sách → toast "Tạo tài khoản thành công" |
| DB | Bảng `auth_accounts` | Xem schema bên dưới |

---

#### Bấm vào 1 dòng trong bảng

**Mở dialog** "Chi tiết tài khoản"

- Hiển thị (chỉ đọc): tên, SĐT, mã CRM, bộ phận
- Sửa được: Vai trò (dropdown), Team (dropdown)

**Nút hành động:**

| Nút | Hiển thị khi | Bấm → xảy ra gì |
|-----|-------------|------------------|
| Kích hoạt | trạng thái = "Chưa kích hoạt" | → "Đã kích hoạt", user đăng nhập được |
| Khóa | trạng thái = "Đã kích hoạt" | → "Bị khóa", chặn đăng nhập |
| Mở khóa | trạng thái = "Bị khóa" | → "Đã kích hoạt" |
| Reset mật khẩu | Luôn hiện | Gửi email reset |
| Xóa | Luôn hiện | Confirm dialog → soft delete |

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `PATCH /auth/accounts/{id}` | Cập nhật `role`, `team`. Require: manager+ (không cho sửa role=system nếu actor không phải system) |
| BE | `POST /auth/accounts/{id}/activate` | Set `status = 'active'`. Gọi Supabase Admin API enable user. Require: manager+ |
| BE | `POST /auth/accounts/{id}/lock` | Set `status = 'locked'`. Gọi Supabase Admin API disable user (ban). Require: manager+ |
| BE | `POST /auth/accounts/{id}/unlock` | Set `status = 'active'`. Gọi Supabase Admin API enable user. Require: manager+ |
| BE | `POST /auth/accounts/{id}/reset-password` | Gọi Supabase Admin API reset password → gửi email. Require: manager+ |
| BE | `DELETE /auth/accounts/{id}` | Soft delete: set `deleted_at = now()`. Gọi Supabase Admin API disable user. Require: system |
| FE | Dialog chi tiết | Load data từ row đã chọn, render form + action buttons theo trạng thái hiện tại |
| FE | Sau mỗi action | Refetch danh sách → toast kết quả → close dialog (nếu xóa) hoặc cập nhật dialog (nếu đổi trạng thái) |

---

#### Màn hình chính: load dữ liệu + filter

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /auth/accounts` | Trả danh sách + summary counts. Params: `?search=&role=&crm_linked=&status=&phong_ban=`. Require: manager+ |
| BE | Response format | `{ items: [...], total: int, summary: { total: 20, active: 15, crm_linked: 16, leader_admin: 7 } }` |
| FE | Bảng + summary cards | Gọi API khi mount + khi filter thay đổi. Summary cards dùng `summary` từ response |
| FE | Search | Debounce 300ms, gửi param `search` lên API |
| FE | Tabs bộ phận | Gửi param `phong_ban`, badge đếm lấy từ response hoặc gọi count riêng |
| FE | Kết hợp filter | AND tất cả params, reset page về 1 khi filter đổi |

---

## Luồng trạng thái

```
[Chưa kích hoạt] ──activate──▶ [Đã kích hoạt] ──lock──▶ [Bị khóa]
                                      ▲                      │
                                      └───────unlock──────────┘

[Bất kỳ] ──delete──▶ [Đã xóa] (soft delete, ẩn khỏi bảng)
```

---

## Quy tắc nghiệp vụ

1. **1 nhân sự = 1 tài khoản** — unique constraint `staff_id` trên bảng `auth_accounts`
2. **Mã tự sinh** — `{PREFIX}-{STT}`, prefix theo bộ phận (SALE, ADMN, MKT, CS), STT auto-increment
3. **Xóa mềm** — set `deleted_at`, không xóa record nhân sự CRM. Nhân sự có thể gán tài khoản mới
4. **Đăng nhập cuối** — Supabase Auth trigger hoặc middleware cập nhật `last_sign_in_at`

---

## Phân quyền

| Hành động | sale | leader | manager | system |
|-----------|------|--------|---------|--------|
| Xem tab | — | — | V | V |
| Thêm tài khoản | — | — | V | V |
| Sửa vai trò | — | — | V (trừ system) | V |
| Kích hoạt / Khóa | — | — | V | V |
| Xóa | — | — | — | V |

---

## DB Schema

```sql
create table auth_accounts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid unique not null references nhan_su(id),
  auth_user_id uuid unique references auth.users(id),
  ma_yeu_cau text unique not null,       -- SALE-001, ADMN-01...
  email text unique not null,
  role text not null default 'user',      -- user | leader | admin
  team text,
  phong_ban text,                         -- sales | hr_admin | marketing | cs
  status text not null default 'pending', -- pending | active | locked
  last_sign_in_at timestamptz,
  deleted_at timestamptz,                 -- soft delete
  created_at timestamptz default now(),
  created_by uuid references auth.users(id)
);
```

---

## Chia task

| # | Việc | Người | Ước lượng |
|---|------|-------|-----------|
| 1 | DB: tạo bảng `auth_accounts` + migration | | 1h |
| 2 | BE: `GET /auth/accounts` (list + filter + summary) | | 2h |
| 3 | BE: `GET /staff/unlinked` + `POST /auth/accounts` (tạo) | | 3h |
| 4 | BE: `PATCH` + activate/lock/unlock/reset-pw | | 2h |
| 5 | BE: `DELETE` soft delete | | 1h |
| 6 | FE: bảng + summary cards + filter + tabs | | 3h |
| 7 | FE: dialog thêm tài khoản | | 2h |
| 8 | FE: dialog chi tiết + nút hành động | | 2h |
| 9 | FE: phân quyền UI (ẩn tab, ẩn nút theo role) | | 1h |
| 10 | E2E test | | 2h |
