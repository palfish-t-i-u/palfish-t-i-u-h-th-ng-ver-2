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

## 0. Phân công

| Ai | Task | Files | Branch |
|---|---|---|---|
| **Đạt** | Task A: capture số tiền thực nhận tại thời điểm ghép (mục 3, Fix A + Fix B) | `backend/payment_request_routes.py` (`_mark_line_paid`), `backend/gateway_routes.py` (`match_gateway_txn`) | `fix/bao-tien-net-capture` |
| **Giang** | Task B: build tin ưu tiên thực nhận, fallback gross (mục 3, Fix C + Fix D) | Migration SQL mới (`backend/migrations/2026-07-10-...-net-amount.sql`), `backend/utils/zalo_message_builder.py` | `fix/bao-tien-net-message` |

**File 100% tách biệt → chạy song song ngay, không phụ thuộc thứ tự merge.** Về data: Task B tự `COALESCE` fallback an toàn dù Task A merge sau (chỉ là chưa có số net để dùng, không lỗi, không crash) — nhưng nên merge cả 2 cùng ngày để test integration thật trên sandbox (tạo 1 giao dịch mPOS có phí, ghép, xem tin đúng cả số lẫn label).

Quy trình như mọi lần: branch riêng từ `sandbox`, code + test theo mục 5, `pytest`/`tsc -b` xanh, merge vào `sandbox` trước, verify tay 1 lượt thật trên sandbox (theo mục 5), rồi mới báo lên `main`.

**Deadline:** anh Minh yêu cầu xong trước 14h chiều nay (10/7). Sau 14h nếu chưa xong, Đức + Claude sẽ tự làm nốt.

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

### Fix C — Migration SQL mới: `build_payment_paid_message` — label + số tiền đổi theo method

**Chốt theo yêu cầu anh Minh (10/7, quan trọng — label đổi theo, không chỉ số):**
- Method `card`/`installment` **có** `verified_received` → `"🔸 Thực nhận: {net} VND lúc {time} - {method}"`
- Method `card`/`installment` **không có** `verified_received` (fallback) → `"🔸 Số tiền (Gross): {amount} VND lúc {time} - {method}"`
- Method khác (`cash`, `qr`, ...) → **giữ nguyên y hệt hiện tại**: `"🔸 Số tiền: {amount} VND lúc {time} - {method}"` — không có khái niệm gross/net ở tiền mặt/QR (không qua cổng nào trừ phí), không đụng label này.

So với bản `2026-07-04-zalo-payment-paid-add-method.sql` hiện tại, thêm biến `v_amount_label` và 1 khối `IF`:
```sql
-- Thêm biến:
DECLARE
  ...
  v_amount_label TEXT;

-- Thay dòng "v_amount_fmt := to_char(line_row.amount, ...)" bằng:
IF LOWER(COALESCE(line_row.method, '')) IN ('card', 'installment') THEN
  IF line_row.verified_received IS NOT NULL THEN
    v_amount_label := 'Thực nhận';
    v_amount_fmt := to_char(line_row.verified_received, 'FM999,999,999,999');
  ELSE
    v_amount_label := 'Số tiền (Gross)';
    v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
  END IF;
ELSE
  v_amount_label := 'Số tiền';
  v_amount_fmt := to_char(line_row.amount, 'FM999,999,999,999');
END IF;

-- Dòng format cuối cùng, thay '\U0001F538 Số tiền: %s VND lúc %s - %s' bằng:
format(E'\U0001F538 %s: %s VND lúc %s - %s',
       v_amount_label, v_amount_fmt, v_time_fmt, v_method_label)
```
Toàn bộ phần còn lại của function (lookup sale/PR, phone, header, method_label) giữ nguyên y hệt — `CREATE OR REPLACE`, idempotent.

**Ví dụ đối chiếu (theo đúng mẫu anh Minh gửi):**
```
Có thực nhận:
💰 ĐÃ VÀO - KH Phạm Thị Kiều Oanh - Bé Phạm Bảo Khánh - ĐT: 84-767836839
🔸 Sale Nguyen Thi Hang Nga · Team Inhouse 1
🔸 Thực nhận: 18,681,000 VND lúc 10:48 10/07/2026 - Thẻ

Không có thực nhận (fallback):
💰 ĐÃ VÀO - KH Phạm Thị Kiều Oanh - Bé Phạm Bảo Khánh - ĐT: 84-767836839
🔸 Sale Nguyen Thi Hang Nga · Team Inhouse 1
🔸 Số tiền (Gross): 19,160,000 VND lúc 10:48 10/07/2026 - Thẻ
```

### Fix D (mirror, bắt buộc theo convention file) — Python mirror trong `zalo_message_builder.py`
`build_payment_paid_message()` Python hiện đọc thẳng `payment_data.get("amount")` — sửa để **cùng logic label 3 nhánh** như Fix C (method card/installment + có/không `verified_received` → nhãn khác nhau; method khác → giữ nguyên `"Số tiền"`). File có docstring ghi rõ "SQL là live path, Python là mirror — phải sync" (convention có sẵn của team) — không sync thì lần sau ai sửa nhầm bản Python tưởng đang sửa bản sống.

---

## 4. Việc CHƯA làm trong plan này (đã làm rõ với anh Minh qua chat — không phải data bug)

Ban đầu tôi lo ngại case: line quẹt thẻ/trả góp đã **ghép** nhưng **thiếu bill** (soft-lock TOP2.4 chặn auto-confirm) → sau này bill có rồi, xác nhận qua đường khác không đi qua `match_gateway_txn` → mất `verified_received`.

**Verify lại thì đây KHÔNG xảy ra được**: production hiện chỉ có đúng 1 đường để chuyển 1 line quẹt thẻ/trả góp sang "paid" — bấm **"Ghép"** (`match_gateway_txn`). Nút mark-paid thủ công khác trong drawer bị khoá chỉ hiện ở môi trường dev (`import.meta.env.DEV`, `PaymentRequestDetailDrawer.tsx:309`), không có ở bản thật. Vậy khi bill đến muộn, quy trình đúng là kế toán bấm **"Gỡ ghép"** rồi **"Ghép" lại** — lần ghép thứ 2 chạy lại đúng `match_gateway_txn` (Fix B), tự lấy đúng `verified_received`. Xác nhận "Gỡ ghép" (`patch_gateway_status`, `gateway_routes.py:487-507`) không để lại rác ở `payment_lines`, ghép lại sạch.

**Gap còn lại (không phải bug số liệu, mà là UX)**: giao diện hiện không có dòng nhắc "vì thiếu bill nên chưa xác nhận, hãy Gỡ ghép + Ghép lại sau khi có bill" — kế toán dễ tưởng "đã ghép là xong việc", bỏ quên case đó. **Để riêng, không thuộc scope fix số tiền lần này** — nếu anh Minh muốn xử lý, tách task khác (thêm dòng cảnh báo trong `CardReconciliationTab.tsx` khi txn đã matched nhưng `payment_line.status` vẫn pending).

---

## 5. Test plan (viết mới, theo pattern test đã có)

**Task A (Đạt) — `backend/tests/test_gateway_routes.py`:**
- Mở rộng `test_gateway_match_auto_confirms_payment_line_when_bill_present` (đã có từ PR #17) — assert thêm `sb.tables["payment_lines"][0]["verified_received"]` / `["verified_total"]` khớp `net_amount`/`amount` của fixture giao dịch gateway.
- Test mới: match giao dịch có `fee > 0` → `verified_received != amount` (net < gross), verify đúng số.
- Test mới: match giao dịch KHÔNG có `net_amount` (data thiếu/0) → `verified_received` không set / None (không crash, không set field rác).
- Test mới trên `_mark_line_paid` (payment_request_routes.py, nếu có test riêng) hoặc qua test gateway: `extra=None` (2 caller cũ PayOS) vẫn hoạt động y hệt trước — regression.

**Task B (Giang) — `backend/tests/test_zalo_builder.py`:**
- `build_payment_paid_message`: method `card` + `verified_received` có giá trị → message chứa `"🔸 Thực nhận: {net} VND ..."`, KHÔNG chứa chữ "Gross".
- method `card`/`installment` + `verified_received=None` → message chứa `"🔸 Số tiền (Gross): {amount} VND ..."`.
- method `cash`/`qr` (hoặc thiếu) → message chứa `"🔸 Số tiền: {amount} VND ..."` y hệt format cũ, dù có set `verified_received` (không áp dụng ngoài card/installment) — **test regression quan trọng nhất**, đảm bảo không đổi format tin tiền mặt/QR.
- SQL: không có test framework PL/pgSQL trong repo — verify tay qua `bash scripts/deploy.sh sandbox` + tạo 1 giao dịch mPOS test có phí, ghép, xem tin Zalo group test đúng label + số thực nhận. Cả 2 người cùng verify trên sandbox trước khi báo anh Minh.

## 6. Đối chiếu 4 tiêu chí anh Minh đưa

| # | Tiêu chí | Đáp ứng thế nào |
|---|---|---|
| 1 | Giải quyết tận gốc | Sửa đúng chỗ dữ liệu net-amount bị rớt mất (gateway_transactions → payment_lines), không patch số ở tầng hiển thị |
| 2 | Không đẻ lỗi con | Tái dùng field `verified_received` đã có sẵn ý nghĩa đúng (không tạo field/khái niệm mới); không đụng `amount`/target/state/GMV/Sổ doanh thu; cash/QR không bị ảnh hưởng (fallback tự nhiên) |
| 3 | Không tăng gánh hạ tầng | 0 bảng mới, 0 endpoint mới, field ghi thêm nằm CHUNG 1 câu UPDATE đã có sẵn (không thêm round-trip DB); SQL function chỉ thêm 1 khối `IF`/`COALESCE` đơn giản (chi phí không đáng kể, không vòng lặp/query thêm) |
| 4 | Tối ưu token/quota | Research bằng đọc code trực tiếp (Grep/Read), không spawn subagent; fix gói gọn 3 file + 1 migration, không lan sang module khác |
