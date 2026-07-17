-- Migration: TẮT tin ảnh bill trên Zalo (event bill_uploaded)
-- Lý do: sale feedback 17/7 — tin ảnh bill gây nhầm lẫn. Zalo chỉ còn tin báo tiền (payment_paid).
-- Cách: neutralize nguồn sự thật DUY NHẤT (fn enqueue_bill_uploaded_zalo) → RETURN false ngay,
--   chặn CẢ 2 đường enqueue (RPC từ endpoint upload bill + PERFORM trong trigger payment_paid).
-- REVERSIBLE: redeploy nguyên hàm cũ từ 2026-07-10-zalo-bill-uploaded-event.sql (mục 2).

-- 1. No-op hoá enqueue function (giữ signature + grants để 2 caller thành no-op an toàn)
CREATE OR REPLACE FUNCTION public.enqueue_bill_uploaded_zalo(p_line_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- DISABLED 17/7/2026 (sale feedback: tin ảnh bill gây nhầm lẫn).
  -- Không enqueue gì cả — Zalo chỉ giữ tin báo tiền (payment_paid).
  RETURN false;
END;
$function$;

-- 2. Drain backlog: mọi tin bill_uploaded còn pending (chưa gửi) → đánh dấu dead để worker bỏ qua,
--    KHÔNG set sent_at (trung thực: chưa gửi). Worker lọc retries < MAX_RETRIES(4) nên retries=4 bị loại.
UPDATE public.zalo_outbox
   SET retries = 4,
       next_retry_at = NULL,
       last_error = 'disabled: Zalo bill tin tắt 17/7 (sale feedback)'
 WHERE event_type = 'bill_uploaded'
   AND sent_at IS NULL
   AND (retries IS NULL OR retries < 4);
