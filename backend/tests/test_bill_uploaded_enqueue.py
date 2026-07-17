"""Tests for bill_uploaded Zalo enqueue hook.

TẮT 17/7 (sale feedback): bill_uploaded bỏ khỏi ZALO_ENABLED_EVENTS → hook no-op,
không gọi RPC. SQL fn cũng đã no-op (migration 2026-07-17). Zalo chỉ còn tin báo tiền.
"""
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


def test_paid_line_skips_rpc_when_disabled():
    """bill_uploaded đã tắt → dù line paid vẫn KHÔNG gọi RPC."""
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})
    assert sb.calls == []


def test_non_paid_line_skips_rpc():
    sb = FakeSb()
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "pending"})
    assert sb.calls == []


def test_never_breaks_upload():
    """Hook không bao giờ raise (best-effort), kể cả khi tắt."""
    sb = FakeSb(fail=True)
    _maybe_enqueue_bill_uploaded_zalo(sb, {"id": "L1", "status": "paid"})  # must NOT raise
    assert sb.calls == []  # tắt → không thử gọi


def test_allowlist_excludes_bill_uploaded():
    from utils.zalo_message_builder import ZALO_ENABLED_EVENTS
    assert "bill_uploaded" not in ZALO_ENABLED_EVENTS
    assert "payment_paid" in ZALO_ENABLED_EVENTS
