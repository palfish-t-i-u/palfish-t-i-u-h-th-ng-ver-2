from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
import asyncio

import httpx
import pytest


class FakeHttpClient:
    def __init__(self, responses: list[httpx.Response]):
        self.responses = responses
        self.calls: list[dict[str, Any]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        if not self.responses:
            raise AssertionError("No fake HTTP response queued")
        return self.responses.pop(0)


class FakeAsyncHttpClient:
    def __init__(self):
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def post(self, url: str, **kwargs):
        self.calls.append({"url": url, **kwargs})
        return _json(200, {"ok": True})


class FakeZaloTable:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows
        self.op = "select"
        self.payload: dict[str, Any] | None = None

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def update(self, payload: dict[str, Any]):
        self.op = "update"
        self.payload = payload
        return self

    def insert(self, payload: dict[str, Any]):
        self.op = "insert"
        self.payload = payload
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        if self.op == "update":
            self.rows[0].update(self.payload or {})
            return type("Result", (), {"data": [self.rows[0]]})()
        if self.op == "insert":
            row = dict(self.payload or {})
            row.setdefault("id", 1)
            self.rows.append(row)
            return type("Result", (), {"data": [row]})()
        return type("Result", (), {"data": self.rows})()


class FakeSB:
    def __init__(self, rows: list[dict[str, Any]]):
        self.rows = rows
        self.table_obj = FakeZaloTable(rows)

    def table(self, name: str):
        assert name == "zalo_oa_credentials"
        return self.table_obj


def _json(status: int, body: dict[str, Any]) -> httpx.Response:
    return httpx.Response(status, json=body)


def _set_env_creds(monkeypatch, *, access_token: str = "old-access"):
    monkeypatch.setenv("ZALO_OA_APP_ID", "app-id")
    monkeypatch.setenv("ZALO_OA_APP_SECRET", "app-secret")
    monkeypatch.setenv("ZALO_OA_ACCESS_TOKEN", access_token)
    monkeypatch.setenv("ZALO_OA_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setenv(
        "ZALO_OA_TOKEN_EXPIRES_AT",
        (datetime.now(timezone.utc) + timedelta(hours=12)).isoformat(),
    )


def test_send_text_to_group_success(monkeypatch):
    import zalo_notifier

    _set_env_creds(monkeypatch)
    fake = FakeHttpClient([
        _json(200, {"error": 0, "message": "Success", "data": {"message_id": "msg-1"}})
    ])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    message_id = zalo_notifier.send_text_to_group("group-1", "hello")

    assert message_id == "msg-1"
    assert fake.calls[0]["url"] == zalo_notifier.ZALO_GROUP_MESSAGE_URL
    assert fake.calls[0]["headers"]["access_token"] == "old-access"
    assert fake.calls[0]["json"] == {
        "recipient": {"group_id": "group-1"},
        "message": {"text": "hello"},
    }


def test_send_refreshes_once_on_401_then_retries(monkeypatch):
    import zalo_notifier

    _set_env_creds(monkeypatch)
    fake = FakeHttpClient([
        _json(401, {"error": 401, "message": "expired"}),
        _json(200, {"error": 0, "access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 90000}),
        _json(200, {"error": 0, "data": {"message_id": "msg-2"}}),
    ])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    message_id = zalo_notifier.send_text_to_group("group-1", "hello")

    assert message_id == "msg-2"
    assert fake.calls[1]["url"] == zalo_notifier.ZALO_REFRESH_TOKEN_URL
    assert fake.calls[1]["headers"]["secret_key"] == "app-secret"
    assert fake.calls[1]["data"]["grant_type"] == "refresh_token"
    assert fake.calls[2]["headers"]["access_token"] == "new-access"


def test_refresh_access_token_updates_db(monkeypatch):
    import zalo_notifier

    row = {
        "id": 7,
        "app_id": "app-id",
        "app_secret": "app-secret",
        "access_token": "old-access",
        "refresh_token": "old-refresh",
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }
    sb = FakeSB([row])
    fake = FakeHttpClient([
        _json(200, {"error": 0, "access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 90000})
    ])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    result = zalo_notifier.refresh_access_token(sb=sb)

    assert result["access_token"] == "new-access"
    assert row["access_token"] == "new-access"
    assert row["refresh_token"] == "new-refresh"
    assert row["expires_at"]
    assert row["updated_at"]


def test_ensure_token_fresh_refreshes_when_expiring(monkeypatch):
    import zalo_notifier

    row = {
        "id": 7,
        "app_id": "app-id",
        "app_secret": "app-secret",
        "access_token": "old-access",
        "refresh_token": "old-refresh",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
    }
    sb = FakeSB([row])
    fake = FakeHttpClient([
        _json(200, {"error": 0, "access_token": "new-access", "refresh_token": "new-refresh", "expires_in": 90000})
    ])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    assert zalo_notifier.ensure_token_fresh(sb=sb, within_days=7) is True
    assert row["access_token"] == "new-access"


def test_ensure_token_fresh_skips_when_not_expiring(monkeypatch):
    import zalo_notifier

    row = {
        "id": 7,
        "app_id": "app-id",
        "app_secret": "app-secret",
        "access_token": "old-access",
        "refresh_token": "old-refresh",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=20)).isoformat(),
    }
    sb = FakeSB([row])

    assert zalo_notifier.ensure_token_fresh(sb=sb, within_days=7) is False


def test_send_raises_on_zalo_500(monkeypatch):
    import zalo_notifier

    _set_env_creds(monkeypatch)
    fake = FakeHttpClient([_json(500, {"error": 500, "message": "boom"})])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    with pytest.raises(zalo_notifier.ZaloAPIError) as exc:
        zalo_notifier.send_text_to_group("group-1", "hello")

    assert exc.value.status_code == 500


def test_refresh_failure_is_reported(monkeypatch):
    import zalo_notifier

    _set_env_creds(monkeypatch)
    fake = FakeHttpClient([_json(200, {"error": -201, "message": "bad refresh"})])
    monkeypatch.setattr(zalo_notifier.httpx, "Client", lambda **_kwargs: fake)

    with pytest.raises(zalo_notifier.ZaloAPIError) as exc:
        zalo_notifier.refresh_access_token()

    assert exc.value.zalo_error == -201


def test_refresh_failure_alert_uses_dingtalk(monkeypatch):
    import zalo_notifier

    fake = FakeAsyncHttpClient()
    monkeypatch.setenv("DINGTALK_WEBHOOK_URL_SANDBOX", "https://dingtalk.test/hook")
    monkeypatch.setattr(zalo_notifier.httpx, "AsyncClient", lambda **_kwargs: fake)

    asyncio.run(zalo_notifier._send_refresh_failure_alert(RuntimeError("boom")))

    assert fake.calls[0]["url"] == "https://dingtalk.test/hook"
    assert fake.calls[0]["json"]["msgtype"] == "text"
    assert "Zalo OA token refresh failed" in fake.calls[0]["json"]["text"]["content"]
    assert "boom" in fake.calls[0]["json"]["text"]["content"]
