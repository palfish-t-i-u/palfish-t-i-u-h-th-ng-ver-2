# DingTalk phone fallback to PR phone when block phone empty

**Related files:** `backend/utils/zalo_message_builder.py`, `backend/activation_routes.py`

**Problem:** Clearing a UID block's phone (edit AR) showed PR phone in the DingTalk notification instead of the "(chưa có, bổ sung sau)" placeholder.

**Trap:** Using `_first_nonempty(uid_block.get("phone"), pr_phone)` for the display message — when block phone is empty string, `_first_nonempty` skips it and returns `pr_phone`. The content key (`_ar_dingtalk_content_key`) correctly uses `_s(uid_block.get("phone"))` with NO fallback, so the edit triggers, but the message displays the wrong phone.

**Insight:** Display phone and content-key phone had divergent fallback logic. The content key saw the change (empty != old phone) and triggered the notification, but the message builder fell back to PR phone for display. The fix aligns display with the content key: block phone only, no PR fallback. Same pattern as UID which already used `default=empty_contact_hint` with no PR-level fallback.

**Rule:** When a notification builder falls back to a parent-level field (PR phone, PR uid), check whether that fallback is correct for the "user explicitly cleared this field" case. Compare with the content key — if the content key doesn't fall back, the message builder shouldn't either. `grep '_first_nonempty.*pr_phone' backend/utils/zalo_message_builder.py` — only the Zalo course-activated message should fall back to PR phone (different use case: course IS activated, want best identifier).

**Verify:** `grep -n 'pr_phone' backend/utils/zalo_message_builder.py` — line 457 (DingTalk AR message) should NOT reference pr_phone; line 345 (Zalo course-activated) may reference pr_phone (different context).
