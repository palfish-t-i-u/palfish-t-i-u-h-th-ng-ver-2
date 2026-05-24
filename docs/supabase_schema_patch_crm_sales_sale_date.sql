-- Khóa upsert CRM sync: 1 sale × 1 ngày (không trùng L1)
-- Chạy TOÀN BỘ script trên Supabase SQL Editor (theo thứ tự)

-- ---------------------------------------------------------------------------
-- Bước 1: Xóa dòng bóng ma (Total / 汇总 / header / sale rỗng)
-- Dữ liệu cũ từ sync single-payload hoặc chưa lọc có thể còn các dòng này.
-- ---------------------------------------------------------------------------
DELETE FROM crm_sales_data
WHERE sale_name IS NULL
   OR TRIM(sale_name) = ''
   OR LOWER(TRIM(sale_name)) IN (
       'sales', 'sale', '汇总', 'total', '合计', 'department'
   )
   OR LOWER(TRIM(COALESCE(department, ''))) = 'total'
   OR LOWER(TRIM(COALESCE(team, ''))) = 'total';

-- ---------------------------------------------------------------------------
-- Bước 2: Gộp trùng (sale_name, report_date) — giữ bản mới nhất
-- Xảy ra khi sync cũ chèn nhiều lần cùng sale/ngày với crm_order_id khác nhau.
-- ---------------------------------------------------------------------------
DELETE FROM crm_sales_data
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY sale_name, report_date
                ORDER BY updated_at DESC NULLS LAST,
                         created_at DESC NULLS LAST,
                         id DESC
            ) AS rn
        FROM crm_sales_data
        WHERE sale_name IS NOT NULL
          AND TRIM(sale_name) <> ''
    ) ranked
    WHERE rn > 1
);

-- ---------------------------------------------------------------------------
-- Bước 3: Unique index cho UPSERT on_conflict = sale_name, report_date
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_sales_sale_report_date
    ON crm_sales_data (sale_name, report_date);

NOTIFY pgrst, 'reload schema';
