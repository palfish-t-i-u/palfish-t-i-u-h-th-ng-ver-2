import asyncio
import datetime
import traceback
from typing import Callable, Any
from zalo_notifier import send_text_to_group, ZaloAPIError

RETRY_DELAYS = [30, 120, 300, 900]  # in seconds: 30s, 2m, 5m, 15m
MAX_RETRIES = 4
POLL_INTERVAL = 30  # seconds
BATCH_SIZE = 20

FATAL_ZALO_ERRORS = {"-213", "-214", "-215"}


def _is_fatal_error(err_msg: str) -> bool:
    for code in FATAL_ZALO_ERRORS:
        if f"failed: {code}" in err_msg:
            return True
    return False

async def _process_row(row: dict, sb: Any) -> None:
    """Process a single zalo_outbox row: send text message then handle bill images."""
    row_id = row["id"]
    group_id = row["group_id"]
    message = row["message"]
    retries = row["retries"] or 0

    try:
        # Call Đức's module function to send message
        # run in thread pool to prevent blocking the async loop since it makes sync HTTP requests
        msg_id = await asyncio.to_thread(send_text_to_group, group_id, message, sb=sb)

        # Update row as sent
        sb.table("zalo_outbox").update({
            "sent_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "zalo_message_id": msg_id,
            "last_error": None
        }).eq("id", row_id).execute()
        print(f"[zalo_worker] Message {row_id} sent successfully. Zalo Msg ID: {msg_id}")

        # --- Image handling (best-effort) ---
        image_url_list: list[str] = []

        # For bill_uploaded events only, re-read the CURRENT bill_images from
        # payment_lines: the outbox snapshot can be stale if the accountant deleted
        # + re-uploaded the bill between enqueue and send (URL in snapshot then 404s).
        # Other event types (e.g. payment_paid — must stay text-only) keep their own
        # snapshot and are NOT given bill images here.
        source_id = row.get("source_id")
        fresh_read_ok = False
        if row.get("event_type") == "bill_uploaded" and source_id and row.get("source_table") == "payment_lines":
            try:
                fresh = sb.table("payment_lines").select("bill_images, bill_image").eq("id", source_id).limit(1).execute()
                fresh_read_ok = True
                if fresh.data:
                    fr = fresh.data[0]
                    imgs = fr.get("bill_images") or []
                    if isinstance(imgs, list):
                        image_url_list = [u for u in imgs if u and str(u).strip()]
                    if not image_url_list and (fr.get("bill_image") or "").strip():
                        image_url_list = [fr["bill_image"].strip()]
            except Exception as fresh_exc:
                print(f"[zalo_worker] Failed to re-read bill_images for {source_id}: {fresh_exc}")

        # Use the outbox snapshot for non-bill_uploaded events, or as a safety net when
        # the fresh read threw — but NOT when the line genuinely has no bills anymore
        # (fresh_read_ok=True + empty list → nothing to send, skip).
        if not image_url_list and not fresh_read_ok:
            raw_image_urls = row.get("image_urls")
            if isinstance(raw_image_urls, list) and raw_image_urls:
                image_url_list = [u for u in raw_image_urls if u and str(u).strip()]
            elif (row.get("image_url") or "").strip():
                image_url_list = [(row.get("image_url") or "").strip()]

        if image_url_list:
            img_update: dict = {}
            try:
                from zalo_notifier import send_images_to_group
                await asyncio.to_thread(send_images_to_group, group_id, image_url_list, sb=sb)
                img_update["image_sent_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            except Exception as img_exc:
                # Retry once after 3s for transient storage errors (e.g. 400/5xx)
                print(f"[zalo_worker] Image send attempt 1 failed for outbox {row_id}: {img_exc}")
                await asyncio.sleep(3)
                try:
                    from zalo_notifier import send_images_to_group
                    await asyncio.to_thread(send_images_to_group, group_id, image_url_list, sb=sb)
                    img_update["image_sent_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
                    print(f"[zalo_worker] Image send retry OK for outbox {row_id}")
                except Exception as retry_exc:
                    print(f"[zalo_worker] Image send retry failed for outbox {row_id}: {retry_exc}")
                    img_update["image_error"] = str(retry_exc)[:500]
                    # Fallback: send all bill links as one text message
                    links = "\n".join(f"📎 Bill #{i+1}: {u}" for i, u in enumerate(image_url_list))
                    try:
                        await asyncio.to_thread(send_text_to_group, group_id, links, sb=sb)
                    except Exception:
                        pass
            if img_update:
                sb.table("zalo_outbox").update(img_update).eq("id", row_id).execute()

    except Exception as exc:
        err_msg = str(exc)
        new_retries = retries + 1
        is_fatal = _is_fatal_error(err_msg)
        update_payload = {
            "retries": new_retries if not is_fatal else MAX_RETRIES,
            "last_error": err_msg,
        }

        if is_fatal or new_retries >= MAX_RETRIES:
            update_payload["next_retry_at"] = None
            reason = "fatal error" if is_fatal else f"{new_retries} attempts"
            print(f"[zalo_worker] Message {row_id} dead ({reason}). Error: {err_msg}")
        else:
            delay = RETRY_DELAYS[min(new_retries - 1, len(RETRY_DELAYS) - 1)]
            next_retry = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=delay)
            update_payload["next_retry_at"] = next_retry.isoformat()
            print(f"[zalo_worker] Message {row_id} failed (attempt {new_retries}). Retrying in {delay}s. Error: {err_msg}")

        try:
            sb.table("zalo_outbox").update(update_payload).eq("id", row_id).execute()
        except Exception as update_exc:
            print(f"[zalo_worker] failed to update outbox row {row_id} status: {update_exc}")


async def poll_and_send(sb_factory: Callable[[], Any]):
    """Reads pending rows from zalo_outbox, calls send_text_to_group, updates sent_at or schedules retry."""
    sb = sb_factory()
    if not sb:
        print("[zalo_worker] Supabase client is not configured.")
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()

    try:
        # Select pending rows
        # sent_at IS NULL AND (next_retry_at IS NULL OR next_retry_at <= now())
        res = (
            sb.table("zalo_outbox")
            .select("*")
            .is_("sent_at", "null")
            .or_(f"next_retry_at.is.null,next_retry_at.lte.{now_iso}")
            .or_(f"retries.is.null,retries.lt.{MAX_RETRIES}")
            .order("created_at", desc=False)
            .order("id", desc=False)
            .limit(BATCH_SIZE)
            .execute()
        )
        rows = res.data or []
    except Exception as exc:
        print(f"[zalo_worker] failed to fetch outbox rows: {exc}")
        return

    for row in rows:
        await _process_row(row, sb)

async def start_outbox_worker(sb_factory: Callable[[], Any], poll_interval: int = POLL_INTERVAL):
    """Background task loop that runs every poll_interval seconds."""
    print("[zalo_worker] Starting Zalo Outbox Worker...")
    while True:
        try:
            await poll_and_send(sb_factory)
        except Exception as exc:
            print(f"[zalo_worker] unexpected loop error: {exc}")
            traceback.print_exc()
        await asyncio.sleep(poll_interval)
