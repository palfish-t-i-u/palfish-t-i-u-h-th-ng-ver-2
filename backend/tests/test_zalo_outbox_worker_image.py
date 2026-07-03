import pytest
from unittest.mock import MagicMock
import zalo_outbox_worker
import asyncio
from datetime import datetime, timezone

class FakeSb:
    def __init__(self):
        self.updates = []
        self.rows = []
    
    def table(self, name):
        class TableMock:
            def __init__(self, sb):
                self.sb = sb
            def select(self, *args): return self
            def is_(self, *args): return self
            def or_(self, *args): return self
            def order(self, *args, **kwargs): return self
            def limit(self, *args): return self
            def execute(self):
                if hasattr(self, "payload"):
                    self.sb.updates.append(self.payload)
                    return self
                else:
                    return MagicMock(data=self.sb.rows)

            def update(self, payload):
                self.payload = payload
                return self
            def eq(self, k, v):
                self.k = k
                self.v = v
                return self

        return TableMock(self)

@pytest.mark.asyncio
async def test_row_with_image_url_sends_image_after_text(monkeypatch):
    sb = FakeSb()
    sb.rows = [{
        "id": 1,
        "group_id": "g1",
        "message": "txt",
        "image_url": "http://img",
        "retries": 0
    }]
    
    # mock send_text_to_group
    monkeypatch.setattr(zalo_outbox_worker, "send_text_to_group", lambda *args, **kwargs: "msg_txt_1")
    
    # mock send_image_to_group
    import zalo_notifier
    monkeypatch.setattr(zalo_notifier, "send_image_to_group", lambda *args, **kwargs: "msg_img_1")
    
    await zalo_outbox_worker.poll_and_send(lambda: sb)
    
    assert len(sb.updates) == 2
    assert "sent_at" in sb.updates[0]
    assert "image_sent_at" in sb.updates[1]

@pytest.mark.asyncio
async def test_row_with_image_fail_sends_fallback_link(monkeypatch):
    sb = FakeSb()
    sb.rows = [{
        "id": 1,
        "group_id": "g1",
        "message": "txt",
        "image_url": "http://img",
        "retries": 0
    }]
    
    def mock_send_text(group, msg, **kwargs):
        if "Bill:" in msg:
            return "msg_fallback"
        return "msg_txt_1"
        
    monkeypatch.setattr(zalo_outbox_worker, "send_text_to_group", mock_send_text)
    
    import zalo_notifier
    def mock_send_image(*args, **kwargs):
        raise Exception("failed to send image")
    monkeypatch.setattr(zalo_notifier, "send_image_to_group", mock_send_image)
    
    await zalo_outbox_worker.poll_and_send(lambda: sb)
    
    assert len(sb.updates) == 2
    assert "sent_at" in sb.updates[0]
    assert "image_error" in sb.updates[1]
    assert "failed to send image" in sb.updates[1]["image_error"]
