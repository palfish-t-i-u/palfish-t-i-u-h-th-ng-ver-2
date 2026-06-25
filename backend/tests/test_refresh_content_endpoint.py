"""POST /api/v1/payment-lines/{line_id}/refresh-content.

Endpoint rebuild transfer_content cho line PENDING khi PR đã đổi
name/phone/childName/country. KHÔNG ảnh hưởng line PAID/cancelled.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import payment_request_routes as pr
from main import app


@pytest.fixture
def client():
    return TestClient(app)


PR_ROW = {
    "id": "PR-2026-0066",
    "name": "Trần Xuân",
    "child_name": "Nguyễn Thị Phương Linh",
    "phone": "985004656",
    "country": "VN",
    "state": "pending",
    "target": 17_650_000,
    "received": 0,
    "is_test": False,
    "sale_email": "dinhngochai5901@gmail.com",
}

LINE_ROW = {
    "id": "0c61d981-0f97-428e-b186-d3cbcf6d0fb0",
    "payment_request_id": "PR-2026-0066",
    "method": "qr",
    "status": "pending",
    "amount": 17_650_000,
    "transfer_code": "FHETL",
    "transfer_content": "84985004656 OLD NAME FHETL",
    "name_for_transfer": "OLD NAME",
    "is_test": False,
}


def _mock_sb_with(line_row, pr_row, updated_line=None):
    sb = MagicMock()
    tables = {}
    def _chain(table_name):
        if table_name not in tables:
            t = MagicMock()
            t.select.return_value = t
            t.update.return_value = t
            t.eq.return_value = t
            t.limit.return_value = t
            tables[table_name] = t
        return tables[table_name]
    sb.table.side_effect = _chain
    sb.table("payment_lines").execute.return_value = MagicMock(data=[line_row])
    sb.table("payment_requests").execute.return_value = MagicMock(data=[pr_row])
    # update return
    sb.table("payment_lines").update.return_value.eq.return_value.execute.return_value = MagicMock(
        data=[updated_line or line_row]
    )
    return sb


class TestRefreshContentEndpoint:
    def test_rebuilds_content_using_current_pr_phone(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(
                f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content"
            )
        assert r.status_code == 200
        body = r.json()
        assert body["updated"] is True
        # Phone mới phải xuất hiện trong content mới
        assert "84999111222" in body["new_content"]
        assert body["old_content"] == LINE_ROW["transfer_content"]

    def test_returns_updated_false_when_content_already_matches(self, client):
        # Line đã sync — content khớp PR hiện tại
        line = {**LINE_ROW, "transfer_content": "84985004656 Nguyen Thi Phuong Linh FHETL",
                "name_for_transfer": "Nguyễn Thị Phương Linh"}
        sb = _mock_sb_with(line, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{line['id']}/refresh-content")
        assert r.status_code == 200
        assert r.json()["updated"] is False

    def test_400_when_line_already_paid(self, client):
        sb = _mock_sb_with({**LINE_ROW, "status": "paid"}, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 400
        assert "thanh toan" in r.json()["detail"].lower() or "paid" in r.json()["detail"].lower()

    def test_400_when_line_not_qr_method(self, client):
        sb = _mock_sb_with({**LINE_ROW, "method": "cash"}, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 400

    def test_403_when_actor_no_access_to_pr(self, client):
        sb = _mock_sb_with(LINE_ROW, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=False):
            mock_actor.return_value = MagicMock(email="other@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 403

    def test_404_when_line_not_found(self, client):
        sb = MagicMock()
        t = MagicMock()
        t.select.return_value = t
        t.eq.return_value = t
        t.limit.return_value = t
        t.execute.return_value = MagicMock(data=[])
        sb.table.return_value = t
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post("/api/v1/payment-lines/nonexistent-id/refresh-content")
        assert r.status_code == 404

    def test_uses_explicit_name_for_transfer_from_body_when_provided(self, client):
        sb = _mock_sb_with(LINE_ROW, PR_ROW)
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(
                f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content",
                json={"name_for_transfer": "Trần Xuân"},
            )
        assert r.status_code == 200
        body = r.json()
        # Tên Trần Xuân (ascii: Tran Xuan) phải xuất hiện trong content mới
        assert "Tran Xuan" in body["new_content"]

    def test_preserves_transfer_code(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit"):
            mock_actor.return_value = MagicMock(email="admin@test.com")
            r = client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        assert r.status_code == 200
        # Mã FH KHÔNG đổi (để SePay tiếp tục match được giao dịch cũ)
        assert "FHETL" in r.json()["new_content"]

    def test_writes_audit_log(self, client):
        sb = _mock_sb_with(LINE_ROW, {**PR_ROW, "phone": "999111222"})
        with patch.object(pr, "get_supabase", return_value=sb), \
             patch.object(pr, "resolve_actor") as mock_actor, \
             patch.object(pr, "require_module_write"), \
             patch.object(pr, "_can_access_request", return_value=True), \
             patch.object(pr, "log_audit") as mock_audit:
            mock_actor.return_value = MagicMock(email="admin@test.com")
            client.post(f"/api/v1/payment-lines/{LINE_ROW['id']}/refresh-content")
        # log_audit phải được gọi với action chứa "refresh" hoặc "transfer_content"
        assert mock_audit.called
        call_args = mock_audit.call_args
        # log_audit(sb, actor.email, action, target_type, target_id, payload)
        action = call_args[0][2] if len(call_args[0]) >= 3 else ""
        assert "refresh" in action.lower() or "content" in action.lower()
