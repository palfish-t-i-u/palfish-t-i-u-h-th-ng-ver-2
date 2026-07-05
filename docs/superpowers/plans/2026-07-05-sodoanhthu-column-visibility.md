# Sổ doanh thu — Custom view cột (ẩn/hiện cột tạm thời) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép user trong tab Sổ doanh thu ẩn bớt cột không cần xem (custom view). Setting tạm thời: giữ khi chuyển tab trong app, mất khi F5/đóng tab. 100% frontend — zero backend/DB/API change.

**Architecture:** (1) Hook `useColumnVisibility` với cache in-memory module-level (sống qua unmount, chết khi F5). (2) Component `ColumnVisibilityMenu` — nút + popover checkbox, không dependency mới. (3) Refactor bảng SoDoanhThuTab sang column-config array: header + body render từ CÙNG một list → không bao giờ lệch cột; `colSpan` dynamic.

**Tech Stack:** React 19 + TypeScript + Tailwind (gmv-* tokens) + Vitest + @testing-library/react + MSW.

**Quyết định đã chốt (Minh 05/07):** In-memory only — KHÔNG sessionStorage / localStorage / DB. Không đổi thứ tự cột, không drag-drop (YAGNI). Không cần RBAC mới (tùy chỉnh hiển thị client-side, dữ liệu vốn đã nằm trong API response).

**Estimated effort:** ~6.5h tổng. FE-only. Migration: KHÔNG.

---

## Bối cảnh (ĐÃ verify 05/07 — grep trực tiếp source)

| Fact | Vị trí |
|---|---|
| Header 12 cột hardcode | `frontend/src/components/SoDoanhThuTab.tsx:551-564` |
| `colSpan={12}` hardcode 2 chỗ | `SoDoanhThuTab.tsx:569` (empty state) + `:644` (load more) |
| Body cells hardcode | `SoDoanhThuTab.tsx:576-641` |
| **Bug tiềm ẩn sẵn có**: cột "Thao tác" — body Td chỉ render khi `!readOnly` (`:620`) nhưng header Th luôn render (`:563`) → user readOnly thấy 12 header / 11 cell, bảng lệch 1 cột | `SoDoanhThuTab.tsx:563,620` |
| `readOnly` từ `usePermission("revenueLedger")` | `SoDoanhThuTab.tsx:121`; `usePermission.ts`: `readOnly = loading \|\| level === "read"`; `AccessLevel = "full" \| "read" \| "none"` (`types/permissions.ts:14`) |
| Hàng nút filter (chỗ đặt menu) | `SoDoanhThuTab.tsx:446-472` (Làm mới / Hôm nay / Reset bộ lọc / Sync Data / Cấu hình tỷ giá / + Thêm dòng) |
| Dòng đếm "Hiển thị x / y dòng" | `SoDoanhThuTab.tsx:539-546` |
| Helpers module-level đã có: `fmtPayTime` (`:75`), `orderIdDisplay` (`:106`), `rowToForm` (`:82`) | `SoDoanhThuTab.tsx` |
| Cell style helpers | `frontend/src/lib/ledgerCellStyle.ts`: `ledgerPillBase`, `paymentMethodCellClass`, `typeCellClass`, `typeDisplayLabel` |
| Row type | `RevenueLedgerRow` từ `frontend/src/types/revenue.ts`; `LedgerSummaryResponse = { totalGmvVnd, orderCount, bySource[] }` (`:85-89`) |
| API bảng gọi | `GET /revenue/ledger` + `GET /revenue/ledger/summary` (`frontend/src/lib/api.ts:314-316`) |
| `Button` ui primitive spread `...rest` (aria-* OK), variants `primary/secondary/ghost/danger/ok` | `frontend/src/components/ui/Button.tsx` |
| Tailwind có màu `gmv-primary`, `gmv-bg`, `gmv-primary-soft`… (CSS vars registered) | `frontend/tailwind.config.js` |
| `useMe` THROW nếu thiếu `MeProvider` → test phải `vi.mock("../hooks/useMe")` (pattern có sẵn ở `StaffCRMTab.test.tsx:15`) | `frontend/src/hooks/useMe.tsx:104` |
| Realtime: test mock `vi.mock("../lib/supabase")` với `channel/removeChannel` (pattern `DoanhThuSaleTab.test.tsx:8-14`) | — |
| E2E hiện có KHÔNG cover Sổ doanh thu (chỉ crm-sync + dashboard-sales) → không cần sửa e2e | `frontend/e2e/` |

## Scope

### IN scope
1. Hook `useColumnVisibility` (file mới) + unit tests.
2. Component `ColumnVisibilityMenu` (file mới) + component tests.
3. Refactor `SoDoanhThuTab.tsx` sang column-config, wire hook + menu, colSpan dynamic, fix bug lệch cột readOnly + tests.

### OUT of scope (KHÔNG làm)
1. Không áp dụng cho bảng khác (PR, Đối soát…) đợt này — mechanism dùng lại được, làm sau khi cần.
2. Không lưu preference vào DB / backend.
3. Không drag-drop đổi thứ tự cột, không resize cột.
4. Không sửa `ui/Table.tsx` (primitive dùng chung — blast radius lớn).
5. Không đổi API params/response.

## Guardrails (bắt buộc — mỗi cái có test tương ứng)

| # | Guardrail | Cơ chế |
|---|---|---|
| G1 | Không bao giờ lệch header/body | Header + body cùng map từ `visibleColumns` — lệch là bất khả thi by construction |
| G2 | Không ẩn được cột cuối cùng | Hook `toggle()` no-op khi chỉ còn 1 cột visible |
| G3 | Cột "User Name" không ẩn được | `hideable: false` → checkbox disabled |
| G4 | `colSpan` luôn đúng | `colSpan={visibleColumns.length}` ở cả 2 chỗ (empty + load-more) |
| G5 | Key rác trong cache không làm crash | Init hook prune key không còn trong `allKeys` |
| G6 | readOnly không thấy cột Thao tác ở CẢ header lẫn body | Filter cột `actions` khỏi `baseColumns` trước khi vào hook/menu |
| G7 | Lifecycle đúng "tạm thời" | Cache module-level (KHÔNG sessionStorage — sống qua F5 là sai spec) |
| G8 | Không degrade perf | Ẩn cột = BỚT DOM node (60 rows × N cột); state chỉ đổi khi click |

---

## Phân công team

| Ai | Task | Files | Est | Branch |
|---|---|---|---|---|
| **Đạt** | Task 1: hook + tests | `hooks/useColumnVisibility.ts` (mới), `hooks/useColumnVisibility.test.ts` (mới) | 1.5h | `feat/colvis-hook` |
| **Đức** | Task 2: menu component + tests | `components/ui/ColumnVisibilityMenu.tsx` (mới), `components/ui/ColumnVisibilityMenu.test.tsx` (mới) | 2h | `feat/colvis-menu` |
| **Giang** | Task 3: refactor SoDoanhThuTab + integrate + tests | `components/SoDoanhThuTab.tsx` (sửa), `components/SoDoanhThuTab.columns.test.tsx` (mới) | 3h | `feat/colvis-sodoanhthu` |

**Sequencing:**
- Task 1 + Task 2 chạy **song song ngay** — interface contract chốt sẵn bên dưới, hai bên code theo contract, không chờ nhau.
- Task 3 bước 1-5 (refactor column config, behavior-preserving) chạy song song luôn. Bước 6+ (wire hook + menu) chờ Task 1 + 2 merge.
- File disjoint 100% → không conflict. Merge order: Đạt → Đức → Giang.
- Mỗi người **squash thành 1 commit** trước khi merge (convention team). FE-only → merge vào `sandbox` branch, verify trên Vercel sandbox (https://palfish-gmv-manager-sandbox.vercel.app/), rồi merge `main`. KHÔNG cần deploy Render.

### Interface contract (CHỐT — hai bên code đúng theo đây, đổi phải báo Minh)

```typescript
// hooks/useColumnVisibility.ts — Đạt implement, Giang consume
export interface ColumnVisibilityApi {
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  showAll: () => void;
  hiddenCount: number;
  visibleCount: number;
}
export function useColumnVisibility(
  tableId: string,
  allKeys: readonly string[]
): ColumnVisibilityApi;
export function __resetColumnVisibilityCache(): void; // test-only

// components/ui/ColumnVisibilityMenu.tsx — Đức implement, Giang consume
export interface ColumnOption {
  key: string;
  label: string;
  hideable: boolean;
}
interface Props {
  columns: readonly ColumnOption[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  visibleCount: number;
}
export default function ColumnVisibilityMenu(props: Props): JSX.Element;
```

---

## Task 1 (Đạt): Hook `useColumnVisibility`

**Files:**
- Create: `frontend/src/hooks/useColumnVisibility.ts`
- Test: `frontend/src/hooks/useColumnVisibility.test.ts`

- [ ] **Step 1: Viết failing tests**

```typescript
// frontend/src/hooks/useColumnVisibility.test.ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetColumnVisibilityCache,
  useColumnVisibility,
} from "./useColumnVisibility";

const KEYS = ["a", "b", "c"] as const;

describe("useColumnVisibility", () => {
  beforeEach(() => {
    __resetColumnVisibilityCache();
  });

  it("mặc định tất cả cột visible", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    expect(result.current.isVisible("a")).toBe(true);
    expect(result.current.visibleCount).toBe(3);
    expect(result.current.hiddenCount).toBe(0);
  });

  it("toggle ẩn rồi hiện lại cột", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("b"));
    expect(result.current.isVisible("b")).toBe(false);
    expect(result.current.visibleCount).toBe(2);
    act(() => result.current.toggle("b"));
    expect(result.current.isVisible("b")).toBe(true);
    expect(result.current.visibleCount).toBe(3);
  });

  it("guard: không ẩn được cột cuối cùng", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.toggle("c")); // phải no-op
    expect(result.current.isVisible("c")).toBe(true);
    expect(result.current.visibleCount).toBe(1);
  });

  it("giữ state qua unmount + remount (chuyển tab trong app)", () => {
    const first = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => first.result.current.toggle("b"));
    first.unmount();
    const second = renderHook(() => useColumnVisibility("t1", KEYS));
    expect(second.result.current.isVisible("b")).toBe(false);
  });

  it("showAll reset về full", () => {
    const { result } = renderHook(() => useColumnVisibility("t1", KEYS));
    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    act(() => result.current.showAll());
    expect(result.current.visibleCount).toBe(3);
  });

  it("hai tableId độc lập nhau", () => {
    const t1 = renderHook(() => useColumnVisibility("t1", KEYS));
    const t2 = renderHook(() => useColumnVisibility("t2", KEYS));
    act(() => t1.result.current.toggle("a"));
    expect(t2.result.current.isVisible("a")).toBe(true);
  });

  it("prune key rác không còn trong allKeys khi init", () => {
    const first = renderHook(() => useColumnVisibility("t1", ["a", "b", "c", "old"]));
    act(() => first.result.current.toggle("old"));
    first.unmount();
    const second = renderHook(() => useColumnVisibility("t1", KEYS)); // "old" biến mất
    expect(second.result.current.hiddenCount).toBe(0);
    expect(second.result.current.visibleCount).toBe(3);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd frontend && npx vitest run src/hooks/useColumnVisibility.test.ts`
Expected: FAIL — `Cannot find module './useColumnVisibility'`

- [ ] **Step 3: Implement hook**

```typescript
// frontend/src/hooks/useColumnVisibility.ts
import { useCallback, useState } from "react";

// Cache module-level: sống khi component unmount (chuyển tab trong app),
// mất khi F5/đóng tab — đúng lifecycle "custom view tạm thời".
// CHỦ Ý không dùng sessionStorage: sessionStorage sống qua F5 (sai spec)
// và tạo rủi ro stale key giữa các lần deploy đổi cột.
const sessionCache = new Map<string, ReadonlySet<string>>();

/** Chỉ dùng trong test — reset cache giữa các test case. */
export function __resetColumnVisibilityCache(): void {
  sessionCache.clear();
}

export interface ColumnVisibilityApi {
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  showAll: () => void;
  hiddenCount: number;
  visibleCount: number;
}

export function useColumnVisibility(
  tableId: string,
  allKeys: readonly string[]
): ColumnVisibilityApi {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => {
    const cached = sessionCache.get(tableId);
    if (!cached) return new Set();
    return new Set([...cached].filter((k) => allKeys.includes(k)));
  });

  const totalCount = allKeys.length;

  const toggle = useCallback(
    (key: string) => {
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          if (totalCount - next.size <= 1) return prev;
          next.add(key);
        }
        sessionCache.set(tableId, next);
        return next;
      });
    },
    [tableId, totalCount]
  );

  const showAll = useCallback(() => {
    const next = new Set<string>();
    sessionCache.set(tableId, next);
    setHidden(next);
  }, [tableId]);

  const isVisible = useCallback((key: string) => !hidden.has(key), [hidden]);

  const hiddenCount = allKeys.filter((k) => hidden.has(k)).length;

  return {
    isVisible,
    toggle,
    showAll,
    hiddenCount,
    visibleCount: totalCount - hiddenCount,
  };
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd frontend && npx vitest run src/hooks/useColumnVisibility.test.ts`
Expected: 7 passed

- [ ] **Step 5: Type check + commit**

```bash
cd frontend && npx tsc -b
git checkout -b feat/colvis-hook
git add frontend/src/hooks/useColumnVisibility.ts frontend/src/hooks/useColumnVisibility.test.ts
git commit -m "feat(sodoanhthu): add useColumnVisibility hook (in-memory session cache)"
```

---

## Task 2 (Đức): Component `ColumnVisibilityMenu`

**Files:**
- Create: `frontend/src/components/ui/ColumnVisibilityMenu.tsx`
- Test: `frontend/src/components/ui/ColumnVisibilityMenu.test.tsx`

KHÔNG sửa `ui/index.ts` barrel (SoDoanhThuTab import trực tiếp `./ui/Button` — theo cùng style, import trực tiếp).

- [ ] **Step 1: Viết failing tests**

```tsx
// frontend/src/components/ui/ColumnVisibilityMenu.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ColumnVisibilityMenu, { type ColumnOption } from "./ColumnVisibilityMenu";

const COLUMNS: ColumnOption[] = [
  { key: "userName", label: "User Name", hideable: false },
  { key: "phone", label: "Phone", hideable: true },
  { key: "uid", label: "UID", hideable: true },
];

function setup(overrides?: { isVisible?: (k: string) => boolean; visibleCount?: number }) {
  const onToggle = vi.fn();
  const onShowAll = vi.fn();
  render(
    <ColumnVisibilityMenu
      columns={COLUMNS}
      isVisible={overrides?.isVisible ?? (() => true)}
      onToggle={onToggle}
      onShowAll={onShowAll}
      visibleCount={overrides?.visibleCount ?? 3}
    />
  );
  return { onToggle, onShowAll };
}

describe("ColumnVisibilityMenu", () => {
  it("hiện badge đếm cột visible/total", () => {
    setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("mặc định panel đóng; click nút thì mở với checkbox đúng trạng thái", () => {
    setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByText("Chọn cột hiển thị")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeChecked();
    expect(screen.getByLabelText("UID")).not.toBeChecked();
  });

  it("tick checkbox gọi onToggle đúng key", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(onToggle).toHaveBeenCalledWith("phone");
  });

  it("cột hideable=false có checkbox disabled, không gọi onToggle", () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    const cb = screen.getByLabelText("User Name");
    expect(cb).toBeDisabled();
    fireEvent.click(cb);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("nút Hiện tất cả gọi onShowAll", () => {
    const { onShowAll } = setup({ isVisible: (k) => k !== "uid", visibleCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByRole("button", { name: "Hiện tất cả" }));
    expect(onShowAll).toHaveBeenCalled();
  });

  it("nút Hiện tất cả disabled khi không có cột ẩn", () => {
    setup(); // mặc định full 3/3
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByRole("button", { name: "Hiện tất cả" })).toBeDisabled();
  });

  it("Esc đóng panel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
  });

  it("click ra ngoài đóng panel", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Chọn cột hiển thị")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd frontend && npx vitest run src/components/ui/ColumnVisibilityMenu.test.tsx`
Expected: FAIL — `Cannot find module './ColumnVisibilityMenu'`

- [ ] **Step 3: Implement component**

```tsx
// frontend/src/components/ui/ColumnVisibilityMenu.tsx
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import Button from "./Button";

export interface ColumnOption {
  key: string;
  label: string;
  hideable: boolean;
}

interface Props {
  columns: readonly ColumnOption[];
  isVisible: (key: string) => boolean;
  onToggle: (key: string) => void;
  onShowAll: () => void;
  visibleCount: number;
}

export default function ColumnVisibilityMenu({
  columns,
  isVisible,
  onToggle,
  onShowAll,
  visibleCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const allVisible = visibleCount === columns.length;

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Cột hiển thị
        <span className="rounded-full bg-gmv-primary-soft px-2 py-0.5 text-xs font-medium text-gmv-primary">
          {visibleCount}/{columns.length}
        </span>
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[220px] rounded-gmv-md border border-gmv-border bg-gmv-canvas py-2 shadow-gmv-1">
          <div className="flex items-center justify-between gap-3 border-b border-gmv-border px-3.5 pb-2">
            <span className="text-sm font-medium text-gmv-text-strong">Chọn cột hiển thị</span>
            <button
              type="button"
              className="text-xs text-gmv-primary disabled:cursor-not-allowed disabled:opacity-40"
              onClick={onShowAll}
              disabled={allVisible}
            >
              Hiện tất cả
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto pt-1">
            {columns.map((c) => (
              <label
                key={c.key}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3.5 py-1.5 text-sm text-gmv-text hover:bg-gmv-bg",
                  !c.hideable && "cursor-not-allowed opacity-50"
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-gmv-primary"
                  checked={isVisible(c.key)}
                  disabled={!c.hideable}
                  onChange={() => onToggle(c.key)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd frontend && npx vitest run src/components/ui/ColumnVisibilityMenu.test.tsx`
Expected: 8 passed

- [ ] **Step 5: Type check + commit**

```bash
cd frontend && npx tsc -b
git checkout -b feat/colvis-menu
git add frontend/src/components/ui/ColumnVisibilityMenu.tsx frontend/src/components/ui/ColumnVisibilityMenu.test.tsx
git commit -m "feat(sodoanhthu): add ColumnVisibilityMenu popover component"
```

---

## Task 3 (Giang): Refactor SoDoanhThuTab sang column config + integrate

**Files:**
- Modify: `frontend/src/components/SoDoanhThuTab.tsx` (header `:551-564`, body `:576-641`, colSpan `:569,644`, toolbar `:446-472`, dòng đếm `:539-546`)
- Test: `frontend/src/components/SoDoanhThuTab.columns.test.tsx` (mới)

Bước 1-5 (refactor thuần, behavior-preserving) làm được NGAY song song với Task 1+2. Bước 6 (wire) chờ Task 1+2 merge.

- [ ] **Step 1: Thêm column config module-level (chưa đổi render)**

Thêm sau `filterParams` (`:110-118`), trước `export default function SoDoanhThuTab()`. Cần thêm import `Fragment` + `type ReactNode` từ react (dòng 1):

```tsx
// Dòng 1 đổi thành:
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
```

```tsx
export type LedgerCellCtx = {
  deletingId: string | null;
  openEdit: (row: RevenueLedgerRow) => void;
  handleDelete: (row: RevenueLedgerRow) => void;
};

export type LedgerColumnDef = {
  key: string;
  label: string;
  thClass?: string;
  hideable: boolean;
  renderTd: (row: RevenueLedgerRow, ctx: LedgerCellCtx) => ReactNode;
};

// Nguồn sự thật duy nhất cho cột: header + body + colSpan đều derive từ đây.
// Giữ NGUYÊN class/JSX từng cell như bản cũ — refactor này không đổi visual.
export const LEDGER_COLUMNS: readonly LedgerColumnDef[] = [
  {
    key: "userName",
    label: "User Name",
    thClass: "min-w-[9rem]",
    hideable: false,
    renderTd: (row) => (
      <Td className="text-left">
        <div className="font-medium text-gmv-text-strong">{row.tenKhach || "—"}</div>
        <Badge tone={row.loaiNhap === "tu_dong" ? "primary" : "neutral"} className="mt-1">
          {row.loaiNhap === "tu_dong" ? "M3" : "Tay"}
        </Badge>
      </Td>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.sdt || "—"}</Td>,
  },
  {
    key: "uid",
    label: "UID",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.uid || "—"}</Td>,
  },
  {
    key: "payTime",
    label: "Pay Time",
    hideable: true,
    renderTd: (row) => (
      <Td className="whitespace-nowrap text-sm">{fmtPayTime(row.payTime || row.ngayTienVe)}</Td>
    ),
  },
  {
    key: "realPay",
    label: "Real Pay (VND)",
    thClass: "min-w-[9.5rem]",
    hideable: true,
    renderTd: (row) => (
      <Td className="min-w-[9.5rem] px-3 text-right text-sm font-medium tabular-nums">
        <span className="inline-block max-w-full break-all leading-snug">
          {formatVndNumber(row.soTienVnd) || "—"}
        </span>
      </Td>
    ),
  },
  {
    key: "infoCode",
    label: "Nội dung CK",
    thClass: "min-w-[10rem]",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-xs font-mono">{row.infoCode || "—"}</Td>,
  },
  {
    key: "orderId",
    label: "ID đơn hàng",
    thClass: "min-w-[7rem]",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm font-mono">{orderIdDisplay(row)}</Td>,
  },
  {
    key: "paymentMethod",
    label: "Payment method",
    hideable: true,
    renderTd: (row) => (
      <Td className="text-center">
        {row.paymentMethod ? (
          <span
            className={cn(ledgerPillBase, paymentMethodCellClass(row.paymentMethod))}
            title={row.paymentMethod}
          >
            {row.paymentMethod}
          </span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "type",
    label: "Type",
    hideable: true,
    renderTd: (row) => (
      <Td className="text-center">
        {typeDisplayLabel(row.loai, row.loai2) !== "—" ? (
          <span
            className={cn(ledgerPillBase, typeCellClass(row.loai, row.loai2))}
            title={typeDisplayLabel(row.loai, row.loai2)}
          >
            {typeDisplayLabel(row.loai, row.loai2)}
          </span>
        ) : (
          "—"
        )}
      </Td>
    ),
  },
  {
    key: "sales",
    label: "Sales",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.saleCrmName || "—"}</Td>,
  },
  {
    key: "team",
    label: "Team",
    hideable: true,
    renderTd: (row) => <Td className="text-left text-sm">{row.team || "—"}</Td>,
  },
  {
    key: "actions",
    label: "Thao tác",
    thClass: "min-w-[9rem]",
    hideable: true,
    renderTd: (row, ctx) => (
      <Td>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Button type="button" size="sm" variant="ghost" onClick={() => ctx.openEdit(row)}>
            Chỉnh sửa
          </Button>
          {row.loaiNhap === "tay" && (
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={ctx.deletingId === row.id}
              onClick={() => ctx.handleDelete(row)}
            >
              {ctx.deletingId === row.id ? "…" : "Xóa"}
            </Button>
          )}
        </div>
      </Td>
    ),
  },
];
```

- [ ] **Step 2: Derive columns trong component (tạm chưa có hook)**

Trong `SoDoanhThuTab()`, sau khai báo `openEdit`/`handleDelete` (để cellCtx tham chiếu được — grep vị trí hiện tại của 2 hàm này trong component):

```tsx
// readOnly: loại hẳn cột Thao tác khỏi cả header + body + menu (fix bug lệch cột cũ)
const baseColumns = readOnly ? LEDGER_COLUMNS.filter((c) => c.key !== "actions") : LEDGER_COLUMNS;
const visibleColumns = baseColumns; // Step 6 sẽ thay bằng filter theo hook
const cellCtx: LedgerCellCtx = { deletingId, openEdit, handleDelete };
```

- [ ] **Step 3: Thay header + body + colSpan render từ config**

Header (`:551-564` cũ) thành:

```tsx
<thead>
  <Tr>
    {visibleColumns.map((c) => (
      <Th key={c.key} className={cn(stickyTableHead, stickyTableHeadTop, c.thClass)}>
        {c.label}
      </Th>
    ))}
  </Tr>
</thead>
```

Body row (`:576-641` cũ — toàn bộ cell hardcode + block `{!readOnly && (<Td>…Thao tác…</Td>)}`) thành:

```tsx
{rows.map((row) => (
  <Tr key={row.id} className={deletingId === row.id ? "opacity-60" : ""}>
    {visibleColumns.map((c) => (
      <Fragment key={c.key}>{c.renderTd(row, cellCtx)}</Fragment>
    ))}
  </Tr>
))}
```

Hai chỗ `colSpan={12}` (`:569` và `:644`) thành `colSpan={visibleColumns.length}`.

- [ ] **Step 4: Verify refactor behavior-preserving**

```bash
cd frontend && npx tsc -b && npm run test
```
Expected: PASS toàn bộ suite cũ. Mở `npm run dev`, so bảng với production: 12 cột y hệt, edit/xóa hoạt động, user readOnly (test.user@dev trên sandbox) không thấy cột Thao tác — cả header lẫn body.

- [ ] **Step 5: Commit mốc refactor**

```bash
git checkout -b feat/colvis-sodoanhthu
git add frontend/src/components/SoDoanhThuTab.tsx
git commit -m "refactor(sodoanhthu): render ledger table from single column config"
```

- [ ] **Step 6: Wire hook + menu (SAU khi Task 1+2 merge)**

Import (đầu file):

```tsx
import { useColumnVisibility } from "../hooks/useColumnVisibility";
import ColumnVisibilityMenu from "./ui/ColumnVisibilityMenu";
```

Thay block Step 2 thành:

```tsx
const baseColumns = readOnly ? LEDGER_COLUMNS.filter((c) => c.key !== "actions") : LEDGER_COLUMNS;
const { isVisible, toggle, showAll, visibleCount } = useColumnVisibility(
  "soDoanhThu",
  baseColumns.map((c) => c.key)
);
const visibleColumns = baseColumns.filter((c) => isVisible(c.key));
const cellCtx: LedgerCellCtx = { deletingId, openEdit, handleDelete };
```

Đặt menu vào hàng nút filter — ngay sau nút "Reset bộ lọc" (`:452-454`):

```tsx
<ColumnVisibilityMenu
  columns={baseColumns.map((c) => ({ key: c.key, label: c.label, hideable: c.hideable }))}
  isVisible={isVisible}
  onToggle={toggle}
  onShowAll={showAll}
  visibleCount={visibleCount}
/>
```

Dòng đếm (`:539-546`) — append vào cuối `<p>`, sau ternary:

```tsx
{visibleCount < baseColumns.length && (
  <> · {baseColumns.length - visibleCount} cột đang ẩn</>
)}
```

- [ ] **Step 7: Viết integration tests**

```tsx
// frontend/src/components/SoDoanhThuTab.columns.test.tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../test/msw/server";
import { __resetColumnVisibilityCache } from "../hooks/useColumnVisibility";
import SoDoanhThuTab, { LEDGER_COLUMNS } from "./SoDoanhThuTab";

vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: () => ({
      on: function () { return this; },
      subscribe: () => {},
    }),
    removeChannel: () => {},
  },
}));

vi.mock("../hooks/useMe", () => ({
  useMe: () => ({
    profile: {
      email: "test@example.com",
      role: "system",
      department: null,
      permissions: { revenueLedger: "full" },
    },
    loading: false,
    error: "",
    refresh: async () => {},
  }),
}));

const LEDGER_ROW = {
  id: "r1",
  ngayTienVe: "2026-07-04",
  payTime: "2026-07-04",
  tenKhach: "C Oanh - Thương Anh",
  sdt: "84-878714588",
  uid: "3313938108",
  goiHoc: "",
  soTienVnd: 10_800_000,
  gmvRmb: 2919,
  saleCrmName: "Nguyen Minh Phat",
  team: "HCM (Online)",
  loai: "转介绍",
  loai2: "",
  note: "",
  note2: "",
  paymentMethod: "1st",
  loaiNhap: "tay",
  infoCode: "",
  maDonHang: "",
  crmOrderId: "",
};

const EMPTY_SUMMARY = { totalGmvVnd: 0, orderCount: 0, bySource: [] };

function mockLedger(rows: unknown[]) {
  server.use(
    http.get("http://localhost:8000/revenue/ledger", () =>
      HttpResponse.json({ rows, count: rows.length, offset: 0, limit: 60, hasMore: false })
    ),
    http.get("http://localhost:8000/revenue/ledger/summary", () =>
      HttpResponse.json(EMPTY_SUMMARY)
    )
  );
}

describe("SoDoanhThuTab column visibility", () => {
  beforeEach(() => {
    __resetColumnVisibilityCache();
  });

  it("G1: header và body luôn cùng số cột, trước và sau khi ẩn cột", async () => {
    mockLedger([LEDGER_ROW]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText("C Oanh - Thương Anh")).toBeInTheDocument()
    );

    const headerCount = () => screen.getAllByRole("columnheader").length;
    const bodyRow = screen.getByText("C Oanh - Thương Anh").closest("tr")!;
    const cellCount = () => within(bodyRow).getAllByRole("cell").length;

    expect(headerCount()).toBe(LEDGER_COLUMNS.length);
    expect(cellCount()).toBe(headerCount());

    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));

    expect(screen.queryByRole("columnheader", { name: "Phone" })).not.toBeInTheDocument();
    expect(headerCount()).toBe(LEDGER_COLUMNS.length - 1);
    expect(cellCount()).toBe(headerCount());
    expect(screen.getByText(/1 cột đang ẩn/)).toBeInTheDocument();
  });

  it("G4: colSpan empty-state khớp số cột visible", async () => {
    mockLedger([]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText(/Chưa có dòng/)).toBeInTheDocument()
    );

    const emptyCell = screen.getByText(/Chưa có dòng/).closest("td")!;
    expect(emptyCell.colSpan).toBe(LEDGER_COLUMNS.length);

    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    fireEvent.click(screen.getByLabelText("Phone"));
    expect(emptyCell.colSpan).toBe(LEDGER_COLUMNS.length - 1);
  });

  it("G3: User Name không ẩn được (checkbox disabled)", async () => {
    mockLedger([LEDGER_ROW]);
    render(<SoDoanhThuTab />);
    await waitFor(() =>
      expect(screen.getByText("C Oanh - Thương Anh")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /cột hiển thị/i }));
    expect(screen.getByLabelText("User Name")).toBeDisabled();
  });
});
```

Lưu ý: nếu MSW base URL của project khác `http://localhost:8000` (check `src/test/msw/server.ts` + handler có sẵn), chỉnh path cho khớp pattern các test hiện có (`DashboardTab.test.tsx:48` dùng `http://localhost:8000/revenue/ledger` — pattern đã verify).

- [ ] **Step 8: Chạy test, xác nhận PASS**

Run: `cd frontend && npx vitest run src/components/SoDoanhThuTab.columns.test.tsx`
Expected: 3 passed

- [ ] **Step 9: Full verify + commit + squash**

```bash
cd frontend && npx tsc -b && npm run test && npm run build
git add frontend/src/components/SoDoanhThuTab.tsx frontend/src/components/SoDoanhThuTab.columns.test.tsx
git commit -m "feat(sodoanhthu): wire column visibility menu into ledger table"
# Squash 2 commit của branch này thành 1 trước khi merge:
git rebase -i sandbox   # squash "refactor(...)" + "feat(...)" → 1 commit feat(sodoanhthu)
```

---

## Acceptance criteria (nghiệm thu trên Vercel sandbox)

1. Tab Sổ doanh thu có nút "Cột hiển thị (12/12)" cạnh Reset bộ lọc.
2. Bỏ tick cột → cột biến mất khỏi bảng ngay, badge + dòng "N cột đang ẩn" cập nhật.
3. Chuyển sang tab khác (VD Bảng thông tin) rồi quay lại → cột ẩn VẪN ẩn.
4. F5 → về mặc định 12/12.
5. Không ẩn được "User Name"; không ẩn được đến mức bảng trống (còn 1 cột thì cột cuối không tắt được).
6. Login `test.user@dev` (Sale, readOnly nếu quyền read): không thấy cột "Thao tác" ở cả header lẫn body — bảng không lệch.
7. Bảng đầy đủ 12 cột trông Y HỆT bản cũ (visual regression tay: pill Type/Payment method, badge M3/Tay, min-width, sticky header khi cuộn).
8. Empty state ("Chưa có dòng…") và dòng "Cuộn xuống để tải thêm" trải đúng hết chiều ngang bảng khi đang ẩn cột.
9. `cd frontend && npx tsc -b` PASS; `npm run test` PASS (suite cũ + 18 test mới); `npm run build` PASS.

## Test plan

```bash
cd frontend
npx vitest run src/hooks/useColumnVisibility.test.ts          # 7 tests (Đạt)
npx vitest run src/components/ui/ColumnVisibilityMenu.test.tsx # 8 tests (Đức)
npx vitest run src/components/SoDoanhThuTab.columns.test.tsx   # 3 tests (Giang)
npm run test    # full suite
npx tsc -b      # bắt buộc — Vercel chạy tsc -b, KHÔNG dùng --noEmit
npm run build
npm run e2e     # 14 tests cũ phải xanh nguyên (không có e2e cho Sổ DT — chỉ confirm không vỡ chỗ khác)
```

Manual (sandbox): acceptance criteria 1-8 ở trên, cả Chrome + 1 máy màn hình nhỏ (menu popover không tràn viewport).

## Anti-patterns (đừng làm)

1. **Đừng dùng sessionStorage/localStorage** — sessionStorage sống qua F5 (sai spec "tạm thời"), localStorage vĩnh viễn; cả hai tạo rủi ro stale key khi deploy đổi cột. Cache in-memory là chủ ý, không phải thiếu sót.
2. **Đừng lưu preference vào DB / thêm endpoint** — tăng gánh backend vô ích cho nhu cầu tạm thời.
3. **Đừng if/else từng cột rải rác trong JSX** (`{isVisible("phone") && <Th>…}` ở header + `{isVisible("phone") && <Td>…}` ở body) — 2 nơi phải nhớ sửa cùng lúc = nguồn lệch cột. Phải map từ `visibleColumns`.
4. **Đừng dùng CSS `display:none`** — DOM vẫn đầy đủ (không nhẹ hơn), colSpan vẫn phải sửa, không được gì.
5. **Đừng sửa `ui/Table.tsx`** — primitive dùng chung toàn app, blast radius lớn.
6. **Đừng thêm dependency** (radix, headlessui…) cho popover — 60 dòng tự viết đủ.
7. **Đừng đổi interface contract** giữa chừng mà không báo — Đạt/Đức/Giang code song song dựa trên contract.
8. **Đừng quên squash** — mỗi branch 1 commit trước khi merge.
