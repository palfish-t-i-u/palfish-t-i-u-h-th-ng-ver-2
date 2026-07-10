"""Health-check timeout storm + bill-column fixes (2026-07-10).

Plan: docs/superpowers/plans/2026-07-10-fix-health-check-storm-bill-column.md
Sự cố: /healthz ping DB + route danh sách storm 111 lượt Storage-list → Render
giết instance vì health check >5s. Fix: /healthz không DB; route đọc cột DB.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_healthz_never_touches_db(monkeypatch):
    """Liveness probe của Render phải trả lời ngay, không gọi _supabase()."""
    import main

    called = {"n": 0}

    def _boom():
        called["n"] += 1
        raise AssertionError("/healthz phải KHÔNG gọi _supabase()")

    monkeypatch.setattr(main, "_supabase", _boom)
    res = main.health()
    assert res["status"] == "ok"
    assert called["n"] == 0
