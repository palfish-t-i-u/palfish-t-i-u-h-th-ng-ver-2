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


# ---- Task 2: Pillow thumb pipeline ----
import io
from PIL import Image
from dingtalk_outbox_worker import _make_thumb_bytes, THUMB_WIDTH


def _png_bytes(w: int, h: int, mode: str = "RGB") -> bytes:
    buf = io.BytesIO()
    Image.new(mode, (w, h), (200, 30, 30) if mode == "RGB" else None).save(buf, "PNG")
    return buf.getvalue()


def test_make_thumb_resizes_to_width_cap():
    out = _make_thumb_bytes(_png_bytes(1000, 2000))
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert img.width <= THUMB_WIDTH
    assert img.height <= THUMB_WIDTH * 10  # tỉ lệ giữ nguyên, không méo


def test_make_thumb_converts_rgba_to_rgb():
    out = _make_thumb_bytes(_png_bytes(400, 400, mode="RGBA"))
    img = Image.open(io.BytesIO(out))
    assert img.mode == "RGB"


def test_make_thumb_small_image_not_upscaled():
    out = _make_thumb_bytes(_png_bytes(100, 80))
    img = Image.open(io.BytesIO(out))
    assert img.width <= 100  # thumbnail() không phóng to


def test_make_thumb_applies_exif_orientation():
    # Ảnh 300x100 + EXIF Orientation=6 (xoay 90°) → sau transpose phải 100x_
    src = Image.new("RGB", (300, 100), (10, 200, 10))
    exif = Image.Exif()
    exif[0x0112] = 6
    buf = io.BytesIO()
    src.save(buf, "JPEG", exif=exif)
    out = _make_thumb_bytes(buf.getvalue())
    img = Image.open(io.BytesIO(out))
    assert img.height > img.width  # 300x100 xoay dọc thành ~100x300 (đã thumbnail)


def test_make_thumb_garbage_raises():
    import pytest
    with pytest.raises(Exception):
        _make_thumb_bytes(b"not an image at all")


# ---- Task 3: _ensure_thumbs ----
from unittest.mock import MagicMock, patch
from dingtalk_outbox_worker import _ensure_thumbs

ORIG = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/bill-9.jpg"
THUMB_URL = "https://abc.supabase.co/storage/v1/object/public/bill-thumbs/payment-lines/L1/bill-9.jpg.thumb.jpg"


def _resp(status, content=b"", headers=None):
    r = MagicMock()
    r.status_code = status
    r.content = content
    r.headers = headers or {}
    return r


def test_ensure_thumbs_reuses_existing(monkeypatch):
    """HEAD thumb 200 → dùng luôn, KHÔNG tải gốc, KHÔNG upload."""
    sb = MagicMock()
    with patch("dingtalk_outbox_worker.httpx.head", return_value=_resp(200)) as h, \
         patch("dingtalk_outbox_worker.httpx.get") as g:
        out = _ensure_thumbs(sb, [ORIG])
    assert out == {ORIG: THUMB_URL}
    h.assert_called_once()
    g.assert_not_called()
    sb.storage.from_.assert_not_called()


def test_ensure_thumbs_generates_and_uploads(monkeypatch):
    """HEAD 400 (chưa có) → tải gốc → resize → upsert → trả URL thumb."""
    png = _png_bytes(1000, 1500)
    sb = MagicMock()
    with patch("dingtalk_outbox_worker.httpx.head", return_value=_resp(400)), \
         patch("dingtalk_outbox_worker.httpx.get",
               return_value=_resp(200, content=png, headers={"content-length": str(len(png))})):
        out = _ensure_thumbs(sb, [ORIG])
    assert out == {ORIG: THUMB_URL}
    sb.storage.from_.assert_called_with("bill-thumbs")
    up = sb.storage.from_.return_value.upload
    up.assert_called_once()
    kwargs = up.call_args.kwargs
    assert kwargs["path"] == "payment-lines/L1/bill-9.jpg.thumb.jpg"
    assert kwargs["file_options"] == {"content-type": "image/jpeg", "upsert": "true"}


def test_ensure_thumbs_fallback_on_download_error():
    sb = MagicMock()
    with patch("dingtalk_outbox_worker.httpx.head", return_value=_resp(400)), \
         patch("dingtalk_outbox_worker.httpx.get", side_effect=RuntimeError("timeout")):
        out = _ensure_thumbs(sb, [ORIG])
    assert out == {ORIG: None}  # None = caller nhúng ảnh gốc


def test_ensure_thumbs_fallback_on_oversize():
    sb = MagicMock()
    big = {"content-length": str(20 * 1024 * 1024)}  # 20MB > cap 15MB
    with patch("dingtalk_outbox_worker.httpx.head", return_value=_resp(400)), \
         patch("dingtalk_outbox_worker.httpx.get", return_value=_resp(200, b"x", big)):
        out = _ensure_thumbs(sb, [ORIG])
    assert out == {ORIG: None}


def test_ensure_thumbs_fallback_on_bad_image():
    sb = MagicMock()
    with patch("dingtalk_outbox_worker.httpx.head", return_value=_resp(400)), \
         patch("dingtalk_outbox_worker.httpx.get",
               return_value=_resp(200, b"garbage", {"content-length": "7"})):
        out = _ensure_thumbs(sb, [ORIG])
    assert out == {ORIG: None}


def test_ensure_thumbs_none_for_pdf_and_external():
    sb = MagicMock()
    pdf = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/b.pdf"
    ext = "https://example.com/x.jpg"
    out = _ensure_thumbs(sb, [pdf, ext])
    assert out == {pdf: None, ext: None}


def test_ensure_thumbs_one_bad_does_not_break_others():
    """Ảnh 1 lỗi → None; ảnh 2 vẫn có thumb (per-image isolation, G4)."""
    orig2 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L2/bill-2.jpg"
    png = _png_bytes(500, 500)
    sb = MagicMock()

    def head_side(url, **kw):
        return _resp(200) if "L2" in url else _resp(400)

    with patch("dingtalk_outbox_worker.httpx.head", side_effect=head_side), \
         patch("dingtalk_outbox_worker.httpx.get", side_effect=RuntimeError("net down")):
        out = _ensure_thumbs(sb, [ORIG, orig2])
    assert out[ORIG] is None
    assert out[orig2] is not None and "bill-thumbs" in out[orig2]
