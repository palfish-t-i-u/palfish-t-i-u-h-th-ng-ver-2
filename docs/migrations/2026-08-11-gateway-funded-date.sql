-- Ngày tiền về TK cho đơn thẻ mPOS (V-a)
-- Nguồn: gateway_transactions.raw->>'Ngày nhận tiền'
-- Payoo không có trường này → NULL
-- Dùng type TIMESTAMP WITHOUT TIME ZONE (không phải timestamptz) để tránh lệch ngày do UTC (bài học C-T1)
-- Raw value VD: "2026-08-10T02:29:48" — VN local time, cast ::timestamp giữ nguyên

-- Bước 1: đổi từ date → timestamp (nếu đã là date từ migration trước)
ALTER TABLE gateway_transactions
  ALTER COLUMN funded_date TYPE timestamp without time zone
  USING funded_date::timestamp;

-- Bước 2: re-backfill với full datetime từ raw
UPDATE gateway_transactions
SET funded_date = (raw->>'Ngày nhận tiền')::timestamp
WHERE source = 'mpos'
  AND coalesce(raw->>'Ngày nhận tiền', '') <> '';

-- Verify: phải = 0
-- SELECT count(*) FILTER (WHERE funded_date IS NULL) FROM gateway_transactions WHERE source = 'mpos';

NOTIFY pgrst, 'reload schema';
