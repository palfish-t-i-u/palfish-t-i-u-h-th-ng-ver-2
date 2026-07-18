-- Bucket public chứa thumbnail bill do worker DingTalk tự tạo (Pillow).
-- Read: public URL (public=true, không cần policy). Write: CHỈ backend service role
-- (bypass RLS) — không có policy cho authenticated/anon là CHỦ ĐÍCH.
insert into storage.buckets (id, name, public)
values ('bill-thumbs', 'bill-thumbs', true)
on conflict (id) do nothing;
