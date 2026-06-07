-- 1. Create SQL RPC for internal payment reconciliation

CREATE OR REPLACE FUNCTION get_payment_warnings(base_rate float DEFAULT 3700.0, threshold float DEFAULT 0.2)
RETURNS TABLE (warning_type text, payment_id text, details jsonb)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    -- 1. Duplicates
    SELECT 
        'DUPLICATE'::text AS warning_type,
        NULL::text AS payment_id,
        jsonb_build_object('count', count(*), 'ids', array_agg(p.payment_id::text)) AS details
    FROM payments p
    WHERE p.deleted_at IS NULL
    GROUP BY p.uid, p.pay_time, p.real_pay_vnd
    HAVING count(*) > 1

    UNION ALL

    -- 2. Missing Data
    SELECT 
        'MISSING_DATA'::text AS warning_type,
        p.payment_id::text AS payment_id,
        jsonb_build_object('sale_id', p.sale_id, 'team', p.team) AS details
    FROM payments p
    WHERE p.deleted_at IS NULL
      AND (p.sale_id IS NULL OR p.real_pay_vnd IS NULL OR p.team IS NULL)

    UNION ALL

    -- 3. Orphan Data
    SELECT 
        'ORPHAN_DATA'::text AS warning_type,
        p.payment_id::text AS payment_id,
        jsonb_build_object('invalid_sale_id', p.sale_id) AS details
    FROM payments p
    LEFT JOIN sales s ON p.sale_id = s.id
    WHERE p.deleted_at IS NULL
      AND p.sale_id IS NOT NULL AND s.id IS NULL

    UNION ALL

    -- 4. Exchange Rate Deviation
    SELECT 
        'RATE_DEVIATION'::text AS warning_type,
        p.payment_id::text AS payment_id,
        jsonb_build_object('real_pay_vnd', p.real_pay_vnd, 'gmv_rmb', p.gmv_rmb) AS details
    FROM payments p
    WHERE p.deleted_at IS NULL
      AND p.pay_time >= '2026-06-01' 
      AND p.gmv_rmb > 0 
      AND abs((p.real_pay_vnd::numeric / p.gmv_rmb::numeric) - base_rate) / base_rate > threshold;
END;
$$;
