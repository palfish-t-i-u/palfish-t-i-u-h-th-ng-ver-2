# GĐ 1 Mobile UI — Màn hình Sales: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 màn Sales dùng nhiều nhất trên mobile (Bảng thông tin, Sổ doanh thu, Dashboard Sale) hiển thị tốt dưới 768px + fix header bị cắt (feedback iPhone 6/7). Desktop ≥768px không đổi pixel nào.

**Architecture:** Tái dùng nền GĐ 0 (`useIsMobile()`, `RowCard`/`RowCardList` — đã merge sandbox). Bảng danh sách → card view qua nhánh `useIsMobile()`; thay đổi layout thuần CSS qua `max-md:`. Helpers dùng chung tách ra `lib/` để tránh circular import giữa tab và component card.

**Tech Stack:** React 19 + Tailwind (`max-md:` variant) + Vitest + Playwright (project `mobile`, Pixel 5). Không thêm dependency.

**Nhánh & rollout:** branch `mobile-ui-gd1` từ `sandbox` → làm xong squash merge về `sandbox` (Vercel sandbox auto-deploy) → anh Minh duyệt bằng điện thoại → soak → merge `main` (ngoài scope plan này).

---

## Bối cảnh từ feedback GĐ 0 (8 ảnh iPhone, 6/7)

| Feedback | Xử lý ở |
|---|---|
| Header "Kích hoạt khóa..." bị ellipsis vì nút Đăng xuất + badge role chiếm chỗ | **Task 2** |
| Dashboard bị nhốt trong viewport (`h-[calc(100vh-64px-48px)] overflow-hidden`), BXH 6 cột tràn ngang | **Task 3** |
| Bảng Sổ doanh thu 12 cột `min-w-[1280px]` scroll ngang | **Task 4** (card view) |
| Bảng chi tiết Sale 21 cột `min-w-[1200px]` | **Task 5** (card + xem đủ chỉ số) |
| Timestamp ISO thô trong drawer PR/AR | **GĐ 2** (thuộc drawer, ngoài scope GĐ 1) |

**Deviation so với spec 2026-07-06-mobile-responsive-ui-design.md §4.2:** spec ghi SoDoanhThuTab là "ma trận tháng → ngoại lệ scroll ngang". Thực tế `SoDoanhThuTab.tsx` là bảng danh sách phẳng (12 cột, infinite scroll) — KHÔNG phải pivot. Theo nguyên tắc chung §4.3 ("card view cho danh sách"), tab này chuyển card view trên mobile. Bảng pivot thật (BC01/BC02/DoanhThuSaleTab) vẫn thuộc GĐ 3.

## File structure

| File | Việc |
|---|---|
| `frontend/src/layouts/AppShell.tsx` | Modify — header mobile compact (Task 2) |
| `frontend/src/layouts/AppShell.test.tsx` | Modify — thêm 2 test header (Task 2) |
| `frontend/src/components/DashboardTab.tsx` | Modify — CSS `max-md:` (Task 3) |
| `frontend/src/lib/ledgerFormat.ts` | Create — `fmtPayTime`, `orderIdDisplay` dùng chung (Task 4) |
| `frontend/src/components/LedgerRowCards.tsx` | Create — card view Sổ doanh thu (Task 4) |
| `frontend/src/components/LedgerRowCards.test.tsx` | Create (Task 4) |
| `frontend/src/components/SoDoanhThuTab.tsx` | Modify — nhánh isMobile (Task 4) |
| `frontend/src/lib/saleDetailColumns.ts` | Create — tách 21 cột + `detailCellValue` từ Module6Tab (Task 5) |
| `frontend/src/components/SaleDetailCards.tsx` | Create — card chi tiết Sale (Task 5) |
| `frontend/src/components/SaleDetailCards.test.tsx` | Create (Task 5) |
| `frontend/src/components/Module6Tab.tsx` | Modify — import từ lib + nhánh isMobile (Task 5) |
| `frontend/e2e/mobile-sales.spec.ts` | Create — smoke Pixel 5 (Task 6) |

Nguyên tắc bất di bất dịch (spec §4.3): desktop ≥768px không đổi; touch target ≥44px; không dependency mới; không đụng backend.

---

### Task 1: Branch setup

Worktree hiện có file dirty KHÔNG liên quan (crm-token-extension/, GatewaySyncTab.tsx, api.ts, mockGatewayTxns.ts, palfish-gmv-sync.zip + vài file untracked docs/scripts). **Không stage, không commit, không revert các file đó** — thuộc workstream Gateway extension.

- [ ] **Step 1: Tạo branch từ sandbox**

```bash
cd "E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2"
git checkout sandbox
git pull origin sandbox
git checkout -b mobile-ui-gd1
```

Expected: `Switched to a new branch 'mobile-ui-gd1'`. File dirty vẫn nằm nguyên trong worktree — OK.

- [ ] **Step 2: Xác nhận nền GĐ 0 có mặt**

```bash
ls frontend/src/hooks/useIsMobile.ts frontend/src/components/ui/RowCard.tsx frontend/src/layouts/MobileNavSheet.tsx
```

Expected: 3 file tồn tại. Nếu thiếu → GĐ 0 chưa merge sandbox, DỪNG và báo lại.

---

### Task 2: AppShell — header mobile compact (fix feedback header bị cắt)

Header 375px hiện chứa: title+subtitle | chuông (headerExtras) + badge role "BÁN HÀNG" + nút "Đăng xuất" → title chỉ còn ~40% bề ngang. Fix: trên mobile (1) nút Đăng xuất chỉ còn icon, (2) ẩn badge role (role vẫn xem được ở Thông tin cá nhân). Desktop giữ nguyên.

**Files:**
- Modify: `frontend/src/layouts/AppShell.tsx` (header, quanh dòng 289–307)
- Test: `frontend/src/layouts/AppShell.test.tsx`

- [ ] **Step 1: Viết 2 test fail**

Thêm vào cuối `describe` hiện có trong `frontend/src/layouts/AppShell.test.tsx` (test hiện có render AppShell với props — tái dùng helper/props pattern sẵn có trong file; nếu file dùng hàm `renderShell()` thì truyền thêm `userRole="BÁN HÀNG"` và `onSignOut={vi.fn()}`):

```tsx
it("nút Đăng xuất có aria-label và text ẩn trên mobile", () => {
  render(
    <AppShell
      items={makeItems(3)}
      activeId="a0"
      onSelect={() => {}}
      title="T"
      userRole="BÁN HÀNG"
      onSignOut={() => {}}
    >
      <div />
    </AppShell>
  );
  const btn = screen.getByRole("button", { name: "Đăng xuất" });
  // text ẩn dưới md, icon ẩn từ md trở lên
  expect(btn.querySelector("span.max-md\\:hidden")).toHaveTextContent("Đăng xuất");
  expect(btn.querySelector("svg.md\\:hidden")).not.toBeNull();
});

it("badge role ẩn trên mobile", () => {
  render(
    <AppShell
      items={makeItems(3)}
      activeId="a0"
      onSelect={() => {}}
      title="T"
      userRole="BÁN HÀNG"
      onSignOut={() => {}}
    >
      <div />
    </AppShell>
  );
  const badge = screen.getByText("BÁN HÀNG");
  expect(badge.className).toContain("max-md:hidden");
});
```

Lưu ý: `makeItems(n)` là helper đã có trong AppShell.test.tsx (tạo từ GĐ 0). Nếu tên khác, dùng đúng tên trong file.

- [ ] **Step 2: Chạy test, xác nhận fail**

```bash
cd frontend && npx vitest run src/layouts/AppShell.test.tsx
```

Expected: 2 test mới FAIL (thiếu aria-label/icon/class), 5 test GĐ 0 vẫn pass.

- [ ] **Step 3: Sửa AppShell.tsx**

Thay block badge role + nút Đăng xuất trong `<header>` (hiện tại):

```tsx
            {userRole && <Badge tone="neutral">{userRole}</Badge>}
            <span className="hidden text-xs text-gmv-muted sm:inline">{userEmail || "dev@local"}</span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-[44px] rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium text-gmv-text-strong hover:bg-gmv-bg"
              >
                Đăng xuất
              </button>
            )}
```

bằng:

```tsx
            {userRole && (
              <Badge tone="neutral" className="max-md:hidden">
                {userRole}
              </Badge>
            )}
            <span className="hidden text-xs text-gmv-muted sm:inline">{userEmail || "dev@local"}</span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Đăng xuất"
                className="flex min-h-[44px] items-center rounded-gmv-md border border-gmv-border bg-gmv-canvas px-3 py-1.5 text-xs font-medium text-gmv-text-strong hover:bg-gmv-bg max-md:px-2.5"
              >
                <svg
                  className="md:hidden"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="max-md:hidden">Đăng xuất</span>
              </button>
            )}
```

(Badge component nhận `className` — đã dùng pattern này ở SoDoanhThuTab `<Badge ... className="mt-1">`.)

- [ ] **Step 4: Chạy test, xác nhận pass**

```bash
cd frontend && npx vitest run src/layouts/AppShell.test.tsx
```

Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/AppShell.tsx frontend/src/layouts/AppShell.test.tsx
git commit -m "feat(mobile): header compact — logout icon-only, an badge role duoi md"
```

---

### Task 3: DashboardTab — page scroll tự nhiên + BXH compact trên mobile

Hiện trạng: root `h-[calc(100vh-64px-48px)] overflow-hidden` nhốt toàn dashboard trong viewport (calc còn sai trên mobile vì thêm bottom nav 72px); BXH tháng dùng grid 6 cột min ~460px → tràn trên 375px. Fix thuần CSS `max-md:`: mobile cho page scroll tự nhiên, BXH ẩn 2 cột Team/Subteam (gộp xuống dưới tên), desktop giữ nguyên.

**Files:**
- Modify: `frontend/src/components/DashboardTab.tsx` (hàm `MonthRanking` ~dòng 407–463, JSX root ~dòng 665–684)

Không có unit test riêng cho task này (thay đổi chỉ là class CSS, jsdom không apply media query) — verify bằng `tsc -b` + E2E mobile ở Task 6 (assert không tràn ngang) + duyệt mắt trên sandbox.

- [ ] **Step 1: Sửa root layout (cuối file, component `DashboardTab`)**

Thay:

```tsx
    <div className="min-w-0 bg-[#F4F5F8] p-0 text-[#101426] md:p-1 h-[calc(100vh-64px-48px)] overflow-hidden">
      <div className="grid h-full gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.9fr)]">
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
```

bằng:

```tsx
    <div className="min-w-0 bg-[#F4F5F8] p-0 text-[#101426] md:p-1 h-[calc(100vh-64px-48px)] overflow-hidden max-md:h-auto max-md:overflow-visible">
      <div className="grid h-full gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.9fr)] max-md:h-auto">
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden max-md:overflow-visible">
```

và cột phải, thay:

```tsx
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
          <RankPositionCard currentUser={summary?.current_user} ranking={salesData.month} />
```

bằng:

```tsx
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden max-md:overflow-visible">
          <RankPositionCard currentUser={summary?.current_user} ranking={salesData.month} />
```

- [ ] **Step 2: Sửa `MonthRanking` — header grid**

Thay:

```tsx
      <div className="grid grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] gap-2 border-b border-[#E8EAF2] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#9AA1B3]">
        <span>Hạng</span>
        <span>Nhân viên</span>
        <span>Team</span>
        <span>Subteam</span>
        <span className="text-right">Doanh thu</span>
        <span className="text-right">Đơn b.động</span>
      </div>
```

bằng:

```tsx
      <div className="grid grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] gap-2 border-b border-[#E8EAF2] px-4 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#9AA1B3] max-md:grid-cols-[36px_minmax(0,1fr)_78px_60px] max-md:px-3">
        <span>Hạng</span>
        <span>Nhân viên</span>
        <span className="max-md:hidden">Team</span>
        <span className="max-md:hidden">Subteam</span>
        <span className="text-right">Doanh thu</span>
        <span className="text-right">Đơn b.động</span>
      </div>
```

- [ ] **Step 3: Sửa `MonthRanking` — list container + row grid**

Container list, thay:

```tsx
      <div className="min-h-0 flex-1 divide-y divide-[#E8EAF2] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#c4b5fd]">
```

bằng:

```tsx
      <div className="min-h-0 flex-1 divide-y divide-[#E8EAF2] overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#c4b5fd] max-md:overflow-visible">
```

Row, thay:

```tsx
          <div
            key={`${row.sale_crm_name}-${row.rank}`}
            className={cn(
              "grid min-h-[38px] grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] items-center gap-2 px-4 text-[13px]",
```

bằng:

```tsx
          <div
            key={`${row.sale_crm_name}-${row.rank}`}
            className={cn(
              "grid min-h-[38px] grid-cols-[44px_minmax(140px,1.4fr)_minmax(88px,0.8fr)_minmax(88px,0.8fr)_80px_64px] items-center gap-2 px-4 text-[13px] max-md:grid-cols-[36px_minmax(0,1fr)_78px_60px] max-md:px-3",
```

Cell tên nhân viên — thêm dòng team/subteam chỉ hiện mobile, thay:

```tsx
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[#101426]">{row.sale_crm_name}</div>
              </div>
```

bằng:

```tsx
              <div className="min-w-0">
                <div className="truncate font-extrabold text-[#101426]">{row.sale_crm_name}</div>
                <div className="truncate text-[11px] text-[#8A92A6] md:hidden">
                  {[row.team, subTeamLabel(row.sub_team)].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
```

Cell Team + Subteam — thêm `max-md:hidden`, thay:

```tsx
            <div className="truncate text-[#4B5572]">{row.team || "—"}</div>
            <div className="truncate text-[#4B5572]">{subTeamLabel(row.sub_team) || "—"}</div>
```

bằng:

```tsx
            <div className="truncate text-[#4B5572] max-md:hidden">{row.team || "—"}</div>
            <div className="truncate text-[#4B5572] max-md:hidden">{subTeamLabel(row.sub_team) || "—"}</div>
```

(Grid auto-placement bỏ qua element `display:none` nên 4 cell còn lại rơi đúng 4 cột mobile.)

- [ ] **Step 4: Type check**

```bash
cd frontend && npx tsc -b
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashboardTab.tsx
git commit -m "feat(mobile): Bang thong tin — page scroll tu nhien, BXH compact 4 cot duoi md"
```

---

### Task 4: Sổ doanh thu — card view mobile

Bảng 12 cột `min-w-[1280px]` → mobile render `RowCard` mỗi dòng. Infinite scroll của bảng gắn vào `<Tr>` sentinel với root `.gmv-table-scroll` (không tồn tại ở card view) → mobile dùng nút **"Tải thêm"** tường minh (touch ≥44px). `fmtPayTime`/`orderIdDisplay` đang là hàm local trong SoDoanhThuTab → tách ra `lib/ledgerFormat.ts` để card component import không bị circular.

**Files:**
- Create: `frontend/src/lib/ledgerFormat.ts`
- Create: `frontend/src/components/LedgerRowCards.tsx`
- Create: `frontend/src/components/LedgerRowCards.test.tsx`
- Modify: `frontend/src/components/SoDoanhThuTab.tsx`

- [ ] **Step 1: Tạo `frontend/src/lib/ledgerFormat.ts`**

```ts
import type { RevenueLedgerRow } from "../types/revenue";

/** ISO date/datetime → dd/mm/yyyy. Chuỗi không parse được trả nguyên văn. */
export function fmtPayTime(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Ưu tiên Order ID CRM, fallback mã đơn hàng nội bộ. */
export function orderIdDisplay(row: RevenueLedgerRow): string {
  return row.crmOrderId || row.maDonHang || "—";
}
```

- [ ] **Step 2: Viết test fail — `frontend/src/components/LedgerRowCards.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LedgerRowCards from "./LedgerRowCards";
import type { RevenueLedgerRow } from "../types/revenue";

function makeRow(overrides: Partial<RevenueLedgerRow> = {}): RevenueLedgerRow {
  return {
    id: "r1",
    ngayTienVe: "2026-07-01",
    payTime: "2026-07-01",
    tenKhach: "Nguyễn Văn A",
    sdt: "0912345678",
    uid: "37481212",
    goiHoc: "",
    soTienVnd: 12000000,
    gmvRmb: 3243,
    saleCrmName: "Sale B",
    team: "Inhouse 1",
    loai: "",
    loai2: "",
    note: "",
    note2: "",
    paymentMethod: "",
    loaiNhap: "tay",
    maDonHang: "DH-001",
    crmOrderId: "",
    infoCode: "PF ABC",
    ...overrides,
  } as RevenueLedgerRow;
}

const noop = () => {};
const baseProps = {
  readOnly: false,
  deletingId: null,
  onEdit: noop,
  onDelete: noop,
  hasMore: false,
  loadingMore: false,
  onLoadMore: noop,
  emptyText: "Chưa có dòng",
};

describe("LedgerRowCards", () => {
  it("render tên khách, số tiền, Pay Time dd/mm/yyyy, sales, order id", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} />);
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText(/12\.000\.000/)).toBeInTheDocument();
    expect(screen.getByText("01/07/2026")).toBeInTheDocument();
    expect(screen.getByText("Sale B")).toBeInTheDocument();
    expect(screen.getByText("DH-001")).toBeInTheDocument();
  });

  it("bấm Chỉnh sửa gọi onEdit; dòng tay có nút Xóa gọi onDelete", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const row = makeRow();
    render(<LedgerRowCards {...baseProps} rows={[row]} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Chỉnh sửa" }));
    expect(onEdit).toHaveBeenCalledWith(row);
    fireEvent.click(screen.getByRole("button", { name: "Xóa" }));
    expect(onDelete).toHaveBeenCalledWith(row);
  });

  it("dòng tự động (M3) không có nút Xóa", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow({ loaiNhap: "tu_dong" })]} />);
    expect(screen.getByText("M3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("readOnly ẩn toàn bộ nút thao tác", () => {
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} readOnly />);
    expect(screen.queryByRole("button", { name: "Chỉnh sửa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Xóa" })).toBeNull();
  });

  it("hasMore hiện nút Tải thêm và gọi onLoadMore", () => {
    const onLoadMore = vi.fn();
    render(<LedgerRowCards {...baseProps} rows={[makeRow()]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm" }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("rows rỗng hiện emptyText", () => {
    render(<LedgerRowCards {...baseProps} rows={[]} emptyText="Chưa có dòng" />);
    expect(screen.getByText("Chưa có dòng")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận fail**

```bash
cd frontend && npx vitest run src/components/LedgerRowCards.test.tsx
```

Expected: FAIL — `Cannot find module './LedgerRowCards'`.

- [ ] **Step 4: Tạo `frontend/src/components/LedgerRowCards.tsx`**

```tsx
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import { RowCard, RowCardList } from "./ui/RowCard";
import { cn } from "../lib/cn";
import { formatVndNumber } from "../lib/vndFormat";
import { fmtPayTime, orderIdDisplay } from "../lib/ledgerFormat";
import {
  ledgerPillBase,
  paymentMethodCellClass,
  typeCellClass,
  typeDisplayLabel,
} from "../lib/ledgerCellStyle";
import type { RevenueLedgerRow } from "../types/revenue";

interface Props {
  rows: RevenueLedgerRow[];
  readOnly: boolean;
  deletingId: string | null;
  onEdit: (row: RevenueLedgerRow) => void;
  onDelete: (row: RevenueLedgerRow) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyText: string;
}

/** Card view mobile của Sổ doanh thu — thay bảng 12 cột dưới breakpoint md. */
export default function LedgerRowCards({
  rows,
  readOnly,
  deletingId,
  onEdit,
  onDelete,
  hasMore,
  loadingMore,
  onLoadMore,
  emptyText,
}: Props) {
  return (
    <div className="space-y-2">
      <RowCardList empty={emptyText}>
        {rows.map((row) => (
          <RowCard
            key={row.id}
            className={deletingId === row.id ? "opacity-60" : undefined}
            title={row.tenKhach || "—"}
            value={`${formatVndNumber(row.soTienVnd) || "0"} ₫`}
            badges={
              <>
                <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"}>
                  {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
                </Badge>
                {row.paymentMethod ? (
                  <span className={cn(ledgerPillBase, paymentMethodCellClass(row.paymentMethod))}>
                    {row.paymentMethod}
                  </span>
                ) : null}
                {typeDisplayLabel(row.loai, row.loai2) !== "—" ? (
                  <span className={cn(ledgerPillBase, typeCellClass(row.loai, row.loai2))}>
                    {typeDisplayLabel(row.loai, row.loai2)}
                  </span>
                ) : null}
              </>
            }
            meta={[
              { label: "Pay Time", value: fmtPayTime(row.payTime || row.ngayTienVe) },
              { label: "SĐT", value: row.sdt || "—" },
              { label: "UID", value: row.uid || "—" },
              { label: "Sales", value: row.saleCrmName || "—" },
              { label: "Team", value: row.team || "—" },
              { label: "Nội dung CK", value: row.infoCode || "—" },
              { label: "ID đơn hàng", value: orderIdDisplay(row) },
            ]}
            actions={
              readOnly ? undefined : (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={() => onEdit(row)}>
                    Chỉnh sửa
                  </Button>
                  {row.loaiNhap === "tay" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={deletingId === row.id}
                      onClick={() => onDelete(row)}
                    >
                      {deletingId === row.id ? "…" : "Xóa"}
                    </Button>
                  )}
                </>
              )
            }
          />
        ))}
      </RowCardList>
      {hasMore && (
        <Button
          type="button"
          variant="secondary"
          fullWidth
          className="min-h-[44px]"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? "Đang tải thêm…" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

```bash
cd frontend && npx vitest run src/components/LedgerRowCards.test.tsx
```

Expected: 6 test PASS.

- [ ] **Step 6: Tích hợp vào `SoDoanhThuTab.tsx`**

6a. Thêm import (đầu file, cạnh các import hiện có):

```tsx
import useIsMobile from "../hooks/useIsMobile";
import LedgerRowCards from "./LedgerRowCards";
import { fmtPayTime, orderIdDisplay } from "../lib/ledgerFormat";
```

6b. XÓA 2 hàm local `fmtPayTime` (dòng ~77–82) và `orderIdDisplay` (dòng ~108–110) — giờ import từ lib. `LEDGER_COLUMNS` giữ nguyên, tự dùng bản import.

6c. Trong component `SoDoanhThuTab`, ngay sau `const cellCtx: LedgerCellCtx = ...` thêm:

```tsx
  const isMobile = useIsMobile();
```

6d. Ẩn ColumnVisibilityMenu trên mobile (menu ẩn/hiện cột vô nghĩa với card). Thay:

```tsx
        <ColumnVisibilityMenu
          columns={baseColumns.map((c) => ({ key: c.key, label: c.label, hideable: c.hideable }))}
          isVisible={isVisible}
          onToggle={toggle}
          onShowAll={showAll}
          visibleCount={visibleCount}
        />
```

bằng:

```tsx
        {!isMobile && (
          <ColumnVisibilityMenu
            columns={baseColumns.map((c) => ({ key: c.key, label: c.label, hideable: c.hideable }))}
            isVisible={isVisible}
            onToggle={toggle}
            onShowAll={showAll}
            visibleCount={visibleCount}
          />
        )}
```

6e. Bọc block bảng bằng nhánh isMobile. Thay toàn bộ block từ `<TableScrollWrap>` đến `</TableScrollWrap>` bằng:

```tsx
      {isMobile ? (
        <LedgerRowCards
          rows={rows}
          readOnly={readOnly}
          deletingId={deletingId}
          onEdit={openEdit}
          onDelete={handleDelete}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          emptyText={
            loading
              ? "Đang tải…"
              : hasActiveFilter
                ? "Không có dòng trong khoảng đã lọc — thử Reset bộ lọc hoặc mở rộng ngày."
                : "Chưa có dòng — bấm Thêm dòng hoặc xác nhận M3."
          }
        />
      ) : (
        <TableScrollWrap>
          {/* ...toàn bộ <Table> hiện có GIỮ NGUYÊN không đổi 1 ký tự... */}
        </TableScrollWrap>
      )}
```

(IntersectionObserver load-more của bảng vẫn nguyên — khi mobile không render bảng, `loadMoreRef.current` null → effect return sớm, vô hại.)

- [ ] **Step 7: Chạy toàn bộ test + type check**

```bash
cd frontend && npx vitest run && npx tsc -b
```

Expected: PASS toàn bộ, tsc exit 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/ledgerFormat.ts frontend/src/components/LedgerRowCards.tsx frontend/src/components/LedgerRowCards.test.tsx frontend/src/components/SoDoanhThuTab.tsx
git commit -m "feat(mobile): So doanh thu card view — RowCard moi dong, nut Tai them thay infinite scroll"
```

---

### Task 5: Dashboard Sale (Module6Tab) — card chi tiết Sale trên mobile

Bảng "Chi tiết theo Sale" 21 cột `min-w-[1200px]`. Mobile → card mỗi sale: mặc định 6 chỉ số then chốt, nút "Xem đủ chỉ số" mở đủ 19 chỉ số (không mất dữ liệu — tiêu chí "triệt để"). KPI cards + charts phía trên đã responsive sẵn (`auto-fill minmax`, ResponsiveContainer) — không đụng.

Tách `SALE_DETAIL_COLUMNS` + `detailCellValue` sang `lib/saleDetailColumns.ts` vì SaleDetailCards cần dùng mà import ngược từ Module6Tab sẽ circular.

**Files:**
- Create: `frontend/src/lib/saleDetailColumns.ts`
- Create: `frontend/src/components/SaleDetailCards.tsx`
- Create: `frontend/src/components/SaleDetailCards.test.tsx`
- Modify: `frontend/src/components/Module6Tab.tsx`

- [ ] **Step 1: Tạo `frontend/src/lib/saleDetailColumns.ts`** (chuyển NGUYÊN VĂN từ Module6Tab, chỉ đổi import path + thêm export)

```ts
import { fmtRate, safeDivide } from "./metrics";
import type { DashboardLiveSummary } from "../types/order";

export type SaleDetailRow = DashboardLiveSummary["top_sales"][number];

export type DetailColKind = "text" | "num" | "rate" | "rmb" | "minutes" | "aov";

export const SALE_DETAIL_COLUMNS: {
  label: string;
  key: keyof SaleDetailRow | "aov_rmb";
  kind: DetailColKind;
  sticky?: boolean;
}[] = [
  { label: "Bộ phận", key: "department", kind: "text" },
  { label: "Họ và tên Sale", key: "sale_name", kind: "text", sticky: true },
  { label: "Lead chạy Ads", key: "ad_leads", kind: "num" },
  { label: "Lead lên tay", key: "ad_leads_manual", kind: "num" },
  { label: "Lead giới thiệu", key: "referral_leads", kind: "num" },
  { label: "Tổng Leads", key: "total_leads", kind: "num" },
  { label: "Leads kho chung", key: "gd_leads", kind: "num" },
  { label: "Số lượng hẹn", key: "invitation_number", kind: "num" },
  { label: "Lịch hẹn", key: "scheduled_classes", kind: "num" },
  { label: "Tỷ lệ xem trước", key: "preview_rate", kind: "rate" },
  { label: "Học thử thành công (Trials)", key: "completed_classes", kind: "num" },
  { label: "Tỷ lệ hoàn thành", key: "completion_rate", kind: "rate" },
  { label: "Số đơn chốt", key: "orders", kind: "num" },
  { label: "Doanh thu CRM (RMB)", key: "gmv_rmb", kind: "rmb" },
  { label: "AOV (RMB)", key: "aov_rmb", kind: "aov" },
  { label: "Tổng thời lượng gọi", key: "total_call_time", kind: "minutes" },
  { label: "Tổng cuộc gọi", key: "total_dials", kind: "num" },
  { label: "Tổng kết nối", key: "total_connections", kind: "num" },
  { label: "Tỷ lệ kết nối", key: "connection_rate", kind: "rate" },
  { label: "Cuộc gọi > 3 phút", key: "over_3min_connections", kind: "num" },
  { label: "Tỷ lệ cuộc gọi > 3 phút", key: "over_3min_rate", kind: "rate" },
];

function fmt(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

function cellText(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

function cellNum(v: unknown): string {
  const n = Number(v);
  if (v == null || v === "" || Number.isNaN(n)) return "0";
  return fmt(n);
}

export function detailCellValue(
  row: SaleDetailRow,
  col: (typeof SALE_DETAIL_COLUMNS)[number]
): string {
  if (col.key === "aov_rmb") {
    const gmv = row.gmv_rmb ?? row.total_amount ?? 0;
    const orders = row.orders ?? 0;
    const aov = row.avg_price ?? safeDivide(gmv, orders);
    return cellNum(aov);
  }
  const raw = row[col.key as keyof SaleDetailRow];
  switch (col.kind) {
    case "text":
      return cellText(raw);
    case "num":
      return cellNum(raw);
    case "rate":
      return fmtRate(Number(raw ?? 0));
    case "rmb":
      return cellNum(raw);
    case "minutes": {
      const n = Number(raw);
      if (raw == null || Number.isNaN(n)) return "0 phút";
      return `${n.toFixed(1)} phút`;
    }
    default:
      return cellText(raw);
  }
}
```

- [ ] **Step 2: Viết test fail — `frontend/src/components/SaleDetailCards.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SaleDetailCards from "./SaleDetailCards";
import type { SaleDetailRow } from "../lib/saleDetailColumns";

function makeSale(overrides: Partial<SaleDetailRow> = {}): SaleDetailRow {
  return {
    sale_name: "Trần Thị C",
    department: "Inhouse 1",
    ad_leads: 10,
    ad_leads_manual: 2,
    referral_leads: 3,
    total_leads: 15,
    gd_leads: 1,
    invitation_number: 8,
    scheduled_classes: 7,
    preview_rate: 0.5,
    completed_classes: 6,
    completion_rate: 0.85,
    orders: 4,
    gmv_rmb: 20000,
    total_call_time: 120.5,
    total_dials: 90,
    total_connections: 45,
    connection_rate: 0.5,
    over_3min_connections: 20,
    over_3min_rate: 0.22,
    ...overrides,
  } as SaleDetailRow;
}

describe("SaleDetailCards", () => {
  it("render tên sale, GMV RMB và chỉ số then chốt mặc định", () => {
    render(<SaleDetailCards rows={[makeSale()]} />);
    expect(screen.getByText("Trần Thị C")).toBeInTheDocument();
    expect(screen.getByText(/20\.000 RMB/)).toBeInTheDocument();
    expect(screen.getByText("Tổng Leads")).toBeInTheDocument();
    expect(screen.getByText("Số đơn chốt")).toBeInTheDocument();
    // chỉ số ngoài nhóm then chốt chưa hiện
    expect(screen.queryByText("Tổng cuộc gọi")).toBeNull();
  });

  it("bấm Xem đủ chỉ số hiện toàn bộ, bấm Thu gọn ẩn lại", () => {
    render(<SaleDetailCards rows={[makeSale()]} />);
    fireEvent.click(screen.getByRole("button", { name: /Xem đủ/ }));
    expect(screen.getByText("Tổng cuộc gọi")).toBeInTheDocument();
    expect(screen.getByText("Lead chạy Ads")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn" }));
    expect(screen.queryByText("Tổng cuộc gọi")).toBeNull();
  });

  it("rows rỗng hiện empty state", () => {
    render(<SaleDetailCards rows={[]} />);
    expect(screen.getByText(/Chưa có data/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận fail**

```bash
cd frontend && npx vitest run src/components/SaleDetailCards.test.tsx
```

Expected: FAIL — `Cannot find module './SaleDetailCards'`.

- [ ] **Step 4: Tạo `frontend/src/components/SaleDetailCards.tsx`**

```tsx
import { useState } from "react";
import Badge from "./ui/Badge";
import { RowCard, RowCardList } from "./ui/RowCard";
import {
  SALE_DETAIL_COLUMNS,
  detailCellValue,
  type SaleDetailRow,
} from "../lib/saleDetailColumns";

/** Chỉ số then chốt hiện mặc định trên card (theo thứ tự SALE_DETAIL_COLUMNS). */
const KEY_METRIC_KEYS: readonly string[] = [
  "total_leads",
  "invitation_number",
  "completed_classes",
  "orders",
  "aov_rmb",
  "connection_rate",
];

/** Không đưa vào meta: đã nằm ở title/value/badge của card. */
const HEADER_KEYS: readonly string[] = ["sale_name", "department", "gmv_rmb"];

const GMV_COL = SALE_DETAIL_COLUMNS.find((c) => c.key === "gmv_rmb")!;
const KEY_COLS = SALE_DETAIL_COLUMNS.filter((c) => KEY_METRIC_KEYS.includes(c.key as string));
const EXTRA_COLS = SALE_DETAIL_COLUMNS.filter(
  (c) => !HEADER_KEYS.includes(c.key as string) && !KEY_METRIC_KEYS.includes(c.key as string)
);

function SaleCard({ row }: { row: SaleDetailRow }) {
  const [expanded, setExpanded] = useState(false);
  const cols = expanded ? [...KEY_COLS, ...EXTRA_COLS] : KEY_COLS;
  return (
    <RowCard
      title={row.sale_name}
      value={`${detailCellValue(row, GMV_COL)} RMB`}
      badges={row.department ? <Badge tone="neutral">{row.department}</Badge> : undefined}
      meta={cols.map((c) => ({ label: c.label, value: detailCellValue(row, c) }))}
      actions={
        <button
          type="button"
          className="min-h-[44px] px-1 text-xs font-semibold text-gmv-primary"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : `Xem đủ ${KEY_COLS.length + EXTRA_COLS.length} chỉ số`}
        </button>
      }
    />
  );
}

/** Card view mobile của bảng "Chi tiết theo Sale" (Module 6). */
export default function SaleDetailCards({ rows }: { rows: SaleDetailRow[] }) {
  return (
    <RowCardList empty="Chưa có data — lấy dữ liệu CRM ở tab Đồng bộ CRM trước">
      {rows.map((r) => (
        <SaleCard key={r.sale_name} row={r} />
      ))}
    </RowCardList>
  );
}
```

- [ ] **Step 5: Chạy test, xác nhận pass**

```bash
cd frontend && npx vitest run src/components/SaleDetailCards.test.tsx
```

Expected: 3 test PASS.

- [ ] **Step 6: Sửa `Module6Tab.tsx` — dùng lib + nhánh mobile**

6a. Thêm import:

```tsx
import useIsMobile from "../hooks/useIsMobile";
import SaleDetailCards from "./SaleDetailCards";
import { SALE_DETAIL_COLUMNS, detailCellValue } from "../lib/saleDetailColumns";
```

6b. XÓA các định nghĩa local đã chuyển sang lib (dòng ~66–140): `type SaleDetailRow`, `type DetailColKind`, `const SALE_DETAIL_COLUMNS`, `function cellText`, `function cellNum`, `function detailCellValue`. GIỮ `STICKY_HEAD`, `STICKY_CELL` (chỉ bảng desktop dùng). GIỮ `fmt`/`fmtM` (nơi khác trong file dùng). Nếu `safeDivide` không còn chỗ nào khác dùng → bỏ khỏi import `../lib/metrics` (tsc sẽ báo).

6c. Trong component `Module6Tab`, cạnh các hook đầu component thêm:

```tsx
  const isMobile = useIsMobile();
```

6d. Block DETAIL TABLE — thay:

```tsx
        {topSales.length > 0 ? (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1200px] text-xs">
```

bằng:

```tsx
        {topSales.length > 0 ? (
          isMobile ? (
            <div className="p-3">
              <SaleDetailCards rows={topSales} />
            </div>
          ) : (
          <div className="overflow-x-auto max-w-full">
            <table className="w-full min-w-[1200px] text-xs">
```

và đóng nhánh: sau `</table>` + `</div>` của bảng (trước `) : (` của empty state) thêm `)` đóng ternary:

```tsx
            </table>
          </div>
          )
        ) : (
```

Bảng desktop bên trong GIỮ NGUYÊN không đổi ký tự nào.

- [ ] **Step 7: Chạy toàn bộ test + type check**

```bash
cd frontend && npx vitest run && npx tsc -b
```

Expected: PASS, tsc exit 0 (nếu tsc báo unused import trong Module6Tab → xóa import thừa đúng như 6b).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/saleDetailColumns.ts frontend/src/components/SaleDetailCards.tsx frontend/src/components/SaleDetailCards.test.tsx frontend/src/components/Module6Tab.tsx
git commit -m "feat(mobile): Dashboard Sale — card chi tiet sale voi Xem du chi so, tach saleDetailColumns ra lib"
```

---

### Task 6: E2E smoke mobile (Pixel 5)

Project `mobile` trong playwright.config.ts đã match `/mobile-.*\.spec\.ts/` + storageState account full quyền (GĐ 0). Thêm spec smoke cho 3 màn GĐ 1.

**Files:**
- Create: `frontend/e2e/mobile-sales.spec.ts`

- [ ] **Step 1: Tạo `frontend/e2e/mobile-sales.spec.ts`**

```ts
// frontend/e2e/mobile-sales.spec.ts
import { expect, test, type Page } from "@playwright/test";

/** Mở module qua sheet "Thêm" (module ngoài 4 slot đầu bottom nav). */
async function openViaThem(page: Page, name: RegExp) {
  await page
    .getByRole("navigation", { name: "Điều hướng chính" })
    .getByRole("button", { name: "Thêm" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toBeHidden();
}

test.describe("Mobile GĐ1: màn Sales", () => {
  test("Bảng thông tin: không tràn ngang, BXH render", async ({ page }) => {
    await page.goto("/");
    // "Bảng thông tin" là item đầu → nằm trong 4 slot pinned, label compact "Bảng"
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: "Bảng" })
      .click();
    await expect(page.getByText(/Bảng xếp hạng tháng/)).toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });

  test("Sổ doanh thu: card view, không render bảng", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Sổ doanh thu/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Sổ doanh thu/i);
    // Mobile không được render bảng ledger (card view thay thế)
    await expect(page.locator("main table")).toHaveCount(0);
  });

  test("Dashboard Sale: KPI cards hiện, không tràn ngang", async ({ page }) => {
    await page.goto("/");
    await openViaThem(page, /Dashboard Sale/);
    await expect(page.getByText("Tổng số L1")).toBeVisible();
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflowX).toBeLessThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Chạy E2E mobile**

```bash
cd frontend && npx playwright test --project=mobile
```

Expected: 6 test pass (3 mobile-nav GĐ 0 + 3 mobile-sales mới). Cần `.env.e2e` có sẵn (đã setup từ trước). Nếu "Sổ doanh thu"/"Dashboard Sale" fail vì thiếu data → assert card/empty state vẫn phải pass vì `RowCardList` render empty state; nếu fail vì permission thì kiểm tra account e2e có quyền `revenueLedger`/`module6` rồi báo lại.

- [ ] **Step 3: Chạy E2E desktop xác nhận không regression**

```bash
cd frontend && npx playwright test --project=e2e
```

Expected: pass nguyên trạng như trước plan.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/mobile-sales.spec.ts
git commit -m "test(mobile): e2e smoke Pixel 5 cho 3 man Sales GD1"
```

---

### Task 7: Verification tổng + squash merge sandbox

- [ ] **Step 1: Full check trên `mobile-ui-gd1`**

```bash
cd frontend && npx tsc -b && npx vitest run && npm run build
```

Expected: tất cả exit 0 (build = lệnh Vercel `tsc -b && vite build`).

- [ ] **Step 2: Squash merge về sandbox**

```bash
cd "E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2"
git checkout sandbox
git merge --squash mobile-ui-gd1
git status
```

Kiểm tra `git status`: staged CHỈ gồm các file của plan này (AppShell, DashboardTab, SoDoanhThuTab, Module6Tab, LedgerRowCards*, SaleDetailCards*, ledgerFormat.ts, saleDetailColumns.ts, mobile-sales.spec.ts, AppShell.test.tsx). File dirty của workstream Gateway KHÔNG được nằm trong staged (squash chỉ stage diff của branch — nếu lỡ dính, `git restore --staged <file>`).

- [ ] **Step 3: Commit + push**

```bash
git commit -m "feat(mobile): GD1 man Sales — header compact, Bang thong tin scroll tu nhien + BXH compact, So doanh thu card view, Dashboard Sale card chi tiet, e2e Pixel 5"
git push origin sandbox
```

Expected: Vercel sandbox auto-deploy (~2 phút). 

- [ ] **Step 4: Báo anh Minh duyệt trên điện thoại**

Checklist duyệt tay tại https://palfish-gmv-manager-sandbox.vercel.app/ (login test.admin@dev):
1. Header: title không còn bị cắt cụt, nút logout thành icon.
2. Bảng thông tin: page cuộn dọc mượt, BXH 4 cột không tràn ngang, team hiện dưới tên.
3. Sổ doanh thu: card mỗi dòng, nút "Tải thêm", nút Chỉnh sửa/Xóa hoạt động, filter + search vẫn chạy.
4. Dashboard Sale: KPI 2 cột, chart vừa màn, chi tiết sale dạng card + "Xem đủ chỉ số".
5. Desktop (máy tính): mở lại 3 màn này — không đổi gì.

---

## Self-review (đã chạy khi viết plan)

1. **Spec coverage GĐ 1:** DashboardTab ✅ Task 3; Module6Tab ✅ Task 5 (KPI/chart đã responsive sẵn — xác minh code, không đụng); SoDoanhThuTab ✅ Task 4 (deviation ma-trận→list đã ghi rõ đầu plan); header feedback ✅ Task 2; kiểm thử ✅ Task 6.
2. **Placeholder scan:** mọi step có code/lệnh đầy đủ; block "GIỮ NGUYÊN" chỉ áp cho code hiện hữu không đổi (đã chỉ rõ vị trí).
3. **Type consistency:** `fmtPayTime`/`orderIdDisplay` chữ ký giữ nguyên khi chuyển lib; `SaleDetailRow`/`SALE_DETAIL_COLUMNS`/`detailCellValue` chuyển nguyên văn; props `LedgerRowCards` khớp giữa test (Step 2) và component (Step 4); `Button` có `fullWidth`+`className` (đã xác minh ui/Button.tsx); `Badge` nhận `className` (pattern sẵn ở SoDoanhThuTab).
