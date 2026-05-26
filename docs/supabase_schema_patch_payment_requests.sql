-- Many-to-many payment request flow.
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';

create extension if not exists "pgcrypto";

do $$
begin
  create type payment_request_status as enum (
    'pending',
    'partially_paid',
    'fully_paid'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type payment_line_method as enum (
    'vietqr',
    'tien_mat',
    'quet_the'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  uid_khach_hang text not null,
  ten_khach text not null,
  sdt text not null,
  dia_chi text,
  tong_tien_phai_thu bigint not null check (tong_tien_phai_thu >= 0),
  da_thu_luc_nay bigint not null default 0 check (da_thu_luc_nay >= 0),
  trang_thai payment_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_request_id uuid not null references public.payment_requests(id) on delete cascade,
  so_tien bigint not null check (so_tien > 0),
  hinh_thuc payment_line_method not null,
  tien_ve boolean not null default false,
  payos_order_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_payment_request_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_payment_requests_updated_at on public.payment_requests;
create trigger trg_payment_requests_updated_at
before update on public.payment_requests
for each row execute function public.set_payment_request_updated_at();

drop trigger if exists trg_payment_lines_updated_at on public.payment_lines;
create trigger trg_payment_lines_updated_at
before update on public.payment_lines
for each row execute function public.set_payment_request_updated_at();

create index if not exists idx_payment_lines_request_id
  on public.payment_lines(payment_request_id);

create index if not exists idx_payment_lines_payos_order_code
  on public.payment_lines(payos_order_code)
  where payos_order_code is not null;

create index if not exists idx_payment_requests_uid_khach_hang
  on public.payment_requests(uid_khach_hang);

notify pgrst, 'reload schema';
