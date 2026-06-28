# HANDOFF — TOP 2.3: Đơn giản form ghi nhận trả góp

**Origin:** Feedback họp 27/06/2026. Anh Hiếu: *"Thanh toán trả góp: bỏ 1 trường điền số tiền lần này, giữ trường Tổng tiền trả góp và đẩy lên đầu."*

**Estimated effort:** ~1h. **FE-only.** KHÔNG đụng BE. KHÔNG migration.

**Vì sao FE-only:** BE `addPayment` ([payment_request_routes.py:1926–1958](../backend/payment_request_routes.py)) lấy `line.amount = body.amount` và lưu `installment_total` riêng. Nếu FE gửi `amount = installmentTotal` thì BE chạy đúng nguyên trạng (line.amount = tổng KH trả góp = đã đúng bản chất "đã nhận" cho trả góp). **KHÔNG cần sửa BE.**

---

## Bối cảnh (ĐÃ verify)

Form là `AddPaymentForm` trong [`PaymentRequestDetailDrawer.tsx`](../frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx):
- Field "Số tiền lần này" (bắt buộc) dòng **460–477** — render cho **mọi** method (đứng đầu hàng).
- Block installment dòng **513–537**: hiện thứ tự **Nền tảng trả góp → Tổng tiền trả góp**.
- `submit()` dòng **385–419**: validate `amount` từ state `amount`; gửi `onSubmit({ amount: n, ..., installment_total })`.

Hiện trạng khi chọn Trả góp: thấy 3 ô → **[Số tiền lần này] [Nền tảng] [Tổng tiền]**. Thừa "Số tiền lần này" (trả góp chỉ có 1 lần = tổng).

Mục tiêu khi chọn Trả góp: **[Tổng tiền trả góp] [Nền tảng trả góp] [Mã đối soát]** — bỏ "Số tiền lần này".

---

## Scope

### IN scope (FE only)
1. Ẩn field "Số tiền lần này" khi `method === "installment"`.
2. Đưa "Tổng tiền trả góp" lên **đầu** block installment (trước "Nền tảng trả góp").
3. `submit()`: khi trả góp → `amount` = giá trị "Tổng tiền trả góp"; validate dựa trên `installmentTotal`.

### OUT of scope
- KHÔNG đổi method khác (qr/cash/card) — field "Số tiền lần này" vẫn hiển thị bình thường.
- KHÔNG đổi BE, không đổi cách lưu `installment_total`.
- KHÔNG đổi cách hiển thị "đã nhận" trên card (đó là TOP2.1 riêng — [[HANDOFF_TOP2-1_CARD_INSTALLMENT_NET_RECEIVED]]).

---

## Cách sửa — `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

### 1. Ẩn "Số tiền lần này" cho trả góp (dòng 461–477)
Bọc field hiện tại bằng điều kiện:
```tsx
{method !== "installment" && (
  <div className="field" style={{ flex: 1, minWidth: 180 }}>
    <label>Số tiền lần này <span style={{ color: "var(--danger)" }}>*</span></label>
    <input
      type="text"
      placeholder={`Còn thiếu: ${vnd(remaining)}`}
      value={isAmountFocused ? amount : amount ? Number(amount).toLocaleString("vi-VN") : ""}
      inputMode="numeric"
      pattern="[0-9]*"
      onFocus={() => setIsAmountFocused(true)}
      onBlur={() => setIsAmountFocused(false)}
      onChange={(e) => {
        const v = e.target.value.replace(/[^\d]/g, "");
        setAmount(v);
        if (v) setValidationError("");
      }}
    />
  </div>
)}
```

### 2. Đảo thứ tự block installment (dòng 513–537) — Tổng tiền TRƯỚC, Nền tảng SAU
```tsx
{method === "installment" && (
  <>
    <div className="field" style={{ flex: 1, minWidth: 160 }}>
      <label>Tổng tiền trả góp <span style={{ color: "var(--danger)" }}>*</span></label>
      <input
        inputMode="numeric"
        placeholder="Tổng số tiền KH bấm trả góp"
        value={installmentTotal}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d]/g, "");
          setInstallmentTotal(v);
          if (v) setValidationError("");
        }}
      />
    </div>
    <div className="field" style={{ flex: 1, minWidth: 140 }}>
      <label>Nền tảng trả góp <span style={{ color: "var(--danger)" }}>*</span></label>
      <select
        value={installmentPlatform}
        onChange={(e) => setInstallmentPlatform(e.target.value)}
        style={{ font: "inherit", fontSize: 13 }}
      >
        <option value="">— Chọn —</option>
        <option value="Payoo">Payoo</option>
        <option value="Mpos">Mpos</option>
      </select>
    </div>
  </>
)}
```
> Giữ value số thô (như nguyên bản `installmentTotal`) — KHÔNG live-format `toLocaleString` trong value vì gây nhảy con trỏ khi sửa (field "Số tiền lần này" né bằng cơ chế `isAmountFocused`, ô này không có nên để thô cho an toàn).

### 3. `submit()` — amount lấy từ tổng trả góp (dòng 385–419)
```tsx
const submit = () => {
  const isInstallment = method === "installment";
  const rawAmount = isInstallment ? installmentTotal : amount;
  const n = parseInt(String(rawAmount).replace(/\D/g, ""), 10);
  if (!n) {
    setValidationError(isInstallment ? "Vui lòng nhập tổng tiền trả góp" : "Vui lòng nhập số tiền thanh toán");
    return;
  }
  if (isInstallment && !installmentPlatform) {
    setValidationError("Vui lòng chọn nền tảng trả góp");
    return;
  }
  // Bug 1B-05: cash — bắt buộc người thu
  if (method === "cash" && !cashier.trim()) {
    setValidationError("Vui lòng nhập tên người thu tiền mặt");
    return;
  }
  // Bug 1B-06: card — 4 số cuối
  if (method === "card" && cardLast4.length !== 4) {
    setValidationError("Vui lòng nhập đủ 4 số cuối thẻ");
    return;
  }
  setValidationError("");
  onSubmit({
    amount: n,
    method,
    bank: method === "qr" || method === "card" ? bank : undefined,
    cardLast4: method === "card" ? cardLast4 : undefined,
    installment_platform: isInstallment ? installmentPlatform : undefined,
    installment_total: isInstallment ? n : undefined,
    cashier: method === "cash" ? cashier : undefined,
    name_for_transfer: method === "qr" ? nameForTransfer : undefined,
  });
};
```
> 🔑 Mấu chốt: `amount: n` với n = tổng trả góp. Bỏ check `!installmentTotal` riêng cũ (đã gộp vào `!n`).

---

## Acceptance criteria
1. Chọn **Trả góp** → chỉ thấy **[Tổng tiền trả góp] [Nền tảng trả góp] [Mã đối soát]**, KHÔNG còn "Số tiền lần này".
2. Thứ tự: Tổng tiền trả góp đứng trước Nền tảng.
3. Bỏ trống Tổng tiền → báo "Vui lòng nhập tổng tiền trả góp". Bỏ trống Nền tảng → báo chọn nền tảng.
4. Ghi nhận xong: lần TT trả góp có `amount` = tổng tiền nhập, `installmentTotal` = cùng giá trị, `installmentPlatform` đúng. PR `received` cộng đúng tổng → trả đủ thì PR `done`.
5. Method khác (qr/cash/card): form KHÔNG đổi.
6. `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

---

## Test plan
```bash
cd frontend && npx tsc -b && npm run test
```
Manual (sandbox `test.admin@dev`):
1. Mở 1 PR → "Thêm lần thanh toán" → chọn Trả góp → xác nhận chỉ có 2 ô (Tổng tiền, Nền tảng) + Mã đối soát.
2. Nhập tổng 8.000.000, Payoo → Ghi nhận → lần TT hiện đúng số; PR `received` +8.000.000.
3. Chọn Quẹt thẻ → "Số tiền lần này" + "4 số cuối thẻ" vẫn hiện như cũ.

---

## Anti-patterns (đừng làm)
1. 🚫 ĐỪNG xoá hẳn state `amount` / field "Số tiền lần này" — method khác vẫn cần. Chỉ ẩn khi installment.
2. ĐỪNG gửi `amount` từ state `amount` khi trả góp (sẽ = 0 / rỗng vì field bị ẩn) — phải lấy từ `installmentTotal`.
3. ĐỪNG đổi BE để "tự suy" amount từ installment_total — không cần, FE gửi đủ.
4. ĐỪNG live-format `toLocaleString` trong `value` ô tổng tiền — nhảy con trỏ khi sửa. Để số thô.
5. ĐỪNG ship khi `tsc -b` chưa pass.
