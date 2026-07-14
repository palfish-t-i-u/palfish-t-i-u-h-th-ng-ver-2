# Recon: Fix auto-match orphan + Tab Chờ xác nhận chỉ phục vụ tiền mặt + Scoring ghép CK ngoài

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Fix BE bug auto-match orphan. (2) Tab "Chờ xác nhận" nút ✓ cho non-cash → redirect sang tab/page tương ứng thay vì confirm. (3) Scoring khi ghép CK ngoài — parse NDCK, chấm điểm candidate, hiện badge.

**Architecture:** BE tách try block `_process_sepay_transaction` tránh orphan. FE giữ nút "Xác nhận" nhưng onClick redirect theo method. BE thêm `_score_candidate()` vào `bank_txn_match_candidates`, FE hiện badge trên candidate card.

**Tech Stack:** Python/FastAPI (BE), React/TypeScript (FE)

**Context chốt với kế toán Thu Hiền 14/7:**
> Tab Chờ xác nhận chỉ phục vụ tiền mặt. QR tự động. CK ngoài → tab CK ngoài chờ ghép. Quẹt thẻ/trả góp → mPOS/Payoo.

**Quy tắc với giao dịch hiện có:** Giữ nguyên các giao dịch non-cash đang tồn tại trong tab Chờ xác nhận. Không xoá/di chuyển. Nút Xác nhận vẫn hiện nhưng redirect. Khi được ghép/tự xác nhận → tự biến mất.

---

## File Map

| File | Thay đổi |
|---|---|
| `backend/sepay_routes.py:369-396` | T1: Tách try block auto-match |
| `backend/sepay_routes.py:684-832` | T6: Thêm `_score_candidate()` + trả `match_signals`/`score` |
| `frontend/src/contexts/PaymentFlowContext.tsx:50` | T2: Thêm `"reconCard"` vào `PaymentFlowView` |
| `frontend/src/pages/MainPage.tsx:83-88` | T2: Thêm `reconCard` vào `FLOW_VIEW_MAP` |
| `frontend/src/components/ReconciliationTab.tsx:1150-1175` | T3: Desktop nút Xác nhận → redirect non-cash |
| `frontend/src/components/ReconciliationTab.tsx:1066-1069` | T5: Checkbox disable non-cash |
| `frontend/src/components/ReconciliationTab.tsx:836-892` | T5: Bulk confirm filter cash only |
| `frontend/src/components/ReconciliationTab.tsx:1690-1734` | T7: Badge scoring trên candidate card |
| `frontend/src/components/reconciliation/ReconTxnCards.tsx:80-106` | T4: Mobile nút Xác nhận → redirect non-cash |

---

### Task 1: Fix BE auto-match orphan — tách try block

**Files:**
- Modify: `backend/sepay_routes.py:369-396`

**Root cause:** 3 operations trong 1 try block. Op 1 (mark line paid) commits → op 2/3 (recompute/audit) throws → exception handler reverts `match_status` về `needs_review` nhưng payment_line vẫn paid = orphan.

**Fix:** Tách 2 try blocks. mark_line_paid thành công → giữ `auto_matched`, recompute/audit fail chỉ log warning.

- [ ] **Step 1: Edit `_process_sepay_transaction` — tách try block**

Replace lines 367-396 in `backend/sepay_routes.py`:

```python
    # Step 3: CHỈ KHI bank_transactions INSERT thành công (is_new=True) MỚI mark
    # payment_line=paid + recompute PR. Tránh case INSERT fail nhưng line đã paid.
    if is_new and line_to_pay is not None:
        line_paid_ok = False
        try:
            now_iso = _iso_now()
            sb.table("payment_lines").update(
                {"status": "paid", "paid_at": now_iso, "reject_reason": None,
                 "confirmed_by": "system:sepay", "confirmed_at": now_iso, "confirmed_source": "sepay"}
            ).eq("id", payment_line_id).execute()
            line_paid_ok = True
        except Exception as exc:
            print(f"[sepay] mark_line_paid failed: {exc}")
            try:
                sb.table("bank_transactions").update(
                    {"match_status": "needs_review", "updated_at": _iso_now()}
                ).eq("sepay_id", sepay_id).execute()
                match_status = "needs_review"
            except Exception as exc2:
                print(f"[sepay] revert match_status failed: {exc2}")

        # Recompute + audit: best-effort. Line đã paid → giữ auto_matched.
        if line_paid_ok:
            try:
                from payment_request_routes import recompute_payment_request_totals
                from audit import log_audit

                pr_id = str(line_to_pay.get("payment_request_id", ""))
                if pr_id:
                    recompute_payment_request_totals(sb, pr_id)
                log_audit(sb, "system:sepay", "recon.line_marked_paid", "payment_line", payment_line_id, {
                    "pr_id": pr_id, "source": "sepay", "sepay_id": sepay_id,
                })
            except Exception as exc:
                print(f"[sepay] recompute/audit failed (line already paid, match_status kept): {exc}")
```

- [ ] **Step 2: Verify — `cd frontend && npx tsc -b`** (BE là Python, chỉ đảm bảo FE ok)

- [ ] **Step 3: Commit**

```bash
git add backend/sepay_routes.py
git commit -m "fix(recon): tách try block auto-match — recompute/audit fail không revert match_status"
```

---

### Task 2: FE — Thêm `reconCard` vào PaymentFlowView + FLOW_VIEW_MAP

**Files:**
- Modify: `frontend/src/contexts/PaymentFlowContext.tsx:50`
- Modify: `frontend/src/pages/MainPage.tsx:83-88`

- [ ] **Step 1: Thêm `reconCard` vào PaymentFlowView**

In `frontend/src/contexts/PaymentFlowContext.tsx`, line 50:

```typescript
export type PaymentFlowView = "paymentRequests" | "reconciliation" | "module3" | "module4" | "reconCard";
```

- [ ] **Step 2: Thêm `reconCard` vào FLOW_VIEW_MAP**

In `frontend/src/pages/MainPage.tsx`, add `reconCard` entry:

```typescript
const FLOW_VIEW_MAP: Record<PaymentFlowView, ViewId> = {
  paymentRequests: "paymentRequests",
  reconciliation: "reconciliation",
  module3: "module3",
  module4: "module4",
  reconCard: "reconCard",
};
```

- [ ] **Step 3: Verify — `cd frontend && npx tsc -b`**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/contexts/PaymentFlowContext.tsx frontend/src/pages/MainPage.tsx
git commit -m "feat(recon): thêm reconCard vào PaymentFlowView để navigate từ tab Chờ xác nhận"
```

---

### Task 3: FE Desktop — Nút Xác nhận redirect theo method

**Files:**
- Modify: `frontend/src/components/ReconciliationTab.tsx:1150-1175`

**Logic:** Nút giữ nguyên icon ✓ + tên "Xác nhận". onClick thay đổi theo method:
- `cash` → confirm như cũ (`handleConfirm`)
- `qr` / `transfer` → `setTab("ckOutside")` (cùng page, chuyển tab CK ngoài chờ ghép)
- `card` / `installment` → `navigate("reconCard")` (sang page mPOS/Payoo)

Nút ✗ Từ chối: chỉ hiện cho `cash` (non-cash cần ghép, không cần từ chối).

- [ ] **Step 1: Edit action column (lines 1150-1175)**

```tsx
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        {status === "awaiting" && !readOnly ? (
                          t.method === "cash" ? (
                            <div className="row-quick-actions">
                              <button
                                type="button"
                                className="btn-icon-success"
                                title={billRequiredButMissing(t) ? "Cần ảnh bill quẹt thẻ/trả góp" : "Xác nhận tiền về"}
                                disabled={billRequiredButMissing(t)}
                                onClick={() => { if (!billRequiredButMissing(t)) void handleConfirm(t); }}
                              >
                                <Icons.Check size={14} strokeWidth={2.5} />
                              </button>
                              <button
                                type="button"
                                className="btn-icon-danger"
                                title="Từ chối"
                                onClick={() => handleReject(t)}
                              >
                                <Icons.Close size={14} strokeWidth={2.2} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn-icon-success"
                              title={t.method === "card" || t.method === "installment" ? "Ghép ở mPOS/Payoo" : "Ghép ở CK ngoài chờ ghép"}
                              onClick={() => {
                                if (t.method === "card" || t.method === "installment") {
                                  navigate("reconCard");
                                } else {
                                  setTab("ckOutside");
                                }
                              }}
                            >
                              <Icons.Check size={14} strokeWidth={2.5} />
                            </button>
                          )
                        ) : (
                          <button type="button" className="row-action" title="Xem chi tiết">
                            <Icons.ChevronRight size={15} />
                          </button>
                        )}
                      </td>
```

- [ ] **Step 2: Verify — `cd frontend && npx tsc -b`**

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ReconciliationTab.tsx
git commit -m "feat(recon): desktop — nút Xác nhận redirect non-cash sang tab/page tương ứng"
```

---

### Task 4: FE Mobile — Nút Xác nhận redirect theo method

**Files:**
- Modify: `frontend/src/components/reconciliation/ReconTxnCards.tsx`

Cùng logic Task 3, mobile card layout. Thêm 2 props: `onRedirectCard`, `onSwitchToCkOutside`.

- [ ] **Step 1: Thêm props vào interface (line 13-24)**

```tsx
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
  onRedirectCard: () => void;
  onSwitchToCkOutside: () => void;
  emptyText?: string;
}
```

- [ ] **Step 2: Destructure mới + edit actions (lines 36-106)**

Update destructuring to include `onRedirectCard, onSwitchToCkOutside`.

Replace actions block (lines 80-106):

```tsx
            actions={
              status === "awaiting" && !readOnly ? (
                t.method === "cash" ? (
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
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={t.method === "card" || t.method === "installment" ? onRedirectCard : onSwitchToCkOutside}
                  >
                    {t.method === "card" || t.method === "installment" ? "→ mPOS/Payoo" : "→ CK ngoài"}
                  </Button>
                )
              ) : undefined
            }
```

- [ ] **Step 3: Update caller trong ReconciliationTab.tsx**

Find `<ReconTxnCards` usage, add 2 props:

```tsx
                onRedirectCard={() => navigate("reconCard")}
                onSwitchToCkOutside={() => setTab("ckOutside")}
```

- [ ] **Step 4: Verify — `cd frontend && npx tsc -b`**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/reconciliation/ReconTxnCards.tsx frontend/src/components/ReconciliationTab.tsx
git commit -m "feat(recon): mobile — nút redirect non-cash sang tab/page tương ứng"
```

---

### Task 5: FE — Bulk bar + checkbox chỉ cho tiền mặt

**Files:**
- Modify: `frontend/src/components/ReconciliationTab.tsx:1066-1069, 836-892`

- [ ] **Step 1: Checkbox disable non-cash (line 1069)**

```tsx
                          disabled={status !== "awaiting" || t.method !== "cash"}
```

- [ ] **Step 2: Bulk confirm filter cash only (line 874-876)**

```tsx
                      const picked = [...selectedIds]
                        .map((key) => transactions.find((x) => x.key === key))
                        .filter((t): t is FlatTransaction => !!t && t.method === "cash");
                      const toConfirm = picked.filter((t) => !billRequiredButMissing(t));
```

Remove `blocked` check (line 877-881) — non-cash can't be selected nên không cần.

- [ ] **Step 3: Verify — `cd frontend && npx tsc -b`**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReconciliationTab.tsx
git commit -m "feat(recon): bulk confirm + checkbox chỉ cho lần TT tiền mặt"
```

---

### Task 6: BE — Scoring trong `bank_txn_match_candidates`

**Files:**
- Modify: `backend/sepay_routes.py`

Thêm hàm `_score_candidate(content, candidate, txn_amount)` — parse NDCK, chấm điểm khớp SĐT/mã TT/tên/số tiền, trả `match_signals` list + `score` int. Sửa `bank_txn_match_candidates` sort theo score DESC thay vì chỉ amount proximity.

**Scoring weights:**
| Signal | Điểm | Logic |
|---|---|---|
| Mã TT (transfer_code) | +120 | `candidate.transfer_code` xuất hiện trong NDCK |
| SĐT | +100 | regex `0\d{9}` từ NDCK khớp `candidate.pr_phone` |
| Cùng số tiền | +50 | `abs(txn_amount - candidate.amount) < 1` |
| Tên | +30 | word từ NDCK khớp word trong `pr_name` (≥2 ký tự, bỏ noise) |

- [ ] **Step 1: Thêm `_score_candidate` function**

Add above `bank_txn_match_candidates` (around line 680):

```python
import re as _re

_PHONE_RE = _re.compile(r"(?:^|\D)(0\d{9})(?:\D|$)")
_NOISE_WORDS = {"CK", "CHUYEN", "KHOAN", "THANH", "TOAN", "TIEN", "HOC", "PHI",
                "GD", "IBFT", "VCB", "TCB", "MB", "ACB", "BIDV", "VIETINBANK",
                "VIETCOMBANK", "SACOMBANK", "TECHCOMBANK", "MBBANK", "NGUYEN", "TRAN",
                "LE", "PHAM", "HOANG", "DANG", "BUI", "DO", "HO", "NGO", "DUONG", "LY",
                "VU", "VO", "TRUONG", "VND", "CT", "TU", "DEN", "CHO", "TAI"}

def _score_candidate(content: str, cand: dict, txn_amount: float) -> tuple[int, list[str]]:
    """Return (score, match_signals) for a candidate vs NDCK content."""
    score = 0
    signals: list[str] = []
    desc = _clean_text(content).upper()
    if not desc:
        if abs(txn_amount - cand.get("amount", 0)) < 1:
            return 50, ["amount"]
        return 0, []

    # Mã TT
    tc = _clean_text(cand.get("transfer_code", "")).upper()
    if tc and len(tc) >= 4 and tc in desc:
        score += 120
        signals.append("code")

    # SĐT
    phones_in_content = _PHONE_RE.findall(desc.replace(" ", ""))
    cand_phone = _clean_text(cand.get("pr_phone", "")).replace(" ", "")
    if cand_phone and len(cand_phone) >= 9:
        cand_phone_norm = cand_phone[-9:]
        for p in phones_in_content:
            if p[-9:] == cand_phone_norm:
                score += 100
                signals.append("phone")
                break

    # Cùng số tiền
    if abs(txn_amount - cand.get("amount", 0)) < 1:
        score += 50
        signals.append("amount")

    # Tên
    cand_name = _clean_text(cand.get("pr_name", "")).upper()
    if cand_name:
        name_words = [w for w in cand_name.split() if len(w) >= 2 and w not in _NOISE_WORDS]
        if name_words:
            desc_words = set(desc.split())
            matched = sum(1 for w in name_words if w in desc_words)
            if matched >= 1 and matched >= len(name_words) * 0.5:
                score += 30
                signals.append("name")

    return score, signals
```

- [ ] **Step 2: Sửa `bank_txn_match_candidates` — gọi scoring + sort theo score**

In the candidate-building loop (line 804-827), after building `candidates` list, add:

```python
        # Scoring: parse txn.content → score each candidate
        txn_content = txn.get("content", "") or txn.get("description", "") or ""
        for c in candidates:
            sc, sigs = _score_candidate(txn_content, c, txn_amount)
            c["score"] = sc
            c["match_signals"] = sigs

        # Sort: score DESC (primary), amount proximity ASC (secondary)
        candidates.sort(key=lambda c: (-c["score"], abs(c["amount"] - txn_amount) if txn_amount > 0 else 0))
```

This replaces the existing sort at line 829-830.

- [ ] **Step 3: Verify — test locally**

```bash
curl -s "http://localhost:8000/api/v1/bank-transactions/<txn_id>/match-candidates" \
  -H "Authorization: Bearer <token>" | python -m json.tool | head -40
```

Check `score` and `match_signals` fields in response.

- [ ] **Step 4: Commit**

```bash
git add backend/sepay_routes.py
git commit -m "feat(recon): scoring cho match-candidates — parse NDCK, chấm điểm SĐT/mã/tên/tiền"
```

---

### Task 7: FE — Badge scoring trên candidate card trong drawer Ghép

**Files:**
- Modify: `frontend/src/components/ReconciliationTab.tsx:1690-1734`

Thêm dòng badge compact trên mỗi candidate card. Badge: "Khớp mã TT", "Khớp SĐT", "Cùng số tiền", "Có bill"/"Chưa có bill" — tất cả trên 1 dòng.

- [ ] **Step 1: Update candidate type (nếu cần)**

Thêm vào type ở đầu file hoặc inline:

```typescript
// Candidate from BE now has score + match_signals
interface BankCandidate {
  // ... existing fields ...
  score?: number;
  match_signals?: string[];
}
```

Hoặc nếu dùng `any[]` cho `bankCandidates`, chỉ cần access `c.match_signals` trực tiếp.

- [ ] **Step 2: Thêm badge row vào candidate card (line 1724-1731)**

Replace dòng cuối trong candidate card (từ `<div style={{ fontSize: 12, ...` đến hết `Chưa có bill` badge):

```tsx
                                  <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 3 }}>
                                    {c.method} · {c.status} · mã: {c.transfer_code || "—"}{c.created_at ? ` · ${formatPaymentDateFull(c.created_at)}` : ""}
                                  </div>
                                  {/* Scoring badges */}
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                                    {c.match_signals?.includes("code") && (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--primary-bg, rgba(99,102,241,0.1))", color: "var(--primary)", fontWeight: 600 }}>Khớp mã TT</span>
                                    )}
                                    {c.match_signals?.includes("phone") && (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--primary-bg, rgba(99,102,241,0.1))", color: "var(--primary)", fontWeight: 600 }}>Khớp SĐT</span>
                                    )}
                                    {c.match_signals?.includes("name") && (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--primary-bg, rgba(99,102,241,0.1))", color: "var(--primary)", fontWeight: 600 }}>Khớp tên</span>
                                    )}
                                    {exactAmount && (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--success-bg, #dcfce7)", color: "var(--success-text, #166534)", fontWeight: 600 }}>Cùng số tiền</span>
                                    )}
                                    {c.has_bill ? (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--success-bg, #dcfce7)", color: "var(--success-text, #166534)", fontWeight: 600 }}>Có bill</span>
                                    ) : (
                                      <span style={{ fontSize: 10.5, padding: "1px 6px", borderRadius: 4, background: "var(--warning-bg, #fef9c3)", color: "var(--warning-text, #92400e)", fontWeight: 600 }}>Chưa có bill</span>
                                    )}
                                  </div>
```

- [ ] **Step 3: Verify — `cd frontend && npx tsc -b`**

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ReconciliationTab.tsx
git commit -m "feat(recon): badge scoring trên candidate card — Khớp mã TT/SĐT/tên + Có bill"
```

---

### Task 8: Verify trên browser

- [ ] **Step 1: Tab Chờ xác nhận**

Kiểm tra:
- Lần TT `cash` → nút ✓ Xác nhận + ✗ Từ chối (như cũ)
- Lần TT `qr`/`transfer` → nút ✓ (icon check), bấm → chuyển sang tab CK ngoài chờ ghép
- Lần TT `card`/`installment` → nút ✓, bấm → chuyển sang page mPOS/Payoo
- Checkbox chỉ enable cho `cash`
- Bulk "Xác nhận đã chọn" chỉ confirm `cash`

- [ ] **Step 2: Drawer Ghép CK ngoài**

Mở tab CK ngoài chờ ghép → bấm Ghép → kiểm tra:
- Candidate cards hiện badge row: "Khớp mã TT", "Khớp SĐT", "Khớp tên", "Cùng số tiền", "Có bill"/"Chưa có bill"
- Cards sort theo score (candidate khớp nhiều signal ở trên)
- Badge không làm bể layout card

- [ ] **Step 3: Mobile layout**

Resize viewport → mobile → kiểm tra ReconTxnCards cùng logic redirect.

- [ ] **Step 4: Squash commits nếu cần**
