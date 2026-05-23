-- Diagnose: chạy trên Supabase SQL Editor, gửi screenshot kết quả nếu vẫn lỗi.

-- 1. Liệt kê cột thực tế của don_hang (PHẢI thấy: bill_image, ghi_chu, ma_don_hang, goi_hoc, nguon_doanh_thu, tien_ve, don_crm, created_by, sale_crm_name)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'don_hang'
ORDER BY ordinal_position;

-- 2. Liệt kê cột khach_hang (PHẢI thấy: crm_uid, ma_vung, dia_chi, tinh, quan, phuong, dia_chi_chi_tiet)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'khach_hang'
ORDER BY ordinal_position;

-- 3. CHECK constraint hiện tại trên don_hang.trang_thai (PHẢI cho phép cho_thanh_toan)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.don_hang'::regclass
  AND contype = 'c';

-- 4. Force reload PostgREST cache (luôn chạy sau bất kỳ ALTER TABLE nào)
NOTIFY pgrst, 'reload schema';
