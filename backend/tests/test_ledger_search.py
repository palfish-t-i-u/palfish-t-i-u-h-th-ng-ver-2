"""Tests for ledger search OR-filter construction."""
from unittest.mock import MagicMock


def _make_sb_mock(rows=None):
    """Build a Supabase client mock that returns `rows` and tracks method calls."""
    m = MagicMock()
    result = MagicMock()
    result.data = rows or []
    result.count = len(rows or [])
    # Every chained method returns the same builder so we can inspect calls
    builder = MagicMock()
    builder.execute.return_value = result
    builder.range.return_value = builder
    builder.limit.return_value = builder
    builder.order.return_value = builder
    builder.gte.return_value = builder
    builder.lte.return_value = builder
    builder.eq.return_value = builder
    builder.or_.return_value = builder
    m.table.return_value = MagicMock(select=MagicMock(return_value=builder))
    return m, builder


def test_ledger_query_without_search_has_no_or_filter():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", from_date="2026-01-01", to_date="2026-01-31")
    builder.or_.assert_not_called()


def test_ledger_query_with_search_adds_or_filter():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", search="0912")
    builder.or_.assert_called_once()
    or_arg = builder.or_.call_args[0][0]
    assert "ten_khach.ilike.*0912*" in or_arg
    assert "sdt.ilike.*0912*" in or_arg
    assert "uid.ilike.*0912*" in or_arg
    assert "sale_crm_name.ilike.*0912*" in or_arg
    assert "crm_order_id.ilike.*0912*" in or_arg
    assert "ma_don_hang.ilike.*0912*" in or_arg
    assert "info_code.ilike.*0912*" in or_arg


def test_ledger_query_empty_search_is_ignored():
    from revenue_routes import _ledger_query

    sb, builder = _make_sb_mock()
    _ledger_query(sb, "*", search="  ")
    builder.or_.assert_not_called()
