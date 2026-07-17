-- Backfill: sửa net_amount cho GD trả góp mPOS bị thiếu trừ phí trả góp (bug 2026-07-17).
-- Nguồn chân lý: raw JSON ("Phí giao dịch" + "Phí TG hiện tại"). Idempotent.
-- Chạy trên PROD (jozcvbbypwvzaefteoxn). Xem preview trước; dùng transaction.

-- 1. PREVIEW — kiểm bằng mắt trước khi UPDATE.
SELECT txn_code, cardholder_name, paid_at::date,
       amount,
       net_amount AS net_cu,
       amount
         - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
         - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric AS net_moi,
       net_amount - (amount
         - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
         - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric) AS giam_di,
       match_status
FROM gateway_transactions
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
       - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
       - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric)
ORDER BY paid_at;

-- 2. UPDATE (chạy trong transaction).
BEGIN;

UPDATE gateway_transactions
SET net_amount = amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric);
-- Kỳ vọng: UPDATE 8

-- 3. VERIFY — phải trả 0.
SELECT count(*) AS con_sai
FROM gateway_transactions
WHERE source = 'mpos' AND category = 'Trả góp'
  AND net_amount <> (amount
      - replace(replace((raw->>'Phí giao dịch'), ',', ''), '.', '')::numeric
      - replace(replace((raw->>'Phí TG hiện tại'), ',', ''), '.', '')::numeric);

COMMIT;  -- Nếu con_sai <> 0 hoặc UPDATE khác 8 → ROLLBACK.
