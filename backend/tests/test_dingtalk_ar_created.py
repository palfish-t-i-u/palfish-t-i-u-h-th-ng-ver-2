"""DingTalk activation_request_created producer — unit tests.

Mirror TestEnqueueActivationRequestCreatedZalo nhưng cho DingTalk:
RAW team routing (không canonical), KHÔNG OPS fallback, kèm ảnh bill, best-effort.
"""
import hashlib
import uuid
from unittest.mock import MagicMock

import activation_routes
from env_utils import dingtalk_event_enabled


def test_dingtalk_event_enabled_default_all_on(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    assert dingtalk_event_enabled("activation_request_created") is True
    assert dingtalk_event_enabled("course_activated") is True


def test_dingtalk_event_enabled_denylist(monkeypatch):
    monkeypatch.setenv(
        "DINGTALK_DISABLED_EVENTS",
        "activation_request_created, activation_urgent_reminder",
    )
    assert dingtalk_event_enabled("activation_request_created") is False
    assert dingtalk_event_enabled("activation_urgent_reminder") is False
    assert dingtalk_event_enabled("course_activated") is True   # G4


def _mock_chain_table(data):
    t = MagicMock()
    for m in ("select", "eq", "ilike", "order", "limit"):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _build_dt_sb(*, staff_rows=None, group_rows=None, line_rows=None, insert_side_effect=None):
    outbox_calls = []

    def _outbox_insert(payload):
        if insert_side_effect is not None:
            raise insert_side_effect
        outbox_calls.append(payload)
        m = MagicMock()
        m.execute.return_value = MagicMock(data=[payload])
        return m

    outbox_table = MagicMock()
    outbox_table.insert = _outbox_insert

    tables = {
        "nhan_su_sale": _mock_chain_table(staff_rows or []),
        "dingtalk_team_groups": _mock_chain_table(group_rows or []),
        "payment_lines": _mock_chain_table(line_rows or []),
        "dingtalk_outbox": outbox_table,
    }
    sb = MagicMock()
    sb.table.side_effect = lambda name: tables.get(name, MagicMock())
    return sb, outbox_calls


def _sample_saved_ar(**overrides):
    base = {
        "id": "AR-2026-9001",
        "is_test": False,
        "customer_name": None,
        "uids_data": [
            {"uid": "123", "phone": "84-900000000",
             "courses": [{"name": "Gói A", "amount": 5_000_000}]}
        ],
    }
    base.update(overrides)
    return base


def _sample_pr(**overrides):
    base = {
        "id": "PR-2026-9001",
        "is_test": False,
        "sale_email": "sale@test.com",
        "name": None,
        "child_name": "Bé An",
        "phone": None,
        "lead_source": None,
        "lead_channel": "Facebook",
        "tong_tien_phai_thu": 5_000_000,
    }
    base.update(overrides)
    return base


class TestEnqueueActivationRequestCreatedDingtalk:
    def test_happy_path_raw_team_with_bill_image(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "display_name": "Sale A",
                         "crm_name": "Sale A CRM", "team": "HN Offline Store"}],
            group_rows=[{"team_code": "HN Offline Store", "is_active": True}],
            line_rows=[{"bill_image": "https://x/bill.jpg", "bill_images": None}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert len(calls) == 1
        p = calls[0]
        assert p["event_type"] == "activation_request_created"
        assert p["source_table"] == "active_requests"
        assert p["team_code"] == "HN Offline Store"          # RAW, không phải "Offline"
        assert p["image_url"] == "https://x/bill.jpg"
        assert p["source_id"] == str(uuid.UUID(hashlib.md5(b"AR-2026-9001").hexdigest()))
        assert "🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-9001" in p["message"]
        assert "Bé An, Gói A" in p["message"]

    def test_falls_back_to_bill_images_array(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[{"bill_image": None, "bill_images": ["https://x/a.jpg", "https://x/b.jpg"]}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls[0]["image_url"] == "https://x/b.jpg"

    def test_no_bill_sends_null_image(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert len(calls) == 1
        assert calls[0]["image_url"] is None

    def test_skip_when_team_has_no_group_no_ops_fallback(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "HCM (Online)"}],
            group_rows=[],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_skip_when_group_inactive(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": False}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_skip_when_pr_is_test(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr(is_test=True))
        assert calls == []

    def test_skip_when_saved_ar_is_test(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(is_test=True), _sample_pr())
        assert calls == []

    def test_skip_when_pr_is_none(self):
        sb, calls = _build_dt_sb()
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), None)
        assert calls == []

    def test_skip_when_sale_has_no_team(self):
        sb, calls = _build_dt_sb(staff_rows=[{"email": "sale@test.com", "team": None}])
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []

    def test_insert_error_is_non_fatal(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            insert_side_effect=Exception("boom"),
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        assert calls == []
