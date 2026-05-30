-- ========================================================
-- UAT CLEANUP EXECUTE - TIEN HANH XOA DU LIEU TEST
-- ========================================================

BEGIN;

-- BƯỚC 1: Xóa active_requests liên quan trước (do ràng buộc ON DELETE RESTRICT)
DELETE FROM public.active_requests 
WHERE pr_id IN ('PR-2026-0073', 'PR-2026-0058', 'PR-2026-0059', 'PR-2026-0060', 'PR-2026-0061', 'PR-2026-0064', 'PR-2026-0070');

-- BƯỚC 2: Xóa payment_lines liên quan
DELETE FROM public.payment_lines 
WHERE payment_request_id IN ('PR-2026-0073', 'PR-2026-0058', 'PR-2026-0059', 'PR-2026-0060', 'PR-2026-0061', 'PR-2026-0064', 'PR-2026-0070');

-- BƯỚC 3: Xóa payment_requests test
DELETE FROM public.payment_requests 
WHERE id IN ('PR-2026-0073', 'PR-2026-0058', 'PR-2026-0059', 'PR-2026-0060', 'PR-2026-0061', 'PR-2026-0064', 'PR-2026-0070');

-- BƯỚC 4: Xóa giao_dich test liên quan đến đơn KH008
DELETE FROM public.giao_dich 
WHERE don_hang_id = '249cb0f3-2973-4b1d-9163-b741f7847268';

-- BƯỚC 5: Xóa don_hang_audit liên quan đến đơn KH008
DELETE FROM public.don_hang_audit 
WHERE don_hang_id = '249cb0f3-2973-4b1d-9163-b741f7847268';

-- BƯỚC 6: Xóa liên kết don_hang trong so_doanh_thu (SET NULL) để không vi phạm ràng buộc
UPDATE public.so_doanh_thu 
SET don_hang_id = NULL 
WHERE don_hang_id = '249cb0f3-2973-4b1d-9163-b741f7847268';

-- BƯỚC 7: Xóa don_hang test
DELETE FROM public.don_hang 
WHERE id = '249cb0f3-2973-4b1d-9163-b741f7847268';

COMMIT;
