"""DingTalk worker — multi-bill image extraction (17/7, a Hiếu chốt gom tất cả bill)."""
from dingtalk_outbox_worker import _image_list_from_row


def test_image_urls_list_takes_priority():
    row = {"image_urls": ["https://x/a.jpg", "https://x/b.jpg"], "image_url": "https://x/legacy.jpg"}
    assert _image_list_from_row(row) == ["https://x/a.jpg", "https://x/b.jpg"]


def test_falls_back_to_single_image_url():
    row = {"image_urls": None, "image_url": "https://x/legacy.jpg"}
    assert _image_list_from_row(row) == ["https://x/legacy.jpg"]


def test_empty_when_no_images():
    assert _image_list_from_row({"image_urls": None, "image_url": None}) == []
    assert _image_list_from_row({"image_urls": [], "image_url": ""}) == []


def test_strips_and_drops_blank_entries():
    row = {"image_urls": ["  https://x/a.jpg  ", "", None, "https://x/b.jpg"]}
    assert _image_list_from_row(row) == ["https://x/a.jpg", "https://x/b.jpg"]
