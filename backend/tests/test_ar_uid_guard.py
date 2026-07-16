"""B3 — Test ĐỎ: gate MISSING_UID + writeback qua đường TẠO AR.

Test tại mức _save_active_request (choke point duy nhất cả 2 endpoint tạo AR).
Endpoint-level vì cần phát hiện "writeback không được wire trong create path".

RED trên code hiện tại → GREEN sau bước 5.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock, call, patch

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import activation_routes as ar


def _fake_sb(pr_row: dict, *, pr_uid_after_writeback: str = ""):
    """Build fake supabase cho _save_active_request.

    pr_row: PR trả về khi _fetch_payment_request gọi.
    pr_uid_after_writeback: uid của PR sau khi writeback (dùng để verify).
    """
    sb = MagicMock()

    # active_requests: _next_ar_id query
    ar_id_table = MagicMock()
    ar_id_table.select.return_value = ar_id_table
    ar_id_table.like.return_value = ar_id_table
    ar_id_table.order.return_value = ar_id_table
    ar_id_table.limit.return_value = ar_id_table
    ar_id_table.execute.return_value = MagicMock(data=[])

    # active_requests: _assert_uids_data_order_ids_unique query
    ar_id_table.select.return_value = ar_id_table
    ar_id_table.in_.return_value = ar_id_table

    # active_requests: insert
    saved_row = {
        "id": "AR-2026-TEST-001",
        "pr_id": pr_row.get("id"),
        "uids_data": [],  # will be filled by test
        "status": "pending",
        "is_test": False,
    }
    ar_id_table.insert.return_value = ar_id_table
    ar_id_table.execute.return_value = MagicMock(data=[saved_row])

    # payment_requests: select (for writeback)
    pr_table = MagicMock()
    pr_table.select.return_value = pr_table
    pr_table.eq.return_value = pr_table
    pr_table.limit.return_value = pr_table
    pr_table.update.return_value = pr_table
    pr_table.execute.return_value = MagicMock(
        data=[{**pr_row, "extra_children": pr_row.get("extra_children") or []}]
    )

    # payment_lines: for _assert_all_paid_lines_have_bill + _validate_course_amounts
    lines_table = MagicMock()
    lines_table.select.return_value = lines_table
    lines_table.eq.return_value = lines_table
    lines_table.limit.return_value = lines_table
    lines_table.execute.return_value = MagicMock(data=[])

    # nhan_su_sale: for Zalo enqueue
    ns_table = MagicMock()
    ns_table.select.return_value = ns_table
    ns_table.ilike.return_value = ns_table
    ns_table.limit.return_value = ns_table
    ns_table.execute.return_value = MagicMock(data=[])

    def _table_side_effect(name):
        if name == "active_requests":
            return ar_id_table
        if name == "payment_requests":
            return pr_table
        if name in ("payment_lines",):
            return lines_table
        return ns_table

    sb.table.side_effect = _table_side_effect
    return sb, saved_row


def _noop(*args, **kwargs):
    pass


def _save(sb, pr_row, uids_in, monkeypatch):
    """Helper: gọi _save_active_request với monkeypatch tối thiểu."""
    monkeypatch.setattr(ar, "_fetch_payment_request", lambda _sb, _id: pr_row)
    monkeypatch.setattr(ar, "assert_pr_paid", _noop)
    monkeypatch.setattr(ar, "assert_all_paid_lines_have_bill", _noop)
    monkeypatch.setattr(ar, "_validate_course_amounts", _noop)
    monkeypatch.setattr(ar, "_assert_uids_data_order_ids_unique", _noop)
    monkeypatch.setattr(ar, "_enqueue_activation_request_created_zalo", _noop)
    monkeypatch.setattr(ar, "_enqueue_activation_request_created_dingtalk", _noop)
    return ar._save_active_request(sb, pr_id=pr_row["id"], uids_in=uids_in)


# ---------------------------------------------------------------------------
# Gate MISSING_UID
# ---------------------------------------------------------------------------

class TestMissingUidGate:
    def test_ar_with_empty_uid_raises_422(self, monkeypatch):
        """Block uid rỗng → 422 MISSING_UID. RED: gate chưa tồn tại."""
        pr = {"id": "PR-001", "uid": "uid1", "name": "KH A", "phone": "09",
              "state": "done", "received": 1_000_000, "target": 1_000_000}
        sb, _ = _fake_sb(pr)
        uids_in = [{"uid": "", "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}]

        with pytest.raises(HTTPException) as exc:
            _save(sb, pr, uids_in, monkeypatch)

        assert exc.value.status_code == 422
        detail = exc.value.detail
        assert detail.get("code") == "MISSING_UID"

    def test_ar_with_uid_set_passes_gate(self, monkeypatch):
        """Block uid đủ → vượt gate (test này GREEN hiện tại, giữ xanh sau thay đổi)."""
        pr = {"id": "PR-001", "uid": "uid1", "name": "KH A", "phone": "09",
              "state": "done", "received": 1_000_000, "target": 1_000_000}
        sb, _ = _fake_sb(pr)
        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}]
        saved, _ = _save(sb, pr, uids_in, monkeypatch)
        assert saved is not None


# ---------------------------------------------------------------------------
# Writeback qua đường TẠO AR (blocker từ critic)
# ---------------------------------------------------------------------------

class TestWritebackViaCreate:
    def test_writeback_fills_pr_uid_when_empty(self, monkeypatch):
        """PR.uid="" + AR uid đủ → PR.uid được fill sau insert. RED: chưa wire."""
        pr = {"id": "PR-001", "uid": "", "name": "KH A", "phone": "09",
              "child_name": "Bé Một",
              "state": "done", "received": 1_000_000, "target": 1_000_000}
        sb, _ = _fake_sb(pr)
        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}]
        _save(sb, pr, uids_in, monkeypatch)

        # Verify: payment_requests.update phải được gọi (writeback)
        pr_table = sb.table("payment_requests")
        assert pr_table.update.called, "writeback KHÔNG được gọi qua đường tạo AR"

    def test_writeback_does_not_overwrite_existing_uid(self, monkeypatch):
        """PR.uid đã có → KHÔNG ghi đè. RED: writeback không tồn tại trong create path."""
        pr = {"id": "PR-001", "uid": "uid-existing", "name": "KH A", "phone": "09",
              "child_name": "Bé Một",
              "state": "done", "received": 1_000_000, "target": 1_000_000}
        sb, _ = _fake_sb(pr)
        uids_in = [{"uid": "uid-new", "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}]
        _save(sb, pr, uids_in, monkeypatch)

        pr_table = sb.table("payment_requests")
        # update KHÔNG được gọi vì PR.uid đã có sẵn
        assert not pr_table.update.called, "writeback GHI ĐÈ uid có sẵn — sai"

    def test_writeback_skips_when_child_name_mismatch(self, monkeypatch):
        """tên bé trong AR ≠ child_name PR → PR.uid KHÔNG được fill."""
        pr = {"id": "PR-001", "uid": "", "name": "KH A", "phone": "09",
              "child_name": "Bé Một",
              "state": "done", "received": 1_000_000, "target": 1_000_000}
        sb, _ = _fake_sb(pr)
        # Tên bé trong AR ≠ "Bé Một"
        uids_in = [{"uid": "uid123", "name": "Bé Hai",
                    "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}]
        _save(sb, pr, uids_in, monkeypatch)

        pr_table = sb.table("payment_requests")
        assert not pr_table.update.called, "writeback điền nhầm uid bé 2 vào PR.uid"


# ---------------------------------------------------------------------------
# Zalo builder degrade — "UID: ?" không crash (GREEN hiện tại, giữ xanh)
# ---------------------------------------------------------------------------

class TestZaloBuilderDegradeWithEmptyUid:
    def test_builder_uid_empty_returns_question_mark(self):
        """uids_data có block uid="" → message chứa '?' không crash."""
        from utils.zalo_message_builder import build_activation_request_created_message
        ar_data = {
            "id": "AR-2026-0001",
            "uids_data": [{"uid": "", "courses": [{"name": "Gói ABC", "amount": 1_000_000}]}],
        }
        pr_data = {"id": "PR-001", "child_name": "Bé A", "phone": "09",
                   "lead_source": "online", "target": 1_000_000}
        sale_info = {"display_name": "Sale X", "crm_name": "Sale X", "team": "IH1"}
        result = build_activation_request_created_message(ar_data, pr_data, sale_info)
        assert isinstance(result, dict)
        assert "?" in result.get("message", "")


# ---------------------------------------------------------------------------
# Gate AR: Chưa báo hoàn thành -> chặn tạo AR (Task 4 — 5 cases per plan)
# ---------------------------------------------------------------------------

def _make_rep_table(sb, orig_side_effect, *, report_data):
    """Helper: wire pr_completion_reports table mock vào sb."""
    rep_table = MagicMock()
    rep_table.select.return_value = rep_table
    rep_table.eq.return_value = rep_table
    rep_table.limit.return_value = rep_table
    rep_table.execute.return_value = MagicMock(data=report_data)

    def side_effect(name):
        if name == "pr_completion_reports":
            return rep_table
        return orig_side_effect(name)

    sb.table.side_effect = side_effect


class TestARCompletionReportGate:
    """5 cases đúng theo plan Task 4."""

    # Case 1: chưa báo → 400 (env set ="1" tường minh)
    def test_gate_blocks_ar_when_no_completion_report(self, monkeypatch):
        """Flag bật tường minh (="1"), không có report → 400."""
        monkeypatch.setenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "1")
        pr = {"id": "PR-001", "uid": "uid123", "name": "KH A", "state": "done", "received": 1000, "target": 1000}
        sb, _ = _fake_sb(pr)
        _make_rep_table(sb, sb.table.side_effect, report_data=[])

        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 1000}]}]
        with pytest.raises(HTTPException) as exc:
            ar._save_active_request(sb, pr_id=pr["id"], uids_in=uids_in, require_paid_pr=True)

        assert exc.value.status_code == 400
        assert "Chưa báo đơn hoàn thành" in exc.value.detail

    # Case 2: đã báo → OK
    def test_gate_passes_when_completion_report_exists(self, monkeypatch):
        """Flag bật, có report → passes bình thường."""
        monkeypatch.setenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "1")
        pr = {"id": "PR-001", "uid": "uid123", "name": "KH A", "state": "done", "received": 1000, "target": 1000}
        sb, _ = _fake_sb(pr)
        _make_rep_table(sb, sb.table.side_effect, report_data=[{"id": "rep-1", "seq": 1}])

        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 1000}]}]
        saved, _ = ar._save_active_request(sb, pr_id=pr["id"], uids_in=uids_in, require_paid_pr=True)
        assert saved is not None

    # Case 3: flag off (="0") → passes kể cả không có report
    def test_gate_skipped_when_disabled(self, monkeypatch):
        """Set =\"0\" → kill-switch tắt gate, tạo AR được dù chưa báo."""
        monkeypatch.setenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "0")
        pr = {"id": "PR-001", "uid": "uid123", "name": "KH A", "state": "done", "received": 1000, "target": 1000}
        sb, _ = _fake_sb(pr)
        # KHÔNG wire pr_completion_reports — nếu gate chạy sẽ lỗi KeyError
        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 1000}]}]
        saved, _ = ar._save_active_request(sb, pr_id=pr["id"], uids_in=uids_in, require_paid_pr=True)
        assert saved is not None

    # Case 4: standalone AR (pr_id=None) → KHÔNG gate dù flag bật
    def test_gate_not_applied_for_standalone_ar(self, monkeypatch):
        """AR không gắn PR (pr_id=None) → gate không chạy, tạo được ngay.

        Quan trọng: bắt lỗi hồi quy nếu ai sửa nhầm điều kiện if pr_id: trong _save_active_request.
        """
        # KHÔNG set env → default bật (mặc định "1" per spec)
        monkeypatch.delenv("REQUIRE_COMPLETION_REPORT_FOR_AR", raising=False)
        sb, _ = _fake_sb({"id": None, "uid": "uid123", "name": "KH A", "state": "done", "received": 0, "target": 0})
        # KHÔNG wire pr_completion_reports — nếu gate chạy sẽ crash/fail
        uids_in = [{"uid": "uid123", "courses": [{"name": "Gói ABC", "amount": 0}]}]
        # Standalone AR: pr_id=None, require_paid_pr=False (đây là path standalone)
        saved, _ = ar._save_active_request(sb, pr_id=None, uids_in=uids_in, require_paid_pr=False)
        assert saved is not None

    # Case 5: backfill report (reported_by=system-backfill) → passes giống report thật
    def test_gate_passes_with_backfill_report(self, monkeypatch):
        """Report có reported_by='system-backfill' (từ Task 2) được chấp nhận như report thật."""
        monkeypatch.setenv("REQUIRE_COMPLETION_REPORT_FOR_AR", "1")
        pr = {"id": "PR-999", "uid": "uid999", "name": "KH B", "state": "done", "received": 5000, "target": 5000}
        sb, _ = _fake_sb(pr)
        # Giả lập backfill report: seq=1, reported_by=system-backfill
        _make_rep_table(sb, sb.table.side_effect, report_data=[{
            "id": "backfill-rep-1",
            "seq": 1,
            "reported_by": "system-backfill",
            "reason": "Backfill tự động: PR đã có AR trước khi tính năng báo đơn được triển khai.",
        }])

        uids_in = [{"uid": "uid999", "courses": [{"name": "Gói XYZ", "amount": 5000}]}]
        saved, _ = ar._save_active_request(sb, pr_id=pr["id"], uids_in=uids_in, require_paid_pr=True)
        assert saved is not None
