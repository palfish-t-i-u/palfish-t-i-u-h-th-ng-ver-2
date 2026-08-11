# Timestamp without time zone for VN financial dates

**Related files:** `backend/gateway_routes.py`, `backend/mpos_import.py`, `frontend/src/components/CardReconciliationTab.tsx`

**Problem:** `gateway_transactions.funded_date` was `date` type — losing the time component from mPOS "Ngày nhận tiền" (e.g. `2026-08-10 02:29:48`). Filter by date range worked but users couldn't see exact settlement time.

**Trap:** Using `timestamptz` (Postgres default for temporal data). mPOS raw data contains naive VN timestamps with no timezone info. Storing as `timestamptz` means Supabase/PostgREST applies the server timezone (UTC) on read, shifting dates by −7h. A transaction settled at `2026-08-10 02:29` VN time would display as `2026-08-09 19:29` — **off-by-one day** for anything near midnight. This is the same C-T1 lesson (`docs/learnings/2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md`).

**Insight:** Vietnamese financial source data (mPOS, Payoo, bank statements) is always naive VN time — no offset, no DST. Storing as `timestamp without time zone` preserves the exact value as-is. The entire app stack (FE formatters, SQL date filters, report aggregation) already treats all dates as VN-local. Adding `tz` creates a conversion layer that only introduces bugs.

**Rule:** For any new date/datetime column sourced from VN financial data (mPOS, Payoo, SePay, bank), use `timestamp without time zone`. Reserve `timestamptz` only for columns where the app explicitly manages timezone conversion (e.g. `created_at` from Supabase auth).

**Verify:** `grep -c 'timestamp without time zone' backend/mpos_import.py && psql -c "SELECT data_type FROM information_schema.columns WHERE table_name='gateway_transactions' AND column_name='funded_date';"` — expect `timestamp without time zone`.
