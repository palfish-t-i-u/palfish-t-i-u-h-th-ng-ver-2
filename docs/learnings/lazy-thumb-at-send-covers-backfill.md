# Lazy thumbnail at send-time covers backfill naturally

**Related files:** `backend/dingtalk_outbox_worker.py`

**Problem:** Need thumbnails for bill images in DingTalk messages. Old bills (200+ PRs) have no thumbnails. Running a backfill migration adds complexity and a one-time script to maintain.

**Trap:** Building a separate backfill job or migration to pre-generate thumbnails for existing bills. This means two code paths (backfill + new-upload), a one-time script that must handle errors/resumption, and ongoing maintenance if the thumbnail format changes.

**Insight:** If the worker generates thumbnails lazily at send-time (check → miss → create → cache), it naturally covers both old and new bills with zero backfill. The first time an old bill's message is sent (or retried), its thumbnail is created. Subsequent sends hit the cache (HEAD 200 on the thumb URL). This works because the outbox pattern already retries failed sends, so the thumbnail pipeline gets exercised on every message attempt.

**Rule:** When adding a derived asset (thumbnail, preview, cache) that must cover both old and new records, prefer lazy-generate-on-access over batch-backfill. The access pattern (outbox drain, API request) is the natural trigger. Only batch-backfill when latency of first access is unacceptable.

**Verify:** `grep -n "_ensure_thumbs\|HEAD.*thumb" backend/dingtalk_outbox_worker.py` — should show the lazy check+create pattern.
