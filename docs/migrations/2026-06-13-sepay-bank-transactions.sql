-- ============================================================================
-- Migration: SePay Integration — bank_transactions upgrade
-- Date: 2026-06-13
-- Spec: docs/sepay_integration_spec_v1.md
-- Run in Supabase SQL Editor, then: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Upgrade bank_transactions — add SePay webhook columns
-- ---------------------------------------------------------------------------

-- SePay unique transaction id — idempotency key (anti-duplicate / race condition)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS sepay_id bigint;

-- Create UNIQUE constraint on sepay_id (core anti-race-condition mechanism)
-- ON CONFLICT (sepay_id) DO NOTHING sẽ dùng constraint này
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_sepay_id_unique
  ON public.bank_transactions (sepay_id)
  WHERE sepay_id IS NOT NULL;

-- Gateway / source identifier: 'sepay_webhook', 'sepay_poll', 'mpos_import', 'manual'
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS gateway text DEFAULT 'manual';

-- Số tài khoản nhận (VCB: tài khoản con, MB: VA hoặc tài khoản chính)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS account_number text;

-- Sub-account (MB VA / VCB tài khoản con)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS sub_account text;

-- Nội dung chuyển khoản
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS transfer_content text;

-- Thời gian giao dịch từ ngân hàng
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS transaction_date timestamptz;

-- Trạng thái đối soát
-- auto_matched: mã + tiền khớp 100% → tự động gắn payment_line
-- needs_review: đúng mã sai tiền, hoặc heuristic ambiguous
-- ignored: settle mPOS / rác
-- pending: chờ xử lý
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS match_status text DEFAULT 'pending'
  CONSTRAINT bank_txn_match_status_check CHECK (
    match_status IN ('pending', 'auto_matched', 'needs_review', 'ignored')
  );

-- Raw JSON payload from SePay webhook (audit trail / traceback)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS raw jsonb;

-- Link to payment_line (khi đối soát thành công)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS payment_line_id uuid;

-- Self-referencing FK cho Refund / Reversal (Contra-entry Audit Trail)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS parent_transaction_id uuid
  REFERENCES public.bank_transactions(txn_id);

-- Cập nhật / tạo mới timestamps
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ---------------------------------------------------------------------------
-- 2. Indexes for query performance
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bank_txn_match_status
  ON public.bank_transactions (match_status);

CREATE INDEX IF NOT EXISTS idx_bank_txn_transaction_date
  ON public.bank_transactions (transaction_date);

CREATE INDEX IF NOT EXISTS idx_bank_txn_account_number
  ON public.bank_transactions (account_number);

CREATE INDEX IF NOT EXISTS idx_bank_txn_payment_line_id
  ON public.bank_transactions (payment_line_id);

CREATE INDEX IF NOT EXISTS idx_bank_txn_parent_transaction_id
  ON public.bank_transactions (parent_transaction_id);

-- ---------------------------------------------------------------------------
-- 3. RLS (service_role backend — already enabled from base migration)
-- ---------------------------------------------------------------------------
-- Policy đã tồn tại từ migration gốc (bank_transactions_service_all)
-- Không cần thêm.

-- ---------------------------------------------------------------------------
-- Done
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
