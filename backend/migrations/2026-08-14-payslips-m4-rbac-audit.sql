-- Migration 2026-08-14 (B): M4 phiếu lương — cầu user↔mã NV + audit xem phiếu
-- Target: sandbox (pxgybyfiwywksesyogti) -> smoke -> PRODUCTION (jozcvbbypwvzaefteoxn)
-- Idempotent (IF NOT EXISTS). Nối tiếp 2026-08-14-payslips-m4.sql.

-- N2: cầu login(email) -> mã NV. Backfill: match email từ BQ C_raw_staff_info_merged
--     (bảng đó có cả email lẫn code) -> UPDATE nhan_su_sale SET ma_nv WHERE email=...
ALTER TABLE public.nhan_su_sale ADD COLUMN IF NOT EXISTS ma_nv text;
CREATE INDEX IF NOT EXISTS nhan_su_sale_ma_nv_idx ON public.nhan_su_sale (ma_nv);
COMMENT ON COLUMN public.nhan_su_sale.ma_nv IS 'Mã NV HRIS (HN0001) — cầu nối user app -> phiếu lương (payslips.code). M4/N2.';

-- Audit: lương nhạy cảm → log ai xem phiếu lúc nào.
CREATE TABLE IF NOT EXISTS public.payslip_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id   uuid NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  viewer_email text NOT NULL,
  viewed_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payslip_views_payslip_idx ON public.payslip_views (payslip_id);
CREATE INDEX IF NOT EXISTS payslip_views_viewer_idx  ON public.payslip_views (viewer_email);

-- RLS: chỉ service-role BE truy cập (như payslips).
ALTER TABLE public.payslip_views ENABLE ROW LEVEL SECURITY;
