# Feedback 13/7 — 9 Tasks (Recon match-candidates + AR activation + Gateway NET) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 stale-candidate bugs + 1 referral regression in the payment/activation flow, add sale-name to the activation queue, temporarily silence 2 DingTalk event types, surface bill images in the bank-match drawer, and fix 2 mPOS/Payoo NET bugs (verified_received not written on already-paid lines; "Khớp tiền" filter misses net-entered lines) — from the 13/7 feedback of chị Thu Hiền + anh Hiếu + chị Vân (gateway NET handoff).

**Architecture:** Mostly surgical backend query hardening (`sepay_routes.py`, `gateway_routes.py`) + two small FE+BE pairs (referral passthrough, sale-name enrichment) + a notification re-architecture (T5). **8 of 9 tasks are zero-migration;** T5 alone carries ONE migration (`2026-07-13-notification-rearchitecture.sql` — SQL trigger reshape + `dingtalk_outbox` CHECK/dedup) applied sandbox→prod, plus one Render env var. All code ships via the normal `sandbox` → `main` deploy path.

**Tech Stack:** Backend Python/FastAPI (pytest, Supabase client). Frontend React 19 + TS (Vitest). Type-check with `tsc -b` (NOT `--noEmit`).

---

## Context — verified root causes (13/7 investigation)

| # | Symptom (reporter) | Verified root cause | File |
|---|---|---|---|
| **T1** | Lần TT đã ghép vẫn hiện trong đề xuất | Bank match-candidates has **no anti-join** on `bank_transactions.payment_line_id`. The card/installment sibling (`gateway_match_candidates`) HAS this guard; the bank one is missing it. | `backend/sepay_routes.py:684` |
| **T2** | PR đã huỷ vẫn hiện | Candidate query never filters PR state. `cancel_payment_request` only sets `payment_requests.state="cancelled"` — it leaves `payment_lines.status="pending"`, so the lines survive. | `backend/sepay_routes.py:684` + `payment_request_routes.py:1849` |
| **T3** | QR sale đã xóa vẫn hiện | Query filters only `status in (pending,paid)` and ignores the `payment_lines.cancelled` flag; abandoned/cancelled-PR lines stay `pending` and flood the list. | `backend/sepay_routes.py:684` |
| **T7** | Form kích hoạt mất field gói Refer | Create-AR modal → `ArDraftRow` (`{childName,uid,packageName,amount}`) + `buildCreateActiveRequestPayload` send only `{name,amount}`; BE `_assign_course_codes` whitelists course to `code/name/amount/order_id/invoiced` (drops `lead_source`). Course ends with `leadSource=undefined` → the AR editor referral block (gated on `leadSource==="gioi_thieu"`) never appears. | `PaymentRequestDetailDrawer.tsx:2597`, `types/paymentRequest.ts:238`, `paymentRequestUtils.ts:337`, `activation_routes.py:234` |
| **T6** | Thêm tên Sale vào "Chờ điền Order ID" | `ActiveRequest` type + `ActiveRequestApiRow` + `_serialize_ar` carry **no sale field** at all. | `types/paymentRequest.ts:186`, `activation_routes.py:324` |
| **T5** | Tắt tạm tin AR vào DingTalk | DingTalk has **no per-event gate** (Zalo has `ZALO_ENABLED_EVENTS`). Two Python enqueue sites fire `activation_request_created` + `activation_urgent_reminder`. `course_activated` ("Kích hoạt thành công") is enqueued by a **DB trigger**, so a Python gate leaves it untouched. | `activation_routes.py:1183, 2485`, `env_utils.py` |
| **T4** | Xem ảnh bill trong drawer ghép | Bank candidate returns no bill fields; the gateway candidate already returns `has_bill`+`bill_images[]`. | `backend/sepay_routes.py:771` + `ReconciliationTab.tsx:1685` |
| **T8** | Ghép mPOS rồi nhưng "Đã nhận" không đổi (báo Thừa sai) | In `match_gateway_txn`, `verified_received`/`verified_total` are written **only inside** `if can_auto_confirm`. When the accountant confirms the line FIRST (`status="paid"`) then matches → `already_paid=True` → `can_auto_confirm=False` → net skipped. `_mark_line_paid` also early-returns on paid (drops `extra`). PR keeps gross via `_line_net` → reports "Thừa". | `backend/gateway_routes.py:478-497`, `payment_request_routes.py:1317,261` |
| **T9** | "Khớp tiền" không ra PR khi sale nhập theo tiền thực nhận | Candidate query filters `payment_lines.amount == gateway_gross`. Sale sometimes enters the line at NET (after fee) → `.eq("amount", gross)` misses it. | `backend/gateway_routes.py:383-387` |

---

## GUARDRAILS — invariants, violating = broken

- **G1 — Existing recon tests stay green.** `backend/tests/test_sepay_match_candidates.py` currently asserts `line-1` is a candidate then matches it. After T1–T3, PR-1/PR-2 have no `state`/`cancelled`/matched-bank → they must still pass unchanged. Do NOT edit existing assertions; only ADD rows + tests.
- **G2 — Default candidate behavior for a normal pending line is unchanged.** A `pending` line, PR not cancelled, not matched elsewhere, `cancelled` falsy → still returned. The new filters are pure exclusions of dead rows.
- **G3 — No DB migration, no schema change.** `payment_lines.cancelled` and `payment_requests.state` already exist. We only READ them. If a column turns out absent at runtime, fail-open (treat as not-cancelled) — never 500 the endpoint.
- **G4 — T5 must NOT silence `course_activated`.** Only gate the two Python enqueues (`activation_request_created`, `activation_urgent_reminder`). `course_activated` is trigger-based — do not touch triggers, do not disable `dingtalk_team_groups.is_active` (that would also kill the success message + urgent reminders wholesale).
- **G5 — T5 default = everything ON.** Empty/unset env ⇒ current behavior (both events fire). The env only DISABLES named events. A temporary toggle must be reversible by editing one env var, no redeploy of logic.
- **G6 — T7 reuses the existing referral editor.** Do NOT duplicate the referral-bonus form into the create modal. Auto-derive `lead_source="gioi_thieu"` for REFER packages so the tested `ActiveRequestMiniCardV2` referral block (`leadSource==="gioi_thieu"`) reappears. Sale fills referrer UID + bonus sessions there (the PATCH path already persists them).
- **G7 — T7 keeps `buildCreateActiveRequestPayload` semantics.** It still groups by `childName|uid`; we only ADD an optional `lead_source` onto the course object. Non-REFER packages send NO `lead_source` (unchanged payload byte-for-byte).
- **G8 — `tsc -b` must pass.** Every FE task ends with `cd frontend && npx tsc -b`. Never `--noEmit`.
- **G9 — Enrichment queries stay O(1) in round-trips.** T6 sale-name + T1 anti-join must each be a SINGLE extra Supabase call per request (batch lookups; no per-row queries). Criterion 3 (no perf regression).
- **G10 — Match/serialize field names are snake_case on the wire, camelCase in FE types.** Follow the existing `fromApi*` mappers; don't invent new casing.
- **G11 — T8 net write must be gross-safe + idempotent.** Only write `verified_received`/`verified_total` when `net_amount > 0` (gross-only settlements untouched). Write DIRECTLY via `payment_lines.update` (NOT via `_mark_line_paid`, which early-returns on paid and drops `extra`). After writing, `recompute_payment_request_totals` must run so `received`/`state` reflect `_line_net`. Do not double-recompute: `_mark_line_paid` already recomputes when it runs.
- **G12 — T9 uses `.in_("amount", [...])`, NOT `.or_(...)`.** The gateway test mock's `or_` only understands `.ilike.` clauses (ignores `.eq.`), so an `amount.eq` OR-filter would silently pass all rows in tests while behaving differently in prod. `.in_` is supported by the mock and reads clearer. Never widen to net when `net == gross` or `net == 0`.
- **G13 — T5 Tin #1 fires exactly once per PR.** Guard both ways: the transition check (`state=="done" and old_state!="done"`) AND the `dingtalk_outbox` UNIQUE(source_table, source_id, event_type) index. The producer swallows the duplicate-insert exception. Never enqueue on every recompute.
- **G14 — T5 must not break the LIVE `payment_paid` Zalo tin.** It fires on every confirmed line for real teams. The SQL trigger stays `SECURITY DEFINER`, every field `COALESCE`-defaulted, and NEVER raises (a broken trigger blocks `payment_lines` writes = blocks reconciliation). Apply to sandbox + send a real test payment BEFORE prod. Keep the Python mirror byte-identical in format to the SQL.
- **G15 — T5 producers are best-effort.** `_enqueue_pr_fully_paid_dingtalk` wraps everything in `try/except` and never raises — a notification failure must never fail `recompute_payment_request_totals` (which gates PR state + ledger sync).

---

## File Structure (what each task touches)

| Task | Backend | Frontend | Tests |
|---|---|---|---|
| T1+T2+T3 | `sepay_routes.py` (`bank_txn_match_candidates`) | — | `tests/test_sepay_match_candidates.py` (ADD rows+cases) |
| T5 (A) | `env_utils.py` (+helper), `activation_routes.py` (2 guards) | — | `tests/test_dingtalk_ar_created.py` (ADD gate cases) |
| T5 (B) | `migrations/2026-07-13-notification-rearchitecture.sql`, `utils/zalo_message_builder.py` | — | `tests/test_zalo_builder.py` (ADD) |
| T5 (C) | same migration, `payment_request_routes.py` (producer+hook), `dingtalk_outbox_worker.py` (title) | — | `tests/test_pr_fully_paid_dingtalk.py` (NEW) |
| T7 | `activation_routes.py` (`_assign_course_codes`) | `types/paymentRequest.ts`, `paymentRequestUtils.ts`, `PaymentRequestDetailDrawer.tsx` | `paymentRequestUtils.referral.test.ts` (NEW), BE `tests/test_ar_lead_source_passthrough.py` (NEW) |
| T6 | `activation_routes.py` (AR list enrich) | `types/paymentRequest.ts`, `paymentRequestUtils.ts`, `ActivationTab.tsx` | BE list test, FE mapper test |
| T4 | `sepay_routes.py` (candidate bill fields) | `types` (BankMatchCandidate), `ReconciliationTab.tsx` | `api.reconciliation.test.ts` (ADD) |
| T8+T9 | `gateway_routes.py` (`match_gateway_txn` net write + `gateway_match_candidates` amount filter) | — | `tests/test_gateway_routes.py` (ADD 2 cases) |

**Commit order:** T1+T2+T3 → T5 → T8+T9 → T7 → T6 → T4. Each is an independent commit; T1–T3 ship first (chị Hiền is waiting), then the two quick BE fixes (T5 config gate, T8+T9 gateway), then the FE-heavier ones.

**4-criteria note (mọi task):** ① triệt để — fix the query/source, not the symptom (T5 changes the notification *triggers*, not just message text) ② không lỗi con — pure exclusions / additive fields, existing tests locked green, T5 producers best-effort + idempotent ③ không tăng gánh hạ tầng — 8/9 zero-migration; T5's single migration reuses the existing outbox/trigger infra (no new service), lookups single-round-trip ④ token/quota — no fan-out; each task is one file-cluster, TDD locally.

---

## Task 1: T1+T2+T3 — Harden `bank_txn_match_candidates`

Single function, three exclusions. This is the highest-priority fix.

**Files:**
- Modify: `backend/sepay_routes.py:684-790` (`bank_txn_match_candidates`)
- Test: `backend/tests/test_sepay_match_candidates.py`

- [ ] **Step 1: Add failing test rows + cases**

In `backend/tests/test_sepay_match_candidates.py`, extend `FakeSB.__init__`:
- add to `payment_lines` list:
```python
                {
                    # T1: line đã ghép với bank_transaction khác → phải loại
                    "id": "line-used", "payment_request_id": "PR-1",
                    "amount": 5000000, "method": "transfer", "status": "paid",
                    "transfer_code": "TT100", "created_at": "2026-06-18T09:00:00+00:00",
                },
                {
                    # T2: line thuộc PR đã huỷ → phải loại
                    "id": "line-cancel-pr", "payment_request_id": "PR-CANCEL",
                    "amount": 5000000, "method": "transfer", "status": "pending",
                    "transfer_code": "TT200", "created_at": "2026-06-18T08:00:00+00:00",
                },
                {
                    # T3: line có cancelled=True → phải loại
                    "id": "line-cancelled", "payment_request_id": "PR-2",
                    "amount": 5000000, "method": "transfer", "status": "pending",
                    "transfer_code": "TT300", "created_at": "2026-06-18T07:00:00+00:00",
                    "cancelled": True,
                },
```
- add to `payment_requests` list:
```python
                {"id": "PR-CANCEL", "name": "Cancelled Parent", "uid": "uid-c",
                 "phone": "0901000009", "child_name": "", "sale_email": "sale@test.com",
                 "state": "cancelled"},
```
- add a second matched bank txn to `bank_transactions` list:
```python
                {"txn_id": "txn-bank-2", "amount": 5000000,
                 "match_status": "manual_matched", "payment_line_id": "line-used"},
```
Then append the test cases:
```python
def test_candidates_exclude_dead_lines():
    """T1 (đã ghép bank khác) + T2 (PR huỷ) + T3 (cancelled flag) đều bị loại."""
    sb = FakeSB()
    client = build_client(sb)
    with patch("sepay_routes.resolve_actor", return_value=ACTOR):
        with patch("sepay_routes.require_module_write"):
            resp = client.get(
                "/api/v1/bank-transactions/txn-bank-1/match-candidates?amount_exact=5000000"
            )
    assert resp.status_code == 200
    ids = {r["payment_line_id"] for r in resp.json()}
    assert "line-1" in ids               # G2: line lành vẫn còn
    assert "line-used" not in ids        # T1
    assert "line-cancel-pr" not in ids   # T2
    assert "line-cancelled" not in ids   # T3
```

- [ ] **Step 2: Run test — verify it FAILS**

Run: `cd backend && python -m pytest tests/test_sepay_match_candidates.py -v`
Expected: `test_candidates_exclude_dead_lines` FAILS (dead lines currently returned); the two existing tests still PASS.

- [ ] **Step 3: Implement the exclusions**

In `bank_txn_match_candidates`, (a) add `cancelled` to the line select, (b) add `state` to the PR select, (c) add the anti-join fetch + a single filter pass before building `candidates`.

Change the line query select (line ~709) to include `cancelled`:
```python
            .select("id, payment_request_id, amount, method, status, transfer_code, created_at, student_name, cancelled")
```
Change the PR lookup select (line ~728) to include `state`:
```python
                    .select("id, name, uid, phone, child_name, sale_email, state")
```
Immediately AFTER `pr_info = {...}` is built (after line ~732), insert:
```python
        # T1 — lần TT đã ghép với bank_transaction KHÁC (đã "tiêu thụ") → loại.
        # Mirror gateway_match_candidates used_line_ids (gateway_routes.py ~388).
        used_line_ids: set[str] = set()
        try:
            used_res = (
                sb.table("bank_transactions")
                .select("payment_line_id, txn_id, match_status")
                .in_("match_status", ["manual_matched", "auto_matched"])
                .execute()
            )
            used_line_ids = {
                str(r.get("payment_line_id"))
                for r in (used_res.data or [])
                if r.get("payment_line_id") and str(r.get("txn_id")) != str(txn_id)
            }
        except Exception as exc:
            print(f"[sepay] used-line anti-join failed (fail-open): {exc}")

        def _line_is_dead(line: dict) -> bool:
            if str(line.get("id")) in used_line_ids:
                return True                                   # T1
            if line.get("cancelled"):
                return True                                   # T3
            pr_row = pr_info.get(line.get("payment_request_id", ""), {})
            if _clean_text(pr_row.get("state")).lower() == "cancelled":
                return True                                   # T2
            return False

        lines = [l for l in lines if not _line_is_dead(l)]
```
> `pr_info` is already populated above from `pr_ids`; keep that block as-is. The filter runs after it. `_clean_text` is already imported/used in this file.

- [ ] **Step 4: Run test — verify PASS**

Run: `cd backend && python -m pytest tests/test_sepay_match_candidates.py -v`
Expected: ALL pass (2 existing + new `test_candidates_exclude_dead_lines`).

- [ ] **Step 5: Full recon suite regression**

Run: `cd backend && python -m pytest tests/test_sepay_match_candidates.py tests/test_gateway_routes.py -v`
Expected: PASS (gateway untouched, bank hardened).

- [ ] **Step 6: Commit**

```bash
git add backend/sepay_routes.py backend/tests/test_sepay_match_candidates.py
git commit -m "fix(recon): loại lần TT chết khỏi đề xuất ghép CK ngoài (T1/T2/T3)

- T1: anti-join bank_transactions.payment_line_id đã matched (mirror gateway)
- T2: loại line thuộc PR state=cancelled (cancel_payment_request để status pending)
- T3: loại line có cancelled=true
Fail-open nếu thiếu cột. 0 migration."
```

---

## Task 2: T5 — Notification re-architecture (per anh Hiếu spec) ⚠️ HAS MIGRATION

Redesign notification producers to match anh Hiếu's spec (decisions confirmed 13/7):
- **Part A** — turn OFF the 2 old DingTalk tins (`activation_request_created` + `activation_urgent_reminder`) via env flag (keep code, reversible).
- **Part B** — reshape the Zalo `payment_paid` tin ("tiền vào TK", fires per confirmed line) content → spec: `mã PR · lần #k · net vào TK · lũy kế / tổng dự kiến`. **Keep the old visual layout** (emoji header + 🔸 bullets), change content only. Live path = SQL trigger → migration + Python mirror.
- **Part C** — NEW DingTalk Tin #1 "đơn đủ tiền" (`pr_fully_paid`): fires ONCE per PR when state → `done` (Σnet reaches target). Content: `mã PR · học viên · tổng net`. No activation request. New event_type → migration.
- **Keep** DingTalk `course_activated` (Tin #2) untouched.

**Migration model:** unlike the other 8 tasks, T5 touches DB (SQL trigger + `dingtalk_outbox` CHECK constraint + dedup index). Apply **sandbox → smoke → prod** (see final deploy note). This is the ONLY task with a migration.

### Part A — env flag to silence the 2 old DingTalk tins

**Files:** `backend/env_utils.py` (+ helper), `backend/activation_routes.py` (2 guards: `_enqueue_activation_request_created_dingtalk` ~1100, urgent-reminder DingTalk block ~2484), `backend/tests/test_dingtalk_ar_created.py`

- [ ] **Step A1: Write failing test**

Add to `backend/tests/test_dingtalk_ar_created.py`:
```python
import os
from env_utils import dingtalk_event_enabled

def test_dingtalk_event_enabled_default_all_on(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    assert dingtalk_event_enabled("activation_request_created") is True
    assert dingtalk_event_enabled("course_activated") is True

def test_dingtalk_event_enabled_denylist(monkeypatch):
    monkeypatch.setenv(
        "DINGTALK_DISABLED_EVENTS",
        "activation_request_created, activation_urgent_reminder",
    )
    assert dingtalk_event_enabled("activation_request_created") is False
    assert dingtalk_event_enabled("activation_urgent_reminder") is False
    assert dingtalk_event_enabled("course_activated") is True   # G4
```

- [ ] **Step 2: Run test — verify FAIL**

Run: `cd backend && python -m pytest tests/test_dingtalk_ar_created.py -k dingtalk_event_enabled -v`
Expected: FAIL (`ImportError: cannot import name 'dingtalk_event_enabled'`).

- [ ] **Step 3: Add the helper**

Append to `backend/env_utils.py`:
```python
def dingtalk_event_enabled(event_type: str) -> bool:
    """False when event_type is listed in DINGTALK_DISABLED_EVENTS (comma-sep).

    Denylist so default (unset/empty) = every event enabled (current behavior).
    Temporary kill-switch: set the env, no code redeploy needed to revert.
    """
    raw = (os.getenv("DINGTALK_DISABLED_EVENTS") or "").strip()
    if not raw:
        return True
    disabled = {e.strip() for e in raw.split(",") if e.strip()}
    return event_type not in disabled
```

- [ ] **Step 4: Guard the two Python enqueue sites**

In `backend/activation_routes.py`, add the import near the other env imports (top, where `is_sandbox_env`/`dingtalk_outbound_enabled` may already be imported from `env_utils`):
```python
from env_utils import dingtalk_event_enabled
```
Guard 1 — at the top of `_enqueue_activation_request_created_dingtalk` body (inside `try:`, first line after it, ~line 1100):
```python
        if not dingtalk_event_enabled("activation_request_created"):
            print("[dingtalk] activation_request_created skipped (DINGTALK_DISABLED_EVENTS)")
            return
```
Guard 2 — the urgent-reminder DingTalk block (~line 2465, inside its `try:` before the `dingtalk_outbox` insert at ~2485):
```python
            if not dingtalk_event_enabled("activation_urgent_reminder"):
                print("[dingtalk] activation_urgent_reminder skipped (DINGTALK_DISABLED_EVENTS)")
            elif dt_group.data and dt_group.data[0].get("is_active"):
                sb.table("dingtalk_outbox").insert({ ... })   # keep existing insert body unchanged
```
> Restructure the existing `if dt_group.data and dt_group.data[0].get("is_active"):` into the `elif` above so the gate short-circuits first. Do not change the insert payload.

- [ ] **Step 5: Run tests — verify PASS**

Run: `cd backend && python -m pytest tests/test_dingtalk_ar_created.py -v`
Expected: PASS (new gate cases + existing AR-created tests).

- [ ] **Step 6: Commit + deploy note**

```bash
git add backend/env_utils.py backend/activation_routes.py backend/tests/test_dingtalk_ar_created.py
git commit -m "feat(dingtalk): per-event denylist gate DINGTALK_DISABLED_EVENTS (T5)

Tắt tạm activation_request_created + activation_urgent_reminder mà KHÔNG
đụng course_activated (trigger). Default trống = mọi event bật (không đổi behavior."
```
> **Deploy (Part A):** After merge, on Render set `DINGTALK_DISABLED_EVENTS=activation_request_created,activation_urgent_reminder` for BOTH `palfish-backend` (prod) and sandbox. Revert = clear the var.

### Part B — reshape Zalo `payment_paid` content ("tiền vào TK")

Live path is the SQL trigger `build_payment_paid_message` (fired by `trg_payment_paid_zalo` on `payment_lines` when status→paid). Keep the old emoji/🔸 layout; change content to `mã PR · lần #k · net · lũy kế/tổng`. Update SQL (live) + Python mirror (parity) together.

**Files:**
- Create: `backend/migrations/2026-07-13-notification-rearchitecture.sql`
- Modify: `backend/utils/zalo_message_builder.py` (`build_payment_paid_message`)
- Test: `backend/tests/test_zalo_builder.py`

**Target message (design — wording adjustable):**
```
💰 ĐÃ VÀO TK · PR-2026-0221 · Lần #2
🔸 KH Nguyễn Văn A · Bé Bin · Sale Hoa · Team Inhouse 1
🔸 Net vào TK: 24,785,680 VND · Thẻ · 09:12 12/07/2026
🔸 Lũy kế: 27,785,680 / 35,000,000 VND (79%)
```

- [ ] **Step B1: Write the migration (SQL trigger, CREATE OR REPLACE)**

Create `backend/migrations/2026-07-13-notification-rearchitecture.sql` with the trigger rewrite (idempotent). Computes `lần #k` (rank by created_at within the PR) + `lũy kế` (Σnet of paid lines) + `tổng dự kiến` (`pr.target`):
```sql
-- Migration 2026-07-13: Notification re-architecture (T5)
--  Part B: Zalo payment_paid content → spec (mã PR · lần #k · net · lũy kế/tổng)
--  Part C: DingTalk pr_fully_paid event_type + dedup index
-- Target: sandbox (pxgybyfiwywksesyogti) → smoke → PRODUCTION (jozcvbbypwvzaefteoxn)
-- Idempotent. Base: 2026-07-10-zalo-payment-paid-net-amount.sql

CREATE OR REPLACE FUNCTION public.build_payment_paid_message(line_row payment_lines)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_sale_email TEXT; v_customer TEXT; v_child TEXT; v_phone TEXT; v_country TEXT;
  v_sale_team TEXT; v_sale_name TEXT; v_target NUMERIC;
  v_net NUMERIC; v_k INT; v_cumulative NUMERIC; v_percent INT;
  v_time_fmt TEXT; v_phone_fmt TEXT; v_method_label TEXT; v_child_seg TEXT := '';
BEGIN
  SELECT pr.sale_email, pr.name, pr.child_name, pr.phone, pr.country, ns.team,
         COALESCE(ns.display_name, ns.crm_name), pr.target
    INTO v_sale_email, v_customer, v_child, v_phone, v_country, v_sale_team, v_sale_name, v_target
    FROM public.payment_requests pr
    LEFT JOIN public.nhan_su_sale ns ON ns.email ILIKE pr.sale_email
    WHERE pr.id = line_row.payment_request_id LIMIT 1;

  IF LOWER(COALESCE(line_row.method,'')) IN ('card','installment') AND line_row.verified_received IS NOT NULL THEN
    v_net := line_row.verified_received;
  ELSE
    v_net := line_row.amount;
  END IF;

  SELECT COUNT(*) INTO v_k FROM public.payment_lines
   WHERE payment_request_id = line_row.payment_request_id AND created_at <= line_row.created_at;

  SELECT COALESCE(SUM(CASE WHEN LOWER(COALESCE(method,'')) IN ('card','installment') AND verified_received IS NOT NULL
                           THEN verified_received ELSE amount END), 0)
    INTO v_cumulative FROM public.payment_lines
   WHERE payment_request_id = line_row.payment_request_id AND LOWER(COALESCE(status,'')) = 'paid';

  v_percent := CASE WHEN COALESCE(v_target,0) > 0 THEN ROUND(v_cumulative*100/v_target) ELSE 0 END;
  v_time_fmt := to_char(COALESCE(line_row.paid_at, line_row.confirmed_at, line_row.created_at)
                        AT TIME ZONE 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM/YYYY');
  v_phone_fmt := public.format_phone_intl(v_phone, v_country);
  v_method_label := CASE LOWER(COALESCE(line_row.method,''))
    WHEN 'qr' THEN 'Chuyển khoản QR' WHEN 'cash' THEN 'Tiền mặt' WHEN 'card' THEN 'Thẻ'
    WHEN 'installment' THEN CASE WHEN COALESCE(NULLIF(TRIM(line_row.installment_platform),''),'') <> ''
      THEN 'Trả góp ' || TRIM(line_row.installment_platform) ELSE 'Trả góp' END
    ELSE '?' END;
  IF v_child IS NOT NULL AND TRIM(v_child) <> '' THEN
    v_child_seg := format(' · Bé %s', TRIM(v_child));
  END IF;

  RETURN
    format(E'\U0001F4B0 ĐÃ VÀO TK · %s · Lần #%s', line_row.payment_request_id, v_k) || E'\n' ||
    format(E'\U0001F538 KH %s%s · Sale %s · Team %s',
           COALESCE(NULLIF(TRIM(v_customer),''),'?'), v_child_seg,
           COALESCE(NULLIF(TRIM(v_sale_name),''), NULLIF(TRIM(v_sale_email),''),'?'),
           COALESCE(NULLIF(TRIM(v_sale_team),''),'?')) || E'\n' ||
    format(E'\U0001F538 Net vào TK: %s VND · %s · %s',
           to_char(v_net,'FM999,999,999,999'), v_method_label, COALESCE(v_time_fmt,'?')) || E'\n' ||
    format(E'\U0001F538 Lũy kế: %s / %s VND (%s%%)',
           to_char(v_cumulative,'FM999,999,999,999'), to_char(COALESCE(v_target,0),'FM999,999,999,999'), v_percent);
END;
$function$;

-- Part C: cho phép pr_fully_paid + đảm bảo dedup 1 lần/PR
ALTER TABLE public.dingtalk_outbox DROP CONSTRAINT IF EXISTS dingtalk_outbox_event_type_check;
ALTER TABLE public.dingtalk_outbox ADD CONSTRAINT dingtalk_outbox_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'payment_paid'::text, 'course_activated'::text, 'activation_urgent_reminder'::text,
    'activation_request_created'::text, 'pr_fully_paid'::text]));
-- Dedup: nếu index này FAIL vì có dòng trùng cũ → dedupe trước rồi chạy lại.
CREATE UNIQUE INDEX IF NOT EXISTS dingtalk_outbox_source_event_uidx
  ON public.dingtalk_outbox (source_table, source_id, event_type);
```

- [ ] **Step B2: Update the Python mirror + failing test**

In `backend/tests/test_zalo_builder.py`, add a case asserting the new content from `payment_data` carrying `payment_request_id`, `installment_index`, `cumulative_net`, `target`:
```python
def test_payment_paid_message_pr_focused_content():
    from utils.zalo_message_builder import build_payment_paid_message
    msg = build_payment_paid_message(
        {"payment_request_id": "PR-2026-0221", "customer_name": "Nguyễn Văn A",
         "child_name": "Bin", "phone": "0900000000", "country": "VN", "method": "card",
         "verified_received": 24785680, "amount": 25240000, "paid_at": "2026-07-12T02:12:00+00:00",
         "installment_index": 2, "cumulative_net": 27785680, "target": 35000000},
        {"display_name": "Hoa", "team": "Inhouse 1"},
    )["message"]
    assert "PR-2026-0221" in msg and "Lần #2" in msg
    assert "24,785,680" in msg           # net vào TK (thực nhận)
    assert "27,785,680 / 35,000,000" in msg  # lũy kế / tổng
```

- [ ] **Step B3: Run — verify FAIL**, then update `build_payment_paid_message`

Run: `cd backend && python -m pytest tests/test_zalo_builder.py::test_payment_paid_message_pr_focused_content -v` → FAIL.
Replace the message assembly (`zalo_message_builder.py` ~224-235) so it mirrors the SQL exactly:
```python
    pr_code = _first_nonempty(payment_data.get("payment_request_id"), default="?")
    k = payment_data.get("installment_index")
    k_str = str(k) if k not in (None, "") else "?"
    def _fmt(v):
        try: return f"{int(v):,}"
        except (TypeError, ValueError): return "0"
    net_str = _fmt(amount_source)                    # amount_source đã tính net ở block trên
    cum_str = _fmt(payment_data.get("cumulative_net"))
    target_val = payment_data.get("target")
    tgt_str = _fmt(target_val)
    try: pct = round(int(payment_data.get("cumulative_net") or 0) * 100 / int(target_val)) if target_val else 0
    except (TypeError, ValueError, ZeroDivisionError): pct = 0
    child_seg = f" · Bé {child_name}" if child_name else ""
    message = (
        f"💰 ĐÃ VÀO TK · {pr_code} · Lần #{k_str}\n"
        f"🔸 KH {customer}{child_seg} · Sale {sale_name} · Team {team_display}\n"
        f"🔸 Net vào TK: {net_str} VND · {method_label} · {time_str}\n"
        f"🔸 Lũy kế: {cum_str} / {tgt_str} VND ({pct}%)"
    )
```
> `amount_source`/`customer`/`child_name`/`sale_name`/`team_display`/`method_label`/`time_str` are already computed earlier in the function — reuse them; do not recompute. Run the test → PASS. Keep the docstring's "mirror of SQL" note pointing at this migration.

### Part C — NEW DingTalk Tin #1 "đơn đủ tiền" (`pr_fully_paid`)

Fires once per PR when `recompute_payment_request_totals` transitions state INTO `done`. Producer lives in `payment_request_routes.py` (self-contained: sale-team lookup + insert; no `activation_routes` import → no circular).

**Files:**
- Modify: `backend/payment_request_routes.py` (new `_enqueue_pr_fully_paid_dingtalk` + hook in `recompute_payment_request_totals:1279`)
- Modify: `backend/dingtalk_outbox_worker.py:19-23` (EVENT_TITLES)
- Migration: (already in Step B1 — CHECK + dedup index)
- Test: `backend/tests/test_pr_fully_paid_dingtalk.py` (NEW)

- [ ] **Step C1: Add worker title**

In `backend/dingtalk_outbox_worker.py` `EVENT_TITLES` (line 19-23) add:
```python
    "pr_fully_paid": "Đơn đã đủ tiền",
```

- [ ] **Step C2: Write failing test**

Create `backend/tests/test_pr_fully_paid_dingtalk.py` (FakeSB with a PR at target, a paid line, a dingtalk_team_groups row). Assert calling `recompute_payment_request_totals` when the sum reaches target enqueues ONE `pr_fully_paid` row, and a second call does NOT duplicate:
```python
from __future__ import annotations
import os, sys
from unittest.mock import MagicMock, patch
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

def test_pr_fully_paid_enqueued_once_on_done():
    import payment_request_routes as prr
    outbox = []
    # ... minimal FakeSB: payment_requests[state='short',target=1000,sale_email], payment_lines[amount=1000,status='paid'],
    #     nhan_su_sale[team='Inhouse 1'], dingtalk_team_groups[team_code='Inhouse 1',is_active=True],
    #     dingtalk_outbox insert → append to `outbox`, honoring UNIQUE(source_table,source_id,event_type)
    #     (follow the FakeSB pattern in test_dingtalk_ar_created.py)
    sb = _FakeSB(outbox)
    prr.recompute_payment_request_totals(sb, "PR-1")
    prr.recompute_payment_request_totals(sb, "PR-1")   # idempotent
    fully = [r for r in outbox if r["event_type"] == "pr_fully_paid"]
    assert len(fully) == 1
    assert "PR-1" in fully[0]["message"]
```
> Model the FakeSB's `dingtalk_outbox` insert to raise on duplicate `(source_table, source_id, event_type)` so the producer's `except: pass` path is exercised (mirror the real UNIQUE index).

- [ ] **Step C3: Run — verify FAIL**, then add producer + hook

Run: `cd backend && python -m pytest tests/test_pr_fully_paid_dingtalk.py -v` → FAIL.
Add the producer near the other helpers in `payment_request_routes.py`:
```python
def _enqueue_pr_fully_paid_dingtalk(sb, pr_row: dict[str, Any], received: int) -> None:
    """DingTalk Tin #1 'đơn đủ tiền' — 1 lần/PR khi state→done. Best-effort, NEVER raises."""
    try:
        from env_utils import dingtalk_event_enabled
        if not dingtalk_event_enabled("pr_fully_paid"):
            return
        if pr_row.get("is_test"):
            return
        sale_email = _clean_text(pr_row.get("sale_email")).lower()
        if not sale_email:
            return
        staff_res = (
            sb.table("nhan_su_sale").select("email, team")
            .ilike("email", sale_email).limit(1).execute()
        )
        team = _clean_text((staff_res.data or [{}])[0].get("team"))
        if not team:
            return
        g = (
            sb.table("dingtalk_team_groups").select("team_code, is_active")
            .eq("team_code", team).limit(1).execute()
        )
        if not g.data or not g.data[0].get("is_active"):
            return
        pr_id = str(pr_row.get("id") or "")
        student = _clean_text(pr_row.get("child_name")) or _clean_text(pr_row.get("name")) or "?"
        recv_fmt = f"{int(received):,}".replace(",", ".")
        tgt_fmt = f"{int(_parse_amount(pr_row.get('target'))):,}".replace(",", ".")
        msg = (
            f"✅ ĐƠN ĐÃ ĐỦ TIỀN — {pr_id}\n"
            f"Học viên: {student}\n"
            f"Tổng net đã thu: {recv_fmt} / {tgt_fmt} VND"
        )
        try:
            sb.table("dingtalk_outbox").insert({
                "event_type": "pr_fully_paid",
                "source_table": "payment_requests",
                "source_id": pr_id,
                "team_code": team,
                "message": msg,
            }).execute()
        except Exception:
            pass  # idempotent — UNIQUE(source_table, source_id, event_type)
    except Exception as exc:
        print(f"[dingtalk] pr_fully_paid enqueue failed (non-fatal): {exc}")
```
Then hook it in `recompute_payment_request_totals` — right after `updated = update_res.data[0] ...` (line ~1279), BEFORE the ledger-sync block:
```python
    old_state = _clean_text(pr_row.get("state")).lower()
    if state == "done" and old_state != "done":
        _enqueue_pr_fully_paid_dingtalk(sb, updated, received)
```
> Transition guard (`old_state != "done"`) avoids re-enqueue on every recompute; the UNIQUE index is the hard backstop for "1 lần duy nhất / PR" (G13). `updated` carries `sale_email`/`child_name`/`name`/`target` from the PR row (select `*` at line 1244).

- [ ] **Step C4: Run — verify PASS + full notification regression**

Run: `cd backend && python -m pytest tests/test_pr_fully_paid_dingtalk.py tests/test_dingtalk_ar_created.py tests/test_zalo_builder.py -v`
Expected: PASS.

- [ ] **Step C5: Commit (Parts B+C together — they share the migration)**

```bash
git add backend/migrations/2026-07-13-notification-rearchitecture.sql backend/utils/zalo_message_builder.py backend/payment_request_routes.py backend/dingtalk_outbox_worker.py backend/tests/test_zalo_builder.py backend/tests/test_pr_fully_paid_dingtalk.py
git commit -m "feat(notify): re-architecture theo spec Hiếu (T5)

- Zalo payment_paid: nội dung mã PR · lần #k · net · lũy kế/tổng (giữ bố cục cũ)
- DingTalk Tin #1 pr_fully_paid: bắn 1 lần/PR khi state→done (đơn đủ tiền)
- course_activated (Tin #2) giữ nguyên; 2 tin cũ tắt qua flag (Part A)
Migration: SQL trigger + dingtalk_outbox CHECK + dedup index."
```
> **Deploy (Parts B+C):** Apply `backend/migrations/2026-07-13-notification-rearchitecture.sql` to **sandbox first** → send a test payment on a sandbox PR → verify the new Zalo text + that a done PR posts exactly one `pr_fully_paid` DingTalk → then apply to prod. Per [[feedback_dingtalk_test_own_account]], route sandbox tests to your own group, not the live team groups.

---

## Task 3: T7 — Restore referral capability for REFER packages (FE+BE)

Auto-derive `lead_source="gioi_thieu"` at creation so the existing AR-editor referral block reappears (G6).

**Files:**
- Modify: `backend/activation_routes.py:234-242` (`_assign_course_codes` — passthrough `lead_source`/`lead_channel`)
- Modify: `frontend/src/types/paymentRequest.ts:238` (`CreateActiveRequestCoursePayload`)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts:337` (`buildCreateActiveRequestPayload` + new `isReferralPackage`)
- Modify: `frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx:2585` (modal hint — optional discoverability)
- Test: `backend/tests/test_ar_lead_source_passthrough.py` (NEW), `frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts` (NEW)

### 3a — Backend passthrough

- [ ] **Step 1: Write failing BE test**

Create `backend/tests/test_ar_lead_source_passthrough.py`:
```python
from __future__ import annotations
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from activation_routes import _assign_course_codes

def test_assign_course_codes_carries_lead_source():
    uids = [{
        "uid": "u1", "courses": [
            {"name": "2/W- Both AB REFER 96", "amount": 35000000, "lead_source": "gioi_thieu"},
            {"name": "2/W- Normal 48", "amount": 10000000},
        ],
    }]
    out = _assign_course_codes(uids, "PR-2026-0249")
    courses = out[0]["courses"]
    assert courses[0]["lead_source"] == "gioi_thieu"
    assert "lead_source" not in courses[1]   # G7: gói thường không gắn nguồn
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_ar_lead_source_passthrough.py -v`
Expected: FAIL (`KeyError: 'lead_source'` — normalizer drops it).

- [ ] **Step 3: Carry `lead_source`/`lead_channel` in the normalizer**

In `_assign_course_codes` (`backend/activation_routes.py`), replace the `norm_courses.append({...})` block (~234-242) with:
```python
            norm_course = {
                "code": code,
                "name": _course_name(c),
                "amount": _course_amount(c),
                "order_id": str(order_raw or "").strip(),
                "invoiced": False,
            }
            ls = str(c.get("lead_source") or "").strip()
            if ls:
                norm_course["lead_source"] = ls
            lc = str(c.get("lead_channel") or "").strip()
            if lc:
                norm_course["lead_channel"] = lc
            norm_courses.append(norm_course)
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_ar_lead_source_passthrough.py tests/test_pr_multi_child.py -v`
Expected: PASS (new test + existing AR tests untouched).

### 3b — Frontend auto-derive

- [ ] **Step 5: Write failing FE test**

Create `frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isReferralPackage, buildCreateActiveRequestPayload } from "./paymentRequestUtils";
import type { PaymentRequest } from "../../types/paymentRequest";

const PR = { id: "PR-1", uid: "u1", phone: "0900000000", country: "VN" } as unknown as PaymentRequest;

describe("isReferralPackage", () => {
  it("detects REFER in name (case-insensitive)", () => {
    expect(isReferralPackage("2/W- Both AB REFER 96 PHI+10 HN")).toBe(true);
    expect(isReferralPackage("2/w both ab refer 96")).toBe(true);
  });
  it("false for non-referral packages", () => {
    expect(isReferralPackage("2/W- Both AB 96 PHI+10 HN")).toBe(false);
    expect(isReferralPackage("")).toBe(false);
  });
});

describe("buildCreateActiveRequestPayload referral", () => {
  it("tags gioi_thieu on REFER courses only", () => {
    const payload = buildCreateActiveRequestPayload(PR, [
      { childName: "Bé A", uid: "u1", packageName: "2/W- Both AB REFER 96", amount: 35000000 },
      { childName: "Bé A", uid: "u1", packageName: "2/W- Normal 48", amount: 10000000 },
    ]);
    const courses = payload.uids[0].courses;
    expect(courses[0].lead_source).toBe("gioi_thieu");
    expect(courses[1].lead_source).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run — verify FAIL**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.referral.test.ts`
Expected: FAIL (`isReferralPackage` not exported; `lead_source` undefined on course).

- [ ] **Step 7: Add type field + helper + payload wiring**

In `frontend/src/types/paymentRequest.ts`, extend `CreateActiveRequestCoursePayload` (line 238):
```ts
export type CreateActiveRequestCoursePayload = {
  name?: string;
  package_name?: string;
  amount: number;
  /** "gioi_thieu" khi gói là gói giới thiệu (REFER) — mở lại panel referral ở editor AR */
  lead_source?: string;
};
```
In `frontend/src/components/payment-request/paymentRequestUtils.ts`, add the helper near the top (after imports):
```ts
/** Gói giới thiệu (tên chứa "REFER") → cần điền thông tin người giới thiệu. */
export function isReferralPackage(name?: string | null): boolean {
  return !!name && /refer/i.test(name);
}
```
Then in `buildCreateActiveRequestPayload`, replace the `block.courses.push({...})` line (~354) with:
```ts
    const course: CreateActiveRequestCoursePayload = {
      name: row.packageName.trim(),
      amount: Math.max(0, Math.round(row.amount)),
    };
    if (isReferralPackage(row.packageName)) course.lead_source = "gioi_thieu";
    block.courses.push(course);
```
> Ensure `CreateActiveRequestCoursePayload` is imported in `paymentRequestUtils.ts` (add to the existing `types/paymentRequest` import if missing).

- [ ] **Step 8: Run FE test — verify PASS**

Run: `cd frontend && npx vitest run src/components/payment-request/paymentRequestUtils.referral.test.ts`
Expected: PASS.

- [ ] **Step 9: Modal discoverability hint (optional, low-risk)**

In `PaymentRequestDetailDrawer.tsx`, inside the `arDraftRows.map` row (~after the package Combobox, near line 2609), add a hint shown only for REFER rows so the sale knows to fill referral after creation:
```tsx
{isReferralPackage(row.packageName) && (
  <div style={{ gridColumn: "1 / -1", fontSize: 11.5, color: "var(--warning, #b45309)", marginTop: 4 }}>
    Gói giới thiệu — sau khi tạo, bấm <strong>Sửa</strong> ở thẻ kích hoạt để điền UID người giới thiệu &amp; số buổi cộng.
  </div>
)}
```
> Import `isReferralPackage` from `./paymentRequestUtils` in the drawer. This is the ONLY modal-UI change; the referral inputs themselves stay in the (tested) AR editor per G6.

- [ ] **Step 10: Type-check + build**

Run: `cd frontend && npx tsc -b`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/activation_routes.py backend/tests/test_ar_lead_source_passthrough.py frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/payment-request/paymentRequestUtils.referral.test.ts frontend/src/components/payment-request/PaymentRequestDetailDrawer.tsx
git commit -m "fix(activation): khôi phục field referral cho gói REFER ở window kích hoạt mới (T7)

Auto-set lead_source=gioi_thieu cho gói REFER lúc tạo AR → panel referral ở
editor AR hiện lại (regression từ modal 12/7). BE passthrough lead_source/channel."
```

---

## Task 4: T6 — Sale name in "Chờ điền Order ID" queue (FE+BE)

**Files:**
- Modify: `backend/activation_routes.py` (`_serialize_ar` + the AR-list caller that already builds a sale map, or add one)
- Modify: `frontend/src/types/paymentRequest.ts:186` (`ActiveRequest` + `ActiveRequestApiRow`)
- Modify: `frontend/src/components/payment-request/paymentRequestUtils.ts` (`fromApiActiveRequest`)
- Modify: `frontend/src/components/ActivationTab.tsx` (render in the pending_order row header)
- Test: BE list test, FE mapper assertion

- [ ] **Step 1: BE — expose `sale_name` on the AR payload**

In `_serialize_ar` (`activation_routes.py:324`), the `pr` block (~362) already carries PR fields. Add sale info there. Change the `payment_request` sub-object to include `sale_email` and accept an optional resolved name:
```python
    def _serialize_ar(row, pr=None, sale_name_map=None):
        ...
        if pr is not None:
            sale_email = _clean_text(pr.get("sale_email")).lower()
            out["payment_request"] = {
                ...,
                "state": _pr_payment_state(pr),
                "sale_email": sale_email,
                # T6 — LUÔN ưu tiên tên sale, fallback email nếu không có tên.
                # _sale_name_map đã trả display_name/crm_name (hoặc email nếu row có mà thiếu tên);
                # `or sale_email` phủ nốt ca sale KHÔNG có trong nhan_su_sale (.get → None).
                "sale_name": (sale_name_map or {}).get(sale_email) or sale_email,
            }
```
In the AR-list endpoint that calls `_serialize_ar` per row, build the map ONCE (G9) before the loop, reusing the shared helper:
```python
        from payment_request_routes import _sale_name_map
        try:
            sale_name_map = _sale_name_map(sb)
        except Exception:
            sale_name_map = {}
        # ... _serialize_ar(row, pr, sale_name_map) inside the loop
```
> `_sale_name_map` (`payment_request_routes.py:793`) returns `{email → display_name | crm_name | email}`. Resolution priority for the queue: **sale name first (VD "Dang Kim Thuong"), email only as last-resort fallback.** Find the list handler by searching `_serialize_ar(` in `activation_routes.py`; thread `sale_name_map` through every call in the list path. Single-request path (AR detail) may pass `None` → `sale_name` falls back to the raw `sale_email` (still never blank when an email exists).

- [ ] **Step 2: BE test**

Add a test asserting the AR list payload includes `payment_request.sale_name` resolved from `nhan_su_sale`. Follow the existing FakeSB pattern in `backend/tests/` (mirror `test_sepay_match_candidates.py` sale mapping). Run `cd backend && python -m pytest tests/ -k active_request -v` → PASS.

- [ ] **Step 3: FE — carry saleName on the AR type**

In `frontend/src/types/paymentRequest.ts`, extend both:
```ts
export interface ActiveRequest {
  id: string;
  prId: string | null;
  customerName: string;
  createdAt: string;
  createdBy: string;
  uids: ActiveUidGroup[];
  saleName?: string;   // T6 — tên TVSS (map từ sale_email), chỉ ở response danh sách
}
```
and in `ActiveRequestApiRow.payment_request` (line 304):
```ts
  payment_request?: { name?: string; email?: string; sale_name?: string; sale_email?: string };
```

- [ ] **Step 4: FE — map it**

In `fromApiActiveRequest` (`paymentRequestUtils.ts`), set `saleName` from `raw.payment_request?.sale_name`. Add a one-line assertion to the existing mapper test.

- [ ] **Step 5: FE — render in the queue row**

In `ActivationTab.tsx`, in the `pending_order` row (desktop table + `ActivationRowCards` mobile), render the sale under the customer name, e.g. beside the existing PR-ID/UID line:
```tsx
{ar.saleName && (
  <span style={{ fontSize: 12, color: "var(--text-3)" }}> · Sale: <strong>{ar.saleName}</strong></span>
)}
```
> Anchor to the block that renders `ar.customerName` / PR id in the pending_order tab. Mirror the drawer candidate's `Sale: <strong>` style for consistency.

- [ ] **Step 6: Type-check + commit**

```bash
cd frontend && npx tsc -b       # PASS
git add backend/activation_routes.py frontend/src/types/paymentRequest.ts frontend/src/components/payment-request/paymentRequestUtils.ts frontend/src/components/ActivationTab.tsx backend/tests/
git commit -m "feat(activation): hiện tên Sale ở hàng chờ điền Order ID (T6)"
```

---

## Task 5: T4 — Bill images in the bank-match drawer (FE+BE)

Mirror what the gateway candidate already returns.

**Files:**
- Modify: `backend/sepay_routes.py:766-785` (candidate dict — add `has_bill`+`bill_images`)
- Modify: `frontend/src/types` (BankMatchCandidate — add `bill_images?`, `has_bill?`)
- Modify: `frontend/src/components/ReconciliationTab.tsx:1710-1722` (render thumbnails)
- Test: `frontend/src/lib/api.reconciliation.test.ts` (candidate shape)

- [ ] **Step 1: BE — select + return bill fields**

Add `bill_images, bill_image` to the line select (~line 709, same edit spot as Task 1) and in the candidate dict (~771) append:
```python
                "bill_images": (
                    line.get("bill_images") if isinstance(line.get("bill_images"), list) else []
                ) + ([line["bill_image"]] if line.get("bill_image") and line["bill_image"] not in (line.get("bill_images") or []) else []),
                "has_bill": bool(line.get("bill_images") or line.get("bill_image")),
```
> If Task 1 already extended the select string, just append `, bill_images, bill_image` to it (one select, G9).

- [ ] **Step 2: BE test**

Extend `backend/tests/test_sepay_match_candidates.py`: add `bill_images: ["https://x/b.jpg"]` to one line, assert candidate returns `has_bill=True` + that URL. Run pytest → PASS.

- [ ] **Step 3: FE — type**

Add to `BankMatchCandidate` (search its definition in `frontend/src/types/`): `bill_images?: string[]; has_bill?: boolean;`.

- [ ] **Step 4: FE — render thumbnails**

In `ReconciliationTab.tsx`, after the method/status line (~1722, inside the candidate card), add:
```tsx
{Array.isArray(c.bill_images) && c.bill_images.length > 0 && (
  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
    {c.bill_images.slice(0, 4).map((src, i) => (
      <img key={i} src={src} alt="bill"
        onClick={(e) => { e.stopPropagation(); window.open(src, "_blank"); }}
        style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)", cursor: "zoom-in" }} />
    ))}
  </div>
)}
```
> Reuse the existing bill-viewer if present (this drawer already has `openBillModal`); wiring the thumbnail to that modal instead of `window.open` is a nice-to-have, not required for the feature.

- [ ] **Step 5: Type-check + commit**

```bash
cd frontend && npx tsc -b       # PASS
git add backend/sepay_routes.py frontend/src/types/ frontend/src/components/ReconciliationTab.tsx frontend/src/lib/api.reconciliation.test.ts backend/tests/test_sepay_match_candidates.py
git commit -m "feat(recon): hiện ảnh bill trong drawer ghép CK ngoài để đối chiếu (T4)"
```

---

## Task 6: T8+T9 — mPOS/Payoo NET fixes (`gateway_routes.py`)

Source: `docs/HANDOFF_GATEWAY_NET_BUGS.md`. Both verified against current code 13/7. Two independent edits in one file → one commit.

**Files:**
- Modify: `backend/gateway_routes.py:383-387` (T9 — candidate amount filter) and `:478-498` (T8 — net write in `match_gateway_txn`)
- Test: `backend/tests/test_gateway_routes.py`

### 6a — T8: write `verified_received` even when the line is already paid

- [ ] **Step 1: Write failing test**

Add to `backend/tests/test_gateway_routes.py` (mirror the existing match-flow test setup — a `FakeSB` with a gateway txn + a paid card line). Seed a paid line + a gateway txn carrying `net_amount`, then match:
```python
def test_match_writes_verified_received_on_already_paid_line():
    """T8 — line xác nhận (paid) TRƯỚC rồi mới ghép gateway → net vẫn phải ghi."""
    sb = FakeSB()
    sb.tables["payment_lines"][0].update({
        "id": "line-net", "amount": 25240000, "status": "paid", "method": "card",
        "bill_images": ["https://bill.test/x.jpg"], "payment_request_id": "PR-1",
    })
    sb.tables["gateway_transactions"].append({
        "id": "gw-net", "amount": 25240000, "net_amount": 24785680,
        "match_status": "pending", "payment_line_id": None,
    })
    client = build_client(sb)
    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_write"):
            with patch("payment_request_routes.recompute_payment_request_totals",
                       return_value={"payment_request": {}, "received": 0, "target": 0, "state": "done"}):
                resp = client.patch("/api/v1/gateway-txns/gw-net/match",
                                    json={"payment_line_id": "line-net"})
    assert resp.status_code == 200
    line = next(l for l in sb.tables["payment_lines"] if l["id"] == "line-net")
    assert line["verified_received"] == 24785680   # net ghi dù đã paid
    assert line["verified_total"] == 25240000
```

- [ ] **Step 2: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_gateway_routes.py::test_match_writes_verified_received_on_already_paid_line -v`
Expected: FAIL (`KeyError: 'verified_received'` — write skipped on paid line).

- [ ] **Step 3: Restructure the net write in `match_gateway_txn`**

Replace the block at `gateway_routes.py:481-498` (`if can_auto_confirm:` … through the `line_res = …` re-read) with:
```python
        # T8 — Ghi verified_total/received BẤT KỂ line đã paid hay chưa.
        # Kế toán có thể xác nhận line TRƯỚC rồi mới ghép gateway (already_paid=True) →
        # block cũ nằm trong can_auto_confirm nên net bị skip; _mark_line_paid cũng
        # early-return khi paid (drop extra). Phải update TRỰC TIẾP. (G11)
        txn_row = res.data[0]
        gw_amount = _parse_amount(txn_row.get("amount"))
        gw_net = _parse_amount(txn_row.get("net_amount"))
        wrote_net = False
        if gw_net > 0:
            # bigint → ép int tránh PostgREST 22P02 với "9828000.0"
            sb.table("payment_lines").update(
                {"verified_total": int(gw_amount), "verified_received": int(gw_net)}
            ).eq("id", line_id).execute()
            wrote_net = True

        if can_auto_confirm:
            from payment_request_routes import _mark_line_paid
            # net đã ghi trực tiếp ở trên → KHÔNG truyền extra (tránh trùng); hàm này tự recompute
            _mark_line_paid(sb, line_id, actor_email=actor.email, source="gateway")
        elif wrote_net and pr_id:
            # line đã paid nhưng net vừa đổi → recompute để received/state theo _line_net
            from payment_request_routes import recompute_payment_request_totals
            recompute_payment_request_totals(sb, pr_id)

        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
```

- [ ] **Step 4: Run — verify PASS**

Run: `cd backend && python -m pytest tests/test_gateway_routes.py -v`
Expected: PASS (new test + existing match-flow tests still green — the not-paid path still auto-confirms + writes net).

### 6b — T9: "Khớp tiền" matches gross OR net

- [ ] **Step 5: Write failing test**

Add:
```python
def test_match_candidates_finds_line_entered_as_net():
    """T9 — sale nhập line theo NET (sau phí) → tick Khớp tiền vẫn tìm ra."""
    sb = FakeSB()
    sb.tables["payment_lines"][0].update({
        "id": "line-netamt", "amount": 8602425, "status": "pending", "method": "card",
        "bill_images": ["https://bill.test/y.jpg"], "payment_request_id": "PR-1",
    })
    sb.tables["gateway_transactions"].append({
        "id": "gw-2", "amount": 8823000, "net_amount": 8602425,
        "match_status": "pending", "paid_at": "2026-07-12T10:00:00+00:00",
    })
    client = build_client(sb)
    with patch("gateway_routes.resolve_actor", return_value=ACTOR):
        with patch("gateway_routes.require_module_access"):
            resp = client.get("/api/v1/gateway-txns/gw-2/match-candidates")
    assert resp.status_code == 200
    ids = {c["payment_line_id"] for c in resp.json()}
    assert "line-netamt" in ids   # tìm theo net 8.602.425
```

- [ ] **Step 6: Run — verify FAIL**

Run: `cd backend && python -m pytest tests/test_gateway_routes.py::test_match_candidates_finds_line_entered_as_net -v`
Expected: FAIL (query `.eq("amount", 8823000)` misses the 8.602.425 line).

- [ ] **Step 7: Widen the amount filter to gross OR net**

Replace the `else:` branch at `gateway_routes.py:383-387` with:
```python
        else:
            # payment_lines.amount là bigint → cast int để tránh postgrest gửi "10080000.0" (22P02).
            amount_int = int(effective_amount) if effective_amount else 0
            # T9 — sale có thể nhập line theo NET (sau phí). Tìm khớp gross HOẶC net.
            # Dùng .in_ (không .or_) — mock test chỉ hiểu .ilike. trong or_ (G12).
            net_raw = _parse_amount(txn.get("net_amount"))
            net_int = int(net_raw) if net_raw > 0 else 0
            amounts = [amount_int] if net_int in (0, amount_int) else [amount_int, net_int]
            line_res = sb.table("payment_lines").select("*").in_("amount", amounts).limit(100).execute()
            lines = line_res.data or []
```

- [ ] **Step 8: Run — verify PASS + full gateway regression**

Run: `cd backend && python -m pytest tests/test_gateway_routes.py -v`
Expected: PASS (both new tests + all existing gateway tests).

- [ ] **Step 9: Commit**

```bash
git add backend/gateway_routes.py backend/tests/test_gateway_routes.py
git commit -m "fix(gateway): NET đúng khi ghép mPOS/Payoo (T8/T9)

- T8: ghi verified_received/total kể cả khi line đã paid trước lúc ghép
  (tách khỏi can_auto_confirm; update trực tiếp vì _mark_line_paid drop extra)
- T9: lọc Khớp tiền tìm line theo gross HOẶC net (sale hay nhập theo tiền thực nhận)
Ref: docs/HANDOFF_GATEWAY_NET_BUGS.md. 0 migration."
```

---

## Final gate — before declaring done

```bash
cd backend  && python -m pytest tests/ -q                 # all BE green
cd frontend && npx tsc -b && npm run test && npm run build # tsc -b (G8), unit, Vercel-identical build
```
**T5 migration + deploy (do this deliberately, sandbox-first):**
```bash
# 1. Apply the migration to SANDBOX (pxgybyfiwywksesyogti) via Supabase MCP apply_migration or SQL editor
#    file: backend/migrations/2026-07-13-notification-rearchitecture.sql
# 2. On sandbox: send a test payment on a sandbox PR (route to YOUR own group per feedback_dingtalk_test_own_account),
#    verify the new Zalo "ĐÃ VÀO TK · PR · Lần #k · Lũy kế/tổng" text renders correctly.
# 3. Bring a sandbox PR to full payment → confirm EXACTLY ONE pr_fully_paid DingTalk ("Đơn đã đủ tiền").
# 4. Only then apply the same migration to PROD (jozcvbbypwvzaefteoxn) + set DINGTALK_DISABLED_EVENTS on Render prod.
```
Manual verify (sandbox): open "Ghép CK ngoài" on a CK whose amount matches a cancelled PR / already-matched line → those no longer appear; open a REFER activation → after create, the AR card prompts for referral; the "Chờ điền Order ID" rows show Sale; the match drawer shows bill thumbnails; ghép mPOS vào một line đã paid → "Đã nhận" đổi sang net (T8); tick "Khớp tiền" tìm ra line nhập theo net (T9). After migration+env: a new AR fires NO DingTalk `activation_request_created`/urgent; a fully-paid PR fires one `pr_fully_paid`; `course_activated` still posts on activation.

---

## Self-Review (checked against the 9-task spec)

1. **Spec coverage:** T1/T2/T3 → Task 1. T5 (Part A flag + Part B Zalo content + Part C DingTalk `pr_fully_paid`, per Hiếu spec) → Task 2. T7 → Task 3. T6 → Task 4. T4 → Task 5. T8+T9 → Task 6. All 9 covered. T5 spec cross-check: Zalo per-line "tiền vào TK" (Part B) ✓, DingTalk Tin #1 "đủ tiền" on done (Part C) ✓, DingTalk Tin #2 `course_activated` kept ✓, 2 old tins off via flag (Part A, user chose flag over delete) ✓.
2. **Placeholder scan:** Every code step has concrete code; "anchor by search" spots (T6 list caller, T4/BankMatchCandidate type, gateway/`pr_fully_paid` FakeSB seed reuse) are existing symbols to locate. The one FakeSB in Step C2 is sketched (comment) not fully spelled — the executor mirrors `test_dingtalk_ar_created.py`'s FakeSB; flagged, not hidden.
3. **Type consistency:** `lead_source`↔`leadSource`, `sale_name`↔`saleName` via existing `fromApi*`; `verified_received`/`net_amount` exact existing columns; `pr_fully_paid` event_type consistent across migration CHECK, producer insert, worker EVENT_TITLES, and test; Python `build_payment_paid_message` mirror kept format-identical to the SQL trigger (G14).

## Execution Handoff

Two options:
1. **Subagent-Driven (recommended)** — fresh subagent per task (T1–T3 first), review between tasks.
2. **Inline Execution** — batch with checkpoints.

Note: 7 commits across 6 task-groups (T5 = 2 commits: Part A flag, Parts B+C notify). Ship order T1+T2+T3 → T5 → T8+T9 → T7 → T6 → T4. T1–T3 first (chị Hiền waiting); T8+T9 are pure BE fixes from `HANDOFF_GATEWAY_NET_BUGS.md` (assigned Đạt — dedupe if he starts). **T5 is the only migration** (`2026-07-13-notification-rearchitecture.sql`, sandbox→smoke→prod) + needs `DINGTALK_DISABLED_EVENTS` Render env. The other 8 tasks are zero-migration.
