# Pillow thumbnail() before exif_transpose() for RAM safety

**Related files:** `backend/dingtalk_outbox_worker.py`

**Problem:** Worker on Render 512MB needs to resize 4000px phone photos to 200px thumbnails without OOM spikes.

**Trap:** Calling `ImageOps.exif_transpose(img)` before `img.thumbnail()`. Transpose forces full pixel decode of the original image (~36MB for a 4000×3000 JPEG). On a 512MB container already running FastAPI + Supabase client, this spikes past memory limits.

**Insight:** `Image.thumbnail()` activates JPEG draft-mode — Pillow tells libjpeg to decode at a reduced scale matching the target size. A 4000px image thumbnailed to 200px decodes at ~1/16 scale (~5MB). But draft-mode only kicks in if `thumbnail()` is the FIRST pixel operation. Any prior operation that touches pixels (transpose, convert, resize) forces a full decode first, destroying the RAM benefit. EXIF orientation metadata survives the thumbnail step, so `exif_transpose()` still works correctly after.

**Rule:** In any Pillow resize pipeline on a memory-constrained server: `open → thumbnail → exif_transpose → convert`. Never transpose or convert before thumbnail. Verify order: `grep -n "thumbnail\|exif_transpose" backend/dingtalk_outbox_worker.py` — thumbnail line number must be lower.

**Verify:** `grep -n "thumbnail\|exif_transpose" backend/dingtalk_outbox_worker.py` — expect thumbnail on a lower line number than exif_transpose.
