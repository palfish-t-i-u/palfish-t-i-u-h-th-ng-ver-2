import base64
import hashlib
import hmac
import urllib.parse
import pytest


def test_compute_signature_matches_dingtalk_spec():
    import dingtalk_notifier

    timestamp = "1700000000000"
    secret = "SECabc123"
    sign = dingtalk_notifier.compute_signature(timestamp, secret)

    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    expected_raw = hmac.new(secret.encode("utf-8"), string_to_sign, hashlib.sha256).digest()
    expected = base64.b64encode(expected_raw).decode("utf-8")  # raw base64, no quote_plus

    assert sign == expected


class _FakeResp:
    def __init__(self, status: int, body: dict):
        self.status_code = status
        self._body = body
        self.text = str(body)

    def json(self) -> dict:
        return self._body


class _FakeClient:
    def __init__(self, responses):
        self.calls = []
        self._responses = list(responses)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, *, json=None, headers=None, **_):
        self.calls.append({"url": url, "json": json, "headers": headers})
        return self._responses.pop(0)


def test_send_text_to_group_success(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(200, {"errcode": 0, "errmsg": "ok"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)
    monkeypatch.setattr(dingtalk_notifier.time, "time", lambda: 1700000000.123)

    msg_id = dingtalk_notifier.send_text_to_group(
        webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
        secret="SECxyz",
        message="hello",
    )

    assert msg_id  # non-empty surrogate id
    call = fake.calls[0]
    assert "timestamp=1700000000123" in call["url"]
    # verify sign is correctly percent-encoded (urlencode encodes + as %2B, etc.)
    expected_sign = dingtalk_notifier.compute_signature("1700000000123", "SECxyz")
    encoded_sign = urllib.parse.quote_plus(expected_sign)
    assert f"sign={encoded_sign}" in call["url"]
    assert call["json"] == {"msgtype": "text", "text": {"content": "hello"}}
    assert call["headers"]["Content-Type"] == "application/json"


def test_send_text_raises_on_errcode(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(200, {"errcode": 310000, "errmsg": "sign not match"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_text_to_group(
            webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
            secret="SECxyz",
            message="hello",
        )
    assert exc.value.dingtalk_errcode == 310000


def test_send_text_raises_on_http_error(monkeypatch):
    import dingtalk_notifier

    fake = _FakeClient([_FakeResp(500, {"errmsg": "boom"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_text_to_group(
            webhook_url="https://oapi.dingtalk.com/robot/send?access_token=TKN",
            secret="SECxyz",
            message="hello",
        )
    assert exc.value.status_code == 500
