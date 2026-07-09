-- 2026-07-06: Security hardening — revoke RPC execute + drop bucket listing policy
-- APPLIED: sandbox (pxgybyfiwywksesyogti) 2026-07-06
-- APPLIED: prod    (jozcvbbypwvzaefteoxn)  2026-07-06
--
-- Fix #3: Drop overly permissive SELECT policy on bills bucket.
-- Public URLs still work (bucket public flag = true), only listing blocked for anon.
-- Backend uses service_role which bypasses RLS — unaffected.
--
-- Fix #4: Revoke EXECUTE on all SECURITY DEFINER functions from PUBLIC/anon/authenticated.
-- All RPC calls go through backend with service_role — unaffected.
-- Trigger functions run as function owner, not session role — unaffected.
-- Prevents external callers with publishable key from invoking RPCs directly
-- (e.g. allocate_tax_sequences could burn invoice numbers, next_payment_request_id creates PR ID gaps).

-- Fix #3
DROP POLICY IF EXISTS "public read bills" ON storage.objects;

-- Fix #4
DO $$
DECLARE
  fn_name text;
  fn_sig text;
  revoked int := 0;
BEGIN
  FOR fn_name, fn_sig IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', fn_name, fn_sig);
    revoked := revoked + 1;
  END LOOP;
  RAISE NOTICE 'Total revoked from PUBLIC+anon+authenticated: % functions', revoked;
END $$;

NOTIFY pgrst, 'reload schema';
