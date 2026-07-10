-- 2026-07-10: Backfill cột payment_lines.bill_images từ storage.objects.
-- Vì sao: route danh sách PR chuyển sang đọc cột DB (bỏ storm liệt-kê Storage).
-- 50/111 line có bill trong Storage nhưng cột rỗng → phải điền trước khi deploy
-- code, nếu không các line này hiển thị "thiếu bill".
-- Idempotent: chỉ UPDATE line có cột rỗng; chạy lại nhiều lần vô hại.
--
-- CHẠY TRÊN CẢ 2 PROJECT, ĐỔI host cho đúng ref rồi mới chạy:
--   prod    ref = jozcvbbypwvzaefteoxn
--   sandbox ref = pxgybyfiwywksesyogti
-- (URL public bill có dạng https://<ref>.supabase.co/storage/v1/object/public/bills/<name>)
--
-- APPLIED: prod    (jozcvbbypwvzaefteoxn)  2026-07-10
-- APPLIED: sandbox (pxgybyfiwywksesyogti)  2026-07-10

WITH storage_bills AS (
  SELECT
    split_part(o.name, '/', 2) AS line_id,
    o.name AS object_name,
    o.created_at,
    'https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/' || o.name AS url
  FROM storage.objects o
  WHERE o.bucket_id = 'bills'
    AND o.name LIKE 'payment-lines/%/bill%'
),
agg AS (
  SELECT
    line_id,
    jsonb_agg(url ORDER BY created_at, object_name) AS urls
  FROM storage_bills
  WHERE line_id <> ''
  GROUP BY line_id
)
UPDATE payment_lines pl
SET
  bill_images = agg.urls,
  bill_image  = agg.urls ->> (jsonb_array_length(agg.urls) - 1)
FROM agg
WHERE pl.id::text = agg.line_id
  AND (pl.bill_images IS NULL OR jsonb_array_length(pl.bill_images) = 0);
