# HANDOFF — TOP 1: Xóa field "Thực nhận về công ty" (Sales nhập)

**Origin:** Feedback họp Onboard Offline 23/06/2026. Anh Hiếu yêu cầu sale chỉ nhập tổng tiền KH chuyển; "thực nhận" do kế toán đối chiếu sau.

**Estimated effort:** 45 phút FE-only. KHÔNG cần BE migration.

---

## Scope

### IN scope
1. Xóa input field "Thực nhận về công ty" trong form "Tạo lần thanh toán" của drawer PR (khi method = `installment`)
2. Xóa validation bắt buộc + validation "thực nhận ≤ tổng trả góp"
3. Xóa field `sale_received` khỏi payload gửi BE
4. Sửa 2 chỗ hiển thị ở `ReconciliationTab.tsx` để KHÔNG hiện `→ 0đ` khi `saleReceived` null
5. Sửa display chip ở `paymentRequestUtils.ts` (hàm tóm tắt method)

### OUT of scope (KHÔNG được làm)
- KHÔNG xóa cột `sale_received` ở DB (records cũ đang dùng)
- KHÔNG xóa field `sale_received` ở BE schema (FastAPI Pydantic model) — vẫn nhận nullable, để API backward compat
- KHÔNG đụng vào input "Thực nhận về công ty (sau phí)" của KẾ TOÁN ở ReconciliationTab line ~1418 — đây là field kế toán nhập (ghi vào `verified_received`), khác hoàn toàn
- KHÔNG đụng vào block "Kế toán đã xác nhận" ở drawer ReconciliationTab line ~1432
- KHÔNG refactor unified types, KHÔNG đổi tên field
- KHÔNG thêm migration

---

## Files cần sửa (FE only)

### 1. `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

**Xóa state (line 335):**
```tsx
const [saleReceivedDraft, setSaleReceivedDraft] = useState("");
```

**Xóa 2 validation (line 360-372):**
```tsx
// XÓA BLOCK NÀY:
if (method === "installment" && !saleReceivedDraft) {
  setValidationError("Vui lòng nhập số tiền thực nhận về công ty");
  return;
}
// Bug 1B-07: trả góp — thực nhận không thể lớn hơn tổng trả góp
if (method === "installment") {
  const totalNum = parseInt(installmentTotal.replace(/\D/g, ""), 10) || 0;
  const recvNum = parseInt(saleReceivedDraft.replace(/\D/g, ""), 10) || 0;
  if (recvNum > totalNum) {
    setValidationError("Số tiền thực nhận không thể lớn hơn tổng trả góp");
    return;
  }
}
```

**Xóa field khỏi payload (line 391):**
```tsx
sale_received: method === "installment" ? (parseInt(saleReceivedDraft.replace(/\D/g, ""), 10) || undefined) : undefined,
// → XÓA HẲN dòng này
```

**Xóa UI block (line 511-519):**
```tsx
<div className="field" style={{ flex: 1, minWidth: 160 }}>
  <label>Thực nhận về công ty <span style={{ color: "var(--danger)" }}>*</span></label>
  <input
    inputMode="numeric"
    placeholder="Sau phí nền tảng"
    value={saleReceivedDraft}
    onChange={(e) => setSaleReceivedDraft(e.target.value.replace(/[^\d]/g, ""))}
  />
</div>
```

### 2. `frontend/src/components/payment-request/paymentRequestUtils.ts` (line ~170)

**Trước:**
```tsx
: qr.method === "installment"
? `${qr.installmentPlatform || "Trả góp"}${qr.installmentTotal ? ` · ${vnd(qr.installmentTotal)}` : ""}${qr.saleReceived ? ` → ${vnd(qr.saleReceived)}` : ""}`
: "";
```

**Sau:**
```tsx
: qr.method === "installment"
? `${qr.installmentPlatform || "Trả góp"}${qr.installmentTotal ? ` · ${vnd(qr.installmentTotal)}` : ""}`
: "";
```
→ Bỏ phần `${qr.saleReceived ? ...}`. Chip chỉ hiện platform + tổng.

### 3. `frontend/src/components/ReconciliationTab.tsx` — Chỗ 1 (line 1068-1075)

**Trước:**
```tsx
{t.method === "installment" && t.installmentTotal != null && (
  <div className="cell-sub">
    {vnd(t.installmentTotal)} → {vnd(t.saleReceived ?? 0)}
    {t.verifiedReceived != null && t.verifiedReceived !== t.saleReceived && (
      <span style={{ color: "var(--success-text)", marginLeft: 4 }}>✓ {vnd(t.verifiedReceived)}</span>
    )}
  </div>
)}
```

**Sau:**
```tsx
{t.method === "installment" && t.installmentTotal != null && (
  <div className="cell-sub">
    KH chuyển: {vnd(t.installmentTotal)}
    {t.verifiedReceived != null && (
      <span style={{ color: "var(--success-text)", marginLeft: 4 }}>✓ thực nhận {vnd(t.verifiedReceived)}</span>
    )}
  </div>
)}
```

### 4. `frontend/src/components/ReconciliationTab.tsx` — Chỗ 2 (line 1293-1294)

**Trước:**
```tsx
{drawerTxn.method === "installment" &&
  `${drawerTxn.installmentPlatform || "Trả góp"}${drawerTxn.installmentTotal != null ? ` · ${vnd(drawerTxn.installmentTotal)} → ${vnd(drawerTxn.saleReceived ?? 0)}` : ""}`}
```

**Sau:**
```tsx
{drawerTxn.method === "installment" &&
  `${drawerTxn.installmentPlatform || "Trả góp"}${drawerTxn.installmentTotal != null ? ` · KH chuyển ${vnd(drawerTxn.installmentTotal)}` : ""}`}
```

---

## Acceptance criteria

1. Mở drawer PR → bấm "Tạo lần thanh toán" → chọn "Trả góp" → form chỉ còn:
   - Nền tảng trả góp (Payoo / Mpos)
   - Tổng tiền trả góp
   - (KHÔNG còn ô "Thực nhận về công ty")
2. Bấm "Ghi nhận lần thanh toán" với 2 field trên (Payoo + 8.000) → submit thành công, không lỗi validation
3. Network request POST `/payment-requests/{id}/payment-attempts` body KHÔNG có key `sale_received`
4. Mở tab Đối soát giao dịch → record installment mới tạo → cell hiện "KH chuyển: 8.000đ" (KHÔNG có `→ 0đ`)
5. Mở drawer record installment cũ (có `sale_received` từ trước) → vẫn hiển thị bình thường, không vỡ
6. Khi kế toán nhập "Thực nhận về công ty (sau phí)" ở ReconciliationTab và lưu → cell + drawer hiển thị ✓ kèm `verified_received`

---

## Test plan

### Unit / type check
```bash
cd frontend && npx tsc -b
```
Phải PASS. Nếu có TS error về `saleReceivedDraft` không tồn tại → check còn ref cũ ở đâu.

### Manual test (sandbox)
URL: https://palfish-gmv-manager-sandbox.vercel.app/

**Sandbox đã có migration TOP1-02 (backfill 23/6)** — `installment_platform`, `installment_total`, `sale_received`, `verified_total`, `verified_received` đều có. Tạo lần TT trả góp được.

Login `test.admin@dev` → vào Quản lý thanh toán → mở 1 PR còn thiếu tiền → "Tạo lần thanh toán" → "Trả góp":
1. Confirm UI chỉ còn 2 field (platform + tổng)
2. Submit Payoo + 8000 → thành công
3. Mở DevTools Network → request body không có `sale_received`
4. Sang tab "Đối soát giao dịch" → tìm record vừa tạo → confirm cell hiển thị "KH chuyển: 8.000đ"
5. Bấm vào row → drawer hiện "Payoo · KH chuyển 8.000đ"
6. Kế toán nhập "Thực nhận (sau phí)" = 7800 → lưu → confirm cell có ✓ 7.800đ

### Regression
- Tạo lần TT method khác (qr/cash/card) → không bị vỡ
- Mở PR cũ có record installment cũ (đã có `sale_received`) → không vỡ UI

---

## Anti-patterns (đừng làm)

1. **ĐỪNG** xóa `sale_received` khỏi TypeScript type `PaymentAttempt` — BE còn return nullable, type vẫn nhận để display records cũ
2. **ĐỪNG** xóa nullable check `t.saleReceived` ở các chỗ display khác (nếu còn) — cần để render records cũ
3. **ĐỪNG** rename `installment_total` → `kh_chuyen` hay tương tự
4. **ĐỪNG** thêm migration drop column
5. **ĐỪNG** ship khi `tsc -b` chưa pass
6. **ĐỪNG** quên test record cũ (regression)

---

## Out-of-scope catch — nếu phát hiện thêm chỗ nào dùng `saleReceived` / `sale_received`

Chạy grep:
```
grep -rn "sale_received\|saleReceived" frontend/src backend
```

Quyết định case-by-case:
- Nếu là **input** từ sale (form/payload) → xóa
- Nếu là **display** (hiển thị records cũ) → giữ NHƯNG thêm null-guard để không hiện "→ 0đ"
- Nếu là **BE schema/API response** → giữ nguyên
