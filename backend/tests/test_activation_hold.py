"""Tests cho hold_activation / hold_note flow (Kích hoạt ngay / Chưa kích hoạt).

Unit-level: kiểm tra _serialize_ar và _enqueue_activation_request_created_dingtalk
mà không cần DB/Supabase client thật.
"""
import pytest
from unittest.mock import MagicMock, patch


# ─── _serialize_ar ─────────────────────────────────────────────────────────────

def _make_ar_row(**kwargs) -> dict:
    base = {
        "id": "AR-2026-0001",
        "pr_id": "PR-2026-0001",
        "customer_name": "Nguyễn A",
        "uids_data": [{"uid": "U1", "courses": [{"code": "CC-001", "name": "Gói A", "amount": 10_000_000}]}],
        "status": "pending_order",
        "created_at": "2026-07-21T10:00:00Z",
        "updated_at": "2026-07-21T10:00:00Z",
        "info_confirmed_at": None,
        "hold_activation": False,
        "hold_note": None,
    }
    base.update(kwargs)
    return base


def test_serialize_ar_includes_hold_false_by_default():
    """_serialize_ar trả hold_activation=False khi row không có cờ (đơn cũ)."""
    from activation_routes import _serialize_ar
    row = _make_ar_row()
    del row["hold_activation"]  # simulate cột chưa có (đơn cũ)
    out = _serialize_ar(row)
    assert out["hold_activation"] is False
    assert out["hold_note"] is None


def test_serialize_ar_includes_hold_true_with_note():
    """_serialize_ar trả hold_activation=True + hold_note khi row có cờ."""
    from activation_routes import _serialize_ar
    row = _make_ar_row(hold_activation=True, hold_note="PH chờ hè xong")
    out = _serialize_ar(row)
    assert out["hold_activation"] is True
    assert out["hold_note"] == "PH chờ hè xong"


def test_serialize_ar_hold_false_note_none():
    """_serialize_ar với hold_activation=False → hold_note=None."""
    from activation_routes import _serialize_ar
    row = _make_ar_row(hold_activation=False, hold_note=None)
    out = _serialize_ar(row)
    assert out["hold_activation"] is False
    assert out["hold_note"] is None


# ─── _enqueue_activation_request_created_dingtalk ─────────────────────────────

def _make_mock_sb(team="inhouse_1", active=True):
    """Trả mock Supabase client cơ bản cho DingTalk enqueue."""
    sb = MagicMock()
    # nhan_su_sale lookup
    staff_row = {"email": "sale@palfish.vn", "display_name": "Nguyễn Sale", "crm_name": "Sale A", "team": team}
    sb.table.return_value.select.return_value.ilike.return_value.limit.return_value.execute.return_value.data = [staff_row]
    # dingtalk_team_groups
    group_row = {"team_code": team, "is_active": active}
    # payment_lines (bill urls)
    return sb, staff_row


def test_dingtalk_enqueue_no_hold_no_hold_line():
    """hold_activation=False → message không có dòng PH CHƯA MUỐN."""
    from activation_routes import _enqueue_activation_request_created_dingtalk
    sb, _ = _make_mock_sb()

    # Setup chain for dingtalk_team_groups
    group_response = MagicMock()
    group_response.data = [{"team_code": "inhouse_1", "is_active": True}]
    # Setup chain for payment_lines
    lines_response = MagicMock()
    lines_response.data = []
    # Staff lookup
    staff_response = MagicMock()
    staff_response.data = [{"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}]

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb.table.side_effect = table_side

    saved_ar = {"id": "AR-H1", "customer_name": "Test", "uids_data": [], "is_test": False}
    pr = {"id": "PR-H1", "sale_email": "s@p.vn", "is_test": False, "name": "Test", "phone": "09",
          "country": "VN", "lead_source": None, "lead_channel": None, "target": 0, "received": 0}

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(sb, saved_ar, pr, hold_activation=False, hold_note=None)

    assert len(inserted_messages) == 1
    msg = inserted_messages[0]["message"]
    assert "CHƯA MUỐN" not in msg
    assert "⏸" not in msg


def test_dingtalk_enqueue_hold_true_adds_hold_line():
    """hold_activation=True → message có dòng ⏸ PH CHƯA MUỐN KÍCH HOẠT."""
    from activation_routes import _enqueue_activation_request_created_dingtalk
    sb, _ = _make_mock_sb()

    group_response = MagicMock()
    group_response.data = [{"team_code": "inhouse_1", "is_active": True}]
    lines_response = MagicMock()
    lines_response.data = []
    staff_response = MagicMock()
    staff_response.data = [{"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}]

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb.table.side_effect = table_side

    saved_ar = {"id": "AR-H2", "customer_name": "Test", "uids_data": [], "is_test": False}
    pr = {"id": "PR-H2", "sale_email": "s@p.vn", "is_test": False, "name": "Test", "phone": "09",
          "country": "VN", "lead_source": None, "lead_channel": None, "target": 0, "received": 0}

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(
            sb, saved_ar, pr, hold_activation=True, hold_note="PH chờ hè"
        )

    assert len(inserted_messages) == 1
    msg = inserted_messages[0]["message"]
    assert "⏸ PH CHƯA MUỐN TẠO GÓI HỌC" in msg
    assert "PH chờ hè" in msg


def test_dingtalk_enqueue_hold_true_no_note_no_note_line():
    """hold_activation=True nhưng hold_note=None → chỉ có dòng ⏸, không có 'Ghi chú:'."""
    from activation_routes import _enqueue_activation_request_created_dingtalk
    sb, _ = _make_mock_sb()

    group_response = MagicMock()
    group_response.data = [{"team_code": "inhouse_1", "is_active": True}]
    lines_response = MagicMock()
    lines_response.data = []
    staff_response = MagicMock()
    staff_response.data = [{"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}]

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb.table.side_effect = table_side

    saved_ar = {"id": "AR-H3", "customer_name": "Test", "uids_data": [], "is_test": False}
    pr = {"id": "PR-H3", "sale_email": "s@p.vn", "is_test": False, "name": "Test", "phone": "09",
          "country": "VN", "lead_source": None, "lead_channel": None, "target": 0, "received": 0}

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(
            sb, saved_ar, pr, hold_activation=True, hold_note=None
        )

    assert len(inserted_messages) == 1
    msg = inserted_messages[0]["message"]
    assert "⏸ PH CHƯA MUỐN TẠO GÓI HỌC" in msg
    assert "Ghi chú:" not in msg


# ─── _save_active_request guard: hold_note bị ép None khi hold=False ─────────

def test_save_active_request_clears_note_when_hold_false():
    """hold_activation=False + note → BE ép hold_note=None (guardrail mục 4.1)."""
    from activation_routes import _save_active_request
    import sys

    # Stub out toàn bộ các guard functions mà _save_active_request gọi
    with patch("activation_routes._fetch_payment_request", return_value=None), \
         patch("activation_routes._next_ar_id", return_value="AR-STUB-0001"), \
         patch("activation_routes._assign_course_codes", return_value=[]), \
         patch("activation_routes._assert_course_names_present", return_value=None), \
         patch("activation_routes._assert_uids_have_uid", return_value=None), \
         patch("activation_routes._assert_uids_data_order_ids_unique", return_value=None), \
         patch("activation_routes._derive_status", return_value="pending_order"), \
         patch("activation_routes._writeback_pr_uid_from_ar", return_value=None), \
         patch("activation_routes._enqueue_activation_request_created_zalo", return_value=None), \
         patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_dt:

        sb = MagicMock()
        insert_data = {"id": "AR-STUB-0001", "pr_id": None, "status": "pending_order"}
        sb.table.return_value.insert.return_value.execute.return_value.data = [insert_data]

        saved, pr = _save_active_request(
            sb,
            pr_id=None,
            uids_in=[],
            hold_activation=False,
            hold_note="note mồ côi",
        )
        # hold_activation=False → _hold_note phải là None
        call_kwargs = mock_dt.call_args
        assert call_kwargs.kwargs.get("hold_note") is None
