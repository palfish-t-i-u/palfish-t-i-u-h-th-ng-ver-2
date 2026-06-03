"""
OTHER-01 → OTHER-08: Verify Giang's miscellaneous fixes.

Covers: webhook HMAC, PayOS order_code collision, CRM token encryption,
audit logging, export idempotency, env defaults, team list.

Baseline: 8531f62
"""

from __future__ import annotations

import hashlib
import hmac
import importlib
import inspect
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    import main as main_mod

    importlib.reload(main_mod)
    return TestClient(main_mod.app, raise_server_exceptions=False)


# ─────────────────────────────────────────────
# OTHER-01 · PayOS webhook phải verify HMAC signature
# ─────────────────────────────────────────────
# Tình huống: Ai đó biết URL webhook → gửi thông báo giả
# "đơn X đã thanh toán" → hệ thống tin → doanh thu ảo.

class TestOTHER01_WebhookHmacVerification:

    def test_webhook_without_signature_rejected(self, client):
        """
        POST /webhook/payos với payload hợp lệ nhưng KHÔNG CÓ signature
        → phải bị reject (400/401/403), không được xử lý.
        """
        fake_payload = {
            "code": "00",
            "data": {
                "orderCode": 123456,
                "amount": 500000,
                "description": "Thanh toan KH001",
                "status": "PAID",
            },
        }
        resp = client.post("/webhook/payos", json=fake_payload)

        # Nếu server trả 200 + matched=True → đang tin payload giả
        if resp.status_code == 200:
            body = resp.json()
            if body.get("matched") or body.get("error") == 0:
                pytest.fail(
                    "OTHER-01 FAIL: Webhook PayOS chấp nhận payload không có signature. "
                    "Attacker gửi thông báo giả 'đã thanh toán' → hệ thống tự đánh dấu "
                    "đơn = done → doanh thu ảo, ops không đòi tiền khách."
                )

    def test_webhook_with_wrong_signature_rejected(self, client):
        """
        POST /webhook/payos với signature sai → phải reject.
        """
        fake_payload = {
            "code": "00",
            "data": {
                "orderCode": 999999,
                "amount": 1000000,
                "status": "PAID",
            },
        }
        resp = client.post(
            "/webhook/payos",
            json=fake_payload,
            headers={"x-payos-signature": "definitely-wrong-signature"},
        )

        if resp.status_code == 200:
            body = resp.json()
            if body.get("matched") or body.get("error") == 0:
                pytest.fail(
                    "OTHER-01 FAIL: Webhook chấp nhận signature sai. "
                    "Bất kỳ ai cũng giả được webhook PayOS."
                )


# ─────────────────────────────────────────────
# OTHER-02 · PayOS order_code không được trùng khi gọi đồng thời
# ─────────────────────────────────────────────
# Tình huống: Sale An gửi QR cho khách A, sale Bình gửi QR cho khách B
# cùng mili giây → trùng mã → PayOS reject hoặc link bị nhầm.

class TestOTHER02_OrderCodeNoCollision:

    def test_order_code_not_just_timestamp(self):
        """
        order_code không nên chỉ dựa vào time.time() * 1000 (trùng khi cùng ms).
        Cần có random hoặc DB sequence.
        """
        from payos_qr import create_payos_payment_link

        source = inspect.getsource(create_payos_payment_link)

        uses_pure_timestamp = bool(
            re.search(r'time\.time\(\)\s*\*\s*1000', source)
        )
        has_randomness_or_sequence = bool(
            re.search(r'(random|uuid|sequence|nextval|\.rpc\()', source, re.I)
        )

        if uses_pure_timestamp and not has_randomness_or_sequence:
            pytest.fail(
                "OTHER-02 FAIL: order_code vẫn chỉ dùng timestamp (ms). "
                "2 sale gửi link QR cùng lúc → trùng mã → PayOS reject link thứ 2 "
                "hoặc tệ hơn: link bị map nhầm sang đơn khác."
            )

    def test_concurrent_order_codes_unique(self):
        """
        Tạo 50 order_code đồng thời → tất cả phải khác nhau.
        """
        from payos_qr import create_payos_payment_link

        source = inspect.getsource(create_payos_payment_link)

        # Extract the order_code generation logic
        match = re.search(
            r'order_code\s*=\s*(.+?)$',
            source, re.M,
        )
        if not match:
            pytest.skip("Không tìm thấy dòng order_code = ... trong source")

        expr = match.group(1).strip()

        codes = set()
        for _ in range(50):
            try:
                import random
                code = eval(expr, {"time": time, "random": random, "int": int})
                codes.add(code)
            except Exception:
                pytest.skip(f"Không eval được expression: {expr}")

        if len(codes) < 45:
            pytest.fail(
                f"OTHER-02 FAIL: Tạo 50 order_code nhưng chỉ có {len(codes)} mã khác nhau. "
                "Nhiều link QR sẽ bị trùng mã khi tạo cùng lúc."
            )


# ─────────────────────────────────────────────
# OTHER-03 · CRM token phải được encrypt trong DB
# ─────────────────────────────────────────────
# Tình huống: DB bị lộ → ai cũng đọc được cookie CRM PalFish
# → đăng nhập vào CRM bằng tài khoản công ty.

class TestOTHER03_CrmTokenEncrypted:

    def test_crm_token_not_stored_plaintext(self):
        """
        Code lưu CRM token phải encrypt trước khi insert vào DB.
        """
        import crm_routes as crm_mod

        source = inspect.getsource(crm_mod)

        # Find where token is written to DB
        token_writes = re.findall(
            r'(?:\.insert|\.update|\.upsert)\s*\([^)]*(?:cookie|token|headers|auth_bundle)[^)]*\)',
            source, re.I | re.S,
        )

        has_encryption = bool(
            re.search(r'(encrypt|Fernet|cipher|AES|fernet|crypto)', source, re.I)
        )

        if token_writes and not has_encryption:
            pytest.fail(
                "OTHER-03 FAIL: CRM token vẫn lưu plaintext vào DB. "
                "Nếu database bị lộ → kẻ tấn công đọc được cookie CRM → "
                "đăng nhập vào PalFish CRM bằng tài khoản công ty. "
                "Cần encrypt token bằng Fernet hoặc tương đương."
            )


# ─────────────────────────────────────────────
# OTHER-04 · Xoá doanh thu phải ghi audit log
# ─────────────────────────────────────────────
# Tình huống: Dòng doanh thu 50 triệu biến mất → không ai biết
# ai xoá, khi nào, dòng đó chứa gì.

class TestOTHER04_DeleteRevenueAuditLog:

    def test_delete_ledger_has_audit_log(self):
        """
        delete_ledger phải gọi _write_audit() hoặc tương đương.
        """
        import revenue_routes as rev_mod

        source = inspect.getsource(rev_mod)

        # Find the delete endpoint function
        delete_match = re.search(
            r'(def\s+delete_ledger\b.*?)(?=\ndef\s|\Z)',
            source, re.S,
        )
        if not delete_match:
            pytest.skip("Không tìm thấy function delete_ledger")

        delete_source = delete_match.group(1)

        has_audit = bool(
            re.search(r'(_write_audit|audit|log.*delete|insert.*audit)', delete_source, re.I)
        )

        if not has_audit:
            pytest.fail(
                "OTHER-04 FAIL: delete_ledger() không ghi audit log. "
                "Dòng doanh thu bị xoá → không có dấu vết: ai xoá, khi nào, "
                "dòng đó chứa gì. Không truy vết được khi xảy ra sai sót."
            )


# ─────────────────────────────────────────────
# OTHER-05 · Xuất hoá đơn batch phải idempotent
# ─────────────────────────────────────────────
# Tình huống: Ops bấm xuất → hệ thống đánh dấu 10 đơn = "Đã xuất HD"
# → tạo ZIP lỗi → ops không nhận file, không bấm xuất lại được.

class TestOTHER05_ExportBatchIdempotent:

    def test_export_batch_has_idempotency_mechanism(self):
        """
        export_batch phải có batch_id hoặc mechanism để retry.
        """
        import invoice_routes as inv_mod

        source = inspect.getsource(inv_mod)

        # Find export_batch or similar
        export_match = re.search(
            r'(def\s+(?:export_batch|batch_export|export_invoices)\b.*?)(?=\ndef\s|\Z)',
            source, re.S,
        )
        if not export_match:
            pytest.skip("Không tìm thấy function export_batch")

        export_source = export_match.group(1)

        has_idempotency = bool(
            re.search(
                r'(batch_id|idempoten|retry|already.*export|re.?export|export.*exist)',
                export_source, re.I,
            )
        )

        # Check if status update happens BEFORE file generation
        status_update_pos = None
        file_gen_pos = None
        for pattern, label in [
            (r'DA_XUAT_HD|đã xuất|status.*=.*export', "status_update"),
            (r'ZipFile|StreamingResponse|BytesIO|write_excel|_build_excel', "file_gen"),
        ]:
            m = re.search(pattern, export_source, re.I)
            if m:
                if label == "status_update":
                    status_update_pos = m.start()
                else:
                    file_gen_pos = m.start()

        if (
            status_update_pos is not None
            and file_gen_pos is not None
            and status_update_pos < file_gen_pos
            and not has_idempotency
        ):
            pytest.fail(
                "OTHER-05 FAIL: export_batch cập nhật trạng thái ĐÃ XUẤT HD trước khi tạo file. "
                "Nếu tạo file lỗi → đơn bị mark 'đã xuất' nhưng ops không nhận ZIP → "
                "không bấm xuất lại được, phải nhờ dev sửa DB. "
                "Cần thêm batch_id để retry hoặc đổi thứ tự: tạo file trước, mark sau."
            )


# ─────────────────────────────────────────────
# OTHER-06 · Bulk delete phải báo rõ cái nào xoá được, cái nào lỗi
# ─────────────────────────────────────────────
# Tình huống: Admin xoá 5 user cũ, lỗi giữa chừng → 3 đã xoá, 2 còn
# → admin không biết cái nào đã xoá.

class TestOTHER06_BulkDeletePartialResult:

    def test_bulk_delete_reports_partial_results(self):
        """
        Bulk delete phải trả về danh sách deleted + failed,
        không trả lỗi chung chung khi fail giữa chừng.
        """
        import admin_routes as admin_mod

        source = inspect.getsource(admin_mod)

        delete_match = re.search(
            r'(def\s+bulk_delete_auth_users\b.*?)(?=\n    @|\n    def\s|\ndef\s|\Z)',
            source, re.S,
        )
        if not delete_match:
            pytest.skip("Không tìm thấy function bulk_delete_auth_users")

        delete_source = delete_match.group(1)

        has_partial_tracking = bool(
            re.search(
                r'(deleted.*failed|failed.*deleted|results?\[|partial|success.*error)',
                delete_source, re.I,
            )
        )

        # Check if it just raises on first error
        raises_on_first = bool(
            re.search(r'raise\s+HTTPException.*delete', delete_source, re.I)
        )

        if not has_partial_tracking:
            pytest.fail(
                "OTHER-06 FAIL: Bulk delete không trả partial results. "
                "Admin xoá 5 user, lỗi ở user thứ 3 → 2 đã xoá nhưng admin "
                "chỉ thấy lỗi chung, không biết cái nào đã xoá cái nào chưa."
            )


# ─────────────────────────────────────────────
# OTHER-07 · APP_ENV phải default = development, không phải production
# ─────────────────────────────────────────────
# Tình huống: Setup server mới quên set APP_ENV → tự chạy production
# → gửi DingTalk thật, dùng PayOS thật, tạo giao dịch thật.

class TestOTHER07_EnvDefaultSafe:

    def test_app_env_defaults_to_development(self, monkeypatch):
        """
        Khi APP_ENV không set → phải mặc định development/sandbox,
        KHÔNG ĐƯỢC mặc định production.
        """
        monkeypatch.delenv("APP_ENV", raising=False)

        import env_utils

        importlib.reload(env_utils)

        env = env_utils.app_env()
        assert env != "production", (
            f"OTHER-07 FAIL: APP_ENV không set → mặc định '{env}' (production). "
            "Server mới chưa cấu hình sẽ tự chạy production → gửi DingTalk thật, "
            "dùng PayOS thật, vô tình tạo giao dịch thật khi dev test."
        )


# ─────────────────────────────────────────────
# OTHER-08 · Danh sách team loại trừ phải từ config + case-insensitive
# ─────────────────────────────────────────────
# Tình huống: CRM ghi "tele sale" (chữ thường) thay vì "Tele Sale"
# → nhân viên Thái lọt vào báo cáo VN → sai số liệu.

class TestOTHER08_TeamListConfigurable:

    def test_non_vn_teams_case_insensitive(self):
        """
        is_vn_sale_row phải loại trừ team Tele Sale (không phải VN)
        bất kể chữ hoa/thường: "Tele Sale", "tele sale", "TELE SALE".
        """
        from vn_staff import is_vn_sale_row

        variants = ["Tele Sale", "tele sale", "TELE SALE", "Tele sale"]
        results = {}
        for team_name in variants:
            row = {"team": team_name, "depart6_name": ""}
            results[team_name] = is_vn_sale_row(row)

        # Tất cả biến thể của "Tele Sale" phải bị loại trừ (return False)
        all_excluded = all(r is False for r in results.values())
        assert all_excluded, (
            f"OTHER-08 FAIL: Không loại trừ hết các biến thể Tele Sale: {results}. "
            "CRM ghi team name khác chữ hoa/thường → nhân viên Thái/Úc "
            "lọt vào báo cáo VN → sai số liệu doanh thu."
        )

    def test_non_vn_teams_not_hardcoded(self):
        """
        NON_VN_TEAMS nên đọc từ env/config, không hardcode trong code.
        """
        import vn_staff

        source = inspect.getsource(vn_staff)

        reads_from_env = bool(
            re.search(r'os\.getenv|os\.environ|config', source, re.I)
        )
        is_hardcoded = bool(
            re.search(r'frozenset\(\{["\'].*["\'].*\}\)', source)
        )

        if is_hardcoded and not reads_from_env:
            pytest.fail(
                "OTHER-08 FAIL: NON_VN_TEAMS vẫn hardcoded trong code. "
                "Thêm team mới (VD: 'Sales Lào') → phải sửa code và deploy lại. "
                "Cần đọc từ biến môi trường (NON_VN_TEAMS env var)."
            )
