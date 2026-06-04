from __future__ import annotations

import importlib

from fastapi import FastAPI
from fastapi.testclient import TestClient


class _CaptureTable:
    def __init__(self) -> None:
        self.upsert_payloads: list[dict] = []

    def upsert(self, payload):
        self.upsert_payloads.append(payload)
        return self

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        return type("Result", (), {"data": [], "count": 0})()


class _CaptureSupabase:
    def __init__(self) -> None:
        self.crm_tokens = _CaptureTable()

    def table(self, name: str):
        if name == "crm_tokens":
            return self.crm_tokens
        raise AssertionError(f"Unexpected table access: {name}")


def _build_client(crm_mod, sb: _CaptureSupabase) -> TestClient:
    app = FastAPI()
    crm_mod.register_crm_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


def test_encrypt_decrypt_round_trip(monkeypatch):
    monkeypatch.setenv("CRM_ENCRYPT_KEY", "tr5kfdBVJmvY74BczWeh7o2X9A1_q8wvtaqXC7MZeXQ=")

    import crm_routes as crm_mod

    crm_mod = importlib.reload(crm_mod)
    raw = '{"cookie":"token=abc123","headers":{"token":"abc123"}}'

    encrypted = crm_mod._encrypt_token(raw)

    assert encrypted != raw
    assert crm_mod._decrypt_token(encrypted) == raw


def test_extension_ingest_requires_secret(monkeypatch):
    monkeypatch.setenv("CRM_ENCRYPT_KEY", "tr5kfdBVJmvY74BczWeh7o2X9A1_q8wvtaqXC7MZeXQ=")
    monkeypatch.setenv("CRM_EXTENSION_INGEST_TOKEN", "secret-token")

    import crm_routes as crm_mod

    crm_mod = importlib.reload(crm_mod)
    sb = _CaptureSupabase()
    client = _build_client(crm_mod, sb)

    resp = client.post(
        "/system/update-crm-token/extension",
        json={"cookie_str": '{"cookie":"token=abc123"}'},
    )

    assert resp.status_code == 401
    assert sb.crm_tokens.upsert_payloads == []


def test_extension_ingest_encrypts_before_store(monkeypatch):
    monkeypatch.setenv("CRM_ENCRYPT_KEY", "tr5kfdBVJmvY74BczWeh7o2X9A1_q8wvtaqXC7MZeXQ=")
    monkeypatch.setenv("CRM_EXTENSION_INGEST_TOKEN", "secret-token")

    import crm_routes as crm_mod

    crm_mod = importlib.reload(crm_mod)
    sb = _CaptureSupabase()
    client = _build_client(crm_mod, sb)
    payload = '{"cookie":"token=abc123","headers":{"token":"abc123"}}'

    resp = client.post(
        "/system/update-crm-token/extension",
        headers={"X-CRM-EXT-TOKEN": "secret-token"},
        json={"cookie_str": payload},
    )

    assert resp.status_code == 200
    assert len(sb.crm_tokens.upsert_payloads) == 1
    stored = sb.crm_tokens.upsert_payloads[0]["cookie_value"]
    assert stored != payload
    assert crm_mod._decrypt_token(stored) == payload
