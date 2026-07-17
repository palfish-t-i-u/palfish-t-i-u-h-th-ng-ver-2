"""Background worker that drains dingtalk_outbox.

Resolves per-team open_conversation_id from dingtalk_team_groups,
then sends via enterprise robot API (OAuth token + OrgGroupSend).
"""

import asyncio
import datetime
import traceback
from typing import Any, Callable

from dingtalk_notifier import DingTalkAPIError, send_group_image, send_group_message

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
            msg_id = await asyncio.to_thread(
                send_group_message,
                open_conversation_id=open_conversation_id,
                message=message,
                title=title,
            )
            # Gửi TẤT CẢ ảnh bill (image_urls JSONB); fallback image_url đơn (row cũ).
            for photo_url in _image_list_from_row(row):
                try:
                    await asyncio.to_thread(
                        send_group_image,
                        open_conversation_id=open_conversation_id,
                        photo_url=photo_url,
                    )
                except Exception as img_exc:
                    print(f"[dingtalk_worker] {row_id} image failed (non-fatal): {img_exc}")
            sb.table("dingtalk_outbox").update({
                "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "dingtalk_message_id": msg_id,
                "last_error": None,
            }).eq("id", row_id).execute()
            print(f"[dingtalk_worker] sent {row_id} -> {msg_id}")
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
