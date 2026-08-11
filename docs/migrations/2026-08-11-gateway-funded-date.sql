-- Ngày tiền về TK cho đơn thẻ mPOS (V-a)
-- Nguồn: gateway_transactions.raw->>'Ngày nhận tiền'
-- Payoo không có trường này → NULL
-- Dùng type DATE (không phải timestamptz) để tránh lệch ngày do UTC (bài học C-T1)

ALTER TABLE gateway_transactions
  ADD COLUMN IF NOT EXISTS funded_date date;

-- Backfill 92 đơn mPOS từ raw (chạy ngay sau ALTER TABLE)
UPDATE gateway_transactions
SET funded_date = (raw->>'Ngày nhận tiền')::date
WHERE source = 'mpos'
  AND funded_date IS NULL
  AND coalesce(raw->>'Ngày nhận tiền', '') <> '';

-- Verify: phải = 0
-- SELECT count(*) FILTER (WHERE funded_date IS NULL) FROM gateway_transactions WHERE source = 'mpos';

NOTIFY pgrst, 'reload schema';
