-- Link Google Sheet / Docs cho tab Sổ doanh thu (1 dòng cấu hình chung)
-- Chạy trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS revenue_ledger_settings (
    id                 INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    google_sheet_url   TEXT        NOT NULL DEFAULT '',
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by         TEXT
);

INSERT INTO revenue_ledger_settings (id, google_sheet_url)
VALUES (
    1,
    'https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc/edit'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE revenue_ledger_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_ledger_settings_select"
    ON revenue_ledger_settings FOR SELECT USING (true);

CREATE POLICY "revenue_ledger_settings_insert"
    ON revenue_ledger_settings FOR INSERT WITH CHECK (false);

CREATE POLICY "revenue_ledger_settings_update"
    ON revenue_ledger_settings FOR UPDATE USING (false);

NOTIFY pgrst, 'reload schema';
