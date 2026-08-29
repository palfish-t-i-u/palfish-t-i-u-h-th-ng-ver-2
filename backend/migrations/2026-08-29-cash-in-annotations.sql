-- BC04 — Báo cáo Dòng tiền về hàng ngày. Lưu phân loại quản báo + ghi chú sửa tay
-- cho từng khoản tiền vào (bank_transactions hoặc gateway_transactions).
-- Xem docs/plans/PLAN_BC04_DONG_TIEN_VE_2026-08-27.md §7.
create table if not exists cash_in_annotations (
  source text not null,                 -- 'bank' | 'gateway'
  txn_id uuid not null,                 -- bank_transactions.txn_id | gateway_transactions.id
  business_line text,
  main_cat text,
  detail text,
  note text,
  updated_by_email text,
  updated_at timestamptz default now(),
  primary key (source, txn_id)
);

NOTIFY pgrst, 'reload schema';
