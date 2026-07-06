# Mobile UI — GĐ 0: Nền móng — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mọi module mở được trên điện thoại (sheet "Thêm" cho bottom nav) + bộ primitive responsive dùng chung (useIsMobile, RowCard, Modal bottom-sheet, drawer full màn) + hạ tầng test mobile (Playwright Pixel 5).

**Architecture:** Responsive web thuần CSS/FE trên cùng codebase — desktop ≥768px không đổi pixel nào, mọi thay đổi qua `max-md:` classes hoặc nhánh `useIsMobile()`. Spec: `docs/superpowers/specs/2026-07-06-mobile-responsive-ui-design.md`.

**Tech Stack:** React 19 + Tailwind 3.4 (có `max-md:` variant) + Vitest/@testing-library + Playwright 1.60.

**Branch:** `mobile-ui` (từ `main`). Commit theo task trong lúc dev, **squash khi merge** sang `sandbox`/`main` (quy ước anh Minh).

---

## Bối cảnh cho người không biết codebase

- App SPA 1 trang: `MainPage.tsx` giữ `useState<ViewId>`, đổi tab qua `AppShell` props `items/activeId/onSelect`. **Không có router** — điều hướng = gọi `onSelect(id)`.
- `items` đã được MainPage **lọc theo RBAC** trước khi truyền vào AppShell → UI mới không cần logic quyền.
- Mobile hiện tại: sidebar `hidden md:flex`, bottom nav `md:hidden` chỉ render `items.slice(0, 5)` → 15+ module không mở được. Đây là bug chính GĐ 0 sửa.
- Test convention: unit test co-located cạnh source (`Foo.test.tsx`), chạy `cd frontend && npx vitest run <path>`. E2E trong `frontend/e2e/`, auth session tái dùng qua `e2e/.auth/user.json` (project `auth-setup`).
- Type check bắt buộc `npx tsc -b` (KHÔNG dùng `--noEmit` — Vercel chạy `tsc -b`).
- Design tokens: màu/bo góc dùng class `gmv-*` (`bg-gmv-canvas`, `text-gmv-muted`, `rounded-gmv-md`…) — xem `tailwind.config.js` + `docs/DESIGN.md`. Luôn dùng token, không hardcode màu.

## File structure GĐ 0

| File | Vai trò |
|---|---|
| Create `frontend/src/hooks/useIsMobile.ts` | Hook matchMedia `<768px`, nguồn sự thật duy nhất cho "đang ở mobile" |
| Create `frontend/src/hooks/useIsMobile.test.ts` | Unit test hook |
| Create `frontend/src/components/ui/RowCard.tsx` | Primitive card view (1 dòng bảng → 1 thẻ) + `RowCardList` |
| Create `frontend/src/components/ui/RowCard.test.tsx` | Unit test |
| Create `frontend/src/layouts/MobileNavSheet.tsx` | Sheet toàn màn liệt kê đủ module theo section |
| Create `frontend/src/layouts/MobileNavSheet.test.tsx` | Unit test |
| Modify `frontend/src/layouts/AppShell.tsx` | Bottom nav 4 mục + nút "Thêm", fix NavButton compact với children |
| Create `frontend/src/layouts/AppShell.test.tsx` | Unit test bottom nav |
| Modify `frontend/src/components/ui/Modal.tsx` | Bottom-sheet trên mobile (CSS-only) |
| Modify `frontend/src/styles/prototype-payments.css` | `.drawer` → 100vw mobile |
| Modify `frontend/src/components/auth/auth-accounts.css` | `.aa-drawer` → 100vw mobile |
| Modify `frontend/playwright.config.ts` | Thêm project `mobile` (Pixel 5) |
| Create `frontend/e2e/mobile-nav.spec.ts` | E2E điều hướng mobile |

---

### Task 1: Branch setup

- [ ] **Step 1: Tạo branch từ main**

```bash
cd E:/PalFish/DA/pf-gmv-reconciliation/palfish-t-i-u-h-th-ng-ver-2
git status   # phải sạch (trừ file untracked migrations không liên quan)
git checkout main && git pull
git checkout -b mobile-ui
```

---

### Task 2: Hook `useIsMobile`

**Files:**
- Create: `frontend/src/hooks/useIsMobile.ts`
- Test: `frontend/src/hooks/useIsMobile.test.ts`

- [ ] **Step 1: Viết test fail trước**

```ts
// frontend/src/hooks/useIsMobile.test.ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useIsMobile from "./useIsMobile";

type ChangeListener = (e: { matches: boolean }) => void;

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mql = {
    matches: initialMatches,
    media: "(max-width: 767px)",
    addEventListener: (_: string, cb: ChangeListener) => listeners.add(cb),
    removeEventListener: (_: string, cb: ChangeListener) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    fire(matches: boolean) {
      mql.matches = matches;
      listeners.forEach((cb) => cb({ matches }));
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useIsMobile", () => {
  it("trả về true khi viewport < 768px", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("trả về false khi viewport >= 768px", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("cập nhật khi viewport đổi (xoay máy)", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => media.fire(true));
    expect(result.current).toBe(true);
  });

  it("không crash khi môi trường thiếu matchMedia (jsdom test cũ)", () => {
    vi.stubGlobal("matchMedia", undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd frontend && npx vitest run src/hooks/useIsMobile.test.ts`
Expected: FAIL — "Cannot find module './useIsMobile'"

- [ ] **Step 3: Implement hook**

```ts
// frontend/src/hooks/useIsMobile.ts
import { useEffect, useState } from "react";

/** Khớp breakpoint `md` của Tailwind (768px). Dưới md = mobile. */
const QUERY = "(max-width: 767px)";

function getMql(): MediaQueryList | null {
  // Defensive: jsdom trong các test cũ không stub matchMedia → coi như desktop
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY)
    : null;
}

export default function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => getMql()?.matches ?? false);

  useEffect(() => {
    const mql = getMql();
    if (!mql) return;
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
```

- [ ] **Step 4: Chạy lại test — PASS**

Run: `cd frontend && npx vitest run src/hooks/useIsMobile.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useIsMobile.ts frontend/src/hooks/useIsMobile.test.ts
git commit -m "feat(mobile): useIsMobile hook — nguồn sự thật breakpoint md"
```

---

### Task 3: `RowCard` + `RowCardList` primitive

**Files:**
- Create: `frontend/src/components/ui/RowCard.tsx`
- Test: `frontend/src/components/ui/RowCard.test.tsx`

Đây là component các GĐ sau dùng để thay dòng bảng trên mobile. API: mỗi tab tự quyết field nào lên thẻ, khung/style/hành vi bấm dùng chung.

- [ ] **Step 1: Viết test fail trước**

```tsx
// frontend/src/components/ui/RowCard.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RowCard, RowCardList } from "./RowCard";

describe("RowCard", () => {
  it("hiển thị tiêu đề, giá trị chính, badge và meta", () => {
    render(
      <RowCard
        title="Nguyễn Văn A"
        value="4.700.000 ₫"
        badges={<span>Đã thanh toán</span>}
        meta={[{ label: "Sale", value: "Đào Thị Trang" }]}
      />
    );
    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("4.700.000 ₫")).toBeInTheDocument();
    expect(screen.getByText("Đã thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Sale")).toBeInTheDocument();
    expect(screen.getByText("Đào Thị Trang")).toBeInTheDocument();
  });

  it("bấm vào thẻ gọi onClick", () => {
    const onClick = vi.fn();
    render(<RowCard title="PR-0080" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("bấm vào vùng actions KHÔNG lan lên onClick của thẻ", () => {
    const onClick = vi.fn();
    const onAction = vi.fn();
    render(
      <RowCard
        title="PR-0080"
        onClick={onClick}
        actions={<button onClick={onAction}>Sửa</button>}
      />
    );
    fireEvent.click(screen.getByText("Sửa"));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("RowCardList", () => {
  it("hiển thị empty state khi không có thẻ", () => {
    render(<RowCardList empty="Chưa có PR nào">{null}</RowCardList>);
    expect(screen.getByText("Chưa có PR nào")).toBeInTheDocument();
  });

  it("render children khi có thẻ", () => {
    render(
      <RowCardList>
        <RowCard title="PR-0080" />
      </RowCardList>
    );
    expect(screen.getByText("PR-0080")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd frontend && npx vitest run src/components/ui/RowCard.test.tsx`
Expected: FAIL — "Cannot find module './RowCard'"

- [ ] **Step 3: Implement**

```tsx
// frontend/src/components/ui/RowCard.tsx
import { Children, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface RowCardMeta {
  label: string;
  value: ReactNode;
}

interface RowCardProps {
  /** Dòng đầu bên trái — tên khách / mã PR */
  title: ReactNode;
  /** Dòng đầu bên phải — giá trị chính (số tiền) */
  value?: ReactNode;
  /** Hàng badge trạng thái */
  badges?: ReactNode;
  /** Các cặp label–value phụ */
  meta?: RowCardMeta[];
  /** Hàng nút thao tác — tự chặn event lan lên onClick của thẻ */
  actions?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function RowCard({ title, value, badges, meta, actions, onClick, className }: RowCardProps) {
  const clickable = Boolean(onClick);
  return (
    <div
      className={cn(
        "rounded-gmv-md border border-gmv-border bg-gmv-canvas p-3 shadow-gmv-1",
        clickable && "cursor-pointer transition active:bg-gmv-bg",
        className
      )}
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold text-gmv-text-strong">{title}</div>
        {value !== undefined && (
          <div className="shrink-0 text-sm font-bold text-gmv-primary">{value}</div>
        )}
      </div>
      {badges && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{badges}</div>}
      {meta && meta.length > 0 && (
        <dl className="mt-2 space-y-1">
          {meta.map((m, i) => (
            <div key={i} className="flex justify-between gap-3 text-xs">
              <dt className="shrink-0 text-gmv-muted">{m.label}</dt>
              <dd className="min-w-0 truncate text-right text-gmv-text">{m.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && (
        <div
          className="mt-2.5 flex flex-wrap gap-2 border-t border-gmv-border pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

interface RowCardListProps {
  children: ReactNode;
  /** Hiển thị khi không có thẻ nào */
  empty?: ReactNode;
  className?: string;
}

export function RowCardList({ children, empty, className }: RowCardListProps) {
  const hasChildren = Children.count(children) > 0;
  return (
    <div className={cn("space-y-2", className)}>
      {hasChildren ? (
        children
      ) : (
        <div className="rounded-gmv-md border border-dashed border-gmv-border p-6 text-center text-sm text-gmv-muted">
          {empty ?? "Không có dữ liệu"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Chạy lại test — PASS**

Run: `cd frontend && npx vitest run src/components/ui/RowCard.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/RowCard.tsx frontend/src/components/ui/RowCard.test.tsx
git commit -m "feat(mobile): RowCard/RowCardList primitive cho card view"
```

---

### Task 4: Modal bottom-sheet trên mobile (CSS-only)

**Files:**
- Modify: `frontend/src/components/ui/Modal.tsx:29` (overlay) và `:35-37` (panel)

CSS-only, không đổi API/logic → không thêm unit test (test class string là tautology); hành vi cũ được cover bởi test hiện có (`QrViewModal.test.tsx`, `DeleteAccountsModal.test.tsx`), verify hình thức bằng E2E + mắt ở Task 8/9.

- [ ] **Step 1: Sửa overlay — mobile căn đáy**

Dòng 29, thay:

```tsx
className={cn("fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4", overlayClassName)}
```

bằng:

```tsx
className={cn(
  "fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 max-md:items-end max-md:p-0",
  overlayClassName
)}
```

- [ ] **Step 2: Sửa panel — mobile full-width, bo góc trên**

Dòng 34–38, thay:

```tsx
className={cn(
  "max-h-[90vh] w-full overflow-y-auto rounded-gmv-lg bg-gmv-canvas p-6 shadow-gmv-2",
  wide ? "max-w-3xl" : "max-w-lg",
  className
)}
```

bằng:

```tsx
className={cn(
  "max-h-[90vh] w-full overflow-y-auto rounded-gmv-lg bg-gmv-canvas p-6 shadow-gmv-2",
  "max-md:max-h-[92vh] max-md:max-w-none max-md:rounded-b-none max-md:p-4",
  wide ? "max-w-3xl" : "max-w-lg",
  className
)}
```

- [ ] **Step 3: Chạy test modal hiện có — PASS (hành vi không đổi)**

Run: `cd frontend && npx vitest run src/components/payment-request/QrViewModal.test.tsx src/components/auth/DeleteAccountsModal.test.tsx`
Expected: PASS nguyên trạng

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ui/Modal.tsx
git commit -m "feat(mobile): Modal thanh bottom-sheet duoi breakpoint md"
```

---

### Task 5: `MobileNavSheet` — sheet liệt kê đủ module

**Files:**
- Create: `frontend/src/layouts/MobileNavSheet.tsx`
- Test: `frontend/src/layouts/MobileNavSheet.test.tsx`

Sheet trượt từ đáy, liệt kê **toàn bộ** `items` (kể cả 4 mục đã ghim — user có 1 menu đầy đủ duy nhất), nhóm theo `section` giống sidebar, item có `children` expand inline. `items` đã lọc RBAC từ MainPage → không cần logic quyền.

- [ ] **Step 1: Viết test fail trước**

```tsx
// frontend/src/layouts/MobileNavSheet.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { NavItem } from "./AppShell";
import MobileNavSheet from "./MobileNavSheet";

const items: NavItem[] = [
  { id: "dashboard", label: "Bảng thông tin", icon: <span />, section: "Khách hàng & Đơn hàng" },
  { id: "paymentRequests", label: "Quản lý thanh toán", icon: <span /> },
  {
    id: "reconHub",
    label: "Đối soát giao dịch",
    icon: <span />,
    section: "Đối soát & Hóa đơn",
    children: [
      { id: "reconciliation", label: "Chuyển khoản" },
      { id: "reconCard", label: "Quẹt thẻ" },
    ],
  },
];

describe("MobileNavSheet", () => {
  it("open=false không render gì", () => {
    const { container } = render(
      <MobileNavSheet open={false} onClose={vi.fn()} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("liệt kê đủ module + tiêu đề section", () => {
    render(
      <MobileNavSheet open onClose={vi.fn()} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    expect(screen.getByText("Bảng thông tin")).toBeInTheDocument();
    expect(screen.getByText("Quản lý thanh toán")).toBeInTheDocument();
    expect(screen.getByText("Đối soát giao dịch")).toBeInTheDocument();
    expect(screen.getByText("Đối soát & Hóa đơn")).toBeInTheDocument();
  });

  it("chọn module lá → gọi onSelect + đóng sheet", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <MobileNavSheet open onClose={onClose} items={items} activeId="dashboard" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Quản lý thanh toán"));
    expect(onSelect).toHaveBeenCalledWith("paymentRequests");
    expect(onClose).toHaveBeenCalled();
  });

  it("module có children → expand rồi chọn child", () => {
    const onSelect = vi.fn();
    render(
      <MobileNavSheet open onClose={vi.fn()} items={items} activeId="dashboard" onSelect={onSelect} />
    );
    fireEvent.click(screen.getByText("Đối soát giao dịch")); // expand, chưa select
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Chuyển khoản"));
    expect(onSelect).toHaveBeenCalledWith("reconciliation");
  });

  it("bấm overlay đóng sheet", () => {
    const onClose = vi.fn();
    render(
      <MobileNavSheet open onClose={onClose} items={items} activeId="dashboard" onSelect={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd frontend && npx vitest run src/layouts/MobileNavSheet.test.tsx`
Expected: FAIL — "Cannot find module './MobileNavSheet'"

- [ ] **Step 3: Implement**

```tsx
// frontend/src/layouts/MobileNavSheet.tsx
import { useState } from "react";
import { cn } from "../lib/cn";
import type { NavItem } from "./AppShell";

interface Props {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
}

/** Sheet toàn màn hình cho mobile: liệt kê đủ module theo section. Chỉ render < md. */
export default function MobileNavSheet({ open, onClose, items, activeId, onSelect }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const parent = items.find((it) => it.children?.some((c) => c.id === activeId));
    return new Set(parent ? [parent.id] : []);
  });

  if (!open) return null;

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(id: string) {
    onSelect(id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 md:hidden" onClick={onClose} role="presentation">
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-gmv-lg bg-gmv-canvas shadow-gmv-2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Tất cả chức năng"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gmv-border px-4 py-2">
          <span className="text-sm font-semibold text-gmv-text-strong">Tất cả chức năng</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-gmv-md text-gmv-muted hover:bg-gmv-bg"
          >
            ✕
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2 pb-[max(env(safe-area-inset-bottom),12px)]">
          <ul className="space-y-0.5">
            {items.map((it, idx) => {
              const prevSection = idx > 0 ? items[idx - 1]?.section : undefined;
              const showSection = it.section && it.section !== prevSection;
              const hasChildren = Boolean(it.children?.length);
              const highlighted =
                it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false);
              return (
                <li key={it.id}>
                  {showSection && (
                    <div className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-gmv-muted first:mt-0">
                      {it.section}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => (hasChildren ? toggleExpand(it.id) : pick(it.id))}
                    className={cn(
                      "flex min-h-[44px] w-full items-center gap-3 rounded-gmv-md px-3 py-2 text-sm font-medium transition",
                      highlighted
                        ? "bg-gmv-primary-soft text-gmv-primary"
                        : "text-gmv-text hover:bg-gmv-bg"
                    )}
                  >
                    <span className={highlighted ? "text-gmv-primary" : "text-gmv-muted"}>{it.icon}</span>
                    <span className="flex-1 text-left">{it.label}</span>
                    {hasChildren && (
                      <span
                        className={cn(
                          "text-xs text-gmv-muted transition",
                          expandedIds.has(it.id) && "rotate-90"
                        )}
                      >
                        ›
                      </span>
                    )}
                  </button>
                  {hasChildren && expandedIds.has(it.id) && (
                    <ul className="mb-1 ml-4 mt-0.5 space-y-0.5 border-l border-gmv-border pl-2">
                      {it.children!.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            onClick={() => pick(child.id)}
                            className={cn(
                              "min-h-[44px] w-full rounded-gmv-md px-2.5 py-2 text-left transition",
                              child.id === activeId
                                ? "bg-gmv-primary-soft text-gmv-primary"
                                : "text-gmv-text hover:bg-gmv-bg"
                            )}
                          >
                            <span className="block text-xs font-medium">{child.label}</span>
                            {child.subtitle && (
                              <span className="mt-0.5 block text-[10px] leading-snug text-gmv-muted">
                                {child.subtitle}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Chạy lại test — PASS**

Run: `cd frontend && npx vitest run src/layouts/MobileNavSheet.test.tsx`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/layouts/MobileNavSheet.tsx frontend/src/layouts/MobileNavSheet.test.tsx
git commit -m "feat(mobile): MobileNavSheet — sheet day du module cho bottom nav"
```

---

### Task 6: AppShell — bottom nav 4 mục + nút "Thêm"

**Files:**
- Modify: `frontend/src/layouts/AppShell.tsx` (bottom nav lines 307–322, NavButton onClick lines 88–92, state ~line 140)
- Test: Create `frontend/src/layouts/AppShell.test.tsx`

Hành vi mới:
- `items.length <= 5`: giữ nguyên như cũ (đủ chỗ, không cần "Thêm").
- `items.length > 5`: ghim 4 mục đầu + nút "Thêm" mở `MobileNavSheet`.
- "Thêm" highlight khi module active nằm ngoài 4 slot đầu.
- Fix bug sẵn có: NavButton `compact` có `children` đang `onSelect(it.id)` (id hub như `reconHub` không phải view) → đổi thành chọn child đầu.

- [ ] **Step 1: Viết test fail trước**

```tsx
// frontend/src/layouts/AppShell.test.tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell, { type NavItem } from "./AppShell";

function makeItems(n: number): NavItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `tab${i}`,
    label: `Tab${i}`,
    icon: <span />,
  }));
}

function renderShell(items: NavItem[], activeId = "tab0", onSelect = vi.fn()) {
  render(
    <AppShell items={items} activeId={activeId} onSelect={onSelect} title="Test">
      <div>nội dung</div>
    </AppShell>
  );
  return { onSelect };
}

describe("AppShell bottom nav", () => {
  it("<=5 mục: hiện đủ, không có nút Thêm", () => {
    renderShell(makeItems(5));
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    for (let i = 0; i < 5; i++) expect(within(nav).getByText(`Tab${i}`)).toBeInTheDocument();
    expect(within(nav).queryByText("Thêm")).not.toBeInTheDocument();
  });

  it(">5 mục: ghim 4 mục đầu + nút Thêm", () => {
    renderShell(makeItems(8));
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    for (let i = 0; i < 4; i++) expect(within(nav).getByText(`Tab${i}`)).toBeInTheDocument();
    expect(within(nav).queryByText("Tab4")).not.toBeInTheDocument();
    expect(within(nav).getByText("Thêm")).toBeInTheDocument();
  });

  it("bấm Thêm mở sheet đầy đủ, chọn module ngoài slot đầu", () => {
    const { onSelect } = renderShell(makeItems(8));
    fireEvent.click(screen.getByText("Thêm"));
    const sheet = screen.getByRole("dialog", { name: "Tất cả chức năng" });
    fireEvent.click(within(sheet).getByText("Tab6"));
    expect(onSelect).toHaveBeenCalledWith("tab6");
    expect(screen.queryByRole("dialog", { name: "Tất cả chức năng" })).not.toBeInTheDocument();
  });

  it("module active ngoài 4 slot đầu → nút Thêm highlight", () => {
    renderShell(makeItems(8), "tab6");
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    const moreBtn = within(nav).getByText("Thêm").closest("button")!;
    expect(moreBtn.className).toContain("text-gmv-primary");
  });

  it("mục ghim có children → chọn child đầu tiên (không chọn id hub)", () => {
    const items: NavItem[] = [
      ...makeItems(3),
      {
        id: "reconHub",
        label: "Đốisoát",
        icon: <span />,
        children: [
          { id: "reconciliation", label: "Chuyển khoản" },
          { id: "reconCard", label: "Quẹt thẻ" },
        ],
      },
      ...makeItems(2).map((it) => ({ ...it, id: `x${it.id}`, label: `X${it.label}` })),
    ];
    const onSelect = vi.fn();
    renderShell(items, "tab0", onSelect);
    const nav = screen.getByRole("navigation", { name: "Điều hướng chính" });
    fireEvent.click(within(nav).getByText("Đốisoát"));
    expect(onSelect).toHaveBeenCalledWith("reconciliation");
  });
});
```

Lưu ý cho người viết: NavButton `compact` render `label.split(" ")[0]` → dùng label 1 từ (`Tab0`, `Đốisoát`) trong test để query ổn định. Sidebar desktop cũng render cùng label trong jsdom (jsdom không apply CSS `hidden`) → **luôn query qua `within(nav)`/`within(sheet)`**.

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd frontend && npx vitest run src/layouts/AppShell.test.tsx`
Expected: FAIL — chưa có nút "Thêm" (test 2, 3, 4, 5 fail; test 1 pass vì slice(0,5) cũ)

- [ ] **Step 3: Sửa NavButton onClick (fix bug hub id trong compact)**

`AppShell.tsx` lines 88–92, thay:

```tsx
onClick={() => {
  if (hasChildren && onToggleExpand && !collapsed) onToggleExpand();
  else if (hasChildren && collapsed) onSelect(it.children![0].id);
  else onSelect(it.id);
}}
```

bằng:

```tsx
onClick={() => {
  if (hasChildren && onToggleExpand && !collapsed && !compact) onToggleExpand();
  else if (hasChildren) onSelect(it.children![0].id);
  else onSelect(it.id);
}}
```

- [ ] **Step 4: Thêm state + tính toán pinned/overflow trong AppShell**

Sau dòng 140 (`const [collapsed, setCollapsed] = useState(false);`) thêm:

```tsx
const [moreOpen, setMoreOpen] = useState(false);
const showMore = items.length > 5;
const pinnedItems = showMore ? items.slice(0, 4) : items;
const overflowItems = showMore ? items.slice(4) : [];
const overflowActive = overflowItems.some(
  (it) => it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false)
);
```

Import đầu file: `import MobileNavSheet from "./MobileNavSheet";`

- [ ] **Step 5: Thay khối bottom nav (lines 307–322)**

Thay:

```tsx
<nav
  className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gmv-border bg-gmv-canvas px-1 py-1 shadow-gmv-2 md:hidden"
  aria-label="Điều hướng chính"
>
  {items.slice(0, 5).map((it) => (
    <div key={it.id} className="min-w-0 flex-1">
      <NavButton
        it={it}
        active={it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false)}
        onSelect={onSelect}
        onHover={onHover}
        compact
      />
    </div>
  ))}
</nav>
```

bằng:

```tsx
<nav
  className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-gmv-border bg-gmv-canvas px-1 py-1 shadow-gmv-2 md:hidden"
  aria-label="Điều hướng chính"
>
  {pinnedItems.map((it) => (
    <div key={it.id} className="min-w-0 flex-1">
      <NavButton
        it={it}
        active={it.id === activeId || (it.children?.some((c) => c.id === activeId) ?? false)}
        onSelect={onSelect}
        onHover={onHover}
        compact
      />
    </div>
  ))}
  {showMore && (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        className={cn(
          "flex min-h-[44px] w-full flex-col items-center gap-1 px-1 py-2 text-[10px] font-medium transition",
          overflowActive ? "bg-gmv-primary-soft text-gmv-primary" : "text-gmv-text"
        )}
      >
        <span className={overflowActive ? "text-gmv-primary" : "text-gmv-muted"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="5" cy="12" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="19" cy="12" r="1.5" />
          </svg>
        </span>
        <span className="max-w-full truncate leading-tight">Thêm</span>
      </button>
    </div>
  )}
</nav>
<MobileNavSheet
  open={moreOpen}
  onClose={() => setMoreOpen(false)}
  items={items}
  activeId={activeId}
  onSelect={onSelect}
/>
```

- [ ] **Step 6: Chạy lại test — PASS, kèm toàn bộ unit suite**

Run: `cd frontend && npx vitest run src/layouts/ && npm run test`
Expected: AppShell.test 5 passed; toàn suite pass (không regression)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/layouts/AppShell.tsx frontend/src/layouts/AppShell.test.tsx
git commit -m "feat(mobile): bottom nav 4 muc + nut Them mo sheet day du module"
```

---

### Task 7: Drawer full màn hình trên mobile (CSS)

**Files:**
- Modify: `frontend/src/styles/prototype-payments.css` (khối `.drawer` ~line 472; append media query cuối file)
- Modify: `frontend/src/components/auth/auth-accounts.css` (`.aa-drawer` line 406; append cuối file)

- [ ] **Step 1: Xác nhận selector thật**

Run: `cd frontend && grep -n "drawer {" src/styles/prototype-payments.css src/components/auth/auth-accounts.css`
Expected: thấy `.drawer` (prototype-payments) và `.aa-drawer` (auth-accounts). Nếu selector có prefix `.gmv-prototype` thì dùng đúng selector grep ra.

- [ ] **Step 2: Append cuối `prototype-payments.css`**

```css
/* ── Mobile: drawer chiếm toàn màn hình ── */
@media (max-width: 767px) {
  .drawer {
    width: 100vw;
  }
}
```

- [ ] **Step 3: Append cuối `auth-accounts.css`**

```css
/* ── Mobile: drawer chiếm toàn màn hình ── */
@media (max-width: 767px) {
  .aa-drawer {
    width: 100vw;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles/prototype-payments.css frontend/src/components/auth/auth-accounts.css
git commit -m "feat(mobile): drawer full man hinh duoi breakpoint md"
```

---

### Task 8: Playwright project mobile + E2E điều hướng

**Files:**
- Modify: `frontend/playwright.config.ts` (thêm project sau block `e2e` line 110, sửa `testIgnore` line 109)
- Create: `frontend/e2e/mobile-nav.spec.ts`

Dùng `devices["Pixel 5"]` (chromium — không phải cài thêm webkit như iPhone).

- [ ] **Step 1: Sửa `testIgnore` của project `e2e` (line 109)**

```ts
testIgnore: [/journeys/, /auth.*\.setup/, /rbac-/, /mobile-/],
```

- [ ] **Step 2: Thêm project `mobile` (sau block `e2e`, trước `],` line 111)**

```ts
// ── Mobile viewport (Pixel 5 = chromium, không cần cài webkit) ──
{
  name: "mobile",
  testMatch: /mobile-.*\.spec\.ts/,
  use: {
    ...devices["Pixel 5"],
    storageState: path.resolve(__dirname, "e2e/.auth/user.json"),
  },
  dependencies: ["auth-setup"],
},
```

- [ ] **Step 3: Viết spec**

```ts
// frontend/e2e/mobile-nav.spec.ts
import { expect, test } from "@playwright/test";

test.describe("Mobile: bottom nav + sheet Thêm", () => {
  test("mở được module ngoài 4 slot đầu qua sheet Thêm", async ({ page }) => {
    await page.goto("/");
    const bottomNav = page.getByRole("navigation", { name: "Điều hướng chính" });
    await expect(bottomNav).toBeVisible();

    await bottomNav.getByRole("button", { name: "Thêm" }).click();
    const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
    await expect(sheet).toBeVisible();

    // Account full quyền: "Sổ doanh thu" nằm ngoài 4 slot đầu
    await sheet.getByRole("button", { name: /Sổ doanh thu/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Sổ doanh thu/i);
  });

  test("sheet Thêm expand nhóm con (Đối soát giao dịch)", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Điều hướng chính" })
      .getByRole("button", { name: "Thêm" })
      .click();
    const sheet = page.getByRole("dialog", { name: "Tất cả chức năng" });
    await sheet.getByRole("button", { name: /Đối soát giao dịch/ }).click();
    await sheet.getByRole("button", { name: /Chuyển khoản/ }).click();
    await expect(sheet).toBeHidden();
  });

  test("sidebar desktop không hiện trên mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("aside")).toBeHidden();
  });
});
```

Lưu ý: assertion h1 dựa vào `title` prop MainPage truyền cho AppShell — nếu title thực tế khác "Sổ doanh thu" (xem `MainPage.tsx` mapping view→title), sửa regex theo title thật, KHÔNG sửa app cho khớp test.

- [ ] **Step 4: Chạy E2E mobile**

Run: `cd frontend && npx playwright test --project=mobile`
Expected: 3 passed (cần `.env.e2e` sẵn có; server dev tự khởi động qua webServer config)

- [ ] **Step 5: Chạy E2E desktop hiện có — không regression**

Run: `cd frontend && npm run e2e`
Expected: pass nguyên trạng (crm-sync, dashboard-sales, journeys, rbac)

- [ ] **Step 6: Commit**

```bash
git add frontend/playwright.config.ts frontend/e2e/mobile-nav.spec.ts
git commit -m "test(mobile): Playwright project Pixel 5 + spec dieu huong mobile"
```

---

### Task 9: Verification tổng + đẩy sandbox

- [ ] **Step 1: Type check chuẩn Vercel**

Run: `cd frontend && npx tsc -b`
Expected: exit 0, không lỗi

- [ ] **Step 2: Toàn bộ unit test**

Run: `cd frontend && npm run test`
Expected: pass 100%

- [ ] **Step 3: Build Vercel-identical**

Run: `cd frontend && npm run build`
Expected: build OK

- [ ] **Step 4: Squash + merge sandbox**

```bash
git checkout sandbox && git pull
git merge --squash mobile-ui
git commit -m "feat(mobile): GD0 nen mong mobile UI — nav sheet Them, RowCard, Modal bottom-sheet, drawer full man, e2e Pixel 5"
git push
```

Vercel sandbox tự deploy → duyệt bằng **điện thoại thật** trên https://palfish-gmv-manager-sandbox.vercel.app (login test.admin@dev): mở đủ module qua "Thêm", xoay ngang/dọc, check drawer PR + modal.

- [ ] **Step 5: Báo anh Minh nghiệm thu GĐ 0 trước khi viết plan GĐ 1**

---

## Roadmap sau GĐ 0 (mỗi GĐ 1 plan riêng)

Theo spec §4.2 — plan chi tiết viết SAU khi GĐ 0 nghiệm thu, vì phải đọc sâu từng tab (DashboardTab 686 dòng, PaymentRequestDetailDrawer 2.615 dòng…) mới viết code đúng:

1. **GĐ 1 — Sales** (`2026-xx-xx-mobile-ui-gd1-sales.md`): DashboardTab, Module6Tab, SoDoanhThuTab. Dùng useIsMobile + RowCard từ GĐ 0.
2. **GĐ 2 — Kế toán**: PaymentRequestsTab + PaymentRequestTable + PaymentRequestDetailDrawer, ReconciliationTab, ActivationTab, InvoiceRequestTab, CardReconciliationTab. **Trước khi viết plan: duyệt với anh Minh field nào lên card.**
3. **GĐ 3 — Báo cáo + Admin**: BC01/02/03 (giữ scroll ngang + sticky), Zalo/DingTalk hub, AuthAccounts, Permissions, Module5, GatewaySync, Profile.
4. **GĐ 4 — Test tổng + rollout prod**: mở rộng mobile E2E specs cho các tab đã làm, soak sandbox, merge main.
