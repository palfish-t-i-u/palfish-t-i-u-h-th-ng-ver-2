-- Migration: Lead phone match — đối soát GMV-Lead
-- Ref: docs/plans/PLAN_LEAD_PHONE_MATCH_2026-08-16.md §3.1
-- Ref: docs/specs/huong-dan-IT-doi-chieu-SDT-lead.md (schema cột theo Hiếu)

-- 1) 6 cột metadata trên payment_requests (nguồn nhập từ sale)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS sdt_goc           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched      BOOLEAN,
  ADD COLUMN IF NOT EXISTS lead_id           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched_by   TEXT,
  ADD COLUMN IF NOT EXISTS ly_do_khong_ghep  TEXT,
  ADD COLUMN IF NOT EXISTS lead_check_at     TIMESTAMPTZ;

-- 2) 6 cột y hệt trên so_doanh_thu (đích, chảy lên BQ)
ALTER TABLE public.so_doanh_thu
  ADD COLUMN IF NOT EXISTS sdt_goc           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched      BOOLEAN,
  ADD COLUMN IF NOT EXISTS lead_id           TEXT,
  ADD COLUMN IF NOT EXISTS lead_matched_by   TEXT,
  ADD COLUMN IF NOT EXISTS ly_do_khong_ghep  TEXT,
  ADD COLUMN IF NOT EXISTS lead_check_at     TIMESTAMPTZ;

-- 3) Bảng leads_lookup — bản sao rút gọn app_lookup.lead_phone_lookup (BQ)
--    Schema khớp doc Hiếu, thêm lead_id (MD5 composite) cho FK reference
CREATE TABLE IF NOT EXISTS public.leads_lookup (
  lead_id      TEXT PRIMARY KEY,
  phone9       TEXT NOT NULL,
  match_source TEXT,
  phone_goc    TEXT,
  name         TEXT,
  uid          TEXT,
  lead_date    DATE,
  crm_code     TEXT,
  ec           TEXT,
  status       TEXT,
  status_2     TEXT,
  nation       TEXT,
  source_name  TEXT,
  sale_name    TEXT,          -- tên đầy đủ sale phụ trách lead (join dim_sale lúc seed; ~91% khớp)
  synced_at    TIMESTAMPTZ DEFAULT now()
);

-- Idempotent: nếu bảng đã tồn tại từ lần chạy trước (chưa có sale_name)
ALTER TABLE public.leads_lookup ADD COLUMN IF NOT EXISTS sale_name TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_lookup_phone9 ON public.leads_lookup (phone9);
CREATE INDEX IF NOT EXISTS idx_leads_lookup_uid    ON public.leads_lookup (uid) WHERE uid IS NOT NULL AND uid <> '';

-- 4) RLS: bật, KHÔNG tạo policy → chỉ service-role đọc/ghi
ALTER TABLE public.leads_lookup ENABLE ROW LEVEL SECURITY;
