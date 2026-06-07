# Handoff — Đạt: RBAC + E2E test module Doanh thu

**Ngày:** 2026-06-07
**Spec đầy đủ:** `docs/SPEC_DOANH_THU.md`
**Ưu tiên:** Top 2 — làm sau khi Đức + Giang + Minh xong phần FE + BE chính
**Phụ thuộc:** Cần FE có giao diện + BE API hoạt động rồi mới test được

---

## Tổng quan việc cần làm

| # | Việc | Giờ |
|---|------|-----|
| 1 | Thêm permission key `payments` vào RBAC matrix | 30m |
| 2 | FE: ẩn tab/nút theo quyền | 30m |
| 3 | E2E test (Playwright) | 3h |

---

## Việc 1 — Thêm permission key vào RBAC (30m)

### Bước 1: Seed permission key

Module doanh thu dùng key = `"payments"`. Cần thêm vào:

**File `frontend/src/types/permissions.ts`** — thêm vào danh sách module:

```typescript
// Tìm mảng MODULE_LIST hoặc tương đương, thêm:
{ key: "payments", label: "Quản lý Doanh thu" }
```

**Supabase `module_permissions`** (hoặc bảng seed permission):

```sql
-- Thêm permission cho các department cần thiết
-- Ví dụ: department "sales" chỉ xem, department "data_ops" full access
insert into module_permissions (department, module_key, access_level) values
  ('sales', 'payments', 'none'),       -- sale không thấy tab này
  ('hr_admin', 'payments', 'read'),    -- leader xem
  ('data_ops', 'payments', 'full'),    -- data team nhập/sửa
  ('system', 'payments', 'full');      -- system full
```

**Lưu ý:** Kiểm tra lại cấu trúc bảng permission hiện tại — có thể dùng bảng `module_permissions` hoặc `permission_overrides`. Xem pattern ở `PermissionsTab.tsx` và `admin_routes.py`.

### Bước 2: BE — các endpoint mới đã dùng sẵn

Đức đã code `require_module_access(sb, actor, "payments")` và `require_module_write(sb, actor, "payments")` trong các endpoint. Chỉ cần đảm bảo key `"payments"` tồn tại trong hệ thống permission.

### Bảng phân quyền (từ spec)

| Hành động | sale | leader | data/manager | system |
|-----------|------|--------|--------------|--------|
| Xem tab Doanh thu | — | V (read) | V (full) | V (full) |
| Thêm / sửa / refund | — | — | V | V |
| Xóa (soft delete) | — | — | — | V |
| Sửa master | — | — | V | V |
| Xem báo cáo | — | V | V | V |

Mapping vào RBAC hiện tại:
- `access_level = "none"` → không thấy tab
- `access_level = "read"` → thấy tab, xem data, KHÔNG có nút Thêm/Sửa/Xóa
- `access_level = "full"` → thấy tab, mọi thao tác

---

## Việc 2 — FE: ẩn tab/nút theo quyền (30m)

**File `frontend/src/pages/MainPage.tsx`:**

```typescript
// Tìm phần build navigation items, thêm:
if (can("payments"))
  list.push({
    id: "payments",
    label: "Quản lý Doanh thu",
    icon: I.ledger,  // hoặc icon phù hợp
    section: "Báo cáo",  // nằm cùng section với Sổ doanh thu
  });
```

**Trong component PaymentsTab (Minh sẽ tạo):**

```typescript
// Pattern đã có sẵn trong app:
const { canWrite } = usePermission("payments");

// Nút Thêm/Sửa/Xóa: chỉ hiện khi canWrite
{canWrite && <Button onClick={...}>+ Thêm doanh thu</Button>}
```

Xem pattern ở `SoDoanhThuTab.tsx` — đã có `usePermission` hook sẵn.

---

## Việc 3 — E2E test (3h)

### Setup

Tạo file `frontend/e2e/payments.spec.ts`. Pattern giống `e2e/crm-sync.spec.ts`.

### Kịch bản test

```typescript
import { test, expect } from "@playwright/test";

test.describe("Module Doanh thu", () => {

  // --- Màn hình 1: Doanh thu ---

  test("Hiển thị danh sách payments với summary cards", async ({ page }) => {
    // 1. Navigate vào tab Doanh thu
    // 2. Kiểm tra 5 summary cards hiển thị (Tổng GMV, Doanh thu VNĐ, Số đơn, Chưa khớp NH, Chưa kích hoạt CRM)
    // 3. Kiểm tra bảng grid có data (ít nhất 1 dòng)
    // 4. Kiểm tra các cột: Ngày, Khách, Sale, Team, Tiền VNĐ, GMV, Trạng thái
  });

  test("Filter theo team hoạt động", async ({ page }) => {
    // 1. Click tab "In-house"
    // 2. Kiểm tra data chỉ hiện team In-house
    // 3. Summary cards cập nhật
  });

  test("Thêm doanh thu mới", async ({ page }) => {
    // 1. Click nút "+ Thêm doanh thu"
    // 2. Dialog mở ra
    // 3. Điền: uid, pay_time, package, sale, tiền VNĐ
    // 4. Kiểm tra GMV tự tính
    // 5. Click Lưu
    // 6. Toast "Đã thêm"
    // 7. Record mới xuất hiện trong grid
  });

  test("Sửa inline trong grid", async ({ page }) => {
    // 1. Double-click ô Note
    // 2. Nhập text mới
    // 3. Press Enter
    // 4. Ô cập nhật
  });

  test("Hoàn tiền", async ({ page }) => {
    // 1. Click vào 1 dòng → dialog Chi tiết mở
    // 2. Click nút "Hoàn tiền"
    // 3. Confirm
    // 4. Trạng thái chuyển sang "refunded" (badge đỏ)
  });

  test("Khôi phục sau hoàn tiền", async ({ page }) => {
    // 1. Click vào dòng refunded
    // 2. Click "Khôi phục"
    // 3. Trạng thái chuyển sang "active"
  });

  // --- Màn hình 2: Báo cáo ---

  test("Báo cáo BCTB hiển thị pivot", async ({ page }) => {
    // 1. Navigate sang tab Báo cáo
    // 2. Tab BCTB active mặc định
    // 3. Kiểm tra bảng pivot có hàng (sale) × cột (ngày)
    // 4. Đổi khoảng ngày → data cập nhật
  });

  test("Export Excel báo cáo", async ({ page }) => {
    // 1. Click nút "Xuất Excel"
    // 2. File .xlsx download thành công
  });

  // --- Màn hình 3: Đối soát ---

  test("Đối soát nội bộ hiển thị cảnh báo", async ({ page }) => {
    // 1. Navigate sang tab Đối soát
    // 2. Khối "Cảnh báo nội bộ" hiện danh sách
    // 3. Mỗi warning có type + message
  });

  // --- Màn hình 4: Danh mục ---

  test("Danh mục Sale hiển thị + sửa", async ({ page }) => {
    // 1. Navigate sang tab Danh mục
    // 2. Tab Sale active mặc định
    // 3. Bảng hiện danh sách sales (~190)
    // 4. Click 1 dòng → dialog sửa
    // 5. Đổi short_code → Lưu → cập nhật
  });

});
```

### Lưu ý khi viết test

1. **Auth:** Dùng `auth.setup.ts` có sẵn (login 1 lần, reuse session). User test cần role `manager` hoặc `system` để thấy tab + có quyền thao tác.

2. **Data:** Test trên data đã migrate (~28k dòng). Nếu chạy trên sandbox, cần seed data test riêng.

3. **AG Grid:** Grid dùng AG Grid Community — DOM khác với `<table>` thông thường. Selector cần dùng:
   - `.ag-cell` cho ô
   - `.ag-row` cho dòng
   - `.ag-header-cell` cho header
   - Double-click `.ag-cell` để vào edit mode

4. **Config test:**

```typescript
// playwright.config.ts — đã có sẵn, chỉ cần thêm file mới vào testDir
```

5. **Chạy test:**

```bash
cd frontend
npx playwright test e2e/payments.spec.ts          # headless
npx playwright test e2e/payments.spec.ts --headed  # xem browser
```

---

## Checklist xong

- [ ] Permission key `"payments"` đã thêm vào RBAC matrix
- [ ] Tab Doanh thu ẩn/hiện theo quyền
- [ ] Nút Thêm/Sửa/Xóa ẩn khi `access_level = "read"`
- [ ] E2E test: ≥8 test cases pass (list, filter, thêm, sửa, refund, restore, báo cáo, danh mục)
- [ ] Chạy `npm run e2e` — all green
