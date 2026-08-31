"""DingTalk edit-resend — sale sửa AR đã báo tự bắn tin 'cập nhật' (chị Hiền 12/8).

Xem docs/plans/PLAN_DINGTALK_EDIT_RESEND_2026-08-13.md.

- G2-T1: _ar_dingtalk_content_key (pure) — đúng field nào đổi mới bắn tin.
- G2-T2/T3/T4: wiring qua PATCH /active-requests/{ar_id} (có bắn / không bắn / info_confirmed).
- G2-T5: nhãn "🔄 SALE VỪA CẬP NHẬT..." chỉ dán khi source_suffix bắt đầu bằng ":edit:".
"""
from __future__ import annotations

import contextlib
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from activation_routes import _ar_dingtalk_content_key, _maybe_enqueue_ar_edit_on_pr_change, register_activation_routes


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_ar_row(**kwargs) -> dict:
    base = {
        "id": "AR-2026-9101",
        "pr_id": "PR-2026-9101",
        "customer_name": "KH Test",
        "uids_data": [{
            "uid": "UID-1",
            "name": None,
            "phone": "0900000000",
            "country": "VN",
            "courses": [{
                "code": "CC-9101-001",
                "name": "Gói A",
                "amount": 5_000_000,
                "order_id": "",
                "lead_source": None,
                "referrer_uid": None,
                "bonus_sessions_referee": None,
                "bonus_sessions_referrer": None,
            }],
        }],
        "status": "pending_order",
        "created_at": "2026-08-13T08:00:00Z",
        "updated_at": "2026-08-13T08:00:00Z",
        "info_confirmed_at": None,
        "hold_activation": False,
        "hold_note": None,
    }
    base.update(kwargs)
    return base


def _sample_pr(**kwargs) -> dict:
    base = {
        "id": "PR-2026-9101",
        "sale_email": "sale@test.com",
        "name": "PH Test",
        "child_name": "Bé An",
        "phone": "0900000000",
        "country": "VN",
        "lead_source": "quang_cao",
        "lead_channel": "300265",
        "target": 5_000_000,
        "received": 5_000_000,
        "is_test": False,
    }
    base.update(kwargs)
    return base


def _uids_payload(**course_overrides) -> list[dict]:
    course = {
        "code": "CC-9101-001",
        "name": "Gói A",
        "amount": 5_000_000,
        "order_id": "",
    }
    course.update(course_overrides)
    return [{
        "uid": "UID-1",
        "name": None,
        "phone": "0900000000",
        "country": "VN",
        "courses": [course],
    }]


# ---------------------------------------------------------------------------
# G2-T1 — _ar_dingtalk_content_key (pure unit tests)
# ---------------------------------------------------------------------------

class TestArDingtalkContentKey:
    def test_amount_change_alters_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(amount=6_000_000))
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_course_name_change_alters_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(name="Gói B"))
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_phone_change_alters_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        uids2 = _uids_payload()
        uids2[0]["phone"] = "0911111111"
        ar2 = _make_ar_row(uids_data=uids2)
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_uid_change_alters_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        uids2 = _uids_payload()
        uids2[0]["uid"] = "UID-2"
        ar2 = _make_ar_row(uids_data=uids2)
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_referral_bonus_change_alters_key_for_refer_course(self):
        ar = _make_ar_row(uids_data=_uids_payload(
            name="Gói REFER", referrer_uid="UID-REF", bonus_sessions_referee=2, bonus_sessions_referrer=3,
        ))
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(
            name="Gói REFER", referrer_uid="UID-REF", bonus_sessions_referee=4, bonus_sessions_referrer=3,
        ))
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_course_lead_source_change_alters_key(self):
        # PR-2026-1445 (30/8): sale đổi nguồn cấp GÓI (Kho Chung → Gia hạn) mà PR chưa
        # đổi → phải đổi key để kích hoạt re-notify.
        ar = _make_ar_row(uids_data=_uids_payload(lead_source="kho_chung"))
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(lead_source="gia_han"))
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_course_lead_channel_change_alters_key(self):
        ar = _make_ar_row(uids_data=_uids_payload(lead_source="quang_cao", lead_channel="300265"))
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(lead_source="quang_cao", lead_channel="300281"))
        assert _ar_dingtalk_content_key(ar, pr) != _ar_dingtalk_content_key(ar2, pr)

    def test_order_id_change_does_not_alter_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=_uids_payload(order_id="CRM-999"))
        assert _ar_dingtalk_content_key(ar, pr) == _ar_dingtalk_content_key(ar2, pr)

    def test_status_and_timestamp_change_does_not_alter_key(self):
        ar = _make_ar_row()
        pr = _sample_pr()
        ar2 = _make_ar_row(status="activated", updated_at="2026-08-13T12:00:00Z")
        assert _ar_dingtalk_content_key(ar, pr) == _ar_dingtalk_content_key(ar2, pr)

    def test_info_confirmed_change_does_not_alter_key(self):
        ar = _make_ar_row(info_confirmed_at=None)
        pr = _sample_pr()
        ar2 = _make_ar_row(info_confirmed_at="2026-08-13T12:00:00Z")
        assert _ar_dingtalk_content_key(ar, pr) == _ar_dingtalk_content_key(ar2, pr)

    def test_customer_name_change_does_not_alter_key_when_block_has_name(self):
        """Block đã có name riêng (khác None) → customer_name thô không ảnh hưởng hiển thị."""
        uids = _uids_payload()
        uids[0]["name"] = "Bé Cụ Thể"
        ar = _make_ar_row(uids_data=uids, customer_name="KH Cũ")
        pr = _sample_pr()
        ar2 = _make_ar_row(uids_data=uids, customer_name="KH Mới Hoàn Toàn Khác")
        assert _ar_dingtalk_content_key(ar, pr) == _ar_dingtalk_content_key(ar2, pr)


# ---------------------------------------------------------------------------
# G2-T2/T3/T4 — wiring qua PATCH /active-requests/{ar_id}
# ---------------------------------------------------------------------------

@contextlib.contextmanager
def _patch_dependencies(pr):
    with patch("activation_routes.resolve_actor", return_value=MagicMock(email="actor@test.com")), \
         patch("activation_routes._fetch_prs_by_ids", return_value={pr["id"]: pr}), \
         patch("activation_routes._tien_ve_bounds", return_value=(None, None)), \
         patch("activation_routes._sync_ledger_courses_from_uids"), \
         patch("activation_routes._writeback_child_uids_to_pr"), \
         patch("activation_routes._validate_course_amounts"), \
         patch("activation_routes._assert_uids_data_order_ids_unique"), \
         patch("activation_routes._fetch_payment_request", return_value=pr), \
         patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_dt:
        yield mock_dt


def _build_patch_client(ar_row):
    def table_side(name):
        m = MagicMock()
        if name == "active_requests":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[ar_row])
            m.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[ar_row])
        return m

    sb = MagicMock()
    sb.table.side_effect = table_side
    app = FastAPI()
    register_activation_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


class TestPatchActiveRequestEditResendWiring:
    def test_content_change_enqueues_edit_resend(self):
        """PATCH đổi amount thật sự (nội dung hiển thị đổi) → bắn đúng 1 tin :edit:."""
        ar_row = _make_ar_row()
        pr = _sample_pr()
        client = _build_patch_client(ar_row)

        with _patch_dependencies(pr) as mock_dt:
            res = client.patch(
                "/api/v1/active-requests/AR-2026-9101",
                json={"uids_data": _uids_payload(amount=6_000_000)},
            )

        assert res.status_code == 200, res.text
        mock_dt.assert_called_once()
        assert mock_dt.call_args.kwargs["source_suffix"].startswith(":edit:")

    def test_saving_identical_content_does_not_enqueue(self):
        """PATCH gửi lại uids_data y hệt (không đổi gì) → KHÔNG bắn tin."""
        ar_row = _make_ar_row()
        pr = _sample_pr()
        client = _build_patch_client(ar_row)

        with _patch_dependencies(pr) as mock_dt:
            res = client.patch(
                "/api/v1/active-requests/AR-2026-9101",
                json={"uids_data": _uids_payload(amount=5_000_000)},
            )

        assert res.status_code == 200, res.text
        mock_dt.assert_not_called()

    def test_toggling_info_confirmed_alone_does_not_enqueue(self):
        """PATCH chỉ toggle info_confirmed (không đổi uids_data) → KHÔNG bắn tin."""
        ar_row = _make_ar_row()
        pr = _sample_pr()
        client = _build_patch_client(ar_row)

        with _patch_dependencies(pr) as mock_dt:
            res = client.patch(
                "/api/v1/active-requests/AR-2026-9101",
                json={"info_confirmed": True},
            )

        assert res.status_code == 200, res.text
        mock_dt.assert_not_called()


# ---------------------------------------------------------------------------
# G2-T5 — nhãn "🔄 SALE VỪA CẬP NHẬT..." chỉ dán cho source_suffix :edit:
# ---------------------------------------------------------------------------

def test_edit_suffix_prepends_update_label_to_dingtalk_message():
    from activation_routes import _enqueue_activation_request_created_dingtalk

    group_response = MagicMock(data=[{"team_code": "inhouse_1", "is_active": True}])
    lines_response = MagicMock(data=[])
    staff_response = MagicMock(data=[
        {"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}
    ])

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb = MagicMock()
    sb.table.side_effect = table_side

    saved_ar = _make_ar_row()
    pr = _sample_pr()

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(
            sb, saved_ar, pr, source_suffix=":edit:abc123def456",
        )

    assert len(inserted_messages) == 1
    assert inserted_messages[0]["message"].startswith("🔄 SALE VỪA CẬP NHẬT ĐƠN ĐÃ BÁO\n")


def test_create_and_append_suffix_do_not_get_update_label():
    from activation_routes import _enqueue_activation_request_created_dingtalk

    group_response = MagicMock(data=[{"team_code": "inhouse_1", "is_active": True}])
    lines_response = MagicMock(data=[])
    staff_response = MagicMock(data=[
        {"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}
    ])

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb = MagicMock()
    sb.table.side_effect = table_side

    saved_ar = _make_ar_row()
    pr = _sample_pr()

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(sb, saved_ar, pr, source_suffix="")
        _enqueue_activation_request_created_dingtalk(sb, saved_ar, pr, source_suffix=":append:CC-9101-002")

    assert len(inserted_messages) == 2
    for msg in inserted_messages:
        assert not msg["message"].startswith("🔄 SALE VỪA CẬP NHẬT")


def test_append_suffix_prepends_supplementary_header_and_uses_pr_total():
    """Đơn bổ sung: source_suffix ':append:' → tin (1) dán header
    '⬆️ ĐƠN BỔ SUNG · <PR>' và (2) Tổng = received PR (lũy kế), dù block chỉ
    chứa gói MỚI. Regression PR-2026-1070: upsell 48→96 buổi, đóng thêm 7.74M,
    PR lũy kế 17.32M. Wiring end-to-end qua _enqueue (is_supplementary=is_append)."""
    from activation_routes import _enqueue_activation_request_created_dingtalk

    group_response = MagicMock(data=[{"team_code": "inhouse_1", "is_active": True}])
    lines_response = MagicMock(data=[])
    staff_response = MagicMock(data=[
        {"email": "s@p.vn", "display_name": "Sale A", "crm_name": "Sale A", "team": "inhouse_1"}
    ])

    inserted_messages = []

    def table_side(name):
        m = MagicMock()
        if name == "nhan_su_sale":
            m.select.return_value.ilike.return_value.limit.return_value.execute.return_value = staff_response
        elif name == "dingtalk_team_groups":
            m.select.return_value.eq.return_value.limit.return_value.execute.return_value = group_response
        elif name == "payment_lines":
            m.select.return_value.eq.return_value.order.return_value.execute.return_value = lines_response
        elif name == "dingtalk_outbox":
            def insert_capture(data):
                inserted_messages.append(data)
                result = MagicMock()
                result.execute.return_value = None
                return result
            m.insert = insert_capture
        return m

    sb = MagicMock()
    sb.table.side_effect = table_side

    # block chỉ chứa gói bổ sung 7.74M; PR đã thu lũy kế 17.32M
    saved_ar = _make_ar_row(uids_data=[{
        "uid": "3291469610", "name": None, "phone": "81-7083630739", "country": "VN",
        "courses": [{"code": "CC-9101-002", "name": "2/W- NEW 96 PHI+10 HN",
                     "amount": 7_740_000, "order_id": "", "lead_source": None,
                     "referrer_uid": None, "bonus_sessions_referee": None,
                     "bonus_sessions_referrer": None}],
    }])
    pr = _sample_pr(target=17_320_000, received=17_320_000)

    with patch("activation_routes.dingtalk_event_enabled", return_value=True):
        _enqueue_activation_request_created_dingtalk(
            sb, saved_ar, pr, source_suffix=":append:CC-9101-002",
        )

    assert len(inserted_messages) == 1
    msg = inserted_messages[0]["message"]
    assert msg.startswith("⬆️ ĐƠN BỔ SUNG · PR-2026-9101\n")
    assert "Tiền: 7.740.000 VND" in msg
    assert "Tổng: 17.320.000 VND" in msg
    assert "Tổng: 7.740.000 VND" not in msg


# ---------------------------------------------------------------------------
# G2-T6 — _ar_dingtalk_content_key: đổi lead_source/channel cấp PR → key đổi
# ---------------------------------------------------------------------------

class TestArDingtalkContentKeySourceChange:
    def test_lead_source_change_alters_key(self):
        ar = _make_ar_row()
        pr_before = _sample_pr(lead_source="kho_chung", lead_channel=None)
        pr_after = _sample_pr(lead_source="quang_cao", lead_channel=None)
        assert _ar_dingtalk_content_key(ar, pr_before) != _ar_dingtalk_content_key(ar, pr_after)

    def test_lead_channel_change_alters_key(self):
        ar = _make_ar_row()
        pr_before = _sample_pr(lead_source="quang_cao", lead_channel="300265")
        pr_after = _sample_pr(lead_source="quang_cao", lead_channel="300281")
        assert _ar_dingtalk_content_key(ar, pr_before) != _ar_dingtalk_content_key(ar, pr_after)


# ---------------------------------------------------------------------------
# G2-T7 — _maybe_enqueue_ar_edit_on_pr_change: wiring qua PR PATCH
# ---------------------------------------------------------------------------

class TestMaybeEnqueueArEditOnPrChange:
    def _make_sb_with_ar(self, ar_row):
        """Supabase mock trả AR khi query theo pr_id."""
        enqueued = []

        def table_side(name):
            m = MagicMock()
            if name == "active_requests":
                m.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[ar_row])
            elif name == "dingtalk_outbox":
                def insert_capture(data):
                    enqueued.append(data)
                    r = MagicMock()
                    r.execute.return_value = None
                    return r
                m.insert = insert_capture
            return m

        sb = MagicMock()
        sb.table.side_effect = table_side
        return sb, enqueued

    def test_source_change_enqueues_resend(self):
        """PR.lead_source đổi + AR tồn tại → gọi enqueue dingtalk."""
        ar = _make_ar_row()
        old_pr = _sample_pr(lead_source="kho_chung", lead_channel=None)
        new_pr = _sample_pr(lead_source="quang_cao", lead_channel="300281")

        with patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_enq, \
             patch("activation_routes.dingtalk_event_enabled", return_value=True):
            sb = MagicMock()
            sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[ar])
            _maybe_enqueue_ar_edit_on_pr_change(sb, "PR-2026-9101", old_pr, new_pr)
            mock_enq.assert_called_once()
            _, kwargs = mock_enq.call_args
            assert kwargs.get("source_suffix", "").startswith(":edit:")

    def test_no_ar_skips_resend(self):
        """PR không có AR đã báo → không enqueue."""
        old_pr = _sample_pr(lead_source="kho_chung")
        new_pr = _sample_pr(lead_source="quang_cao")

        with patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_enq:
            sb = MagicMock()
            sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[])
            _maybe_enqueue_ar_edit_on_pr_change(sb, "PR-2026-9101", old_pr, new_pr)
            mock_enq.assert_not_called()

    def test_same_source_no_resend(self):
        """PR source không đổi → không enqueue."""
        ar = _make_ar_row()
        pr = _sample_pr(lead_source="quang_cao", lead_channel="300281")

        with patch("activation_routes._enqueue_activation_request_created_dingtalk") as mock_enq:
            sb = MagicMock()
            sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = MagicMock(data=[ar])
            _maybe_enqueue_ar_edit_on_pr_change(sb, "PR-2026-9101", pr, pr)
            mock_enq.assert_not_called()
