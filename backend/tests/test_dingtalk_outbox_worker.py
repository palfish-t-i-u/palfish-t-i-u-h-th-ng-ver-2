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
async def test_poll_no_retry_on_ambiguous_delivery():
    """DingTalk 5xx-after-reaching-gateway = message may already be enqueued.
    Worker must NOT retry (retry = duplicate, bug 18/7): mark terminal
    (retries=MAX, next_retry_at None) WITHOUT claiming sent, flag AMBIGUOUS."""
    from dingtalk_outbox_worker import poll_and_send, MAX_RETRIES
    from dingtalk_notifier import DingTalkAmbiguousDeliveryError

    rows = [{
        "id": 42,
        "team_code": "TEAM_A",
        "message": "hi",
        "event_type": "activation_request_created",
        "retries": 0,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"):
        with patch("dingtalk_outbox_worker.send_group_message",
                   side_effect=DingTalkAmbiguousDeliveryError("HTTP 503 no key")):
            await poll_and_send(lambda: sb)

    last = sb._table.updater.calls[-1]
    assert last["payload"]["retries"] == MAX_RETRIES        # terminal → not re-polled
    assert last["payload"]["next_retry_at"] is None          # no retry scheduled
    assert "sent_at" not in last["payload"]                  # NOT claimed delivered
    assert last["payload"]["last_error"].startswith("AMBIGUOUS")


@pytest.mark.asyncio
async def test_legacy_combined_row_still_embeds_markdown():
    """BACKWARD-COMPAT: row cũ GỘP text+ảnh (enqueue trước deploy tách 14/8) vẫn đi
    markdown nhúng ảnh — để không mất tin đang tồn outbox lúc deploy. Row MỚI tách
    text/ảnh riêng (xem 2 test dưới)."""
    from dingtalk_outbox_worker import poll_and_send

    bill1 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/a.jpg"
    bill2 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/b.jpg"
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
    captured = []

    def fake_send(*, open_conversation_id, message, title=""):
        captured.append({"message": message, "title": title})
        return "pqk-img"

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker.send_group_message", side_effect=fake_send):
        await poll_and_send(lambda: sb)

    assert len(captured) == 1
    msg = captured[0]["message"]
    assert f"![bill1]({bill1})" in msg
    assert f"![bill2]({bill2})" in msg
    assert "[Ảnh gốc 1](" in msg and "[Ảnh gốc 2](" in msg
    assert captured[0]["title"] == "Báo đơn"


@pytest.mark.asyncio
async def test_text_row_sends_sampletext_no_title():
    """14/8: row TEXT (có message, KHÔNG ảnh) → gửi title rỗng = sampleText → DingTalk
    index được nội dung (chị Hiền search đối soát). KHÔNG gọi gửi ảnh."""
    from dingtalk_outbox_worker import poll_and_send

    rows = [{
        "id": 30, "team_code": "TEAM_A",
        "message": "Phone: 84-900000000\nUID: 123\nBé An, Gói A",
        "event_type": "activation_request_created", "retries": 0,
    }]
    sb = _SB(rows)
    captured = []

    def fake_send(*, open_conversation_id, message, title=""):
        captured.append({"message": message, "title": title})
        return "pqk-text"

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker.send_group_message", side_effect=fake_send):
        await poll_and_send(lambda: sb)

    assert len(captured) == 1
    assert captured[0]["title"] == ""             # sampleText, KHÔNG markdown card
    assert "UID: 123" in captured[0]["message"]   # nội dung search được


@pytest.mark.asyncio
async def test_image_only_row_uploads_then_sends_sampleimgemsg():
    """14/8 v2: upload ảnh lên DingTalk media trước rồi gửi sampleImageMsg với media_id.
    External URL bị cache (v1 fix dùng markdown nhưng mở web, không native). Upload giải
    quyết cả cache lẫn UX native."""
    from dingtalk_outbox_worker import poll_and_send

    bill = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/a.jpg"
    rows = [{
        "id": 31, "team_code": "TEAM_A",
        "message": "",
        "event_type": "activation_request_created", "retries": 0,
        "image_urls": [bill], "image_url": bill,
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker.send_group_image", return_value="pqk-img") as img_mock, \
         patch("dingtalk_outbox_worker.send_group_message") as txt_mock:
        await poll_and_send(lambda: sb)

    img_mock.assert_called_once()
    assert img_mock.call_args.kwargs["photo_url"] == bill
    txt_mock.assert_not_called()
    sent = next(c for c in sb._table.updater.calls if c["payload"].get("sent_at"))
    assert sent["payload"]["dingtalk_message_id"] == "pqk-img"


@pytest.mark.asyncio
async def test_image_only_row_not_marked_sent_when_nothing_sent():
    """send_group_image trả "" → KHÔNG mark sent, schedule retry."""
    from dingtalk_outbox_worker import poll_and_send

    rows = [{
        "id": 32, "team_code": "TEAM_A", "message": "",
        "event_type": "activation_request_created", "retries": 0,
        "image_urls": ["https://x/a.jpg"], "image_url": "https://x/a.jpg",
    }]
    sb = _SB(rows)

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker.send_group_image", return_value=""):
        await poll_and_send(lambda: sb)

    last = sb._table.updater.calls[-1]
    assert "sent_at" not in last["payload"]
    assert last["payload"]["retries"] == 1
    assert last["payload"]["last_error"]


@pytest.mark.asyncio
async def test_course_activated_row_is_sampletext():
    """14/8 (scope 3 event): course_activated cũng đi sampleText (title rỗng) → search
    được. Order ID trong tin = khoá đối soát kế toán hay tìm."""
    from dingtalk_outbox_worker import poll_and_send

    rows = [{
        "id": 40, "team_code": "TEAM_A",
        "message": "✅ ĐÃ TẠO GÓI HỌC THÀNH CÔNG\nOrder ID: 761307360082182",
        "event_type": "course_activated", "retries": 0,
    }]
    sb = _SB(rows)
    captured = []

    def fake_send(*, open_conversation_id, message, title=""):
        captured.append({"message": message, "title": title})
        return "pqk-ca"

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker.send_group_message", side_effect=fake_send):
        await poll_and_send(lambda: sb)

    assert captured[0]["title"] == ""              # sampleText, không còn card title
    assert "Order ID: 761307360082182" in captured[0]["message"]
