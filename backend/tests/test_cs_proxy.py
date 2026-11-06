"""Test GET /api/cs-proxy — proxy cho bot first-lesson gọi CS app qua Render."""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("PALFISH_CS_SYNC_KEY", "test-key-123")
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "fake")
    import main as main_mod
    return TestClient(main_mod.app, raise_server_exceptions=False)


class TestCsProxy:
    def test_missing_key_returns_403(self, client):
        resp = client.get("/api/cs-proxy", params={"resource": "gvcn_sync", "uids": "U1"})
        assert resp.status_code == 403

    def test_wrong_key_returns_403(self, client):
        resp = client.get(
            "/api/cs-proxy",
            params={"resource": "gvcn_sync", "uids": "U1"},
            headers={"x-cs-sync-key": "wrong"},
        )
        assert resp.status_code == 403

    def test_unsupported_resource_returns_400(self, client):
        resp = client.get(
            "/api/cs-proxy",
            params={"resource": "other_thing", "uids": "U1"},
            headers={"x-cs-sync-key": "test-key-123"},
        )
        assert resp.status_code == 400

    def test_empty_uids_returns_empty(self, client):
        resp = client.get(
            "/api/cs-proxy",
            params={"resource": "gvcn_sync", "uids": ""},
            headers={"x-cs-sync-key": "test-key-123"},
        )
        assert resp.status_code == 200
        assert resp.json() == {"assignments": []}

    @patch("cs_gvcn_client.fetch_gvcn")
    def test_returns_assignments_format(self, mock_fetch, client):
        mock_fetch.return_value = {"U1": "Tran Thu Ha", "U2": "Nguyen Van B"}
        resp = client.get(
            "/api/cs-proxy",
            params={"resource": "gvcn_sync", "uids": "U1,U2,U3"},
            headers={"x-cs-sync-key": "test-key-123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert set(a["uid"] for a in data["assignments"]) == {"U1", "U2"}
        assert {a["uid"]: a["gvcn"] for a in data["assignments"]} == {
            "U1": "Tran Thu Ha",
            "U2": "Nguyen Van B",
        }
        mock_fetch.assert_called_once_with(["U1", "U2", "U3"])
