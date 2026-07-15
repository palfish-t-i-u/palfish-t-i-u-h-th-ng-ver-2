"""HTTP/2 GOAWAY storm + healthz threadpool starvation (2026-07-15).

Plan: docs/superpowers/plans/2026-07-15-fix-h2-goaway-http1-pool-healthz-async.md
Sự cố: singleton postgrest dùng 1 connection HTTP/2, trần ~100 streams →
GOAWAY (ConnectionTerminated last_stream_id:99) → 500 + threads kẹt →
/healthz (sync) xếp hàng threadpool >5s → Render kill instance.
Fix: postgrest session → httpx HTTP/1.1 pool; /healthz → async def.
"""
from __future__ import annotations

import asyncio
import inspect
import os
import sys
from types import SimpleNamespace

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _fake_sb_with_session():
    """Fake supabase client mang postgrest.session là httpx.Client thật
    (KHÔNG gọi create_client thật — package bị thư mục supabase/ của repo
    shadow trong test env, xem test_supabase_singleton.py)."""
    old = httpx.Client(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "k-test", "Authorization": "Bearer k-test",
                 "Accept-Profile": "public"},
        timeout=httpx.Timeout(20),
    )
    return SimpleNamespace(postgrest=SimpleNamespace(session=old)), old


def test_force_http1_replaces_session_and_preserves_params():
    import main

    sb, old = _fake_sb_with_session()
    assert main._force_http1_session(sb) is True
    new = sb.postgrest.session
    assert new is not old, "session phải được thay mới"
    assert old.is_closed, "session h2 cũ phải được đóng (tránh leak pool)"
    # Headers/base_url/timeout copy nguyên — thiếu apikey/Accept-Profile là chết mọi query
    assert new.headers["apikey"] == "k-test"
    assert new.headers["authorization"] == "Bearer k-test"
    assert new.headers["accept-profile"] == "public"
    assert str(new.base_url).rstrip("/") == "https://example.supabase.co/rest/v1"
    assert new.timeout == old.timeout


def test_force_http1_source_disables_http2():
    """Structural guard: hàm override phải tạo client http2=False —
    trần ~100 streams/connection của HTTP/2 chính là gốc GOAWAY storm."""
    import main

    src = inspect.getsource(main._force_http1_session)
    assert "http2=False" in src
    assert "max_connections" in src, "phải set httpx.Limits cho pool"


def test_force_http1_failure_keeps_old_session():
    """Guardrail: internals postgrest đổi (không còn .session) → KHÔNG crash,
    giữ nguyên client cũ (app chạy tiếp như hiện tại, chỉ log warning)."""
    import main

    sb = SimpleNamespace(postgrest=SimpleNamespace())  # không có .session
    assert main._force_http1_session(sb) is False

    sb2 = SimpleNamespace(postgrest=SimpleNamespace(session="not-a-client"))
    assert main._force_http1_session(sb2) is False


def test_supabase_singleton_calls_force_http1(monkeypatch):
    """_supabase() phải gọi _force_http1_session đúng 1 lần cho instance mới."""
    import main
    import supabase

    main._sb_instance = None
    sentinel = object()
    called = {"n": 0, "arg": None}

    monkeypatch.setattr(supabase, "create_client",
                        lambda url, key: sentinel, raising=False)

    def _fake_force(sb):
        called["n"] += 1
        called["arg"] = sb
        return True

    monkeypatch.setattr(main, "_force_http1_session", _fake_force)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "eyJ" + "x" * 60)

    a = main._supabase()
    b = main._supabase()
    assert a is sentinel and b is sentinel
    assert called["n"] == 1, "chỉ override 1 lần khi tạo singleton"
    assert called["arg"] is sentinel
    main._sb_instance = None


def test_healthz_is_async():
    """/healthz phải là async def — sync def xếp hàng threadpool (40 slot);
    khi storm làm threads kẹt, health check trễ >5s → Render kill instance
    dù app còn sống (round 2 của storm 10/07, lần này 14-15/07)."""
    import main

    assert inspect.iscoroutinefunction(main.health)
