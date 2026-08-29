# Serializer omits lead fields — view shows "Chưa kiểm tra" after save

**Related files:** `backend/payment_request_routes.py`, `frontend/src/components/payment-request/paymentRequestUtils.ts`, `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx`

**Problem:** Saving a PR after lead matching succeeded still showed "Chưa kiểm tra" in view mode, despite data being stored correctly in the database.

**Trap:** Assuming the bug is in the save path (frontend payload assembly or backend write logic). Both were correct — `buildLeadPayload()` sends all 6 fields, `_apply_lead_fields()` writes them to DB. A page reload would show the correct status, making this look intermittent or like a frontend state bug.

**Insight:** The shared serializer `_serialize_payment_request()` is the single funnel for ALL API responses (GET list, GET detail, PATCH response). It had `lead_source` and `lead_channel` but was missing the 6 result fields (`lead_matched`, `lead_id`, `lead_matched_by`, `sdt_goc`, `ly_do_khong_ghep`, `lead_check_at`). The PATCH saved to DB correctly, but the response body lacked these fields → frontend received `undefined` → `fromApiPaymentRequest()` mapped them as `undefined` → drawer display logic fell through to "Chưa kiểm tra".

**Rule:** When adding a new DB column group to a Supabase-backed entity, grep the serializer function (`_serialize_*`) to confirm ALL fields in the group are included. A field that's writable but not serialized is silently invisible — no error, no 500, just stale UI until page reload.

**Verify:** `grep -c "lead_" backend/payment_request_routes.py | head -1` — the serializer block (lines 320-327) should have 8 lead fields total (source, channel, matched, id, matched_by, sdt_goc, ly_do_khong_ghep, check_at).
