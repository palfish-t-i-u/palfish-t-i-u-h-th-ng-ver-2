"""DingTalk worker — multi-bill image extraction + markdown (no thumb, embed original)."""
from dingtalk_outbox_worker import _image_list_from_row, _build_bill_markdown, _is_image_url


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


def test_build_bill_markdown_empty():
    assert _build_bill_markdown([]) == ""


_ORIG = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/bill-123.jpg"


def test_markdown_embeds_original_inline():
    md = _build_bill_markdown([_ORIG])
    assert f"![bill1]({_ORIG})" in md
    assert f"[Ảnh gốc 1]({_ORIG})" in md


def test_markdown_multiple_images():
    orig2 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L2/bill-2.jpg"
    md = _build_bill_markdown([_ORIG, orig2])
    assert f"![bill1]({_ORIG})" in md
    assert f"![bill2]({orig2})" in md
    assert "[Ảnh gốc 1](" in md and "[Ảnh gốc 2](" in md


def test_markdown_pdf_link_only():
    pdf = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/b.pdf"
    md = _build_bill_markdown([pdf])
    assert "![" not in md
    assert f"[Ảnh gốc 1]({pdf})" in md


def test_is_image_url():
    assert _is_image_url("https://x/y.jpg") is True
    assert _is_image_url("https://x/y.PNG") is True
    assert _is_image_url("https://x/y.pdf") is False
    assert _is_image_url("https://x/y.jpg?download=1") is True
