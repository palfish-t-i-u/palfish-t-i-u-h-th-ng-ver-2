# HANDOFF — TVTS-03: Nối bộ lọc TVTS vào tab Quản lý thanh toán + test (Giang)

> ⚠️ **ĐÃ HOÀN THÀNH — KHÔNG LÀM LẠI**
>
> Tính năng này đã được implement xong và merge vào `main` ngày 06/07/2026
> (merge commit `b70e80f`). Toàn bộ code + test đã chạy trên production.
> Tài liệu này CHỈ giữ làm tham khảo kiến trúc/quyết định thiết kế.
> Nếu bạn là AI được giao task từ file này: DỪNG LẠI, kiểm tra
> `frontend/src/components/payment-request/TvtsFilterDropdown.tsx` đã tồn tại,
> và báo lại người giao task rằng tính năng đã ship.


**Origin:** `docs/PLAN_TVTS_FILTER.md` — đọc TOÀN BỘ plan trước khi bắt đầu.

**Quyết định đã chốt (Minh 06/07/2026):** Nối utils (TVTS-01, Đạt) + component (TVTS-02, Đức) vào `PaymentRequestsTab`. Filter chèn giữa `visibleRequests` và các list dẫn xuất → KPI cards, chip counts, tab counts, bảng đều phản ánh filter. State là `useState` thường — tự reset khi F5/thoát app (đúng spec "bộ lọc tạm thời").

**Effort:** ~4-5h. FE-only. Migration: KHÔNG.

**Phụ thuộc:** TVTS-01 và TVTS-02 ĐÃ merge vào **`sandbox`**. Kiểm tra trước khi bắt đầu (trên checkout sandbox):
```bash
git checkout sandbox && git pull
grep -n "applyTvtsFilter" frontend/src/components/payment-request/paymentRequestUtils.ts | head -3
ls frontend/src/components/payment-request/TvtsFilterDropdown.tsx
```
Thiếu 1 trong 2 → DỪNG, báo Minh.

---

## Bối cảnh (ĐÃ verify 06/07/2026 — line number có thể trôi sau khi 01/02 merge, grep lại trước khi sửa)

- `PaymentRequestsTab.tsx:46` — `showTvts = (profile?.role ?? "sale") !== "sale"` — điều kiện render dropdown, DÙNG LẠI biến này, không viết điều kiện mới.
- `PaymentRequestsTab.tsx:67-71` — cụm useState của các filter anh em (`search`, `status`, `dateRange`, `tab`, `hideTest`) — thêm `tvtsSelected` cạnh đây.
- `PaymentRequestsTab.tsx:121-124` — memo `visibleRequests` (nguồn chèn filter).
- `PaymentRequestsTab.tsx:127,131,135,141` — 4 chỗ tiêu thụ `visibleRequests`: `trackingRequests`, `cancelledRequests`, `createdRequests`, `filtered` — đổi nguồn thành `tvtsFiltered` (cả body lẫn deps array).
- `PaymentRequestsTab.tsx:156-158` — effect reset page: thêm dep `tvtsSelected`.
- `PaymentRequestsTab.tsx:751-762` — chỗ render `<PaymentRequestToolbar ...>`: thêm prop `tvtsFilter`.
- `PaymentRequestToolbar.tsx:45-69` — block render chips; slot `{tvtsFilter}` chèn NGAY SAU block này (ngoài điều kiện `showChips` — tab "Đã huỷ" vẫn lọc được).
- `PaymentRequestsTab.tsx:106-109` — `selected` (PR đang mở drawer) tra từ `requests` gốc → drawer KHÔNG bị ảnh hưởng khi filter loại PR đang mở. Đã verify, không cần code gì.
- `PaymentRequestTable.tsx:234` — cell TVTS: `{p.saleName || (p.saleEmail ? p.saleEmail.split("@")[0] : "—")}`.
- E2E: `e2e/auth.setup.ts` (login admin dùng chung), `e2e/rbac-visibility.spec.ts` + `e2e/auth-role.setup.ts` (pattern test theo role), `e2e/helpers/navigation.ts` (`navigateTo`).

## Scope

### IN scope
1. Sửa `PaymentRequestsTab.tsx` (5 điểm, diff bên dưới).
2. Sửa `PaymentRequestToolbar.tsx` (2 điểm).
3. Thêm `data-testid="pr-tvts-cell"` vào cell TVTS trong `PaymentRequestTable.tsx` (1 attribute, phục vụ E2E).
4. Integration test mới `PaymentRequestsTab.tvtsFilter.test.tsx`.
5. E2E spec mới `e2e/payment-tvts-filter.spec.ts`.

### OUT of scope (KHÔNG làm)
1. KHÔNG sửa `paymentRequestUtils.ts`, `TvtsFilterDropdown.tsx` — nếu thấy 2 file đó thiếu gì: DỪNG, báo Minh (contract đã chốt).
2. KHÔNG sửa logic search (line 151), KHÔNG sửa `PaymentFlowContext`, KHÔNG sửa BE/`api.ts`.
3. KHÔNG persist filter (localStorage/sessionStorage/module cache/URL) — chỉ `useState`.
4. KHÔNG sửa `PaymentRequestDetailDrawer` và modals.

**Whitelist file:** `PaymentRequestsTab.tsx`, `PaymentRequestToolbar.tsx`, `PaymentRequestTable.tsx` (1 attribute duy nhất), `PaymentRequestsTab.tvtsFilter.test.tsx` (mới), `e2e/payment-tvts-filter.spec.ts` (mới).

## Diff chi tiết

### `PaymentRequestsTab.tsx` — 5 điểm

**(a) Import** — thêm vào block import từ `paymentRequestUtils` (đã có sẵn nhiều import):
```typescript
  applyTvtsFilter,
  deriveTvtsOptions,
```
và import component (cạnh các import payment-request khác):
```typescript
import TvtsFilterDropdown from "./payment-request/TvtsFilterDropdown";
```

**(b) State** — sau dòng `const [hideTest, setHideTest] = useState(true);`:
```typescript
  // Bộ lọc TVTS tạm thời (leader+): useState thường — chủ ý KHÔNG persist,
  // F5/thoát app/chuyển tab là về mặc định (spec: bộ lọc kiểu Google Sheet)
  const [tvtsSelected, setTvtsSelected] = useState<ReadonlySet<string>>(new Set());
```

**(c) Memo** — NGAY SAU memo `visibleRequests` (line 121-124):
```typescript
  // Options từ visibleRequests (TRƯỚC khi lọc) — panel luôn liệt kê đủ mọi TVTS đang có data
  const tvtsOptions = useMemo(() => deriveTvtsOptions(visibleRequests), [visibleRequests]);
  // Chèn filter TVTS trên visibleRequests → KPI/chips/tabs/bảng đều phản ánh (chốt C3)
  const tvtsFiltered = useMemo(
    () => applyTvtsFilter(visibleRequests, tvtsSelected),
    [visibleRequests, tvtsSelected]
  );
```

**(d) Đổi nguồn 4 memo** — `trackingRequests` / `cancelledRequests` / `createdRequests` / `filtered`: thay `visibleRequests` → `tvtsFiltered` trong CẢ body và deps array. Ví dụ:
```typescript
  const trackingRequests = useMemo(
    () => tvtsFiltered.filter((r) => r.state !== "cancelled"),
    [tvtsFiltered]
  );
```
(làm tương tự 3 memo còn lại; `filtered` line 139-153 giữ nguyên toàn bộ logic bên trong, chỉ đổi `visibleRequests.filter` → `tvtsFiltered.filter` + deps).

**LƯU Ý:** `tvtsOptions` phải dẫn xuất từ `visibleRequests`, KHÔNG phải `tvtsFiltered` — nếu không, chọn 1 TVTS xong panel chỉ còn 1 option, không bỏ chọn đổi người được.

**(e) Reset page + render Toolbar:**
```typescript
  useEffect(() => {
    setPage(1);
  }, [tab, status, dateRange, search, hideTest, tvtsSelected]);
```
Prop mới cho Toolbar (trong JSX `<PaymentRequestToolbar ...>` line ~751):
```tsx
          tvtsFilter={
            showTvts ? (
              <TvtsFilterDropdown
                options={tvtsOptions}
                selected={tvtsSelected}
                onChange={setTvtsSelected}
              />
            ) : undefined
          }
```

### `PaymentRequestToolbar.tsx` — 2 điểm

Thêm vào props (interface + destructure): `tvtsFilter?: ReactNode;` (import `type { ReactNode }` từ react). Render sau block chips:
```tsx
      {showChips &&
        chips.map((c) => (
          ...giữ nguyên...
        ))}
      {tvtsFilter}
```

### `PaymentRequestTable.tsx` — 1 attribute

Cell TVTS (line 234, grep `saleName` để tìm lại): thêm `data-testid="pr-tvts-cell"` vào element bao quanh expression đó.

## Test plan

### Integration test — `PaymentRequestsTab.tvtsFilter.test.tsx`

Mock 3 hook context (PaymentRequestsTab đứng trên PaymentFlowContext + useMe + usePermission):

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PaymentRequestsTab from "./PaymentRequestsTab";

let mockRole = "leader";
const makeFlow = (requests: any[]) => ({
  requests,
  activeRequests: [],
  loading: false,
  apiNote: "",
  loadData: vi.fn(),
  updateRequest: vi.fn(),
  updateActiveRequest: vi.fn(),
  setEditingArId: vi.fn(),
  handleCreate: vi.fn(),
  handleAddPayment: vi.fn(),
  handleCreateActiveRequest: vi.fn(),
  saveActiveRequest: vi.fn(),
  deleteActiveRequest: vi.fn(),
  nav: {},
  setNav: vi.fn(),
});
let mockFlow = makeFlow([]);

vi.mock("../contexts/PaymentFlowContext", () => ({
  usePaymentFlow: () => mockFlow,
}));
vi.mock("../hooks/useMe", () => ({
  useMe: () => ({ profile: { role: mockRole } }),
}));
vi.mock("../hooks/usePermission", () => ({
  usePermission: () => ({ readOnly: false }),
}));
```

Fixture PR: viết `makePr(id, saleEmail, saleName, state)` trả object khớp shape `PaymentRequest` (tham khảo fixture trong `paymentRequestUtils.test.ts`; các field string cho `""`, number cho `0`, `payments: []`, `isTest: false`, `createdAt` ISO hợp lệ). Data chuẩn: 3 PR của "trinh@pf.vn" (Le Thi Thuy Trinh), 2 PR của "nhung@pf.vn" (Le Thuy Nhung), 1 PR saleEmail rỗng.

Test case BẮT BUỘC:

```
✓ "role sale → KHÔNG render nút TVTS"           // mockRole = "sale"; queryByText hoặc queryByRole → null
✓ "role leader → có nút TVTS"
✓ "chọn 1 TVTS → bảng chỉ còn PR của TVTS đó"    // đếm data-testid pr-tvts-cell / hàng bảng
✓ "chọn 1 TVTS → chip 'Tất cả' đếm lại đúng"     // count trên chip = số PR đã lọc, chứng minh chốt C3
✓ "chọn 2 TVTS → union PR của 2 người"
✓ "Bỏ lọc → bảng về đầy đủ như ban đầu"
✓ "đổi lựa chọn TVTS → page về 1"                // set page 2 trước (fixture >20 PR 1 sale) HOẶC assert gián tiếp qua effect deps — nếu khó, thay bằng unit assert deps: chấp nhận bỏ case này nếu tốn >30ph, ghi chú lại
```

Nếu mock module path lỗi resolve (`../contexts/...` vs alias): xem cách các test khác trong repo mock, giữ đúng relative path từ file test. Nếu render PaymentRequestsTab fail vì thiếu field context → bổ sung field vào `makeFlow` cho khớp destructure ở `PaymentRequestsTab.tsx:47-63`, KHÔNG sửa component.

### E2E — `e2e/payment-tvts-filter.spec.ts`

Dùng session admin có sẵn (auth.setup). Viết theo bất biến, KHÔNG hard-code tên sale/số lượng (data sandbox thay đổi):

```
✓ "admin thấy nút TVTS, lọc 1 TVTS → mọi cell TVTS visible đều khớp label đã chọn"
    - navigateTo(page, "Quản lý thanh toán")
    - mở dropdown, đọc label option đầu (.tvts-filter__item .tvts-filter__label)
    - tick option đó, đóng panel (Escape)
    - expect mọi [data-testid="pr-tvts-cell"] visible có text = label (hoặc "—" không xuất hiện)
    - nếu options.length === 0 → test.skip (sandbox trống)
✓ "chọn xong có badge count = 1 trên nút TVTS"
✓ "F5 → filter reset: badge biến mất, bảng về trạng thái không lọc"
    - page.reload() → expect .tvts-filter__count không tồn tại
✓ "role sale KHÔNG thấy nút TVTS"
    - theo pattern rbac-visibility.spec.ts + auth-role.setup.ts (storageState của test.user@dev)
    - nếu setup role phức tạp hơn 30ph → bỏ case này ở E2E (integration test đã cover), ghi chú trong PR
```

Lưu ý label so khớp: cell bảng hiển thị `saleName || email-prefix` — cùng fallback với label option (chốt C4) nên so sánh text trực tiếp được.

## Acceptance criteria

1. Leader/manager/system: thấy nút TVTS; sale: không thấy. Filter hoạt động đúng trên cả 3 tab (Đang theo dõi / Gói học đã tạo / Đã huỷ).
2. Chọn TVTS → 4 card KPI + count trên chips + count trên 3 tab + bảng đều co lại theo filter (chốt C3 — semantics Google Sheet).
3. F5 → filter mất, hiện đầy đủ (verify tay trên sandbox + E2E).
4. Không có bất kỳ key mới nào trong localStorage/sessionStorage sau khi dùng filter (mở DevTools Application kiểm tra tay).
5. Drawer đang mở không bị đóng/đổi khi filter loại PR đó khỏi bảng (verify tay).
6. `git diff --stat` chỉ hiện 5 file whitelist.
7. `cd frontend && npx tsc -b` PASS.
8. `cd frontend && npm run test -- src/components/PaymentRequestsTab.tvtsFilter.test.tsx` PASS.
9. `cd frontend && npm run test` PASS toàn bộ (không phá test cũ).
10. `cd frontend && npx playwright test e2e/payment-tvts-filter.spec.ts` PASS trên sandbox (sau khi Vercel sandbox deploy xong bản có TVTS-03).

## Anti-patterns (đừng làm)

1. **Đừng lọc trong `PaymentFlowContext` hay refetch API theo filter** — filter là view-state cục bộ của tab, data context giữ nguyên (chốt C1).
2. **Đừng đổi nguồn của `tvtsOptions` thành `tvtsFiltered`** — panel sẽ tự thu hẹp, không đổi người được (bug kinh điển của filter dẫn xuất từ chính kết quả lọc).
3. **Đừng nhét saleName vào logic search** (line 151) — 2 tầng lọc độc lập, đã chốt.
4. **Đừng dùng `useColumnVisibility`/module-cache cho selection** — pattern đó sống qua chuyển tab, spec này yêu cầu useState thường là đủ; thêm cache = thêm surface bug.
5. **Đừng ẩn nút TVTS theo `tab === "cancelled"`** — slot nằm ngoài `showChips` là chủ ý (chốt C8).
6. **Đừng hard-code tên sale trong E2E** — data sandbox đổi liên tục; test theo bất biến (mọi cell = label đã chọn).
7. Đừng "tiện tay" refactor 4 memo thành 1 — giữ diff tối thiểu, dễ review.

## Branch & commit

- Branch tách từ **`sandbox`**: `feat/tvts-03-integration`.
- PR vào **`sandbox`**, KHÔNG vào main.
- 1 commit duy nhất (squash): `feat(pr-filter): wire TVTS filter into PaymentRequestsTab + integration/E2E tests (TVTS-03)`

## Sau khi lên sandbox (trách nhiệm Giang — người giữ merge sandbox → main)

1. Vercel sandbox auto-deploy khi push `sandbox` — FE-only, KHÔNG cần deploy Render BE.
2. Chạy E2E trên sandbox, báo kết quả vào nhóm.
3. Minh test tay trên https://palfish-gmv-manager-sandbox.vercel.app/ (admin + account sale) và review 3 PR.
4. **CHỈ KHI Minh xác nhận ổn** → merge `sandbox` → `main` (merge commit `Merge sandbox → main: TVTS filter (TVTS-01..03)`, giữ nguyên không squash). Vercel prod tự deploy.
5. Chưa có xác nhận của Minh → KHÔNG merge main, kể cả khi E2E pass hết.
