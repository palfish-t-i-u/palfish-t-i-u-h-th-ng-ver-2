-- Many-to-many payment request flow (Hiếu prototype — B1/B2).
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
--
-- Replaces legacy payment_requests/payment_lines (Vietnamese column names).

create extension if not exists "pgcrypto";

-- Drop legacy schema if present (safe re-run on dev)
drop table if exists public.payment_lines cascade;
drop table if exists public.payment_requests cascade;
drop table if exists public.payment_request_sequences cascade;
drop type if exists public.payment_line_method cascade;
drop type if exists public.payment_request_status cascade;

create table public.payment_request_sequences (
  year_key text primary key,
  current_val bigint not null default 0 check (current_val >= 0)
);

create table public.payment_requests (
  id text primary key,
  name text not null,
  uid text not null,
  phone text not null,
  country text not null default 'VN',
  address text not null default '',
  ward text not null default '',
  province text not null default '',
  note text not null default '',
  target bigint not null check (target >= 0),
  received bigint not null default 0 check (received >= 0),
  state text not null default 'pending'
    check (state in ('pending', 'short', 'done', 'over', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_lines (
  id uuid primary key default gen_random_uuid(),
  payment_request_id text not null references public.payment_requests(id) on delete cascade,
  method text not null
    check (method in ('qr', 'cash', 'card', 'installment')),
  amount bigint not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected')),
  payos_order_code text,
  transfer_code text,
  qr_code text,
  checkout_url text,
  paid_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_lines_payos_order_code_key unique (payos_order_code)
);

create or replace function public.set_payment_row_updated_at()
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
for each row execute function public.set_payment_row_updated_at();

drop trigger if exists trg_payment_lines_updated_at on public.payment_lines;
create trigger trg_payment_lines_updated_at
before update on public.payment_lines
for each row execute function public.set_payment_row_updated_at();

create index if not exists idx_payment_lines_request_id
  on public.payment_lines(payment_request_id);

create index if not exists idx_payment_lines_payos_order_code
  on public.payment_lines(payos_order_code)
  where payos_order_code is not null;

create index if not exists idx_payment_lines_status
  on public.payment_lines(status);

create index if not exists idx_payment_requests_uid
  on public.payment_requests(uid);

create index if not exists idx_payment_requests_state
  on public.payment_requests(state);

notify pgrst, 'reload schema';
