"""rbac must reuse one module-level httpx client for JWT lookups —
per-request clients redo the TLS handshake on every authenticated call."""


class _FakeRes:
    def __init__(self, status_code, payload=None):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeHTTP:
    def __init__(self, res):
        self.res = res
        self.calls = []

    def get(self, url, headers=None):
        self.calls.append({"url": url, "headers": headers})
        return self.res


def test_module_has_shared_client():
    import httpx
    import rbac

    assert isinstance(rbac._http, httpx.Client)


def test_auth_user_uses_shared_client(monkeypatch):
    import rbac

    fake = _FakeHTTP(_FakeRes(200, {"email": "a@x.com"}))
    monkeypatch.setattr(rbac, "_http", fake)

    out = rbac._auth_user_from_jwt("some-token")

    assert out == {"email": "a@x.com"}
    assert len(fake.calls) == 1
    assert fake.calls[0]["url"].endswith("/auth/v1/user")
    assert fake.calls[0]["headers"]["Authorization"] == "Bearer some-token"


def test_auth_user_non_200_returns_none(monkeypatch):
    import rbac

    fake = _FakeHTTP(_FakeRes(401))
    monkeypatch.setattr(rbac, "_http", fake)

    assert rbac._auth_user_from_jwt("bad-token") is None
