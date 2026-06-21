-- 2026-06-20: thêm 'manual_matched' vào CHECK constraint bank_transactions.match_status
--
-- Phát hiện qua code review trước khi deploy sandbox→main 21/6:
-- backend/sepay_routes.py:483 ghi match_status='manual_matched' khi kế toán
-- ghép tay GD CK ngoài, nhưng CHECK constraint cũ (2026-06-13-sepay-bank-transactions.sql)
-- chỉ cho 4 giá trị: pending / auto_matched / needs_review / ignored.
-- → Mỗi lần kế toán bấm Ghép trên prod sẽ raise 23514 → HTTP 500.
--
-- Sandbox đã có 'manual_matched' do ai đó sửa tay constraint nhưng quên cập nhật
-- file SQL. Migration này đồng bộ lại schema.
--
-- IDEMPOTENT: dùng DROP IF EXISTS + ADD; chạy lại 2 lần vẫn OK.

ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_txn_match_status_check;

ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_txn_match_status_check CHECK (
    match_status IN ('pending', 'auto_matched', 'manual_matched', 'needs_review', 'ignored')
  );

NOTIFY pgrst, 'reload schema';
