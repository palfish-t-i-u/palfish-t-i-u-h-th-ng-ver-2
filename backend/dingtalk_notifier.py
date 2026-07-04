"""DingTalk group robot notification client.

Workers/routes call send_text_to_group() — they don't deal with signing.
Mirror the Zalo notifier surface so call sites stay symmetric.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
import urllib.parse
from typing import Any

import httpx

HTTP_TIMEOUT = 15.0


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


def compute_signature(timestamp: str, secret: str) -> str:
    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    raw = hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).digest()
    return base64.b64encode(raw).decode("utf-8")  # plain base64, urlencode will percent-encode


def _clean(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _json_or_text(resp: httpx.Response) -> Any:
    try:
        return resp.json()
    except ValueError:
        return resp.text


def _append_query(url: str, params: dict[str, str]) -> str:
    sep = "&" if "?" in url else "?"
    return url + sep + urllib.parse.urlencode(params)


def _build_signed_url(webhook_url: str, secret: str) -> tuple[str, str]:
    timestamp = str(int(time.time() * 1000))
    sign = compute_signature(timestamp, secret)
    return _append_query(webhook_url, {"timestamp": timestamp, "sign": sign}), timestamp


def send_text_to_group(
    *,
    webhook_url: str,
    secret: str,
    message: str,
) -> str:
    """Send a plain-text message to a DingTalk group robot.

    Returns a surrogate message id (DingTalk does not return one — we synthesize
    the timestamp used so worker rows have something traceable).
    """
    webhook_url = _clean(webhook_url)
    secret = _clean(secret)
    message = _clean(message)
    if not webhook_url:
        raise DingTalkAPIError("webhook_url khong duoc de trong")
    if not secret:
        raise DingTalkAPIError("secret khong duoc de trong")
    if not message:
        raise DingTalkAPIError("message khong duoc de trong")

    signed_url, timestamp = _build_signed_url(webhook_url, secret)
    payload = {"msgtype": "text", "text": {"content": message}}
    headers = {"Content-Type": "application/json"}

    try:
        with httpx.Client(timeout=HTTP_TIMEOUT) as client:
            resp = client.post(signed_url, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise DingTalkAPIError(
            f"DingTalk network error: {exc}",
            status_code=None,
            response_body=None,
        ) from exc

    body = _json_or_text(resp)
    if resp.status_code >= 400:
        raise DingTalkAPIError(
            f"DingTalk HTTP {resp.status_code}",
            status_code=resp.status_code,
            response_body=body,
        )
    if not isinstance(body, dict):
        raise DingTalkAPIError("DingTalk response khong phai JSON object", response_body=body)
    errcode = body.get("errcode")
    if errcode not in (0, "0", None):
        raise DingTalkAPIError(
            f"DingTalk errcode={errcode}: {body.get('errmsg')}",
            status_code=resp.status_code,
            dingtalk_errcode=errcode,
            response_body=body,
        )
    return f"dt-{timestamp}"
