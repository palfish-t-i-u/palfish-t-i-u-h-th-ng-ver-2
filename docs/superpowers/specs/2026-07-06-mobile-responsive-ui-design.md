# Spec: Tối ưu UI cho Mobile (Responsive Web)

**Ngày:** 2026-07-06
**Trạng thái:** Approved (anh Minh chốt 6/7)
**Phạm vi:** Frontend only — không đụng backend, không thêm dependency.

## 1. Mục tiêu

Toàn bộ app GMV dùng được trên điện thoại qua trình duyệt (responsive web).
Giao diện desktop (≥768px) **giữ nguyên 100%** — mọi thay đổi chỉ áp dụng
dưới breakpoint `md` của Tailwind.

Quyết định scope (đã chốt qua AskUserQuestion 6/7):
- **Đối tượng:** toàn bộ app, mọi module, mọi role.
- **Hình thức:** responsive web (không PWA, không app riêng).
- **Bảng dữ liệu:** card view trên mobile (mỗi dòng → 1 thẻ dọc).
  Ngoại lệ: bảng pivot báo cáo (BC01/BC02/BC03, Sổ doanh thu ma trận tháng)
  giữ cuộn ngang + cột dính vì card view không hợp bảng chéo.

## 2. Hiện trạng (khảo sát 6/7)

- `layouts/AppShell.tsx`: sidebar `hidden md:flex`; mobile có bottom nav
  (`md:hidden`) nhưng chỉ render `items.slice(0, 5)` → **15+ module không
  mở được trên mobile**. Đây là lỗ hổng lớn nhất.
- 6 tab dữ liệu chính (PaymentRequestsTab, ReconciliationTab, ActivationTab,
  SoDoanhThuTab, InvoiceRequestTab, CardReconciliationTab): **0 responsive
  prefix**, bảng `min-w-[800px]`–`min-w-[1280px]`, chỉ có `overflow-x-auto`.
- `ui/Table.tsx`: base `<Table>` có `min-w-[800px]` mặc định.
- `ui/Modal.tsx`: `max-w-lg`/`max-w-3xl`, căn giữa — dùng được trên mobile
  nhưng chưa tối ưu (không bottom-sheet).
- Drawer: `.drawer` trong `prototype-payments.css` = `min(880px, 92vw)`;
  `auth-accounts.css` drawer 520px `max-width: 100vw`. Vừa màn nhưng nội dung
  bên trong (form nhiều cột) không reflow.
- `PaymentRequestDetailDrawer.tsx` 2.615 dòng — màn nặng nhất.
- Không có `useMediaQuery`/`matchMedia` ở đâu cả. Viewport meta đã đúng.
- Tailwind breakpoint mặc định, không custom. Không min-width trên body/#root.

## 3. Phương án chọn: "Nền trước, cuốn chiếu sau"

So 3 phương án theo 3 tiêu chí (triệt để / không lỗi con / không tăng gánh nặng):

| | A. Nền chung → cuốn chiếu | B. Sửa từng tab ad-hoc | C. Màn mobile riêng |
|---|---|---|---|
| Triệt để | ✅ | ❌ dễ sót | ✅ |
| Lỗi con | ✅ 1 bộ component test 1 lần | ❌ 91 component mỗi cái 1 kiểu | ⚠️ |
| Gánh nặng | ✅ thuần CSS/FE | ✅ | ❌ nhân đôi component |

**Chọn A.**

## 4. Thiết kế

### 4.1 Nền móng (GĐ 0)

**Hook `useIsMobile()`** — `frontend/src/hooks/useIsMobile.ts`.
`window.matchMedia("(max-width: 767px)")` + listener, khớp breakpoint `md`
Tailwind. Dùng khi cần đổi cấu trúc render (bảng ↔ card) để tránh render
2 cây DOM ẩn/hiện bằng CSS với list dài.

**Điều hướng mobile** — sửa `layouts/AppShell.tsx`:
- Bottom nav: 4 mục đầu (`items.slice(0, 4)`) + nút thứ 5 cố định **"Thêm"**.
- "Thêm" mở **sheet toàn màn hình** (overlay + panel trượt từ đáy): liệt kê
  đủ `items` theo `section`, item có `children` thì expand inline (tái dùng
  logic expandedIds). Chọn xong → `onSelect(id)` + đóng sheet.
- `items` đã được MainPage lọc theo RBAC → sheet tự tôn trọng phân quyền,
  không cần logic quyền mới.
- Mục đang active nằm ngoài 4 slot đầu → nút "Thêm" hiển thị trạng thái active.

**Card view primitive** — `frontend/src/components/ui/RowCard.tsx`:
- `RowCardList` (khung danh sách) + `RowCard` (1 thẻ): dòng đầu = tiêu đề
  (tên khách/mã PR) + giá trị chính (số tiền); dòng badge trạng thái;
  các cặp label–value phụ; hàng nút thao tác (touch target ≥44px).
- Mỗi tab tự map dữ liệu vào RowCard (field nào lên thẻ do tab quyết),
  nhưng khung + style + hành vi bấm dùng chung.
- Pattern chuyển đổi: `useIsMobile()` → mobile render `RowCardList`,
  desktop render bảng hiện có. Không sửa bảng desktop.

**Modal bottom-sheet** — sửa `ui/Modal.tsx`:
- Mobile: `items-end`, panel `w-full rounded-t-gmv-lg max-h-[92vh]`,
  desktop giữ nguyên căn giữa. Thuần CSS (`max-md:` classes), không đổi API.

**Drawer full màn** — CSS:
- `prototype-payments.css` `.drawer`: thêm `@media (max-width: 767px)`
  → `width: 100vw`.
- `auth-accounts.css` drawer: tương tự.

**`ui/Table.tsx`**: `min-w-[800px]` → giữ cho desktop, nhưng các màn đã có
card view thì bảng chỉ render trên desktop nên không cần đổi base. Không sửa
để tránh lỗi lây.

### 4.2 Cuốn chiếu theo nhóm màn

**GĐ 1 — Sales** (dùng mobile nhiều nhất): `DashboardTab` (grid 2 cột
`minmax(380px,…)` → 1 cột mobile; BXH, events), `Module6Tab` (KPI cards wrap,
chart recharts đã responsive, bảng → card), `SoDoanhThuTab` (ma trận tháng →
ngoại lệ scroll ngang + sticky cột team/sale).

**GĐ 2 — Nghiệp vụ kế toán**: `PaymentRequestsTab` + `PaymentRequestTable`
(11 cột → card: khách + số tiền + trạng thái + sale + ngày), 
`PaymentRequestDetailDrawer` (2.615 dòng: grid nhiều cột → 1 cột mobile,
QR block co giãn, action bar dính đáy), `ReconciliationTab`, `ActivationTab`,
`InvoiceRequestTab`, `CardReconciliationTab` — tất cả list → card view,
filter bar wrap xuống dòng.

**GĐ 3 — Báo cáo + Admin**: BC01/BC02/BC03 giữ bảng + scroll ngang + sticky
(đã có sẵn sticky helpers trong `ui/Table.tsx`), chỉ chỉnh filter/header wrap.
Zalo hub (Config/Groups/Outbox), DingTalk hub, `AuthAccountsTab`,
`PermissionsTab` (ma trận quyền → scroll ngang), `Module5Tab` (CRM sync),
`gatewaySync`, `profile`.

**GĐ 4 — Kiểm thử + rollout**: xem §6.

### 4.3 Nguyên tắc chung mọi giai đoạn

1. Desktop ≥768px: **không đổi pixel nào**. Mọi thay đổi qua `max-md:`
   hoặc nhánh `useIsMobile()`.
2. Card view cho danh sách; pivot/ma trận giữ scroll ngang + cột dính.
3. Touch target ≥44px cho nút thao tác trên mobile.
4. Filter bar/toolbar: wrap tự nhiên, không ép 1 hàng.
5. Không thêm dependency mới.

## 5. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Sửa component nền (Modal, AppShell) lỗi lây desktop | E2E desktop hiện có phải pass sau mỗi giai đoạn; thay đổi guard bằng breakpoint |
| Drawer PR 2.615 dòng — regression nghiệp vụ | Chỉ sửa layout/class, không đụng logic; test tay flow tạo PR + QR + thanh toán trên sandbox |
| Card view thiếu field kế toán cần | Mỗi card có nút mở chi tiết đầy đủ; duyệt field với anh Minh trước khi làm GĐ 2 |
| Double-render bảng+card làm chậm list dài | Dùng `useIsMobile()` render 1 nhánh, không dùng CSS ẩn/hiện cho list |

## 6. Kiểm thử & Rollout

- **Unit:** Vitest cho `useIsMobile`, RowCard, sheet "Thêm" (render đủ items,
  tôn trọng RBAC qua props).
- **E2E:** thêm Playwright project viewport mobile (`devices["iPhone 13"]`)
  trong `playwright.config.ts`; spec mới `e2e/mobile-nav.spec.ts` (mở sheet
  "Thêm", điều hướng đủ module theo role) + smoke card view. E2E desktop
  hiện có (crm-sync, dashboard-sales) phải pass nguyên trạng.
- **Type check:** `npx tsc -b` trước mỗi push (Vercel convention).
- **Rollout:** branch `mobile-ui` → merge `sandbox` (Vercel sandbox tự deploy)
  → duyệt bằng điện thoại thật trên https://palfish-gmv-manager-sandbox.vercel.app
  → soak → merge `main` → prod. Backend/Render không đụng.
- Commit gom theo giai đoạn (squash), không commit vụn.

## 7. Ước lượng

| Giai đoạn | Khối lượng |
|---|---|
| GĐ 0 Nền móng | ~1,5 ngày |
| GĐ 1 Sales | ~1,5 ngày |
| GĐ 2 Kế toán | ~3–4 ngày |
| GĐ 3 Báo cáo + Admin | ~1,5 ngày |
| GĐ 4 Test + rollout | ~1 ngày |
| **Tổng** | **~7–10 ngày công** |
