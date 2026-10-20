-- 2026-10-20: AR id dùng DB sequence (monotonic, KHÔNG tái dùng sau khi xoá)
--
-- Gốc lỗi: _next_ar_id cũ = MAX(id)+1. Khi xoá AR mang số lớn nhất, id đó bị
-- TÁI DÙNG cho AR mới của PR khác (ca thật 20/10: AR-2026-1664 / PR-2026-2376
-- "Chị Thái" bị xoá → 1664 tái cấp cho PR-2026-2514). Mọi tham chiếu cũ (audit,
-- ops_ar_change_log, outbox, invoice/BQ neo theo id) trỏ nhầm sang đơn khác.
-- Thêm: MAX+1 còn là bug concurrency (2 sale báo đơn cùng giây → trùng id).
--
-- Fix: mirror payment_request_sequences — counter đơn điệu, atomic (INSERT ...
-- ON CONFLICT DO UPDATE ... RETURNING), không phụ thuộc MAX của hàng còn sống →
-- id đã cấp không bao giờ bị cấp lại dù AR bị xoá.
--
-- CHẠY TRÊN CẢ prod (jozcvbbypwvzaefteoxn) VÀ sandbox (pxgybyfiwywksesyogti),
-- TRƯỚC khi deploy code gọi RPC (code deploy trước migration → báo đơn 503).

create table if not exists active_request_sequences (
  year_key text primary key,
  current_val bigint not null default 0
);

-- Không phơi ra PostgREST cho anon/authenticated; chỉ backend (service_role).
revoke all on active_request_sequences from anon, authenticated;
grant select, insert, update on active_request_sequences to service_role;

-- Seed từ MAX id hiện có theo từng năm (tự đọc max mỗi env). GREATEST để chạy lại
-- idempotent, không bao giờ tụt số → không bao giờ cấp trùng id đang sống.
insert into active_request_sequences (year_key, current_val)
select split_part(id, '-', 2) as year_key,
       max((split_part(id, '-', 3))::bigint) as current_val
from active_requests
where id ~ '^AR-\d{4}-\d+$'
group by split_part(id, '-', 2)
on conflict (year_key) do update
  set current_val = greatest(active_request_sequences.current_val, excluded.current_val);

-- current_val là counter ĐƠN ĐIỆU (chỉ +1, không bao giờ tụt) → id đã cấp không
-- bao giờ tái dùng dù AR bị xoá. GREATEST với MAX(live)+1 chỉ là SÀN phòng vệ:
-- trong lúc deploy (code cũ MAX+1 còn chạy song song migration) nếu có AR mới
-- vượt counter, hàm tự nâng counter lên — không va id, không cần re-seed thủ
-- công. SÀN chỉ đẩy counter LÊN, không bao giờ kéo xuống → tính no-reuse giữ
-- nguyên. Concurrency: current_val+1 dùng giá trị hàng ĐÃ KHOÁ (ON CONFLICT) nên
-- 2 call đồng thời luôn ra số khác nhau; MAX(live) đọc trước chỉ là sàn.
create or replace function public.next_active_request_id(p_year integer default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_year_key text;
  v_max_live bigint;
  seq bigint;
begin
  v_year_key := coalesce(p_year::text, to_char(now() at time zone 'UTC', 'YYYY'));
  select coalesce(max((split_part(id, '-', 3))::bigint), 0)
    into v_max_live
    from active_requests
   where id like 'AR-' || v_year_key || '-%'
     and id ~ '^AR-\d{4}-\d+$';
  insert into active_request_sequences (year_key, current_val)
  values (v_year_key, v_max_live + 1)
  on conflict (year_key) do update
    set current_val = greatest(active_request_sequences.current_val + 1, v_max_live + 1)
  returning current_val into seq;
  return format('AR-%s-%s', v_year_key, lpad(seq::text, 4, '0'));
end;
$$;

-- SECURITY DEFINER: không để anon gọi (tránh đốt id). Backend dùng service_role.
revoke all on function public.next_active_request_id(integer) from public, anon, authenticated;
grant execute on function public.next_active_request_id(integer) to service_role;

notify pgrst, 'reload schema';
