"""Tests for AR creation bill guard and Zalo allowlist."""
import pytest
from unittest.mock import MagicMock, patch


def test_allowlist_skips_zalo_enqueue():
    """Chỉ payment_paid còn trên Zalo; activation events moved off (9-10/7),
    bill_uploaded tắt 17/7 (sale feedback: gây nhầm lẫn)."""
    from utils.zalo_message_builder import ZALO_ENABLED_EVENTS
    assert "activation_request_created" not in ZALO_ENABLED_EVENTS
    assert "activation_urgent_reminder" not in ZALO_ENABLED_EVENTS
    assert "course_activated" not in ZALO_ENABLED_EVENTS
    assert "bill_uploaded" not in ZALO_ENABLED_EVENTS
    assert "payment_paid" in ZALO_ENABLED_EVENTS


def test_assert_all_paid_lines_have_bill_raises_when_missing():
    """Should raise 422 when a paid line has no bill."""
    from pr_guards import assert_all_paid_lines_have_bill
    from fastapi import HTTPException

    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"id": "line-1", "amount": 2000000, "bill_image": "", "bill_images": None},
        {"id": "line-2", "amount": 16320000, "bill_image": "https://example.com/bill.jpg", "bill_images": None},
    ]
    with pytest.raises(HTTPException) as exc_info:
        assert_all_paid_lines_have_bill(sb, {"id": "pr-1"})
    assert exc_info.value.status_code == 422
    detail = exc_info.value.detail
    assert detail["code"] == "MISSING_BILLS"
    assert len(detail["missing_lines"]) == 1
    assert detail["missing_lines"][0]["line_id"] == "line-1"


def test_assert_all_paid_lines_have_bill_passes_when_all_have_bill():
    """Should not raise when all paid lines have a bill."""
    from pr_guards import assert_all_paid_lines_have_bill

    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"id": "line-1", "amount": 2000000, "bill_image": "https://example.com/bill1.jpg", "bill_images": None},
        {"id": "line-2", "amount": 16320000, "bill_image": "", "bill_images": ["https://example.com/bill2.jpg"]},
    ]
    # Should not raise
    assert_all_paid_lines_have_bill(sb, {"id": "pr-1"})


def test_assert_all_paid_lines_have_bill_no_op_when_no_pr_id():
    """Should be a no-op when PR has no id."""
    from pr_guards import assert_all_paid_lines_have_bill
    sb = MagicMock()
    assert_all_paid_lines_have_bill(sb, {})
    sb.table.assert_not_called()
