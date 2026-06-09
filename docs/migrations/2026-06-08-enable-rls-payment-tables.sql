-- Enable RLS on GMV payment tables (payment_requests, payment_lines,
-- payment_request_sequences).  All three are accessed exclusively via the
-- FastAPI backend with the service_role key, which has bypassrls privilege.
-- The explicit service_role policies follow the project convention used by
-- tax_sequences and export_batches.
--
-- Run on BOTH sandbox (pxgybyfiwywksesyogti) and prod (jozcvbbypwvzaefteoxn).

-- 1. payment_request_sequences
ALTER TABLE public.payment_request_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role bypass payment_request_sequences"
  ON public.payment_request_sequences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. payment_requests
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role bypass payment_requests"
  ON public.payment_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3. payment_lines
ALTER TABLE public.payment_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role bypass payment_lines"
  ON public.payment_lines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
