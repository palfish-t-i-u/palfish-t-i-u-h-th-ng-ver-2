# Outbox snapshot goes stale for mutable assets — re-read source-of-truth at send time

**Related files:** `backend/zalo_outbox_worker.py`, `backend/migrations/2026-07-10-zalo-bill-uploaded-event.sql`

**Problem:** A Zalo bill notification (PR-2026-0322, 15/07) arrived as a plain text URL instead of an image. 67/68 bills were fine — only this one failed, with `image_error` = `400 Bad Request` fetching the Supabase storage URL.

**Trap:** Assume the failure is a transient network/storage blip and "just add a retry." Retrying the **same URL** would never help: the accountant deleted the first bill and re-uploaded a new one (unique filename, `upsert:"false"`) 14s after the outbox row was enqueued. The URL frozen in `zalo_outbox.image_urls` pointed at the already-deleted file → 400 forever. The enqueue→send gap is a race window for any mutable asset.

**Insight:** An outbox row is a **snapshot taken at enqueue time**. For immutable payloads (the text message) that's correct. For a mutable asset (bill images can be deleted/replaced between enqueue and send) the snapshot URL can 404/400 by send time. The worker must re-read the current asset list from the source-of-truth table (`payment_lines.bill_images`) right before sending — the snapshot URL is only a fallback for when that read fails. See the `fresh_read_ok` flag: a successful-but-empty read means "no bills anymore, send nothing" (do NOT fall back to the stale snapshot), whereas a thrown read means "use snapshot as safety net."

**Rule:** When an outbox/queue worker sends an asset that another code path can mutate (delete/replace) after enqueue, re-fetch the asset from its owning table at send time; treat the queued URL as a fallback, not the source. A retry loop over a stale URL is a false fix.

**Verify:** `grep -c "fresh_read_ok" backend/zalo_outbox_worker.py` — expect ≥4 (flag declared + gated read + fallback guard + comment). Zero means the re-read was reverted and the stale-snapshot bug is back.
