"""Background worker that drains dingtalk_outbox.

Mirrors zalo_outbox_worker but resolves per-team webhook/secret from
dingtalk_team_groups instead of a global token.
"""

import asyncio
import datetime
import traceback
from typing import Any, Callable

from dingtalk_notifier import DingTalkAPIError, send_text_to_group

RETRY_DELAYS = [30, 120, 300, 900]  # seconds
MAX_RETRIES = 4
POLL_INTERVAL = 30
BATCH_SIZE = 20


def _load_team_credentials(sb, team_code: str) -> tuple[str, str]:
    res = (
        sb.table("dingtalk_team_groups")
        .select("webhook_url, secret, is_active")
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
    return row["webhook_url"], row["secret"]


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
        retries = row["retries"] or 0

        try:
            webhook_url, secret = _load_team_credentials(sb, team_code)
            msg_id = await asyncio.to_thread(
                send_text_to_group,
                webhook_url=webhook_url,
                secret=secret,
                message=message,
            )
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
