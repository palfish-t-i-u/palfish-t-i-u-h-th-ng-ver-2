import asyncio
import pytest
from unittest.mock import patch


class _Updater:
    def __init__(self):
        self.calls = []

    def update(self, payload):
        self.last_payload = payload
        return self

    def eq(self, col, val):
        self.calls.append({"col": col, "val": val, "payload": self.last_payload})

        class _Exec:
            def execute(self_inner):
                return None
        return _Exec()


class _Table:
    def __init__(self, rows):
        self.rows = rows
        self.updater = _Updater()

    def select(self, *_args, **_kwargs):
        return self

    def is_(self, *_args, **_kwargs):
        return self

    def or_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        class _Res:
            pass
        res = _Res()
        res.data = self.rows
        return res

    def update(self, payload):
        return self.updater.update(payload)


class _SB:
    def __init__(self, rows):
        self._table = _Table(rows)

    def table(self, name):
        assert name == "dingtalk_outbox"
        return self._table


@pytest.mark.asyncio
async def test_poll_marks_sent_on_success():
    from dingtalk_outbox_worker import poll_and_send

    rows = [{
        "id": 1,
        "team_code": "TEAM_A",
        "message": "hi",
        "event_type": "activation_request_created",
        "retries": 0,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group",
               return_value="cid123"):
        with patch("dingtalk_outbox_worker.send_group_message", return_value="pqk-abc"):
            await poll_and_send(lambda: sb)

    sent_call = next(c for c in sb._table.updater.calls if c["payload"].get("sent_at"))
    assert sent_call["payload"]["dingtalk_message_id"] == "pqk-abc"
    assert sent_call["payload"]["last_error"] is None


@pytest.mark.asyncio
async def test_poll_schedules_retry_on_failure():
    from dingtalk_outbox_worker import poll_and_send, RETRY_DELAYS

    rows = [{
        "id": 5,
        "team_code": "TEAM_A",
        "message": "hi",
        "event_type": "activation_request_created",
        "retries": 0,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group",
               return_value="cid123"):
        with patch("dingtalk_outbox_worker.send_group_message",
                   side_effect=RuntimeError("network")):
            await poll_and_send(lambda: sb)

    retry_call = sb._table.updater.calls[-1]
    assert retry_call["payload"]["retries"] == 1
    assert retry_call["payload"]["last_error"] == "network"
    assert retry_call["payload"]["next_retry_at"] is not None


@pytest.mark.asyncio
async def test_poll_dead_letters_after_max_retries():
    from dingtalk_outbox_worker import poll_and_send, MAX_RETRIES

    rows = [{
        "id": 9,
        "team_code": "TEAM_A",
        "message": "hi",
        "event_type": "course_activated",
        "retries": MAX_RETRIES - 1,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group",
               return_value="cid123"):
        with patch("dingtalk_outbox_worker.send_group_message",
                   side_effect=RuntimeError("still broken")):
            await poll_and_send(lambda: sb)

    last = sb._table.updater.calls[-1]
    assert last["payload"]["retries"] == MAX_RETRIES
    assert last["payload"]["next_retry_at"] is None


@pytest.mark.asyncio
async def test_bill_images_embedded_as_thumbnail_markdown():
    """Bill URLs rendered as thumbnails + original links in one markdown message."""
    from dingtalk_outbox_worker import poll_and_send

    bill1 = "https://abc.supabase.co/storage/v1/object/public/bills/a.jpg"
    bill2 = "https://abc.supabase.co/storage/v1/object/public/bills/b.jpg"
    rows = [{
        "id": 20,
        "team_code": "TEAM_A",
        "message": "Phone: 0977\nSale: Nga",
        "event_type": "activation_request_created",
        "retries": 0,
        "image_urls": [bill1, bill2],
        "image_url": bill1,
    }]
    sb = _SB(rows)
    captured_messages = []

    def fake_send(*, open_conversation_id, message, title=""):
        captured_messages.append({"message": message, "title": title})
        return "pqk-img"

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"):
        with patch("dingtalk_outbox_worker.send_group_message", side_effect=fake_send):
            await poll_and_send(lambda: sb)

    assert len(captured_messages) == 1
    msg = captured_messages[0]["message"]
    assert "/render/image/public/" in msg
    assert "[Ảnh gốc 1](" in msg
    assert "[Ảnh gốc 2](" in msg
    assert captured_messages[0]["title"] == "Báo đơn"
