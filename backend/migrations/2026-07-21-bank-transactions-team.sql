-- Thêm cột team để phân loại giao dịch CK ngoài theo team HCM / HN.
-- Chạy ở CẢ 2 Supabase: prod (jozc...) + sandbox (pxgy...).
-- null = chưa phân loại; CHECK chặn giá trị lạ; loại trừ nhau ở tầng DB.

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS team text;

DO $$
BEGIN
  ALTER TABLE bank_transactions
    ADD CONSTRAINT bank_transactions_team_chk CHECK (team IN ('HCM', 'HN'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
