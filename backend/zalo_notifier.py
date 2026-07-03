"""Zalo OA GMF notification client.

This module is the only backend layer that should talk directly to Zalo OA.
Workers/routes call send_text_to_group() and do not need to know token details.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import httpx

from env_utils import resolve_dingtalk_webhook_url

ZALO_GROUP_MESSAGE_URL = "https://openapi.zalo.me/v3.0/oa/group/message"
ZALO_UPLOAD_IMAGE_URL = "https://openapi.zalo.me/v2.0/oa/upload/image"
ZALO_REFRESH_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"
TOKEN_REFRESH_WINDOW = timedelta(days=7)
HTTP_TIMEOUT = 15.0
ALERT_TIMEOUT = 8.0


class ZaloAPIError(RuntimeError):
    """Raised when Zalo API or credential storage fails."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        zalo_error: Any = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.zalo_error = zalo_error
        self.response_body = response_body


@dataclass
class ZaloCredentials:
    app_id: str
    app_secret: str
    access_token: str
    refresh_token: str
    expires_at: datetime | None = None
    row_id: Any = None

    @property
    def expires_soon(self) -> bool:
        if not self.expires_at:
            return False
        return self.expires_at <= datetime.now(timezone.utc) + TOKEN_REFRESH_WINDOW


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _env_credentials() -> ZaloCredentials | None:
    app_id = _clean(os.getenv("ZALO_OA_APP_ID") or os.getenv("ZALO_OA_ID"))
    app_secret = _clean(os.getenv("ZALO_OA_APP_SECRET"))
    access_token = _clean(os.getenv("ZALO_OA_ACCESS_TOKEN"))
    refresh_token = _clean(os.getenv("ZALO_OA_REFRESH_TOKEN"))
    expires_at = _parse_datetime(os.getenv("ZALO_OA_TOKEN_EXPIRES_AT"))
    if not any([app_id, app_secret, access_token, refresh_token]):
        return None
    return ZaloCredentials(
        app_id=app_id,
        app_secret=app_secret,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=expires_at,
    )


def _row_credentials(row: dict[str, Any]) -> ZaloCredentials:
    return ZaloCredentials(
        app_id=_clean(row.get("app_id")),
        app_secret=_clean(row.get("app_secret")),
        access_token=_clean(row.get("access_token")),
        refresh_token=_clean(row.get("refresh_token")),
        expires_at=_parse_datetime(row.get("expires_at")),
        row_id=row.get("id"),
    )


def _read_credentials(sb=None) -> ZaloCredentials:
    if sb is not None:
        try:
            res = (
                sb.table("zalo_oa_credentials")
                .select("*")
                .order("updated_at", desc=True)
                .limit(1)
                .execute()
            )
            rows = res.data or []
            if rows:
                return _row_credentials(rows[0])
        except Exception as exc:
            raise ZaloAPIError(f"Khong doc duoc zalo_oa_credentials: {exc}") from exc

    creds = _env_credentials()
    if creds:
        return creds
    raise ZaloAPIError("Chua cau hinh Zalo OA credentials")


def _validate_credentials(creds: ZaloCredentials, *, require_access: bool = True) -> None:
    missing = []
    if not creds.app_id:
        missing.append("app_id")
    if not creds.app_secret:
        missing.append("app_secret")
    if not creds.refresh_token:
        missing.append("refresh_token")
    if require_access and not creds.access_token:
        missing.append("access_token")
    if missing:
        raise ZaloAPIError("Thieu Zalo OA credential: " + ", ".join(missing))


def _update_credentials(sb, creds: ZaloCredentials) -> None:
    if sb is None:
        return

    payload = {
        "app_id": creds.app_id,
        "app_secret": creds.app_secret,
        "access_token": creds.access_token,
        "refresh_token": creds.refresh_token,
        "expires_at": _iso(creds.expires_at),
        "updated_at": _iso(_utc_now()),
    }

    try:
        if creds.row_id is not None:
            sb.table("zalo_oa_credentials").update(payload).eq("id", creds.row_id).execute()
        else:
            sb.table("zalo_oa_credentials").insert(payload).execute()
    except Exception as exc:
        raise ZaloAPIError(f"Khong update duoc zalo_oa_credentials: {exc}") from exc


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _zalo_error_from_body(body: Any) -> Any:
    if isinstance(body, dict):
        return body.get("error") if "error" in body else body.get("error_code")
    return None


def _ensure_zalo_ok(resp: httpx.Response, *, action: str) -> dict[str, Any]:
    body = _json_or_text(resp)
    if resp.status_code >= 400:
        raise ZaloAPIError(
            f"Zalo {action} HTTP {resp.status_code}",
            status_code=resp.status_code,
            zalo_error=_zalo_error_from_body(body),
            response_body=body,
        )
    if not isinstance(body, dict):
        raise ZaloAPIError(f"Zalo {action} response khong phai JSON object", response_body=body)
    err = _zalo_error_from_body(body)
    if err not in (None, 0, "0"):
        raise ZaloAPIError(
            f"Zalo {action} failed: {err}",
            status_code=resp.status_code,
            zalo_error=err,
            response_body=body,
        )
    return body


def _message_id_from_body(body: dict[str, Any]) -> str:
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    candidates = [
        data.get("message_id"),
        data.get("msg_id"),
        body.get("message_id"),
        body.get("msg_id"),
    ]
    for value in candidates:
        text = _clean(value)
        if text:
            return text
    raise ZaloAPIError("Zalo send response khong co message_id", response_body=body)


def _expires_at_from_refresh(body: dict[str, Any]) -> datetime:
    expires_in = body.get("expires_in") or body.get("expiresIn")
    try:
        seconds = int(float(expires_in))
    except (TypeError, ValueError):
        seconds = 25 * 60 * 60
    return _utc_now() + timedelta(seconds=max(seconds - 60, 60))


def refresh_access_token(*, sb=None) -> dict[str, Any]:
    """Refresh Zalo OA access token and persist it when a Supabase client is given."""
    creds = _read_credentials(sb)
    _validate_credentials(creds, require_access=False)

    headers = {"secret_key": creds.app_secret}
    data = {
        "refresh_token": creds.refresh_token,
        "app_id": creds.app_id,
        "grant_type": "refresh_token",
    }

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(ZALO_REFRESH_TOKEN_URL, data=data, headers=headers)
    body = _ensure_zalo_ok(resp, action="refresh_token")

    access_token = _clean(body.get("access_token"))
    refresh_token = _clean(body.get("refresh_token") or creds.refresh_token)
    if not access_token:
        raise ZaloAPIError("Zalo refresh response khong co access_token", response_body=body)

    refreshed = ZaloCredentials(
        app_id=creds.app_id,
        app_secret=creds.app_secret,
        access_token=access_token,
        refresh_token=refresh_token,
        expires_at=_expires_at_from_refresh(body),
        row_id=creds.row_id,
    )
    _update_credentials(sb, refreshed)
    return {
        "access_token": refreshed.access_token,
        "refresh_token": refreshed.refresh_token,
        "expires_at": _iso(refreshed.expires_at),
    }


def ensure_token_fresh(*, sb=None, within_days: int = 7, within_hours: int | None = None) -> bool:
    """Refresh token when it expires within the configured window.

    Returns True when a refresh was performed.
    """
    creds = _read_credentials(sb)
    if not creds.expires_at:
        return False
    window = timedelta(hours=within_hours) if within_hours is not None else timedelta(days=within_days)
    if creds.expires_at > _utc_now() + window:
        return False
    refresh_access_token(sb=sb)
    return True


def _send_group_payload_once(payload: dict[str, Any], access_token: str) -> str:
    headers = {
        "access_token": access_token,
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(ZALO_GROUP_MESSAGE_URL, json=payload, headers=headers)
    body = _ensure_zalo_ok(resp, action="send_group_message")
    return _message_id_from_body(body)


def _send_once(group_id: str, message: str, access_token: str) -> str:
    payload = {
        "recipient": {"group_id": group_id},
        "message": {"text": message},
    }
    return _send_group_payload_once(payload, access_token)


def _is_auth_error(exc: ZaloAPIError) -> bool:
    if exc.status_code == 401:
        return True
    code = _clean(exc.zalo_error)
    return code in {"-201", "-216", "201", "401", "40101", "40102"}


def send_text_to_group(group_id: str, message: str, *, sb=None) -> str:
    """Send text to a Zalo GMF group and return Zalo message_id.

    On token expiration, refresh once and retry once.
    """
    group_id = _clean(group_id)
    message = _clean(message)
    if not group_id:
        raise ZaloAPIError("group_id khong duoc de trong")
    if not message:
        raise ZaloAPIError("message khong duoc de trong")

    creds = _read_credentials(sb)
    _validate_credentials(creds)
    try:
        return _send_once(group_id, message, creds.access_token)
    except ZaloAPIError as exc:
        if not _is_auth_error(exc):
            raise

    refreshed = refresh_access_token(sb=sb)
    return _send_once(group_id, message, refreshed["access_token"])


def _fetch_image_bytes(image_url: str) -> tuple[bytes, str]:
    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.get(image_url)
            resp.raise_for_status()
            content_disposition = resp.headers.get("content-disposition", "")
            filename = "image.jpg"
            if "filename=" in content_disposition:
                filename = content_disposition.split("filename=")[1].strip('"\'')
            else:
                import urllib.parse
                parsed = urllib.parse.urlparse(image_url)
                path = parsed.path
                if "/" in path:
                    name = path.rsplit("/", 1)[-1]
                    if "." in name:
                        filename = name
            return resp.content, filename
    except Exception as exc:
        raise ZaloAPIError(f"Khong the tai anh tu {image_url}: {exc}") from exc


def _upload_image(image_bytes: bytes, filename: str, access_token: str) -> str:
    headers = {"access_token": access_token}
    files = {"file": (filename, image_bytes, "image/jpeg")}
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(ZALO_UPLOAD_IMAGE_URL, files=files, headers=headers)
    body = _ensure_zalo_ok(resp, action="upload_image")
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    attachment_id = _clean(data.get("attachment_id"))
    if not attachment_id:
        raise ZaloAPIError("Zalo upload response khong co attachment_id", response_body=body)
    return attachment_id


def send_image_to_group(group_id: str, image_url: str, *, caption: str | None = None, sb=None) -> str:
    """Send an image to a Zalo group. Follows same auth retry pattern as send_text_to_group."""
    group_id = _clean(group_id)
    image_url = _clean(image_url)
    if not group_id:
        raise ZaloAPIError("group_id khong duoc de trong")
    if not image_url:
        raise ZaloAPIError("image_url khong duoc de trong")

    creds = _read_credentials(sb)
    _validate_credentials(creds)

    img_bytes, filename = _fetch_image_bytes(image_url)

    def _do_send(acc_token: str) -> str:
        attachment_id = _upload_image(img_bytes, filename, acc_token)
        payload = {
            "recipient": {"group_id": group_id},
            "message": {
                "attachment": {
                    "type": "template",
                    "payload": {
                        "template_type": "media",
                        "elements": [{"media_type": "image", "attachment_id": attachment_id}],
                    },
                },
            },
        }
        return _send_group_payload_once(payload, acc_token)

    try:
        return _do_send(creds.access_token)
    except ZaloAPIError as exc:
        if not _is_auth_error(exc):
            raise

    refreshed = refresh_access_token(sb=sb)
    return _do_send(refreshed["access_token"])


async def run_daily_token_refresh_check(*, sb=None) -> bool:
    """Async wrapper for scheduler/worker integration."""
    return await asyncio.to_thread(ensure_token_fresh, sb=sb)


async def _send_refresh_failure_alert(error: Exception) -> None:
    webhook_url = resolve_dingtalk_webhook_url()
    if not webhook_url:
        print(f"[zalo] token refresh alert muted: {error}")
        return

    content = (
        "[PalFish GMV] Zalo OA token refresh failed\n"
        f"error: {error}"
    )
    payload = {"msgtype": "text", "text": {"content": content}}
    try:
        async with httpx.AsyncClient(timeout=ALERT_TIMEOUT) as client:
            resp = await client.post(webhook_url, json=payload)
            resp.raise_for_status()
    except Exception as alert_exc:
        print(f"[zalo] token refresh alert failed: {alert_exc}; original={error}")


def start_zalo_token_refresh_task(
    get_supabase: Callable[[], Any],
    *,
    interval_seconds: int = 3600,
) -> asyncio.Task:
    """Hourly Zalo OA token refresh guard.

    Checks every hour; only refreshes when token expires within 6 hours.
    If refresh fails, retries next hour instead of waiting 24h.
    """

    async def _loop() -> None:
        while True:
            try:
                refreshed = await asyncio.to_thread(
                    ensure_token_fresh, sb=get_supabase(), within_hours=6
                )
                if refreshed:
                    print("[zalo] token refreshed successfully")
            except Exception as exc:
                print(f"[zalo] token refresh check failed: {exc}")
                await _send_refresh_failure_alert(exc)
            await asyncio.sleep(interval_seconds)

    return asyncio.create_task(_loop())
