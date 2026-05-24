-- CRM sync v3: báo cáo tổng hợp theo kỳ (sale × period), không phải transaction log
-- Chạy trên Supabase SQL Editor (tùy chọn — backend vẫn chạy được với crm_order_id synthetic)

ALTER TABLE crm_sales_data
    ADD COLUMN IF NOT EXISTS period_start DATE,
    ADD COLUMN IF NOT EXISTS period_end   DATE;

CREATE INDEX IF NOT EXISTS idx_crm_sales_period
    ON crm_sales_data (period_start, period_end);

-- Unique theo sale + kỳ (bỏ constraint cũ nếu cần migrate thủ công)
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_sales_sale_period
--     ON crm_sales_data (COALESCE(department, ''), COALESCE(sale_name, ''), period_start, period_end);

NOTIFY pgrst, 'reload schema';
