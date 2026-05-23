# Wireframes & logic phân quyền — Module 1/2 phụ trợ

> Cập nhật 23/05/2026 — Minh. **UI production:** [`docs/DESIGN.md`](DESIGN.md) (brand `#7260ff`, `components/ui/`). Bản vẽ draft (accent `#2f6feb`): **`docs/wireframes.html`**. Nhân sự: **`docs/team_hierarchy.md`**.

---

## 1. Phạm vi (meeting 20/05 & 21/05)

**Đã code (production):**

1. Tab 1 — gợi ý UID (`GET /crm/customers`), tạo đơn, QR + **Copy** (`PaymentModal`).
2. Tab 2 — bảng đơn RBAC, bill (nén + Storage `bills`), poll 15s, ops tick tiền về/CRM.
3. Tab **Lịch sử PayOS** — `PayosHistoryTab`, badge `khop` / `sai_tien` / `chua_xu_ly`.
4. Tab **Thông tin cá nhân** — SĐT, ghép CRM.
5. Sidebar **Quản lý quyền** — **Nhân sự Sale** (`StaffCRMTab`) + **Tài khoản Auth** (`AuthAccountsTab`, System only).
6. Tab 2 — nút **Hủy đơn** (`trang_thai=huy`), không hủy khi đã `tien_ve`.
7. PayOS webhook — `api_pipe/payos_webhook.py` + `POST /webhook/payos`.
8. UI shell — `AppShell.tsx` sidebar + bottom nav mobile (`docs/DESIGN.md`).
9. RBAC 4 cấp + `apiBaseUrl.ts`.
10. Tab 2 — freeze 3 cột trái + 2 cột phải, scroll ngang, scrollbar styled (`Tab2Table`, `Table.tsx`, `gmv-theme.css`) — **Done** (PR #2, 2026-05-23).

**Chưa code (backlog):**

- Dashboard Leader GMV tổng hợp (§4.2 wireframe).
- Ghi `don_hang_audit` từ UI Tab 2.
- Droplist UID từ CRM API / Metabase (hiện fallback khách theo đơn sale).
- CRM auto-activate sau thanh toán.

---

## 2. Cấp phân quyền (Access Control) — 4 cấp (họp 21/05)

| Cấp | Mô tả | Phạm vi xem | Quyền thao tác |
|-----|-------|-------------|----------------|
| **Sale** _(L1)_ | Nhân viên sale | Chỉ đơn / Info Code / QR **do chính mình tạo** | Tạo đơn, sinh QR, upload bill |
| **Sale Leader** _(L2)_ | Trưởng nhóm / sub-team | Đơn của **sub-team** (hoặc team nếu không chia sub) | Sale + xem dashboard team (chỉ xem) |
| **Sale Manager** _(L3 — mới)_ | Quản lý tầng trung (vd. Trang — Inhouse 1 nhiều team nhỏ) | **Toàn bộ team** mình phụ trách (mọi sub-team) | Xem + tab **Quản lý quyền** (chỉ xem nhân sự CRM) |
| **System** _(L4 — Hiếu / Kem / Minh)_ | Phát triển + Ops | **Toàn bộ** | Tick tiền về / CRM, sửa đơn, **Quản lý quyền** (2 subtab), sync Metabase, khoá Auth user |

**Navigation (đã code — sidebar):**

| Sidebar | Component | Quyền |
|---------|-----------|--------|
| Tạo đơn | `Tab1Form` | Mọi user |
| Quản lý đơn | `Tab2Table` | RBAC đơn |
| Lịch sử PayOS | `PayosHistoryTab` | RBAC |
| Thông tin cá nhân | `ProfilePage` | Mọi user |
| *Quản lý quyền* → Nhân sự Sale | `StaffCRMTab` | Manager+ |
| *Quản lý quyền* → Tài khoản Auth | `AuthAccountsTab` | System only |

### Quy tắc bất biến

- **Tất cả các cấp đều có quyền tạo mã QR + Info Code** (Tab 1). Quyền chỉ ảnh hưởng **phạm vi xem** ở Tab 2 + dashboard.
- **Mọi sửa đổi đơn ghi audit log** (`don_hang_audit`) — không overwrite, lưu cả `old_value` + `new_value` + `actor_email` + `at`.
- **Phân quyền dựa trên `Sale` (tên CRM)** chứ không phải email. Khi user login, hệ thống match email → CRM-name + SĐT → suy ra `team` + `sub_team` + `role`.
- **Sync nhân sự 24h/lần** từ Metabase question `14393-remaining-lesson-vn` → bảng `nhan_su_sale`.

---

## 3. Logic chia team (Sale → Team → Sub-team)

Lấy từ Metabase question **`14393-remaining-lesson-vn`** (báo cáo Remaining Lesson VN, 2 năm gần nhất). Cột định danh:

| Cột Metabase | Ý nghĩa |
|--------------|---------|
| `Sale` (cột thứ 2 — phân loại hiện tại) | Tên sale CRM, **độc nhất** |
| `depart6_name` | Cấp 6 — VD `HN Inhouse`, `HN Offline Store`, `ONLINE`, `Sales`, `Group KL`, `Telesales Business`, `Thailand sale` |
| `depart7_name` | Cấp 7 — **team chính** (vd `Inhouse 1`, `Inhouse 2`, `Linh Dam Store`, `Tele sale`, `Team 1`) |
| `depart8_name` | Cấp 8 — sub-team (chỉ `Inhouse 1` mới có: `Team 1..5`, `Sales`) |

### Pseudo-code phân loại

```ts
function classifySale(row) {
  const team =
    row.depart7_name?.trim() ||
    (/online/i.test(row.depart6_name || '') ? 'HCM (Online)' : row.depart6_name?.trim()) ||
    'Khac';

  const subTeam = row.depart8_name?.trim() || null; // null nếu không có

  return { team, subTeam };
}
```

### Bảng `nhan_su_sale` (mới — cần Kem tạo)

```sql
CREATE TABLE nhan_su_sale (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_name        varchar UNIQUE NOT NULL,   -- "Sale" (depart-lv2 second occurrence) - độc nhất
  email           varchar,                   -- match với Supabase auth.users.email
  sdt             varchar,                   -- mã vùng + số, dùng cross-check khi login
  depart6_name    varchar,
  depart7_name    varchar,
  depart8_name    varchar,
  team            varchar,                   -- kết quả classifySale()
  sub_team        varchar,                   -- nullable
  role            varchar DEFAULT 'sale',    -- 'sale' | 'leader' | 'manager' | 'system'
  is_active       boolean DEFAULT true,
  synced_at       timestamptz DEFAULT now()
);
CREATE INDEX ON nhan_su_sale (team, sub_team);
CREATE INDEX ON nhan_su_sale (email);
```

### Match login → nhân sự

```
Login email (Supabase auth)
   │
   ├─ tìm trong nhan_su_sale.email  ──► OK → lấy role/team/sub_team
   │
   └─ không khớp → bắt buộc nhập CRM-name + SĐT lần đầu → match nhan_su_sale.crm_name + sdt
                                                       └─ ghi email vào nhan_su_sale.email
```

### Thống kê thực tế (sau khi chạy `_extract_hierarchy.cjs`)

- **149 sale** unique, **15 team** cấp 1.
- Team lớn nhất: **Inhouse 1** (HN) — đã có 5 sub-team (`Team 1..5`) + `Sales`.
- **Inhouse 2** (HN) — 23 sale, **không** sub-team.
- **HCM (Online)** — 15 sale, không sub-team.
- Có ~17 sale **chưa phân loại** (depart6/7/8 trống) → admin cần gán tay khi onboard.

Chi tiết: `docs/team_hierarchy.md`.

---

## 4. Wireframe ASCII (draft)

> Bản trực quan kèm style đầy đủ: mở `docs/wireframes.html`.

### 4.1 Tab 2 — Sale view (L1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PalFish GMV  |  Tab1: Tạo mã  |  Tab2: Đơn của tôi              [logout]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Bộ lọc: [Ngày từ ▾] [đến ▾] [Trạng thái ▾] [Gói học ▾]   [+ Tạo đơn mới] │
│  Hiển thị 12 đơn — chỉ đơn do bạn (Le Kim Chi) tạo                          │
├─────┬──────────┬───────┬──────┬─────────┬──────┬───────┬───────┬───────┬───┤
│ Mã  │ KH/UID   │ SĐT   │ Gói  │ Tổng    │ Cọc  │Info   │ Bill  │ Tiền  │CRM│
│ đơn │          │       │      │ tiền    │      │Code   │       │ về    │   │
├─────┼──────────┼───────┼──────┼─────────┼──────┼───────┼───────┼───────┼───┤
│KH012│ 33117../ │+84... │NEW 48│7,280,000│0     │KH012  │📷view │ ✅    │ ⬜│
│     │ Trần A   │       │      │         │      │QRicon │+upload│       │   │
├─────┼──────────┼───────┼──────┼─────────┼──────┼───────┼───────┼───────┼───┤
│KH011│ 33116../ │+82... │UP 96 │29,680k  │5,000k│KH011  │+upload│ ⬜    │ ⬜│
└─────┴──────────┴───────┴──────┴─────────┴──────┴───────┴───────┴───────┴───┘
  ▸ Ô "Tiền về" + "CRM" disabled cho cấp Sale.
  ▸ Click hàng → mở panel chi tiết (xem audit log của đơn của mình).
```

### 4.2 Tab 2 — Sale Leader view (L2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PalFish GMV  |  Tab1  |  Tab2  |  Dashboard Team ▼                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Team: Inhouse 1 ▾   Sub-team: Team 1 ▾   (16 sale)                        │
│  [Ngày từ ▾] [đến ▾] [Sale ▾ tất cả]   [Export Excel]                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ GMV tháng    │  │ # đơn         │  │ Tỉ lệ tiền về│  │ # đơn pending │   │
│  │ 1.2 tỷ ₫     │  │ 286           │  │ 92%          │  │ 23           │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  Bảng đơn theo sale (sub-team Team 1) — sort GMV desc                       │
│  ┌──────────────────┬──────┬──────┬──────────┬──────────┐                  │
│  │ Sale             │ Đơn  │ GMV  │ Tiền về  │ CRM done │                  │
│  ├──────────────────┼──────┼──────┼──────────┼──────────┤                  │
│  │ Le Kim Chi       │ 42   │ 312M │ 39/42    │ 38/42    │                  │
│  │ Nguyen Kieu Trang│ 35   │ 268M │ 33/35    │ 33/35    │                  │
│  │ Nguyen Thuy Trang│ 24   │ 180M │ 21/24    │ 21/24    │                  │
│  └──────────────────┴──────┴──────┴──────────┴──────────┘                  │
│  ▸ Click "Sale" → drill xuống list đơn (chỉ XEM, không sửa)                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Tab 2 — Ops / Thu Hiền view (L3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tab2: Đơn toàn hệ thống (Ops)  |  Audit log ⏷                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  Filter: [Team ▾] [Sub-team ▾] [Sale ▾] [Trạng thái ▾] [Có bill ▾]         │
│  [Export 3 file thuế ▾]   [Bulk action: tick tiền về]                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  ☐ KH012 | Le Kim Chi (I1/T1) | 7.28M | ✅ tiền về | ⬜ CRM | [sửa] [log]   │
│  ☐ KH011 | Le Kim Chi (I1/T1) | 29.6M | ⬜ tiền về | ⬜ CRM | [sửa] [log]   │
│  ☐ KH010 | Ta Thuy Van  (I1/T3)|  ... | ✅ tiền về | ✅ CRM | [sửa] [log]   │
│                                                                             │
│  ▸ Ô tick "Tiền về" / "CRM" **enabled** với Ops.                            │
│  ▸ [sửa] mở modal sửa SĐT/địa chỉ/gói → ghi audit log (old/new).            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Tab Admin — System view (L4, Kem/Minh)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Admin  |  Tài khoản  |  Nhân sự Sale  |  Audit log  |  Sync CRM           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Sub-tab: Nhân sự Sale  (149 sale từ Metabase, sync lần cuối 21/05 02:00)  │
│                                                                             │
│  [Tìm tên/email ▢]  [Team ▾]  [Role ▾]  [Trạng thái ▾]  [Sync now ↻]       │
│  ┌──────────────┬──────────────┬────────┬──────────┬────────┬───────────┐  │
│  │ CRM name     │ Email        │ Team   │ Sub-team │ Role   │ Action    │  │
│  ├──────────────┼──────────────┼────────┼──────────┼────────┼───────────┤  │
│  │ Le Kim Chi   │ lkc@...      │Inhouse1│ Team 1   │ sale ▾ │[sửa][off] │  │
│  │ Tran Thi Son │ tts@...      │Inhouse1│ Team 2   │leader▾ │[sửa][off] │  │
│  │ Thu Hien     │ th@...       │ Sys    │ -        │ ops  ▾ │[sửa][off] │  │
│  │ DAO THI TRANG│ (chưa link)  │Inhouse1│ -        │leader▾ │[link mail]│  │
│  │ Le Thi Thanh.│ (chưa phân)  │  -     │ -        │ sale ▾ │[gán team] │  │
│  └──────────────┴──────────────┴────────┴──────────┴────────┴───────────┘  │
│                                                                             │
│  Sub-tab: Tài khoản (Supabase auth)                                         │
│  ┌─────────────────────┬──────────────┬───────────┬────────────────────┐    │
│  │ Email               │ Last login   │ CRM link  │ Action             │    │
│  ├─────────────────────┼──────────────┼───────────┼────────────────────┤    │
│  │ ...@gmail.com       │ 21/05 09:12  │ Le Kim Chi│ [đổi role][khoá]   │    │
│  └─────────────────────┴──────────────┴───────────┴────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Audit log (xuyên suốt)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Audit log — đơn KH012                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 21/05 09:15  Le Kim Chi (sale)    Tạo đơn KH012 / Info=KH012                │
│ 21/05 10:02  Thu Hien (ops)       Tick "tiền về" ⬜→✅                       │
│ 21/05 10:30  Thu Hien (ops)       SĐT "+84912..." → "+84913..."             │
│ 21/05 10:45  Kem (system)         Reassign sale "Tran A" → "Tran An"        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Schema bổ sung cần Kem code

```sql
-- Bảng nhân sự (sync 24h từ Metabase)
CREATE TABLE nhan_su_sale ( ... );  -- xem mục 3

-- Audit log đơn hàng
CREATE TABLE don_hang_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  don_hang_id   uuid NOT NULL REFERENCES don_hang(id),
  actor_email   varchar NOT NULL,
  actor_role    varchar NOT NULL,        -- snapshot lúc thao tác
  action        varchar NOT NULL,        -- 'create' | 'update' | 'tick_tien_ve' | 'tick_crm' | 'upload_bill'
  field         varchar,                 -- nullable, khi action='update'
  old_value     jsonb,
  new_value     jsonb,
  at            timestamptz DEFAULT now()
);
CREATE INDEX ON don_hang_audit (don_hang_id, at DESC);

-- Bổ sung cho don_hang
ALTER TABLE don_hang ADD COLUMN IF NOT EXISTS sale_crm_name varchar;  -- nguồn truth phân quyền
CREATE INDEX IF NOT EXISTS idx_don_hang_sale_crm ON don_hang (sale_crm_name);
```

### Endpoint backend cần thêm

| Method | Path | Mô tả | Role |
|--------|------|-------|------|
| `GET` | `/admin/sales` | List nhân sự (paginate, filter team/sub_team/role) | system |
| `PATCH` | `/admin/sales/{crm_name}` | Đổi role / gán team / link email | system |
| `POST` | `/admin/sales/sync` | Trigger sync Metabase ngay | system |
| `GET` | `/dashboard/team` | Tổng hợp đơn của team mình | leader |
| `GET` | `/orders/{id}/audit` | Audit log của 1 đơn | sale (đơn mình) / leader / ops / system |
| `POST` | `/orders/{id}/audit` | Ghi sự kiện audit (gọi từ middleware) | any |

---

## 6. Roadmap đề xuất (sếp duyệt)

| Ngày | Việc | Người |
|------|------|-------|
| 21/05 sáng | Vẽ wireframe + propose (file này) | Minh |
| 21/05 chiều | Kem code skeleton `nhan_su_sale` + `don_hang_audit` | Kem |
| 21/05 tối | Minh QA kết nối Metabase sync + match login | Minh + Hiếu |
| 22/05 | Hoàn thiện Admin tab + Sale Leader dashboard | Kem |
| 23/05 | E2E test phân quyền + deploy web | Minh + Kem |

---

## 7. Câu hỏi cần QL chốt trước khi code

1. **Sale Leader cụ thể là ai trong từng team/sub-team?** (Hiện data chưa có cờ "is_leader" — cần list từ QL hoặc thêm cột trên Metabase.)
2. **Ops thấy được team Thailand không?** Hiện đề xuất: **không** (Thailand sale ngoài phạm vi GMV VN). Cần xác nhận.
3. **Sale có được xem GMV của chính mình không** (con số tổng), hay chỉ thấy list đơn? Đề xuất: chỉ list đơn, không thấy GMV tổng cá nhân.
4. **Khi sale nghỉ việc** → đơn cũ giữ nguyên `sale_crm_name`? (Đề xuất: giữ, chỉ disable account.)
5. **Sub-team `Sales` trong Inhouse 1** là gì? (Có sale như "Nina", "Le To Hai My" — nhìn data thì có vẻ là tổ chuyên trách. Cần Thu Hiền xác nhận tên gọi.)
