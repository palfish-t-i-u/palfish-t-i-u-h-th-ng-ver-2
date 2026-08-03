# Activation flat per-course list Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the B3 "Kích hoạt khóa học" desktop list from one row per Active Request (AR) into one row per course-activation (UID + course), with inline Copy-UID and inline Order ID entry, whole-AR pagination, and course-level tab counts.

**Architecture:** All new list-shaping logic goes into one pure, unit-tested helper module (`activation/activationFlatList.ts`). `ActivationTab.tsx` consumes those helpers to build a course-row pipeline (AR filter → flatten → tab/search filter → group by AR → paginate whole AR groups) and renders a 9-column desktop table. Inline Order ID saves reuse the existing `persistActiveRequest` (same PATCH, same 409 modal, same ledger write) — no backend or migration changes. Mobile cards and the AR detail drawer are untouched.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind; Vitest for the pure helpers.

---

## Constraints (do not violate)

- **FE-only.** No backend edit, no DB migration. Inline save reuses `persistActiveRequest` (existing PATCH `active-requests/{id}` + 409 handling + `notifyLedgerChanged`). The FE never sets `orderIdSetBy`/`orderIdSetAt` — the backend owns that attribution.
- **Scope = desktop table only.** `ActivationRowCards` (mobile) and the AR detail drawer stay AR-level and unchanged. Course Code stays hidden on the flat list and remains visible inside the drawer.
- **`noUnusedLocals` is ON** (`frontend/tsconfig.app.json:19`, `tsconfig.node.json:18`). Consequence baked into this plan: **all `ActivationTab.tsx` edits are ONE task with a single `tsc -b` at the end.** Do NOT type-check after a partial edit — a memo/handler defined but not yet wired reads as an unused local and fails the build. That is expected mid-task, not an error to "fix".
- **Single commit to `main`.** Two working commits during dev (helpers, then ActivationTab), squashed into ONE before cherry-pick to `main` (Task 3). Matches the "squash related commits" preference.
- **4 delivery criteria.** Every change must be (1) thorough, (2) not break the child-course flow, (3) not add infra load / reduce performance, (4) frugal with tokens — stay surgical, no mass subagent fan-out.
- **Type-check with `tsc -b`, never `--noEmit`** (Vercel runs `tsc -b`).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `frontend/src/components/activation/activationFlatList.ts` | Pure list-shaping helpers + `CourseRow`/`CourseRowGroup` types + `AR_PER_PAGE`. No React, no I/O. | **Create** |
| `frontend/src/components/activation/activationFlatList.test.ts` | Vitest coverage for every helper. | **Create** |
| `frontend/src/components/ActivationTab.tsx` | Wire the course pipeline + inline-save state/handlers; render 9-column grouped desktop table with Copy-UID, inline Order ID (readonly + pencil), tint, reminder, pagination footer; course-level tab counts; relabel KPI cards; extend search placeholder. | **Modify (one task)** |

Helpers reused verbatim (do not reimplement): `enrichActiveRequest`, `vnd` (`payment-flow/paymentFlowUtils.ts`); `getReferralStatus`, `ReferralStatus`, `paginate`, `pageItems`, `getArReferralStatus`, `formatPaymentDateTime` (`payment-request/paymentRequestUtils.ts`); `normVi` (`lib/textUtils.ts`); `Icons` (`payment-request/Icons.tsx`); `inDateRange` (`payment-request/DateRangeFilter.tsx`).

---

## Task 1: Pure list-shaping helpers

**Files:**
- Create: `frontend/src/components/activation/activationFlatList.ts`
- Test: `frontend/src/components/activation/activationFlatList.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/activation/activationFlatList.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ActiveRequest, ActiveCourse } from "../../types/paymentRequest";
import {
  AR_PER_PAGE,
  applyCourseOrderId,
  countCourseTabs,
  courseRowMatchesSearch,
  courseRowMatchesTab,
  flatCourseRows,
  groupRowsByAr,
} from "./activationFlatList";
import { normVi } from "../../lib/textUtils";

function course(over: Partial<ActiveCourse> = {}): ActiveCourse {
  return { courseCode: "CC-0001-001", packageName: "Gói 24 buổi", amount: 1_000_000, orderId: "", invoiced: false, ...over };
}

function ar(over: Partial<ActiveRequest> = {}): ActiveRequest {
  return {
    id: "AR-0001",
    prId: "PR-2026-0001",
    customerName: "Nguyễn Văn A",
    createdAt: "2026-07-30T10:00:00Z",
    createdBy: "ops@example.com",
    uids: [{ uid: "U1", phone: "0900000000", country: "VN", courses: [course()] }],
    ...over,
  };
}

/** AR nửa vời: 1 khoá đã có Order ID, 1 khoá chưa. */
const halfFilled = ar({
  id: "AR-2",
  prId: "PR-2",
  uids: [
    {
      uid: "U2",
      phone: "0",
      country: "VN",
      courses: [
        course({ courseCode: "CC-2-001", orderId: "OID-1" }),
        course({ courseCode: "CC-2-002", orderId: "" }),
      ],
    },
  ],
});

describe("flatCourseRows", () => {
  it("một dòng cho mỗi khoá học của mỗi UID", () => {
    const rows = flatCourseRows([halfFilled]);
    expect(rows).toHaveLength(2);
    expect(rows[0].key).toBe("AR-2::0::0");
    expect(rows[0].activated).toBe(true);
    expect(rows[1].activated).toBe(false);
    expect(rows[0].courseCode).toBe("CC-2-001");
  });

  it("map đúng tên khách, sale, uid, gói, tiền", () => {
    const row = flatCourseRows([ar({ saleName: "Chị Thu" })])[0];
    expect(row.arId).toBe("AR-0001");
    expect(row.prId).toBe("PR-2026-0001");
    expect(row.customerName).toBe("Nguyễn Văn A");
    expect(row.saleName).toBe("Chị Thu");
    expect(row.uid).toBe("U1");
    expect(row.packageName).toBe("Gói 24 buổi");
    expect(row.amount).toBe(1_000_000);
  });

  it("uidName lấy từ tên bé (multi-con); null khi không có", () => {
    const withName = ar({ uids: [{ uid: "U9", name: "Bé Bơ", phone: "0", country: "VN", courses: [course()] }] });
    expect(flatCourseRows([withName])[0].uidName).toBe("Bé Bơ");
    expect(flatCourseRows([ar()])[0].uidName).toBeNull();
  });

  it("referral null khi không phải nguồn giới thiệu; full khi đã cộng đủ", () => {
    expect(flatCourseRows([ar()])[0].referral).toBeNull();
    const ref = ar({
      uids: [
        {
          uid: "U3",
          phone: "0",
          country: "VN",
          courses: [
            course({ courseCode: "CC-3-001", leadSource: "gioi_thieu", bonusSessionsReferee: 2, refereeCreditedAt: "2026-07-30T00:00:00Z" }),
          ],
        },
      ],
    });
    expect(flatCourseRows([ref])[0].referral).toBe("full");
  });

  it("invoiced và holdActivation truyền xuống dòng", () => {
    const inv = ar({ holdActivation: true, holdNote: "chờ khách xác nhận", uids: [{ uid: "U4", phone: "0", country: "VN", courses: [course({ orderId: "X", invoiced: true })] }] });
    const row = flatCourseRows([inv])[0];
    expect(row.invoiced).toBe(true);
    expect(row.holdActivation).toBe(true);
    expect(row.holdNote).toBe("chờ khách xác nhận");
  });
});

describe("courseRowMatchesTab", () => {
  it("tách dòng theo trạng thái từng khoá (AR nửa vời)", () => {
    const [activated, pending] = flatCourseRows([halfFilled]);
    expect(courseRowMatchesTab(activated, "activated")).toBe(true);
    expect(courseRowMatchesTab(activated, "pending_order")).toBe(false);
    expect(courseRowMatchesTab(pending, "pending_order")).toBe(true);
    expect(courseRowMatchesTab(pending, "activated")).toBe(false);
    expect(courseRowMatchesTab(pending, "all")).toBe(true);
  });
});

describe("countCourseTabs", () => {
  it("đếm ở cấp khoá học, tách AR nửa vời", () => {
    expect(countCourseTabs([halfFilled])).toEqual({ all: 2, activated: 1, pending_order: 1 });
  });
});

describe("courseRowMatchesSearch", () => {
  it("bỏ dấu tiếng Việt, khớp nhiều trường", () => {
    const row = flatCourseRows([ar({ customerName: "Đặng Thuý" })])[0];
    expect(courseRowMatchesSearch(row, normVi("dang thuy"))).toBe(true);
    expect(courseRowMatchesSearch(row, normVi("PR-2026"))).toBe(true);
    expect(courseRowMatchesSearch(row, normVi("khong-ton-tai"))).toBe(false);
    expect(courseRowMatchesSearch(row, "")).toBe(true);
  });
});

describe("groupRowsByAr", () => {
  it("gom dòng theo AR, giữ thứ tự xuất hiện", () => {
    const rows = flatCourseRows([ar({ id: "A", prId: "PR-A" }), ar({ id: "B", prId: "PR-B" })]);
    const groups = groupRowsByAr(rows);
    expect(groups.map((g) => g.arId)).toEqual(["A", "B"]);
    expect(groups[0].rows).toHaveLength(1);
  });
});

describe("applyCourseOrderId", () => {
  it("gán Order ID đúng khoá, bất biến (không sửa bản gốc)", () => {
    const base = ar();
    const next = applyCourseOrderId(base, "CC-0001-001", "OID-9");
    expect(next).not.toBe(base);
    expect(next.uids[0].courses[0].orderId).toBe("OID-9");
    expect(base.uids[0].courses[0].orderId).toBe("");
  });
});

describe("AR_PER_PAGE", () => {
  it("là số dương", () => {
    expect(AR_PER_PAGE).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- --run activationFlatList 2>&1 | grep -E "PASS|FAIL|Cannot find"`
Expected: FAIL — `Cannot find module "./activationFlatList"`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/components/activation/activationFlatList.ts`:

```ts
import type { ActiveRequest } from "../../types/paymentRequest";
import { getReferralStatus, type ReferralStatus } from "../payment-request/paymentRequestUtils";
import { normVi } from "../../lib/textUtils";

export type CourseTabId = "pending_order" | "activated" | "all";

/** Số AR tối đa mỗi trang. Phân trang đóng gói NGUYÊN cụm AR — các dòng khoá của
 * một AR không bao giờ bị tách qua hai trang. */
export const AR_PER_PAGE = 12;

/** Một dòng phẳng = một khoá học của một UID trong một AR. */
export interface CourseRow {
  /** `${arId}::${uidIdx}::${courseIdx}` — trùng convention deriveInvoiceRows. */
  key: string;
  arId: string;
  prId: string | null;
  customerName: string;
  saleName: string | null;
  createdAt: string;
  uid: string;
  /** Tên bé (multi-con). null nếu block UID không có tên riêng. */
  uidName: string | null;
  /** Ẩn trên list phẳng; chỉ dùng làm target khi lưu Order ID. */
  courseCode: string;
  packageName: string;
  amount: number;
  orderId: string;
  /** Đã có Order ID (đã trim). */
  activated: boolean;
  invoiced: boolean;
  /** Trạng thái thưởng giới thiệu của riêng khoá này; null nếu khoá không có thưởng. */
  referral: ReferralStatus | null;
  holdActivation: boolean;
  holdNote: string | null;
}

export interface CourseRowGroup {
  arId: string;
  rows: CourseRow[];
}

function courseReferral(c: {
  leadSource?: string;
  bonusSessionsReferee?: number;
  bonusSessionsReferrer?: number;
  refereeCreditedAt?: string | null;
  referrerCreditedAt?: string | null;
}): ReferralStatus | null {
  const hasBonus = (c.bonusSessionsReferee ?? 0) > 0 || (c.bonusSessionsReferrer ?? 0) > 0;
  if (c.leadSource !== "gioi_thieu" || !hasBonus) return null;
  return getReferralStatus(c);
}

/** Trải AR thành dòng-mỗi-khoá. Giữ nguyên thứ tự AR đầu vào; iterate uids thủ công
 * để lấy được tên bé (flatCourses của paymentFlowUtils bỏ mất u.name). */
export function flatCourseRows(ars: ActiveRequest[]): CourseRow[] {
  const rows: CourseRow[] = [];
  for (const ar of ars) {
    ar.uids.forEach((u, uidIdx) => {
      u.courses.forEach((c, courseIdx) => {
        const orderId = (c.orderId ?? "").trim();
        rows.push({
          key: `${ar.id}::${uidIdx}::${courseIdx}`,
          arId: ar.id,
          prId: ar.prId ?? null,
          customerName: ar.customerName ?? "",
          saleName: ar.saleName ?? null,
          createdAt: ar.createdAt ?? "",
          uid: (u.uid ?? "").trim(),
          uidName: (u.name ?? "").trim() || null,
          courseCode: c.courseCode,
          packageName: c.packageName ?? "",
          amount: c.amount ?? 0,
          orderId,
          activated: orderId !== "",
          invoiced: Boolean(c.invoiced),
          referral: courseReferral(c),
          holdActivation: Boolean(ar.holdActivation),
          holdNote: ar.holdNote ?? null,
        });
      });
    });
  }
  return rows;
}

export function courseRowMatchesTab(row: CourseRow, tab: CourseTabId): boolean {
  if (tab === "all") return true;
  if (tab === "activated") return row.activated;
  return !row.activated; // pending_order
}

/** Đếm ở cấp khoá học (không lọc theo tab/search/date) — dùng cho badge tab. */
export function countCourseTabs(ars: ActiveRequest[]): { all: number; pending_order: number; activated: number } {
  const rows = flatCourseRows(ars);
  let activated = 0;
  for (const r of rows) if (r.activated) activated++;
  return { all: rows.length, activated, pending_order: rows.length - activated };
}

/** nq PHẢI đã normVi sẵn ở caller. So khớp bỏ dấu trên nhiều trường. */
export function courseRowMatchesSearch(row: CourseRow, nq: string): boolean {
  if (!nq) return true;
  const fields = [row.uid, row.packageName, row.customerName, row.uidName ?? "", row.arId, row.prId ?? "", row.orderId];
  return fields.some((v) => normVi(v).includes(nq));
}

/** Gom các dòng theo AR, giữ thứ tự AR xuất hiện lần đầu. */
export function groupRowsByAr(rows: CourseRow[]): CourseRowGroup[] {
  const groups: CourseRowGroup[] = [];
  const index = new Map<string, CourseRowGroup>();
  for (const r of rows) {
    let g = index.get(r.arId);
    if (!g) {
      g = { arId: r.arId, rows: [] };
      index.set(r.arId, g);
      groups.push(g);
    }
    g.rows.push(r);
  }
  return groups;
}

/** Thay đổi bất biến chỉ Order ID của một khoá (match theo courseCode). */
export function applyCourseOrderId(ar: ActiveRequest, courseCode: string, orderId: string): ActiveRequest {
  return {
    ...ar,
    uids: ar.uids.map((u) => ({
      ...u,
      courses: u.courses.map((c) => (c.courseCode === courseCode ? { ...c, orderId } : c)),
    })),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- --run activationFlatList 2>&1 | grep -E "PASS|FAIL|passed|failed"`
Expected: PASS — all cases green.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo "tsc clean"`
Expected: `tsc clean`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/activation/activationFlatList.ts frontend/src/components/activation/activationFlatList.test.ts
git commit -m "feat(activation): pure per-course flat-list helpers"
```

---

## Task 2: All ActivationTab.tsx edits (single atomic task)

**Files:**
- Modify: `frontend/src/components/ActivationTab.tsx`

> Apply Steps 1–9 in order, then type-check ONCE (Step 10) and commit (Step 11). Because `noUnusedLocals` is on, do NOT run `tsc -b` between these steps — the pipeline memos/handlers only become "used" once the table (Step 5) and tabs (Step 6) are wired.

- [ ] **Step 1: Imports + module const**

Edit the React import on **line 1** to add `type CSSProperties` (used by the icon-button style in Step 4).

Old:
```ts
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
```
New:
```ts
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
```

Edit **line 25** — add `pageItems, paginate` to the `paymentRequestUtils` import (keep `getReferralStatus`; the drawer still uses it at :1602).

Old:
```ts
import { activationAuditText, formatPaymentDateFull, formatPaymentDateTime, fromApiActiveRequest, getArReferralStatus, getReferralStatus, REFERRAL_STATUS_HEADER, REFERRAL_STATUS_PANEL_STYLE, toActiveRequestPatchUidsData } from "./payment-request/paymentRequestUtils";
```
New:
```ts
import { activationAuditText, formatPaymentDateFull, formatPaymentDateTime, fromApiActiveRequest, getArReferralStatus, getReferralStatus, pageItems, paginate, REFERRAL_STATUS_HEADER, REFERRAL_STATUS_PANEL_STYLE, toActiveRequestPatchUidsData } from "./payment-request/paymentRequestUtils";
```

Add two import lines + `GROUP_TINTS` const around the existing `import "../styles/prototype-payments.css";` / `type ArTabId` block (lines 30–32).

Old:
```ts
import "../styles/prototype-payments.css";

type ArTabId = "pending_order" | "activated" | "all";
```
New:
```ts
import "../styles/prototype-payments.css";
import { AR_PER_PAGE, applyCourseOrderId, countCourseTabs, courseRowMatchesSearch, courseRowMatchesTab, flatCourseRows, groupRowsByAr, type CourseRow } from "./activation/activationFlatList";
import { normVi } from "../lib/textUtils";

type ArTabId = "pending_order" | "activated" | "all";

/** Vạch màu trái xoay vòng theo cụm AR (không random — ổn định giữa các render). */
const GROUP_TINTS = ["#7c6cff", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];
```

- [ ] **Step 2: Page + inline-save state**

Edit **line 1974** — after the `tab` state, add page + inline-save state and two timer refs.

Old:
```ts
  const [tab, setTab] = useState<ArTabId>("pending_order");
```
New:
```ts
  const [tab, setTab] = useState<ArTabId>("pending_order");
  const [page, setPage] = useState(1);
  const [orderIdDrafts, setOrderIdDrafts] = useState<Record<string, string>>({});
  const [editingKeys, setEditingKeys] = useState<Set<string>>(() => new Set());
  const [savingArIds, setSavingArIds] = useState<Set<string>>(() => new Set());
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const [savedRowKey, setSavedRowKey] = useState<string | null>(null);
  const copyResetRef = useRef<number | null>(null);
  const savedResetRef = useRef<number | null>(null);
```

- [ ] **Step 3: Course pipeline memos + effects**

Edit **line 2049** — immediately after the `filtered` memo's closing line, insert the tab-count + course pipeline memos and the two effects. The `arFiltered` predicate reuses the SAME date/referral/hold logic as `filtered`, minus the AR-level tab and AR-level search (those become course-level).

Old:
```ts
  }, [rows, tab, search, dateRange, referralFilter, holdFilter]);

  const isMobile = useIsMobile();
```
New:
```ts
  }, [rows, tab, search, dateRange, referralFilter, holdFilter]);

  // Badge tab đếm ở cấp khoá học (toàn bộ, không lọc) — khác KPI (cấp AR).
  const tabCounts = useMemo(() => countCourseTabs(rows), [rows]);

  // Pipeline desktop: lọc AR (date/referral/hold) → trải khoá → lọc tab+search cấp khoá.
  const courseVisible = useMemo(() => {
    const nq = normVi(search.trim());
    const arFiltered = rows.filter((a) => {
      if (!inDateRange(a.createdAt, dateRange)) return false;
      if (referralFilter !== "all") {
        const rs = getArReferralStatus(a);
        if (referralFilter === "any") {
          if (rs === null) return false;
        } else if (rs !== referralFilter) {
          return false;
        }
      }
      if (holdFilter !== "all") {
        const isHold = !!a.holdActivation && a.status !== "activated" && a.status !== "invoiced";
        if (holdFilter === "hold" && !isHold) return false;
        if (holdFilter === "now" && isHold) return false;
      }
      return true;
    });
    return flatCourseRows(arFiltered).filter(
      (r) => courseRowMatchesTab(r, tab) && courseRowMatchesSearch(r, nq)
    );
  }, [rows, tab, search, dateRange, referralFilter, holdFilter]);

  const courseGroups = useMemo(() => groupRowsByAr(courseVisible), [courseVisible]);
  const coursePage = useMemo(() => paginate(courseGroups, page, AR_PER_PAGE), [courseGroups, page]);

  // Đổi bộ lọc/tab/tìm kiếm → về trang 1.
  useEffect(() => {
    setPage(1);
  }, [tab, search, dateRange, referralFilter, holdFilter]);

  // Dọn timer feedback khi unmount.
  useEffect(
    () => () => {
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
      if (savedResetRef.current) window.clearTimeout(savedResetRef.current);
    },
    []
  );

  const isMobile = useIsMobile();
```

- [ ] **Step 4: Copy + inline-save handlers + row renderer**

Edit **lines 2087–2089** — between the close of `persistActiveRequest` and `return (`, insert the handlers and renderers.

Old:
```ts
  };

  return (
    <div className="gmv-prototype">
```
New:
```ts
  };

  const copyUid = async (rowKey: string, uid: string) => {
    if (!uid) return;
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = uid;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    };
    let ok: boolean;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(uid);
        ok = true;
      } else {
        ok = fallbackCopy();
      }
    } catch {
      ok = fallbackCopy();
    }
    if (!ok) {
      window.prompt("Không thể tự copy trong trình duyệt này. Copy UID thủ công:", uid);
      return;
    }
    setCopiedRowKey(rowKey);
    if (copyResetRef.current) window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setCopiedRowKey(null), 1400);
  };

  // Lưu Order ID inline. Đọc AR tươi từ activeRequests (không dùng snapshot dòng),
  // khoá theo AR để 2 lần lưu cùng AR không ghi đè full uids_data của nhau.
  const saveOrderIdInline = async (row: CourseRow) => {
    const draft = (orderIdDrafts[row.key] ?? row.orderId).trim();
    if (!draft || draft === row.orderId.trim()) return;
    if (savingArIds.has(row.arId)) return;
    const freshAr = activeRequests.find((a) => a.id === row.arId);
    if (!freshAr) return;
    const next = applyCourseOrderId(freshAr, row.courseCode, draft);
    setSavingArIds((prev) => {
      const s = new Set(prev);
      s.add(row.arId);
      return s;
    });
    const result = await persistActiveRequest(next);
    setSavingArIds((prev) => {
      const s = new Set(prev);
      s.delete(row.arId);
      return s;
    });
    if (result.ok) {
      setOrderIdDrafts((prev) => {
        const n = { ...prev };
        delete n[row.key];
        return n;
      });
      setEditingKeys((prev) => {
        const s = new Set(prev);
        s.delete(row.key);
        return s;
      });
      setSavedRowKey(row.key);
      if (savedResetRef.current) window.clearTimeout(savedResetRef.current);
      savedResetRef.current = window.setTimeout(() => setSavedRowKey(null), 1400);
    }
  };

  const renderReferralChip = (rs: CourseRow["referral"]) => {
    if (rs === null) return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
    const cfg = {
      full: { bg: "var(--success-bg)", color: "var(--success-text)", label: "Đã cộng" },
      partial: { bg: "var(--caution-bg, #fef9c3)", color: "var(--caution-text, #92400e)", label: "1 phần" },
      none: { bg: "var(--danger-bg, #fee2e2)", color: "var(--danger-text, #b91c1c)", label: "Chưa cộng" },
    }[rs];
    return (
      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: cfg.bg, color: cfg.color, fontWeight: 600, whiteSpace: "nowrap" }}>
        {cfg.label}
      </span>
    );
  };

  const renderCourseRow = (row: CourseRow, tint: string) => {
    const rem = row.prId ? reminderByPrId.get(row.prId) : undefined;
    const remTip = rem
      ? `Sales nhắc kích hoạt lúc ${new Date(rem.requested_at).toLocaleDateString("vi-VN")} ${new Date(rem.requested_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — bởi ${rem.requested_by_name}${rem.note ? ` · "${rem.note}"` : ""}`
      : undefined;
    const borderColor = rem ? "#e65100" : tint; // nhắc gấp đè màu cam, không mất tín hiệu cũ
    const draftVal = orderIdDrafts[row.key] ?? row.orderId;
    const isSavingAr = savingArIds.has(row.arId);
    const isEditing = editingKeys.has(row.key);
    const showInput = !row.invoiced && (!row.activated || isEditing);
    const saveEnabled = !readOnly && draftVal.trim() !== "" && draftVal.trim() !== row.orderId.trim() && !isSavingAr;
    const iconBtnStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 24,
      height: 24,
      borderRadius: 6,
      border: "1px solid var(--border, #e5e7eb)",
      background: "var(--canvas, #fff)",
      cursor: "pointer",
      color: "var(--text-2, #555)",
      flex: "0 0 auto",
    };
    return (
      <tr
        key={row.key}
        className={openArId === row.arId ? "selected" : ""}
        onClick={() => setOpenArId(row.arId)}
        title={remTip}
        style={{ borderLeft: `3px solid ${borderColor}` }}
      >
        <td>
          <span className="ar-id-pill">{row.arId}</span>
          <div style={{ marginTop: 3 }}>
            {row.prId ? (
              <span className="pr-id-pill" style={{ fontSize: 11 }}>{row.prId}</span>
            ) : (
              <span style={{ color: "var(--text-3)", fontSize: 11.5 }}>— Standalone —</span>
            )}
          </div>
        </td>
        <td>
          <div className="cell-name">{row.uidName || row.customerName || "—"}</div>
          {(row.saleName || (row.uidName && row.uidName !== row.customerName)) && (
            <div className="cell-sub">
              {row.uidName && row.uidName !== row.customerName ? `KH: ${row.customerName}` : ""}
              {row.uidName && row.uidName !== row.customerName && row.saleName ? " · " : ""}
              {row.saleName ? (
                <>
                  Sale: <strong>{row.saleName}</strong>
                </>
              ) : null}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              type="button"
              title="Copy UID"
              aria-label={`Copy UID ${row.uid}`}
              disabled={!row.uid}
              onClick={(e) => {
                e.stopPropagation();
                copyUid(row.key, row.uid);
              }}
              style={{ ...iconBtnStyle, cursor: row.uid ? "pointer" : "not-allowed", color: copiedRowKey === row.key ? "var(--success-text, #047857)" : "var(--text-2, #555)" }}
            >
              {copiedRowKey === row.key ? <Icons.Check size={14} /> : <Icons.Copy size={14} />}
            </button>
            <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 12.5 }}>{row.uid || "—"}</span>
          </div>
        </td>
        <td>{row.packageName || "—"}</td>
        <td style={{ textAlign: "right" }}>
          <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(row.amount)}</span>
        </td>
        <td onClick={(e) => e.stopPropagation()}>
          {row.invoiced ? (
            <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} title="Đã xuất hoá đơn — không sửa Order ID ở đây">
              {row.orderId || "—"}
            </span>
          ) : showInput ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={draftVal}
                placeholder="Dán Order ID"
                disabled={readOnly || isSavingAr}
                onChange={(e) => setOrderIdDrafts((p) => ({ ...p, [row.key]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveEnabled) saveOrderIdInline(row);
                }}
                style={{ width: 150, height: 30, padding: "0 8px", fontSize: 12.5, fontFamily: "ui-monospace, monospace", border: "1px solid var(--border, #d1d5db)", borderRadius: 6 }}
              />
              <button type="button" className="btn btn-primary" disabled={!saveEnabled} onClick={() => saveOrderIdInline(row)} style={{ height: 30, padding: "0 12px", fontSize: 12.5, whiteSpace: "nowrap" }}>
                {isSavingAr ? "Đang lưu…" : "Lưu"}
              </button>
              {savedRowKey === row.key && <span style={{ fontSize: 11, color: "var(--success-text, #047857)", whiteSpace: "nowrap" }}>Đã lưu ✓</span>}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}>{row.orderId || "—"}</span>
              {!readOnly && (
                <button
                  type="button"
                  title="Sửa Order ID"
                  aria-label={`Sửa Order ID ${row.orderId}`}
                  onClick={() =>
                    setEditingKeys((s) => {
                      const n = new Set(s);
                      n.add(row.key);
                      return n;
                    })
                  }
                  style={iconBtnStyle}
                >
                  <Icons.Pencil size={13} />
                </button>
              )}
              {savedRowKey === row.key && <span style={{ fontSize: 11, color: "var(--success-text, #047857)", whiteSpace: "nowrap" }}>Đã lưu ✓</span>}
            </div>
          )}
        </td>
        <td>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            {row.activated ? (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--success-bg)", color: "var(--success-text)", fontWeight: 600, whiteSpace: "nowrap" }}>✓ Đã kích hoạt</span>
            ) : (
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "var(--warning-bg)", color: "var(--warning-text)", fontWeight: 600, whiteSpace: "nowrap" }}>⏳ Chờ điền</span>
            )}
            {row.holdActivation && !row.activated && (
              <span className="badge badge-warning" style={{ fontSize: 11 }} title={row.holdNote ? `Chưa muốn kích hoạt — "${row.holdNote}"` : "Chưa muốn kích hoạt"}>
                ⏸ Chưa muốn KH
              </span>
            )}
          </div>
        </td>
        <td>{renderReferralChip(row.referral)}</td>
        <td>
          {(() => {
            const ts = formatPaymentDateTime(row.createdAt);
            return (
              <>
                <div className="cell-time">{ts.date}</div>
                {ts.time ? <div className="time-relative">{ts.time}</div> : null}
              </>
            );
          })()}
        </td>
      </tr>
    );
  };

  return (
    <div className="gmv-prototype">
```

- [ ] **Step 5: Replace the desktop table (lines 2294–2450)**

Replace the whole `{isMobile ? ( … ) : ( … )}` block. Mobile branch stays byte-identical; the desktop branch becomes the flat grouped table + pagination footer wrapped in a fragment.

Old:
```tsx
          {isMobile ? (
            <div className="mobile-card-list p-2">
              <ActivationRowCards
                rows={filtered}
                openArId={openArId}
                onSelect={setOpenArId}
                reminderByPrId={reminderByPrId}
                emptyText="Chưa có Active Request nào khớp với điều kiện lọc."
              />
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>AR-ID</th>
                    <th>PR-ID</th>
                    <th>Khách hàng</th>
                    <th style={{ textAlign: "center" }}>UID</th>
                    <th style={{ textAlign: "right" }}>Tổng tiền</th>
                    <th style={{ textAlign: "center" }}>Order ID</th>
                    <th>Trạng thái</th>
                    <th>Thưởng GT</th>
                    <th>Tạo lúc</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty">
                          <Icons.Sparkle size={20} />
                          <div>Chưa có Active Request nào khớp với điều kiện lọc.</div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map((a) => {
                    const rem = a.prId ? reminderByPrId.get(a.prId) : undefined;
                    const remTip = rem
                      ? `Sales nhắc kích hoạt lúc ${new Date(rem.requested_at).toLocaleDateString("vi-VN")} ${new Date(rem.requested_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — bởi ${rem.requested_by_name}${rem.note ? ` · "${rem.note}"` : ""}`
                      : undefined;
                    return (
                    <tr
                      key={a.id}
                      className={openArId === a.id ? "selected" : ""}
                      onClick={() => setOpenArId(a.id)}
                      title={remTip}
                      style={rem ? { borderLeft: "3px solid #e65100" } : undefined}
                    >
                      <td>
                        <span className="ar-id-pill">{a.id}</span>
                      </td>
                      <td>
                        {a.prId ? (
                          <span className="pr-id-pill" style={{ fontSize: 11.5 }}>
                            {a.prId}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-3)", fontSize: 12 }}>— Standalone —</span>
                        )}
                      </td>
                      <td>
                        <div className="cell-name">
                          {a.customerName}
                          {a.saleName && (
                            <span style={{ fontSize: 12, color: "var(--text-3)" }}> · Sale: <strong>{a.saleName}</strong></span>
                          )}
                        </div>
                        <div className="cell-sub">UID: {a.uids[0]?.uid || "—"}</div>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="qr-count">
                          <span className="num-done">{a.uids.length}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "var(--money)" }}>{vnd(a.total)}</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <span className="qr-count">
                          <span
                            className="num-done"
                            style={{
                              color: a.orderedCount === a.totalCourses ? "var(--success-text)" : "var(--warning-text)",
                            }}
                          >
                            {a.orderedCount}
                          </span>
                          <span className="slash">/</span>
                          <span className="num-total">{a.totalCourses}</span>
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <ARStatusBadge status={a.status} />
                          {a.holdActivation && a.status !== "activated" && a.status !== "invoiced" && (
                            <span
                              className="badge badge-warning"
                              style={{ fontSize: 11 }}
                              title={a.holdNote ? `Chưa muốn kích hoạt — "${a.holdNote}"` : "Chưa muốn kích hoạt"}
                            >
                              ⏸ Chưa muốn KH
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const rs = getArReferralStatus(a);
                          if (rs === null) {
                            return <span style={{ color: "var(--text-3)", fontSize: 12 }}>—</span>;
                          }
                          const cfg = {
                            full: { bg: "var(--success-bg)", color: "var(--success-text)", label: "Đã cộng" },
                            partial: { bg: "var(--caution-bg, #fef9c3)", color: "var(--caution-text, #92400e)", label: "1 phần" },
                            none: { bg: "var(--danger-bg, #fee2e2)", color: "var(--danger-text, #b91c1c)", label: "Chưa cộng" },
                          }[rs];
                          return (
                            <span style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: cfg.bg,
                              color: cfg.color,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}>
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {(() => {
                          const ts = formatPaymentDateTime(a.createdAt);
                          return (
                            <>
                              <div className="cell-time">{ts.date}</div>
                              {ts.time ? <div className="time-relative">{ts.time}</div> : null}
                            </>
                          );
                        })()}
                      </td>
                      <td>
                        <span className="row-action">
                          <Icons.ChevronRight size={15} />
                        </span>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
```

New:
```tsx
          {isMobile ? (
            <div className="mobile-card-list p-2">
              <ActivationRowCards
                rows={filtered}
                openArId={openArId}
                onSelect={setOpenArId}
                reminderByPrId={reminderByPrId}
                emptyText="Chưa có Active Request nào khớp với điều kiện lọc."
              />
            </div>
          ) : (
            <>
              <div className="tbl-wrap" style={{ overflowX: "auto" }}>
                <table className="tbl" style={{ minWidth: 1180 }}>
                  <thead>
                    <tr>
                      <th>AR-ID / PR-ID</th>
                      <th>Khách hàng</th>
                      <th>UID</th>
                      <th>Gói học</th>
                      <th style={{ textAlign: "right" }}>Tiền</th>
                      <th>Order ID</th>
                      <th>Trạng thái</th>
                      <th>Thưởng GT</th>
                      <th>Tạo lúc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courseVisible.length === 0 && (
                      <tr>
                        <td colSpan={9}>
                          <div className="empty">
                            <Icons.Sparkle size={20} />
                            <div>Chưa có khoá học nào khớp với điều kiện lọc.</div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {coursePage.rows.map((group, gi) =>
                      group.rows.map((row) => renderCourseRow(row, GROUP_TINTS[gi % GROUP_TINTS.length]))
                    )}
                  </tbody>
                </table>
              </div>
              {courseGroups.length > 0 && (
                <div className="pagi">
                  <span>
                    Trang {coursePage.page}/{coursePage.totalPages} · {courseVisible.length} dòng khoá học trong {courseGroups.length} AR
                  </span>
                  <div className="pagi-btns">
                    <button className="pagi-btn" disabled={coursePage.page <= 1} onClick={() => setPage(coursePage.page - 1)} aria-label="Trang trước">
                      <Icons.ChevronLeft size={13} />
                    </button>
                    {pageItems(coursePage.page, coursePage.totalPages).map((it, i) =>
                      it === "..." ? (
                        <span key={`gap-${i}`} className="pagi-gap">
                          …
                        </span>
                      ) : (
                        <button key={it} className={`pagi-btn ${it === coursePage.page ? "active" : ""}`} onClick={() => setPage(it)}>
                          {it}
                        </button>
                      )
                    )}
                    <button className="pagi-btn" disabled={coursePage.page >= coursePage.totalPages} onClick={() => setPage(coursePage.page + 1)} aria-label="Trang sau">
                      <Icons.ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
```

- [ ] **Step 6: Switch tab badges to course-level counts (lines 2273–2275)**

Old:
```tsx
                  { id: "pending_order" as const, label: "Chờ điền Order ID", icon: "Clock" as const, count: counts.pending_order, attention: true },
                  { id: "activated" as const, label: "Đã kích hoạt", icon: "CheckCircle" as const, count: counts.activated },
                  { id: "all" as const, label: "Tất cả", icon: "Database" as const, count: counts.all },
```
New:
```tsx
                  { id: "pending_order" as const, label: "Chờ điền Order ID", icon: "Clock" as const, count: tabCounts.pending_order, attention: true },
                  { id: "activated" as const, label: "Đã kích hoạt", icon: "CheckCircle" as const, count: tabCounts.activated },
                  { id: "all" as const, label: "Tất cả", icon: "Database" as const, count: tabCounts.all },
```

- [ ] **Step 7: Relabel KPI cards to AR-level (disambiguate from course-level tabs)**

Card 2 label (line 2193):
```tsx
            <div className="kpi-label">Chờ điền Order ID</div>
```
→
```tsx
            <div className="kpi-label">AR chờ điền Order ID</div>
```

Card 2 sub (line 2195):
```tsx
            <div className="kpi-sub">Ops chưa điền hết Order ID</div>
```
→
```tsx
            <div className="kpi-sub">Còn khoá chưa có Order ID</div>
```

Card 3 label (line 2201):
```tsx
            <div className="kpi-label">Đã kích hoạt</div>
```
→
```tsx
            <div className="kpi-label">AR đã kích hoạt</div>
```

Card 4 label (line 2209):
```tsx
            <div className="kpi-label">Đã xuất HĐ</div>
```
→
```tsx
            <div className="kpi-label">AR đã xuất HĐ</div>
```

- [ ] **Step 8: Extend the search placeholder (line 2219)**

Old:
```tsx
              placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID…"
```
New:
```tsx
              placeholder="Tìm theo AR-ID, PR-ID, tên khách, UID, gói, Order ID…"
```

- [ ] **Step 9: Right-meta reflects the shown level (line 2291)**

Old:
```tsx
            <span className="right-meta">{filtered.length} kết quả</span>
```
New:
```tsx
            <span className="right-meta">{isMobile ? `${filtered.length} kết quả` : `${courseVisible.length} dòng khoá học`}</span>
```

- [ ] **Step 10: Type-check (the ONLY tsc gate for this task)**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo "tsc clean"`
Expected: `tsc clean`.

If a `declared but never read` error appears, the fix is to WIRE the missing memo/handler into the render (Steps 5–9), NOT to delete it and NOT to remove an import. Confirmed still-used symbols after this task (do not remove): `counts` (KPI cards), `filtered` (mobile `ActivationRowCards` + mobile right-meta), `sumReady` (KPI card 3), `getReferralStatus` (drawer :1602), `getArReferralStatus` (`courseVisible` + `filtered`), `ARStatusBadge` (drawer :997/:1015), `flatCourses` (:530/:682/:915), `Fragment` (drawer :1364/:1675).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/ActivationTab.tsx
git commit -m "feat(activation): flat per-course desktop list (copy-UID, inline order-id, whole-AR pagination)"
```

---

## Task 3: Validation, no-regression, squash to one commit

**Files:** none (verification + git)

- [ ] **Step 1: Type-check (Tier 1)**

Run: `cd frontend && npx tsc -b 2>&1 | grep -E "error TS" || echo "tsc clean"`
Expected: `tsc clean`.

- [ ] **Step 2: Unit test the new helpers**

Run: `cd frontend && npm run test -- --run activationFlatList 2>&1 | grep -E "PASS|FAIL|passed|failed"`
Expected: PASS.

- [ ] **Step 3: No regression on the address-blocker ground truth**

`getInvoiceBlockers` lives in `ActivationTab.tsx`, which we edited. Confirm its tests are still green.

Run: `cd frontend && npm run test -- --run ActivationTab.invoiceBlockers 2>&1 | grep -E "PASS|FAIL|passed|failed"`
Expected: PASS.

- [ ] **Step 4: Vercel-identical build**

Run: `cd frontend && npm run build 2>&1 | grep -E "error|Error|built in" | head -20`
Expected: a "built in …" line, no errors.

- [ ] **Step 5: Manual smoke (dev server)**

Start the dev server via the preview tool (never `npm run dev` in Bash) and verify on the B3 "Kích hoạt khóa học" screen:
- One row per course; Course Code not shown; UID + Copy button present; Copy shows a check for ~1.4s.
- Empty Order ID → input + "Lưu"; typing + Lưu persists and the row flips to "✓ Đã kích hoạt" with a readonly value + pencil.
- Pencil unlocks editing; invoiced course shows a plain readonly value with no pencil.
- Tab counts (course-level) change when an Order ID is saved (a pending course moves to activated); KPI cards (AR-level) update only when an AR fully flips.
- A group's rows never split across a page boundary; horizontal scroll works when the pane is narrow.
- An AR with a "nhắc gấp" reminder keeps its orange left border.
- Search matches accent-insensitively and also finds by gói / Order ID.

- [ ] **Step 6: Squash the two dev commits into ONE**

```bash
git log --oneline -3
git reset --soft HEAD~2
git commit -m "feat(activation): flat per-course activation list

Rework B3 desktop list to one row per course-activation: inline Copy-UID,
inline Order ID entry (readonly + pencil, invoiced hard-locked), whole-AR
pagination with horizontal scroll, course-level tab counts, AR-level KPI
relabel, accent-insensitive search. Pure helpers extracted to
activation/activationFlatList.ts (+ unit tests). FE-only; inline save reuses
persistActiveRequest (same PATCH, 409 modal, ledger write).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

If `git log` shows a different count (e.g. an amend happened), adjust `HEAD~N` to cover exactly the helpers commit + the ActivationTab commit.

- [ ] **Step 7: Cherry-pick to `main`**

Per project deploy flow, cherry-pick this single commit onto `main` (do NOT push the whole `sandbox` branch — it is many commits ahead of `main` and not all are cleared for prod). Confirm the target with the user first, then:

```bash
git rev-parse HEAD        # the squashed commit hash
# after user confirms:
# git checkout main && git cherry-pick <hash> && git push origin main
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-07-31-activation-flat-per-course-list-design.md`). All ActivationTab work is in Task 2; step numbers below:
- D1 flatten one row per course → Task 1 `flatCourseRows`, Task 2 Step 5 render. ✓
- D2 inline Copy-UID → Task 2 Step 4 `copyUid` + Step 4 UID cell. ✓
- D3 inline Order ID + explicit Lưu (not auto-save) → Task 2 Step 4 `saveOrderIdInline` + input/Lưu. ✓
- D4 hide Course Code on main list (keep in drawer) → `courseCode` on `CourseRow` but never rendered; drawer untouched. ✓
- D5 pagination packs whole ARs + horizontal scroll → Task 1 `groupRowsByAr` + `paginate(groups)`, Task 2 Step 5 `overflowX:auto` + `minWidth:1180`. ✓
- D6 tab counts course-level, KPI AR-level relabel → Task 1 `countCourseTabs`, Task 2 Step 6 (tabs) + Step 7 (KPI). ✓
- D7 half-filled AR splits course-rows across tabs → `courseRowMatchesTab` per-course; test covers it. ✓
- D10 fixed 9-column order → Task 2 Step 5 thead + Step 4 `renderCourseRow`. ✓
- D11 Khách hàng = uidName else customerName, sub-line KH/Sale → Step 4 name cell. ✓
- D12 Order ID readonly + pencil, invoiced hard-lock → Step 4 three-mode Order ID cell. ✓
- D13 keep group tint, reminder overrides orange → `GROUP_TINTS` by group index, `borderColor = rem ? "#e65100" : tint`. ✓
- Search normVi accent-insensitive → Task 1 `courseRowMatchesSearch`, Task 2 Step 3 memo, Step 8 placeholder. ✓
- FE-only, reuse persistActiveRequest, no attribution set by FE → Step 4. ✓
- Same-AR concurrency guard → `savingArIds` Set (Step 2 + Step 4). ✓

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step shows full code. ✓

**3. Type consistency:** `CourseRow`/`CourseRowGroup`/`CourseTabId` defined in Task 1 and used identically in Task 2. Helper names (`flatCourseRows`, `courseRowMatchesTab`, `courseRowMatchesSearch`, `countCourseTabs`, `groupRowsByAr`, `applyCourseOrderId`, `AR_PER_PAGE`) match module ↔ import ↔ call sites. `coursePage` (`PageSlice<CourseRowGroup>`) exposes `.rows/.page/.totalPages` — used consistently. `CSSProperties` imported on line 1 (Step 1) and used once (Step 4). ✓

**4. noUnusedLocals safety:** All ActivationTab edits are one task, one `tsc -b` at the end. No symbol is defined in a step that type-checks before the step that consumes it. ✓

**Known follow-ups (out of scope, do not implement here):** mobile `ActivationRowCards` stays AR-level; the AR drawer keeps Course Code and per-course editing. If Ops later wants course-level mobile cards, that is a separate spec.
