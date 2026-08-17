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
            line_rows=[{"bill_image": "https://x/bill.jpg", "bill_images": None, "method": "qr", "status": "paid"}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        # 14/8: TÁCH tin — 1 tin TEXT (sampleText, search được) + 1 tin ẢNH riêng
        # (sampleImageMsg). Trước đây gộp 1 tin markdown nhúng ảnh (không search được).
        assert len(calls) == 2
        text_row, img_row = calls[0], calls[1]
        assert text_row["event_type"] == "activation_request_created"
        assert text_row["source_table"] == "active_requests"
        assert text_row["team_code"] == "HN Offline Store"          # RAW, không phải "Offline"
        assert text_row["source_id"] == str(uuid.UUID(hashlib.md5(b"AR-2026-9001").hexdigest()))
        assert "image_url" not in text_row and "image_urls" not in text_row  # tin TEXT KHÔNG kèm ảnh
        # 17/7 (a Hiếu): bỏ header, format "Phone:/UID:/<bé>, gói/Nguồn/Tổng/Sale·Team"
        assert "Phone: 84-900000000" in text_row["message"]
        assert "Bé An, Gói A" in text_row["message"]
        # tin ẢNH: source_id tách :bill:1, message rỗng → worker route sang send_group_image
        assert img_row["image_url"] == "https://x/bill.jpg"
        assert img_row["image_urls"] == ["https://x/bill.jpg"]
        assert img_row["message"] == ""
        _bhash = hashlib.md5(b"https://x/bill.jpg").hexdigest()
        assert img_row["source_id"] == str(uuid.UUID(hashlib.md5(f"AR-2026-9001:bill:{_bhash}".encode()).hexdigest()))

    def test_falls_back_to_bill_images_array(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[{"bill_image": None, "bill_images": ["https://x/a.jpg", "https://x/b.jpg"], "method": "card", "status": "paid"}],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        # 14/8: mỗi ảnh 1 tin riêng (oldest-first) → 1 text + 2 ảnh; retry/dedup cô lập
        assert len(calls) == 3
        assert "image_url" not in calls[0]                       # calls[0] = tin TEXT
        assert calls[1]["image_url"] == "https://x/a.jpg"
        assert calls[1]["image_urls"] == ["https://x/a.jpg"]
        assert calls[2]["image_url"] == "https://x/b.jpg"
        assert calls[2]["image_urls"] == ["https://x/b.jpg"]

    def test_no_bill_sends_text_only_no_image_row(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        # không bill → chỉ 1 tin TEXT, KHÔNG sinh tin ảnh
        assert len(calls) == 1
        assert "image_url" not in calls[0]
        assert "image_urls" not in calls[0]

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

    def test_source_suffix_changes_source_id(self):
        """Append lần 2: suffix đổi source_id — outbox UNIQUE không nuốt tin bổ sung."""
        import uuid as uuid_mod
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "display_name": "Sale A",
                         "crm_name": "Sale A CRM", "team": "HN Offline Store"}],
            group_rows=[{"team_code": "HN Offline Store", "is_active": True}],
            line_rows=[],
        )
        ar = _sample_saved_ar()
        pr = _sample_pr()

        activation_routes._enqueue_activation_request_created_dingtalk(sb, ar, pr)
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, ar, pr, source_suffix=":append:CC-9508-002"
        )

        assert len(calls) == 2
        assert calls[0]["source_id"] != calls[1]["source_id"]
        ar_id = str(ar["id"])
        expect_first = str(uuid_mod.UUID(hashlib.md5(ar_id.encode()).hexdigest()))
        expect_second = str(uuid_mod.UUID(hashlib.md5(f"{ar_id}:append:CC-9508-002".encode()).hexdigest()))
        assert calls[0]["source_id"] == expect_first
        assert calls[1]["source_id"] == expect_second

    def test_bill_row_source_id_stable_across_suffix(self):
        """14/8: cùng 1 bill của 1 AR → source_id ảnh KHÔNG đổi theo suffix (:edit:/
        :append:) → UNIQUE nuốt lần sau → ảnh gửi ĐÚNG 1 lần, hết spam khi edit-resend.
        Tin TEXT thì source_id vẫn đổi theo suffix → tin cập nhật re-send đúng ý."""
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[{"bill_image": "https://x/bill.jpg", "bill_images": None, "method": "qr", "status": "paid"}],
        )
        ar = _sample_saved_ar()
        activation_routes._enqueue_activation_request_created_dingtalk(sb, ar, _sample_pr())
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, ar, _sample_pr(), source_suffix=":edit:abc123")
        img_rows = [c for c in calls if c.get("image_url")]
        text_rows = [c for c in calls if "image_url" not in c]
        assert len(img_rows) == 2 and len(text_rows) == 2
        assert img_rows[0]["source_id"] == img_rows[1]["source_id"]     # ảnh: UNIQUE sẽ dedup
        assert text_rows[0]["source_id"] != text_rows[1]["source_id"]   # text: re-send

    def test_source_suffix_default_unchanged(self):
        """Không truyền suffix → source_id giữ nguyên md5(ar_id) — tin create cũ idempotent như trước."""
        import uuid as uuid_mod
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "display_name": "Sale A",
                         "crm_name": "Sale A CRM", "team": "HN Offline Store"}],
            group_rows=[{"team_code": "HN Offline Store", "is_active": True}],
            line_rows=[],
        )
        ar = _sample_saved_ar()
        activation_routes._enqueue_activation_request_created_dingtalk(sb, ar, _sample_pr())
        ar_id = str(ar["id"])
        assert calls[0]["source_id"] == str(uuid_mod.UUID(hashlib.md5(ar_id.encode()).hexdigest()))

    def test_bill_from_pending_installment_with_bill(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[{
                "method": "installment", "status": "pending",
                "bill_image": "https://x/mpos.jpg", "bill_images": None,
            }],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        # bill từ line trả góp pending "đủ tạm" → 1 text + 1 ảnh
        assert len(calls) == 2
        assert calls[1]["image_urls"] == ["https://x/mpos.jpg"]
        assert calls[1]["image_url"] == "https://x/mpos.jpg"

    def test_no_bill_from_pending_non_provisional(self):
        sb, calls = _build_dt_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 1"}],
            group_rows=[{"team_code": "Inhouse 1", "is_active": True}],
            line_rows=[{
                "method": "qr", "status": "pending",
                "bill_image": "https://x/qr.jpg", "bill_images": None,
            }],
        )
        activation_routes._enqueue_activation_request_created_dingtalk(
            sb, _sample_saved_ar(), _sample_pr())
        # qr pending không phải "đủ tạm" → không lấy bill → chỉ 1 tin TEXT
        assert len(calls) == 1
        assert "image_url" not in calls[0]
        assert "image_urls" not in calls[0]
