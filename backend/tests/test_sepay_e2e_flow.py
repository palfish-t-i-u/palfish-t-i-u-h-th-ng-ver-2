"""End-to-end test luồng SePay theo góc nhìn kế toán + sale.

**Sale (chị Hoa)**: Tạo PR → nhận transfer_code (Base36 5 ký tự) → gửi QR cho PH.
**Phụ huynh**: chuyển khoản, nội dung CK chứa transfer_code.
**SePay** → webhook về app:
  - Tự match → payment_line=paid → PR=matched (state=`matched`).
  - Tiền lệch → needs_review, kế toán manual match.
  - mPOS settle về MB → ignore (đã đối soát qua mPOS rồi).
  - Duplicate webhook → bỏ qua, không double-credit.

Phủ:
- Webhook auto-match exact amount → payment_line.status='paid'
- Webhook code-match nhưng tiền sai → needs_review (KHÔNG mark paid)
- Webhook mPOS settle → ignored (KHÔNG match)
- Duplicate webhook → idempotent
- HMAC sai → 401
- Manual match từ list bank_transactions → discrepancy đúng
- Manual match GD đã matched → 400 (chặn double-match)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Fake supabase với chainable query — đủ cho bank_transactions + payment_lines
# ---------------------------------------------------------------------------
class Query:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.patch_data = None
        self.upsert_data = None
        self.upsert_kwargs = {}
        self._limit = None
        self._on_conflict = None

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

    def gte(self, *_a, **_k):
        return self

    def lte(self, *_a, **_k):
        return self

    def update(self, p):
        self.patch_data = p
        return self

    def upsert(self, row, on_conflict=None, ignore_duplicates=False, **_k):
        self.upsert_data = row
        self._on_conflict = on_conflict
        self.upsert_kwargs = {"ignore_duplicates": ignore_duplicates}
        return self

    def execute(self):
        matched = list(self.rows)
        for k, v in self.filters:
            if isinstance(v, list):
                matched = [r for r in matched if r.get(k) in v]
            else:
                matched = [r for r in matched if r.get(k) == v]

        if self.upsert_data is not None:
            key = self._on_conflict
            row = self.upsert_data
            if key:
                existing = next((r for r in self.rows if r.get(key) == row.get(key)), None)
                if existing:
                    if self.upsert_kwargs.get("ignore_duplicates"):
                        return MagicMock(data=[])
                    existing.update(row)
                    return MagicMock(data=[existing])
            self.rows.append(row)
            return MagicMock(data=[row])

        if self.patch_data is not None and self.filters:
            for r in matched:
                r.update(self.patch_data)
            return MagicMock(data=matched)

        if self._limit is not None:
            matched = matched[: self._limit]
        return MagicMock(data=matched)


class FakeSB:
    def __init__(self):
        self.tables = {
            "bank_transactions": [],
            "payment_lines": [
                {
                    "id": "line-exact",
                    "payment_request_id": "PR-2026-0099",
                    "amount": 5_000_000,
                    "method": "qr",
                    "status": "pending",
                    "transfer_code": "FHB9T",
                    "created_at": "2026-06-20T08:00:00+00:00",
                },
                {
                    "id": "line-amount-mismatch",
                    "payment_request_id": "PR-2026-0100",
                    "amount": 3_000_000,
                    "method": "qr",
                    "status": "pending",
                    "transfer_code": "ABC12",
                    "created_at": "2026-06-20T08:05:00+00:00",
                },
            ],
            "payment_requests": [
                {"id": "PR-2026-0099", "received": 0, "target": 5_000_000,
                 "state": "pending", "name": "PH A"},
                {"id": "PR-2026-0100", "received": 0, "target": 3_000_000,
                 "state": "pending", "name": "PH B"},
            ],
        }

    def table(self, name):
        return Query(self.tables.setdefault(name, []))


@pytest.fixture(autouse=True)
def _reset_sepay_router():
    """register_sepay_routes mutates module-level router (closures over sb).
    Reset routes giữa các test để tránh leak handler giữa các test (FastAPI
    sẽ pick handler ĐẦU TIÊN, dùng sb của test trước)."""
    import sepay_routes as sp_mod
    sp_mod.router.routes.clear()
    yield
    sp_mod.router.routes.clear()


def _build_client(sb):
    import sepay_routes as sp_mod

    app = FastAPI()
    sp_mod.register_sepay_routes(app, lambda: sb)
    return TestClient(app, raise_server_exceptions=False)


# ===========================================================================
# Webhook flow — happy path
# ===========================================================================
class TestSepayWebhookHappyPath:
    def test_exact_match_auto_credits_payment_line(self):
        """PH chuyển 5tr nội dung 'FHB9T' → line-exact=paid."""
        sb = FakeSB()
        client = _build_client(sb)

        payload = {
            "id": 1001,
            "gateway": "MBBank",
            "transactionDate": "2026-06-20 15:30:00",
            "transferAmount": 5_000_000,
            "content": "84989778983 PH A FHB9T",
            "accountNumber": "0123456789",
        }

        with patch("payment_request_routes.recompute_payment_request_totals") as rec:
            res = client.post("/webhook/sepay", json=payload)

        assert res.status_code == 200
        assert res.json() == {"success": True}
        # payment_line đã chuyển paid
        line = next(l for l in sb.tables["payment_lines"] if l["id"] == "line-exact")
        assert line["status"] == "paid"
        assert line["paid_at"] is not None
        # bank_transactions có 1 row, status=auto_matched
        assert len(sb.tables["bank_transactions"]) == 1
        assert sb.tables["bank_transactions"][0]["match_status"] == "auto_matched"
        assert sb.tables["bank_transactions"][0]["payment_line_id"] == "line-exact"
        # PR recompute được gọi (cập nhật received)
        rec.assert_called_once()

    def test_amount_mismatch_marks_needs_review_without_paying(self):
        """PH chuyển nhầm tiền (chuyển 4tr cho line 3tr) → needs_review."""
        sb = FakeSB()
        client = _build_client(sb)

        payload = {
            "id": 1002,
            "gateway": "MBBank",
            "transactionDate": "2026-06-20 16:00:00",
            "transferAmount": 4_000_000,  # khác 3tr line-amount-mismatch
            "content": "84912345678 ABC12",
        }

        with patch("payment_request_routes.recompute_payment_request_totals"):
            client.post("/webhook/sepay", json=payload)

        line = next(l for l in sb.tables["payment_lines"] if l["id"] == "line-amount-mismatch")
        # KHÔNG được mark paid khi tiền lệch
        assert line["status"] == "pending"
        assert sb.tables["bank_transactions"][0]["match_status"] == "needs_review"

    def test_no_matching_code_stays_pending(self):
        """Nội dung không chứa mã → status=pending để kế toán manual match sau."""
        sb = FakeSB()
        client = _build_client(sb)

        payload = {
            "id": 1003,
            "transferAmount": 1_000_000,
            "content": "Chuyen tien thuong cho be",
        }

        client.post("/webhook/sepay", json=payload)

        assert sb.tables["bank_transactions"][0]["match_status"] == "pending"
        assert sb.tables["bank_transactions"][0]["payment_line_id"] is None


# ===========================================================================
# mPOS settle về MB → SePay phải ignore (đã đối soát qua flow mPOS riêng)
# ===========================================================================
class TestSepayIgnoresMposSettlement:
    @pytest.mark.parametrize("content", [
        "MPOS SETTLE LOT 20260620",
        "KET TOAN MPOS ngay 20/06",
        "PAYOO SETTLE batch 042",
        "THANH TOAN THE MPOS 0612",
    ])
    def test_mpos_settle_patterns_ignored(self, content):
        sb = FakeSB()
        client = _build_client(sb)

        client.post("/webhook/sepay", json={
            "id": 9000 + hash(content) % 1000,
            "transferAmount": 50_000_000,
            "content": content,
        })

        assert sb.tables["bank_transactions"][0]["match_status"] == "ignored"
        # KHÔNG được đụng vào payment_lines
        for l in sb.tables["payment_lines"]:
            assert l["status"] == "pending"


# ===========================================================================
# Idempotent: cùng sepay_id gọi 2 lần → không double-credit
# ===========================================================================
class TestSepayIdempotency:
    def test_duplicate_webhook_does_not_double_credit(self):
        sb = FakeSB()
        client = _build_client(sb)

        payload = {
            "id": 7777,
            "transferAmount": 5_000_000,
            "content": "FHB9T",
        }

        with patch("payment_request_routes.recompute_payment_request_totals") as rec:
            client.post("/webhook/sepay", json=payload)
            client.post("/webhook/sepay", json=payload)

        # Chỉ 1 bank_transaction, payment_line chỉ paid 1 lần
        assert len(sb.tables["bank_transactions"]) == 1
        paid_lines = [l for l in sb.tables["payment_lines"] if l["status"] == "paid"]
        assert len(paid_lines) == 1
        # recompute không được gọi 2 lần (lần 2 skipped do ignore_duplicates)
        assert rec.call_count == 1


# ===========================================================================
# Security: HMAC + IP whitelist
# ===========================================================================
class TestSepaySecurity:
    def test_hmac_sai_bi_chan_401(self):
        sb = FakeSB()
        client = _build_client(sb)

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", "my_secret"):
            res = client.post(
                "/webhook/sepay",
                json={"id": 1, "transferAmount": 1000, "content": "x"},
                headers={
                    "x-sepay-signature": "sha256=invalid_hex",
                    "x-sepay-timestamp": str(int(time.time())),
                },
            )

        assert res.status_code == 401

    def test_hmac_dung_qua_duoc(self):
        sb = FakeSB()
        client = _build_client(sb)

        secret = "test_secret_key_123"
        body = b'{"id": 2, "transferAmount": 1000, "content": "FHB9T"}'
        ts = str(int(time.time()))
        sig = hmac.new(secret.encode(), ts.encode() + b"." + body,
                       hashlib.sha256).hexdigest()

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", secret):
            with patch("payment_request_routes.recompute_payment_request_totals"):
                res = client.post(
                    "/webhook/sepay",
                    content=body,
                    headers={
                        "x-sepay-signature": f"sha256={sig}",
                        "x-sepay-timestamp": ts,
                        "content-type": "application/json",
                    },
                )

        assert res.status_code == 200
        assert res.json() == {"success": True}

    def test_old_timestamp_bi_chan_anti_replay(self):
        """SePay yêu cầu reject request cũ hơn 5 phút (anti-replay)."""
        sb = FakeSB()
        client = _build_client(sb)

        old_ts = str(int(time.time()) - 600)  # 10 phút trước
        body = b'{"id": 3}'
        sig = hmac.new(b"secret", old_ts.encode() + b"." + body,
                       hashlib.sha256).hexdigest()

        with patch("sepay_routes.SEPAY_WEBHOOK_SECRET", "secret"):
            res = client.post(
                "/webhook/sepay",
                content=body,
                headers={
                    "x-sepay-signature": sig,
                    "x-sepay-timestamp": old_ts,
                    "content-type": "application/json",
                },
            )

        assert res.status_code == 401


# ===========================================================================
# Manual match — kế toán xử lý needs_review
# ===========================================================================
class TestKeToanManualMatch:
    def _seed_needs_review(self, sb):
        sb.tables["bank_transactions"].append({
            "txn_id": "txn-need-review-1",
            "sepay_id": 5555,
            "amount": 3_000_500,  # Lệch 500đ
            "match_status": "needs_review",
            "content": "84912345678 ABC12",
        })

    def test_ke_toan_ghep_thu_cong_thanh_cong(self):
        sb = FakeSB()
        self._seed_needs_review(sb)
        client = _build_client(sb)

        actor = MagicMock(email="ketoan@palfish.test", role="manager")
        with patch("sepay_routes.resolve_actor", return_value=actor), \
             patch("sepay_routes.require_module_write"), \
             patch("payment_request_routes.recompute_payment_request_totals"):
            res = client.patch(
                "/api/v1/bank-transactions/txn-need-review-1/match"
                "?payment_line_id=line-amount-mismatch"
            )

        assert res.status_code == 200, res.text
        body = res.json()
        assert body["matched"] is True
        # Discrepancy = 3_000_500 - 3_000_000 = 500
        assert body["discrepancy_amount"] == 500

        # bank_transaction updated
        bank_txn = sb.tables["bank_transactions"][0]
        assert bank_txn["match_status"] == "manual_matched"
        assert bank_txn["payment_line_id"] == "line-amount-mismatch"
        assert bank_txn["matched_by"] == "ketoan@palfish.test"

        # payment_line marked paid
        line = next(l for l in sb.tables["payment_lines"]
                    if l["id"] == "line-amount-mismatch")
        assert line["status"] == "paid"

    def test_chan_ghep_lai_gd_da_matched(self):
        """GD đã auto/manual matched rồi → 400, không cho ghép lại."""
        sb = FakeSB()
        sb.tables["bank_transactions"].append({
            "txn_id": "txn-already",
            "match_status": "auto_matched",
            "amount": 5_000_000,
        })
        client = _build_client(sb)

        actor = MagicMock(email="ketoan@palfish.test", role="manager")
        with patch("sepay_routes.resolve_actor", return_value=actor), \
             patch("sepay_routes.require_module_write"):
            res = client.patch(
                "/api/v1/bank-transactions/txn-already/match"
                "?payment_line_id=line-exact"
            )

        assert res.status_code == 400
        assert "đã được khớp" in res.json()["detail"].lower() or \
               "matched" in res.json()["detail"].lower()


# ===========================================================================
# List & filter — kế toán xem danh sách
# ===========================================================================
class TestKeToanListBankTransactions:
    def test_filter_status_needs_review(self):
        sb = FakeSB()
        sb.tables["bank_transactions"].extend([
            {"txn_id": "t1", "match_status": "auto_matched",
             "amount": 1000, "content": "ok", "created_at": "2026-06-20"},
            {"txn_id": "t2", "match_status": "needs_review",
             "amount": 2000, "content": "lech", "created_at": "2026-06-20"},
            {"txn_id": "t3", "match_status": "pending",
             "amount": 3000, "content": "khong khop", "created_at": "2026-06-20"},
        ])
        client = _build_client(sb)

        actor = MagicMock(email="ketoan@palfish.test", role="manager")
        with patch("sepay_routes.resolve_actor", return_value=actor), \
             patch("sepay_routes.require_module_write"):
            res = client.get("/api/v1/bank-transactions?status=needs_review")

        assert res.status_code == 200
        rows = res.json()
        assert len(rows) == 1
        assert rows[0]["txn_id"] == "t2"
