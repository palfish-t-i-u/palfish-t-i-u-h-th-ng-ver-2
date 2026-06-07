# Feature Spec: Quản lý Doanh thu (Payments)

> **Prototype**: Không — bám theo design system hiện tại (`docs/DESIGN.md`)
> **Ngày họp**: 2026-06-07
> **Người thiết kế**: Josh / Minh
> **Spec gốc từ anh Hiếu**: `SPEC_ Báo cáo XiaoXian.md`

## Mục đích

Thay 3 báo cáo nhập tay (Dingtalk → Google Sheet → Tổng bộ) bằng **một nơi nhập duy nhất**: bảng `payments` là nguồn gốc, mọi báo cáo (BCTB, theo team, theo kênh) tự sinh, kèm lớp đối soát ngân hàng & CRM. Dùng bởi: nhân sự vận hành dữ liệu (nhập/sửa), leader & quản lý (xem báo cáo).

---

## Kiến trúc

**Không dùng Baserow/NocoDB/VPS** — build trực tiếp trong app React hiện tại, dùng đúng stack đang có:

| Lớp | Công nghệ |
|-----|-----------|
| Lưới nhập liệu | React + AG Grid Community (MIT, free) |
| Báo cáo + đối soát | FastAPI endpoints + React components |
| Database | Supabase Postgres (đã có) |
| Auth + RBAC | Supabase Auth + `rbac.py` (đã có) |
| Hosting | Vercel (FE) + Render (BE) (đã có) |

Lý do: Baserow là app độc lập (auth riêng, DB riêng, phân quyền riêng) — không thể dùng chung hệ thống đăng nhập/phân quyền 4 cấp hiện tại, dữ liệu tách biệt khiến BC01/BC02/BC03 không truy xuất được. Chi tiết: xem mục 3.1 trong `SPEC_ Báo cáo XiaoXian.md`.

---

## Tổng quan màn hình

| # | Màn hình | Mục đích | Ai dùng |
|---|----------|----------|---------|
| 1 | **Doanh thu** | Nhập/sửa/import + xem danh sách giao dịch (nguồn gốc) | data, manager |
| 2 | **Báo cáo** | BCTB (ngày×team), theo team, theo kênh — tự sinh | leader, manager |
| 3 | **Đối soát** | Cảnh báo nội bộ + đối soát ngân hàng + CRM | data, manager |
| 4 | **Danh mục** | Quản lý master: Sale↔team, Kênh, Gói, Khách | manager, system |

Vị trí trong app: tab mới trong section **Báo cáo** của sidebar, cạnh Sổ doanh thu và BC01/BC02/BC03. Sidebar tự thu gọn (`autoCollapse`) khi vào tab Doanh thu để tối đa không gian lưới nhập.

---

## Design Spec

### Màu sắc

Toàn bộ dùng token có sẵn — không phát sinh màu mới.

| Vai trò | Giá trị | Token |
|---------|---------|-------|
| Nền trang | `#f6f7fb` | `--gmv-bg` |
| Nền card/bảng | `#ffffff` | `--gmv-canvas` |
| Đầu bảng | `#f3f5fa` | `--gmv-table-head` |
| Hover dòng | `#fafbfe` | `--gmv-row-hover` |
| Text chính | `rgba(0,0,0,0.65)` | `--gmv-text` |
| Text đậm | `#1f2330` | `--gmv-text-strong` |
| Text phụ | `#5c7db8` | `--gmv-muted` |
| Primary | `#7260ff` | `--gmv-primary` |
| Viền | `#d6dae4` | `--gmv-border` |
| Active / đã khớp | `#2f9e44` / `#e7f5ea` | `--gmv-ok` / `--gmv-ok-soft` |
| Cảnh báo / chưa kích hoạt | `#f08c00` / `#fff4dc` | `--gmv-warn` / `--gmv-warn-soft` |
| Hoàn tiền / nguy hiểm | `#c92a2a` / `#fde2e6` | `--gmv-danger` / `--gmv-danger-soft` |

### Typography

| Vai trò | Size | Weight |
|---------|------|--------|
| Body / ô grid | 14px | 400 |
| Heading section | 16px | 600 |
| Heading page | 20px | 700 |
| Label bảng / cột grid | 12px | 600, uppercase |
| Badge/tag | 12px | 500 |
| Số lớn (summary card) | 28px | 700 |

### Component styles

**Badges (pill, radius full):**
- Team → `--gmv-primary-soft` / `--gmv-primary`
- Active → `--gmv-ok-soft` / `--gmv-ok`
- Refunded → `--gmv-danger-soft` / `--gmv-danger`
- CRM ✓ / NH ✓ → `--gmv-ok-soft` / `--gmv-ok`
- CRM ✗ / NH ✗ → `--gmv-warn-soft` / `--gmv-warn`

**Buttons:** Primary (Thêm/Lưu/Import), Secondary (Hủy), Danger (Hoàn tiền/Xóa) — dùng component `Button` có sẵn.

**Editable grid (AG Grid):**
- Header sticky, nền `--gmv-table-head`
- Ô đang edit: viền `--gmv-primary`
- Ô lỗi: viền `--gmv-danger`, tooltip lỗi
- Row hover: `--gmv-row-hover`
- Filter/sort icons theo AG Grid default, tint `--gmv-muted`

### Spacing

Sidebar thu gọn ~60px (auto) · content padding 24px · gap cards 16px · gap filters 12px · row height ~44px · dialog 520px (nhỏ) / 720px (lớn).

---

## Màn hình 1: Doanh thu

### Nhìn thấy gì

**Thẻ tổng hợp** (theo bộ lọc):

| Thẻ | Giá trị | Cách tính |
|-----|---------|-----------|
| Tổng GMV | `1.2M` | `sum(gmv_final)` where `status='active'` |
| Doanh thu VNĐ | `4.5 tỷ` | `sum(real_pay_vnd)` where `status='active'` |
| Số đơn | `320` | `count(*)` |
| Chưa khớp NH | `18` | `count(bank_matched=false)` |
| Chưa kích hoạt CRM | `42` | `count(crm_activated=false and status='active')` |

**Bộ lọc:** Tìm kiếm (uid/tên/SĐT) · Khoảng ngày (`pay_time`) · Team (dropdown) · Kênh (dropdown) · Sale (dropdown search) · Trạng thái (active/refunded) · Đối soát NH (đã/chưa) · CRM (đã/chưa).

**Tabs:** Tất cả | In-house | In-house 2 | Offline | HCM — filter `team`, badge đếm.

**Bảng (AG Grid editable) — cột:** Ngày (`pay_time`), Khách (uid+tên), SĐT, Sale (badge), Team (badge), Kênh, Gói, Tiền VNĐ, GMV, Lần TT, Trạng thái (badge), CRM (✓/✗), NH (✓/✗), Note.

---

### Bấm vào đâu → Xảy ra gì → Cần code gì

---

#### Nút "+ Thêm doanh thu"

**Mở dialog "Thêm khoản doanh thu"** với các field:

| Field | Loại | Bắt buộc | Ghi chú |
|-------|------|----------|---------|
| Khách (uid) | Dropdown search | V | Tìm theo uid/tên; nếu mới → cho nhập → tạo `customers` |
| Pay time | Datetime | V | Mặc định now; quyết định trục ngày + quy tắc GMV |
| Gói | Dropdown | V | Từ `packages` |
| Sale | Dropdown search | V | Từ `sales`; quyết định team |
| Kênh | Dropdown | — | Từ `channels` (để trống được với HCM) |
| Tiền VNĐ (`real_pay_vnd`) | Number | V | |
| GMV RMB (`gmv_rmb`) | Number | — | Chỉ cho đơn **trước 01/06/2026** |
| Lần TT (`payment_seq`) | Dropdown | — | 1st / 2nd / 3rd… |
| GMV (`gmv_final`) | Readonly | — | Tự tính realtime |
| Note | Text | — | |

**Bấm "Lưu":**
1. Validate client-side (required, số hợp lệ).
2. Nếu uid mới → tạo record `customers`.
3. Insert `payments` (sinh `payment_id`, tính `gmv_final`, `crm_order_id=null`).
4. Đóng dialog → refetch → toast "Đã thêm".

**Lỗi có thể xảy ra:** trùng khoá nghiệp vụ (`uid`+`pay_time`+`real_pay_vnd`) → toast cảnh báo "Có thể trùng đơn — vẫn lưu?". Sale/kênh không có trong master → dropdown chặn chọn.

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `POST /payments` | Body `{ uid, pay_time, package_id, sale_id, channel_id, real_pay_vnd, gmv_rmb, payment_seq, note }`. Tạo customer nếu uid mới. Tính `gmv_final`. Trả record. Require: data+ |
| BE | `GET /customers/search?q=` | uid/tên/sđt khớp → dropdown |
| BE | `GET /sales` / `GET /channels` / `GET /packages` | Master cho dropdown |
| FE | Dialog "Thêm" | Form controlled; dropdown search; `gmv_final` readonly tính realtime; check trùng trước submit |
| DB | `payments`, `customers` | Insert |

---

#### Sửa inline trong lưới (AG Grid)

**Thực hiện:** click ô (Sale/Team/Kênh/Tiền/Note…) → sửa tại chỗ → Enter/blur lưu.

**Bấm (blur/Enter):**
1. Gửi field thay đổi lên BE.
2. Nếu đổi `pay_time`/`real_pay_vnd`/`gmv_rmb` → BE tính lại `gmv_final`.
3. Cập nhật ô + `updated_at`.

**Lỗi có thể xảy ra:** giá trị không hợp lệ (chữ ở ô số, sale không tồn tại) → giữ giá trị cũ + viền đỏ + tooltip lỗi.

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `PATCH /payments/{id}` | Cập nhật field lẻ; tính lại `gmv_final` nếu cần; ghi `updated_at`. Require: data+ |
| FE | AG Grid `onCellValueChanged` | Optimistic update + rollback; ô dropdown ràng buộc master (cellEditor); debounce ô number |

---

#### Bấm vào 1 dòng → dialog "Chi tiết doanh thu"

**Mở dialog:**
- Hiển thị (đọc): `payment_id`, khách, sđt, sale, team, kênh, gói, `gmv_final`, cờ NH/CRM, `updated_at`.
- Sửa được: mọi field nhập (như dialog Thêm).

**Nút hành động trong dialog:**

| Nút | Hiển thị khi | Bấm → xảy ra gì |
|-----|-------------|------------------|
| Hoàn tiền | `status='active'` | → `status='refunded'`, báo cáo trừ tương ứng |
| Khôi phục | `status='refunded'` | → `status='active'` |
| Gán CRM thủ công | Luôn | Nhập `crm_order_id` → `crm_activated=true`, `activated_at=now()` |
| Xóa | Luôn | Confirm → soft delete (`deleted_at`) |

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `PATCH /payments/{id}` | Sửa field. Require: data+ |
| BE | `POST /payments/{id}/refund` | `status='refunded'`. Require: data+ |
| BE | `POST /payments/{id}/restore` | `status='active'`. Require: data+ |
| BE | `POST /payments/{id}/link-crm` | Body `{ crm_order_id }` → set cờ + `activated_at`. Require: data+ |
| BE | `DELETE /payments/{id}` | Soft delete `deleted_at=now()`. Require: system |
| FE | Dialog chi tiết | Render form + nút theo trạng thái; sau action → refetch + toast |

---

#### Nút "Import từ file"

**Mở dialog upload** `.xlsx/.csv` → preview 20 dòng → map cột → nút "Nhập".

**Các bước khi "Nhập":**
1. Parse + map cột nguồn → schema `payments`.
2. Validate từng dòng (required, master tồn tại, dedup khoá nghiệp vụ).
3. Hiện bảng kết quả: hợp lệ / cảnh báo trùng / lỗi.
4. "Xác nhận" → bulk insert (bỏ qua dòng lỗi), tạo customer mới nếu cần.

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `POST /payments/import` (multipart) | Parse + validate + dedup; trả `{ inserted, skipped, errors[] }`. Require: data+ |
| FE | Dialog import | Upload, preview, map cột, hiện kết quả validate trước khi xác nhận |

---

#### Nút "Xuất Excel"

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /payments/export` | Nhận cùng filter như list; trả file. Require: leader+ |
| FE | Nút export | Gọi API với filter hiện tại → tải file |

---

#### Màn hình chính: load dữ liệu + filter

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /payments` | Params `?search=&from=&to=&team=&channel=&sale_id=&status=&bank_matched=&crm_activated=&page=`. Require: leader+ |
| BE | Response | `{ items:[...], total:int, summary:{ gmv_final, real_pay_vnd, count, unmatched_bank, uncrm } }` |
| FE | AG Grid + cards + tabs | Gọi API khi mount + khi filter đổi; cards từ `summary`; search debounce 300ms; AND các filter, reset page về 1 khi đổi |

---

## Màn hình 2: Báo cáo

### Nhìn thấy gì

**Tabs:** BCTB (ngày×team) | Theo Team | Theo Kênh. Bộ lọc khoảng ngày. Nút "Xuất Excel".

- **BCTB:** pivot — hàng = team/người (`sales.short_code` + `sales.team`), cột = từng ngày × (GMV VNĐ / GMV RMB / số đơn), kèm % KPI. *(Khối Trials & Referral chừa chỗ — nối nguồn sau.)*
- **Theo Team:** tổng GMV / số đơn theo team & khối.
- **Theo Kênh:** tổng theo `channels.type`.

### Bấm vào đâu → Xảy ra gì → Cần code gì

#### Đổi tab / đổi khoảng ngày

**Cần code:**

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /reports/bctb?from=&to=` | Aggregate `payments` (status=active) theo `pay_time::date` × team (map qua `sales`). Trả pivot. Require: leader+ |
| BE | `GET /reports/team?from=&to=` | Group theo team/khối |
| BE | `GET /reports/channel?from=&to=` | Group theo `channels.type` |
| FE | Pivot table | Render ngày×team; đổi tab → gọi API tương ứng |

#### Nút "Xuất Excel"

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /reports/{type}/export?from=&to=` | Xuất pivot ra Excel. Require: leader+ |
| FE | Nút export | Tải file theo tab + khoảng ngày hiện tại |

---

## Màn hình 3: Đối soát

### Nhìn thấy gì

3 khối: **Cảnh báo nội bộ** · **Đối soát ngân hàng** · **Đối soát CRM**.

- Nội bộ: bảng dòng nghi vấn (trùng, thiếu trường, sale/kênh lạ, lệch tỷ giá).
- Ngân hàng: nút upload file giao dịch + bảng kết quả (đã khớp / chưa khớp).
- CRM: bảng đơn `active` nhưng `crm_activated=false`, kèm số ngày treo.

### Bấm vào đâu → Xảy ra gì → Cần code gì

#### Load cảnh báo nội bộ

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /recon/internal` | Trả danh sách cảnh báo (trùng/thiếu/lệch tỷ giá). Require: data+ |
| FE | Bảng cảnh báo | Mỗi dòng link tới record để sửa |

#### Nút "Upload file ngân hàng"

**Mở dialog upload** `.csv/.xlsx` → "Nhập & khớp".

**Các bước:**
1. Nạp `bank_transactions`.
2. Khớp với `payments` theo `amount + date` (cửa sổ ±3 ngày — cấu hình được).
3. Set `bank_matched=true`, `matched_payment_id` cho dòng khớp.
4. Hiện kết quả: số khớp / chưa khớp.

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `POST /recon/bank/import` (multipart) | Nạp + khớp theo rule cấu hình → set cờ. Require: data+ |
| BE | `GET /recon/bank` | Đơn chưa khớp + giao dịch NH chưa gắn |
| FE | Dialog upload + bảng kết quả | Hiển thị khớp/chưa khớp; cho gắn tay dòng nhập nhằng |

#### Khớp thủ công 1 dòng

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `POST /recon/bank/match` | Body `{ txn_id, payment_id }` → gắn cặp, set `bank_matched`. Require: data+ |
| FE | UI ghép cặp | Chọn 2 dòng → gắn → refetch |

#### Load đối soát CRM

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /recon/crm` | Đơn đã thu nhưng `crm_activated=false` + tuổi đơn. Require: data+ |
| FE | Bảng treo CRM | Sắp theo tuổi đơn |

---

## Màn hình 4: Danh mục (Master)

### Nhìn thấy gì

**Tabs:** Sale | Kênh | Gói | Khách. Mỗi tab là 1 bảng + nút "+ Thêm".
Bảng Sale (quan trọng nhất) — cột: Họ tên, Mã BCTB (`short_code`), Team, Khối, Active.

### Bấm vào đâu → Xảy ra gì → Cần code gì

#### Sửa Sale (gán team / mã BCTB)

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET /sales` / `PATCH /sales/{id}` / `POST /sales` | CRUD master nhân sự. Require: manager+ |
| FE | Bảng + dialog Sale | Sửa team/short_code; cảnh báo trùng short_code |

#### Thêm/sửa Kênh, Gói, Khách

| Layer | Việc | Chi tiết |
|-------|------|----------|
| BE | `GET/POST/PATCH /channels` | CRUD kênh (`channel_code`, `name`, `type`). Require: manager+ |
| BE | `GET/POST/PATCH /packages` | CRUD gói (`name`, `fixed`). Require: manager+ |
| BE | `GET/PATCH /customers/{uid}` | Sửa tên/SĐT khách. Require: data+ |
| FE | Bảng + dialog cho từng tab | CRUD đơn giản |

---

## Luồng trạng thái

```
[active] ──refund──▶ [refunded]
   ▲                     │
   └──────restore────────┘
[bất kỳ] ──delete──▶ [đã xóa] (soft delete, ẩn khỏi bảng)

bank_matched:  false ──khớp file NH──▶ true
crm_activated: false ──gán crm_order_id / nối CRM──▶ true
```

---

## Quy tắc nghiệp vụ

1. **Thứ tự thực tế:** `khách (uid)` → `thanh toán` → *(sau)* `kích hoạt CRM`. `payment_id` sinh ngay khi nhập, không chờ CRM; `crm_order_id` null kéo dài là hợp lệ.
2. **1 uid = nhiều payment** (tái phí). uid là PK của `customers`, KHÔNG phải PK của `payments`.
3. **GMV:** `pay_time` < 01/06/2026 → `gmv_final = gmv_rmb`; từ 01/06 → `gmv_final = real_pay_vnd / TY_GIA`. `TY_GIA=3700` ở config, không hard-code.
4. **Trục thời gian = `pay_time`** (không dùng `bank_day`, không dùng `activated_at`).
5. **Gán team** tra qua `sales.team` theo `sale_id`; tên hiển thị theo `sales.short_code`.
6. **Chống trùng:** khoá nghiệp vụ `(uid + pay_time + real_pay_vnd)`.
7. **Hoàn tiền = soft** (`status='refunded'`); **xóa = soft** (`deleted_at`).
8. **Danang** đã đóng — chỉ dữ liệu lịch sử, không nhập mới.

---

## Phân quyền

| Hành động | sale | leader | data/manager | system |
|-----------|------|--------|--------------|--------|
| Xem báo cáo team mình | — | V | V | V |
| Xem toàn bộ doanh thu | — | — | V | V |
| Thêm / sửa / import doanh thu | — | — | V | V |
| Hoàn tiền / khôi phục | — | — | V | V |
| Upload & đối soát ngân hàng | — | — | V | V |
| Sửa master (Sale↔team, kênh, gói) | — | — | V | V |
| Sửa config tỷ giá GMV | — | — | — | V |
| Xóa (soft delete) | — | — | — | V |

---

## DB Schema

```sql
-- Khách hàng: uid là khoá chính
create table customers (
  uid         text primary key,
  full_name   text,
  phone       text,
  first_seen  date,
  created_at  timestamptz default now()
);

-- Doanh thu: grain = 1 khoản thanh toán
create table payments (
  payment_id    uuid primary key default gen_random_uuid(),
  uid           text not null references customers(uid),
  pay_time      timestamptz not null,
  bank_day      date,
  package_id    uuid references packages(id),
  payment_seq   text,                          -- 1st | 2nd | 3rd...
  real_pay_vnd  numeric not null,
  gmv_rmb       numeric,
  gmv_final     numeric,
  channel_id    uuid references channels(id),
  sale_id       uuid not null references sales(id),
  team          text not null,                  -- In-house | In-house 2 | store... (thô)
  status        text not null default 'active', -- active | refunded
  note          text,
  crm_order_id  text,
  crm_activated boolean not null default false,
  activated_at  date,
  bank_matched  boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index on payments (pay_time);
create index on payments (uid);
create index on payments (sale_id);
create unique index payments_bizkey on payments (uid, pay_time, real_pay_vnd) where deleted_at is null;

-- Master nhân sự
create table sales (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  short_code  text,                            -- "LyVC"
  team        text,                            -- Stellar/Imperia/sub-team/Offline/HCM
  khoi        text,                            -- Stellar Garden | Imperia Garden | Offline | HCM
  active      boolean default true
);

-- Master kênh
create table channels (
  id            uuid primary key default gen_random_uuid(),
  channel_code  text,
  name          text,
  type          text                             -- Ads|Renewal|Referral|Public|Offline|Lives|KOC|Other
);

-- Master gói
create table packages (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  fixed  text                                    -- fixed | non-fixed
);

-- Nguồn tương lai
create table bank_transactions (
  txn_id             uuid primary key default gen_random_uuid(),
  date               date,
  amount             numeric,
  content            text,
  matched_payment_id uuid references payments(payment_id)
);

create table crm_orders (
  crm_order_id text primary key,
  uid          text references customers(uid),
  course       text,
  activated    boolean,
  activated_at date
);
```

---

## Di trú dữ liệu (migration)

1. Đọc 3 sheet: `SM Hanoi` (~14.800 dòng, 35 cột), `HCM REV` (~13.800, 20 cột), `Danang REV` (50, 22 cột).
2. Map cột nguồn → `payments`. HCM REV: `team = HCM`, `channel_id` null/suy từ `Type`.
3. Dựng `customers`: gom uid phân biệt (~9.320).
4. Dựng `sales`: gom tên phân biệt (~190) → map `short_code` + `team`. **Cần review tay.**
5. Tính `gmv_final` theo quy tắc §5.1.
6. Phát hiện & gắn cờ trùng trong dữ liệu cũ.
7. Danang: nạp 50 dòng lịch sử, đánh dấu team đóng.
8. `crm_order_id`, `bank_matched` để trống — điền dần sau.

---

## Chia task

| # | Việc | Ước lượng |
|---|------|-----------|
| 1 | DB: tạo 5 bảng + 2 bảng tương lai + index + migration script | 2h |
| 2 | Migrate ~28k dòng cũ → `payments` + dựng `customers`, `sales` | 4h |
| 3 | BE: `GET /payments` (list + filter + summary) + `/export` | 4h |
| 4 | BE: `POST /payments` + `/customers/search` + master dropdowns | 3h |
| 5 | BE: `PATCH` + refund/restore/link-crm + `DELETE` soft | 3h |
| 6 | BE: `POST /payments/import` (parse + validate + dedup) | 4h |
| 7 | BE: `GET /reports/bctb` + `/team` + `/channel` + export | 5h |
| 8 | BE: `GET /recon/internal` + `/recon/bank/*` + `/recon/crm` | 4h |
| 9 | BE: CRUD master (`sales`/`channels`/`packages`/`customers`) | 2h |
| 10 | FE: lưới doanh thu (AG Grid) + cards + filter + tabs | 5h |
| 11 | FE: dialog Thêm + Chi tiết + nút hành động + Import | 5h |
| 12 | FE: màn Báo cáo (pivot + export) | 4h |
| 13 | FE: màn Đối soát (3 khối + upload NH) | 3h |
| 14 | FE: màn Danh mục (4 tab CRUD) | 3h |
| 15 | FE: phân quyền UI (ẩn nút/tab theo role) | 1h |
| 16 | E2E test | 3h |
| | **Tổng** | **~55h** |

---

## Tự kiểm tra

- [x] Đã liệt kê tất cả màn hình (4 màn hình).
- [x] Mỗi màn hình có ≥1 nút hành động + block "Cần code".
- [x] Có bảng phân quyền role × hành động.
- [x] Data model đủ bảng cho mọi API đã liệt kê.
- [x] Design spec dùng token có sẵn — không phát sinh màu/font mới.
- [x] Kiến trúc dùng stack hiện tại (React + FastAPI + Supabase) — không Baserow/VPS.
