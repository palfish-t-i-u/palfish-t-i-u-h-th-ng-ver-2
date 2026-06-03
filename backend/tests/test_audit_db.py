"""
DB-01 → DB-07: Verify Đức's database fixes.

Tests verify:
- Sequence allocation is atomic (no read-modify-write)
- JSONB updates are atomic
- Pagination is bounded
- KPI save is transactional

Baseline: 8531f62 (all sequences use read-modify-write pattern)
"""

from __future__ import annotations

import ast
import asyncio
import inspect
import re
import importlib
import sys
import textwrap
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


BACKEND_DIR = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────
# DB-01 · Mã đơn hàng phải dùng DB sequence, không read-modify-write
# ─────────────────────────────────────────────
# Tình huống: Sale An và sale Bình tạo đơn cùng lúc → cả hai nhận KH043 → trùng mã.

class TestDB01_OrderSequenceAtomic:

    def test_next_ma_don_does_not_read_then_increment(self):
        """
        Verify _next_ma_don() không còn pattern: select last → +1 → insert.
        Fix đúng = dùng nextval() / supabase.rpc() / DB function.
        """
        import main as main_mod

        source = inspect.getsource(main_mod._next_ma_don)

        has_select_then_compute = bool(
            re.search(r'\.select\(', source) and re.search(r'int\(m\.group\(1\)\)\s*\+\s*1', source)
        )
        has_rpc_or_nextval = bool(
            re.search(r'(\.rpc\(|nextval\(|CREATE\s+SEQUENCE)', source, re.I)
        )

        if has_select_then_compute and not has_rpc_or_nextval:
            pytest.fail(
                "DB-01 FAIL: _next_ma_don() vẫn dùng pattern cũ (đọc mã cuối → +1). "
                "2 sale tạo đơn cùng lúc sẽ nhận trùng mã đơn hàng. "
                "Cần chuyển sang Postgres sequence (nextval) hoặc supabase.rpc()."
            )

    def test_concurrent_ma_don_no_duplicates(self):
        """
        Tạo 20 mã đơn đồng thời (in-memory fallback) → không được trùng.
        Đây là smoke test cho logic sequence fallback.
        """
        import main as main_mod

        importlib.reload(main_mod)
        main_mod._order_seq = 0

        results = set()
        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = [pool.submit(main_mod._next_ma_don, None) for _ in range(20)]
            for f in futures:
                results.add(f.result())

        assert len(results) == 20, (
            f"DB-01 FAIL: Tạo 20 mã đơn đồng thời nhưng chỉ có {len(results)} mã khác nhau. "
            f"Trùng mã đơn hàng khi sale tạo cùng lúc."
        )


# ─────────────────────────────────────────────
# DB-02 · Mã hoá đơn thuế phải dùng DB sequence
# ─────────────────────────────────────────────
# Tình huống: 2 ops xuất hoá đơn cùng lúc → trùng mã M-030626-001 → lỗi kế toán/thuế.

class TestDB02_InvoiceSequenceAtomic:

    def test_alloc_sequences_uses_db_sequence(self):
        """
        _alloc_sequences() không nên đọc current_val → +1 → write.
        Cần dùng Postgres nextval hoặc RPC.
        """
        from invoice_routes import _alloc_sequences

        source = inspect.getsource(_alloc_sequences)

        has_select_current_val = bool(
            re.search(r'\.select\(["\']current_val["\']\)', source)
        )
        has_update_current_val = bool(
            re.search(r'\.update\(.*current_val.*\)', source, re.S)
        )
        has_atomic = bool(
            re.search(r'(\.rpc\(|nextval|NEXTVAL|FOR UPDATE|pg_advisory)', source, re.I)
        )

        if has_select_current_val and has_update_current_val and not has_atomic:
            pytest.fail(
                "DB-02 FAIL: _alloc_sequences() vẫn dùng select(current_val) → +n → update(). "
                "2 người bấm 'Xuất hoá đơn' cùng lúc sẽ nhận trùng mã hoá đơn thuế "
                "(vi phạm quy định kế toán). Cần chuyển sang DB sequence."
            )


# ─────────────────────────────────────────────
# DB-03 · Mã phiếu thu phải dùng DB sequence
# ─────────────────────────────────────────────
# Tình huống: 2 sale tạo phiếu thu cùng lúc → trùng PR-2026-0088
# → ops đối soát ngân hàng không biết khớp phiếu nào.

class TestDB03_PaymentRequestSequenceAtomic:

    def test_allocate_pr_id_uses_db_sequence(self):
        """
        _allocate_pr_id() không nên đọc current_val → +1 → update.
        """
        from payment_request_routes import _allocate_pr_id

        source = inspect.getsource(_allocate_pr_id)

        has_select_current_val = bool(
            re.search(r'\.select\(["\']current_val["\']\)', source)
        )
        has_increment_in_python = bool(
            re.search(r'int\(.*current_val.*\)\s*\+\s*1', source)
        )
        has_atomic = bool(
            re.search(r'(\.rpc\(|nextval|NEXTVAL|FOR UPDATE|pg_advisory)', source, re.I)
        )

        if has_select_current_val and has_increment_in_python and not has_atomic:
            pytest.fail(
                "DB-03 FAIL: _allocate_pr_id() vẫn select(current_val) → +1 → update. "
                "2 sale tạo phiếu thu cùng lúc → trùng mã PR-2026-XXXX → "
                "ops đối soát ngân hàng không biết khớp phiếu nào."
            )


# ─────────────────────────────────────────────
# DB-04 · JSONB update cho active request phải atomic
# ─────────────────────────────────────────────
# Tình huống: Sale An sửa UID học viên 1, sale Bình sửa UID học viên 2
# cùng lúc trên cùng AR → thay đổi của An bị mất.

class TestDB04_JsonbUpdateAtomic:

    def test_uids_data_patch_not_read_modify_write(self):
        """
        Verify code không: read uids_data → modify dict in Python → .update(uids_data=...).
        Pattern nguy hiểm: read row → modify row["uids_data"] in Python → write full JSONB back.
        Nên dùng jsonb_set() hoặc RPC function.
        """
        import activation_routes as ar_mod

        source = inspect.getsource(ar_mod)

        # Pattern: function that reads uids_data from DB, modifies in Python, writes back
        # e.g., _patch_course_python modifies the list in-place then caller does .update({"uids_data": uids_data})
        has_python_patch = bool(re.search(r'def _patch_course_python', source))

        # Check: read uids_data from row → modify in Python → .update({"uids_data": ...})
        has_read_uids_then_update = bool(
            re.search(r'uids_data.*=.*row\.get\(["\']uids_data["\']\)', source, re.S)
            and re.search(r'\.update\(\{.*["\']uids_data["\']', source, re.S)
        )

        has_jsonb_set = bool(
            re.search(r'(jsonb_set|\.rpc\(.*uid|FOR UPDATE)', source, re.I)
        )

        if (has_python_patch or has_read_uids_then_update) and not has_jsonb_set:
            pytest.fail(
                "DB-04 FAIL: uids_data vẫn được đọc → sửa trong Python → ghi lại toàn bộ. "
                "2 người sửa cùng 1 yêu cầu kích hoạt → thay đổi của người trước bị mất. "
                "Cần dùng jsonb_set() hoặc RPC để update atomic."
            )


# ─────────────────────────────────────────────
# DB-05 · KPI save phải atomic (không delete-then-insert)
# ─────────────────────────────────────────────
# Tình huống: Manager lưu KPI → hệ thống xoá KPI cũ → insert mới bị lỗi
# → toàn bộ KPI tháng biến mất.

class TestDB05_KpiSaveAtomic:

    def test_save_monthly_not_delete_then_insert(self):
        """
        _save_monthly() không nên: delete all → insert.
        Nên: insert-then-delete hoặc dùng transaction.
        """
        import report_routes as rr_mod

        found = False
        for name in dir(rr_mod):
            if "save_monthly" in name.lower() or "save_kpi" in name.lower():
                found = True
                source = inspect.getsource(getattr(rr_mod, name))

                # Check if delete comes BEFORE insert
                delete_pos = source.find(".delete()")
                insert_pos = source.find(".insert(")
                has_transaction = bool(
                    re.search(r'(\.rpc\(|transaction|BEGIN|COMMIT|ROLLBACK)', source, re.I)
                )

                if delete_pos >= 0 and insert_pos >= 0 and delete_pos < insert_pos and not has_transaction:
                    pytest.fail(
                        "DB-05 FAIL: _save_monthly() vẫn xoá KPI cũ trước khi insert mới. "
                        "Nếu insert fail → mất toàn bộ KPI tháng đó. "
                        "Cần đổi sang insert-then-delete hoặc wrap trong transaction."
                    )

        if not found:
            pass  # function may have been refactored


# ─────────────────────────────────────────────
# DB-06 · Dashboard BXH phải có giới hạn rows
# ─────────────────────────────────────────────
# Tình huống: Dữ liệu tích luỹ nhiều tháng → server load hàng chục nghìn dòng
# vào RAM → app chậm/crash cho tất cả user.

class TestDB06_DashboardPaginationBounded:

    def test_query_top_sales_has_row_limit(self):
        """
        _query_top_sales (hoặc tương đương) phải có hard cap,
        không phải while True fetch tất cả.
        """
        import dashboard_routes as dr_mod

        source = inspect.getsource(dr_mod)

        has_unbounded_loop = bool(
            re.search(r'while\s+(True|1)', source)
        )
        has_max_rows = bool(
            re.search(r'(MAX_ROWS|max_rows|hard.?cap|break.*len\(.*\)\s*>=?\s*\d{4,})', source, re.I)
        )

        if has_unbounded_loop and not has_max_rows:
            pytest.fail(
                "DB-06 FAIL: Dashboard BXH vẫn dùng while-True loop không giới hạn. "
                "Khi dữ liệu doanh thu tích luỹ nhiều → server load tất cả vào RAM → "
                "app crash, ảnh hưởng tất cả user. Cần thêm MAX_ROWS cap."
            )


# ─────────────────────────────────────────────
# DB-07 · BC01/BC02 revenue fetch phải có giới hạn
# ─────────────────────────────────────────────
# Tình huống: Manager xem báo cáo cả năm → hàng chục nghìn dòng
# load vào memory → server đơ.

class TestDB07_RevenueFetchBounded:

    def test_fetch_so_doanh_thu_has_limit(self):
        """
        _fetch_so_doanh_thu (hoặc pagination loop cho so_doanh_thu)
        phải có giới hạn rows, không load vô hạn.
        """
        import revenue_routes as rev_mod

        source = inspect.getsource(rev_mod)

        revenue_loops = re.findall(
            r'(while\s+(?:True|1)[^}]*?so_doanh_thu[^}]*?(?:break|return))',
            source, re.S,
        )

        for loop in revenue_loops:
            has_cap = bool(
                re.search(r'(MAX_ROWS|max_rows|len\(.*\)\s*>=?\s*\d{4,})', loop, re.I)
            )
            if not has_cap:
                pytest.fail(
                    "DB-07 FAIL: Vòng lặp fetch so_doanh_thu vẫn không có giới hạn. "
                    "Manager xem báo cáo BC01/BC02 cả năm → server load vô hạn → đơ/crash."
                )
