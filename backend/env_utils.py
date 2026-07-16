"""Environment safety helpers shared by backend integrations."""

from __future__ import annotations

import os


def app_env() -> str:
    return (os.getenv("APP_ENV") or "development").strip().lower()


def is_sandbox_env() -> bool:
    return app_env() == "sandbox"


def dingtalk_outbound_enabled() -> bool:
    """True when enterprise robot credentials are configured."""
    return bool(
        (os.getenv("DINGTALK_CLIENT_ID") or "").strip()
        and (os.getenv("DINGTALK_CLIENT_SECRET") or "").strip()
    )


def zalo_oa_app_id() -> str:
    """Return configured Zalo OA app id, accepting the legacy shorter env name."""
    return (os.getenv("ZALO_OA_APP_ID") or os.getenv("ZALO_OA_ID") or "").strip()


def zalo_oa_configured() -> bool:
    """True when the minimum local/env Zalo credentials are present."""
    return bool(
        zalo_oa_app_id()
        and (os.getenv("ZALO_OA_APP_SECRET") or "").strip()
        and (os.getenv("ZALO_OA_REFRESH_TOKEN") or "").strip()
    )


def dingtalk_event_enabled(event_type: str) -> bool:
    """False when event_type is listed in DINGTALK_DISABLED_EVENTS (comma-sep).

    Denylist so default (unset/empty) = every event enabled (current behavior).
    Temporary kill-switch: set the env, no code redeploy needed to revert.
    """
    raw = (os.getenv("DINGTALK_DISABLED_EVENTS") or "").strip()
    if not raw:
        return True
    disabled = {e.strip() for e in raw.split(",") if e.strip()}
    return event_type not in disabled


def require_completion_report_enabled() -> bool:
    """True by default. Set REQUIRE_COMPLETION_REPORT_FOR_AR=0 to disable (kill-switch).

    Spec: default bật, chỉ set ="0" mới tắt.
    """
    return os.getenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "1") != "0"
