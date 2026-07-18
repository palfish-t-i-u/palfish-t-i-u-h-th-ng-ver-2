"""DingTalk worker — multi-bill image extraction + thumbnail transform."""
from dingtalk_outbox_worker import _image_list_from_row, _to_thumbnail, _build_bill_markdown


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


def test_to_thumbnail_supabase_url():
    url = "https://abc.supabase.co/storage/v1/object/public/bills/test.jpg"
    thumb = _to_thumbnail(url, width=200)
    assert "/render/image/public/" in thumb
    assert "?width=200&resize=contain" in thumb
    assert "/object/public/" not in thumb


def test_to_thumbnail_non_supabase_url():
    url = "https://example.com/img.jpg"
    assert _to_thumbnail(url) == url


def test_build_bill_markdown_multiple():
    urls = [
        "https://abc.supabase.co/storage/v1/object/public/bills/a.jpg",
        "https://abc.supabase.co/storage/v1/object/public/bills/b.jpg",
    ]
    md = _build_bill_markdown(urls)
    assert "![bill1](" in md
    assert "![bill2](" in md
    assert "/render/image/public/" in md
    assert "[Ảnh gốc 1](" in md
    assert "[Ảnh gốc 2](" in md
    assert "/object/public/" in md.split("Ảnh gốc")[1]


def test_build_bill_markdown_empty():
    assert _build_bill_markdown([]) == ""


# ---- Task 1: URL parsing helpers ----
from dingtalk_outbox_worker import _thumb_object_path, _is_image_url

BILLS_URL = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/bill-123.jpg"


def test_thumb_object_path_mirrors_bills_path():
    assert _thumb_object_path(BILLS_URL) == "payment-lines/L1/bill-123.jpg.thumb.jpg"


def test_thumb_object_path_strips_query():
    assert _thumb_object_path(BILLS_URL + "?t=1") == "payment-lines/L1/bill-123.jpg.thumb.jpg"


def test_thumb_object_path_none_for_external_url():
    assert _thumb_object_path("https://example.com/x.jpg") is None


def test_thumb_object_path_none_for_non_image():
    pdf = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/bill-1.pdf"
    assert _thumb_object_path(pdf) is None


def test_is_image_url():
    assert _is_image_url(BILLS_URL) is True
    assert _is_image_url("https://x/y.PNG") is True
    assert _is_image_url("https://x/y.pdf") is False
    assert _is_image_url("https://x/y.jpg?download=1") is True
