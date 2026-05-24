-- Bổ sung cột BC03 / Dashboard cho crm_sales_data
-- Chạy trên Supabase SQL Editor (sau patch crm_sales_data gốc)

ALTER TABLE crm_sales_data
    ADD COLUMN IF NOT EXISTS completed_classes BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS referral_leads   BIGINT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_crm_sales_completed ON crm_sales_data (completed_classes);
CREATE INDEX IF NOT EXISTS idx_crm_sales_referral  ON crm_sales_data (referral_leads);

NOTIFY pgrst, 'reload schema';
