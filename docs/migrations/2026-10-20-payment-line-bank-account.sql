-- 2026-10-20: payment_lines.bank_account
-- Lưu tài khoản nhận (alias trong BANK_ACCOUNTS, VD "PalFish HCM - Vietcombank")
-- cho lần TT QR/card. NULL = line cũ → FE fallback MB HN (hành vi không đổi).
-- Cần cho: (1) đa tài khoản nhận chạy thật (QR đổ đúng TK được chọn),
--          (2) định tuyến đối soát — TK không-SePay (VCB HCM) sang tab "Chờ xác nhận"
--              để kế toán xác nhận tay (VCB chưa nối SePay).
-- Trap: thiếu reload schema → PostgREST ghi cột mới bị drop âm thầm
--       (docs/learnings/2026-09-24-postgrest-update-unknown-column-silent-deadcode.md).

ALTER TABLE payment_lines ADD COLUMN IF NOT EXISTS bank_account text;

NOTIFY pgrst, 'reload schema';
