# Reassign tiền từ line của PR đã huỷ sang PR trùng (duplicate)

**Related files:** `backend/sepay_routes.py` (manual_match_bank_transaction ~L874), `backend/payment_request_routes.py` (recompute_payment_request_totals ~L1480)

**Problem:** Sale tạo trùng 2 PR cho cùng khách. PR đầu (A) sinh QR mã cũ, khách quét đúng mã đó → SePay auto-match & confirm tiền vào line của PR A, rồi PR A bị **huỷ**. Sale lại tạo PR mới (B) với mã QR khác + up chính cái biên lai đó lên line PR B. Kết quả: tiền thật dính vào line của **PR đã huỷ** (biến mất khỏi mọi tab: không ở "CK ngoài chờ ghép" vì đã matched, không ở PR B vì PR B chưa nhận tiền). Sale kêu "xác nhận giúp", kế toán tìm không ra giao dịch.

**Trap:**
1. Đừng bấm ✓ xác nhận line PR B khi thấy nó "Chờ xác nhận" + có biên lai → **đếm đôi** (tiền đã ghi 1 lần ở PR A). Dấu hiệu nhận biết: cột **TIỀN VỀ LÚC = "—"** ở line PR B = line CHƯA có tiền thật ghép vào, chỉ có biên lai sale up.
2. App **chặn re-ghép** qua UI: `manual_match_bank_transaction` raise 400 "Giao dịch đã được khớp" nếu `match_status in (auto_matched, manual_matched)` (sepay_routes.py L897). Txn đã matched → phải sửa thẳng DB.
3. `recompute_payment_request_totals` **return sớm không làm gì** nếu PR `state='cancelled'` (L1501) → header PR huỷ vẫn received=0, an toàn; nhưng line của nó có thể còn `status='paid'` treo lơ lửng, phải gỡ tay.

**Rule — quy trình reassign (cách B, gộp về 1 PR), làm trong 1 transaction:**
1. `bank_transactions`: đổi `payment_line_id` → line PR đích; set `match_status='manual_matched'`, `matched_by=<email>`, `discrepancy_amount = txn.amount - line.amount`, `updated_at=now()`.
2. `payment_lines` (line đích): `status='paid', paid_at=now(), reject_reason=null, confirmed_by=<email>, confirmed_at=now(), confirmed_source='manual'`.
3. `payment_lines` (line cũ ở PR huỷ): gỡ về `status='pending', paid_at=null, confirmed_by/at/source=null` (tiền đã dời đi, đừng để paid orphan).
4. `payment_requests` (PR đích): tự tính `received = SUM(_line_net) các line status='paid'` và `state` theo `_compute_state` (received<=0→pending, <target→short, =target→done, >→over). Ghi `received`, `state`. **KHÔNG** dùng RPC vì recompute là Python, không phải DB function.
5. Ghi `audit_logs(action, actor_email, target_type, target_id, payload, created_at)` — action gợi ý: `recon.bank_txn_reassigned` + `recon.line_marked_paid` + `recon.line_unmatched`.

`_line_net`: qr/CK = amount; card/installment = `verified_received` nếu có, else amount. Chỉ cộng line `status='paid'`.

**Verify:** SELECT lại txn (match_status=manual_matched, link đúng line PR đích), 2 line (đích=paid, cũ=pending), 2 PR (huỷ=cancelled received 0, đích=short/received đúng). PR đích `short` → **không** trigger ledger (chỉ done/over mới `sync_ledger_for_pr`) → không đếm doanh thu sớm, không bắn DingTalk.

**Ví dụ thật (2026-09-21):** C Hằng / bé Nam Phong. Tiền 2tr sepay 83307906 dính line FL7UX của PR-2026-1842 (đã huỷ) → reassign sang line FL7XP của PR-2026-1843. PR-1843 → short 2.000.000/17.015.000 (còn line thẻ FL7XQ 15tr chờ mPOS).
