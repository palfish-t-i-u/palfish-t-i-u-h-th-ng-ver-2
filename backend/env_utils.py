"""Environment safety helpers shared by backend integrations."""

from __future__ import annotations

import os


def app_env() -> str:
    return (os.getenv("APP_ENV") or "development").strip().lower()


def is_sandbox_env() -> bool:
    return app_env() == "sandbox"


def resolve_dingtalk_webhook_url() -> str:
    """Return the only DingTalk webhook URL allowed for this environment.

    Sandbox is intentionally isolated: production DingTalk webhooks are ignored
    unless a dedicated sandbox URL is configured.
    """
    if is_sandbox_env():
        sandbox_url = (os.getenv("DINGTALK_WEBHOOK_URL_SANDBOX") or "").strip()
        if sandbox_url:
            return sandbox_url
        if (os.getenv("DINGTALK_WEBHOOK_URL") or "").strip():
            print("[sandbox] DingTalk outbound muted: DINGTALK_WEBHOOK_URL_SANDBOX is not set")
        return ""
    return (os.getenv("DINGTALK_WEBHOOK_URL") or "").strip()


def dingtalk_outbound_enabled() -> bool:
    return bool(resolve_dingtalk_webhook_url())
