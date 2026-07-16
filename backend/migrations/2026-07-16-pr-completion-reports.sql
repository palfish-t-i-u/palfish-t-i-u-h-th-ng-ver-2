-- Bảng lịch sử báo đơn hoàn thành (thay trigger số học pr_fully_paid)
CREATE TABLE IF NOT EXISTS public.pr_completion_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id       TEXT NOT NULL,
  seq         INT  NOT NULL,
  reason      TEXT,
  reported_by TEXT NOT NULL,
  total_net   NUMERIC NOT NULL,
  target      NUMERIC NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pr_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_pcr_pr_id ON public.pr_completion_reports (pr_id);

-- Backfill: PR đã có AR → coi như đã báo (không gửi tin)
INSERT INTO public.pr_completion_reports (pr_id, seq, reason, reported_by, total_net, target)
SELECT DISTINCT ar.pr_id, 1,
       'Backfill 16/07/2026 — AR đã tạo trước khi có bước báo hoàn thành',
       'system-backfill',
       COALESCE(pr.received, 0), COALESCE(pr.target, 0)
  FROM public.active_requests ar
  JOIN public.payment_requests pr ON pr.id = ar.pr_id
 WHERE ar.pr_id IS NOT NULL
ON CONFLICT (pr_id, seq) DO NOTHING;
