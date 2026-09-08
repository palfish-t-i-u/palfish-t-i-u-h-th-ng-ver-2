# DingTalk bill image dedup blocks edit-resend

**Related files:** `backend/activation_routes.py`

**Problem:** Edit-resend DingTalk notifications had text but no bill images. Bills were silently dropped by the UNIQUE constraint.

**Trap:** Designing bill dedup with `source_id = hash(ar_id + bill_url)` (no edit suffix) to prevent spam on repeated edits — but this also prevents ALL re-sends of the same bill, including intentional edit notifications where the user expects the full message.

**Insight:** The text message row used `source_id = hash(ar_id + source_suffix)` which changes per edit (suffix includes content-key hash), so text always re-sent. But bill rows omitted the suffix, so UNIQUE killed them after the first send. The fix: include `source_suffix` in bill source_id too. Same-edit dedup still works (same suffix → same source_id → UNIQUE catches). First create (suffix="") produces the same hash as before.

**Rule:** When an outbox uses UNIQUE(source_id) for dedup, and the feature has a "re-send on change" path, ALL row types (text, image, attachment) must include the change-tracking suffix in their source_id. If one row type includes the suffix and another doesn't, the second type silently disappears on re-send. Check: `grep -n 'source_suffix\|source_uuid' backend/activation_routes.py | grep -v '#'` — every `_insert_outbox` call should incorporate the suffix.

**Verify:** `grep -A2 'bill_source =' backend/activation_routes.py` — should show `source_suffix` in the hash input.
