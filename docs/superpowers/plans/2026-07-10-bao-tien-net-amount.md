# Báo tiền đúng số thực nhận (quẹt thẻ/trả góp) — Implementation Plan

> **CHỈ LẬP PLAN — KHÔNG IMPLEMENT.** File này để anh Minh duyệt trước khi ai đó code.

**Yêu cầu gốc (kế toán, qua anh Minh):**
1. Cơ chế báo tiền (Zalo "💰 ĐÃ VÀO") cho tiền mặt/quẹt thẻ/trả góp:
   - Tiền mặt: báo khi xác nhận thủ công trên app xong
   - Quẹt thẻ/trả góp: báo khi ghép giao dịch với PR xong
2. **Bug cụ thể phát hiện 10/7**: tin báo sai số tiền cho quẹt thẻ/trả góp — báo số tiền **gộp** (gross, trước phí mPOS/Payoo trừ) thay vì số tiền **thực nhận** (net, sau phí). VD thật: báo 19.160.000đ, đúng ra phải là 18.681.000đ (chênh lệch 479.000đ = phí mPOS).

**Kết luận sau khi verify code — phần (1) đã HOẠT ĐỘNG ĐÚNG, không cần sửa gì:**
- Tiền mặt: `PATCH /transactions/{id}/status` (`payment_request_routes.py:2215`) set `status='paid'` → trigger `trg_payment_paid_zalo` bắn tin ngay. Đã đúng từ trước.
- Quẹt thẻ/trả góp: đã fix ở PR #17 (10/7, merge `fix/gateway-match-mark-paid`) — `match_gateway_txn` giờ tự gọi `_mark_line_paid()` khi ghép xong (nếu đã có bill). Ảnh chụp Zalo cho thấy tin đã bắn đúng lúc 10:48, xác nhận cơ chế hoạt động.
- **Vấn đề DUY NHẤT còn lại**: số tiền hiển thị trong tin, không phải cơ chế trigger.

**Phạm vi:** chỉ sửa số tiền hiển thị trong tin "💰 ĐÃ VÀO" khi method là `card`/`installment`. Không đụng vào GMV/target/state/Sổ doanh thu (những chỗ đó dùng số tiền gộp là ĐÚNG — xem "Vì sao không đổi `amount`" bên dưới).

---

## 1. Root cause (đã verify — grep trực tiếp source, không suy đoán)

| Fact | Vị trí |
|---|---|
| Tin "💰 ĐÃ VÀO" build bởi SQL function sống trong Supabase (không phải Python) | `build_payment_paid_message(line_row payment_lines)`, migration mới nhất `backend/migrations/2026-07-04-zalo-payment-paid-add-method.sql` |
| Dòng gây bug — luôn lấy `line_row.amount` (gộp), không có field nào khác | `2026-07-04-zalo-payment-paid-add-method.sql:40`: `v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');` |
| Trigger fire khi nào | `trg_payment_paid_zalo` — `AFTER UPDATE ON payment_lines`, fn check `NEW.status='paid' AND OLD.status<>'paid'` (`2026-06-23-zalo-oa-tables.sql`) |
| `gateway_transactions` đã có sẵn `fee`/`net_amount` (mPOS/Payoo trả về, đã hiển thị đúng trong UI — "THỰC NHẬN (SAU PHÍ)") | `gateway_routes.py::_serialize_gateway_txn` dòng 128-130 |
| `match_gateway_txn` (fix PR #17) hiện KHÔNG copy `net_amount` sang `payment_lines` — chỉ gọi `_mark_line_paid(sb, line_id, actor_email, source="gateway")`, không có field số tiền nào khác | `gateway_routes.py:428-480` (bản hiện tại sau PR #17) |
| **Cơ chế "thực nhận sau phí" ĐÃ TỒN TẠI SẴN** cho trả góp qua SePay (bank transfer) — field `payment_lines.verified_received` | `payment_request_routes.py:2274-2277` (`patch_transaction_status`, set cùng lúc với `status='paid'` trong 1 UPDATE) |
| Frontend đã quen dùng `verifiedReceived` làm "số thực nhận sau phí" cho installment | `paymentRequestUtils.ts:651-657` — comment: *"Trả góp đã được kế toán xác nhận → dùng verifiedReceived (sau phí)"* |
| `verified_received` **không** ảnh hưởng target/state/GMV — `_sum_paid_amount` (backend, quyết định PR done/short) luôn dùng `amount` gộp, không đọc `verified_received` | `payment_request_routes.py:255-265` |
| Match-candidates trong gateway_routes.py CHỈ áp cho method `card`/`installment` — không có case nào khác đi qua `match_gateway_txn` | `gateway_routes.py:391-392` |

### Vì sao không đổi `amount` trực tiếp
`payment_lines.amount` = giá trị hợp đồng/GMV khách phải trả — dùng để tính `target` vs `received` (PR done/short), Sổ doanh thu, xuất hoá đơn. Khách quẹt thẻ 19.160.000đ nghĩa là khách ĐÃ trả đủ 19.160.000đ — số 18.681.000đ chỉ là tiền **thực đổ vào tài khoản công ty** sau khi mPOS trừ phí xử lý thẻ. Đây là 2 khái niệm khác nhau, đổi `amount` sẽ làm sai lệch toàn bộ logic đối soát PR/GMV — vi phạm tiêu chí (2) "không đẻ lỗi con". Field `verified_received` đã được thiết kế đúng cho mục đích "tiền thực nhận" này từ trước.

---

## 2. Bug tiềm ẩn cần tránh khi implement (quan trọng — đọc kỹ trước khi code)

Trigger Postgres fire theo **từng câu UPDATE**, dùng giá trị `NEW` tại đúng thời điểm đó. Nếu code làm 2 UPDATE tách rời:
```
UPDATE payment_lines SET status='paid', ...           -- (1) trigger fire ở đây, verified_received CHƯA có
UPDATE payment_lines SET verified_received=18681000    -- (2) không re-trigger (status không đổi nữa)
```
→ Tin vẫn bắn sai vì trigger đã chạy ở bước (1) trước khi `verified_received` được ghi. **Bắt buộc gộp `verified_received`/`verified_total` vào CÙNG một câu UPDATE với `status='paid'`.**

`patch_transaction_status` (luồng SePay/thủ công) đã làm đúng — set cả `status` lẫn `verified_total`/`verified_received` trong 1 dict `patch` duy nhất. `match_gateway_txn` (luồng mPOS/Payoo, code mới ở PR #17) chưa làm vậy vì gọi qua helper `_mark_line_paid()` — helper này chỉ nhận `actor_email`/`source`, không có chỗ nhét thêm field.

---

## 3. Thiết kế fix (3 thay đổi, tất cả nhỏ, không thêm bảng/endpoint/infra)

### Fix A — `backend/payment_request_routes.py`: mở rộng `_mark_line_paid()`
Thêm param `extra: dict[str, Any] | None = None`, merge vào `patch` dict TRƯỚC khi gọi `.update()` — để field mới nằm chung 1 câu UPDATE với `status='paid'`. Backward-compatible 100% (2 caller cũ trong PayOS webhook flow không truyền `extra`, không đổi hành vi).

### Fix B — `backend/gateway_routes.py`: truyền `extra` khi auto-confirm
Trong nhánh `if can_auto_confirm:` (đã có từ PR #17), lấy `amount`/`net_amount` từ `gateway_transactions` row vừa update (`res.data[0]`), truyền vào `_mark_line_paid(..., extra={"verified_total": ..., "verified_received": ...})`.

### Fix C — Migration SQL mới: `build_payment_paid_message` đọc `COALESCE(verified_received, amount)`
1 dòng đổi so với bản `2026-07-04-zalo-payment-paid-add-method.sql` hiện tại:
```sql
-- Trước:
v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
-- Sau:
v_amount_fmt := to_char(COALESCE(line_row.verified_received, line_row.amount), 'FM999,999,999,999');
```
Toàn bộ phần còn lại của function giữ nguyên y hệt (copy từ bản hiện tại, chỉ đổi 1 dòng) — `CREATE OR REPLACE`, idempotent. Cash/QR không có `verified_received` → tự động fallback `amount`, không đổi hành vi.

### Fix D (mirror, bắt buộc theo convention file) — Python mirror trong `zalo_message_builder.py`
`build_payment_paid_message()` Python hiện đọc `payment_data.get("amount")` trực tiếp — sửa thành ưu tiên `verified_received` nếu có, giống hệt SQL. File có docstring ghi rõ "SQL là live path, Python là mirror — phải sync" (đã là convention của team, không phải đề xuất mới) — không sync thì lần sau ai đó sửa nhầm bản Python tưởng đang sửa bản sống.

---

## 4. Việc CHƯA làm trong plan này (cố tình để ngoài phạm vi — xin ý kiến anh Minh)

**Case cạnh (edge case) chưa xử lý**: 1 line quẹt thẻ/trả góp đã **ghép** giao dịch gateway nhưng **thiếu bill** (soft-lock TOP2.4 chặn auto-confirm) → sau này sale upload bill xong, ai đó bấm xác nhận thủ công qua `patch_transaction_status` (không qua `match_gateway_txn` nữa) → lúc đó `verified_received` sẽ KHÔNG tự lấy từ `gateway_transactions` (vì đã match từ trước, giờ confirm qua đường khác) → tin lại báo sai (gộp) cho đúng case này.

**Đề xuất nếu anh Minh muốn xử lý luôn**: trong `patch_transaction_status`, khi `status→paid` và line có `method in (card, installment)` và request KHÔNG kèm `verified_received` tường minh → tự query `gateway_transactions` theo `payment_line_id` lấy `net_amount`/`amount` để điền vào cùng 1 patch. Đây là fix nhỏ thêm (~10 dòng), cùng pattern Fix A/B, nhưng tăng phạm vi task nên tách riêng chờ quyết định — không tự ý làm để giữ đúng tiêu chí (4) tối ưu token/scope.

---

## 5. Test plan (viết mới, theo pattern test đã có)

- `backend/tests/test_gateway_routes.py`: mở rộng `test_gateway_match_auto_confirms_payment_line_when_bill_present` (đã có từ PR #17) — assert thêm `sb.tables["payment_lines"][0]["verified_received"] == <net_amount fixture>`.
- Test mới: match giao dịch có `fee > 0` → `verified_received != amount` (net < gross), verify đúng số.
- Test mới: match giao dịch KHÔNG có `net_amount` (data thiếu) → `verified_received` không set / None → message fallback `amount` (không crash).
- SQL: không có test framework cho PL/pgSQL trong repo — verify tay qua `bash scripts/deploy.sh sandbox` + tạo 1 giao dịch mPOS test có phí, ghép, xem tin Zalo group test đúng số thực nhận.
- Regression bắt buộc: tin "💰 ĐÃ VÀO" cho tiền mặt/QR — số tiền KHÔNG đổi (vẫn `amount`, vì `verified_received` luôn null ở 2 method này).

## 6. Đối chiếu 4 tiêu chí anh Minh đưa

| # | Tiêu chí | Đáp ứng thế nào |
|---|---|---|
| 1 | Giải quyết tận gốc | Sửa đúng chỗ dữ liệu net-amount bị rớt mất (gateway_transactions → payment_lines), không patch số ở tầng hiển thị |
| 2 | Không đẻ lỗi con | Tái dùng field `verified_received` đã có sẵn ý nghĩa đúng (không tạo field/khái niệm mới); không đụng `amount`/target/state/GMV/Sổ doanh thu; cash/QR không bị ảnh hưởng (fallback tự nhiên) |
| 3 | Không tăng gánh hạ tầng | 0 bảng mới, 0 endpoint mới, field ghi thêm nằm CHUNG 1 câu UPDATE đã có sẵn (không thêm round-trip DB); SQL function chỉ thêm 1 `COALESCE` (chi phí không đáng kể) |
| 4 | Tối ưu token/quota | Research bằng đọc code trực tiếp (Grep/Read), không spawn subagent; fix gói gọn 3 file + 1 migration, không lan sang module khác |
