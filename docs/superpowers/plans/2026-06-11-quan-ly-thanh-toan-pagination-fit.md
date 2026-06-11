# Quản lý thanh toán: Lọc data test nhất quán + Phân trang thật + Layout vừa khít viewport

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi con số trên màn Quản lý thanh toán (badge tab, chip, KPI, dòng tổng) tôn trọng checkbox "Ẩn data test" giống bảng; bảng phân trang thật 20 PR/trang với scrollbar dọc; toàn bộ màn vừa khít 1 viewport desktop, không cuộn trang.

**Architecture:** Lọc test một lần ở gốc (`visibleRequests`) rồi mọi danh sách dẫn xuất từ đó → con số tự khớp. Phân trang client-side bằng 2 helper thuần (`paginate`, `pageItems`) trong `paymentRequestUtils.ts` (test được bằng Vitest), state `page` nằm ở `PaymentRequestsTab`, bảng chỉ nhận props. Layout fit viewport bằng CSS scoped class `page--fit` (chỉ màn này): `.page` cao cố định `calc(100vh - 112px)`, table-card flex-fill, `.tbl-wrap` cuộn dọc, thead sticky.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react, CSS thuần trong `prototype-payments.css`.

**Bối cảnh lỗi (đã xác minh bằng DB production):** PR-2026-0017 "testxhd" (`is_test=true`) là PR duy nhất có Active Request → badge "Gói học đã tạo" đếm 1 (không lọc test) nhưng bảng lọc test → trống. Thanh phân trang `1 2 3` hiện tại là nút giả hard-code từ prototype ([PaymentRequestTable.tsx:288-298](../../../frontend/src/components/payment-request/PaymentRequestTable.tsx)).

**Quy ước commit (theo preference của anh Minh — gom commit):** chỉ 2 commit ở Task 2 và Task 6, KHÔNG commit từng step nhỏ.

**Hành vi thay đổi có chủ đích (đã chốt với user):**
- Tick "Ẩn data test": badge/chip/KPI/tổng đều loại PR test → "Gói học đã tạo" sẽ hiện **0** (khớp bảng trống), "Đang theo dõi" 5→4, "Đã thu"/"Còn thiếu" giảm phần tiền test.
- Bỏ tick: data test tính chung với data thật ở mọi nơi (như bảng hiện nay).

---

## File Structure

| File | Việc |
|---|---|
| `frontend/src/components/payment-request/paymentRequestUtils.ts` | Modify — thêm `visiblePaymentRequests`, `paginate`, `pageItems` |
| `frontend/src/components/payment-request/paymentRequestUtils.test.ts` | Modify — thêm test cho 3 helper |
| `frontend/src/components/PaymentRequestsTab.tsx` | Modify — derive từ `visibleRequests`, bỏ `bucketTotal`, thêm state `page`, class `page--fit` |
| `frontend/src/components/payment-request/PaymentRequestTable.tsx` | Modify — props phân trang mới, footer thật, bỏ `totalForBucket` |
| `frontend/src/components/payment-request/PaymentRequestTable.test.tsx` | Create — test footer + nút trang |
| `frontend/src/styles/prototype-payments.css` | Modify — block `page--fit` + style nút phân trang disabled |

---

### Task 1: Helper thuần — `visiblePaymentRequests`, `paginate`, `pageItems` (TDD)

**Files:**
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts`
- Test: `frontend/src/components/payment-request/paymentRequestUtils.test.ts`

- [ ] **Step 1: Viết test fail**

Thêm vào cuối `paymentRequestUtils.test.ts`. Bổ sung import (file đã import `PaymentRequest` type và nhiều hàm từ `./paymentRequestUtils` — thêm 3 tên mới vào import hiện có):

```ts
import {
  // ...các import sẵn có giữ nguyên...
  pageItems,
  paginate,
  visiblePaymentRequests,
} from "./paymentRequestUtils";
```

```ts
describe("visiblePaymentRequests", () => {
  const reqs = [
    { id: "PR-1", isTest: true } as PaymentRequest,
    { id: "PR-2" } as PaymentRequest,
    { id: "PR-3", isTest: false } as PaymentRequest,
  ];

  it("ẩn PR test khi hideTest bật", () => {
    expect(visiblePaymentRequests(reqs, true).map((r) => r.id)).toEqual(["PR-2", "PR-3"]);
  });

  it("giữ nguyên toàn bộ khi hideTest tắt", () => {
    expect(visiblePaymentRequests(reqs, false)).toEqual(reqs);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  it("cắt trang 1 đúng 20 phần tử", () => {
    const s = paginate(items, 1, 20);
    expect(s.rows).toHaveLength(20);
    expect(s.rows[0]).toBe(1);
    expect(s.totalPages).toBe(3);
    expect(s.page).toBe(1);
    expect(s.from).toBe(1);
    expect(s.to).toBe(20);
  });

  it("trang cuối lẻ phần tử", () => {
    const s = paginate(items, 3, 20);
    expect(s.rows).toEqual([41, 42, 43, 44, 45]);
    expect(s.from).toBe(41);
    expect(s.to).toBe(45);
  });

  it("clamp khi page vượt totalPages (vd sau khi đổi filter danh sách co lại)", () => {
    const s = paginate(items, 99, 20);
    expect(s.page).toBe(3);
    expect(s.rows[0]).toBe(41);
  });

  it("clamp khi page < 1", () => {
    expect(paginate(items, 0, 20).page).toBe(1);
  });

  it("danh sách rỗng: 1 trang rỗng, from/to = 0", () => {
    const s = paginate([], 1, 20);
    expect(s.rows).toEqual([]);
    expect(s.totalPages).toBe(1);
    expect(s.page).toBe(1);
    expect(s.from).toBe(0);
    expect(s.to).toBe(0);
  });
});

describe("pageItems", () => {
  it("ít trang: hiện hết", () => {
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("đầu dãy: 1 2 … cuối", () => {
    expect(pageItems(1, 10)).toEqual([1, 2, "...", 10]);
  });

  it("giữa dãy: 1 … quanh trang hiện tại … cuối", () => {
    expect(pageItems(5, 10)).toEqual([1, "...", 4, 5, 6, "...", 10]);
  });

  it("cuối dãy: 1 … 9 10", () => {
    expect(pageItems(10, 10)).toEqual([1, "...", 9, 10]);
  });
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: FAIL — `visiblePaymentRequests is not a function` (hoặc lỗi import tương đương).

- [ ] **Step 3: Implement 3 helper**

Thêm vào cuối `paymentRequestUtils.ts`:

```ts
// ───────── Ẩn data test + phân trang client-side ─────────

/** PR hiển thị theo checkbox "Ẩn data test" — dùng làm gốc cho MỌI con số trên màn (badge/chip/KPI/bảng). */
export function visiblePaymentRequests(
  requests: PaymentRequest[],
  hideTest: boolean
): PaymentRequest[] {
  return hideTest ? requests.filter((r) => !r.isTest) : requests;
}

export interface PageSlice<T> {
  rows: T[];
  /** Trang hợp lệ sau khi clamp vào [1..totalPages] */
  page: number;
  totalPages: number;
  /** Thứ tự 1-based của dòng đầu/cuối trang; 0 khi không có kết quả */
  from: number;
  to: number;
}

export function paginate<T>(items: T[], rawPage: number, pageSize: number): PageSlice<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(rawPage) || 1), totalPages);
  const start = (page - 1) * pageSize;
  const rows = items.slice(start, start + pageSize);
  return {
    rows,
    page,
    totalPages,
    from: items.length === 0 ? 0 : start + 1,
    to: start + rows.length,
  };
}

/** Dãy nút trang rút gọn: luôn có trang 1 + trang cuối + cửa sổ quanh trang hiện tại, "..." cho khoảng trống. */
export function pageItems(page: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const out: Array<number | "..."> = [];
  for (let i = 0; i < wanted.length; i++) {
    if (i > 0 && wanted[i] - wanted[i - 1] > 1) out.push("...");
    out.push(wanted[i]);
  }
  return out;
}
```

Lưu ý: `paymentRequestUtils.ts` đã import type `PaymentRequest` sẵn — không cần thêm import.

- [ ] **Step 4: Chạy test xác nhận pass**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.test.ts`
Expected: PASS toàn bộ (test cũ + 12 test mới).

---

### Task 2: Lọc data test nhất quán ở `PaymentRequestsTab` + commit fix

**Files:**
- Modify: `frontend/src/components/PaymentRequestsTab.tsx:114-148` (các memo danh sách)

- [ ] **Step 1: Derive mọi danh sách từ `visibleRequests`**

Thêm `visiblePaymentRequests` vào import sẵn có từ `./payment-request/paymentRequestUtils` (khối import dòng 26-37).

Thay block dòng 114-148 (từ `const trackingRequests` đến hết memo `filtered`) bằng:

```tsx
  const visibleRequests = useMemo(
    () => visiblePaymentRequests(requests, hideTest),
    [requests, hideTest]
  );

  const trackingRequests = useMemo(
    () => visibleRequests.filter((r) => r.state !== "cancelled"),
    [visibleRequests]
  );
  const cancelledRequests = useMemo(
    () => visibleRequests.filter((r) => r.state === "cancelled"),
    [visibleRequests]
  );
  const createdRequests = useMemo(
    () => visibleRequests.filter((r) => r.state !== "cancelled" && arByPrId[r.id]),
    [visibleRequests, arByPrId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleRequests.filter((r) => {
      if (tab === "cancelled") {
        if (r.state !== "cancelled") return false;
      } else {
        if (r.state === "cancelled") return false;
        if (tab === "created" && !arByPrId[r.id]) return false;
      }
      if (tab !== "cancelled" && status !== "all" && r.state !== status) return false;
      if (!inDateRange(r.createdAt, dateRange)) return false;
      if (!q) return true;
      return [r.id, r.name, r.uid, r.phone].some((v) => v.toLowerCase().includes(q));
    });
  }, [visibleRequests, tab, status, dateRange, search, arByPrId]);
```

Điểm khác so với cũ: (1) gốc là `visibleRequests` thay vì `requests`; (2) dòng `if (hideTest && r.isTest) return false;` bị xoá khỏi `filtered` (đã lọc ở gốc); (3) memo `bucketTotal` (dòng 127-131 cũ) **giữ nguyên ở task này**, sẽ xoá ở Task 4 khi bảng đổi props.

KPI cards (`<PaymentRequestKpiCards requests={trackingRequests} />`), `chips`, `tabs` không cần sửa — tự khớp vì nguồn đã lọc.

- [ ] **Step 2: Type check + test**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: tsc 0 lỗi, toàn bộ unit test PASS.

- [ ] **Step 3: Commit fix lọc test**

```bash
git add frontend/src/components/PaymentRequestsTab.tsx frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts
git commit -m "fix: badge/chip/KPI màn Quản lý thanh toán tôn trọng checkbox Ẩn data test

Badge 'Gói học đã tạo' đếm cả PR test trong khi bảng lọc test
→ báo 1 nhưng bảng trống. Lọc test một lần ở gốc (visibleRequests),
mọi con số dẫn xuất từ đó nên luôn khớp với bảng."
```

---

### Task 3: `PaymentRequestTable` — footer + nút phân trang thật (TDD)

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestTable.tsx`
- Create: `frontend/src/components/payment-request/PaymentRequestTable.test.tsx`

- [ ] **Step 1: Viết component test fail**

Tạo `PaymentRequestTable.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PaymentRequest } from "../../types/paymentRequest";
import PaymentRequestTable from "./PaymentRequestTable";

function makePr(i: number): PaymentRequest {
  return {
    id: `PR-2026-${String(i).padStart(4, "0")}`,
    name: `Khách ${i}`,
    uid: `10000${i}`,
    phone: "0912345678",
    country: "VN",
    address: "1 Phố Huế",
    ward: "Hai Bà Trưng",
    province: "Hà Nội",
    target: 1_000_000,
    source: "manual",
    createdAt: "2026-06-10T08:30:00+07:00",
    received: 0,
    doneCount: 0,
    totalCount: 1,
    delta: -1_000_000,
    state: "pending",
    payments: [],
  };
}

const tabs = [
  { key: "tracking" as const, label: "Đang theo dõi", icon: "Wallet" as const, count: 45 },
  { key: "created" as const, label: "Gói học đã tạo", icon: "Sparkle" as const, count: 0 },
  { key: "cancelled" as const, label: "Đã huỷ", icon: "XCircle" as const, count: 0 },
];

function renderTable(over: Partial<Parameters<typeof PaymentRequestTable>[0]> = {}) {
  const onPageChange = vi.fn();
  render(
    <PaymentRequestTable
      requests={Array.from({ length: 5 }, (_, i) => makePr(41 + i))}
      total={45}
      page={3}
      totalPages={3}
      pageSize={20}
      selectedId={null}
      tab="tracking"
      onTabChange={() => {}}
      tabs={tabs}
      onSelect={() => {}}
      onCancelClick={() => {}}
      onRestoreClick={() => {}}
      arByPrId={{}}
      onPageChange={onPageChange}
      {...over}
    />
  );
  return { onPageChange };
}

describe("PaymentRequestTable pagination", () => {
  it("footer hiển thị dải dòng thật theo trang", () => {
    renderTable();
    expect(screen.getByText("Hiển thị 41–45 trong 45 kết quả")).toBeInTheDocument();
  });

  it("đếm tổng kết quả sau lọc ở góc phải đầu bảng", () => {
    renderTable();
    expect(screen.getByText("45 kết quả")).toBeInTheDocument();
  });

  it("bấm số trang gọi onPageChange", () => {
    const { onPageChange } = renderTable();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("nút trang hiện tại có class active", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "3" }).className).toContain("active");
  });

  it("trang cuối: nút sau disabled, nút trước lùi 1 trang", () => {
    const { onPageChange } = renderTable();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("trang 1: nút trước disabled", () => {
    renderTable({ requests: Array.from({ length: 20 }, (_, i) => makePr(i + 1)), page: 1 });
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
  });

  it("không có kết quả: footer gọn + empty state", () => {
    renderTable({ requests: [], total: 0, page: 1, totalPages: 1 });
    expect(screen.getByText("Không có kết quả")).toBeInTheDocument();
    expect(
      screen.getByText("Không có Payment Request nào khớp với điều kiện lọc.")
    ).toBeInTheDocument();
  });
});
```

Lưu ý ký tự: footer dùng **en dash `–`** (U+2013) giống code hiện tại, không phải hyphen.

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `cd frontend && npx vitest run src/components/payment-request/PaymentRequestTable.test.tsx`
Expected: FAIL — TS/props không khớp (`total`/`onPageChange` chưa tồn tại), hoặc không tìm thấy text "Hiển thị 41–45...".

- [ ] **Step 3: Sửa props + footer của PaymentRequestTable**

3a. Thêm `pageItems` vào import từ `./paymentRequestUtils` (khối import dòng 6-14 đã có sẵn các hàm khác).

3b. Đổi signature props (dòng 47-68): xoá `totalForBucket`, thêm 5 props mới:

```tsx
export default function PaymentRequestTable({
  requests,
  total,
  page,
  totalPages,
  pageSize,
  onPageChange,
  selectedId,
  tab,
  onTabChange,
  tabs,
  onSelect,
  onCancelClick,
  onRestoreClick,
  arByPrId,
}: {
  requests: PaymentRequest[];
  /** Tổng kết quả sau lọc (mọi trang) */
  total: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  selectedId: string | null;
  tab: RequestBucket;
  onTabChange: (next: RequestBucket) => void;
  tabs: TabConfig[];
  onSelect: (request: PaymentRequest) => void;
  onCancelClick: (request: PaymentRequest) => void;
  onRestoreClick: (request: PaymentRequest) => void;
  arByPrId: Record<string, ActiveRequest>;
}) {
```

3c. Sửa đếm góc phải đầu bảng (dòng 125): `{requests.length} kết quả` → `{total} kết quả`.

3d. Thay toàn bộ block `.pagi` (dòng 284-299 — nút giả hard-code) bằng:

```tsx
      <div className="pagi">
        <span>
          {total === 0
            ? "Không có kết quả"
            : `Hiển thị ${(page - 1) * pageSize + 1}–${(page - 1) * pageSize + requests.length} trong ${total} kết quả`}
        </span>
        <div className="pagi-btns">
          <button
            className="pagi-btn"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Trang trước"
          >
            <Icons.ChevronLeft size={13} />
          </button>
          {pageItems(page, totalPages).map((it, i) =>
            it === "..." ? (
              <span key={`gap-${i}`} className="pagi-gap">
                …
              </span>
            ) : (
              <button
                key={it}
                className={`pagi-btn ${it === page ? "active" : ""}`}
                onClick={() => onPageChange(it)}
              >
                {it}
              </button>
            )
          )}
          <button
            className="pagi-btn"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Trang sau"
          >
            <Icons.ChevronRight size={13} />
          </button>
        </div>
      </div>
```

- [ ] **Step 4: Chạy test — component test pass, nhưng tsc sẽ báo lỗi ở PaymentRequestsTab (chưa truyền props mới)**

Run: `cd frontend && npx vitest run src/components/payment-request/PaymentRequestTable.test.tsx`
Expected: PASS cả 7 test.

Run: `cd frontend && npx tsc -b`
Expected: FAIL tại `PaymentRequestsTab.tsx` (thiếu props `total/page/...`, thừa `totalForBucket`) — đúng dự kiến, Task 4 sửa. KHÔNG commit ở task này.

---

### Task 4: Nối phân trang vào `PaymentRequestsTab`

**Files:**
- Modify: `frontend/src/components/PaymentRequestsTab.tsx`

- [ ] **Step 1: State page + slice**

1a. Thêm `paginate` vào import từ `./payment-request/paymentRequestUtils`.

1b. Thêm hằng số ngay trên `export default function PaymentRequestsTab()`:

```tsx
const PAGE_SIZE = 20;
```

1c. Thêm state cạnh `const [hideTest, setHideTest] = useState(true);`:

```tsx
const [page, setPage] = useState(1);
```

1d. **Xoá** memo `bucketTotal` (dòng 127-131 cũ). Ngay sau memo `filtered` thêm:

```tsx
  // Đổi tab/filter → về trang 1; danh sách co lại thì paginate tự clamp
  useEffect(() => {
    setPage(1);
  }, [tab, status, dateRange, search, hideTest]);

  const pageSlice = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);
```

1e. Sửa chỗ render `<PaymentRequestTable ...>` (quanh dòng 700):

```tsx
        <PaymentRequestTable
          requests={pageSlice.rows}
          total={filtered.length}
          page={pageSlice.page}
          totalPages={pageSlice.totalPages}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          selectedId={drawerOpen ? selected?.id ?? null : null}
          tab={tab}
          onTabChange={setTab}
          tabs={tabs}
          onSelect={handleSelect}
          onCancelClick={setCancelTarget}
          onRestoreClick={handleRestore}
          arByPrId={arByPrId}
        />
```

- [ ] **Step 2: Type check + toàn bộ unit test**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: tsc 0 lỗi, toàn bộ test PASS.

---

### Task 5: Layout vừa khít viewport + scrollbar dọc trong bảng

**Files:**
- Modify: `frontend/src/components/PaymentRequestsTab.tsx:657` (thêm class)
- Modify: `frontend/src/styles/prototype-payments.css`

Bối cảnh đo đạc: AppShell header `h-16` = 64px, `<main>` padding `md:p-6` = 24px×2 → chiếm 112px. `.gmv-prototype .page` hiện `padding: 4px 0 60px` (60px dưới gây thừa chiều cao). Các màn khác (Đối soát, Kích hoạt, Xuất hóa đơn) cũng dùng `.gmv-prototype .page` → PHẢI scope bằng class riêng `page--fit`, không sửa `.page` chung.

- [ ] **Step 1: Gắn class fit cho riêng màn này**

Trong `PaymentRequestsTab.tsx` dòng 657: `<div className="page">` → `<div className="page page--fit">`.

- [ ] **Step 2: CSS**

Thêm vào cuối `prototype-payments.css`:

```css
/* ───────── Quản lý thanh toán: vừa khít viewport, bảng cuộn trong ─────────
   Chỉ áp cho .page--fit (PaymentRequestsTab). Desktop ≥768px;
   mobile giữ cuộn trang tự nhiên (đã có bottom-nav 72px). */
@media (min-width: 768px) {
  .gmv-prototype .page.page--fit {
    /* 100vh − 64px header − 24px×2 padding <main> */
    height: calc(100vh - 112px);
    padding-bottom: 0;
    overflow: hidden;
  }
  .gmv-prototype .page.page--fit .table-card.has-tabs {
    flex: 1;
    min-height: 240px; /* màn quá thấp: bảng không bẹp, chấp nhận cuộn trang nhẹ */
    display: flex;
    flex-direction: column;
  }
  .gmv-prototype .page.page--fit .tbl-wrap {
    flex: 1;
    overflow-y: auto; /* scrollbar dọc của bảng */
  }
  .gmv-prototype .page.page--fit .tbl thead th {
    position: sticky; /* header bảng đứng yên khi cuộn dòng */
    top: 0;
    z-index: 2;
  }
}

.gmv-prototype .pagi-btn:disabled { opacity: 0.45; cursor: default; }
.gmv-prototype .pagi-btn:disabled:hover { border-color: var(--border); }
.gmv-prototype .pagi-gap { color: var(--text-3); font-size: 12px; padding: 0 2px; align-self: center; }
```

Ghi chú kỹ thuật:
- `.tbl th` đã có `background: var(--surface-2)` và bảng dùng `border-collapse: separate` → sticky header không bị "thủng" nền, border đi theo cell.
- `.tbl-wrap` sẵn `overflow-x: auto` → giữ cuộn ngang khi cửa sổ hẹp, thêm trục dọc.
- Banner sandbox (môi trường sandbox) cao ~24px sẽ làm lệch calc → chấp nhận cuộn nhẹ chỉ ở sandbox.
- Khu vực ngoài bảng (intro, KPI, toolbar, nút "Tải lại dữ liệu") giữ kích thước tự nhiên; bảng ăn toàn bộ phần còn lại — đạt "bảng to lên một chút, cả màn vừa khít".

- [ ] **Step 3: Type check + test lần cuối**

Run: `cd frontend && npx tsc -b && npx vitest run`
Expected: 0 lỗi, toàn bộ PASS.

---

### Task 6: Xác minh trực quan + commit

**Files:** không sửa code (chỉ verify), commit Task 3+4+5.

- [ ] **Step 1: Chạy dev server và kiểm tra bằng preview tools**

Run: `cd frontend && npm run dev` (hoặc preview_start), mở màn Quản lý thanh toán, đăng nhập test.admin@dev.

Checklist xác minh (so với lỗi gốc):
1. Tick "Ẩn data test": tab "Gói học đã tạo" badge = **0**, bảng trống — số khớp bảng. "Đang theo dõi" = 4, chip "Tất cả 4", KPI không còn tiền test.
2. Bỏ tick: "Gói học đã tạo" = 1 và bảng hiện PR-2026-0017 kèm nhãn TEST vàng; "Đang theo dõi" = 5.
3. Footer: "Hiển thị 1–4 trong 4 kết quả" (tick) / "Hiển thị 1–5 trong 5 kết quả" (bỏ tick) — không còn "1–0 trong 1", không còn nút trang 2/3 giả (chỉ còn nút `1` active khi 1 trang).
4. Không có thanh cuộn dọc của TRANG ở 1366×768 và 1920×1080 (preview_resize); toàn bộ màn (kể cả nút "Tải lại dữ liệu") nằm gọn 1 viewport.
5. Thu thấp cửa sổ (vd 1366×620): chỉ vùng bảng có scrollbar dọc, header bảng sticky khi cuộn dòng.
6. preview_console_logs: không có error mới.
7. Chụp preview_screenshot làm bằng chứng.

(Dữ liệu thật hiện chỉ ~6 PR < 20 → chưa thấy nhiều trang trên UI; logic nhiều trang đã được khoá bằng unit test Task 1 & 3.)

- [ ] **Step 2: Commit phần phân trang + layout**

```bash
git add frontend/src/components/payment-request/PaymentRequestTable.tsx frontend/src/components/payment-request/PaymentRequestTable.test.tsx frontend/src/components/PaymentRequestsTab.tsx frontend/src/styles/prototype-payments.css frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.test.ts
git commit -m "feat: phân trang thật 20 PR/trang + màn Quản lý thanh toán vừa khít viewport

- Thay nút trang giả từ prototype bằng phân trang thật (paginate/pageItems,
  reset về trang 1 khi đổi tab/filter, clamp khi danh sách co lại)
- Footer hiển thị dải dòng thật thay vì 'Hiển thị 1–0 trong 1 kết quả'
- Bảng cuộn dọc nội bộ, thead sticky; .page--fit cao calc(100vh−112px)
  → cả màn không phải cuộn trang (scope riêng, không ảnh hưởng màn khác)"
```

---

## Self-review (đã chạy)

- **Spec coverage:** (a) lọc test nhất quán → Task 1+2; (b) 20 PR/trang → `PAGE_SIZE=20` Task 4; scrollbar dọc trong bảng → Task 5 `.tbl-wrap`; cả màn vừa khít 1 trang → Task 5 `page--fit`; bảng "to lên 1 tí" → flex-fill phần còn lại của viewport. ✓
- **Placeholder scan:** không còn TBD/TODO; mọi step có code/command đầy đủ. ✓
- **Type consistency:** `PageSlice{rows,page,totalPages,from,to}` (Task 1) khớp cách dùng `pageSlice.rows/.page/.totalPages` (Task 4); props bảng `total/page/totalPages/pageSize/onPageChange` (Task 3) khớp render (Task 4) và test fixture; `pageItems` trả `Array<number | "...">` khớp render map. ✓
- **Rủi ro đã xử lý:** các màn khác dùng chung `.gmv-prototype .page` → scope `page--fit`; page kẹt trang cao khi filter đổi → reset effect + clamp trong `paginate`; right-meta trước đây đếm theo trang → đổi sang `total`.
