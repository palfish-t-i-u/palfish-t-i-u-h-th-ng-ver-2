-- ========================================================
-- UAT CLEANUP SNAPSHOT - XEM DU LIEU TEST TRUOC KHI XOA
-- ========================================================

-- 1. Snapshot giao_dich test
SELECT * FROM public.giao_dich WHERE id = '0f392eb7-0b1d-4da4-a37e-698037d1a688';

-- 2. Snapshot don_hang test
SELECT * FROM public.don_hang WHERE id = '249cb0f3-2973-4b1d-9163-b741f7847268';

-- 3. Snapshot active_requests test
SELECT * FROM public.active_requests WHERE id = 'AR-2026-0040';

-- 4. Snapshot payment_lines test
SELECT * FROM public.payment_lines WHERE payment_request_id IN ('PR-2026-0073', 'PR-2026-0058', 'PR-2026-0059', 'PR-2026-0060', 'PR-2026-0061', 'PR-2026-0064', 'PR-2026-0070');

-- 5. Snapshot payment_requests test
SELECT * FROM public.payment_requests WHERE id IN ('PR-2026-0073', 'PR-2026-0058', 'PR-2026-0059', 'PR-2026-0060', 'PR-2026-0061', 'PR-2026-0064', 'PR-2026-0070');
