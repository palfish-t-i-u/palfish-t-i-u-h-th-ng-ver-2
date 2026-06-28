# HANDOFF — TOP 2.1: Card "đã nhận" cho trả góp = số sau phí (kế toán xác nhận)

**Origin:** Feedback họp 25/06/2026. Anh Hiếu: "Card hiện tiền đã nhận trong PR: đối với trường hợp thanh toán trả góp, số tiền 'đã nhận' hiển thị tại card sẽ là số tiền sau khi trừ đi phí (được kế toán xác nhận)."

**Quyết định (anh Minh chốt):** Khi kế toán **CHƯA** xác nhận phí → hiện **gross** (số KH chuyển) + nhãn "chưa trừ phí". Khi **ĐÃ** xác nhận → hiện **net** (sau phí).

**Estimated effort:** ~1.5h **FE-only**. KHÔNG đụng BE. KHÔNG migration.

---

## Bối cảnh & quyết định kỹ thuật QUAN TRỌNG (đã verify)

- PR-level `received` (BE) = tổng `amount` của line `status=paid` (`_sum_paid_amount`). Với trả góp, line `amount` = **tổng KH bấm trả góp = bằng target** → PR đạt `done` → mới kích hoạt khoá học được.
- Số sau phí kế toán nhập = `verifiedReceived` (camelCase FE) / `verified_received` (DB, trên `payment_lines`), nhập ở tab Đối soát.
- FE đã có sẵn `pr.payments: PaymentAttempt[]`, mỗi item có `method`, `amount`, `status`, `verifiedReceived` → **đủ để FE tự tính net, KHÔNG cần BE.**

🚫 **TUYỆT ĐỐI KHÔNG đổi `pr.received` / state / phép tính phân bổ.**
Lý do: nếu để `received` = net (nhỏ hơn target vì trừ phí), PR trả góp sẽ KHÔNG bao giờ đạt `done` → **chặn kích hoạt khoá học**. Đây CHỈ là thay đổi **hiển thị con số "đã nhận"** ở card; mọi logic `remaining`/`progress`/`done`/phân bổ gói học giữ nguyên dùng `received` (gross).

---

## Scope

### IN scope (FE only)
1. Thêm 2 helper vào `paymentRequestUtils.ts`: `displayReceived(pr)` (net cho trả góp đã xác nhận), `hasUnverifiedInstallment(pr)`.
2. Áp `displayReceived` vào **con số "đã nhận" hiển thị** ở: PR card (`PaymentRequestProgress`), drawer summary ("Đã nhận"), và modal huỷ PR (`CancelPrModal`).
3. Hiện nhãn "chưa trừ phí" khi có line trả góp đã trả nhưng chưa được kế toán xác nhận.

### OUT of scope (KHÔNG làm)
- KHÔNG đổi `pr.received`, KHÔNG đổi BE serializer/totals.
- KHÔNG đổi `progressPercent` / thanh bar / `remaining` / `delta` / `state` → vẫn theo `received` (gross). Thanh % phản ánh "KH đã trả đủ chưa", con số phản ánh "thực nhận".
- KHÔNG đổi phân bổ gói học trong drawer (allocation dùng `received` gross — giữ nguyên).
- KHÔNG đổi KPI tổng "Đã thu" (`PaymentRequestKpiCards`) ở task này — xem mục "Tuỳ chọn".

---

## Files cần sửa

### 1. `frontend/src/components/payment-request/paymentRequestUtils.ts`

Thêm (đặt cạnh `vnd`):
```ts
import type { PaymentRequest } from "../../types/paymentRequest";

/** Số tiền THỰC NHẬN để hiển thị trên card.
 *  Trả góp đã được kế toán xác nhận → dùng verifiedReceived (sau phí).
 *  Còn lại (chưa xác nhận / không phải trả góp) → dùng amount (gross).
 *  KHÔNG dùng cho tính state/remaining — chỉ để HIỂN THỊ. */
export function displayReceived(pr: PaymentRequest): number {
  return pr.payments.reduce((sum, p) => {
    if (p.status !== "paid") return sum;
    if (p.method === "installment" && p.verifiedReceived != null) return sum + p.verifiedReceived;
    return sum + p.amount;
  }, 0);
}

/** True khi có lần trả góp đã trả nhưng kế toán CHƯA xác nhận số sau phí. */
export function hasUnverifiedInstallment(pr: PaymentRequest): boolean {
  return pr.payments.some(
    (p) => p.status === "paid" && p.method === "installment" && p.verifiedReceived == null,
  );
}
```
> Nếu file đã import `PaymentRequest` thì bỏ dòng import trùng.

### 2. `frontend/src/components/payment-request/PaymentRequestProgress.tsx`

Hiện (dòng 2, 12-13):
```tsx
import { progressFillClass, progressPercent, vnd } from "./paymentRequestUtils";
...
<span className="prog-amounts" title={`Đã thu ${vnd(request.received)} / dự thu ${vnd(request.target)}`}>
  <strong>{num(request.received)}</strong>
```
Sửa thành:
```tsx
import { progressFillClass, progressPercent, vnd, displayReceived, hasUnverifiedInstallment } from "./paymentRequestUtils";
...
const shown = displayReceived(request);
const unverified = hasUnverifiedInstallment(request);
...
<span
  className="prog-amounts"
  title={
    unverified
      ? `Đã nhận ${vnd(shown)} (chưa trừ phí trả góp) / dự thu ${vnd(request.target)}`
      : `Đã nhận ${vnd(shown)} / dự thu ${vnd(request.target)}`
  }
>
  <strong>{num(shown)}</strong>
  <span> / {vnd(request.target)}</span>
  {unverified && <span className="prog-note" style={{ marginLeft: 4, fontSize: 11, color: "var(--text-3)" }}>(chưa trừ phí)</span>}
</span>
```
> `progressPercent(request)` GIỮ NGUYÊN (dùng `received` gross). KHÔNG đổi thanh bar.

### 3. `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

Summary "Đã nhận" (dòng 1737-1740):
```tsx
<div className="summary is-received">
  <div className="summary-label">Đã nhận</div>
  <div className="summary-value">{vnd(request.received)}</div>
</div>
```
Sửa con số + thêm nhãn:
```tsx
<div className="summary is-received">
  <div className="summary-label">Đã nhận{hasUnverifiedInstallment(request) ? " (chưa trừ phí)" : ""}</div>
  <div className="summary-value">{vnd(displayReceived(request))}</div>
</div>
```
> Import `displayReceived, hasUnverifiedInstallment` từ `./paymentRequestUtils`.
> 🚫 KHÔNG đổi `remaining = Math.max(0, request.target - request.received)` (dòng 366, 1667) và các chỗ `allocation.received` — đó là logic phân bổ, dùng gross.

### 4. `frontend/src/components/payment-request/CancelPrModal.tsx`

Dòng 62:
```tsx
{vnd(pr.target)} · {pr.payments.length} lần TT đã tạo · {pr.received === 0 ? "chưa nhận tiền" : `đã nhận ${vnd(pr.received)}`}
```
Sửa phần "đã nhận":
```tsx
{vnd(pr.target)} · {pr.payments.length} lần TT đã tạo · {displayReceived(pr) === 0 ? "chưa nhận tiền" : `đã nhận ${vnd(displayReceived(pr))}${hasUnverifiedInstallment(pr) ? " (chưa trừ phí)" : ""}`}
```
> Import 2 helper.

---

## Acceptance criteria

1. PR thường (qr/cash/card): card hiển thị "đã nhận" = y như trước (không đổi).
2. PR trả góp **chưa** được kế toán xác nhận phí: card hiện **số gross** + nhãn "(chưa trừ phí)".
3. PR trả góp **đã** được kế toán nhập "Thực nhận (sau phí)" = vd 7.800 (gross 8.000): card hiện **7.800** (net), KHÔNG còn nhãn "chưa trừ phí".
4. Thanh % / trạng thái done/short / kích hoạt khoá học KHÔNG đổi (vẫn theo gross). PR trả góp đã đủ tiền vẫn kích hoạt được bình thường.
5. Drawer: phân bổ gói học vẫn dựa trên gross (không vỡ).
6. `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

---

## Test plan
```bash
cd frontend && npx tsc -b && npm run test
```
Manual (sandbox, `test.admin@dev`):
1. Tạo PR trả góp (Payoo, tổng 8.000) → card hiện "8.000 (chưa trừ phí)".
2. Tab Đối soát → kế toán nhập Thực nhận sau phí = 7.800 → quay lại danh sách PR → card hiện "7.800", hết nhãn.
3. Confirm PR vẫn `done` (đủ tiền), kích hoạt khoá học OK.
4. PR thường: không đổi.

---

## Anti-patterns (đừng làm)
1. 🚫 ĐỪNG đổi `pr.received` hoặc BE → sẽ chặn kích hoạt khoá học trả góp.
2. ĐỪNG đổi `progressPercent` / thanh bar / `remaining` / `delta` / allocation (giữ gross).
3. ĐỪNG dùng `displayReceived` trong bất kỳ phép tính điều kiện (done/short/canAddMore...) — chỉ để HIỂN THỊ.
4. ĐỪNG quên trường hợp `verifiedReceived == null` (chưa xác nhận) → phải fallback gross.
5. ĐỪNG ship khi `tsc -b` chưa pass.

## Tuỳ chọn (hỏi anh Minh nếu muốn mở rộng)
- KPI tổng "Đã thu" (`PaymentRequestKpiCards.tsx` dòng 11/34) hiện cộng `r.received` (gross). Nếu muốn tổng cũng theo net → đổi sang `requests.reduce((s,r)=>s+displayReceived(r),0)`, NHƯNG `ratio`/`remaining` của KPI vẫn nên giữ gross để "Còn thiếu" đúng. Để OUT of scope tới khi anh Minh xác nhận.
- 2 chỗ đếm khác trong drawer (dòng ~2288, ~2520 "Đã nhận/Đã thu X/target") là text phụ trong flow — đổi cho đồng bộ nếu muốn, không bắt buộc.
