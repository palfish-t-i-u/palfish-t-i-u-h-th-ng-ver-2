-- backend/migrations/2026-07-12-dingtalk-ar-created-and-drop-payment-paid.sql
-- Định tuyến lại thông báo (chốt 2026-07-12):
--   (1) Cho phép event activation_request_created vào dingtalk_outbox
--   (2) Ngừng bắn payment_paid sang DingTalk (giữ nguyên Zalo)
-- Target: PRODUCTION (jozcvbbypwvzaefteoxn) + sandbox (pxgybyfiwywksesyogti)
-- Note: Apply sandbox trước, smoke-test, rồi prod.

-- (1) Mở CHECK constraint — thêm activation_request_created, GIỮ payment_paid (còn dùng cho row cũ + có thể bật lại)
ALTER TABLE public.dingtalk_outbox DROP CONSTRAINT IF EXISTS dingtalk_outbox_event_type_check;
ALTER TABLE public.dingtalk_outbox ADD CONSTRAINT dingtalk_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text,
    'course_activated'::text,
    'activation_urgent_reminder'::text,
    'activation_request_created'::text]));

-- (2) Tắt payment_paid trên DingTalk — chỉ DROP TRIGGER, GIỮ function (dễ bật lại).
--     Trigger Zalo trg_payment_paid_zalo KHÔNG đụng.
DROP TRIGGER IF EXISTS trg_payment_paid_dingtalk ON public.payment_lines;
