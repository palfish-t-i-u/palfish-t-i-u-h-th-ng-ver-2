"""Tests for bill_uploaded Zalo enqueue hook (best-effort, upload endpoint)."""
from payment_request_routes import _maybe_enqueue_bill_uploaded_zalo


class _FakeRpcResult:
    def execute(self):
        return None


class FakeSb:
    def __init__(self, fail: bool = False):
        self.calls = []
        self._fail = fail

    def rpc(self, name, params):
        self.calls.append((name, params))
        if self._fail:
            raise RuntimeError("boom")
        return _FakeRpcResult()


def test_paid_line_enqueues_rpc():
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})
    assert sb.calls == [("enqueue_bill_uploaded_zalo", {"p_line_id": "L1"})]


def test_non_paid_line_skips_rpc():
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "pending"})
    assert sb.calls == []


def test_rpc_error_never_breaks_upload():
    sb = FakeSb(fail=True)
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})  # must NOT raise
    assert sb.calls  # đã thử gọi


def test_allowlist_contains_bill_uploaded():
    from utils.zalo_message_builder import ZALO_ENABLED_EVENTS
    assert "bill_uploaded" in ZALO_ENABLED_EVENTS
    assert "payment_paid" in ZALO_ENABLED_EVENTS
