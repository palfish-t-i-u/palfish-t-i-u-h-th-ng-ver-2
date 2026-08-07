# Cổng kích hoạt "đủ tạm" — nới cổng KHÔNG được set status='paid'

**Related files:** `backend/pr_guards.py`, `frontend/src/components/payment-request/paymentRequestUtils.ts`, `backend/revenue_routes.py`, `backend/tests/test_provisional_activation_gate.py`

**Problem:** Đơn quẹt thẻ/trả góp phải báo đơn + tạo gói học được NGAY khi sale tạo PR + up bill, không chờ kế toán ghép mPOS. Cổng kích hoạt cũ chỉ mở khi PR `done/over` (tiền về thật) → deadlock: line thẻ giữ `pending` tới khi mPOS về nên không bao giờ mở.

**Trap:** Cách hiển nhiên để mở cổng là set `payment_lines.status='paid'` cho line thẻ pending. SAI — DB trigger `trg_payment_paid_zalo` fire trên transition pending→paid, bắn tin Zalo "ĐÃ VÀO TK" GIẢ vào nhóm sale (sự cố PR-2026-0945, 7/8). Tiền chưa thật về, chỉ mới có bill.

**Insight:** Tách CỔNG kích hoạt khỏi TRẠNG THÁI tiền. Line giữ `pending` (không fire trigger), `received`/`state`/sổ doanh thu GIỮ NGUYÊN net thật. Chỉ nới cổng bằng helper riêng `activatable_received` = net(line paid) + GROSS(line card/installment `pending` CÓ bill). Helper KHÔNG ghi DB — chỉ đọc. Cổng và money-display là 2 con số khác nhau, cố tình.

**Rule:** Mở cổng nghiệp vụ dựa trên điều kiện phái sinh (đọc), KHÔNG mutate cột mà trigger/ledger đang theo dõi. FE `activatableReceived` và BE `activatable_received` phải khớp branch-for-branch (G-PARITY): cùng tập method {card, installment}, cùng "có bill" (`bill_image` non-blank HOẶC `bill_images[]` non-empty), pending cộng GROSS (`amount`) không phải net. Nhánh paid phải khớp `normalizeRequest.received`. Fail-closed: query lỗi → trả `received` gốc (chặn, không mở nhầm).

**Verify:** `cd backend && python -m pytest tests/test_provisional_activation_gate.py -q` — 17 pass, gồm `TestGZaloNoLineWrite` assert cổng ghi 0 dòng DB.
