"""Edge-case test parser mPOS + Payoo — KHÔNG cần file thật.

Góc nhìn kế toán (chị Lan):
- Upload file mPOS/Payoo từ extension đẩy về → app parse.
- Cần handle: VN locale (dấu chấm/phẩy ngược), CSV thay vì xlsx,
  HTML page khi chưa login, GD Đảo (refund), GD trùng phút+tiền (NEEDS_REVIEW).
- Payoo JSON từ extension auto-fetch (OrderList[]): missing field, installment.

Khác `test_mpos_import.py` (dùng file .xls thật ngoài repo): file này sinh
data inline để chạy CI mà không cần fixture binary.
"""

from __future__ import annotations

import io
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from mpos_import import (  # noqa: E402
    _parse_amount,
    _is_reversed,
    _is_settled,
    _detect_format,
    _check_ambiguous_matches,
    parse_mpos_settlements,
    parse_payoo_orders,
)


# ===========================================================================
# Amount parser — VN locale traps (DingTalk export, mPOS, Payoo)
# ===========================================================================
class TestParseAmountVnLocale:
    @pytest.mark.parametrize("text,expected", [
        ("9080000", 9_080_000),
        ("9,080,000", 9_080_000),       # US thousand sep
        ("9.080.000", 9_080_000),       # VN thousand sep (DingTalk bug!)
        ("9.080.000,50", 9_080_000.5),  # VN: dấu phẩy = thập phân
        ("9,080,000.50", 9_080_000.5),  # US: dấu chấm = thập phân
        ("0", 0),
        ("", 0),
        ("abc", 0),
        ("  9 080 000 ", 9_080_000),    # non-breaking space + space
        ("-1500", -1500),                # số âm giữ nguyên (dùng cho contra-entry)
    ])
    def test_parse_amount_locale_safe(self, text, expected):
        assert _parse_amount(text) == expected

    def test_dingtalk_locale_bug_handled(self):
        """DingTalk export GMV dạng '9.080.000' thay vì '9080000'.
        Bug đã gặp 2026-05: amount nhân 1000 do parser tưởng là decimal."""
        assert _parse_amount("9.080.000") == 9_080_000  # Không phải 9.08
        assert _parse_amount("9.08") == 9.08              # Vẫn parse đúng decimal nhỏ


# ===========================================================================
# Status logic — Đảo (refund) phải tách khỏi list chính
# ===========================================================================
class TestReversedStatus:
    @pytest.mark.parametrize("status,expected", [
        ("Đảo", True),
        ("dao", True),
        ("Đã đảo", True),
        ("ĐẢO ", True),
        ("Kết toán", False),
        ("Thành công", False),
        ("", False),
    ])
    def test_is_reversed(self, status, expected):
        assert _is_reversed(status) == expected

    def test_kettoan_status_is_settled(self):
        assert _is_settled("Kết toán") is True
        assert _is_settled("KET TOAN") is True

    def test_dao_status_not_settled(self):
        assert _is_settled("Đảo") is False


# ===========================================================================
# Format detection — extension đẩy về có thể xlsx/xls/csv/HTML(chưa login)
# ===========================================================================
class TestDetectFormat:
    def test_xlsx_magic_bytes(self):
        assert _detect_format(b"PK\x03\x04rest") == "xlsx"

    def test_xls_magic_bytes(self):
        assert _detect_format(b"\xD0\xCF\x11\xE0rest") == "xls"

    def test_html_login_page(self):
        assert _detect_format(b"<!doctype html><html>...") == "html"
        assert _detect_format(b"  <html>...") == "html"

    def test_csv_default(self):
        assert _detect_format(b"col1,col2\n1,2") == "csv"


# ===========================================================================
# parse_mpos_settlements — error path khi user chưa login mpos.vn
# ===========================================================================
class TestMposSettlementErrorPath:
    def test_html_chua_login_loi_ro_rang(self):
        """Extension fetch không có session → server trả HTML → ValueError."""
        html = b"<!DOCTYPE html><html><body>Please log in</body></html>"
        with pytest.raises(ValueError, match="HTML"):
            parse_mpos_settlements(html)

    def test_csv_thieu_cot_bat_buoc(self):
        csv = b"col_random,gia_tri\nhello,123"
        with pytest.raises(ValueError, match="Thiếu cột bắt buộc"):
            parse_mpos_settlements(csv)


# ===========================================================================
# parse_mpos_settlements — happy path từ CSV inline (bug 19/6 reproduce)
# ===========================================================================
class TestMposSettlementCsv:
    def test_csv_parse_minimal(self):
        """Format mới mpos.vn /exportCSV (9 cột)."""
        df = pd.DataFrame([
            {"Mã phiếu chi": "MPOS-001", "Ngày khởi tạo": "20/06/2026",
             "Số tiền": "10.000.000", "Phí giao dịch": "150,000",
             "Phí trả góp": "0", "Phí chuyển tiền": "0",
             "Số tiền thực nhận": "9.850.000", "Ngân hàng": "MB",
             "Chi nhánh": "HCM", "Số tài khoản": "0123",
             "Tên cửa hàng": "Palfish HCM"},
            {"Mã phiếu chi": "MPOS-002", "Ngày khởi tạo": "20/06/2026",
             "Số tiền": "5.000.000", "Phí giao dịch": "75,000",
             "Phí trả góp": "0", "Phí chuyển tiền": "0",
             "Số tiền thực nhận": "4.925.000", "Ngân hàng": "MB",
             "Chi nhánh": "HCM", "Số tài khoản": "0123",
             "Tên cửa hàng": "Palfish HCM"},
        ])
        csv_bytes = df.to_csv(index=False).encode("utf-8")

        result = parse_mpos_settlements(csv_bytes)

        assert result["summary"]["total_rows"] == 2
        assert result["summary"]["total_gross"] == 15_000_000
        # net = gross - fee
        assert abs(result["summary"]["total_net"] -
                   (result["summary"]["total_gross"] - result["summary"]["total_fee"])) < 1
        # Group theo ngày
        assert len(result["daily_batches"]) == 1
        assert result["daily_batches"][0]["count"] == 2

    def test_missing_settlement_code_generates_fallback(self):
        """Mã phiếu chi rỗng → parser tự sinh code (không drop row)."""
        df = pd.DataFrame([
            {"Mã phiếu chi": "", "Ngày khởi tạo": "20/06/2026",
             "Số tiền": "1.000.000", "Phí giao dịch": "10000",
             "Số tiền thực nhận": "990000", "Ngân hàng": "MB",
             "Chi nhánh": "HCM", "Số tài khoản": "0123",
             "Tên cửa hàng": "Palfish HCM"},
        ])
        result = parse_mpos_settlements(df.to_csv(index=False).encode("utf-8"))
        assert len(result["settlements"]) == 1
        assert result["settlements"][0]["settlement_code"].startswith("MPOS-SETTLE-")


# ===========================================================================
# parse_payoo_orders — JSON OrderList[] từ extension auto-fetch
# ===========================================================================
class TestPayooOrdersJson:
    def test_parse_empty_list(self):
        result = parse_payoo_orders([])
        assert result["transactions"] == []
        assert result["summary"]["total_rows"] == 0

    def test_parse_none_input(self):
        result = parse_payoo_orders(None)
        assert result["transactions"] == []

    def test_skip_order_thieu_OrderNo(self):
        """Order không có mã → skip, không crash."""
        result = parse_payoo_orders([
            {"OrderNo": "OD-001", "MoneyAmount": 1_000_000,
             "MoneyAmountAfterFee": 990_000},
            {"MoneyAmount": 500_000},  # missing OrderNo
            {},                          # rỗng
            "not a dict",                # invalid type
        ])
        assert len(result["transactions"]) == 1
        assert result["transactions"][0]["txn_code"] == "OD-001"

    def test_phan_loai_truc_tuyen_vs_tra_gop(self):
        """InstallmentBankName/InstallmentPeriod có giá trị → category=Trả góp."""
        result = parse_payoo_orders([
            {"OrderNo": "OD-ONL", "MoneyAmount": 1_000_000,
             "MoneyAmountAfterFee": 990_000},
            {"OrderNo": "OD-INS", "MoneyAmount": 12_000_000,
             "MoneyAmountAfterFee": 11_400_000,
             "InstallmentBankName": "Sacombank", "InstallmentPeriod": 6},
        ])
        cats = {t["txn_code"]: t["category"] for t in result["transactions"]}
        assert cats["OD-ONL"] == "Trực tuyến"
        assert cats["OD-INS"] == "Trả góp"

    def test_paymentcustomername_phai_chi_la_tham_khao_khong_phai_khoa_ghep(self):
        """Theo handoff: PaymentCustomerName là tên user nhập, KHÔNG dùng làm key match.
        Test này chỉ verify field được copy sang cardholder_name (hiển thị) chứ
        không trở thành khoá ghép — match key vẫn là OrderNo."""
        result = parse_payoo_orders([
            {"OrderNo": "OD-X", "MoneyAmount": 5_000_000,
             "PaymentCustomerName": "Sale tu dat ten",
             "BankCardHolderName": "NGUYEN VAN A"},
        ])
        txn = result["transactions"][0]
        assert txn["txn_code"] == "OD-X"
        assert txn["cardholder_name"] == "Sale tu dat ten"  # ưu tiên Payment name

    def test_net_amount_tu_tinh_khi_thieu(self):
        """MoneyAmountAfterFee thiếu → tính amount - fee."""
        result = parse_payoo_orders([
            {"OrderNo": "OD-NOFEE", "MoneyAmount": 5_000_000,
             "TransactionFeeEcomer": 75_000},
        ])
        assert result["transactions"][0]["net_amount"] == 4_925_000


# ===========================================================================
# Ambiguous detection — 2 GD cùng phút + cùng mệnh giá → NEEDS_REVIEW
# ===========================================================================
class TestAmbiguousMatchDetection:
    def test_2_gd_trung_phut_va_tien_bao_warning(self):
        """Kế toán không thể tự match khi 2 GD identical → đánh dấu."""
        transactions = [
            {"row_index": 1, "amount": 5_000_000, "paid_at": "2026-06-20T15:30:00",
             "match_status": "pending"},
            {"row_index": 2, "amount": 5_000_000, "paid_at": "2026-06-20T15:30:45",
             "match_status": "pending"},
        ]
        warnings = []
        _check_ambiguous_matches(transactions, warnings)

        assert len(warnings) == 1
        assert "AMBIGUOUS" in warnings[0]
        assert all(t["match_status"] == "needs_review" for t in transactions)

    def test_khac_phut_thi_khong_bao(self):
        transactions = [
            {"row_index": 1, "amount": 5_000_000, "paid_at": "2026-06-20T15:30:00",
             "match_status": "pending"},
            {"row_index": 2, "amount": 5_000_000, "paid_at": "2026-06-20T15:31:00",
             "match_status": "pending"},
        ]
        warnings = []
        _check_ambiguous_matches(transactions, warnings)
        assert warnings == []
        assert all(t["match_status"] == "pending" for t in transactions)

    def test_cung_phut_khac_tien_thi_khong_bao(self):
        transactions = [
            {"row_index": 1, "amount": 5_000_000, "paid_at": "2026-06-20T15:30:00",
             "match_status": "pending"},
            {"row_index": 2, "amount": 5_000_001, "paid_at": "2026-06-20T15:30:45",
             "match_status": "pending"},
        ]
        warnings = []
        _check_ambiguous_matches(transactions, warnings)
        assert warnings == []
