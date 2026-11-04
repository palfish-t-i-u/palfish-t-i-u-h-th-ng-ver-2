-- Migration 2026-11-04: cấp mã NV (HN0062) cho chị Vũ Thị Thu Hiền để xác nhận phiếu lương của chính mình.
--
-- Vấn đề: thuhien250801@gmail.com đăng nhập được (HR) nhưng KHÔNG có dòng nào trong
-- nhan_su_sale → rbac.actor_ma_nv() trả None → PATCH /payslips/{id}/confirm (và /review)
-- luôn 403 "Chi nhan vien so huu phieu moi thao tac duoc". Migration backfill 2026-08-17
-- chỉ UPDATE dòng đã có nên không tạo được dòng cho chị.
--
-- Cách làm: thêm 1 dòng nhan_su_sale với is_active = false (cố ý):
--   * rbac._lookup_staff KHÔNG lọc is_active → ma_nv vẫn được đọc, xác nhận phiếu hoạt động;
--   * mọi danh sách sale/roster/báo cáo đều lọc is_active = true → chị KHÔNG xuất hiện như
--     một sale (tránh lặp sự cố staff import nhầm vào bảng sale, xem rbac._effective_role).
-- role = 'sale' (không phải system): quyền admin của chị (nếu có) đến từ nguồn khác,
-- không từ bảng này.
--
-- Idempotent: chạy lại nhiều lần an toàn. Chạy được TRƯỚC hoặc SAU khi deploy code
-- (code mới chỉ thay logic phạm vi xem phiếu, không phụ thuộc dòng này).

-- 1) Nếu dòng của chị đã tồn tại (khác hoa/thường) mà thiếu mã NV → gán.
UPDATE public.nhan_su_sale
SET ma_nv = 'HN0062', updated_at = now()
WHERE lower(trim(email)) = 'thuhien250801@gmail.com'
  AND (ma_nv IS NULL OR trim(ma_nv) = '');

-- 2) Chưa có dòng nào → thêm mới.
INSERT INTO public.nhan_su_sale (crm_name, email, display_name, role, ma_nv, is_active)
SELECT 'Vu Thi Thu Hien', 'thuhien250801@gmail.com', 'Vũ Thị Thu Hiền', 'sale', 'HN0062', false
WHERE NOT EXISTS (
  SELECT 1 FROM public.nhan_su_sale WHERE lower(trim(email)) = 'thuhien250801@gmail.com'
);

-- Kiểm tra (chạy riêng sau khi apply): phải ra đúng 1 dòng, ma_nv = HN0062.
-- SELECT email, display_name, role, ma_nv, is_active FROM public.nhan_su_sale
-- WHERE lower(trim(email)) = 'thuhien250801@gmail.com';
