# HANDOFF — TOP 2.4: Soft-lock bill cho quẹt thẻ / trả góp

**Origin:** Feedback họp 27/06/2026. Anh Hiếu: *"Thêm 1 điều kiện soft-lock: bắt buộc sale phải up ảnh bill cho các lần giao dịch quẹt thẻ/trả góp để kế toán xác nhận; nếu không up ảnh bill thì kế toán từ chối xác nhận."*

**Quyết định đã chốt (anh Minh 27/6):** **Chặn nút + banner cảnh báo + BE guard.** Lần TT `method ∈ {card, installment}` mà **chưa có ảnh bill** → nút "Xác nhận tiền về" bị disable + banner nhắc; kế toán vẫn **Từ chối** được. BE chặn confirm trả 400 (phòng gọi API trực tiếp / bulk).

**Estimated effort:** ~2.5h. **FE** (ReconciliationTab) + **BE** (1 guard trong confirm route). KHÔNG migration.

---

## Bối cảnh (ĐÃ verify)

- Kế toán xác nhận qua: `PATCH /api/v1/transactions/{id}/status` body `{status:"paid"}` → BE [`patch_transaction_status`](../backend/payment_request_routes.py) dòng **2201–2276**. FE gọi qua `confirmTransaction` ([PaymentFlowContext.tsx:294–319](../frontend/src/contexts/PaymentFlowContext.tsx)) → `endpoints.transactions.patchStatus` ([api.ts:267](../frontend/src/lib/api.ts)).
- FE **đã** surface `err.response.data.detail` lên người dùng ([PaymentFlowContext.tsx:320–323](../frontend/src/contexts/PaymentFlowContext.tsx)) → BE guard trả 400 + detail là hiện banner đúng chỗ.
- `payment_lines` có `bill_image` (text) + `bill_images` (json array). FE đã có helper `getBillsForTxn(t)` ([ReconciliationTab.tsx:38–47](../frontend/src/components/ReconciliationTab.tsx)) trả mảng ảnh; `hasBill` tính ở dòng **1009**.
- Trong drawer: `billImages = getBillsForTxn(drawerTxn)` (dòng 1150). Nút "Xác nhận tiền về" ở dòng **1457–1465**; nút bulk-confirm dòng **856–874**; quick-action xác nhận trên hàng dòng **1104–1113**.
- `FlatTransaction.method` ∈ `"qr" | "cash" | "card" | "installment"`.

---

## Scope

### IN scope
1. **FE drawer (kế toán)** — method ∈ {card, installment} && không có bill → disable nút "Xác nhận tiền về" + banner cảnh báo; "Từ chối" giữ bật.
2. **FE hàng (quick action) + bulk-confirm** — không cho xác nhận dòng card/trả góp thiếu bill (disable quick-confirm; loại khỏi bulk-confirm + cảnh báo).
3. **BE guard** — `patch_transaction_status`: khi `status="paid"` && method ∈ {card, installment} && chưa có bill → `HTTPException(400, "...")`.
4. **FE reminder (sale)** — trên PR drawer (màn sale), dòng lần TT card/trả góp `pending` chưa có bill → hiện badge nhắc "Cần ảnh bill để kế toán xác nhận". (Đúng ý feedback: *"hiện ngay 1 thông báo trên lần TT đó: Để được xác nhận, yêu cầu sales cung cấp ảnh bill"*.)

### OUT of scope
- KHÔNG áp soft-lock cho `qr` / `cash` (CK có thể auto-match SePay, tiền mặt có phiếu thu — không bắt buộc bill).
- KHÔNG đụng luồng ghép ở tab Đối soát thẻ (CardReconciliationTab) — ở đó đã có cảnh báo mềm "chưa có ảnh bill", giữ nguyên; soft-lock này là cho **kế toán xác nhận tiền về**.
- KHÔNG **chặn** việc tạo lần TT khi chưa có bill (sale tạo trước, up bill sau) — item 4 chỉ là **nhắc** (badge), KHÔNG block nút tạo. Chỉ **chặn** ở bước **kế toán xác nhận** (item 1–3).

---

## A. BE — `backend/payment_request_routes.py`

Thêm guard trong `patch_transaction_status`, NGAY SAU khi có `line` (sau dòng 2223 `line = line_res.data[0]`), TRƯỚC khi build patch:
```python
# TOP2.4 soft-lock: quẹt thẻ / trả góp PHẢI có ảnh bill mới được xác nhận tiền về.
if status == "paid" and _clean_text(line.get("method")).lower() in ("card", "installment"):
    bill_images = line.get("bill_images")
    has_bill = (isinstance(bill_images, list) and len(bill_images) > 0) or bool(_clean_text(line.get("bill_image")))
    if not has_bill:
        raise HTTPException(
            400,
            "Lan thanh toan quet the/tra gop chua co anh bill — yeu cau sales upload bill truoc khi xac nhan.",
        )
```
> Đặt SAU check `can_confirm_payment` (đã có dòng 2209) và SAU khi `status = _normalize_line_status(...)`. Guard chỉ chạy khi `status == "paid"`, không ảnh hưởng "rejected"/"pending".

---

## B. FE — `frontend/src/components/ReconciliationTab.tsx`

### 1. Helper xác định cần khoá
Thêm gần đầu file (cạnh `getBillsForTxn`):
```tsx
// Quẹt thẻ / trả góp bắt buộc có bill mới cho kế toán xác nhận (TOP2.4).
function billRequiredButMissing(t: FlatTransaction): boolean {
  if (t.method !== "card" && t.method !== "installment") return false;
  return getBillsForTxn(t).length === 0 && !t.bill;
}
```

### 2. Drawer — banner + disable nút (dòng 1447–1466)
Trong nhánh `status === "awaiting" && !readOnly`:
```tsx
{status === "awaiting" && !readOnly && (() => {
  const lockedNoBill = billRequiredButMissing(drawerTxn);
  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        style={{ color: "var(--danger)" }}
        onClick={() => handleReject(drawerTxn, "Từ chối")}
      >
        <Icons.XCircle size={14} /> Từ chối
      </button>
      <button
        type="button"
        className="btn btn-success"
        disabled={lockedNoBill}
        title={lockedNoBill ? "Cần ảnh bill quẹt thẻ/trả góp trước khi xác nhận" : undefined}
        onClick={() => {
          const extra = drawerTxn.method === "installment" ? {
            verified_total: parseInt(verifiedTotalDraft, 10) || undefined,
            verified_received: parseInt(verifiedReceivedDraft, 10) || undefined,
          } : undefined;
          void handleConfirm(drawerTxn, extra);
        }}
      >
        <Icons.Check size={14} strokeWidth={2.5} /> Xác nhận tiền về
      </button>
    </>
  );
})()}
```
Và thêm **banner** ngay trên hàng nút (trong `.drawer-foot`, trước dòng 1442 "Xác nhận sẽ cập nhật…"):
```tsx
{status === "awaiting" && billRequiredButMissing(drawerTxn) && (
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    background: "var(--warning-bg)", color: "var(--warning-text)",
    border: "1px solid var(--warning-text)", borderRadius: 8,
    padding: "8px 12px", fontSize: 12.5,
  }}>
    <Icons.AlertCircle size={15} />
    Để được xác nhận, yêu cầu sales upload ảnh bill cho lần {drawerTxn.method === "installment" ? "trả góp" : "quẹt thẻ"} này.
  </div>
)}
```

### 3. Quick-action trên hàng (dòng 1104–1113)
Disable nút check xanh khi thiếu bill:
```tsx
<button
  type="button"
  className="btn-icon-success"
  title={billRequiredButMissing(t) ? "Cần ảnh bill quẹt thẻ/trả góp" : "Xác nhận tiền về"}
  disabled={billRequiredButMissing(t)}
  onClick={() => { if (!billRequiredButMissing(t)) void handleConfirm(t); }}
>
  <Icons.Check size={14} strokeWidth={2.5} />
</button>
```

### 4. Bulk-confirm (dòng 856–874)
Loại dòng thiếu bill khỏi lượt xác nhận hàng loạt + báo cho kế toán:
```tsx
onClick={async () => {
  setIsBulkConfirming(true);
  try {
    const picked = [...selectedIds]
      .map((key) => transactions.find((x) => x.key === key))
      .filter((t): t is FlatTransaction => !!t);
    const blocked = picked.filter(billRequiredButMissing);
    const toConfirm = picked.filter((t) => !billRequiredButMissing(t));
    await Promise.all(toConfirm.map((t) => handleConfirm(t)));
    if (blocked.length > 0) {
      alert(`${blocked.length} giao dịch quẹt thẻ/trả góp chưa có bill — đã bỏ qua, chưa xác nhận.`);
    }
  } finally {
    setSelectedIds(new Set());
    setIsBulkConfirming(false);
  }
}}
```
> (Tuỳ chọn nâng cấp) checkbox chọn hàng có thể disable cho dòng thiếu bill; nhưng lọc ở bulk-confirm là đủ guard.

### 5. Nút "Mở lại — Xác nhận" (rejected → paid, dòng 1468–1478)
Dòng card/trả góp đã bị từ chối, khi mở lại vẫn phải có bill. Disable tương tự:
```tsx
{status === "rejected" && !readOnly && (
  <button
    type="button"
    className="btn btn-outline"
    disabled={billRequiredButMissing(drawerTxn)}
    title={billRequiredButMissing(drawerTxn) ? "Cần ảnh bill quẹt thẻ/trả góp" : undefined}
    onClick={() => {
      if (billRequiredButMissing(drawerTxn)) return;
      const extra = drawerTxn.method === "installment" ? {
        verified_total: parseInt(verifiedTotalDraft, 10) || undefined,
        verified_received: parseInt(verifiedReceivedDraft, 10) || undefined,
      } : undefined;
      void handleConfirm(drawerTxn, extra);
    }}
  >
    <Icons.Clock size={14} /> Mở lại — Xác nhận
  </button>
)}
```
> BE guard (mục A) vẫn backstop nếu FE sót — 400 sẽ hiện qua `apiNote`.

---

## C. FE reminder phía sale — `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

Dòng lần TT render ở component "qr-row v2" (dòng 213+); chi tiết ở `qr-info-line2` (dòng 281–321). Thêm badge nhắc khi card/trả góp `pending` chưa có bill — đặt trong `qr-info-line2`, sau block lý do từ chối (sau dòng 298):
```tsx
{(qr.method === "card" || qr.method === "installment") && qr.status === "pending" && !qr.billImage && !qr.bill && (
  <>
    <span className="sep" />
    <span style={{ color: "var(--warning-text)", fontWeight: 600, whiteSpace: "nowrap" }}>
      <Icons.AlertCircle size={11} style={{ verticalAlign: "-1px", marginRight: 2 }} />
      Cần ảnh bill để kế toán xác nhận
    </span>
  </>
)}
```
> `Icons` đã import sẵn trong file. Badge chỉ nhắc, ô upload bill (`BillUploadZone` dòng 324) đã có ngay cạnh — sale bấm upload tại chỗ.

---

## Acceptance criteria
1. Lần TT **quẹt thẻ** chưa có bill, tab Chờ xác nhận: nút "Xác nhận tiền về" (drawer + quick-action) **disabled**; drawer hiện banner nhắc upload bill; "Từ chối" vẫn bấm được.
2. Sau khi sales upload bill → mở lại → nút "Xác nhận tiền về" **bật**, xác nhận thành công.
3. Lần TT **trả góp** hành xử y như trên (banner ghi "trả góp").
4. Lần TT **qr / cash**: KHÔNG bị khoá (xác nhận bình thường dù chưa có bill).
5. Gọi API confirm trực tiếp (hoặc bulk) lên line card/trả góp thiếu bill → BE trả **400** với detail; FE hiện thông báo, KHÔNG set paid.
6. Bulk-confirm hỗn hợp: dòng có bill được xác nhận, dòng thiếu bill bị bỏ qua + alert.
7. Nút "Mở lại — Xác nhận" (line card/trả góp bị từ chối, chưa bill) cũng disabled.
8. **PR drawer (màn sale):** lần TT card/trả góp `pending` chưa bill → hiện badge "Cần ảnh bill để kế toán xác nhận"; upload xong badge biến mất. qr/cash KHÔNG có badge.
9. `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

---

## Test plan
```bash
cd frontend && npx tsc -b && npm run test
cd backend && powershell ./run.ps1   # test guard 400
```
Manual (sandbox `test.admin@dev`):
1. Tạo lần TT quẹt thẻ KHÔNG bill → tab Đối soát → Chờ xác nhận → nút xác nhận xám + banner.
2. Upload bill (qua drawer/PR) → nút bật → xác nhận OK.
3. Lần TT trả góp không bill → tương tự.
4. Lần TT CK (qr) không bill → vẫn xác nhận được.
5. (BE) `curl -X PATCH .../transactions/{card_line_no_bill}/status -d '{"status":"paid"}'` → 400.

---

## Anti-patterns (đừng làm)
1. 🚫 ĐỪNG khoá `qr`/`cash` — chỉ card + installment.
2. ĐỪNG chỉ làm FE mà bỏ BE guard (anh Minh chốt có guard) — bulk/API trực tiếp sẽ lách được.
3. ĐỪNG chặn nút "Từ chối" — kế toán phải từ chối được khi thiếu bill.
4. ĐỪNG chặn lúc **tạo** lần TT — sale up bill sau, chỉ chặn ở bước xác nhận.
5. ĐỪNG để bulk-confirm âm thầm bỏ qua mà không báo — phải alert số bị bỏ.
6. ĐỪNG ship khi `tsc -b` chưa pass.
