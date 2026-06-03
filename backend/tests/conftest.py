"""
Shared fixtures for backend audit verification tests.

Baseline commit: 8531f62f9d2db6de5244a77ef31e53a9fbd88ff4
These tests verify fixes for the 22 issues in docs/HANDOFF_BE_AUDIT_2026-06-03.md
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

REPO_ROOT = BACKEND_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture(autouse=True)
def _env_defaults(monkeypatch):
    """Ensure safe defaults so tests never hit real services."""
    monkeypatch.setenv("SUPABASE_URL", "http://fake-supabase.local")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
    monkeypatch.setenv("PAYOS_CLIENT_ID", "test-client")
    monkeypatch.setenv("PAYOS_API_KEY", "test-api-key")
    monkeypatch.setenv("PAYOS_CHECKSUM_KEY", "test-checksum-key-32chars-abcdef")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5173")
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.setenv("SYSTEM_ADMIN_EMAILS", "admin@test.com")


def _make_mock_supabase():
    """Create a mock supabase client with chainable query builder."""
    sb = MagicMock()

    def _chain_table(table_name):
        table = MagicMock()
        table.select.return_value = table
        table.insert.return_value = table
        table.update.return_value = table
        table.delete.return_value = table
        table.eq.return_value = table
        table.neq.return_value = table
        table.is_.return_value = table
        table.in_.return_value = table
        table.order.return_value = table
        table.limit.return_value = table
        table.range.return_value = table
        table.single.return_value = table
        table.execute.return_value = MagicMock(data=[], count=0)
        return table

    sb.table.side_effect = _chain_table
    sb.rpc.return_value = MagicMock(execute=MagicMock(return_value=MagicMock(data=1)))
    return sb


@pytest.fixture
def mock_supabase():
    return _make_mock_supabase()
