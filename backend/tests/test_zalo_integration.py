"""
Task G7: Zalo Integration Test
Integration test cho luồng tự động gửi tin nhắn Zalo khi có thanh toán thành công.
Luồng: PayOS Webhook -> DB Trigger (Mock) -> Outbox -> Worker -> Zalo API.

Hướng dẫn chạy test:
    $env:PYTHONPATH="backend"; pytest tests/test_zalo_integration.py -v
"""

from __future__ import annotations

import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

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
    app = FastAPI()
    pr.register_payment_request_routes(app, lambda: fake_db)
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
        "message": "💰 Đã vào - KH Ngô Bá Khá | Sale Nguyễn Văn A · Team HN inhouse | 1,000,000đ | 01/10/2023 17:00",
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
        
        assert "💰 Đã vào - KH Ngô Bá Khá" in message_arg
        assert "Team HN inhouse" in message_arg
        assert "1,000,000đ" in message_arg
        assert "Sale Nguyễn Văn A" in message_arg

    # Kiểm tra dòng outbox đã được đánh dấu là gửi thành công
    assert fake_db.outbox_db[0]["sent_at"] is not None
    assert fake_db.outbox_db[0]["zalo_message_id"] == "MSG-OK"
    assert fake_db.outbox_db[0]["last_error"] is None
