-- Kiến trúc Kéo Kép CRM: summary + daily cùng (sale_name, report_date)
-- Chạy TOÀN BỘ trên Supabase SQL Editor

ALTER TABLE crm_sales_data
    ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'daily';

-- Xóa khóa/index cũ (2 trường — xung đột dual pull)
DROP INDEX IF EXISTS uq_crm_sales_sale_report_date;
DROP INDEX IF EXISTS uq_crm_sales_sale_date_type;
ALTER TABLE crm_sales_data DROP CONSTRAINT IF EXISTS uq_crm_sales_sale_report_date;
ALTER TABLE crm_sales_data DROP CONSTRAINT IF EXISTS uq_crm_sales_sale_record_type;

-- Khóa mới: sale_name + report_date + record_type
ALTER TABLE crm_sales_data
    ADD CONSTRAINT uq_crm_sales_sale_record_type
    UNIQUE (sale_name, report_date, record_type);

CREATE INDEX IF NOT EXISTS idx_crm_sales_record_type
    ON crm_sales_data (record_type, report_date DESC);

NOTIFY pgrst, 'reload schema';
