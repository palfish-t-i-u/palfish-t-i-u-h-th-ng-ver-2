-- Nhật ký lưu chuyển PR (tạo hộ + chuyển giao) — đề xuất Sale Leader 22/07.
-- Mỗi dòng = 1 lần PR đổi/nhận chủ sở hữu (sale_email). Dùng đối soát doanh thu:
-- "từ mốc thời gian nào PR thuộc về ai" (tương đương "Nhật ký bán hàng" CRM).
--
-- Run on BOTH sandbox (pxgybyfiwywksesyogti) and prod (jozcvbbypwvzaefteoxn).

CREATE TABLE IF NOT EXISTS public.pr_ownership_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id text NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('create', 'create_on_behalf', 'transfer')),
  from_sale_email text,                -- NULL khi action = create/create_on_behalf
  to_sale_email text NOT NULL,         -- chủ sở hữu sau hành động
  actor_email text NOT NULL,           -- người bấm nút (có thể khác to_sale_email)
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_ownership_log_pr
  ON public.pr_ownership_log (pr_id, created_at);

ALTER TABLE public.pr_ownership_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role bypass pr_ownership_log" ON public.pr_ownership_log;
CREATE POLICY "service_role bypass pr_ownership_log"
  ON public.pr_ownership_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Backfill: PR cũ chưa có dòng nào → ghi 1 dòng 'create' theo dữ liệu hiện có
-- (from=NULL, to=sale_email, actor=sale_email, thời điểm = created_at của PR).
-- Idempotent: chỉ insert khi PR chưa có dòng log nào.
INSERT INTO public.pr_ownership_log (pr_id, action, from_sale_email, to_sale_email, actor_email, created_at)
SELECT pr.id, 'create', NULL, lower(pr.sale_email), lower(pr.sale_email), pr.created_at
FROM public.payment_requests pr
WHERE COALESCE(pr.sale_email, '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pr_ownership_log l WHERE l.pr_id = pr.id
  );

NOTIFY pgrst, 'reload schema';
