-- Migration 2026-08-14: M4 phiếu lương — bảng payslips (nhận phiếu từ PhieuLuongGate)
-- Target: sandbox (pxgybyfiwywksesyogti) -> smoke -> PRODUCTION (jozcvbbypwvzaefteoxn)
-- Idempotent (IF NOT EXISTS). Nguồn: PhieuLuongGate POST /api/payroll/payslips/receive.
-- Nhạy cảm (lương) → RLS ON, KHÔNG policy public: chỉ service-role BE (bypass RLS) đọc/ghi.
-- FE đọc qua BE (resolve_actor + RBAC), KHÔNG đụng thẳng Supabase client.
-- Idempotency: 1 dòng / mã NV / kỳ / tầng — upsert theo (code, ky_luong, stage).

CREATE TABLE IF NOT EXISTS public.payslips (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL,                                        -- mã NV (HN0001)
  name           text,                                                 -- tên NV (phieu.Name)
  ky_luong       text NOT NULL,                                        -- 'YYYY-MM'
  stage          text NOT NULL CHECK (stage IN ('truoc_thue', 'sau_thue')),
  payload_json   jsonb NOT NULL,                                       -- toàn bộ phiếu {nhãn cột chị Trang: giá trị}
  review_status  text NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'requested')),
  confirm_status text NOT NULL DEFAULT 'none' CHECK (confirm_status IN ('none', 'confirmed')),
  reviewed_at    timestamptz,
  confirmed_at   timestamptz,
  received_at    timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payslips_code_ky_stage_uidx UNIQUE (code, ky_luong, stage)
);

COMMENT ON TABLE public.payslips IS
  'M4 phiếu lương nhận từ PhieuLuongGate (Sheet). 1 dòng/mã NV/kỳ/tầng. Idempotent theo (code,ky_luong,stage). RLS ON, chỉ service-role truy cập.';

-- RLS: bật, KHÔNG policy → anon/authenticated bị chặn hoàn toàn; service-role BE bypass RLS.
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
