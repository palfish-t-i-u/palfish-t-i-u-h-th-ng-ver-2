# Bandwidth Egress GĐ1.5 — Visibility Gate + GĐ2 Amendment (drawer latency) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cắt egress Render prod (đã vượt 5GB/tháng, 100→700MB/ngày trong 2.5 tuần) bằng cách ngừng refetch khi tab ẩn (GĐ1.5, FE-only); sau đó chạy plan GĐ2 slim-list có sẵn kèm amendment mới về ngân sách latency mở drawer (tiêu chí 5).

**Architecture:** Nguyên nhân egress: realtime event trên `payment_requests`/`payment_lines`/`active_requests` → mọi tab đang mở (kể cả tab ẨN cả ngày) kéo lại nguyên list 500 PR full payload. Debounce 5s+jitter ĐÃ có trong `useRealtimeTable`. GĐ1.5 thêm đúng 1 lớp: **gate theo `document.hidden` tại thời điểm timer nổ — tab ẩn thì ghi nợ, quay lại tab trả nợ đúng 1 lần**. Gate đặt Ở TRONG hook nên phủ cả 8 caller (PaymentFlowContext, DashboardTab, SoDoanhThuTab, ReportBC03Tab, Module6Tab, Module3/4Tab, DoanhThuSaleTab) mà không sửa caller nào. Poll 30s (pendingQr + notifications) chuyển sang hook mới `useVisiblePoll` cùng cơ chế. Payload gầy đi là việc của GĐ2 (plan riêng đã duyệt) — plan này chỉ bổ sung 2 task amendment cho GĐ2 về latency drawer.

**Tech Stack:** React 19 + Vitest (fake timers, mock supabase channel), Playwright e2e, không đụng BE.

**Quan hệ với plan khác:**
- `2026-07-11-pr-list-load-all-gd1.md` — DONE, là nền (single-flight + seq-guard trong `loadData`).
- `2026-07-11-pr-list-slim-lazy-gd2.md` — plan slim list ĐÃ duyệt, **thực thi riêng sau GĐ1.5**. Task 5–6 dưới đây là amendment nối vào GĐ2 (chạy sau GĐ2 Task 7).
- `2026-07-11-pr-scale-gd3-server-driven.md` — pagination/search server, hoãn, không thuộc plan này.

**Đánh giá theo 4+1 tiêu chí:**

| Tiêu chí | GĐ1.5 (Task 1–4) | Amendment GĐ2 (Task 5–7) |
|---|---|---|
| 1. Triệt để | Chặn nguồn egress lớn nhất (tab ẩn refetch vô ích); payload phình theo PR count thì GĐ2 xử | GĐ2 chốt payload; amendment chốt luôn UX-cost của lazy-load |
| 2. Không lỗi con | Chỉ TRÌ HOÃN fetch, không đổi data path; nợ luôn được trả khi tab visible; `useRefetchOnFocus` giữ nguyên làm lưới đỡ | Test instant-open chống bug "0 lần thanh toán" giả khi đang hydrate; seq-guard đã có trong GĐ2 |
| 3. Không tăng gánh hạ tầng | Giảm tải BE + DB (ít request hơn); zero infra mới | E2e latency chạy trong suite sẵn có |
| 4. Token frugal | 1 session, không fan-out; plan tái dùng GĐ2 thay vì viết lại 86KB | Amendment 2 task, không duplicate GĐ2 |
| 5. Latency drawer (mới) | Không đổi gì về drawer | Ngân sách cứng: header hiện NGAY (0ms, từ slim row), chi tiết đầy đủ < 2.5s e2e — đo tự động |

**Guardrails (đọc trước khi code):**
1. **Gate cái FETCH, không gate SUBSCRIPTION.** Websocket realtime vẫn subscribe khi tab ẩn — unsubscribe/rejoin là class bug mới (miss event sau rejoin), phí message Supabase không phải hóa đơn đang cháy (hóa đơn là egress Render).
2. Check `document.hidden` tại **thời điểm timer debounce nổ**, không phải lúc event đến — event đến lúc visible nhưng user ẩn tab trong 5s debounce vẫn phải ghi nợ.
3. Trả nợ qua `debouncedChange()` (5–8s sau khi visible), KHÔNG gọi thẳng `onChange()` — để gộp với `useRefetchOnFocus` (nổ ngay khi quay lại sau ≥30s ẩn) qua single-flight của `loadData`, tránh double-fetch sát nhau.
4. KHÔNG gate: initial load, mutation-driven refetch, `useRefetchOnFocus`. Chỉ gate realtime-refetch + interval poll.
5. Không đổi hằng debounce hiện có (5s + jitter 3s).
6. Sandbox soak trước, merge main sau — theo quy trình chuẩn repo.

---

## Phase A — GĐ1.5: Visibility gate (FE-only, ship trước)

### Task 1: `useRealtimeTable` — gate theo visibility

**Files:**
- Modify: `frontend/src/hooks/useRealtimeTable.ts`
- Test (create): `frontend/src/hooks/useRealtimeTable.test.ts`

- [ ] **Step 1: Viết test fail**

Tạo `frontend/src/hooks/useRealtimeTable.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock supabase: bắt handler postgres_changes để bắn event giả.
const handlers: Array<() => void> = [];
vi.mock("../lib/supabase", () => ({
  supabase: {
    channel: vi.fn(() => {
      const ch: Record<string, unknown> = {};
      ch.on = vi.fn((_t: string, _f: unknown, cb: () => void) => {
        handlers.push(cb);
        return ch;
      });
      ch.subscribe = vi.fn();
      return ch;
    }),
    removeChannel: vi.fn(),
  },
}));

import { useRealtimeTable } from "./useRealtimeTable";

let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function fireOneEvent() {
  // handlers có 3 entry / bảng (INSERT/UPDATE/DELETE) — bắn 1 là đủ mô phỏng 1 thay đổi.
  act(() => {
    handlers[0]();
  });
}

describe("useRealtimeTable visibility gate", () => {
  beforeEach(() => {
    handlers.length = 0;
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tab visible: event → debounce → onChange chạy (hành vi cũ giữ nguyên)", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    fireOneEvent();
    act(() => {
      vi.advanceTimersByTime(9_000); // > DEBOUNCE_MS 5s + JITTER_MS 3s
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tab ẩn: event KHÔNG gây onChange dù chờ lâu", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    fireOneEvent();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("nợ trong lúc ẩn → quay lại tab → trả đúng 1 lần (dù 5 event)", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    for (let i = 0; i < 5; i++) {
      fireOneEvent();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
    }
    expect(onChange).not.toHaveBeenCalled();
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000); // trả nợ qua debounce
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ẩn rồi quay lại mà KHÔNG có event → không refetch thừa", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("event đến lúc visible nhưng user ẩn tab TRƯỚC khi debounce nổ → vẫn ghi nợ", () => {
    const onChange = vi.fn();
    renderHook(() => useRealtimeTable(["payment_requests"], onChange));
    fireOneEvent(); // visible lúc event đến
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    setHidden(true); // ẩn trong cửa sổ debounce
    act(() => {
      vi.advanceTimersByTime(10_000); // timer nổ khi đang ẩn
    });
    expect(onChange).not.toHaveBeenCalled();
    setHidden(false);
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Chạy test, phải FAIL**

```bash
cd frontend && npx vitest run src/hooks/useRealtimeTable.test.ts
```
Expected: FAIL các case gate (case 1 pass — hành vi cũ; case 2/3/5 fail vì chưa có gate).

- [ ] **Step 3: Implement gate**

Sửa `frontend/src/hooks/useRealtimeTable.ts` — thay toàn bộ body `useEffect`:

```ts
  useEffect(() => {
    if (!tablesKey) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    // Tab ẩn → không refetch (đỡ egress); ghi nợ, trả đúng 1 lần khi user quay lại tab.
    let pendingWhileHidden = false;

    function fire() {
      if (document.hidden) {
        pendingWhileHidden = true;
        return;
      }
      onChangeRef.current();
    }

    function debouncedChange() {
      if (timer) clearTimeout(timer);
      const delay = DEBOUNCE_MS + Math.floor(Math.random() * JITTER_MS);
      timer = setTimeout(fire, delay);
    }

    function onVisibilityChange() {
      if (document.hidden || !pendingWhileHidden) return;
      pendingWhileHidden = false;
      // Trả nợ qua debounce (không gọi thẳng) — gộp với useRefetchOnFocus qua single-flight.
      debouncedChange();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    const channelName = `realtime:${tablesKey}`;
    let channel = supabase.channel(channelName);

    for (const table of tablesKey.split(",")) {
      for (const event of eventsKey.split(",") as EventType[]) {
        channel = channel.on(
          "postgres_changes" as never,
          { event, schema: "public", table },
          debouncedChange,
        );
      }
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [tablesKey, eventsKey]);
```

- [ ] **Step 4: Chạy lại test, phải PASS cả 5**

```bash
cd frontend && npx vitest run src/hooks/useRealtimeTable.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useRealtimeTable.ts frontend/src/hooks/useRealtimeTable.test.ts
git commit -m "perf(fe): useRealtimeTable gate theo visibility — tab ẩn ghi nợ, quay lại trả 1 lần"
```

### Task 2: `useVisiblePoll` — interval có gate + 2 call site

**Files:**
- Create: `frontend/src/hooks/useVisiblePoll.ts`
- Test (create): `frontend/src/hooks/useVisiblePoll.test.ts`
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx:228-234` (poll pendingQr)
- Modify: `frontend/src/hooks/useNotifications.ts:95-101` (poll notifications)

- [ ] **Step 1: Viết test fail**

Tạo `frontend/src/hooks/useVisiblePoll.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVisiblePoll } from "./useVisiblePoll";

let hidden = false;

function setHidden(next: boolean) {
  hidden = next;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

describe("useVisiblePoll", () => {
  beforeEach(() => {
    hidden = false;
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("visible: tick chạy theo chu kỳ", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it("tab ẩn: tick bị nuốt, không gọi API", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(300_000); // 10 tick khi ẩn
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("quay lại tab sau khi nuốt tick → chạy bù đúng 1 lần ngay", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(300_000);
    });
    setHidden(false); // catch-up ngay tại visibilitychange
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("ẩn rồi quay lại TRƯỚC tick đầu → không chạy bù", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000));
    setHidden(true);
    act(() => {
      vi.advanceTimersByTime(5_000); // chưa tới tick nào
    });
    setHidden(false);
    expect(cb).not.toHaveBeenCalled();
  });

  it("enabled=false: không đặt interval", () => {
    const cb = vi.fn();
    renderHook(() => useVisiblePoll(cb, 30_000, false));
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(cb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Chạy test, phải FAIL (module chưa tồn tại)**

```bash
cd frontend && npx vitest run src/hooks/useVisiblePoll.test.ts
```
Expected: FAIL "Cannot find module './useVisiblePoll'".

- [ ] **Step 3: Implement hook**

Tạo `frontend/src/hooks/useVisiblePoll.ts`:

```ts
import { useEffect, useRef } from "react";

/**
 * setInterval có gate hiển thị: tab ẩn → nuốt tick (không gọi API, đỡ egress),
 * quay lại tab → nếu có tick bị nuốt thì chạy bù đúng 1 lần ngay.
 * Dùng cho poll định kỳ (pendingQr 30s, notifications 30s).
 */
export function useVisiblePoll(
  callback: () => void,
  intervalMs: number,
  enabled = true,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    let missedWhileHidden = false;

    const id = window.setInterval(() => {
      if (document.hidden) {
        missedWhileHidden = true;
        return;
      }
      cbRef.current();
    }, intervalMs);

    function onVisibilityChange() {
      if (document.hidden || !missedWhileHidden) return;
      missedWhileHidden = false;
      cbRef.current();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
```

- [ ] **Step 4: Chạy test, phải PASS cả 5**

```bash
cd frontend && npx vitest run src/hooks/useVisiblePoll.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Thay call site 1 — PaymentFlowContext pendingQr poll**

Trong `frontend/src/contexts/PaymentFlowContext.tsx`, thêm import:

```ts
import { useVisiblePoll } from "../hooks/useVisiblePoll";
```

Thay block (hiện ở dòng 228–234):

```ts
  useEffect(() => {
    if (!pendingQr) return;
    const timer = window.setInterval(() => {
      void loadData({ silent: true });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [pendingQr, loadData]);
```

bằng:

```ts
  useVisiblePoll(
    () => {
      void loadData({ silent: true });
    },
    POLL_MS,
    pendingQr,
  );
```

- [ ] **Step 6: Thay call site 2 — useNotifications poll**

Trong `frontend/src/hooks/useNotifications.ts`, thêm import:

```ts
import { useVisiblePoll } from "./useVisiblePoll";
```

Thay block (hiện ở dòng 95–101):

```ts
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);
```

bằng (initial load GIỮ NGUYÊN không gate — guardrail 4):

```ts
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useVisiblePoll(() => {
    void refresh();
  }, POLL_INTERVAL_MS);
```

- [ ] **Step 7: Full check**

```bash
cd frontend && npx tsc -b && npm run test
```
Expected: tsc sạch, toàn bộ unit pass (kể cả test pendingQr/notifications sẵn có).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useVisiblePoll.ts frontend/src/hooks/useVisiblePoll.test.ts frontend/src/contexts/PaymentFlowContext.tsx frontend/src/hooks/useNotifications.ts
git commit -m "perf(fe): poll pendingQr + notifications qua useVisiblePoll — tab ẩn không gọi API"
```

### Task 3: Regression e2e + deploy sandbox

**Files:** không sửa code — chạy kiểm chứng.

- [ ] **Step 1: E2e smoke các flow đụng refetch**

```bash
cd frontend && npx playwright test e2e/qr-capture.spec.ts e2e/reconciliation-flow.spec.ts e2e/dashboard-sales.spec.ts
```
Expected: pass. QR flow là vùng nhạy (memory `bug_qr_cross_pr_lan_anh_26_6`) — phải xanh trước khi đi tiếp.

- [ ] **Step 2: Push sandbox, smoke tay 2 tab**

```bash
git push origin sandbox
```
Smoke trên https://palfish-gmv-manager-sandbox.vercel.app/: mở 2 tab browser cùng user; tab A tạo/sửa 1 PR; tab B đang ẨN → mở DevTools Network tab B xác nhận KHÔNG có request `payment-requests` khi ẩn; focus tab B → thấy 1 request trả nợ + data mới hiện đúng.

- [ ] **Step 3: Ghi nhận baseline egress**

Ghi lại số Render metrics `bandwidth_usage` prod ngày hiện tại (~700MB/ngày) vào PR description để so sau deploy 7 ngày.

### Task 4: Merge main + theo dõi

- [ ] **Step 1: Soak sandbox ≥1 ngày làm việc** (giờ hành chính có người dùng thật CRM extension).
- [ ] **Step 2: Merge main** theo quy trình chuẩn (squash các commit Task 1–2 thành 1 nếu gọn hơn — theo preference squash).
- [ ] **Step 3: Guardrail số liệu:** sau 7 ngày, kéo `bandwidth_usage` prod. **Đạt: < 250MB/ngày trung bình tuần** (từ ~700). Không đạt → egress còn nguồn khác → điều tra lại log trước khi làm tiếp GĐ2, không đoán.

---

## Phase B — GĐ2 + Amendment tiêu chí 5 (latency drawer)

**Thực thi `docs/superpowers/plans/2026-07-11-pr-list-slim-lazy-gd2.md` nguyên trạng** (17 task, đã duyệt). Hai task dưới đây NỐI THÊM vào GĐ2, chạy **sau GĐ2 Task 7** (FE hydrate drawer). Không sửa nội dung GĐ2.

### Task 5 (Amendment A): Drawer instant-open — header hiện ngay, không hiện "0 lần thanh toán" giả

Chốt hợp đồng UX cho tiêu chí 5 ở mức unit: mở drawer từ row slim → phần header (tên KH, tổng tiền, trạng thái — có sẵn trong slim row) hiện NGAY 0ms; phần lần-thanh-toán hiện trạng thái "Đang tải chi tiết…" (data-testid `pr-drawer-detail-loading`) chứ KHÔNG BAO GIỜ hiện count/list rỗng như thể PR chưa có lần thanh toán nào — đó là lỗi con nguy hiểm nhất của lazy-load trong app đối soát.

**Files:**
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx` (thêm prop `detailLoading: boolean` + block loading, thêm `data-testid="pr-drawer-payments"` vào section lần thanh toán)
- Modify: `frontend/src/components/PaymentRequestsTab.tsx` (truyền `detailLoading` từ state hydrate của GĐ2 Task 7)
- Test (create): `frontend/src/components/payment-request/PaymentRequestDetailDrawer.lazyload.test.tsx`

- [ ] **Step 1: Viết test fail**

Tạo `frontend/src/components/payment-request/PaymentRequestDetailDrawer.lazyload.test.tsx` (harness render theo mẫu `PaymentRequestDetailDrawer.billguard.test.tsx` sẵn có — copy setup props mặc định từ đó, chỉ đổi phần assert):

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
// Import + default props: LẤY THEO billguard.test.tsx hiện có trong cùng thư mục.
// Hai case dưới là hợp đồng hành vi, không phụ thuộc chi tiết markup:

describe("drawer lazy-load (GĐ2 amendment — tiêu chí 5)", () => {
  it("detailLoading=true: header hiện ngay, section payments hiện 'Đang tải chi tiết', KHÔNG hiện count 0", () => {
    // render drawer với PR slim (payments: [], format slim) + detailLoading={true}
    // theo harness billguard
    expect(screen.getByText(/Nguyễn Văn Test/)).toBeInTheDocument(); // header tức thời
    expect(screen.getByTestId("pr-drawer-detail-loading")).toBeInTheDocument();
    expect(screen.queryByText(/0\s*\/\s*0/)).not.toBeInTheDocument(); // không count giả
  });

  it("detailLoading=false + payments đã hydrate: section payments render đủ line", () => {
    // render drawer với PR full (2 payment lines) + detailLoading={false}
    expect(screen.queryByTestId("pr-drawer-detail-loading")).not.toBeInTheDocument();
    expect(screen.getByTestId("pr-drawer-payments")).toBeInTheDocument();
  });
});
```

(Executor: điền phần render bằng đúng harness billguard — file đó đã có mock props đầy đủ của drawer; giữ nguyên 3 assert mỗi case.)

- [ ] **Step 2: Chạy fail** — `npx vitest run src/components/payment-request/PaymentRequestDetailDrawer.lazyload.test.tsx` → FAIL (chưa có prop/testid).

- [ ] **Step 3: Implement** — thêm prop `detailLoading` vào drawer; đầu section lần thanh toán:

```tsx
{detailLoading ? (
  <div data-testid="pr-drawer-detail-loading" className="text-sm text-text-3 py-4 text-center">
    Đang tải chi tiết lần thanh toán…
  </div>
) : (
  <div data-testid="pr-drawer-payments">
    {/* markup section payments hiện có, giữ nguyên */}
  </div>
)}
```

`PaymentRequestsTab.tsx`: `detailLoading = selected có format slim && hydrate đang in-flight` (state hydrate do GĐ2 Task 7 tạo — cùng seq-guard).

- [ ] **Step 4: Pass + full test** — `npx tsc -b && npm run test`.

- [ ] **Step 5: Commit** — `git commit -m "feat(fe): drawer detailLoading — header instant, khong count 0 gia khi hydrate (GD2 amendment)"`

### Task 6 (Amendment B): E2e ngân sách latency drawer — đo tự động

**Files:**
- Create: `frontend/e2e/pr-drawer-latency.spec.ts`
- Modify (nếu row chưa có testid): `frontend/src/components/payment-request/PaymentRequestTable.tsx` — thêm `data-testid="pr-row"` vào element row click-mở-drawer.

- [ ] **Step 1: Viết spec**

```ts
import { expect, test } from "@playwright/test";

// Tiêu chí 5: bấm PR → chi tiết ĐẦY ĐỦ (hết skeleton) dưới 2.5s.
// Header phải hiện ngay (slim row có sẵn data) — đo riêng < 500ms.
const FULL_DETAIL_BUDGET_MS = 2_500;
const HEADER_BUDGET_MS = 500;

test("drawer PR: header tức thời, chi tiết đầy đủ trong ngân sách", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Quản lý thanh toán/i }).click();
  const firstRow = page.getByTestId("pr-row").first();
  await firstRow.waitFor();

  const t0 = Date.now();
  await firstRow.click();

  // Header: drawer mở + có nội dung ngay (không chờ network)
  await expect(page.getByTestId("pr-drawer-payments").or(page.getByTestId("pr-drawer-detail-loading"))).toBeVisible();
  const tHeader = Date.now() - t0;

  // Chi tiết đầy đủ: skeleton biến mất, section payments render
  await expect(page.getByTestId("pr-drawer-detail-loading")).toHaveCount(0, { timeout: FULL_DETAIL_BUDGET_MS });
  await expect(page.getByTestId("pr-drawer-payments")).toBeVisible();
  const tFull = Date.now() - t0;

  console.log(`[latency] drawer header=${tHeader}ms, full=${tFull}ms`);
  expect(tHeader).toBeLessThan(HEADER_BUDGET_MS);
  expect(tFull).toBeLessThan(FULL_DETAIL_BUDGET_MS);
});
```

- [ ] **Step 2: Chạy trước GĐ2 FE-slim bật (baseline)** — `npx playwright test e2e/pr-drawer-latency.spec.ts`. Khi list còn full payload, drawer không có skeleton → case pass trivially (header=full). Ghi số baseline vào output.

- [ ] **Step 3: Chạy sau GĐ2 bật slim** — phải pass cả 2 budget. Fail full-budget → nghi ngờ endpoint detail chậm (check index theo GĐ2 Task 2) hoặc hydrate không chạy song song với animation mở drawer.

- [ ] **Step 4: Commit** — `git commit -m "test(e2e): ngan sach latency drawer PR — header <500ms, full <2.5s"`

### Task 7: Guardrail vận hành sau GĐ2

- [ ] **Step 1:** Sau GĐ2 prod 7 ngày: kéo `bandwidth_usage` — kỳ vọng < 100MB/ngày trung bình (slim ~5× nhẹ hơn trên phần refetch còn lại).
- [ ] **Step 2:** Chạy `extract-approach` skill — ghi learnings: "egress = payload × tần suất × số tab; gate visibility trước, slim payload sau".
- [ ] **Step 3:** Cập nhật memory `bug-pr-list-cap-100` → trạng thái mới (GĐ2/GĐ3 thay thế).

---

## Self-review đã chạy

- Spec coverage: nguồn egress (realtime refetch tab ẩn, poll pendingQr, poll notifications) → Task 1/2; payload phình → GĐ2 (tái dùng); tiêu chí 5 → Task 5/6; guardrail số liệu → Task 3.3/4.3/7.
- Type consistency: `useVisiblePoll(callback, intervalMs, enabled)` khớp cả 2 call site; testid `pr-drawer-detail-loading`/`pr-drawer-payments`/`pr-row` dùng thống nhất Task 5↔6.
- Placeholder: Task 5 Step 1 phần render ủy quyền harness billguard có sẵn (file cùng thư mục, mock props đầy đủ) — chủ đích, không phải TBD; assert đã chốt cứng.
- Điểm tự thú: Task 5/6 phụ thuộc tên state hydrate của GĐ2 Task 7 — hợp đồng hành vi đã khóa, tên biến theo code GĐ2 khi chạy.
