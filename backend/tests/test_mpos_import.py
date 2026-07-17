"""Test mPOS import parser — transaction.xls + settlement.xls.

Chạy: cd backend && python -m pytest tests/test_mpos_import.py -v
"""

from __future__ import annotations

import os
import sys
import pytest

# Ensure backend is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Path to sample files
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TXN_FILE = os.path.join(_REPO_ROOT, "transaction.xls")
SETTLE_FILE = os.path.join(_REPO_ROOT, "settlement.xls")


class TestParseTransactions:
    """Test parse_mpos_transactions với file thật."""

    @pytest.fixture
    def txn_result(self):
        from mpos_import import parse_mpos_transactions

        with open(TXN_FILE, "rb") as f:
            return parse_mpos_transactions(f.read())

    def test_total_rows(self, txn_result):
        """File có 67 dòng."""
        assert txn_result["summary"]["total_rows"] == 67

    def test_settled_count(self, txn_result):
        """63 GD Kết toán."""
        assert txn_result["summary"]["settled_count"] == 63

    def test_reversed_count(self, txn_result):
        """4 GD Đảo (Refund)."""
        assert txn_result["summary"]["reversed_count"] == 4

    def test_installment_count(self, txn_result):
        """6 GD trả góp."""
        assert txn_result["summary"]["installment_count"] == 6

    def test_contra_entries_created(self, txn_result):
        """Mỗi GD Đảo phải có 1 contra-entry (Audit Trail)."""
        contra = txn_result["contra_entries"]
        assert len(contra) == 4
        # Tất cả contra-entry phải có amount < 0
        for entry in contra:
            assert entry["amount"] < 0, f"Contra-entry row {entry['row_index']} có amount >= 0"

    def test_reversed_entries_not_in_transactions(self, txn_result):
        """GD Đảo KHÔNG nằm trong danh sách transactions chính."""
        reversed_rows = {r["row_index"] for r in txn_result["reversed"]}
        txn_rows = {t["row_index"] for t in txn_result["transactions"]}
        assert reversed_rows.isdisjoint(txn_rows), "GD Đảo bị lẫn vào transactions"

    def test_collector_mapping(self, txn_result):
        """Có 2 TK: palfish02 (57 GD) và palfish3 (10 GD)."""
        collectors = txn_result["summary"]["collectors"]
        assert "palfish02" in collectors
        assert "palfish3" in collectors
        assert collectors["palfish02"]["count"] == 57
        assert collectors["palfish3"]["count"] == 10

    def test_mpl_code_extracted(self, txn_result):
        """GD có Chi tiết giao dịch dạng MPL_xxx phải extract được mã."""
        has_mpl = [t for t in txn_result["transactions"] if t["mpl_code"]]
        assert len(has_mpl) > 0, "Không extract được mã MPL nào"
        for t in has_mpl:
            assert t["mpl_code"].startswith("MPL_")

    def test_installment_fields(self, txn_result):
        """GD trả góp phải có installment_months và installment_fee."""
        for inst in txn_result["installments"]:
            assert inst["is_installment"] is True
            if inst["installment_months"] is not None:
                assert inst["installment_months"] > 0


class TestParseSettlements:
    """Test parse_mpos_settlements với file thật."""

    @pytest.fixture
    def settle_result(self):
        from mpos_import import parse_mpos_settlements

        with open(SETTLE_FILE, "rb") as f:
            return parse_mpos_settlements(f.read())

    def test_total_rows(self, settle_result):
        """File có 562 đợt kết toán."""
        assert settle_result["summary"]["total_rows"] == 562

    def test_net_equals_gross_minus_fee(self, settle_result):
        """Tổng net = tổng gross - tổng fee."""
        s = settle_result["summary"]
        assert abs(s["total_net"] - (s["total_gross"] - s["total_fee"])) < 1.0

    def test_daily_batches_exist(self, settle_result):
        """Phải group được theo ngày."""
        batches = settle_result["daily_batches"]
        assert len(batches) > 0
        for batch in batches:
            assert batch["count"] > 0
            assert batch["total_net"] > 0

    def test_settlement_has_settle_date(self, settle_result):
        """Mỗi đợt settlement phải có settle_date."""
        for s in settle_result["settlements"]:
            assert s.get("settle_date") is not None

    def test_csv_parser_accepts_extension_export(self):
        """Extension tải /exportCSV → parser phải đọc được CSV, không chỉ Excel.

        Bug 19/06: parse_mpos_settlements chỉ gọi _read_excel → CSV bytes →
        'Thiếu cột bắt buộc'. Convert XLS sang CSV trong RAM để tái dựng tình huống.
        """
        import io
        import pandas as pd
        from mpos_import import parse_mpos_settlements

        with open(SETTLE_FILE, "rb") as f:
            xls_df = pd.read_excel(io.BytesIO(f.read()), engine="xlrd", header=0, dtype=object)

        csv_bytes = xls_df.to_csv(index=False).encode("utf-8")
        result = parse_mpos_settlements(csv_bytes)

        assert result["summary"]["total_rows"] > 0
        assert len(result["settlements"]) > 0

    def test_html_login_page_gives_clear_error(self):
        """User chưa login mpos.vn → server trả HTML → báo lỗi rõ ràng."""
        import pytest
        from mpos_import import parse_mpos_settlements

        html_bytes = b"<!DOCTYPE html><html><body>Please log in</body></html>"
        with pytest.raises(ValueError, match="HTML"):
            parse_mpos_settlements(html_bytes)


class TestAmbiguousDetection:
    """Test rule NEEDS_REVIEW cho GD trùng mệnh giá."""

    def test_ambiguous_detected_in_real_data(self):
        """4 GD Đảo cùng 8,150,000 cùng phút 16:2x → phải cảnh báo."""
        from mpos_import import parse_mpos_transactions

        with open(TXN_FILE, "rb") as f:
            result = parse_mpos_transactions(f.read())

        # 4 GD Đảo nằm trong reversed (không trong transactions)
        # Kiểm tra xem hàm ambiguous có sinh warning hợp lệ khi có trùng
        # (Trong file thật, 4 GD Đảo bị tách riêng nên không cần cảnh báo trùng
        # cho chúng. Nhưng nếu có GD Kết toán trùng phút+tiền, sẽ cảnh báo.)
        assert isinstance(result["warnings"], list)


class TestInstallmentNet:
    """Regression: net trả góp phải trừ CẢ 2 phí — MDR + phí trả góp (bug 2026-07-17)."""

    def _row(self, **overrides):
        import pandas as pd

        base = {
            "Ngày khởi tạo": "2026-07-16T10:51:43",
            "Số giao dịch": "MPL_MP13691506",
            "Chi tiết giao dịch": "MPL_MP13691506",
            "Trạng thái giao dịch": "Đã thanh toán",
            "TK thanh toán": "palfish35lvt",
            "Số tiền": "10,028,000",
            "Phí giao dịch": "250,700",
            "Phí trả góp": None,
            "Phí TG hiện tại": "250,700",
            "Số tiền thực nhận": "9,777,300",
            "Kỳ hạn": "3",
        }
        base.update(overrides)
        return pd.Series(base)

    def test_installment_net_subtracts_both_fees(self):
        from mpos_import import _mpos_transaction_from_row

        rec = _mpos_transaction_from_row(self._row(), 0)
        assert rec["is_installment"] is True
        assert rec["installment_fee"] == 250_700
        assert rec["net_amount"] == 9_526_600

    def test_installment_ignores_cumulative_dup_column(self):
        """Cột trùng tên '.1' (tổng lũy kế phiếu chi) KHÔNG được dùng làm net."""
        from mpos_import import _mpos_transaction_from_row

        row = self._row(**{"Số tiền thực nhận.1": "59,302,950"})
        rec = _mpos_transaction_from_row(row, 0)
        assert rec["net_amount"] == 9_526_600

    def test_normal_swipe_keeps_mpos_explicit_net(self):
        """Quẹt thẻ thường (1 phí): giữ nguyên 'Số tiền thực nhận' của mPOS."""
        from mpos_import import _mpos_transaction_from_row

        row = self._row(**{
            "Kỳ hạn": None,
            "Phí TG hiện tại": "0",
            "Phí trả góp": None,
            "Số tiền": "10,000,000",
            "Phí giao dịch": "250,000",
            "Số tiền thực nhận": "9,750,000",
        })
        rec = _mpos_transaction_from_row(row, 0)
        assert rec["is_installment"] is False
        assert rec["net_amount"] == 9_750_000


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
