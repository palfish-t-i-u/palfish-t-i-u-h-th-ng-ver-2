import pytest
from unittest.mock import MagicMock, patch
from payment_request_routes import (
    _line_net,
    _sum_paid_amount,
    recompute_payment_request_totals,
)

def test_line_net_qr():
    """method=qr -> return amount"""
    line = {"method": "qr", "amount": 1000, "verified_received": 900}
    assert _line_net(line) == 1000

def test_line_net_card_verified():
    """method=card, verified_received=19160000 -> return 19160000"""
    line = {"method": "card", "amount": 20000000, "verified_received": 19160000}
    assert _line_net(line) == 19160000

def test_line_net_installment_verified():
    """method=installment, verified_received=18000000 -> return 18000000"""
    line = {"method": "installment", "amount": 18544000, "verified_received": 18000000}
    assert _line_net(line) == 18000000

def test_line_net_installment_not_verified():
    """method=installment, verified_received=None -> return amount"""
    line = {"method": "installment", "amount": 5000, "verified_received": None}
    assert _line_net(line) == 5000

def test_line_net_card_verified_zero_or_empty():
    """method=card, verified_received=0 or "" -> should fallback to amount (gross)"""
    line1 = {"method": "card", "amount": 2000, "verified_received": 0}
    assert _line_net(line1) == 2000
    
    line2 = {"method": "card", "amount": 3000, "verified_received": ""}
    assert _line_net(line2) == 3000

def test_sum_paid_amount_mixed():
    """hỗn hợp qr + card verified + installment unverified -> tổng net đúng"""
    lines = [
        {"method": "qr", "amount": 1000, "verified_received": 900, "status": "paid"},
        {"method": "card", "amount": 20000, "verified_received": 19160, "status": "paid"},
        {"method": "installment", "amount": 5000, "verified_received": None, "status": "paid"},
        {"method": "card", "amount": 30000, "verified_received": 28000, "status": "pending"}, # not paid, ignore
    ]
    # Expected: 1000 (qr) + 19160 (card verified) + 5000 (installment unverified) = 25160
    assert _sum_paid_amount(lines) == 25160

def test_state_flip_after_verify():
    """PR gross >= target (over tạm) -> kế toán set net < target -> state=short"""
    sb = MagicMock()
    
    # 1. Mock select payment_requests
    pr_row = {
        "id": "PR-TEST",
        "target": 18544000,
        "received": 19600000,
        "state": "over",
    }
    sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [pr_row]
    
    # 2. Mock select payment_lines
    # Gross sum is 19600000, which is >= target (18544000). But net is 18160000 (which is < target).
    lines_data = [
        {"amount": 19600000, "status": "paid", "method": "card", "verified_received": 18160000}
    ]
    
    # We need sb.table("payment_lines").select(...).eq(...).execute() to return lines_data
    # Let's mock this carefully.
    def mock_table(name):
        mock_query = MagicMock()
        if name == "payment_requests":
            mock_query.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [pr_row]
            mock_query.update.return_value.eq.return_value.execute.return_value.data = [{**pr_row, "received": 18160000, "state": "short"}]
        elif name == "payment_lines":
            mock_query.select.return_value.eq.return_value.execute.return_value.data = lines_data
        return mock_query
        
    sb.table.side_effect = mock_table
    
    # Call recompute
    with patch("revenue_routes.sync_ledger_for_pr") as mock_sync:
        res = recompute_payment_request_totals(sb, "PR-TEST")
        
        # Verify
        assert res["received"] == 18160000
        assert res["state"] == "short"
        # Since state is short, it should not trigger sync_ledger_for_pr (which only triggers for done/over)
        mock_sync.assert_not_called()

def test_qr_regression():
    """PR thuần CK -> hành vi y hệt cũ"""
    sb = MagicMock()
    
    pr_row = {
        "id": "PR-QR-REGRESSION",
        "target": 10000,
        "received": 10000,
        "state": "done",
    }
    lines_data = [
        {"amount": 10000, "status": "paid", "method": "qr", "verified_received": None}
    ]
    
    def mock_table(name):
        mock_query = MagicMock()
        if name == "payment_requests":
            mock_query.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [pr_row]
            mock_query.update.return_value.eq.return_value.execute.return_value.data = [{**pr_row, "received": 10000, "state": "done"}]
        elif name == "payment_lines":
            mock_query.select.return_value.eq.return_value.execute.return_value.data = lines_data
        return mock_query
        
    sb.table.side_effect = mock_table
    
    with patch("revenue_routes.sync_ledger_for_pr") as mock_sync:
        res = recompute_payment_request_totals(sb, "PR-QR-REGRESSION")
        assert res["received"] == 10000
        assert res["state"] == "done"
        mock_sync.assert_called_once_with(sb, "PR-QR-REGRESSION")
