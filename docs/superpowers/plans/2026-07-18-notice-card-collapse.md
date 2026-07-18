# Thu gọn/mở card cảnh báo xuất HĐ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép thu gọn/mở rộng từng card cảnh báo xuất HĐ (per-card + nút global mọi AR), lưu localStorage, mặc định thu gọn; kèm fix căn lề cột Số tiền.

**Architecture:** 1 hook cô lập `useNoticeCardCollapse` giữ `{defaultCollapsed, overrides}` + persist localStorage với 9 guardrail. `ActivationDetailDrawer` gọi hook, truyền `isCollapsed`/`toggle` cho từng card; nút global ở footer gọi `collapseAll`/`expandAll`. Card render header bấm được + `<ul>` chi tiết chỉ hiện khi mở.

**Tech Stack:** React 19 + TypeScript, Vitest + @testing-library/react (`renderHook`/`act`), CSS thuần.

**Spec:** `docs/superpowers/specs/2026-07-18-notice-card-collapse-design.md`

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `frontend/src/hooks/useNoticeCardCollapse.ts` (MỚI) | Toàn bộ state + localStorage + guardrail. Interface: `isCollapsed/toggle/collapseAll/expandAll/allCollapsed`. |
| `frontend/src/hooks/useNoticeCardCollapse.test.ts` (MỚI) | 13 test — logic lõi + guardrail G1/G2/G4/G5/G6/G7. |
| `frontend/src/components/ActivationTab.tsx` (SỬA) | Import + gọi hook; card render thu gọn/mở; nút global. |
| `frontend/src/styles/prototype-payments.css` (SỬA) | `.amt-input` căn phải (fix căn lề). |
| `MODULES.md` (SỬA) | Ghi file hook mới. |

---

## Task 1: Hook `useNoticeCardCollapse` + unit tests (TDD)

**Files:**
- Create: `frontend/src/hooks/useNoticeCardCollapse.ts`
- Test: `frontend/src/hooks/useNoticeCardCollapse.test.ts`

- [ ] **Step 1: Viết test thất bại**

Tạo `frontend/src/hooks/useNoticeCardCollapse.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNoticeCardCollapse } from "./useNoticeCardCollapse";

const KEY = "activation.noticeCards.v1";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useNoticeCardCollapse", () => {
  it("1. mặc định: mọi card thu gọn, allCollapsed=true", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
    expect(result.current.allCollapsed).toBe(true);
  });

  it("2. toggle 1 card → card đó mở, card khác vẫn thu gọn", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
    expect(result.current.isCollapsed("AR-1::CC-2")).toBe(true);
  });

  it("3. toggle lần 2 về default → override bị xóa", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    act(() => result.current.toggle("AR-1::CC-1"));
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
  });

  it("4. expandAll → defaultCollapsed=false, mọi card mở", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.expandAll());
    expect(result.current.allCollapsed).toBe(false);
    expect(result.current.isCollapsed("AR-9::CC-9")).toBe(false);
  });

  it("5. có overrides sẵn + expandAll → mọi card mở, overrides={}", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::CC-1"));
    act(() => result.current.expandAll());
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
  });

  it("6. persist: mount hook mới đọc lại localStorage", () => {
    const first = renderHook(() => useNoticeCardCollapse());
    act(() => first.result.current.toggle("AR-1::CC-1"));
    const second = renderHook(() => useNoticeCardCollapse());
    expect(second.result.current.isCollapsed("AR-1::CC-1")).toBe(false);
  });

  it("7. G1: setItem ném lỗi → không throw, state đổi in-memory", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(() => act(() => result.current.toggle("AR-1::CC-1"))).not.toThrow();
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(false);
  });

  it("8. G2: JSON hỏng → về default", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
    expect(result.current.isCollapsed("x")).toBe(true);
  });

  it("8b. G2: sai kiểu field → về default an toàn", () => {
    localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: "yes", overrides: 5 }));
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
  });

  it("9. G4: hai toggle liên tiếp trong 1 act → về đầu, override sạch", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => {
      result.current.toggle("AR-1::CC-1");
      result.current.toggle("AR-1::CC-1");
    });
    expect(result.current.isCollapsed("AR-1::CC-1")).toBe(true);
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    expect(saved.overrides).toEqual({});
  });

  it("10. G5: 2 cardKey độc lập", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    act(() => result.current.toggle("AR-1::idx0"));
    expect(result.current.isCollapsed("AR-1::idx0")).toBe(false);
    expect(result.current.isCollapsed("AR-1::idx1")).toBe(true);
  });

  it("11. G6: >300 override key → reset về {}", () => {
    const overrides: Record<string, boolean> = {};
    for (let i = 0; i < 301; i++) overrides[`AR::${i}`] = false;
    localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: true, overrides }));
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.isCollapsed("AR::0")).toBe(true);
  });

  it("12. G7: StorageEvent từ tab khác → state cập nhật", () => {
    const { result } = renderHook(() => useNoticeCardCollapse());
    expect(result.current.allCollapsed).toBe(true);
    act(() => {
      localStorage.setItem(KEY, JSON.stringify({ defaultCollapsed: false, overrides: {} }));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current.allCollapsed).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test để chắc nó FAIL**

Run: `cd frontend && npm run test -- --run useNoticeCardCollapse`
Expected: FAIL — "Failed to resolve import './useNoticeCardCollapse'" (chưa có hook).

- [ ] **Step 3: Viết hook tối thiểu cho pass**

Tạo `frontend/src/hooks/useNoticeCardCollapse.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "activation.noticeCards.v1";
const MAX_OVERRIDES = 300; // G6: chống rò rỉ key rác của gói đã invoiced/xóa

export type NoticeCollapseState = {
  defaultCollapsed: boolean;
  overrides: Record<string, boolean>;
};

const DEFAULT_STATE: NoticeCollapseState = { defaultCollapsed: true, overrides: {} };

function hasWindow(): boolean {
  return typeof window !== "undefined"; // G3
}

/** G2 + G6: validate shape, ép kiểu, soft-cap overrides. */
function sanitize(raw: unknown): NoticeCollapseState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE, overrides: {} };
  const obj = raw as Record<string, unknown>;
  const defaultCollapsed = typeof obj.defaultCollapsed === "boolean" ? obj.defaultCollapsed : true;
  let overrides: Record<string, boolean> = {};
  if (obj.overrides && typeof obj.overrides === "object") {
    for (const [k, v] of Object.entries(obj.overrides as Record<string, unknown>)) {
      if (typeof v === "boolean") overrides[k] = v;
    }
  }
  if (Object.keys(overrides).length > MAX_OVERRIDES) overrides = {};
  return { defaultCollapsed, overrides };
}

function readState(): NoticeCollapseState {
  if (!hasWindow()) return { ...DEFAULT_STATE, overrides: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, overrides: {} };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE, overrides: {} }; // G1/G2
  }
}

function writeState(state: NoticeCollapseState): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* G1: localStorage không dùng được — state sống in-memory */
  }
}

export type UseNoticeCardCollapse = {
  isCollapsed: (cardKey: string) => boolean;
  toggle: (cardKey: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  allCollapsed: boolean;
};

export function useNoticeCardCollapse(): UseNoticeCardCollapse {
  const [state, setState] = useState<NoticeCollapseState>(readState);

  // Persist mỗi khi state đổi (write có guard G1).
  useEffect(() => {
    writeState(state);
  }, [state]);

  // G7: đồng bộ đa tab.
  useEffect(() => {
    if (!hasWindow()) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setState(readState());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isCollapsed = useCallback(
    (cardKey: string) => state.overrides[cardKey] ?? state.defaultCollapsed,
    [state]
  );

  // G4: luôn dùng functional updater.
  const toggle = useCallback((cardKey: string) => {
    setState((prev) => {
      const current = prev.overrides[cardKey] ?? prev.defaultCollapsed;
      const next = !current;
      const overrides = { ...prev.overrides };
      if (next === prev.defaultCollapsed) {
        delete overrides[cardKey]; // trùng default → dọn
      } else {
        overrides[cardKey] = next;
      }
      return { ...prev, overrides };
    });
  }, []);

  const collapseAll = useCallback(() => {
    setState({ defaultCollapsed: true, overrides: {} });
  }, []);

  const expandAll = useCallback(() => {
    setState({ defaultCollapsed: false, overrides: {} });
  }, []);

  return { isCollapsed, toggle, collapseAll, expandAll, allCollapsed: state.defaultCollapsed };
}
```

- [ ] **Step 4: Chạy test để chắc PASS**

Run: `cd frontend && npm run test -- --run useNoticeCardCollapse`
Expected: PASS — 13 passed.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: "No errors found".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useNoticeCardCollapse.ts frontend/src/hooks/useNoticeCardCollapse.test.ts
git commit -m "feat(activation): hook useNoticeCardCollapse (persist localStorage + 9 guardrail)"
```

---

## Task 2: Fix căn lề cột Số tiền (CSS)

**Files:**
- Modify: `frontend/src/styles/prototype-payments.css` (khối `.course-row .amt-input`, ~dòng 1383)

- [ ] **Step 1: Thêm `text-align: right` cho ô Số tiền**

Tìm khối:
```css
.gmv-prototype .course-row .amt-input,
.gmv-prototype .course-row .order-input {
  border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 10px; font: inherit; font-size: 13px;
  outline: none; background: white; width: 100%;
}
```
Tách `.amt-input` ra để căn phải (header "Số tiền" đã căn phải → giá trị theo cùng, chuẩn cột số). Thay bằng:
```css
.gmv-prototype .course-row .amt-input,
.gmv-prototype .course-row .order-input {
  border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 10px; font: inherit; font-size: 13px;
  outline: none; background: white; width: 100%;
}
/* Cột Số tiền: giá trị căn phải cho khớp header căn phải (chuẩn cột số). */
.gmv-prototype .course-row .amt-input { text-align: right; }
```

- [ ] **Step 2: Type-check (không đổi TS, chỉ để chắc build sạch)**

Run: `cd frontend && npx tsc -b`
Expected: "No errors found".

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/prototype-payments.css
git commit -m "fix(activation): căn phải giá trị cột Số tiền cho khớp header"
```

---

## Task 3: Gắn hook + card thu gọn/mở (per-card)

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx`
  - Import hook (cạnh dòng 23 `import { Icons } from "./payment-request/Icons";`)
  - Gọi hook trong `ActivationDetailDrawer` (cạnh `const [copiedArId, setCopiedArId] = useState(false);`, ~dòng 439)
  - Sửa block render card (dòng 1470–1489)

- [ ] **Step 1: Thêm import hook**

Sau dòng `import { Icons } from "./payment-request/Icons";` (dòng 23) thêm:
```ts
import { useNoticeCardCollapse } from "../hooks/useNoticeCardCollapse";
```

- [ ] **Step 2: Gọi hook trong ActivationDetailDrawer**

Tìm `const [copiedArId, setCopiedArId] = useState(false);` (~dòng 439), thêm ngay dưới:
```ts
  const notice = useNoticeCardCollapse();
```

- [ ] **Step 3: Sửa block render card thành thu gọn/mở**

Thay nguyên khối `return ( ... );` hiện tại (dòng 1470–1489):
```tsx
                  return (
                    <div
                      style={{
                        margin: "6px 12px 2px",
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: hasHard ? "var(--warning-bg, #fffbeb)" : "var(--info-bg, #eff6ff)",
                        border: `1px solid ${hasHard ? "var(--warning-border, #fde68a)" : "var(--info-border, #bfdbfe)"}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: textColor, marginBottom: 4 }}>
                        <Icons.AlertCircle size={13} /> {hasHard ? "Chưa xuất được hoá đơn — còn thiếu:" : "Lưu ý:"}
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
                        {sorted.map((b) => (
                          <li key={b.key}>{b.text}</li>
                        ))}
                      </ul>
                    </div>
                  );
```
bằng:
```tsx
                  // G5: courseCode rỗng (gói mới chưa lưu) → dùng index để không trùng key.
                  const cardKey = course.courseCode
                    ? `${ar.id}::${course.courseCode}`
                    : `${ar.id}::idx${courseIdx}`;
                  const collapsed = notice.isCollapsed(cardKey);
                  return (
                    <div
                      style={{
                        margin: "6px 12px 2px",
                        padding: "9px 12px",
                        borderRadius: 8,
                        background: hasHard ? "var(--warning-bg, #fffbeb)" : "var(--info-bg, #eff6ff)",
                        border: `1px solid ${hasHard ? "var(--warning-border, #fde68a)" : "var(--info-border, #bfdbfe)"}`,
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={!collapsed}
                        onClick={() => notice.toggle(cardKey)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            notice.toggle(cardKey);
                          }
                        }}
                        title={collapsed ? "Bấm để xem chi tiết" : "Bấm để thu gọn"}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          fontSize: 12.5, fontWeight: 700, color: textColor,
                          marginBottom: collapsed ? 0 : 4,
                          cursor: "pointer", userSelect: "none",
                        }}
                      >
                        <Icons.AlertCircle size={13} />
                        <span style={{ flex: 1 }}>{hasHard ? "Chưa xuất được hoá đơn — còn thiếu:" : "Lưu ý:"}</span>
                        <span
                          style={{
                            display: "inline-flex",
                            transition: "transform 0.15s",
                            transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                          }}
                        >
                          <Icons.ChevronDown size={14} />
                        </span>
                      </div>
                      {!collapsed && (
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: textColor, lineHeight: 1.5 }}>
                          {sorted.map((b) => (
                            <li key={b.key}>{b.text}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: "No errors found". (Nếu báo `courseIdx` không tồn tại → xác nhận map là `uidObj.courses.map((course, courseIdx) => ...`; `courseIdx` đã có sẵn.)

- [ ] **Step 5: Chạy unit test cũ để chắc không vỡ**

Run: `cd frontend && npm run test -- --run ActivationTab`
Expected: PASS (các test invoiceBlockers vẫn xanh).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ActivationTab.tsx
git commit -m "feat(activation): card cảnh báo thu gọn/mở per-card (chevron + header bấm)"
```

---

## Task 4: Nút global "Thu gọn/Mở tất cả" (footer drawer)

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx` (footer, khu nút Copy AR-ID ~dòng 1730–1735)

- [ ] **Step 1: Thêm nút global cạnh Copy AR-ID**

Tìm:
```tsx
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={copyArId}>
              {copiedArId ? <Icons.Check size={13} /> : <Icons.Copy size={13} />}
              {copiedArId ? " Đã copy" : " Copy AR-ID"}
            </button>
          </div>
```
Thay bằng (thêm nút, chỉ hiện khi AR có ≥1 card cảnh báo):
```tsx
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={copyArId}>
              {copiedArId ? <Icons.Check size={13} /> : <Icons.Copy size={13} />}
              {copiedArId ? " Đã copy" : " Copy AR-ID"}
            </button>
            {(() => {
              const hasAnyNotice = (ar?.uids ?? []).some((u) =>
                u.courses.some(
                  (c) => !c.invoiced && !c.invoiceRequestedAt && getInvoiceBlockers(c, pr).length > 0
                )
              );
              if (!hasAnyNotice) return null;
              return (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => (notice.allCollapsed ? notice.expandAll() : notice.collapseAll())}
                  title="Thu gọn/mở tất cả cảnh báo trên mọi gói, mọi AR"
                >
                  <span
                    style={{
                      display: "inline-flex",
                      transform: notice.allCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <Icons.ChevronDown size={13} />
                  </span>
                  {notice.allCollapsed ? " Mở rộng tất cả" : " Thu gọn tất cả"}
                </button>
              );
            })()}
          </div>
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b`
Expected: "No errors found".

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ActivationTab.tsx
git commit -m "feat(activation): nút global thu gọn/mở tất cả card cảnh báo"
```

---

## Task 5: Cập nhật MODULES.md + verify + build

**Files:**
- Modify: `MODULES.md`

- [ ] **Step 1: Ghi file hook mới vào MODULES.md**

Tìm mục module "Kích hoạt" / "Quản lý thanh toán B1–B4" trong `MODULES.md`, thêm dòng file dưới phần FE của module đó:
```
- `frontend/src/hooks/useNoticeCardCollapse.ts` — trạng thái thu gọn/mở card cảnh báo xuất HĐ (persist localStorage)
```
(Nếu MODULES.md không có mục hooks cho module này, thêm file vào danh sách FE của module "Quản lý thanh toán B1–B4".)

- [ ] **Step 2: Full build (Vercel-identical)**

Run: `cd frontend && npm run build`
Expected: exit 0 (chỉ warning chunk-size, bỏ qua).

- [ ] **Step 3: Verify browser (màn hẹp + thao tác)**

Nếu cổng 5173 bị chiếm bởi session khác → `preview_start` sẽ nhảy cổng và preview pane có thể không proxy tới; khi đó verify thủ công bằng `npm run dev` và mô tả cho user. Nếu preview OK:
1. `preview_start {name:"frontend"}`, resize ~760px (giả lập chia đôi).
2. Login `test.user@dev`, mở 1 AR có gói thiếu Order ID/thông tin.
3. Kiểm: card mặc định **thu gọn** (1 dòng + chevron + màu). Bấm header → mở chi tiết, chevron xoay. Bấm lại → thu gọn.
4. Bấm "Thu gọn/Mở tất cả" → mọi card đổi theo. Mở AR khác → theo trạng thái global.
5. Reload trang → trạng thái giữ nguyên (localStorage).
6. Cột Số tiền: header + giá trị cùng căn phải.
7. `read_console_messages` → không lỗi.
Chụp screenshot làm bằng chứng.

- [ ] **Step 4: Commit MODULES.md**

```bash
git add MODULES.md
git commit -m "docs(modules): thêm hook useNoticeCardCollapse"
```

- [ ] **Step 5: (Sau khi user duyệt) Squash + push + sync main + deploy**

Chờ user xác nhận ship. Khi ship (squash không dùng `-i` vì môi trường chặn interactive):
```bash
# Gom các commit Task 1-5 thành 1 (nếu user muốn). Đếm số commit thêm so với origin/main:
#   git log --oneline origin/main..HEAD
# Rồi soft-reset về main và commit lại 1 lần:
git reset --soft origin/main
git commit -m "feat(activation): thu gọn/mở card cảnh báo xuất HĐ + fix căn lề Số tiền"
# — HOẶC bỏ qua squash, giữ nguyên 5 commit.
git push origin sandbox
git checkout main && git merge --ff-only sandbox && git push origin main && git checkout sandbox
```
FE-only → Vercel prod auto-deploy khi push main. Không cần deploy Render.

---

## Ghi chú thực thi

- **TDD nghiêm** ở Task 1 (hook là ground truth). Task 2–4 là UI/CSS — verify bằng browser ở Task 5.
- Mỗi task 1 commit; cân nhắc squash lúc ship theo ý user (feedback: gom commit liên quan).
- Không đụng `getInvoiceBlockers` (logic blocker giữ nguyên) — chỉ đổi cách hiển thị.
- `courseIdx` đã có trong `uidObj.courses.map((course, courseIdx) => ...)` — dùng cho cardKey fallback (G5).
