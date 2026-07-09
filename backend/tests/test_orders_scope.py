"""/orders scope filter must be applied in SQL BEFORE the row limit.

Regression guard: a previous edit applied .range() first and filtered
allowed_creators in Python afterwards — sale users with no orders in the
newest N rows saw an empty list."""

from types import SimpleNamespace


class _Query:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def select(self, *args, **kwargs):
        self.calls.append(("select", args))
        return self

    def or_(self, arg):
        self.calls.append(("or_", arg))
        return self

    def order(self, *args, **kwargs):
        self.calls.append(("order", args))
        return self

    def range(self, start, end):
        self.calls.append(("range", (start, end)))
        return self

    def execute(self):
        self.calls.append(("execute", None))
        return SimpleNamespace(data=self.rows)


class _SB:
    def __init__(self, rows):
        self.query = _Query(rows)

    def table(self, name):
        assert name == "don_hang"
        return self.query


def _call_names(query):
    return [name for name, _ in query.calls]


def test_ops_no_creator_filter_but_limited():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=None)

    names = _call_names(sb.query)
    assert "or_" not in names
    assert ("range", (0, 999)) in sb.query.calls


def test_sale_filter_in_sql_before_range():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=["sale@x.com"])

    names = _call_names(sb.query)
    assert "or_" in names, "creator filter must run in SQL"
    assert names.index("or_") < names.index("range"), "filter must come BEFORE limit"

    or_arg = next(arg for name, arg in sb.query.calls if name == "or_")
    assert "created_by.is.null" in or_arg, "legacy rows without creator stay visible"
    assert '""' in or_arg, "empty-string creator stays visible"
    assert '"sale@x.com"' in or_arg


def test_creator_emails_are_sanitized_and_lowercased():
    from main import _list_orders_supabase

    sb = _SB([])
    _list_orders_supabase(sb, allowed_creators=['Sa"le,@X.com'])

    or_arg = next(arg for name, arg in sb.query.calls if name == "or_")
    assert '"sale@x.com"' in or_arg
    assert 'Sa"' not in or_arg


def test_rows_are_mapped_to_orders():
    from main import _list_orders_supabase

    rows = [{"id": "1", "ma_don_hang": "KH001", "created_by": "a@x.com",
             "khach_hang": {"ho_ten": "Khach A"}}]
    sb = _SB(rows)
    out = _list_orders_supabase(sb, allowed_creators=None)

    assert len(out) == 1
    assert out[0]["maDonHang"] == "KH001"
    assert out[0]["tenKhach"] == "Khach A"


def test_created_by_normalized_on_write():
    """don_hang.created_by must be stored stripped + lowercased so the SQL
    scope filter matches exactly."""
    import inspect
    import main

    src = inspect.getsource(main._create_order_supabase)
    assert 'body.createdBy' in src
    assert '.strip().lower()' in src, "created_by must be normalized at write time"
