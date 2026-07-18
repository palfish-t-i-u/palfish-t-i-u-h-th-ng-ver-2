"""Background worker that drains dingtalk_outbox.

Resolves per-team open_conversation_id from dingtalk_team_groups,
then sends via enterprise robot API (OAuth token + OrgGroupSend).
"""

import asyncio
import datetime
import io
import traceback
from typing import Any, Callable

import httpx

from dingtalk_notifier import (
    DingTalkAmbiguousDeliveryError,
    DingTalkAPIError,
    send_group_message,
)

RETRY_DELAYS = [30, 120, 300, 900]  # seconds
MAX_RETRIES = 4
POLL_INTERVAL = 30
BATCH_SIZE = 20

EVENT_TITLES = {
    "activation_request_created": "Báo đơn",
    "course_activated": "Kích hoạt thành công",
    "activation_urgent_reminder": "Nhắc kích hoạt gấp",
    "pr_fully_paid": "Đơn đã đủ tiền",
}


def _image_list_from_row(row: dict) -> list[str]:
    """Danh sách ảnh bill cần gửi: ưu tiên image_urls (JSONB list), fallback image_url đơn."""
    raw_urls = row.get("image_urls")
    if isinstance(raw_urls, list) and raw_urls:
        return [str(u).strip() for u in raw_urls if u and str(u).strip()]
    single = (row.get("image_url") or "").strip()
    return [single] if single else []


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


def _load_team_group(sb, team_code: str) -> str:
    """Return open_conversation_id for team_code, or raise."""
    res = (
        sb.table("dingtalk_team_groups")
        .select("open_conversation_id, is_active")
        .eq("team_code", team_code)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise DingTalkAPIError(f"team_code {team_code} khong co trong dingtalk_team_groups")
    row = rows[0]
    if not row.get("is_active"):
        raise DingTalkAPIError(f"team_code {team_code} bi disable")
    return row["open_conversation_id"]


async def poll_and_send(sb_factory: Callable[[], Any]) -> None:
    sb = sb_factory()
    if not sb:
        print("[dingtalk_worker] supabase client missing")
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()

    try:
        res = (
            sb.table("dingtalk_outbox")
            .select("*")
            .is_("sent_at", "null")
            .or_(f"next_retry_at.is.null,next_retry_at.lte.{now_iso}")
            .or_(f"retries.is.null,retries.lt.{MAX_RETRIES}")
            .order("created_at", desc=False)
            .limit(BATCH_SIZE)
            .execute()
        )
        rows = res.data or []
    except Exception as exc:
        print(f"[dingtalk_worker] fetch failed: {exc}")
        return

    for row in rows:
        row_id = row["id"]
        team_code = row["team_code"]
        message = row["message"]
        event_type = row.get("event_type", "")
        retries = row["retries"] or 0

        try:
            open_conversation_id = _load_team_group(sb, team_code)
            title = EVENT_TITLES.get(event_type, "")
            bill_urls = _image_list_from_row(row)
            full_message = message
            if bill_urls:
                # G3: tải/resize/upload blocking → to_thread, không block event loop chung API
                thumb_map = await asyncio.to_thread(_ensure_thumbs, sb, bill_urls)
                full_message = message + "\n" + _build_bill_markdown(bill_urls, thumb_map)
                if not title:
                    title = "Thông báo"
            msg_id = await asyncio.to_thread(
                send_group_message,
                open_conversation_id=open_conversation_id,
                message=full_message,
                title=title,
            )
            sb.table("dingtalk_outbox").update({
                "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "dingtalk_message_id": msg_id,
                "last_error": None,
            }).eq("id", row_id).execute()
            print(f"[dingtalk_worker] sent {row_id} -> {msg_id}")
        except DingTalkAmbiguousDeliveryError as exc:
            # DingTalk's async gateway errored AFTER the request reached it
            # (5xx-no-key / read-timeout). The message may already be enqueued,
            # so retrying would post a DUPLICATE (observed 18/7). Mark terminal
            # WITHOUT claiming success: retries=MAX stops auto-retry, sent_at
            # stays null (never falsely "sent"), last_error flagged AMBIGUOUS so
            # a human verifies delivery in the group. Query filterable:
            #   where last_error like 'AMBIGUOUS%'
            print(f"[dingtalk_worker] {row_id} ambiguous send (no retry, verify tay): {exc}")
            try:
                sb.table("dingtalk_outbox").update({
                    "retries": MAX_RETRIES,
                    "next_retry_at": None,
                    "last_error": f"AMBIGUOUS (co the da gui, KHONG retry, verify tay): {exc}",
                }).eq("id", row_id).execute()
            except Exception as upd_exc:
                print(f"[dingtalk_worker] update {row_id} failed: {upd_exc}")
        except Exception as exc:
            err_msg = str(exc)
            new_retries = retries + 1
            update_payload: dict[str, Any] = {
                "retries": new_retries,
                "last_error": err_msg,
            }
            if new_retries >= MAX_RETRIES:
                update_payload["next_retry_at"] = None
                print(f"[dingtalk_worker] {row_id} dead after {new_retries}: {err_msg}")
            else:
                delay = RETRY_DELAYS[min(new_retries - 1, len(RETRY_DELAYS) - 1)]
                next_retry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=delay)
                update_payload["next_retry_at"] = next_retry.isoformat()
                print(f"[dingtalk_worker] {row_id} retry in {delay}s: {err_msg}")
            try:
                sb.table("dingtalk_outbox").update(update_payload).eq("id", row_id).execute()
            except Exception as upd_exc:
                print(f"[dingtalk_worker] update {row_id} failed: {upd_exc}")


async def start_outbox_worker(sb_factory: Callable[[], Any], poll_interval: int = POLL_INTERVAL) -> None:
    print("[dingtalk_worker] starting...")
    while True:
        try:
            await poll_and_send(sb_factory)
        except Exception as exc:
            print(f"[dingtalk_worker] loop error: {exc}")
            traceback.print_exc()
        await asyncio.sleep(poll_interval)
