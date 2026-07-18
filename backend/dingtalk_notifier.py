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


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _to_dingtalk_md(text: str) -> str:
    """Convert plain-text message to DingTalk markdown.

    DingTalk markdown ignores single \\n (standard markdown behavior).
    Append two trailing spaces before each \\n to force <br>.
    """
    return text.replace("\n", "  \n")


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
    except httpx.HTTPError as exc:
        raise DingTalkAPIError(f"DingTalk network error: {exc}") from exc

    body = _json_or_text(resp)

    # DingTalk group send is ASYNC: a processQueryKey in the body means the
    # message was accepted+enqueued for delivery. Return it as success even when
    # the HTTP status is 5xx — an ambiguous 5xx that STILL carries the key was
    # actually delivered, so retrying would post a DUPLICATE. (Guards the
    # "delivered-but-503" case that double-sent a group message during testing.)
    process_key = body.get("processQueryKey", "") if isinstance(body, dict) else ""
    if process_key:
        return process_key

    if resp.status_code >= 400:
        # Include a body snippet so the next 5xx is diagnosable from last_error.
        raise DingTalkAPIError(
            f"DingTalk HTTP {resp.status_code}: {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )
    if not isinstance(body, dict):
        raise DingTalkAPIError("DingTalk response khong phai JSON object", response_body=body)

    return f"dt-{int(time.time() * 1000)}"


def send_group_image(
    *,
    open_conversation_id: str,
    photo_url: str,
    robot_code: str | None = None,
) -> str:
    """Send an image to a DingTalk group via enterprise robot (sampleImageMsg)."""
    open_conversation_id = _clean(open_conversation_id)
    photo_url = _clean(photo_url)
    if not open_conversation_id or not photo_url:
        return ""

    if not robot_code:
        _, _, robot_code = _get_credentials()

    token = get_access_token()

    import json
    payload = {
        "msgKey": "sampleImageMsg",
        "msgParam": json.dumps({"photoURL": photo_url}, ensure_ascii=False),
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
    except httpx.HTTPError as exc:
        raise DingTalkAPIError(f"DingTalk image send error: {exc}") from exc

    body = _json_or_text(resp)

    # Async send: key in body = delivered, treat as success even on 5xx (dedup).
    process_key = body.get("processQueryKey", "") if isinstance(body, dict) else ""
    if process_key:
        return process_key

    if resp.status_code >= 400:
        raise DingTalkAPIError(
            f"DingTalk image HTTP {resp.status_code}: {str(body)[:200]}",
            status_code=resp.status_code,
            response_body=body,
        )

    return f"dt-img-{int(time.time() * 1000)}"
