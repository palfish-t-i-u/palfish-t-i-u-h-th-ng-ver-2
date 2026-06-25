-- TOP3 V2: thêm cột lưu snapshot danh sách gói pending lúc nhắc
-- Dùng để tính "progress_made" trong smart cooldown check

ALTER TABLE public.activation_reminders
  ADD COLUMN IF NOT EXISTS pending_courses_snapshot JSONB;

-- Row cũ V1 sẽ có NULL — OK, cooldown sẽ treat last_pending_count = 0

NOTIFY pgrst, 'reload schema';
