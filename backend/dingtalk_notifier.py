"""DingTalk enterprise robot notification client.

Uses OAuth2 access token + OrgGroupSend API (not custom webhook).
Workers/routes call send_group_message() — they don't deal with tokens.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

import httpx

HTTP_TIMEOUT = 15.0

TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/accessToken"
GROUP_SEND_URL = "https://api.dingtalk.com/v1.0/robot/groupMessages/send"
MEDIA_UPLOAD_URL = "https://oapi.dingtalk.com/media/upload"

_token_lock = threading.Lock()
_cached_token: str = ""
_token_expires_at: float = 0


class DingTalkAPIError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        dingtalk_errcode: Any = None,
        response_body: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.dingtalk_errcode = dingtalk_errcode
        self.response_body = response_body


class DingTalkAmbiguousDeliveryError(DingTalkAPIError):
    """Send failed AFTER the request reached DingTalk's async gateway.

    Two triggers: (1) an HTTP 5xx that carries a body but NO processQueryKey,
    (2) a read/write timeout (request sent, response lost). Because the group
    send API is ASYNC, in both cases the message may ALREADY be enqueued for
    delivery — observed 18/7: a 503 ServiceUnavailable that still delivered.
    Retrying such a send posts a DUPLICATE. Callers MUST treat this as terminal
    (do not auto-retry) and flag for manual verification, rather than claim
    success or reschedule. Distinct from the base error, which stays retryable
    (connect errors = never delivered, 4xx = rejected before enqueue).
    """


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _to_dingtalk_md(text: str) -> str:
    """Convert plain-text message to DingTalk markdown.

    DingTalk markdown ignores single \\n and trailing-space ``  \\n``
    renders leading whitespace on the next line.  ``<br>`` is the only
    line-break that renders cleanly (no extra spacing, no leading space).
    """
    return text.replace("\n", "<br>")


def _get_credentials() -> tuple[str, str, str]:
    client_id = os.getenv("DINGTALK_CLIENT_ID", "").strip()
    client_secret = os.getenv("DINGTALK_CLIENT_SECRET", "").strip()
    robot_code = os.getenv("DINGTALK_ROBOT_CODE", "").strip()
    if not client_id or not client_secret:
        raise DingTalkAPIError("DINGTALK_CLIENT_ID / DINGTALK_CLIENT_SECRET chua cau hinh")
    if not robot_code:
        robot_code = client_id
    return client_id, client_secret, robot_code


def get_access_token(*, client_id: str | None = None, client_secret: str | None = None) -> str:
    """Get a cached OAuth2 access token, refreshing when expired."""
    global _cached_token, _token_expires_at

    with _token_lock:
        if _cached_token and time.time() < _token_expires_at:
            return _cached_token

    if not client_id or not client_secret:
        client_id, client_secret, _ = _get_credentials()

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(TOKEN_URL, json={
                "appKey": client_id,
                "appSecret": client_secret,
            })
    except httpx.HTTPError as exc:
        raise DingTalkAPIError(f"DingTalk token request failed: {exc}") from exc

    body = _json_or_text(resp)
    if resp.status_code >= 400:
        raise DingTalkAPIError(
            f"DingTalk token HTTP {resp.status_code}",
            status_code=resp.status_code,
            response_body=body,
        )
    if not isinstance(body, dict) or "accessToken" not in body:
        raise DingTalkAPIError("DingTalk token response invalid", response_body=body)

    token = body["accessToken"]
    expire_in = body.get("expireIn", 7200)

    with _token_lock:
        _cached_token = token
        _token_expires_at = time.time() + expire_in - 300

    return token


def send_group_message(
    *,
    open_conversation_id: str,
    message: str,
    title: str = "",
    robot_code: str | None = None,
) -> str:
    """Send a message to a DingTalk group via enterprise robot.

    If title is provided, sends as Markdown (sampleMarkdown).
    Otherwise sends as plain text (sampleText).

    Returns the processQueryKey from DingTalk.
    """
    open_conversation_id = _clean(open_conversation_id)
    message = _clean(message)
    if not open_conversation_id:
        raise DingTalkAPIError("open_conversation_id khong duoc de trong")
    if not message:
        raise DingTalkAPIError("message khong duoc de trong")

    if not robot_code:
        _, _, robot_code = _get_credentials()

    token = get_access_token()

    if title:
        msg_key = "sampleMarkdown"
        md_text = _to_dingtalk_md(message)
        msg_param = {"title": title, "text": md_text}
    else:
        msg_key = "sampleText"
        msg_param = {"content": message}

    import json
    payload = {
        "msgKey": msg_key,
        "msgParam": json.dumps(msg_param, ensure_ascii=False),
        "robotCode": robot_code,
        "openConversationId": open_conversation_id,
    }

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(
                GROUP_SEND_URL,
                json=payload,
                headers={
                    "x-acs-dingtalk-access-token": token,
                    "Content-Type": "application/json",
                },
            )
    except httpx.ConnectError as exc:
        # Never established a connection → request definitely not delivered →
        # safe to retry (won't duplicate).
        raise DingTalkAPIError(f"DingTalk connect error: {exc}") from exc
    except httpx.HTTPError as exc:
        # Connected + request sent but no clean response (read/write timeout).
        # Async enqueue MAY have happened → ambiguous → terminal, do not retry.
        raise DingTalkAmbiguousDeliveryError(
            f"DingTalk network ambiguous (sent, no response): {exc}"
        ) from exc

    body = _json_or_text(resp)

    # DingTalk group send is ASYNC: a processQueryKey in the body means the
    # message was accepted+enqueued for delivery. Return it as success even when
    # the HTTP status is 5xx — an ambiguous 5xx that STILL carries the key was
    # actually delivered, so retrying would post a DUPLICATE. (Guards the
    # "delivered-but-503" case that double-sent a group message during testing.)
    process_key = body.get("processQueryKey", "") if isinstance(body, dict) else ""
    if process_key:
        return process_key

    if resp.status_code >= 500:
        # Got a status+body from DingTalk's gateway but NO processQueryKey. The
        # async enqueue may already have happened (observed 18/7: 503
        # ServiceUnavailable that still delivered) → retrying posts a DUPLICATE.
        # Terminal + flag, NOT retryable. (learning: dingtalk-async-send-5xx-duplicate)
        raise DingTalkAmbiguousDeliveryError(
            f"DingTalk HTTP {resp.status_code} (no key, assumed enqueued): {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )
    if resp.status_code >= 400:
        # 4xx = genuine rejection (bad token/param), not enqueued → retry is safe
        # (usually permanent → dead-letters without duplicating).
        raise DingTalkAPIError(
            f"DingTalk HTTP {resp.status_code}: {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )
    if not isinstance(body, dict):
        raise DingTalkAPIError("DingTalk response khong phai JSON object", response_body=body)

    return f"dt-{int(time.time() * 1000)}"


def _upload_image_to_dingtalk(image_url: str) -> str:
    """Download image from external URL, upload to DingTalk media, return media_id.

    sampleImageMsg with external URLs caches the first image sent and reuses it
    for all subsequent sends (DingTalk bug confirmed 14/8). Uploading to DingTalk
    media first gives each image a unique media_id → correct display.
    """
    token = get_access_token()
    filename = image_url.rsplit("/", 1)[-1].split("?")[0] or "bill.jpg"

    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        img_resp = client.get(image_url)
        img_resp.raise_for_status()

    content_type = img_resp.headers.get("content-type", "image/jpeg")
    with httpx.Client(timeout=HTTP_TIMEOUT) as client:
        resp = client.post(
            MEDIA_UPLOAD_URL,
            params={"access_token": token, "type": "image"},
            files={"media": (filename, img_resp.content, content_type)},
        )

    body = _json_or_text(resp)
    if not isinstance(body, dict):
        raise DingTalkAPIError(f"DingTalk upload response not JSON: {str(body)[:200]}")
    media_id = body.get("media_id", "")
    if not media_id:
        errcode = body.get("errcode", "")
        errmsg = body.get("errmsg", "")
        raise DingTalkAPIError(
            f"DingTalk upload failed: errcode={errcode} errmsg={errmsg}",
            dingtalk_errcode=errcode,
            response_body=body,
        )
    return media_id


def send_group_image(
    *,
    open_conversation_id: str,
    photo_url: str,
    robot_code: str | None = None,
) -> str:
    """Send an image to a DingTalk group via enterprise robot (sampleImageMsg).

    Uploads to DingTalk media first (external URLs get cached/mixed up by DingTalk).
    """
    open_conversation_id = _clean(open_conversation_id)
    photo_url = _clean(photo_url)
    if not open_conversation_id or not photo_url:
        return ""

    if not robot_code:
        _, _, robot_code = _get_credentials()

    media_id = _upload_image_to_dingtalk(photo_url)
    token = get_access_token()

    import json
    payload = {
        "msgKey": "sampleImageMsg",
        "msgParam": json.dumps({"photoURL": media_id}, ensure_ascii=False),
        "robotCode": robot_code,
        "openConversationId": open_conversation_id,
    }

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(
                GROUP_SEND_URL,
                json=payload,
                headers={
                    "x-acs-dingtalk-access-token": token,
                    "Content-Type": "application/json",
                },
            )
    except httpx.ConnectError as exc:
        # Never connected → not delivered → safe to retry.
        raise DingTalkAPIError(f"DingTalk image connect error: {exc}") from exc
    except httpx.HTTPError as exc:
        # Sent but response lost → async enqueue may have happened → terminal.
        raise DingTalkAmbiguousDeliveryError(
            f"DingTalk image network ambiguous (sent, no response): {exc}"
        ) from exc

    body = _json_or_text(resp)

    # Async send: key in body = delivered, treat as success even on 5xx (dedup).
    process_key = body.get("processQueryKey", "") if isinstance(body, dict) else ""
    if process_key:
        return process_key

    if resp.status_code >= 500:
        # 5xx-no-key after reaching gateway → may already be enqueued → retrying
        # duplicates → terminal, not retryable.
        raise DingTalkAmbiguousDeliveryError(
            f"DingTalk image HTTP {resp.status_code} (no key, assumed enqueued): {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )
    if resp.status_code >= 400:
        # 4xx = rejected before enqueue → retry safe.
        raise DingTalkAPIError(
            f"DingTalk image HTTP {resp.status_code}: {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )

    return f"dt-img-{int(time.time() * 1000)}"
