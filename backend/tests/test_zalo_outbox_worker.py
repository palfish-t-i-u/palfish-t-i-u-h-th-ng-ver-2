import pytest
import datetime
import asyncio
from unittest.mock import MagicMock, patch
from zalo_outbox_worker import poll_and_send, RETRY_DELAYS, MAX_RETRIES, _is_fatal_error
from zalo_notifier import ZaloAPIError

class MockSupabase:
    def __init__(self, rows):
        self.rows = rows
        self.updates = []
        self.last_eq = None

    def table(self, name):
        assert name == "zalo_outbox"
        return self

    def select(self, *args, **kwargs):
        return self

    def is_(self, col, val):
        return self

    def or_(self, cond):
        return self

    def order(self, col, desc=False):
        return self

    def limit(self, lim):
        return self

    def execute(self):
        # Return a fake result object
        class Result:
            def __init__(self, data):
                self.data = data
        return Result(self.rows)

    def update(self, payload):
        self.updates.append(payload)
        return self

    def eq(self, col, val):
        self.last_eq = (col, val)
        return self


def test_poll_sends_pending_row():
    # Mock row pending
    row = {
        "id": 100,
        "group_id": "group-test",
        "message": "hello test",
        "retries": 0,
        "sent_at": None,
        "next_retry_at": None
    }
    sb = MockSupabase([row])
    sb_factory = lambda: sb

    # Mock send_text_to_group to return a message ID
    with patch("zalo_outbox_worker.send_text_to_group", return_value="msg-ok") as mock_send:
        asyncio.run(poll_and_send(sb_factory))
        
        mock_send.assert_called_once_with("group-test", "hello test", sb=sb)
        assert len(sb.updates) == 1
        assert sb.updates[0]["zalo_message_id"] == "msg-ok"
        assert sb.updates[0]["sent_at"] is not None
        assert sb.updates[0]["last_error"] is None
        assert sb.last_eq == ("id", 100)


def test_retry_increments_on_failure():
    # Mock row pending
    row = {
        "id": 101,
        "group_id": "group-test",
        "message": "hello fail",
        "retries": 1,
        "sent_at": None,
        "next_retry_at": None
    }
    sb = MockSupabase([row])
    sb_factory = lambda: sb

    # Mock send_text_to_group to raise ZaloAPIError
    with patch("zalo_outbox_worker.send_text_to_group", side_effect=ZaloAPIError("zalo error", status_code=500)):
        asyncio.run(poll_and_send(sb_factory))
        
        assert len(sb.updates) == 1
        assert sb.updates[0]["retries"] == 2
        assert "zalo error" in sb.updates[0]["last_error"]
        assert sb.updates[0]["next_retry_at"] is not None
        assert sb.last_eq == ("id", 101)


def test_dead_after_max_retries():
    # Mock row pending with retries = 3 (this will be 4th failure)
    row = {
        "id": 102,
        "group_id": "group-test",
        "message": "hello dead",
        "retries": 3,
        "sent_at": None,
        "next_retry_at": None
    }
    sb = MockSupabase([row])
    sb_factory = lambda: sb

    # Mock send_text_to_group to raise ZaloAPIError
    with patch("zalo_outbox_worker.send_text_to_group", side_effect=Exception("network error")):
        asyncio.run(poll_and_send(sb_factory))
        
        assert len(sb.updates) == 1
        assert sb.updates[0]["retries"] == 4
        assert "network error" in sb.updates[0]["last_error"]
        assert sb.updates[0]["next_retry_at"] is None  # dead
        assert sb.last_eq == ("id", 102)


def test_fatal_error_marks_dead_immediately():
    row = {
        "id": 103,
        "group_id": "group-test",
        "message": "hello fatal",
        "retries": 0,
        "sent_at": None,
        "next_retry_at": None
    }
    sb = MockSupabase([row])
    sb_factory = lambda: sb

    with patch("zalo_outbox_worker.send_text_to_group",
               side_effect=ZaloAPIError("Zalo send_group_message failed: -213", zalo_error=-213)):
        asyncio.run(poll_and_send(sb_factory))

        assert len(sb.updates) == 1
        assert sb.updates[0]["retries"] == MAX_RETRIES
        assert sb.updates[0]["next_retry_at"] is None
        assert "-213" in sb.updates[0]["last_error"]


def test_is_fatal_error():
    assert _is_fatal_error("Zalo send_group_message failed: -213") is True
    assert _is_fatal_error("Zalo send_group_message failed: -214") is True
    assert _is_fatal_error("Zalo send_group_message failed: -216") is False  # -216 = auth, not fatal
    assert _is_fatal_error("network timeout") is False
    assert _is_fatal_error("Zalo send_group_message failed: -201") is False


def test_worker_handles_zalo_api_error_gracefully():
    # Verify that poll_and_send doesn't raise exception when fetching or updating fails
    sb = MockSupabase([])
    sb_factory = lambda: sb

    # If sb.table raises an exception, poll_and_send should handle it and log warning instead of crashing
    with patch.object(sb, "table", side_effect=Exception("Database down")):
        # This call should not raise an error
        asyncio.run(poll_and_send(sb_factory))


def test_poll_multiple_rows_partial_failure():
    # Row 1 succeeds, Row 2 fails
    rows = [
        {
            "id": 201,
            "group_id": "group-ok",
            "message": "msg ok",
            "retries": 0,
            "sent_at": None,
            "next_retry_at": None
        },
        {
            "id": 202,
            "group_id": "group-fail",
            "message": "msg fail",
            "retries": 0,
            "sent_at": None,
            "next_retry_at": None
        }
    ]
    sb = MockSupabase(rows)
    sb_factory = lambda: sb

    def mock_send(group_id, message, sb=None):
        if group_id == "group-ok":
            return "zalo-msg-ok"
        raise Exception("zalo call failed")

    with patch("zalo_outbox_worker.send_text_to_group", side_effect=mock_send):
        asyncio.run(poll_and_send(sb_factory))
        
        # Verify both updates were executed
        assert len(sb.updates) == 2
        
        success_update = [u for u in sb.updates if u.get("zalo_message_id") == "zalo-msg-ok"]
        fail_update = [u for u in sb.updates if u.get("retries") == 1]
        
        assert len(success_update) == 1
        assert len(fail_update) == 1
        assert fail_update[0]["next_retry_at"] is not None


def test_database_triggers_live_sandbox():
    """Live Sandbox DB test for payment_lines and active_requests triggers and idempotency."""
    import os
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    
    if not url or not key or "YOUR_PROJECT" in url or "PASTE_" in key or key.startswith("YOUR_"):
        pytest.skip("Supabase Sandbox credentials not available in environment.")

    # Create real client and verify connectivity
    try:
        from supabase import create_client
        sb = create_client(url, key)
        # Ping check
        sb.table("zalo_team_groups").select("team_code").limit(1).execute()
    except Exception as exc:
        pytest.skip(f"Supabase Sandbox is unreachable (offline/network issue): {exc}")
    
    # We will use the existing demo payment line and active request IDs
    line_id = '91fafefd-e00f-4ec1-8bbd-6c14703cbd05'
    ar_id = 'AR-2026-9503'
    team_code = 'Inhouse 2'
    group_id = 'test_group_trigger'

    # Save original states to restore later
    original_line = sb.table("payment_lines").select("status").eq("id", line_id).execute().data
    original_ar = sb.table("active_requests").select("status").eq("id", ar_id).execute().data
    
    try:
        # 1. Clean outbox test entries first
        sb.table("zalo_outbox").delete().eq("group_id", group_id).execute()
        
        # 2. Setup team group mapping
        sb.table("zalo_team_groups").upsert({
            "team_code": team_code,
            "group_id": group_id,
            "group_name": "Test Group",
            "is_active": True
        }).execute()
        
        # --- TEST 1: payment_lines trigger ---
        # Reset to pending then paid
        sb.table("payment_lines").update({"status": "pending"}).eq("id", line_id).execute()
        sb.table("payment_lines").update({"status": "paid"}).eq("id", line_id).execute()
        
        res = sb.table("zalo_outbox").select("*").eq("event_type", "payment_paid").eq("group_id", group_id).execute()
        rows = res.data or []
        assert len(rows) == 1, "payment_lines trigger did not insert exactly 1 row!"
        assert "PAID" in rows[0]["message"], "Message format incorrect!"
        
        # --- TEST 2: active_requests trigger ---
        # Reset to pending_order then activated
        sb.table("active_requests").update({"status": "pending_order"}).eq("id", ar_id).execute()
        sb.table("active_requests").update({"status": "activated"}).eq("id", ar_id).execute()
        
        res = sb.table("zalo_outbox").select("*").eq("event_type", "course_activated").eq("group_id", group_id).execute()
        rows = res.data or []
        assert len(rows) == 1, "active_requests trigger did not insert exactly 1 row!"
        assert "KÍCH HOẠT" in rows[0]["message"], "Message format incorrect!"
        
        # --- TEST 3: Idempotency (UNIQUE constraint) ---
        # Update again to trigger check
        sb.table("active_requests").update({"status": "pending_order"}).eq("id", ar_id).execute()
        sb.table("active_requests").update({"status": "activated"}).eq("id", ar_id).execute()
        
        res = sb.table("zalo_outbox").select("*").eq("event_type", "course_activated").eq("group_id", group_id).execute()
        rows = res.data or []
        assert len(rows) == 1, "Idempotency failed: multiple outbox rows created for same event!"
        
    finally:
        # Clean up
        sb.table("zalo_outbox").delete().eq("group_id", group_id).execute()
        
        # Restore original status
        if original_line:
            sb.table("payment_lines").update({"status": original_line[0]["status"]}).eq("id", line_id).execute()
        if original_ar:
            sb.table("active_requests").update({"status": original_ar[0]["status"]}).eq("id", ar_id).execute()


