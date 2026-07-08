"""Tests for zalo_outbox_worker multi-image send loop."""
import asyncio
import datetime
import pytest
from unittest.mock import MagicMock, patch


@pytest.mark.asyncio
async def test_worker_sends_multiple_images_from_image_urls():
    """Worker sends each image in image_urls list."""
    from zalo_outbox_worker import _process_row

    sb = MagicMock()
    sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

    row = {
        "id": "row-1",
        "group_id": "group-abc",
        "message": "Kích hoạt thành công",
        "image_url": None,
        "image_urls": ["https://example.com/bill1.jpg", "https://example.com/bill2.jpg"],
        "retries": 0,
        "next_retry_at": None,
    }

    # send_text_to_group is imported at module level in zalo_outbox_worker, so patch there.
    # send_image_to_group is imported inside _process_row via `from zalo_notifier import ...`,
    # so patching zalo_notifier's namespace is correct.
    with patch("zalo_outbox_worker.send_text_to_group", return_value="msg-id-1") as mock_text, \
         patch("zalo_notifier.send_image_to_group", return_value="img-id") as mock_img:
        await _process_row(row, sb)
        assert mock_img.call_count == 2


@pytest.mark.asyncio
async def test_worker_falls_back_to_text_on_image_error():
    """Worker sends fallback text link when image send fails."""
    from zalo_outbox_worker import _process_row

    sb = MagicMock()
    sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

    row = {
        "id": "row-2",
        "group_id": "group-abc",
        "message": "Kích hoạt thành công",
        "image_url": None,
        "image_urls": ["https://example.com/bill1.jpg"],
        "retries": 0,
        "next_retry_at": None,
    }

    def fail_image(*args, **kwargs):
        raise Exception("Zalo image error")

    with patch("zalo_outbox_worker.send_text_to_group", return_value="msg-id") as mock_text, \
         patch("zalo_notifier.send_image_to_group", side_effect=fail_image):
        await _process_row(row, sb)
        # Should have called text at least twice: main message + fallback link
        assert mock_text.call_count >= 2


@pytest.mark.asyncio
async def test_worker_falls_back_to_legacy_image_url_when_image_urls_absent():
    """Worker still handles legacy single image_url when image_urls is not present."""
    from zalo_outbox_worker import _process_row

    sb = MagicMock()
    sb.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()

    row = {
        "id": "row-3",
        "group_id": "group-abc",
        "message": "Kích hoạt thành công",
        "image_url": "https://example.com/legacy-bill.jpg",
        "image_urls": None,
        "retries": 0,
        "next_retry_at": None,
    }

    with patch("zalo_outbox_worker.send_text_to_group", return_value="msg-id") as mock_text, \
         patch("zalo_notifier.send_image_to_group", return_value="img-id") as mock_img:
        await _process_row(row, sb)
        assert mock_img.call_count == 1


@pytest.mark.asyncio
async def test_worker_sets_image_sent_at_when_at_least_one_image_succeeds():
    """image_sent_at is written when at least one of multiple images sends successfully."""
    from zalo_outbox_worker import _process_row

    sb = MagicMock()
    update_calls = []

    def capture_update(payload):
        update_calls.append(payload)
        m = MagicMock()
        m.eq.return_value.execute.return_value = MagicMock()
        return m

    sb.table.return_value.update.side_effect = capture_update

    row = {
        "id": "row-4",
        "group_id": "group-abc",
        "message": "Kích hoạt thành công",
        "image_url": None,
        "image_urls": ["https://example.com/bill-ok.jpg", "https://example.com/bill-fail.jpg"],
        "retries": 0,
        "next_retry_at": None,
    }

    call_count = [0]

    def mixed_image(*args, **kwargs):
        call_count[0] += 1
        if call_count[0] == 2:
            raise Exception("second image failed")
        return "img-id"

    with patch("zalo_outbox_worker.send_text_to_group", return_value="msg-id"), \
         patch("zalo_notifier.send_image_to_group", side_effect=mixed_image):
        await _process_row(row, sb)

    # Find the image update payload (has image_sent_at or image_error)
    image_updates = [p for p in update_calls if "image_sent_at" in p or "image_error" in p]
    assert image_updates, "Expected at least one image-related update"
    assert "image_sent_at" in image_updates[0], "image_sent_at should be set when at least one image succeeded"
    assert "image_error" in image_updates[0], "image_error should record partial failure"
