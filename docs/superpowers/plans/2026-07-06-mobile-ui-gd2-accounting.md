# GĐ 2 Mobile UI — Accounting Screens: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4 accounting tabs (PaymentRequests, Reconciliation, Activation, InvoiceRequest) display well under 768px mobile. Desktop ≥768px không đổi pixel nào.

**Architecture:** Tái dùng nền GĐ 0–1 (`useIsMobile()`, `RowCard`/`RowCardList`). Mỗi tab tạo 1 card component riêng (pattern: `LedgerRowCards.tsx`). Parent tab dùng `useIsMobile()` → conditional render table vs cards. CSS responsive qua `@media (max-width: 767px)` trong `prototype-payments.css`. Không thêm dependency.

**Tech Stack:** React 19 + Tailwind (`max-md:` variant) + Vitest + Playwright (Pixel 5). 

**Branch:** `mobile-ui-gd2` từ `sandbox` (commit a97f532) → squash merge về `sandbox`.

---

## File structure

| File | Action | Task |
|---|---|---|
| `frontend/src/styles/prototype-payments.css` | Modify — mobile responsive rules | 1 |
| `frontend/src/components/invoice/InvoiceRowCards.tsx` | Create — card view InvoiceRequest | 2 |
| `frontend/src/components/InvoiceRequestTab.tsx` | Modify — useIsMobile branch | 2 |
| `frontend/src/components/payment-request/PrRowCards.tsx` | Create — card view PaymentRequest | 3 |
| `frontend/src/components/payment-request/PaymentRequestTable.tsx` | Modify — useIsMobile branch | 3 |
| `frontend/src/components/PaymentRequestsTab.tsx` | Modify — responsive header | 3 |
| `frontend/src/components/reconciliation/ReconTxnCards.tsx` | Create — card view transactions | 4 |
| `frontend/src/components/reconciliation/ReconBankCards.tsx` | Create — card view CK ngoài | 4 |
| `frontend/src/components/ReconciliationTab.tsx` | Modify — useIsMobile branch | 4 |
| `frontend/src/components/activation/ActivationRowCards.tsx` | Create — card view AR list | 5 |
| `frontend/src/components/ActivationTab.tsx` | Modify — useIsMobile branch | 5 |
| `frontend/e2e/mobile-accounting.spec.ts` | Create — smoke test Pixel 5 | 6 |

---

### Task 0: Branch setup

- [ ] **Step 1: Tạo branch từ sandbox**

```bash
cd "E:\PalFish\DA\pf-gmv-reconciliation\palfish-t-i-u-h-th-ng-ver-2"
git checkout sandbox
git pull origin sandbox
git checkout -b mobile-ui-gd2
```

Expected: `Switched to a new branch 'mobile-ui-gd2'`. Dirty files (crm-token-extension, GatewaySyncTab, etc.) stay untouched.

- [ ] **Step 2: Verify GĐ 0–1 foundations**

```bash
ls frontend/src/hooks/useIsMobile.ts frontend/src/components/ui/RowCard.tsx frontend/src/components/LedgerRowCards.tsx frontend/src/components/SaleDetailCards.tsx
```

Expected: 4 files exist. If missing → GĐ 0–1 not merged, STOP.

- [ ] **Step 3: Commit** (empty — branch marker)

```bash
git commit --allow-empty -m "chore: branch mobile-ui-gd2 from sandbox"
```

---

### Task 1: Shared mobile CSS enhancements

prototype-payments.css already has `@media (max-width: 767px) { .drawer { width: 100vw } }` and `@media (max-width: 1024px) { .kpi-row { grid-template-columns: repeat(2, 1fr) } }`. Extend with:

**Files:**
- Modify: `frontend/src/styles/prototype-payments.css` (append to end, before closing)

- [ ] **Step 1: Add mobile-specific CSS rules**

Append these rules at the end of `prototype-payments.css`, inside the existing `@media (max-width: 767px)` block or add a new one after it:

```css
/* ── GĐ 2: Mobile accounting screens ── */
@media (max-width: 767px) {
  /* KPI: 2 cột đã có ở 1024px, mobile giữ 2 cột nhưng compact */
  .gmv-prototype .kpi { padding: 10px 12px; }
  .gmv-prototype .kpi-value { font-size: 18px; }
  .gmv-prototype .kpi-sub { font-size: 10.5px; }

  /* Toolbar: search full-width, chips wrap xuống */
  .gmv-prototype .toolbar .search { width: 100%; min-width: 0; }

  /* Table tabs: horizontal scroll khi nhiều tab */
  .gmv-prototype .table-head.with-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .gmv-prototype .table-head .tabs { flex-shrink: 0; }
  .gmv-prototype .table-head .right-meta { display: none; }

  /* Bulk bar: wrap actions xuống dòng */
  .gmv-prototype .bulk-bar { flex-wrap: wrap; padding: 8px 12px; gap: 8px; font-size: 12px; }
  .gmv-prototype .bulk-actions { width: 100%; justify-content: flex-end; }

  /* Drawer: full screen (width already 100vw) + no rounded + safe area */
  .gmv-prototype .drawer { border-radius: 0; }
  .gmv-prototype .drawer-head { padding: 12px 14px; }
  .gmv-prototype .drawer-body { padding: 12px; }
  .gmv-prototype .drawer-foot { padding: 12px 14px; padding-bottom: max(14px, env(safe-area-inset-bottom)); }

  /* Summary row: 2 col thay 3-5 */
  .gmv-prototype .summary-row { grid-template-columns: repeat(2, 1fr) !important; }

  /* Info grid: single column */
  .gmv-prototype .info-grid { grid-template-columns: 1fr !important; }

  /* Hide table, show card list (toggled by JS, class applied by parent) */
  .gmv-prototype .tbl-wrap.desktop-only { display: none; }
  .gmv-prototype .mobile-card-list { display: block; }

  /* Pagination compact */
  .gmv-prototype .pagi { flex-wrap: wrap; gap: 8px; padding: 10px 12px; font-size: 12px; }
  .gmv-prototype .pagi-btn { min-width: 32px; min-height: 32px; }
}

/* Desktop: ẩn card list */
@media (min-width: 768px) {
  .gmv-prototype .mobile-card-list { display: none; }
}
```

- [ ] **Step 2: Run tsc to verify no CSS breaks**

```bash
cd frontend && npx tsc -b
```

Expected: PASS (CSS-only change).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/prototype-payments.css
git commit -m "style(mobile): shared responsive CSS for accounting screens"
```

---

### Task 2: InvoiceRequestTab — mobile card view

Simplest tab (771 lines). Has `<table className="tbl">` with 10 columns. Card shows: name, amount, phone, INV/CC badge, customer type, time. Action: "Xuất HĐ" button.

**Files:**
- Create: `frontend/src/components/invoice/InvoiceRowCards.tsx`
- Modify: `frontend/src/components/InvoiceRequestTab.tsx`

- [ ] **Step 1: Create InvoiceRowCards component**

Create `frontend/src/components/invoice/InvoiceRowCards.tsx`:

```tsx
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { fmtPhone, formatPaymentDateTime } from "../payment-request/paymentRequestUtils";
import { findCountry } from "../payment-request/CountryCombo";
import { formatAddress, type InvoiceRow, vnd } from "../payment-flow/paymentFlowUtils";

interface Props {
  rows: InvoiceRow[];
  tab: "pending" | "issued";
  openKey: string | null;
  selectedKeys: Set<string>;
  onSelect: (key: string) => void;
  onToggleSelect: (key: string) => void;
  onIssue: (row: InvoiceRow) => void;
  isRowComplete: (row: InvoiceRow) => boolean;
  defaultsFor: (row: InvoiceRow) => {
    customerType: string;
    name: string;
    phone: string;
    country: string;
  } | null;
  readOnly: boolean;
  remindedPrMap: Map<string, unknown>;
  emptyText: string;
}

export default function InvoiceRowCards({
  rows,
  tab,
  openKey,
  selectedKeys,
  onSelect,
  onToggleSelect,
  onIssue,
  isRowComplete,
  defaultsFor,
  readOnly,
  remindedPrMap,
  emptyText,
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {rows.map((r) => {
        const d = defaultsFor(r);
        if (!d) return null;
        const country = findCountry(d.country);
        const complete = isRowComplete(r);
        const ts = formatPaymentDateTime(
          r.course.invoiced ? r.course.invoicedAt || "" : r.ar.createdAt
        );
        const reminded = remindedPrMap.has(r.ar.prId || "") && !r.course.invoiced;
        return (
          <RowCard
            key={r.key}
            className={openKey === r.key ? "ring-2 ring-gmv-primary" : undefined}
            title={
              <span>
                {d.name}
                {reminded && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">
                    <Icons.Bell size={10} /> Nhắc
                  </span>
                )}
              </span>
            }
            value={vnd(r.course.amount)}
            badges={
              <>
                {r.course.invoiced ? (
                  <span className="invoice-chip" style={{ fontSize: 11 }}>
                    <Icons.Doc size={10} /> {r.course.invoiceId}
                  </span>
                ) : (
                  <span className="code-chip cc" style={{ fontSize: 11 }}>
                    <Icons.Sparkle size={10} /> {r.course.courseCode}
                  </span>
                )}
                <Badge tone={d.customerType === "business" ? "primary" : "neutral"}>
                  {d.customerType === "business" ? "DN" : "CN"}
                </Badge>
              </>
            }
            meta={[
              { label: "SĐT", value: `${country.flag} ${country.dial} ${fmtPhone(d.phone)}` },
              { label: "UID", value: r.uidObj.uid || "—" },
              { label: "Địa chỉ", value: formatAddress(r.pr, r) || "—" },
              { label: "Thời gian", value: `${ts.date} ${ts.time || ""}`.trim() },
            ]}
            onClick={() => onSelect(r.key)}
            actions={
              <div className="flex w-full items-center justify-between">
                {(tab === "pending" || tab === "issued") && (
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(r.key)}
                      disabled={tab === "pending" && !complete}
                      onChange={() => onToggleSelect(r.key)}
                    />
                    Chọn
                  </label>
                )}
                {tab === "pending" && complete && !readOnly && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => onIssue(r)}
                  >
                    <Icons.Doc size={12} /> Xuất HĐ
                  </Button>
                )}
              </div>
            }
          />
        );
      })}
    </RowCardList>
  );
}
```

- [ ] **Step 2: Modify InvoiceRequestTab — import + conditional render**

In `InvoiceRequestTab.tsx`:

1. Add imports at top:
```tsx
import useIsMobile from "../hooks/useIsMobile";
import InvoiceRowCards from "./invoice/InvoiceRowCards";
```

2. Inside `InvoiceRequestTab()` function, add after existing state declarations (around line 220):
```tsx
const isMobile = useIsMobile();
```

3. Replace the `<div className="tbl-wrap">` block (lines 579–752) with conditional render:

```tsx
{isMobile ? (
  <div className="mobile-card-list p-2">
    <InvoiceRowCards
      rows={filtered}
      tab={tab}
      openKey={openKey}
      selectedKeys={selectedKeys}
      onSelect={setOpenKey}
      onToggleSelect={(key) => {
        setSelectedKeys((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }}
      onIssue={(r) => void issueInvoiceForCourse(r.ar.id, r.course.courseCode)}
      isRowComplete={isRowComplete}
      defaultsFor={defaultsFor}
      readOnly={readOnly}
      remindedPrMap={remindedPrMap}
      emptyText={tab === "pending" ? "Không có hoá đơn nào đang chờ xuất." : "Chưa có hoá đơn nào."}
    />
  </div>
) : (
  <div className="tbl-wrap">
    {/* existing table JSX unchanged */}
  </div>
)}
```

4. The top description text: wrap in `max-md:text-xs max-md:leading-snug` for compact on mobile. The header layout with button "Tạo PR" etc. is not present here, so no change needed.

- [ ] **Step 3: Verify tsc + unit tests**

```bash
cd frontend && npx tsc -b && npm run test -- --run
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/invoice/InvoiceRowCards.tsx frontend/src/components/InvoiceRequestTab.tsx
git commit -m "feat(mobile): InvoiceRequestTab card view for mobile"
```

---

### Task 3: PaymentRequestsTab — mobile card view

PaymentRequestTable.tsx (350 lines) contains the `<table>`. Create card component and modify the table component to conditionally render.

**Files:**
- Create: `frontend/src/components/payment-request/PrRowCards.tsx`
- Modify: `frontend/src/components/payment-request/PaymentRequestTable.tsx`
- Modify: `frontend/src/components/PaymentRequestsTab.tsx`

- [ ] **Step 1: Create PrRowCards component**

Create `frontend/src/components/payment-request/PrRowCards.tsx`:

```tsx
import type { ActiveRequest, PaymentRequest } from "../../types/paymentRequest";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { findCountry } from "./CountryCombo";
import { Icons } from "./Icons";
import PaymentRequestStatusBadge from "./PaymentRequestStatusBadge";
import {
  type RequestBucket,
  ddmmyyyy,
  fmtPhone,
  vnd,
} from "./paymentRequestUtils";

interface Props {
  requests: PaymentRequest[];
  tab: RequestBucket;
  selectedId: string | null;
  onSelect: (request: PaymentRequest) => void;
  onCancelClick: (request: PaymentRequest) => void;
  onRestoreClick: (request: PaymentRequest) => void;
  arByPrId: Record<string, ActiveRequest>;
  showTvts: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  emptyText?: string;
}

export default function PrRowCards({
  requests,
  tab,
  selectedId,
  onSelect,
  onCancelClick,
  onRestoreClick,
  arByPrId,
  showTvts,
  hasMore,
  onLoadMore,
  emptyText = "Không có Payment Request nào.",
}: Props) {
  return (
    <div className="space-y-2">
      <RowCardList empty={emptyText}>
        {requests.map((p) => {
          const country = findCountry(p.country);
          const canCancel = p.state !== "cancelled" && p.doneCount === 0;
          const pct = p.target ? Math.round((p.received / p.target) * 100) : 0;
          const ar = arByPrId[p.id];
          return (
            <RowCard
              key={p.id}
              className={selectedId === p.id ? "ring-2 ring-gmv-primary" : undefined}
              title={
                <span>
                  {p.name}
                  {p.isTest && (
                    <span className="ml-1.5 rounded bg-yellow-100 px-1 py-0.5 text-[10px] font-bold text-yellow-700">
                      TEST
                    </span>
                  )}
                </span>
              }
              value={vnd(p.target)}
              badges={
                <>
                  <PaymentRequestStatusBadge state={p.state} totalCount={p.totalCount} />
                  {ar && (
                    <span
                      className={`badge ${ar.uids.some((u) => u.courses.some((c) => !!c.orderId)) ? "is-done" : "is-over"}`}
                      style={{ fontSize: 10.5 }}
                    >
                      {ar.uids.some((u) => u.courses.some((c) => !!c.orderId)) ? "AR ✓" : "AR chờ"}
                    </span>
                  )}
                </>
              }
              meta={[
                { label: "PR-ID", value: p.id },
                { label: "UID", value: p.uid },
                { label: "SĐT", value: `${country.flag} ${country.dial} ${fmtPhone(p.phone)}` },
                ...(showTvts && p.saleName ? [{ label: "TVTS", value: p.saleName }] : []),
                { label: "Thanh toán", value: `${p.doneCount}/${p.totalCount} lần · ${vnd(p.received)} (${pct}%)` },
                { label: "Tạo lúc", value: ddmmyyyy(p.createdAt) },
              ]}
              onClick={() => onSelect(p)}
              actions={
                tab === "cancelled" ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => onRestoreClick(p)}>
                    <Icons.CheckCircle size={13} /> Khôi phục
                  </Button>
                ) : canCancel ? (
                  <Button type="button" size="sm" variant="danger" onClick={() => onCancelClick(p)}>
                    <Icons.XCircle size={13} /> Huỷ
                  </Button>
                ) : undefined
              }
            />
          );
        })}
      </RowCardList>
      {hasMore && (
        <Button type="button" variant="secondary" fullWidth className="min-h-[44px]" onClick={onLoadMore}>
          Tải thêm
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Modify PaymentRequestTable — conditional render**

In `PaymentRequestTable.tsx`:

1. Add imports:
```tsx
import useIsMobile from "../../hooks/useIsMobile";
import PrRowCards from "./PrRowCards";
```

2. Inside the function body, add:
```tsx
const isMobile = useIsMobile();
```

3. Replace the `<div className="tbl-wrap">` table block with:
```tsx
{isMobile ? (
  <div className="mobile-card-list p-2">
    <PrRowCards
      requests={requests}
      tab={tab}
      selectedId={selectedId}
      onSelect={onSelect}
      onCancelClick={onCancelClick}
      onRestoreClick={onRestoreClick}
      arByPrId={arByPrId}
      showTvts={showTvts}
      hasMore={page < totalPages}
      onLoadMore={() => onPageChange(page + 1)}
    />
  </div>
) : (
  <div className="tbl-wrap">
    {/* existing table unchanged */}
  </div>
)}
```

4. Pagination: on mobile render nothing (PrRowCards has "Tải thêm"). Wrap existing `.pagi` div:
```tsx
{!isMobile && (
  <div className="pagi">
    {/* existing pagination unchanged */}
  </div>
)}
```

- [ ] **Step 3: Modify PaymentRequestsTab — responsive header**

In `PaymentRequestsTab.tsx`, the top section (lines 751–761) has a flex row with description + "Tạo PR" button. On mobile, stack vertically:

1. Add import:
```tsx
import useIsMobile from "../hooks/useIsMobile";
```

2. Add in function body:
```tsx
const isMobile = useIsMobile();
```

3. Wrap the top flex div with responsive classes. Change:
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
```
to:
```tsx
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
```

And on mobile hide the long description text:
```tsx
{!isMobile && (
  <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 640, lineHeight: 1.55 }}>
    ...existing description...
  </div>
)}
```

- [ ] **Step 4: Verify tsc + tests**

```bash
cd frontend && npx tsc -b && npm run test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/payment-request/PrRowCards.tsx frontend/src/components/payment-request/PaymentRequestTable.tsx frontend/src/components/PaymentRequestsTab.tsx
git commit -m "feat(mobile): PaymentRequestsTab card view for mobile"
```

---

### Task 4: ReconciliationTab — mobile card view

Largest and most complex: TWO tables (main transactions + CK ngoài), drawer, modals. Main table has 10 columns + actions.

**Files:**
- Create: `frontend/src/components/reconciliation/ReconTxnCards.tsx`
- Create: `frontend/src/components/reconciliation/ReconBankCards.tsx`
- Modify: `frontend/src/components/ReconciliationTab.tsx`

- [ ] **Step 1: Create ReconTxnCards component**

Create `frontend/src/components/reconciliation/ReconTxnCards.tsx`:

```tsx
import type { BankTransaction } from "../../lib/api";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import {
  type FlatTransaction,
  METHOD_META,
  type TxnDisplayStatus,
  TXN_STATUS_META,
  txnDisplayStatus,
  vnd,
} from "../payment-flow/paymentFlowUtils";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";

interface Props {
  transactions: FlatTransaction[];
  drawerTxnKey: string | null;
  readOnly: boolean;
  selectedIds: Set<string>;
  onSelect: (t: FlatTransaction) => void;
  onToggleSelect: (key: string) => void;
  onConfirm: (t: FlatTransaction) => void;
  onReject: (t: FlatTransaction) => void;
  billRequiredButMissing: (t: FlatTransaction) => boolean;
  bankByLine: Map<string, BankTransaction>;
  emptyText?: string;
}

function StatusBadge({ status }: { status: TxnDisplayStatus }) {
  const m = TXN_STATUS_META[status] || TXN_STATUS_META.unsent;
  return <span className={`badge ${m.cls}`}><span className="dot" />{m.text}</span>;
}

export default function ReconTxnCards({
  transactions,
  drawerTxnKey,
  readOnly,
  selectedIds,
  onSelect,
  onToggleSelect,
  onConfirm,
  onReject,
  billRequiredButMissing,
  emptyText = "Không có giao dịch nào.",
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {transactions.map((t) => {
        const status = txnDisplayStatus(t);
        const method = METHOD_META[t.method || "qr"];
        const created = formatPaymentDateTime(t.createdAt);
        return (
          <RowCard
            key={t.key}
            className={drawerTxnKey === t.key ? "ring-2 ring-gmv-primary" : undefined}
            title={
              <span>
                <span className="font-mono text-xs text-gmv-primary">{t.prId}</span>
                {" · "}
                {t.prName}
              </span>
            }
            value={vnd(t.amount)}
            badges={
              <>
                <StatusBadge status={status} />
                <span className={`method-badge ${method.cls}`} style={{ fontSize: 10.5 }}>
                  {method.label}
                </span>
              </>
            }
            meta={[
              { label: "Mã GD", value: t.code },
              { label: "Thời gian", value: `${created.date} ${created.time || ""}`.trim() },
              { label: "Chi tiết", value: t.bank || t.cashier || "—" },
            ]}
            onClick={() => onSelect(t)}
            actions={
              status === "awaiting" && !readOnly ? (
                <div className="flex w-full items-center justify-between">
                  <label className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.key)}
                      onChange={() => onToggleSelect(t.key)}
                    />
                    Chọn
                  </label>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="danger" onClick={() => onReject(t)}>
                      Từ chối
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      disabled={billRequiredButMissing(t)}
                      onClick={() => onConfirm(t)}
                    >
                      Xác nhận
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
```

- [ ] **Step 2: Create ReconBankCards component**

Create `frontend/src/components/reconciliation/ReconBankCards.tsx`:

```tsx
import type { BankTransaction } from "../../lib/api";
import Button from "../ui/Button";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime } from "../payment-request/paymentRequestUtils";
import { vnd } from "../payment-flow/paymentFlowUtils";

interface Props {
  txns: BankTransaction[];
  readOnly: boolean;
  onMatch: (txnId: string) => void;
}

export default function ReconBankCards({ txns, readOnly, onMatch }: Props) {
  return (
    <RowCardList empty="Không có giao dịch CK ngoài chờ ghép.">
      {txns.map((b) => {
        const when = b.transaction_date || b.created_at;
        const whenFmt = when ? formatPaymentDateTime(when) : { date: "—", time: "" };
        const isReview = b.match_status === "needs_review";
        return (
          <RowCard
            key={b.txn_id}
            title={b.transfer_content || b.content || "—"}
            value={vnd(b.amount)}
            badges={
              <span className={`badge ${isReview ? "is-short" : "is-over"}`}>
                <span className="dot" />
                {isReview ? "Cần kiểm tra" : "Chờ ghép"}
              </span>
            }
            meta={[
              { label: "Thời gian", value: `${whenFmt.date} ${whenFmt.time || ""}`.trim() },
              { label: "TK nhận", value: b.account_number || "—" },
            ]}
            onClick={readOnly ? undefined : () => onMatch(b.txn_id)}
            actions={
              !readOnly ? (
                <Button type="button" size="sm" variant="primary" onClick={() => onMatch(b.txn_id)}>
                  <Icons.Bank size={12} /> Ghép
                </Button>
              ) : undefined
            }
          />
        );
      })}
    </RowCardList>
  );
}
```

- [ ] **Step 3: Modify ReconciliationTab — import + conditional render**

In `ReconciliationTab.tsx`:

1. Add imports:
```tsx
import useIsMobile from "../hooks/useIsMobile";
import ReconTxnCards from "./reconciliation/ReconTxnCards";
import ReconBankCards from "./reconciliation/ReconBankCards";
```

2. Add in function body:
```tsx
const isMobile = useIsMobile();
```

3. For the CK ngoài tab (lines ~891–966), wrap the `<table>` in conditional:
```tsx
{tab === "ckOutside" ? (
  <div>
    <div style={{ padding: "10px 14px", fontSize: 12, ... }}>
      {/* existing instruction text */}
    </div>
    {isMobile ? (
      <div className="mobile-card-list p-2">
        <ReconBankCards txns={bankPendingTxns} readOnly={readOnly} onMatch={openBankMatch} />
      </div>
    ) : (
      <table className="tbl">{/* existing table */}</table>
    )}
  </div>
) : ...
```

4. For main transaction table (lines ~968–1147), same pattern:
```tsx
{isMobile ? (
  <div className="mobile-card-list p-2">
    <ReconTxnCards
      transactions={filtered}
      drawerTxnKey={drawerOpen ? drawerTxn?.key ?? null : null}
      readOnly={readOnly}
      selectedIds={selectedIds}
      onSelect={(t) => { setDrawerTxn(t); setDrawerOpen(true); }}
      onToggleSelect={(key) => {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      }}
      onConfirm={(t) => { if (!billRequiredButMissing(t)) void handleConfirm(t); }}
      onReject={(t) => handleReject(t)}
      billRequiredButMissing={billRequiredButMissing}
      bankByLine={bankByLine}
    />
  </div>
) : (
  <div className="tbl-wrap">
    <table className="tbl">{/* existing table unchanged */}</table>
  </div>
)}
```

- [ ] **Step 4: Verify tsc + tests**

```bash
cd frontend && npx tsc -b && npm run test -- --run
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/reconciliation/ frontend/src/components/ReconciliationTab.tsx
git commit -m "feat(mobile): ReconciliationTab card view for mobile (2 tables)"
```

---

### Task 5: ActivationTab — mobile card view

2237 lines. Table has 10 columns. Drawer is 800 lines (ActivationDetailDrawer) — drawer fullscreen already handled by CSS Task 1. Focus on the main list table → cards.

**Files:**
- Create: `frontend/src/components/activation/ActivationRowCards.tsx`
- Modify: `frontend/src/components/ActivationTab.tsx`

- [ ] **Step 1: Create ActivationRowCards component**

Create `frontend/src/components/activation/ActivationRowCards.tsx`:

```tsx
import Badge from "../ui/Badge";
import { RowCard, RowCardList } from "../ui/RowCard";
import { Icons } from "../payment-request/Icons";
import { formatPaymentDateTime, getArReferralStatus } from "../payment-request/paymentRequestUtils";
import {
  AR_STATUS_META,
  type EnrichedActiveRequest,
  vnd,
} from "../payment-flow/paymentFlowUtils";

interface Props {
  rows: EnrichedActiveRequest[];
  openArId: string | null;
  onSelect: (id: string) => void;
  reminderByPrId: Map<string, unknown>;
  emptyText?: string;
}

function StatusBadge({ status }: { status: string }) {
  const m = AR_STATUS_META[status as keyof typeof AR_STATUS_META] || AR_STATUS_META.pending_order;
  return <span className={`badge ${m.cls}`}><span className="dot" />{m.text}</span>;
}

export default function ActivationRowCards({
  rows,
  openArId,
  onSelect,
  reminderByPrId,
  emptyText = "Chưa có Active Request nào.",
}: Props) {
  return (
    <RowCardList empty={emptyText}>
      {rows.map((a) => {
        const rem = a.prId ? reminderByPrId.has(a.prId) : false;
        const ts = formatPaymentDateTime(a.createdAt);
        const rs = getArReferralStatus(a);

        return (
          <RowCard
            key={a.id}
            className={openArId === a.id ? "ring-2 ring-gmv-primary" : rem ? "border-l-[3px] border-l-orange-600" : undefined}
            title={a.customerName}
            value={vnd(a.total)}
            badges={
              <>
                <StatusBadge status={a.status} />
                {rs && (
                  <Badge
                    tone={rs === "full" ? "success" : rs === "partial" ? "warning" : "danger"}
                  >
                    {rs === "full" ? "GT ✓" : rs === "partial" ? "GT 1p" : "GT chưa"}
                  </Badge>
                )}
              </>
            }
            meta={[
              { label: "AR-ID", value: a.id },
              { label: "PR-ID", value: a.prId || "Standalone" },
              { label: "UID", value: `${a.uids.length} UID · ${a.totalCourses} khoá` },
              {
                label: "Order ID",
                value: `${a.orderedCount}/${a.totalCourses}`,
              },
              { label: "Tạo lúc", value: `${ts.date} ${ts.time || ""}`.trim() },
            ]}
            onClick={() => onSelect(a.id)}
          />
        );
      })}
    </RowCardList>
  );
}
```

- [ ] **Step 2: Modify ActivationTab — import + conditional render**

In `ActivationTab.tsx`:

1. Add imports:
```tsx
import useIsMobile from "../hooks/useIsMobile";
import ActivationRowCards from "./activation/ActivationRowCards";
```

2. Add in function body (inside `ActivationTab()`):
```tsx
const isMobile = useIsMobile();
```

3. Replace the `<div className="tbl-wrap">` block (lines 2018–2146) with conditional:
```tsx
{isMobile ? (
  <div className="mobile-card-list p-2">
    <ActivationRowCards
      rows={filtered}
      openArId={openArId}
      onSelect={setOpenArId}
      reminderByPrId={reminderByPrId}
    />
  </div>
) : (
  <div className="tbl-wrap">
    <table className="tbl">{/* existing table unchanged */}</table>
  </div>
)}
```

4. Top header: on mobile hide description text and keep button. The `flexWrap: "wrap"` already handles it. Add mobile-hide on description:
```tsx
{!isMobile && (
  <div style={{ fontSize: 12.5, color: "var(--text-3)", maxWidth: 720, ... }}>
    ...existing description...
  </div>
)}
```

5. ActivationDetailDrawer: the drawer CSS already handles fullscreen. The internal layout with `.summary-row`, `.info-grid` already responsive from Task 1 CSS. The course-row grid inside the drawer is complex — for GĐ 2, accept horizontal scroll on the course-row form inside drawer (it's a data-entry form, not browsing). No card transform needed for drawer internals.

- [ ] **Step 3: Verify tsc + tests**

```bash
cd frontend && npx tsc -b && npm run test -- --run
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/activation/ frontend/src/components/ActivationTab.tsx
git commit -m "feat(mobile): ActivationTab card view for mobile"
```

---

### Task 6: E2E smoke test mobile

Pixel 5 (393×851) — verify all 4 tabs render cards on mobile, drawers open fullscreen.

**Files:**
- Create: `frontend/e2e/mobile-accounting.spec.ts`

- [ ] **Step 1: Create E2E test file**

```ts
import { test, expect } from "@playwright/test";

test.describe("Mobile accounting screens", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  // Tab B1: Payment Requests
  test("B1 PR tab shows card view on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Payment Request/i }).click();
    await page.waitForTimeout(1000);
    // Should see RowCard (has role button or data-testid)
    // Table should be hidden
    await expect(page.locator(".tbl")).not.toBeVisible();
    // Card list should be visible
    await expect(page.locator(".mobile-card-list")).toBeVisible();
  });

  // Tab B2: Reconciliation
  test("B2 Recon tab shows card view on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Đối soát/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator(".tbl")).not.toBeVisible();
  });

  // Tab B3: Activation
  test("B3 Activation tab shows card view on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Kích hoạt/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator(".tbl")).not.toBeVisible();
  });

  // Tab B4: Invoice
  test("B4 Invoice tab shows card view on mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Xuất hóa đơn|Hoá đơn/i }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator(".tbl")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E**

```bash
cd frontend && npx playwright test e2e/mobile-accounting.spec.ts --project=mobile
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/mobile-accounting.spec.ts
git commit -m "test(e2e): mobile accounting screens smoke test"
```

---

### Task 7: Final verification + squash commit

- [ ] **Step 1: Full tsc + unit test + e2e**

```bash
cd frontend && npx tsc -b && npm run test -- --run && npm run e2e
```

Expected: all pass.

- [ ] **Step 2: Preview on dev server**

Start dev server, resize browser to 375px width, check each tab:
1. B1 PaymentRequests — card view, no horizontal scroll
2. B2 Reconciliation — card view both tabs (Chờ xác nhận + CK ngoài)
3. B3 Activation — card view, drawer opens fullscreen
4. B4 InvoiceRequest — card view, bulk select works

Verify desktop (≥768px) is unchanged for all 4 tabs.

- [ ] **Step 3: Squash merge to sandbox**

After verification:
```bash
git checkout sandbox
git merge --squash mobile-ui-gd2
git commit -m "feat(mobile): GĐ 2 accounting screens — card view B1-B4, responsive drawer/toolbar/KPI, e2e Pixel 5"
```

---

## Type notes

- `EnrichedActiveRequest`: exported from `payment-flow/paymentFlowUtils.ts` — return type of `enrichActiveRequest()`. If not exported, the ActivationRowCards component should accept the same shape as `rows` from `ActivationTab` (which is `ReturnType<typeof enrichActiveRequest>[]`).
- `FlatTransaction`: from `payment-flow/paymentFlowUtils.ts`.
- `InvoiceRow`: from `payment-flow/paymentFlowUtils.ts`.
- `BankTransaction`: from `lib/api.ts`.
- `Badge`, `Button`: from `ui/` — already used by GĐ 1 card components.
