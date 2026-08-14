"""Background worker that drains dingtalk_outbox.

Resolves per-team open_conversation_id from dingtalk_team_groups,
then sends via enterprise robot API (OAuth token + OrgGroupSend).
"""

import asyncio
import datetime
import traceback
from typing import Any, Callable

from dingtalk_notifier import (
    DingTalkAmbiguousDeliveryError,
    DingTalkAPIError,
    send_group_image,
    send_group_message,
)

RETRY_DELAYS = [30, 120, 300, 900]  # seconds
MAX_RETRIES = 4
POLL_INTERVAL = 30
BATCH_SIZE = 20

EVENT_TITLES = {
    "activation_request_created": "Báo đơn",
    "course_activated": "Tạo gói học thành công",
    "activation_urgent_reminder": "Nhắc tạo gói học gấp",
    "pr_fully_paid": "Đơn đã đủ tiền",
}

_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp", "gif"}


def _image_list_from_row(row: dict) -> list[str]:
    """Danh sách ảnh bill cần gửi: ưu tiên image_urls (JSONB list), fallback image_url đơn."""
    raw_urls = row.get("image_urls")
    if isinstance(raw_urls, list) and raw_urls:
        return [str(u).strip() for u in raw_urls if u and str(u).strip()]
    single = (row.get("image_url") or "").strip()
    return [single] if single else []


def _is_image_url(url: str) -> bool:
    """True nếu URL có đuôi ảnh DingTalk render được (pdf/khác → False)."""
    path = url.split("?", 1)[0]
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return ext in _IMAGE_EXTS


def _build_bill_markdown(bill_urls: list[str]) -> str:
    """Markdown block ảnh bill — nhúng ảnh gốc inline + link gốc.

    DingTalk markdown giãn ảnh nhúng vừa khung bất kể px, nên nhúng gốc
    cho sắc nét nhất; không cần resize (chỉ tốn RAM, không đổi cỡ hiện).
    PDF/non-image → chỉ link, không nhúng.
    """
    if not bill_urls:
        return ""
    parts: list[str] = []
    for i, url in enumerate(bill_urls, 1):
        if _is_image_url(url):
            parts.append(f"![bill{i}]({url})")
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
            bill_urls = _image_list_from_row(row)
            has_message = bool((message or "").strip())

            if bill_urls and not has_message:
                # ROW CHỈ-ẢNH (14/8: tách tin để search được): gửi ảnh bill riêng
                # qua sampleImageMsg. Enqueue tách mỗi ảnh 1 row (source_id theo URL)
                # nên bill_urls thường đúng 1 phần tử → retry cô lập, không gửi trùng.
                sent_ids: list[str] = []
                for u in bill_urls:
                    img_id = await asyncio.to_thread(
                        send_group_image,
                        open_conversation_id=open_conversation_id,
                        photo_url=u,
                    )
                    if img_id:
                        sent_ids.append(img_id)
                if not sent_ids:
                    # send_group_image trả "" (URL rỗng sau _clean) = KHÔNG gửi được gì.
                    # KHÔNG mark sent (tránh mất ảnh im lặng ngụy trang thành công) —
                    # raise để retry/dead-letter, last_error hiện ra cho người soi.
                    raise DingTalkAPIError(f"send_group_image gửi 0 ảnh: {bill_urls}")
                msg_id = ",".join(sent_ids)
            elif bill_urls and has_message:
                # LEGACY: row cũ gộp text+ảnh (enqueue TRƯỚC deploy tách). Giữ hành
                # vi markdown nhúng ảnh để không mất tin đang tồn outbox lúc deploy.
                full_message = message + "\n" + _build_bill_markdown(bill_urls)
                msg_id = await asyncio.to_thread(
                    send_group_message,
                    open_conversation_id=open_conversation_id,
                    message=full_message,
                    title=EVENT_TITLES.get(event_type, "") or "Thông báo",
                )
            else:
                # ROW TEXT: gửi sampleText (title rỗng) → DingTalk index được nội
                # dung, chị Hiền search đối soát được (14/8). Không còn markdown card.
                msg_id = await asyncio.to_thread(
                    send_group_message,
                    open_conversation_id=open_conversation_id,
                    message=message,
                    title="",
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
