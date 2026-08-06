"""Integration test cho luồng vận hành nghiệp vụ Referral.

Góc nhìn user:
- **Activator (Đức)**: vào B3 Kích hoạt khoá học → mở 1 AR có course nguồn
  "gioi_thieu" → tick checkbox "Đã cộng buổi cho người được giới thiệu"
  hoặc "Đã cộng buổi cho người giới thiệu".
- **Manager (Hiếu)**: nếu cộng nhầm, bỏ tick + ghi lý do.

BE endpoint: PATCH /api/v1/active-requests/{ar_id}/credit-referral

Cover luồng nghiệp vụ + edge case:
- Khoá chưa active (chưa có order_id) → từ chối cộng (TR T1.1)
- Khoá active rồi → cộng được
- Untick (revoke) phải kèm lý do
- AR/course không tồn tại → 404
- Side sai → 400
- Sale không có quyền → 403
"""

from __future__ import annotations

import contextlib
import os
import sys
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.patch_data = None
        self._limit = None

    def select(self, *_a, **_k):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def eq(self, k, v):
        self.filters.append((k, v))
        return self

    def in_(self, k, vs):
        self.filters.append((k, list(vs)))
        return self

    def update(self, p):
        self.patch_data = p
        return self

    def insert(self, p):
        self.patch_data = p
        self.rows.append(p)
        return self

    def execute(self):
        matched = list(self.rows)
        for k, v in self.filters:
            if isinstance(v, list):
                matched = [r for r in matched if r.get(k) in v]
            else:
                matched = [r for r in matched if r.get(k) == v]
        if self.patch_data is not None and self.filters:
            for r in matched:
                r.update(self.patch_data)
            return MagicMock(data=matched)
        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self, ar_rows=None):
        self.tables = {
            "active_requests": ar_rows or [],
            "payment_requests": [
                {
                    "id": "PR-2026-0099",
                    "name": "Phụ huynh A",
                    "uid": "BUYER_B",
                    "phone": "0900000000",
                    "received": 5_000_000,
                    "target": 5_000_000,
                    "state": "matched",
                    "sale_email": "sale@palfish.test",
                }
            ],
            "audit_logs": [],
            "ledger_active_courses": [],
        }

    def table(self, name):
        return Query(self.tables.setdefault(name, []))

    def rpc(self, *_a, **_k):
        return MagicMock(execute=MagicMock(return_value=MagicMock(data=[])))


def _ar_factory(*, with_order_id: bool, referrer="REFERRER_A"):
    return {
        "id": "AR-2026-0099",
        "pr_id": "PR-2026-0099",
        "customer_name": "Phụ huynh A",
        "created_at": "2026-06-20T08:00:00+00:00",
        "created_by": "sale@palfish.test",
        "uids_data": [
            {
                "uid": "BUYER_B",
                "phone": "0900000000",
                "country": "VN",
                "courses": [
                    {
                        "code": "CC-0099-001",
                        "name": "Gói X",
                        "amount": 5_000_000,
                        "order_id": "ORD-CRM-88901" if with_order_id else "",
                        "invoiced": False,
                        "lead_source": "gioi_thieu",
                        "referrer_uid": referrer,
                        "bonus_sessions_referee": 2,
                        "bonus_sessions_referrer": 3,
                    }
                ],
            }
        ],
    }


MANAGER_ACTOR = MagicMock(
    email="manager@palfish.test", role="manager", is_activated=True
)
SALE_ACTOR = MagicMock(email="sale@palfish.test", role="sale", is_activated=True)


def _build_app_with_ar(ar_row):
    import importlib
    import activation_routes as ar_mod

    ar_mod = importlib.reload(ar_mod)
    sb = FakeSB(ar_rows=[ar_row])
    app = FastAPI()
    ar_mod.register_activation_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False), sb


@contextlib.contextmanager
def _as_actor(actor):
    with patch("activation_routes.resolve_actor", return_value=actor), \
         patch("audit.log_audit"):
        yield


# ===========================================================================
# Luồng chính: Activator tick credit khi khoá đã active
# ===========================================================================
class TestActivatorCreditsReferralAfterActivation:
    def test_credit_referee_sau_khi_khoa_da_active_thanh_cong(self):
        client, sb = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": True},
            )

        assert res.status_code == 200, res.text
        course = sb.tables["active_requests"][0]["uids_data"][0]["courses"][0]
        assert course["referee_credited_at"] is not None
        assert course["referee_credited_by"] == "manager@palfish.test"

    def test_credit_ca_2_side_status_full(self):
        client, _sb = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": True},
            )
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referrer", "credited": True},
            )

        body = res.json()
        assert body.get("referralStatus") == "full" or body.get("referral_status") == "full"


# ===========================================================================
# Luồng chặn: TR T1.1 — khoá chưa active thì không cho cộng
# ===========================================================================
class TestBlockCreditWhenCourseNotActive:
    def test_chan_cong_khi_chua_co_order_id(self):
        client, sb = _build_app_with_ar(_ar_factory(with_order_id=False))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": True},
            )

        assert res.status_code == 400
        detail = res.json()["detail"].lower()
        assert "tạo gói học" in detail or "order id" in detail
        course = sb.tables["active_requests"][0]["uids_data"][0]["courses"][0]
        assert course.get("referee_credited_at") is None

    def test_van_cho_revoke_khi_khoa_da_rollback_order_id(self):
        """Đã cộng rồi nhưng order_id bị rollback → cho phép untick (sửa lỗi)."""
        ar = _ar_factory(with_order_id=False)
        ar["uids_data"][0]["courses"][0]["referee_credited_at"] = "2026-06-19T10:00:00Z"
        ar["uids_data"][0]["courses"][0]["referee_credited_by"] = "old@palfish.test"

        client, sb = _build_app_with_ar(ar)
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": False,
                      "reason": "Order ID đã bị rollback bên CRM"},
            )

        assert res.status_code == 200, res.text
        course = sb.tables["active_requests"][0]["uids_data"][0]["courses"][0]
        assert course["referee_credited_at"] is None


# ===========================================================================
# Revoke: phải kèm lý do, ghi audit log
# ===========================================================================
class TestRevokeCreditRequiresReason:
    def test_untick_thieu_reason_bi_chan(self):
        client, _ = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": False, "reason": ""},
            )

        assert res.status_code == 400
        detail = res.json()["detail"].lower()
        assert "lý do" in detail or "reason" in detail

    def test_untick_co_reason_thanh_cong(self):
        ar = _ar_factory(with_order_id=True)
        ar["uids_data"][0]["courses"][0]["referee_credited_at"] = "2026-06-19T10:00:00Z"
        ar["uids_data"][0]["courses"][0]["referee_credited_by"] = "manager@palfish.test"

        client, sb = _build_app_with_ar(ar)
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": False,
                      "reason": "Cộng nhầm UID, hoàn lại"},
            )

        assert res.status_code == 200, res.text
        course = sb.tables["active_requests"][0]["uids_data"][0]["courses"][0]
        assert course["referee_credited_at"] is None
        assert course["referee_credited_by"] is None


# ===========================================================================
# 404 / 400 cases
# ===========================================================================
class TestNotFoundAndValidation:
    def test_ar_khong_ton_tai_404(self):
        client, _ = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-KHONG-CO/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-X",
                      "side": "referee", "credited": True},
            )

        assert res.status_code == 404

    def test_course_khong_ton_tai_404(self):
        client, _ = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-KHONG-CO",
                      "side": "referee", "credited": True},
            )

        assert res.status_code == 404

    def test_side_invalid_400(self):
        client, _ = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(MANAGER_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "buyer", "credited": True},
            )

        assert res.status_code == 400


# ===========================================================================
# RBAC: Sale không có quyền cộng buổi (require_referral_credit chặn)
# ===========================================================================
class TestSaleCannotCreditReferral:
    def test_sale_role_bi_chan_403(self):
        client, _ = _build_app_with_ar(_ar_factory(with_order_id=True))
        with _as_actor(SALE_ACTOR):
            res = client.patch(
                "/api/v1/active-requests/AR-2026-0099/credit-referral",
                json={"uid": "BUYER_B", "course_code": "CC-0099-001",
                      "side": "referee", "credited": True},
            )

        assert res.status_code == 403
