"""
AUTH-01 → AUTH-07: Verify Đạt's auth/permission fixes.

Strategy: Source-code analysis + HTTP probing.
- Primary: Check if route handlers accept `authorization` param AND call `resolve_actor()`.
- Secondary: Call endpoints without Authorization header → must get 401/403.

Baseline: 8531f62 (activation, reports, dashboard/filters, CRM token, payment transactions are unprotected)
"""

from __future__ import annotations

import importlib
import inspect
import re
from unittest.mock import MagicMock

import pytest


def _get_function_source(module, func_pattern: str) -> str | None:
    """Find a function by pattern in module source and return its source."""
    source = inspect.getsource(module)
    match = re.search(
        rf'(def\s+{func_pattern}\b.*?)(?=\n    def\s|\ndef\s|\Z)',
        source, re.S,
    )
    return match.group(1) if match else None


def _handler_has_auth(handler_source: str) -> bool:
    """Check if a handler calls resolve_actor or requires authorization."""
    return bool(
        re.search(r'resolve_actor|authorization.*Header|require_min_role', handler_source, re.I)
    )


# ─────────────────────────────────────────────
# AUTH-01 · Activation routes must require login
# ─────────────────────────────────────────────
# Tình huống: Nhân viên cũ (đã bị xoá tài khoản) gõ URL API trực tiếp
# → xem/tạo/xoá yêu cầu kích hoạt mà không cần đăng nhập.

class TestAUTH01_ActivationRequiresAuth:

    def test_list_active_requests_checks_auth(self):
        """GET /api/v1/active-requests phải yêu cầu đăng nhập."""
        import activation_routes as ar

        source = _get_function_source(ar, "list_active_requests")
        if source is None:
            # May be nested inside register function
            source = inspect.getsource(ar)
            match = re.search(
                r'(def\s+list_active_requests\b.*?)(?=\n    def\s|\ndef\s)',
                source, re.S,
            )
            source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-01 FAIL: list_active_requests() không kiểm tra đăng nhập. "
            "Nhân viên cũ (hoặc bất kỳ ai biết URL) vẫn xem được toàn bộ "
            "danh sách yêu cầu kích hoạt. Cần thêm resolve_actor()."
        )

    def test_create_active_request_checks_auth(self):
        """POST /api/v1/active-requests phải yêu cầu đăng nhập."""
        import activation_routes as ar

        full_source = inspect.getsource(ar)
        match = re.search(
            r'(def\s+create_(?:standalone_)?active_request\b.*?)(?=\n    def\s|\ndef\s)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-01 FAIL: create_active_request() không kiểm tra đăng nhập. "
            "Ai cũng tạo được yêu cầu kích hoạt giả."
        )

    def test_delete_active_request_checks_auth(self):
        """DELETE /api/v1/active-requests/{id} phải yêu cầu đăng nhập."""
        import activation_routes as ar

        full_source = inspect.getsource(ar)
        match = re.search(
            r'(def\s+delete_active_request\b.*?)(?=\n    def\s|\ndef\s)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-01 FAIL: delete_active_request() không kiểm tra đăng nhập. "
            "Ai cũng xoá được yêu cầu kích hoạt của người khác."
        )


# ─────────────────────────────────────────────
# AUTH-02 · BC03 report must require login
# ─────────────────────────────────────────────
# Tình huống: Gõ /reports/bc03 vào trình duyệt
# → xem hết doanh thu toàn công ty mà không cần đăng nhập.

class TestAUTH02_ReportBC03RequiresAuth:

    def test_bc03_checks_auth(self):
        """GET /reports/bc03 phải yêu cầu đăng nhập — dữ liệu mật."""
        import report_routes as rr

        full_source = inspect.getsource(rr)
        match = re.search(
            r'(def\s+report_bc03\b.*?)(?=\n    def\s|\ndef\s)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-02 FAIL: report_bc03() không kiểm tra đăng nhập. "
            "Doanh thu theo từng sale/team/tháng bị lộ cho bất kỳ ai biết URL."
        )


# ─────────────────────────────────────────────
# AUTH-03 · CRM token update must require manager+
# ─────────────────────────────────────────────
# Tình huống: Ai đó gửi POST /system/update-crm-token với token giả
# → phá hỏng luồng đồng bộ CRM PalFish.

class TestAUTH03_CrmTokenRequiresAuth:

    def test_update_crm_token_checks_auth(self):
        """POST /system/update-crm-token phải yêu cầu manager+."""
        import crm_routes as crm

        full_source = inspect.getsource(crm)
        match = re.search(
            r'(def\s+update_crm_token\b.*?)(?=\n    def\s|\ndef\s|\Z)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-03 FAIL: update_crm_token() không kiểm tra đăng nhập. "
            "Bất kỳ ai biết URL đều ghi đè được CRM token → phá hỏng "
            "toàn bộ luồng đồng bộ CRM PalFish (Module 5)."
        )

    def test_update_crm_token_requires_manager_role(self):
        """CRM token endpoint nên yêu cầu ít nhất role manager."""
        import crm_routes as crm

        full_source = inspect.getsource(crm)
        match = re.search(
            r'(def\s+update_crm_token\b.*?)(?=\n    def\s|\ndef\s|\Z)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        has_role_check = bool(
            re.search(r'(role_level.*>=?\s*3|require_min_role.*manager|manager.*role)', source, re.I)
        )
        has_any_auth = _handler_has_auth(source)

        if has_any_auth and not has_role_check:
            pytest.fail(
                "AUTH-03 WARNING: update_crm_token có auth nhưng không check role. "
                "Sale bình thường cũng có thể ghi đè CRM token. Nên giới hạn cho manager+."
            )


# ─────────────────────────────────────────────
# AUTH-04 · Payment transaction endpoints must require auth
# ─────────────────────────────────────────────
# Tình huống: Sale tự đánh dấu phiếu thu = "đã thanh toán"
# dù khách chưa chuyển tiền → doanh thu ảo.

class TestAUTH04_PaymentTransactionsRequireAuth:

    def _get_handler_source(self, func_name_pattern: str) -> str:
        """Extract function body from payment_request_routes by pattern."""
        import payment_request_routes as pr

        full_source = inspect.getsource(pr)
        # Match nested functions (indented) — look for next def at same or lower indent
        match = re.search(
            rf'(def\s+{func_name_pattern}\b[^:]*:.*?)(?=\n    @|\n    def\s|\ndef\s|\Z)',
            full_source, re.S,
        )
        return match.group(1) if match else ""

    def test_patch_transaction_status_checks_auth(self):
        """PATCH /transactions/{id}/status phải kiểm tra quyền."""
        source = self._get_handler_source(r'patch_transaction_status')
        assert source, "Không tìm thấy function patch_transaction_status"
        assert _handler_has_auth(source), (
            "AUTH-04 FAIL: patch_transaction_status() không kiểm tra quyền. "
            "Sale có thể tự đánh dấu phiếu thu = 'đã thanh toán' dù khách chưa "
            "chuyển tiền → doanh thu ảo."
        )

    def test_sync_pending_payos_checks_auth(self):
        """POST /sync-pending-payos phải kiểm tra quyền."""
        source = self._get_handler_source(r'sync_pending_payos\w*')
        assert source, "Không tìm thấy function sync_pending_payos"
        assert _handler_has_auth(source), (
            "AUTH-04 FAIL: sync_pending_payos không kiểm tra quyền. "
            "Ai cũng trigger được đồng bộ PayOS."
        )

    def test_delete_bill_checks_auth(self):
        """DELETE /payment-lines/{id}/bills/latest phải kiểm tra quyền."""
        import payment_request_routes as pr

        full_source = inspect.getsource(pr)
        # Find the handler registered on the delete bills route
        match = re.search(
            r'@router\.delete\(["\'].*bills.*["\']\)\s*\n\s*(def\s+\w+[^:]*:.*?)(?=\n    @|\n    def\s|\ndef\s|\Z)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""
        assert source, "Không tìm thấy delete bill handler"
        assert _handler_has_auth(source), (
            "AUTH-04 FAIL: Endpoint xoá bill không kiểm tra quyền. "
            "Ai cũng xoá được ảnh bill thanh toán của người khác."
        )


# ─────────────────────────────────────────────
# AUTH-05 · Dashboard filters must require login
# ─────────────────────────────────────────────
# Tình huống: Gõ /dashboard/filters → thấy toàn bộ tên team/sale.

class TestAUTH05_DashboardFiltersRequiresAuth:

    def test_dashboard_filters_checks_auth(self):
        """GET /dashboard/filters phải yêu cầu đăng nhập."""
        import dashboard_routes as dr

        full_source = inspect.getsource(dr)
        match = re.search(
            r'(def\s+(?:get_)?(?:dashboard_)?filters\b.*?)(?=\n    def\s|\ndef\s)',
            full_source, re.S,
        )
        source = match.group(1) if match else ""

        assert _handler_has_auth(source), (
            "AUTH-05 FAIL: /dashboard/filters không kiểm tra đăng nhập. "
            "Cấu trúc phòng ban, danh sách sale bị lộ cho bất kỳ ai."
        )


# ─────────────────────────────────────────────
# AUTH-06 · CORS must not allow arbitrary Vercel domains
# ─────────────────────────────────────────────
# Tình huống: Attacker tạo evil.vercel.app → dụ sale vào
# → trang đó gọi API dưới danh nghĩa sale.

class TestAUTH06_CORSNotTooWide:

    def test_cors_regex_not_wildcard_vercel(self):
        """
        CORS regex không nên match mọi *.vercel.app.
        Phải giới hạn theo project name (palfish, pf-gmv, etc).
        """
        import main as main_mod

        source = inspect.getsource(main_mod)

        # Match patterns like: https://.*\.vercel\.app (allows ANY vercel subdomain)
        overly_broad = re.search(
            r'allow_origin_regex.*https://\.\*.*vercel',
            source,
        )

        if overly_broad:
            pytest.fail(
                "AUTH-06 FAIL: CORS regex cho phép MỌI *.vercel.app. "
                "Attacker tạo evil-phishing.vercel.app, dụ sale vào → "
                "trang đó gọi API với token/cookie của sale → đánh cắp dữ liệu. "
                "Cần siết regex: chỉ cho phép pf-gmv* hoặc palfish*."
            )


# ─────────────────────────────────────────────
# AUTH-07 · _lookup_staff should not fetch 500 null-email rows
# ─────────────────────────────────────────────
# Tình huống: Mỗi request API đều đọc thừa 500 dòng nhân sự
# có email = null → lãng phí, làm chậm app.

class TestAUTH07_NoWastedStaffQuery:

    def test_lookup_staff_no_null_email_query(self):
        """_lookup_staff không nên fetch rows có email = NULL khi không tìm thấy match."""
        from rbac import _lookup_staff

        source = inspect.getsource(_lookup_staff)

        has_null_query = bool(
            re.search(r'is_\(\s*["\']email["\'].*["\']null["\']', source, re.I)
        )

        if has_null_query:
            pytest.fail(
                "AUTH-07 FAIL: _lookup_staff vẫn fetch 500 rows có email=NULL. "
                "Mỗi request kiểm tra quyền đều đọc thừa 500 dòng vô nghĩa → "
                "chậm thêm vài chục ms/request và tạo tải thừa lên database."
            )
