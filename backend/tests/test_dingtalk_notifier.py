import json
import httpx
import pytest


class _RaisingClient:
    """Fake httpx.Client whose send POST raises a given exception (token POST OK)."""

    def __init__(self, exc):
        self._exc = exc
        self._first = True

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, *, json=None, headers=None, **_):
        if "oauth2" in url:
            return _FakeResp(200, {"accessToken": "TKN_123", "expireIn": 7200})
        raise self._exc


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


TOKEN_RESP = _FakeResp(200, {"accessToken": "TKN_123", "expireIn": 7200})
SEND_OK_RESP = _FakeResp(200, {"processQueryKey": "pqk-abc"})


def _reset_token_cache():
    import dingtalk_notifier
    dingtalk_notifier._cached_token = ""
    dingtalk_notifier._token_expires_at = 0


@pytest.fixture(autouse=True)
def _set_dingtalk_env(monkeypatch):
    monkeypatch.setenv("DINGTALK_CLIENT_ID", "test_cid")
    monkeypatch.setenv("DINGTALK_CLIENT_SECRET", "test_csecret")
    monkeypatch.setenv("DINGTALK_ROBOT_CODE", "test_rc")


def test_get_access_token_success(monkeypatch):
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    token = dingtalk_notifier.get_access_token(client_id="CID", client_secret="CSE")
    assert token == "TKN_123"
    assert fake.calls[0]["json"] == {"appKey": "CID", "appSecret": "CSE"}


def test_send_group_message_text(monkeypatch):
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, SEND_OK_RESP])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    msg_id = dingtalk_notifier.send_group_message(
        open_conversation_id="cid123",
        message="hello",
        robot_code="RC",
    )

    assert msg_id == "pqk-abc"
    send_call = fake.calls[1]
    assert send_call["headers"]["x-acs-dingtalk-access-token"] == "TKN_123"
    body = send_call["json"]
    assert body["msgKey"] == "sampleText"
    assert body["robotCode"] == "RC"
    assert body["openConversationId"] == "cid123"
    assert json.loads(body["msgParam"]) == {"content": "hello"}


def test_send_group_message_markdown(monkeypatch):
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, SEND_OK_RESP])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    dingtalk_notifier.send_group_message(
        open_conversation_id="cid123",
        message="# heading",
        title="Test Title",
        robot_code="RC",
    )

    body = fake.calls[1]["json"]
    assert body["msgKey"] == "sampleMarkdown"
    params = json.loads(body["msgParam"])
    assert params["title"] == "Test Title"
    assert params["text"] == "# heading"


def test_send_raises_on_http_error(monkeypatch):
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, _FakeResp(500, {"errmsg": "boom"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_group_message(
            open_conversation_id="cid123",
            message="hello",
            robot_code="RC",
        )
    assert exc.value.status_code == 500


def test_send_5xx_with_process_key_is_success(monkeypatch):
    """Ambiguous 5xx that STILL carries processQueryKey = message was delivered.

    Return the key as success instead of raising — else the worker retries and
    posts a DUPLICATE (the delivered-but-503 bug). Async send: key = enqueued.
    """
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, _FakeResp(503, {"processQueryKey": "pqk-503"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    msg_id = dingtalk_notifier.send_group_message(
        open_conversation_id="cid123",
        message="hello",
        robot_code="RC",
    )
    assert msg_id == "pqk-503"


def test_send_raises_on_empty_fields():
    import dingtalk_notifier

    with pytest.raises(dingtalk_notifier.DingTalkAPIError, match="open_conversation_id"):
        dingtalk_notifier.send_group_message(open_conversation_id="", message="hi", robot_code="RC")

    with pytest.raises(dingtalk_notifier.DingTalkAPIError, match="message"):
        dingtalk_notifier.send_group_message(open_conversation_id="cid", message="", robot_code="RC")


def test_token_caching(monkeypatch):
    import dingtalk_notifier
    _reset_token_cache()

    call_count = 0
    original_responses = [
        TOKEN_RESP, SEND_OK_RESP,
        SEND_OK_RESP,
    ]
    fake = _FakeClient(original_responses)
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    dingtalk_notifier.send_group_message(
        open_conversation_id="cid1", message="a", robot_code="RC",
    )
    dingtalk_notifier.send_group_message(
        open_conversation_id="cid2", message="b", robot_code="RC",
    )

    token_calls = [c for c in fake.calls if "oauth2" in c["url"]]
    assert len(token_calls) == 1


def test_send_5xx_without_key_is_ambiguous_not_retryable(monkeypatch):
    """5xx WITH a body but NO processQueryKey = request reached DingTalk's async
    gateway; the message may already be enqueued. Must raise the AMBIGUOUS type so
    the worker treats it as terminal (no retry → no duplicate)."""
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, _FakeResp(503, {"code": "ServiceUnavailable"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAmbiguousDeliveryError) as exc:
        dingtalk_notifier.send_group_message(
            open_conversation_id="cid123", message="hello", robot_code="RC",
        )
    assert exc.value.status_code == 503


def test_send_4xx_is_retryable_not_ambiguous(monkeypatch):
    """4xx = genuine rejection (bad token/param), NOT enqueued → retry is safe.
    Must NOT be the ambiguous type (else it'd never retry)."""
    import dingtalk_notifier
    _reset_token_cache()

    fake = _FakeClient([TOKEN_RESP, _FakeResp(400, {"code": "InvalidParameter"})])
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_group_message(
            open_conversation_id="cid123", message="hello", robot_code="RC",
        )
    assert not isinstance(exc.value, dingtalk_notifier.DingTalkAmbiguousDeliveryError)
    assert exc.value.status_code == 400


def test_send_read_timeout_is_ambiguous(monkeypatch):
    """Read timeout = request sent, response lost → async enqueue may have happened
    → ambiguous, terminal (no retry)."""
    import dingtalk_notifier
    _reset_token_cache()

    fake = _RaisingClient(httpx.ReadTimeout("timed out"))
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAmbiguousDeliveryError):
        dingtalk_notifier.send_group_message(
            open_conversation_id="cid123", message="hello", robot_code="RC",
        )


def test_send_connect_error_is_retryable(monkeypatch):
    """Connect error = never reached DingTalk → definitely not delivered → retry safe.
    Must NOT be ambiguous."""
    import dingtalk_notifier
    _reset_token_cache()

    fake = _RaisingClient(httpx.ConnectError("refused"))
    monkeypatch.setattr(dingtalk_notifier.httpx, "Client", lambda **_: fake)

    with pytest.raises(dingtalk_notifier.DingTalkAPIError) as exc:
        dingtalk_notifier.send_group_message(
            open_conversation_id="cid123", message="hello", robot_code="RC",
        )
    assert not isinstance(exc.value, dingtalk_notifier.DingTalkAmbiguousDeliveryError)
