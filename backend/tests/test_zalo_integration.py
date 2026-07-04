"""
Task G7: Zalo Integration Test
Integration test cho luồng tự động gửi tin nhắn Zalo khi có thanh toán thành công.
Luồng: PayOS Webhook -> DB Trigger (Mock) -> Outbox -> Worker -> Zalo API.

Hướng dẫn chạy test:
    $env:PYTHONPATH="backend"; pytest tests/test_zalo_integration.py -v
"""

from __future__ import annotations

import datetime
import hashlib
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import activation_routes
import payment_request_routes as pr
from zalo_outbox_worker import poll_and_send

# ---------------------------------------------------------------------------
# 1. Mock Database (Supabase)
# ---------------------------------------------------------------------------

class FakeSupabase:
    def __init__(self):
        self.users = [
            {"email": "sale@test.com", "name": "Nguyễn Văn A"}
        ]
        # Team Mapping: HN inhouse map thành Inhouse 1
        self.zalo_groups = [
            {"team_code": "Inhouse 1", "group_id": "ZALO-GROUP-123", "is_active": True}
        ]
        self.payment_requests = [
            {
                "id": "PR-123",
                "sale_email": "sale@test.com",
                "target": 1000000,
                "received": 0,
                "state": "short"
            }
        ]
        self.payment_lines = [
            {
                "id": "line-1",
                "payment_request_id": "PR-123",
                "payos_order_code": 99999,
                "amount": 1000000,
                "status": "pending",
                "team": "HN inhouse"  # Raw team từ CRM/DB
            }
        ]
        # Bảng chứa queue tin nhắn Zalo gửi đi
        self.outbox_db = []
        
    def table(self, name):
        return QueryBuilder(self, name)

    def rpc(self, func, params=None):
        return MagicMock(execute=lambda: MagicMock(data=None))

class QueryBuilder:
    def __init__(self, db, table_name):
        self.db = db
        self.table_name = table_name
        self._eq = []
        self._is = []
        self._patch = None
        self._limit = None

    def select(self, *args, **kwargs):
        return self

    def insert(self, data):
        if self.table_name == "zalo_outbox":
            self.db.outbox_db.append(data)
        return MagicMock(execute=lambda: MagicMock(data=[data]))

    def update(self, data):
        self._patch = data
        return self

    def eq(self, column, value):
        self._eq.append((column, value))
        return self

    def is_(self, column, value):
        self._is.append((column, value))
        return self
        
    def or_(self, cond):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, value):
        self._limit = value
        return self

    def single(self):
        return self

    def execute(self):
        data = []
        if self.table_name == "users":
            data = self.db.users
        elif self.table_name == "zalo_team_groups":
            data = self.db.zalo_groups
        elif self.table_name == "payment_requests":
            data = self.db.payment_requests
        elif self.table_name == "payment_lines":
            data = self.db.payment_lines
        elif self.table_name == "zalo_outbox":
            data = self.db.outbox_db

        # Filter
        filtered = list(data)
        for col, val in self._eq:
            filtered = [r for r in filtered if str(r.get(col)) == str(val)]
            
        # Is (null checks etc)
        for col, val in self._is:
            if val == "null":
                filtered = [r for r in filtered if r.get(col) is None]

        # Patch (update)
        if self._patch:
            for r in filtered:
                r.update(self._patch)

        if self._limit is not None:
            filtered = filtered[:self._limit]

        return MagicMock(data=filtered, count=len(filtered))


@pytest.fixture
def fake_db():
    return FakeSupabase()

@pytest.fixture
def client(fake_db):
    import importlib
    import payment_request_routes
    pr_mod = importlib.reload(payment_request_routes)
    app = FastAPI()
    pr_mod.register_payment_request_routes(app, lambda: fake_db)
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# 2. Integration Test
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_payment_webhook_to_zalo_outbox_flow(client, fake_db):
    """
    Kịch bản: 
    1. Nhận PayOS Webhook cho đơn hàng 99999.
    2. Webhook xử lý cập nhật line status thành 'paid'.
    3. (Mock) Bẫy DB Trigger sinh ra bản ghi `zalo_outbox`.
    4. Worker (poll_and_send) chạy, đọc bảng outbox và gọi Zalo API.
    5. Kiểm chứng đúng group ID và nội dung.
    """
    
    # 1. Kích hoạt Webhook (Bypass chữ ký checksum)
    with patch("payment_request_routes._verify_payos_webhook_signature", return_value=None):
        with patch("payment_request_routes.recompute_payment_request_totals", return_value={"state": "done"}):
            resp = client.post(
                "/api/v1/payos-webhook",
                json={
                    "data": {
                        "orderCode": 99999,
                        "amount": 1000000,
                        "code": "00"
                    },
                    "signature": "mocked-signature",
                    "code": "00",
                    "success": True
                }
            )
            assert resp.status_code == 200
            print("WEBHOOK RESP:", resp.json())

    # Xác nhận line đã được cập nhật thành 'paid' trong fake DB
    assert fake_db.payment_lines[0]["status"] == "paid"

    # 2. Xử lý bẫy Mock PostgreSQL Trigger
    # DB Trigger thực tế bị bỏ qua vì ta dùng mock client.
    # Ta phải tự đẩy 1 row vào zalo_outbox tương đương với hành vi của DB trigger
    # sau khi payment_lines được update thành công.
    # Lưu ý: group_id "ZALO-GROUP-123" được ánh xạ từ canonical team "Inhouse 1"
    fake_db.outbox_db.append({
        "id": 1,
        "event_type": "payment_paid",
        "group_id": "ZALO-GROUP-123",
        "message": "💰 ĐÃ VÀO - KH Ngô Bá Khá - ĐT: 0912345678\n🔸 Sale Nguyễn Văn A · Team HN inhouse\n🔸 Số tiền: 1,000,000 VND lúc 17:00 01/10/2023",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "sent_at": None,
        "next_retry_at": None,
        "retries": 0,
        "last_error": None
    })

    # 3. Chạy Worker
    with patch("zalo_outbox_worker.send_text_to_group", return_value="MSG-OK") as mock_send:
        # Gọi One-off run
        await poll_and_send(lambda: fake_db)

        # 4. Kiểm chứng (Assert)
        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        group_id_arg = args[0]
        message_arg = args[1]
        
        # Kiểm tra Group ID
        assert group_id_arg == "ZALO-GROUP-123"
        
        assert "💰 ĐÃ VÀO - KH Ngô Bá Khá" in message_arg
        assert "Team HN inhouse" in message_arg
        assert "1,000,000 VND" in message_arg
        assert "Sale Nguyễn Văn A" in message_arg

    # Kiểm tra dòng outbox đã được đánh dấu là gửi thành công
    assert fake_db.outbox_db[0]["sent_at"] is not None
    assert fake_db.outbox_db[0]["zalo_message_id"] == "MSG-OK"
    assert fake_db.outbox_db[0]["last_error"] is None


# ---------------------------------------------------------------------------
# Workstream B (Đức) — _enqueue_activation_request_created_zalo
# ---------------------------------------------------------------------------
# Pure-unit tests calling the enqueue helper directly (Pattern 1) — no HTTP
# layer needed since the helper is a standalone module function called at the
# end of _save_active_request.

def _mock_chain_table(data: list[dict]) -> MagicMock:
    """A Supabase table mock where every chained call returns itself,
    ending in .execute() -> MagicMock(data=data)."""
    t = MagicMock()
    for m in ("select", "eq", "ilike", "order", "limit"):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _build_enqueue_sb(
    *,
    staff_rows: list[dict] | None = None,
    group_rows: list[dict] | None = None,
    line_rows: list[dict] | None = None,
    insert_side_effect=None,
):
    """Build a MagicMock Supabase client routing table() calls by name.

    Returns (sb, outbox_calls) — outbox_calls collects every payload passed
    to zalo_outbox.insert(...) unless insert_side_effect raises.
    """
    outbox_calls: list[dict] = []

    def _outbox_insert(payload: dict):
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
        "zalo_team_groups": _mock_chain_table(group_rows or []),
        "payment_lines": _mock_chain_table(line_rows or []),
        "zalo_outbox": outbox_table,
    }

    sb = MagicMock()
    sb.table.side_effect = lambda name: tables.get(name, MagicMock())
    return sb, outbox_calls


def _sample_saved_ar(**overrides) -> dict:
    base = {
        "id": "AR-2026-9001",
        "is_test": False,
        "customer_name": None,
        "uids_data": [
            {
                "uid": "123",
                "phone": "84-900000000",
                "courses": [{"name": "Gói A", "amount": 5_000_000}],
            }
        ],
    }
    base.update(overrides)
    return base


def _sample_pr(**overrides) -> dict:
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


class TestEnqueueActivationRequestCreatedZalo:
    def test_happy_path_inserts_outbox_row_with_image_url(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[
                {"email": "sale@test.com", "display_name": "Sale A",
                 "crm_name": "Sale A CRM", "team": "Inhouse 2"}
            ],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
            line_rows=[{"bill_image": "https://x/bill.jpg", "bill_images": None}],
        )
        saved_ar = _sample_saved_ar()
        pr_row = _sample_pr()

        activation_routes._enqueue_activation_request_created_zalo(sb, saved_ar, pr_row)

        assert len(outbox_calls) == 1
        payload = outbox_calls[0]
        assert payload["event_type"] == "activation_request_created"
        assert payload["source_table"] == "active_requests"
        expected_uuid = str(uuid.UUID(hashlib.md5(b"AR-2026-9001").hexdigest()))
        assert payload["source_id"] == expected_uuid
        assert payload["group_id"] == "GID-IH2"
        assert payload["image_url"] == "https://x/bill.jpg"
        assert "Bé An, Gói A" in payload["message"]
        assert "🆕 YÊU CẦU KÍCH HOẠT KHOÁ HỌC — AR-2026-9001" in payload["message"]

    def test_falls_back_to_bill_images_array_when_bill_image_empty(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
            line_rows=[{"bill_image": None, "bill_images": ["https://x/a.jpg", "https://x/b.jpg"]}],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
        assert outbox_calls[0]["image_url"] == "https://x/b.jpg"

    def test_no_bill_line_sends_text_only(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
            line_rows=[],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
        assert len(outbox_calls) == 1
        assert outbox_calls[0]["image_url"] is None

    def test_skip_when_pr_is_test(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr(is_test=True)
        )
        assert outbox_calls == []

    def test_skip_when_saved_ar_is_test(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(is_test=True), _sample_pr()
        )
        assert outbox_calls == []

    def test_skip_when_pr_is_none(self):
        sb, outbox_calls = _build_enqueue_sb()
        activation_routes._enqueue_activation_request_created_zalo(sb, _sample_saved_ar(), None)
        assert outbox_calls == []

    def test_skip_when_sale_has_no_team(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": None}],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
        assert outbox_calls == []

    def test_skip_when_no_active_group_for_team(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
        assert outbox_calls == []

    def test_skip_when_group_inactive(self):
        sb, outbox_calls = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": False}],
        )
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
        assert outbox_calls == []

    def test_duplicate_insert_is_swallowed_not_raised(self):
        sb, _ = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
            insert_side_effect=Exception(
                'duplicate key value violates unique constraint "zalo_outbox_source_table_source_id_event_type_key"'
            ),
        )
        # Must not raise — idempotency swallow.
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )

    def test_unexpected_db_exception_never_propagates(self):
        sb = MagicMock()
        sb.table.side_effect = RuntimeError("DB connection lost")
        # Must not raise — enqueue is best-effort and must never fail AR creation.
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )

    def test_non_duplicate_insert_error_is_also_swallowed_by_outer_guard(self):
        sb, _ = _build_enqueue_sb(
            staff_rows=[{"email": "sale@test.com", "team": "Inhouse 2"}],
            group_rows=[{"group_id": "GID-IH2", "is_active": True}],
            insert_side_effect=Exception("column image_url does not exist"),
        )
        # Not a duplicate-key error -> re-raised internally, but the outer
        # try/except in _enqueue_activation_request_created_zalo must still
        # swallow it so AR creation is never affected.
        activation_routes._enqueue_activation_request_created_zalo(
            sb, _sample_saved_ar(), _sample_pr()
        )
