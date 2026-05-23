-- Module 5: Bảng lưu CRM cookie token (single-row, id luôn = 1)
-- Chạy 1 lần trên Supabase SQL Editor

CREATE TABLE IF NOT EXISTS crm_tokens (
    id           INT PRIMARY KEY DEFAULT 1,
    cookie_value TEXT NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ cho phép 1 dòng (id = 1)
ALTER TABLE crm_tokens ENABLE ROW LEVEL SECURITY;

-- Ai cũng đọc được (frontend & backend check token status)
CREATE POLICY "crm_tokens_select" ON crm_tokens
    FOR SELECT USING (true);

-- Ai cũng insert được (extension dùng anon key để ghi)
CREATE POLICY "crm_tokens_insert" ON crm_tokens
    FOR INSERT WITH CHECK (id = 1);

-- Ai cũng update được (extension upsert)
CREATE POLICY "crm_tokens_update" ON crm_tokens
    FOR UPDATE USING (id = 1) WITH CHECK (id = 1);
