-- Hybrid Architecture: crm_sales_data chỉ lưu daily incremental
-- Chạy trên Supabase SQL Editor sau khi deploy backend mới

-- (Tuỳ chọn) Xóa dòng summary cũ — tránh nhồi DB
DELETE FROM crm_sales_data WHERE record_type = 'summary';

-- Bỏ khóa 3 cột (dual pull)
ALTER TABLE crm_sales_data DROP CONSTRAINT IF EXISTS uq_crm_sales_sale_record_type;
DROP INDEX IF EXISTS uq_crm_sales_sale_date_type;

-- Khóa mới: 1 sale / 1 ngày
ALTER TABLE crm_sales_data
    ADD CONSTRAINT uq_crm_sales_sale_report_date
    UNIQUE (sale_name, report_date);

CREATE INDEX IF NOT EXISTS idx_crm_sales_report_date
    ON crm_sales_data (report_date DESC);

NOTIFY pgrst, 'reload schema';
