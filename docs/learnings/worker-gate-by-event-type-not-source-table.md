# Gate shared-table worker logic by event_type, not source_table

**Related files:** `backend/zalo_outbox_worker.py`, `backend/migrations/2026-07-10-zalo-bill-uploaded-event.sql`

**Problem:** While fixing the stale-bill-URL bug (see [outbox-snapshot-stale-mutable-asset](outbox-snapshot-stale-mutable-asset.md)), the new "re-read bill_images from `payment_lines`" step was almost gated on `row["source_table"] == "payment_lines"`. That would have attached bill images to **`payment_paid`** notifications too.

**Trap:** Gating a per-event behavior by the **table** the row points at. Multiple `zalo_outbox` event types share `source_table='payment_lines'` — `payment_paid`, `bill_uploaded`, and the trigger-fired ones all reference the same line. A table-based gate silently catches all of them. Here it would have put bill images on the money-received message, breaking the 10/07 requirement that "báo tiền" (payment_paid) is text-only and the bill image ships as a **separate** later message. The regression is invisible in unit tests whose fixture rows omit `event_type`.

**Insight:** In an outbox pattern, `event_type` is the intent; `source_table`/`source_id` are just the join keys. Behavior that belongs to one event must gate on `event_type`. `enqueue_bill_uploaded_zalo` (the SQL fn) is the only producer that fills `image_urls` for `payment_lines`, and its event_type is `bill_uploaded` — that string is the correct gate.

**Rule:** In `zalo_outbox`/`dingtalk_outbox` workers, branch on `row["event_type"]`, never on `source_table` alone — several event types share a table. When adding per-event logic, first list every event_type that uses that table (grep the migrations for `source_table`) and confirm the new branch fires for exactly the intended one.

**Verify:** `grep -c 'event_type") == "bill_uploaded"' backend/zalo_outbox_worker.py` — expect 1. If it becomes `source_table") == "payment_lines"` again, `payment_paid` will leak bill images.
