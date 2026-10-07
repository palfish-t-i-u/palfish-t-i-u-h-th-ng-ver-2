-- Feedback lead cho sale (7/10/2026) — PIVOT anh Hiếu: sale gửi bằng chứng + ghi chú về
-- chất lượng lead; team Marketing xem và nhận xét lại (Block 3).
-- Spec: palfish-internal-notes/gmv-lead-feedback-sale-2026-10-07.md

create table if not exists lead_feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  sale_email    text not null,                -- người điền (lowercase, khớp visible_creator_emails)
  sale_name     text,                         -- tên hiển thị người điền
  phone         text not null,                -- SĐT khách dạng đầu số-đuôi số (84-...)
  phone9        text,                         -- 9 số cuối (search không trượt)
  uid           text,
  customer_name text,
  lead_source   text,                         -- key LEAD_SOURCES (quang_cao...)
  lead_channel  text,                         -- value/code kênh
  lead_id       text,                         -- lead_id từ khớp lead (nếu có)
  sale_note     text not null,                -- ghi chú của sale — BẮT BUỘC
  sale_images   jsonb not null default '[]'::jsonb,   -- [{url}]
  status        text not null default 'wait' check (status in ('wait','done')),
  mkt_note      text,                         -- nhận xét team MKT (Block 3)
  mkt_images    jsonb not null default '[]'::jsonb,   -- [{url}]
  mkt_by        text,                         -- email người MKT nhận xét
  mkt_at        timestamptz
);

create index if not exists idx_lead_feedback_created_at  on lead_feedback (created_at desc);
create index if not exists idx_lead_feedback_status      on lead_feedback (status);
create index if not exists idx_lead_feedback_phone9      on lead_feedback (phone9);
create index if not exists idx_lead_feedback_sale_email  on lead_feedback (lower(sale_email));

-- RLS: chỉ service_role (BE) truy cập — khớp RLS hardening 15/7. service_role bypass RLS.
alter table lead_feedback enable row level security;

-- Storage bucket ảnh bằng chứng (sale) + ảnh nhận xét (MKT). KHÔNG thêm phí
-- (Supabase tính theo tổng GB + băng thông, không theo số bucket). Public read để FE hiển thị ảnh.
insert into storage.buckets (id, name, public)
values ('lead-feedback', 'lead-feedback', true)
on conflict (id) do nothing;
