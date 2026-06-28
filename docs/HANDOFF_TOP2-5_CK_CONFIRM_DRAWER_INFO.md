# HANDOFF — TOP 2.5: Bổ sung thông tin drawer "Chờ xác nhận" (kế toán)

**Origin:** Feedback họp 27/06/2026. Anh Hiếu: *"Tab Chờ xác nhận hơi mất thời gian vì không [có] ảnh bill sale up, và Thời gian ở đây là thời gian Sale tạo mã QR, không phải thời gian tiền vào. Với chưa có tên sale hiện lên drawer giao dịch nữa → kế toán đang chưa biết xác nhận tiền về căn cứ vào đâu."*

**Estimated effort:** ~1.5h. **FE-only** (data đã có sẵn). KHÔNG migration.

**Liên quan:** vấn đề "không có ảnh bill" được giải quyết bởi soft-lock [[HANDOFF_TOP2-4_BILL_SOFTLOCK]] (buộc sales up bill). Doc này lo **2 thông tin còn thiếu trên drawer**: tên sale + thời gian tiền về.

---

## Bối cảnh (ĐÃ verify — data có sẵn, chỉ thiếu hiển thị)

Drawer ở [`ReconciliationTab.tsx`](../frontend/src/components/ReconciliationTab.tsx), panel "Thông tin giao dịch" dòng **1268–1363**. Hiện có: Phương thức, Ngân hàng/Người thu/4 số cuối, Số tiền, Mã đối soát, **"Sales tạo lúc"** (=`createdAt`, dòng 1306–1309), "Sales upload bill".

Thiếu:
1. **Tên sale phụ trách.** → `drawerTxn.pr.saleName` ĐÃ map sẵn ([paymentRequestUtils.ts:129](../frontend/src/components/payment-request/paymentRequestUtils.ts) `sale_name → saleName`), dùng được khắp app (PaymentRequestTable dòng 234, PR drawer dòng 1720). Trong recon drawer: `pr = drawerTxn.pr` (dòng 1149).
2. **Thời gian tiền về** (khác giờ tạo QR). Nguồn dữ liệu có sẵn:
   - `drawerTxn.paidAt` (set khi SePay/PayOS/kế toán đánh dấu paid).
   - Hoặc giao dịch ngân hàng đã khớp: `bankByLine.get(drawerTxn.id)?.transaction_date` — `bankByLine` ĐÃ build ở dòng **500–506** (Map payment_line_id → BankTransaction).

> ⚠️ Với line "Chờ xác nhận" thuần CK ngoài (chưa khớp), cả hai có thể trống → hiện "Chưa ghi nhận" (đó chính là tín hiệu cho kế toán: tiền chưa thực sự về / chưa khớp sao kê).

---

## Scope

### IN scope (FE only)
1. Thêm cell **"Sales phụ trách"** vào panel "Thông tin giao dịch".
2. Thêm cell **"Thời gian tiền về"** = `paidAt ?? bankByLine date ?? "Chưa ghi nhận"`; giữ "Sales tạo lúc" (đổi nhãn cho rõ là giờ tạo QR/lệnh).

### OUT of scope
- KHÔNG đụng soft-lock bill (doc 2.4 lo).
- KHÔNG đổi BE (sale_name + paid_at đã có trong list response — chỉ **verify**, xem mục dưới).
- KHÔNG đổi bảng danh sách (chỉ drawer).

---

## Cách sửa — `frontend/src/components/ReconciliationTab.tsx`

Panel "Thông tin giao dịch" (grid `1fr 1fr`, bắt đầu dòng 1272). Thêm 2 cell. Gợi ý đặt:
- "Sales phụ trách" — đặt cạnh "Phương thức" (đầu panel).
- "Thời gian tiền về" — đặt ngay sau "Sales tạo lúc".

```tsx
{/* Sales phụ trách — kế toán biết liên hệ ai khi sai sót */}
<div className="info-cell">
  <div className="info-label">Sales phụ trách</div>
  <div className="info-value">
    {pr.saleName || (pr.saleEmail ? pr.saleEmail.split("@")[0] : "—")}
  </div>
</div>
```
```tsx
{/* Sales tạo lúc — đổi nhãn cho rõ KHÔNG phải giờ tiền về */}
<div className="info-cell">
  <div className="info-label">Sales tạo lệnh lúc</div>
  <div className="info-value mono">{formatPaymentDateFull(drawerTxn.createdAt)}</div>
</div>
{/* Thời gian tiền về — căn cứ đối chiếu sao kê */}
<div className="info-cell">
  <div className="info-label">Thời gian tiền về</div>
  <div className="info-value mono">
    {(() => {
      const arrived = drawerTxn.paidAt || bankByLine.get(drawerTxn.id)?.transaction_date;
      return arrived ? formatPaymentDateFull(arrived) : <span style={{ color: "var(--text-3)" }}>Chưa ghi nhận</span>;
    })()}
  </div>
</div>
```
> Cell "Sales tạo lúc" cũ (dòng 1306–1309) → thay bằng block trên (gồm cả "Thời gian tiền về"). `bankByLine` đã trong scope component.

---

## Verify BE (KHÔNG sửa, chỉ kiểm tra trước khi nghiệm thu)
1. `GET /payment-requests` (list) trả `sale_name` cho mỗi PR (đã dùng ở PR table → gần như chắc chắn có). Nếu drawer hiện "—" cho mọi PR → BE list thiếu `sale_name`, báo lại BE.
2. Với line đã khớp SePay, `paid_at` (hoặc `bank_transactions.transaction_date`) có giá trị. Nếu "Thời gian tiền về" luôn "Chưa ghi nhận" kể cả line đã SePay-match → kiểm tra serializer trả `paid_at` ([payment_request_routes.py:659](../backend/payment_request_routes.py)).

---

## Acceptance criteria
1. Drawer "Chờ xác nhận": có dòng **"Sales phụ trách"** = tên TVTS (không phải email thô nếu có saleName).
2. Có dòng **"Thời gian tiền về"**: line đã SePay-match → hiện giờ tiền về; line CK ngoài chưa khớp → "Chưa ghi nhận".
3. Dòng giờ tạo đổi nhãn thành **"Sales tạo lệnh lúc"** (phân biệt rõ với giờ tiền về).
4. Kết hợp soft-lock 2.4: drawer card/trả góp có đủ **bill + tên sale + giờ tiền về** → kế toán đủ căn cứ xác nhận.
5. `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

---

## Test plan
```bash
cd frontend && npx tsc -b && npm run test
```
Manual (sandbox `test.admin@dev`, tab Đối soát → Chờ xác nhận):
1. Mở 1 giao dịch → thấy "Sales phụ trách" có tên.
2. Giao dịch CK đã SePay-match (tab "Đã xác nhận" hoặc line có paid_at) → "Thời gian tiền về" có giờ.
3. Giao dịch CK ngoài chưa khớp → "Thời gian tiền về" = "Chưa ghi nhận".

---

## Anti-patterns (đừng làm)
1. ĐỪNG hiện email thô khi đã có `saleName` — ưu tiên `saleName`, fallback mới cắt email.
2. ĐỪNG xoá "Sales tạo lúc" — chỉ đổi nhãn + thêm "Thời gian tiền về" bên cạnh (kế toán cần cả hai để so).
3. ĐỪNG fake "Thời gian tiền về" = `createdAt` khi thiếu dữ liệu — phải "Chưa ghi nhận" (đó là tín hiệu nghiệp vụ).
4. ĐỪNG sửa BE trong task này — chỉ verify; nếu thiếu field thì tách việc cho BE.
5. ĐỪNG ship khi `tsc -b` chưa pass.
