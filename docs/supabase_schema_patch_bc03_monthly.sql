-- BC03 — Lưu tỷ giá + KPI theo tháng (YYYY-MM)
-- Chạy trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bc03_month_settings (
    month_key      TEXT        PRIMARY KEY,  -- vd. '2026-05'
    exchange_rate  BIGINT      NOT NULL DEFAULT 3700,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     TEXT
);

CREATE TABLE IF NOT EXISTS bc03_kpi_rows (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    month_key    TEXT        NOT NULL REFERENCES bc03_month_settings(month_key) ON DELETE CASCADE,
    sale_name    TEXT        NOT NULL DEFAULT '',
    b2_orders    BIGINT      NOT NULL DEFAULT 0,
    b4_gmv_vnd   BIGINT      NOT NULL DEFAULT 0,
    sort_order   INT         NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bc03_kpi_month_sale_key UNIQUE (month_key, sale_name)
);

CREATE INDEX IF NOT EXISTS idx_bc03_kpi_month ON bc03_kpi_rows (month_key, sort_order);

ALTER TABLE bc03_month_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bc03_kpi_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bc03_settings_select" ON bc03_month_settings FOR SELECT USING (true);
CREATE POLICY "bc03_kpi_select" ON bc03_kpi_rows FOR SELECT USING (true);

-- Ghi qua backend service_role; chặn client trực tiếp
CREATE POLICY "bc03_settings_insert" ON bc03_month_settings FOR INSERT WITH CHECK (false);
CREATE POLICY "bc03_settings_update" ON bc03_month_settings FOR UPDATE USING (false);
CREATE POLICY "bc03_kpi_insert" ON bc03_kpi_rows FOR INSERT WITH CHECK (false);
CREATE POLICY "bc03_kpi_update" ON bc03_kpi_rows FOR UPDATE USING (false);
CREATE POLICY "bc03_kpi_delete" ON bc03_kpi_rows FOR DELETE USING (false);

NOTIFY pgrst, 'reload schema';
