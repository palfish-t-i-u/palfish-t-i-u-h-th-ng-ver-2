"""DingTalk outbox worker must be gated by DINGTALK_WORKER_ENABLED.

Default OFF: the dingtalk_outbox table doesn't exist yet (setup pending);
an always-on worker spams PGRST205 errors every 30s. Re-enable later by
setting the env var on Render — no code change."""

import asyncio

import pytest


@pytest.mark.asyncio
async def test_dingtalk_worker_disabled_by_default(monkeypatch):
    import main

    monkeypatch.delenv("DINGTALK_WORKER_ENABLED", raising=False)
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert created == [], "worker must NOT start when flag is unset"


@pytest.mark.asyncio
async def test_dingtalk_worker_disabled_when_false(monkeypatch):
    import main

    monkeypatch.setenv("DINGTALK_WORKER_ENABLED", "false")
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert created == []


@pytest.mark.asyncio
async def test_dingtalk_worker_enabled_via_env(monkeypatch):
    import main

    monkeypatch.setenv("DINGTALK_WORKER_ENABLED", "TRUE")
    created = []

    def fake_create_task(coro):
        coro.close()
        created.append(coro)

    monkeypatch.setattr(asyncio, "create_task", fake_create_task)
    await main._start_dingtalk_worker()

    assert len(created) == 1, "worker must start when flag is true (case-insensitive)"
