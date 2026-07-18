# Bill Thumbnails Tự Tạo (Pillow, Lazy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tin DingTalk "Báo đơn" nhúng thumbnail bill nhỏ (~200px) do backend tự tạo bằng Pillow — bỏ hẳn phụ thuộc Supabase Image Transform API (quota 100/tháng, volume thật ~267/tháng → thumbnail vỡ từ ~ngày 11 mỗi tháng vì Spend Cap chặn).

**Architecture:** Worker `dingtalk_outbox_worker.py` tạo thumb **lazy tại lúc gửi**: gặp ảnh bill → check thumb đã có trong bucket `bill-thumbs` chưa (HEAD public URL) → chưa có thì tải gốc → Pillow resize → upsert lên `bill-thumbs` (mirror path) → nhúng URL thumb vào markdown. Lazy = tự phủ bill cũ lẫn mới, không cần backfill, không phụ thuộc đường upload. Fallback mọi lỗi = nhúng **ảnh gốc full-size** inline (không bao giờ chỉ-link, không bao giờ ảnh vỡ).

**Tech Stack:** Python, Pillow (mới thêm), httpx (đã có), supabase-py storage (pattern đã có ở `payment_request_routes.py`).

---

## Bối cảnh cho người không có context

- Tin DingTalk "Báo đơn" = 1 tin markdown, ảnh bill nhúng `![bill](url)`. DingTalk render ảnh theo **pixel gốc** → ảnh điện thoại 4000px chiếm cả màn chat. Đã thử `/render/image/?width=200` (Supabase transform) — đẹp, user duyệt look 200px — nhưng dính quota 100 ảnh distinct/tháng, volume prod ~267/tháng.
- Bucket `bills` (public read, write qua service role) chứa ảnh gốc, path `payment-lines/<line_id>/bill-<ts>.<ext>`, ext whitelist `jpg|jpeg|png|webp|gif|pdf`.
- Worker chạy CHUNG process với FastAPI (Render 512MB — đã có sự cố OOM 9/7). Mọi I/O blocking trong worker PHẢI qua `asyncio.to_thread` (event loop chung với API).
- URL bill lưu sẵn trong `dingtalk_outbox.image_urls` (JSONB list) — worker chỉ đọc, không query lại payment_lines.

## Guardrails (bắt buộc — map 4 tiêu chí)

| # | Guardrail | Tiêu chí |
|---|-----------|----------|
| G1 | **RAM**: dùng `img.thumbnail()` (tự kích hoạt JPEG draft-mode, decode ở scale nhỏ) — CẤM `img.resize()` trần (decode full 4000px = ~36MB spike). Thứ tự: `open → thumbnail → exif_transpose → convert RGB` (exif_transpose SAU thumbnail để không ép full decode) | Không lỗi con (OOM) |
| G2 | **EXIF**: `ImageOps.exif_transpose()` sau thumbnail — thiếu là bill chụp dọc thành nằm ngang | Không lỗi con |
| G3 | **Event loop**: toàn bộ tải/resize/upload chạy trong `asyncio.to_thread(...)` — blocking trên loop = API treo (lesson healthz storm 10/7) | Không lỗi con |
| G4 | **Fallback tuyệt đối**: lỗi bất kỳ ở 1 ảnh (tải/resize/upload/HEAD) → nhúng ảnh GỐC inline cho ảnh đó, KHÔNG raise, KHÔNG làm fail row outbox. PDF/ext lạ → chỉ link, không nhúng ảnh | Triệt để + không lỗi con |
| G5 | **Idempotent**: upload `upsert: "true"` — retry không sinh rác, không cần lock | Không lỗi con |
| G6 | **Cap tải**: skip thumb nếu ảnh gốc > 15MB (đọc Content-Length) hoặc tải quá 10s timeout → fallback gốc | Không tăng gánh hạ tầng |
| G7 | **0 transform API**: xoá hẳn `_to_thumbnail` (URL `/render/image/`) — không còn chỗ nào gọi transform | Tiết kiệm quota |
| G8 | **Test message**: mọi tin bắn nhóm DingTalk thật phải prepend `🧪 [TEST ...]` + HỎI user trước khi bắn (user thu hồi tay) | Quy trình |
| G9 | **Deploy prod**: cần user gõ rõ "deploy prod" (classifier chặn tự ý) | Quy trình |
| G10 | Giữ nguyên kích thước 200px user đã duyệt; JPEG quality 80 | — |

Chi phí sau khi xong: storage thumb ~5MB/tháng, egress tải gốc ~0.7GB/tháng (quota 250GB), RAM transient ~5-10MB/ảnh, $0.

---

### Task 0: Dependency + bucket `bill-thumbs`

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/migrations/2026-07-18-bill-thumbs-bucket.sql`

- [ ] **Step 0.1: Thêm Pillow vào requirements.txt**

Thêm vào cuối `backend/requirements.txt`:

```
# Image thumbnails cho tin DingTalk báo đơn (bill-thumbs bucket, 18/7)
Pillow>=10.0.0
```

- [ ] **Step 0.2: Cài local để chạy test**

Run: `pip install "Pillow>=10.0.0"`
Expected: `Successfully installed Pillow-...` (hoặc already satisfied)

- [ ] **Step 0.3: Viết migration tạo bucket**

Create `backend/migrations/2026-07-18-bill-thumbs-bucket.sql`:

```sql
-- Bucket public chứa thumbnail bill do worker DingTalk tự tạo (Pillow).
-- Read: public URL (public=true, không cần policy). Write: CHỈ backend service role
-- (bypass RLS) — không có policy cho authenticated/anon là CHỦ ĐÍCH.
insert into storage.buckets (id, name, public)
values ('bill-thumbs', 'bill-thumbs', true)
on conflict (id) do nothing;
```

- [ ] **Step 0.4: Apply migration lên CẢ HAI DB qua Supabase MCP `apply_migration`**

- Sandbox: project_id `pxgybyfiwywksesyogti`
- Prod: project_id `jozcvbbypwvzaefteoxn`

Verify từng bên bằng `execute_sql`:
```sql
select id, public from storage.buckets where id = 'bill-thumbs';
```
Expected: 1 row, `public = true`.

- [ ] **Step 0.5: Commit**

```bash
git add backend/requirements.txt backend/migrations/2026-07-18-bill-thumbs-bucket.sql
git commit -m "chore(dingtalk): add Pillow + bucket bill-thumbs cho thumbnail tự tạo"
```

---

### Task 1: Helper parse URL — `_thumb_object_path` + `_is_image_url`

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py` (thêm helpers sau `_image_list_from_row`)
- Test: `backend/tests/test_dingtalk_worker_multi_image.py`

- [ ] **Step 1.1: Viết failing tests**

Thêm vào cuối `backend/tests/test_dingtalk_worker_multi_image.py`:

```python
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
```

- [ ] **Step 1.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "thumb_object or is_image"`
Expected: FAIL `ImportError: cannot import name '_thumb_object_path'`

- [ ] **Step 1.3: Implement trong `dingtalk_outbox_worker.py`**

Thêm ngay sau hàm `_image_list_from_row`:

```python
_BILLS_MARKER = "/storage/v1/object/public/bills/"
_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}


def _is_image_url(url: str) -> bool:
    """True nếu URL có đuôi ảnh Pillow/DingTalk render được (pdf/khác → False)."""
    path = url.split("?", 1)[0]
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return ext in _IMAGE_EXTS


def _thumb_object_path(original_url: str) -> str | None:
    """Path thumb trong bucket bill-thumbs (mirror path gốc + '.thumb.jpg').

    None nếu không phải URL bucket bills hoặc không phải ảnh (pdf...) —
    caller sẽ fallback nhúng/link ảnh gốc.
    """
    clean = original_url.split("?", 1)[0]
    if _BILLS_MARKER not in clean or not _is_image_url(clean):
        return None
    rel = clean.split(_BILLS_MARKER, 1)[1]
    if not rel:
        return None
    return f"{rel}.thumb.jpg"
```

- [ ] **Step 1.4: Chạy test pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "thumb_object or is_image"`
Expected: 5 PASS

- [ ] **Step 1.5: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_worker_multi_image.py
git commit -m "feat(dingtalk): helper parse path thumb bill (bills → bill-thumbs)"
```

---

### Task 2: Pillow pipeline — `_make_thumb_bytes`

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py`
- Test: `backend/tests/test_dingtalk_worker_multi_image.py`

- [ ] **Step 2.1: Viết failing tests** (tự sinh ảnh bằng Pillow trong test — không cần fixture file)

Thêm vào cuối `backend/tests/test_dingtalk_worker_multi_image.py`:

```python
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
```

- [ ] **Step 2.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "make_thumb"`
Expected: FAIL `ImportError: cannot import name '_make_thumb_bytes'`

- [ ] **Step 2.3: Implement** — thêm vào `dingtalk_outbox_worker.py` sau `_thumb_object_path`. Import ở đầu file thêm `import io` (PIL import để TRONG hàm — không bắt cả module phụ thuộc Pillow lúc import, an toàn cho môi trường thiếu dep):

```python
THUMB_WIDTH = 200  # px — user duyệt look 200px (test #3, 18/7)
THUMB_JPEG_QUALITY = 80


def _make_thumb_bytes(data: bytes) -> bytes:
    """Resize ảnh bill → thumbnail JPEG nhỏ (RAM-safe cho Render 512MB).

    THỨ TỰ QUAN TRỌNG (G1): thumbnail() TRƯỚC exif_transpose() —
    thumbnail() kích hoạt JPEG draft-mode, decode thẳng ở scale nhỏ (~vài MB);
    transpose trước sẽ ép decode full ảnh 4000px (~36MB spike).
    Raises nếu data không phải ảnh — caller fallback ảnh gốc.
    """
    from PIL import Image, ImageOps  # lazy import (G1)

    img = Image.open(io.BytesIO(data))
    img.thumbnail((THUMB_WIDTH, THUMB_WIDTH * 20))  # giữ tỉ lệ, không upscale
    img = ImageOps.exif_transpose(img)  # G2 — sau thumbnail, exif còn trong metadata
    if img.mode != "RGB":
        img = img.convert("RGB")
    out = io.BytesIO()
    img.save(out, "JPEG", quality=THUMB_JPEG_QUALITY)
    return out.getvalue()
```

- [ ] **Step 2.4: Chạy test pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "make_thumb"`
Expected: 5 PASS

- [ ] **Step 2.5: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_worker_multi_image.py
git commit -m "feat(dingtalk): Pillow thumb pipeline RAM-safe (draft-mode + EXIF)"
```

---

### Task 3: `_ensure_thumbs` — check/tạo/upload, fallback None

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py`
- Test: `backend/tests/test_dingtalk_worker_multi_image.py`

- [ ] **Step 3.1: Viết failing tests** (mock httpx + sb.storage — KHÔNG network thật)

Thêm vào cuối `backend/tests/test_dingtalk_worker_multi_image.py`:

```python
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
```

- [ ] **Step 3.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "ensure_thumbs"`
Expected: FAIL `ImportError: cannot import name '_ensure_thumbs'`

- [ ] **Step 3.3: Implement** — đầu file `dingtalk_outbox_worker.py` thêm `import httpx` (io đã thêm Task 2). Thêm sau `_make_thumb_bytes`:

```python
THUMB_BUCKET = "bill-thumbs"
THUMB_MAX_ORIGIN_BYTES = 15 * 1024 * 1024  # G6: gốc >15MB → bỏ qua, dùng ảnh gốc
THUMB_HTTP_TIMEOUT = 10.0


def _thumb_public_url(original_url: str, thumb_path: str) -> str:
    """URL public của thumb — cùng host với URL gốc, đổi bucket bills → bill-thumbs."""
    base = original_url.split("?", 1)[0].split(_BILLS_MARKER, 1)[0]
    return f"{base}/storage/v1/object/public/{THUMB_BUCKET}/{thumb_path}"


def _ensure_thumbs(sb, bill_urls: list[str]) -> dict[str, str | None]:
    """Map url gốc → url thumb (None = fallback nhúng gốc). KHÔNG BAO GIỜ raise (G4).

    Lazy + idempotent: thumb có sẵn (HEAD 200) → tái dùng; chưa có → tải gốc,
    Pillow resize, upsert (G5). Mọi lỗi per-ảnh nuốt tại chỗ → None.
    Hàm BLOCKING — caller phải bọc asyncio.to_thread (G3).
    """
    out: dict[str, str | None] = {}
    for url in bill_urls:
        out[url] = None
        try:
            thumb_path = _thumb_object_path(url)
            if not thumb_path:
                continue  # pdf/external → fallback
            thumb_url = _thumb_public_url(url, thumb_path)
            head = httpx.head(thumb_url, timeout=THUMB_HTTP_TIMEOUT)
            if head.status_code == 200:
                out[url] = thumb_url  # đã có từ lần gửi trước
                continue
            resp = httpx.get(url, timeout=THUMB_HTTP_TIMEOUT)
            if resp.status_code != 200:
                continue
            clen = int(resp.headers.get("content-length") or len(resp.content) or 0)
            if clen > THUMB_MAX_ORIGIN_BYTES:
                print(f"[dingtalk_worker] thumb skip oversize ({clen}b): {url}")
                continue
            thumb_bytes = _make_thumb_bytes(resp.content)
            sb.storage.from_(THUMB_BUCKET).upload(
                path=thumb_path,
                file=thumb_bytes,
                file_options={"content-type": "image/jpeg", "upsert": "true"},
            )
            out[url] = thumb_url
        except Exception as exc:
            print(f"[dingtalk_worker] thumb failed (fallback goc): {url}: {exc}")
    return out
```

- [ ] **Step 3.4: Chạy test pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "ensure_thumbs"`
Expected: 7 PASS

- [ ] **Step 3.5: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_worker_multi_image.py
git commit -m "feat(dingtalk): _ensure_thumbs lazy tạo+cache thumb, fallback ảnh gốc"
```

---

### Task 4: Rewrite `_build_bill_markdown` + XOÁ `_to_thumbnail`

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py`
- Test: `backend/tests/test_dingtalk_worker_multi_image.py` (SỬA tests cũ của `_to_thumbnail`/`_build_bill_markdown`)

- [ ] **Step 4.1: Sửa tests cũ → viết tests mới**

Trong `backend/tests/test_dingtalk_worker_multi_image.py`:

**XOÁ** 3 test cũ: `test_to_thumbnail_supabase_url`, `test_to_thumbnail_non_supabase_url`, `test_build_bill_markdown_multiple` (chúng test transform URL `/render/image/` — thứ đang bỏ). **XOÁ** import `_to_thumbnail` khỏi dòng import đầu file. **GIỮ** `test_build_bill_markdown_empty`.

Thêm tests mới:

```python
# ---- Task 4: _build_bill_markdown 2 tham số ----
from dingtalk_outbox_worker import _build_bill_markdown


def test_markdown_uses_thumb_when_available():
    md = _build_bill_markdown([ORIG], {ORIG: THUMB_URL})
    assert f"![bill1]({THUMB_URL})" in md
    assert f"[Ảnh gốc 1]({ORIG})" in md
    assert "/render/image/" not in md  # G7: không còn transform API


def test_markdown_falls_back_to_original_inline():
    """Thumb fail (None) → nhúng ảnh GỐC inline (không phải chỉ link) — ý user chốt."""
    md = _build_bill_markdown([ORIG], {ORIG: None})
    assert f"![bill1]({ORIG})" in md
    assert f"[Ảnh gốc 1]({ORIG})" in md


def test_markdown_pdf_link_only():
    pdf = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/b.pdf"
    md = _build_bill_markdown([pdf], {pdf: None})
    assert "![" not in md  # không nhúng pdf làm ảnh (DingTalk render vỡ)
    assert f"[Ảnh gốc 1]({pdf})" in md


def test_markdown_mixed_thumb_and_fallback():
    orig2 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L2/bill-2.jpg"
    md = _build_bill_markdown([ORIG, orig2], {ORIG: THUMB_URL, orig2: None})
    assert f"![bill1]({THUMB_URL})" in md
    assert f"![bill2]({orig2})" in md
    assert "[Ảnh gốc 1](" in md and "[Ảnh gốc 2](" in md
```

- [ ] **Step 4.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v -k "markdown"`
Expected: FAIL (TypeError — `_build_bill_markdown` hiện chỉ nhận 1 tham số)

- [ ] **Step 4.3: Implement** — trong `dingtalk_outbox_worker.py`:

**XOÁ** hàm `_to_thumbnail` (toàn bộ — G7). **THAY** `_build_bill_markdown` bằng:

```python
def _build_bill_markdown(bill_urls: list[str], thumb_map: dict[str, str | None]) -> str:
    """Markdown block ảnh bill: thumbnail inline (hoặc gốc nếu thumb fail) + link gốc.

    - thumb có → nhúng thumb nhỏ
    - thumb None + là ảnh → nhúng ẢNH GỐC full-size (fallback user chốt 18/7)
    - không phải ảnh (pdf...) → chỉ link, không nhúng
    """
    if not bill_urls:
        return ""
    parts: list[str] = []
    for i, url in enumerate(bill_urls, 1):
        inline = thumb_map.get(url) or (url if _is_image_url(url) else None)
        if inline:
            parts.append(f"![bill{i}]({inline})")
    links = " · ".join(f"[Ảnh gốc {i}]({u})" for i, u in enumerate(bill_urls, 1))
    return "\n".join(parts) + ("\n" if parts else "") + links
```

Lưu ý: `test_build_bill_markdown_empty` (giữ lại) gọi `_build_bill_markdown([])` — sửa nó thành `_build_bill_markdown([], {})`.

- [ ] **Step 4.4: Chạy cả file test pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_worker_multi_image.py -v`
Expected: PASS toàn bộ (không còn test `_to_thumbnail`)

- [ ] **Step 4.5: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_worker_multi_image.py
git commit -m "feat(dingtalk): markdown bill dùng thumb tự tạo, xoá transform API"
```

---

### Task 5: Nối vào worker loop (async-safe) + sửa test outbox

**Files:**
- Modify: `backend/dingtalk_outbox_worker.py` (trong `poll_and_send`)
- Test: `backend/tests/test_dingtalk_outbox_worker.py`

- [ ] **Step 5.1: Sửa test `test_bill_images_embedded_as_thumbnail_markdown`**

Trong `backend/tests/test_dingtalk_outbox_worker.py`, **THAY TOÀN BỘ** hàm `test_bill_images_embedded_as_thumbnail_markdown` bằng:

```python
@pytest.mark.asyncio
async def test_bill_images_embedded_via_self_thumbs():
    """Worker gọi _ensure_thumbs (to_thread) và nhúng thumb tự tạo vào 1 tin markdown."""
    from dingtalk_outbox_worker import poll_and_send

    bill1 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/a.jpg"
    bill2 = "https://abc.supabase.co/storage/v1/object/public/bills/payment-lines/L1/b.jpg"
    thumb1 = "https://abc.supabase.co/storage/v1/object/public/bill-thumbs/payment-lines/L1/a.jpg.thumb.jpg"
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

    # thumb1 ok, bill2 fail → nhúng gốc bill2 (fallback trong 1 tin)
    def fake_ensure(sb_arg, urls):
        return {bill1: thumb1, bill2: None}

    with patch("dingtalk_outbox_worker._load_team_group", return_value="cid123"), \
         patch("dingtalk_outbox_worker._ensure_thumbs", side_effect=fake_ensure), \
         patch("dingtalk_outbox_worker.send_group_message", side_effect=fake_send):
        await poll_and_send(lambda: sb)

    assert len(captured) == 1
    msg = captured[0]["message"]
    assert f"![bill1]({thumb1})" in msg
    assert f"![bill2]({bill2})" in msg          # fallback gốc inline
    assert "[Ảnh gốc 1](" in msg and "[Ảnh gốc 2](" in msg
    assert "/render/image/" not in msg           # G7
    assert captured[0]["title"] == "Báo đơn"
```

- [ ] **Step 5.2: Chạy để thấy fail**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py -v`
Expected: test mới FAIL (worker chưa gọi `_ensure_thumbs`; `_build_bill_markdown` signature mới)

- [ ] **Step 5.3: Sửa `poll_and_send`** — thay block hiện tại:

```python
            bill_urls = _image_list_from_row(row)
            full_message = message
            if bill_urls:
                full_message = message + "\n" + _build_bill_markdown(bill_urls)
                if not title:
                    title = "Thông báo"
```

bằng:

```python
            bill_urls = _image_list_from_row(row)
            full_message = message
            if bill_urls:
                # G3: tải/resize/upload blocking → to_thread, không block event loop chung API
                thumb_map = await asyncio.to_thread(_ensure_thumbs, sb, bill_urls)
                full_message = message + "\n" + _build_bill_markdown(bill_urls, thumb_map)
                if not title:
                    title = "Thông báo"
```

- [ ] **Step 5.4: Chạy 2 file test DingTalk worker pass**

Run: `cd backend && python -m pytest tests/test_dingtalk_outbox_worker.py tests/test_dingtalk_worker_multi_image.py -v`
Expected: PASS toàn bộ

- [ ] **Step 5.5: Commit**

```bash
git add backend/dingtalk_outbox_worker.py backend/tests/test_dingtalk_outbox_worker.py
git commit -m "feat(dingtalk): worker nhúng thumb tự tạo (to_thread, fallback gốc inline)"
```

---

### Task 6: Full suite + push

- [ ] **Step 6.1: Full backend suite**

Run: `cd backend && python -m pytest -q`
Expected: `~539 passed, 3 failed (xlrd pre-existing — KHÔNG liên quan), 16 skipped`. Nếu fail khác xlrd → dừng, sửa trước khi đi tiếp.

- [ ] **Step 6.2: Push sandbox**

```bash
git push origin sandbox
```

---

### Task 7: Deploy + verify prod (CÓ CHECKPOINT HỎI USER)

- [ ] **Step 7.1: Deploy BE sandbox**

Run: `bash scripts/deploy.sh sandbox`
Chờ ~60s, check deploy live qua Render MCP (`get_deploy`, service sandbox `srv-d8co3nmq1p3s73bis1s0`).

- [ ] **Step 7.2: Smoke sandbox — KHÔNG bắn nhóm thật.** Sandbox DB (project `pxgybyfiwywksesyogti`): lấy 1 URL bill thật từ `payment_lines` sandbox, insert row test vào `dingtalk_outbox` sandbox với `team_code` KHÔNG tồn tại (vd `'SMOKE_NO_GROUP'`) — worker sẽ fail ở `_load_team_group` TRƯỚC khi gửi, nhưng đó là đủ để confirm deploy sống + không crash import Pillow. Sau đó check Render logs sandbox có dòng `[dingtalk_worker]` bình thường, KHÔNG có traceback ImportError/MemoryError. Xoá row test:

```sql
delete from dingtalk_outbox where team_code = 'SMOKE_NO_GROUP';
```

- [ ] **Step 7.3: Merge main + push**

```bash
git checkout main && git merge sandbox --no-edit && git push origin main && git checkout sandbox
```

- [ ] **Step 7.4: 🛑 HỎI USER: "deploy prod?"** (G9 — classifier yêu cầu user gõ rõ). Sau khi user đồng ý:

Run: `bash scripts/deploy.sh prod`
Chờ live (`get_deploy`, service prod `srv-d8786dl7vvec738pem2g`).

- [ ] **Step 7.5: 🛑 HỎI USER trước khi bắn tin test nhóm IH1** (G8). User đồng ý → insert vào `dingtalk_outbox` PROD (project `jozcvbbypwvzaefteoxn`), dùng đúng 3 URL bill đã dùng test trước (đã có sẵn trong DB — PR-2026-0372/0371):

```sql
INSERT INTO dingtalk_outbox (event_type, source_table, source_id, team_code, message, image_url, image_urls)
VALUES (
  'activation_request_created', 'active_requests', gen_random_uuid(), 'Inhouse 1',
  E'🧪 [TEST #4 — thumb tự tạo, không quota]\n\nPhone: 0912 345 678\nUID: 999999\nNguyễn Văn Test, Gói Trải nghiệm 20 buổi\nNguồn: Quảng cáo\nTổng: 9.580.000 VND\nSale: Nguyễn Thị Mẫu · Team Inhouse 1',
  'https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/7a85b5a7-d37f-45a6-95df-720868221058/bill-20260717083951967039.jpg',
  '["https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/7a85b5a7-d37f-45a6-95df-720868221058/bill-20260717083951967039.jpg", "https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/e92332cb-2284-4581-85a3-7e03aca57921/bill-20260717083956444143.jpg", "https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/fefd9b4e-4312-4dcd-91c4-40815b87ec87/bill-20260717082459886410.jpg"]'::jsonb
) RETURNING id;
```

- [ ] **Step 7.6: Verify 3 điểm** (chờ ≤60s worker poll; DingTalk hay 503 → có thể retry 30s, tin trùng KHÔNG còn vì fix processQueryKey 4e9c524):

1. Row `sent_at` not null, `last_error` null:
   `select sent_at, last_error, retries from dingtalk_outbox where id = <id>;`
2. Thumb đã nằm trong bucket:
   `select name from storage.objects where bucket_id = 'bill-thumbs' limit 10;` → expect 3 file `.thumb.jpg`
3. User confirm bằng mắt trên nhóm IH1: 1 tin, 3 ảnh NHỎ, link "Ảnh gốc 1·2·3" mở được ảnh full. Nhắc user thu hồi tin test.

- [ ] **Step 7.7: Verify RAM prod không spike** — Render MCP `get_metrics` service prod, memory vẫn plateau ~236MB, không nhảy vọt sau tin test.

---

### Task 8: Hậu kỳ

- [ ] **Step 8.1: Update memory** — file `C:\Users\silly\.claude\projects\E--PalFish-DA-pf-gmv-reconciliation-palfish-t-i-u-h-th-ng-ver-2\memory\project_bao_don_hoan_thanh.md`: thêm dòng vào block 18/7: chuyển thumbnail từ Supabase transform (quota 100/th, volume 267/th → vỡ) sang Pillow tự tạo lazy trong worker, bucket `bill-thumbs`, fallback gốc inline, $0.

- [ ] **Step 8.2: Chạy skill `extract-approach`** nếu có insight mới ngoài learning `dingtalk-async-send-5xx-duplicate` đã ghi (ứng viên: "lazy thumbnail tại worker tự phủ backfill" / "thumbnail() trước exif_transpose để giữ draft-mode").

- [ ] **Step 8.3: KHÔNG cần update MODULES.md** (không thêm file source FE/BE mới — chỉ sửa worker + tests + 1 migration).

---

## Self-review đã chạy

- Mọi task có code đầy đủ, không placeholder.
- Type nhất quán: `_ensure_thumbs(sb, list[str]) -> dict[str, str | None]`; `_build_bill_markdown(list[str], dict) -> str`; `THUMB_WIDTH` dùng chung test/impl.
- Coverage 4 tiêu chí: triệt để (lazy phủ mọi bill, mọi volume, G7 bỏ transform), không lỗi con (G1-G6 + 17 test mới + fix tin trùng đã live), hạ tầng (~$0, egress/storage không đáng kể, RAM draft-mode), quota (0 transform API, không thêm call DingTalk).
- Rollback: revert commit → quay về bản transform-URL hiện tại; bucket `bill-thumbs` để nguyên vô hại.
