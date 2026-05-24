-- Module 5→6: Bảng lưu raw data CRM PalFish sau mỗi lần "Lấy dữ liệu"
-- Chạy 1 lần trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS crm_sales_data (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_order_id    TEXT        NOT NULL,           -- key upsert: ID đơn hàng trên CRM
    report_date     DATE        NOT NULL,           -- ngày báo cáo (Date_Report từ Module 5)
    uid             TEXT,                           -- UID khách hàng trên CRM
    sale_name       TEXT,                           -- Tên Sale phụ trách
    team            TEXT,                           -- Team của Sale
    department      TEXT,                           -- Bộ phận / phòng ban
    package_name    TEXT,                           -- Tên gói học
    amount          BIGINT      DEFAULT 0,          -- Giá trị đơn (VND hoặc RMB tuỳ cột)
    raw_data        JSONB       DEFAULT '{}',       -- Toàn bộ row gốc từ CRM (backup)
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    -- Composite unique key để upsert đúng
    CONSTRAINT crm_sales_data_order_date_key UNIQUE (crm_order_id, report_date)
);

-- Index cho các query Dashboard hay dùng
CREATE INDEX IF NOT EXISTS idx_crm_sales_date      ON crm_sales_data (report_date DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sales_sale       ON crm_sales_data (sale_name);
CREATE INDEX IF NOT EXISTS idx_crm_sales_team       ON crm_sales_data (team);
CREATE INDEX IF NOT EXISTS idx_crm_sales_order      ON crm_sales_data (crm_order_id);

-- RLS: chỉ backend service_role mới ghi được, frontend authed có thể đọc
ALTER TABLE crm_sales_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "crm_sales_data_select" ON crm_sales_data
    FOR SELECT USING (true);

-- INSERT/UPDATE chỉ dành cho service_role (backend) — frontend không ghi trực tiếp
-- (service_role tự động bypass RLS, policy này để chặn anon/user ghi)
CREATE POLICY "crm_sales_data_insert" ON crm_sales_data
    FOR INSERT WITH CHECK (false);

CREATE POLICY "crm_sales_data_update" ON crm_sales_data
    FOR UPDATE USING (false);

-- Tự cập nhật updated_at
CREATE OR REPLACE FUNCTION update_crm_sales_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_sales_updated_at ON crm_sales_data;
CREATE TRIGGER trg_crm_sales_updated_at
    BEFORE UPDATE ON crm_sales_data
    FOR EACH ROW EXECUTE FUNCTION update_crm_sales_updated_at();
