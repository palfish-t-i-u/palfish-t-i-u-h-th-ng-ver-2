-- Migration: tắt thông báo "kích hoạt thành công" trên Zalo — chuyển hẳn sang DingTalk + web GMV
-- Yêu cầu sale (chị Vân) 10/7, anh Hiếu duyệt (Gate A). Date: 2026-07-10
--
-- ⚠️ GIỮ NGUYÊN public.build_course_activated_message — fn_course_activated_dingtalk_notify vẫn dùng!
-- ⚠️ GIỮ 'course_activated' trong CHECK constraint zalo_outbox — rows lịch sử cần pass validate.

DROP TRIGGER IF EXISTS trg_course_activated_zalo ON public.active_requests;
DROP FUNCTION IF EXISTS public.fn_course_activated_zalo_notify();

-- Huỷ các tin course_activated còn chờ gửi (retries=99 = convention "Đã huỷ" của cancel endpoint + FE)
UPDATE public.zalo_outbox
   SET retries = 99,
       last_error = 'Cancelled 2026-07-10: activation notifications moved to DingTalk',
       next_retry_at = NULL
 WHERE event_type = 'course_activated'
   AND sent_at IS NULL;
