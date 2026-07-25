"""Fold matching I/L/1 · O/0 — case PR-2026-0457 (chị Jêju, 24/7/2026).

Khách gõ tay NDCK "821056873336 Park So An  Fl8ZP" (l thường, ASCII 108)
trong khi transfer_code là "FI8ZP" (I hoa, ASCII 73) → .upper() = "FL8ZP"
≠ "FI8ZP" → miss auto-match, CK rơi tab "CK ngoài" dù mã + tiền đều đúng.

Fix: 2-pass matching (exact → fold) với guards:
- fold CHỈ auto khi duy nhất 1 line + tiền khớp CHÍNH XÁC
- ≥2 candidate (exact hoặc fold) → không auto, chờ ghép tay
- fold-match ghi audit matched_by = system:sepay_folded / system:sepay_late_folded
- dữ liệu lưu (content, transfer_code) KHÔNG bị fold

Chạy: cd backend && python -m pytest tests/test_sepay_fold_matching.py -v
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Fakes (cùng pattern test_sepay_webhook.py — tự chứa để file độc lập)
# ---------------------------------------------------------------------------

class _RecordingChain:
    """Records payload; .eq(...).execute() chain returns benign data."""

    def __init__(self, sink: list[dict], payload: dict):
        sink.append(payload)
        self._payload = payload

    def eq(self, *a, **k):
        return self

    def execute(self):
        return MagicMock(data=[self._payload])


class _FakeSelect:
    """Select chain lọc rows theo .eq(col, val) thật — phân biệt được query
    pending (2 eq) vs paid (3 eq, có amount)."""

    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._filters: list[tuple] = []
        self._limit: int | None = None

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def execute(self):
        out = [r for r in self._rows if all(r.get(c) == v for c, v in self._filters)]
        if self._limit is not None:
            out = out[: self._limit]
        return MagicMock(data=out)


def _build_sb(*, lines, linked_txns=None, upserts=None, line_updates=None,
              bank_txn_updates=None):
    """Supabase mock: payment_lines + bank_transactions với recorder."""
    linked_txns = linked_txns if linked_txns is not None else []
    upserts = upserts if upserts is not None else []
    line_updates = line_updates if line_updates is not None else []
    bank_txn_updates = bank_txn_updates if bank_txn_updates is not None else []

    def mock_table(name):
        t = MagicMock()
        if name == "payment_lines":
            t.select.side_effect = lambda *a, **k: _FakeSelect(lines)
            t.update.side_effect = lambda payload: _RecordingChain(line_updates, payload)
        elif name == "bank_transactions":
            t.select.side_effect = lambda *a, **k: _FakeSelect(linked_txns)

            def record_upsert(payload, **kw):
                upserts.append(payload)
                chain = MagicMock()
                chain.execute.return_value = MagicMock(data=[{"txn_id": "new-txn"}])
                return chain

            t.upsert.side_effect = record_upsert
            t.update.side_effect = lambda payload: _RecordingChain(bank_txn_updates, payload)
        return t

    sb = MagicMock()
    sb.table.side_effect = mock_table
    return sb


# Data case thật từ prod (đã verify ASCII trong DB 24/7)
_JEJU_PENDING_LINE = {
    "id": "line-jeju", "transfer_code": "FI8ZP", "amount": 8_480_000,
    "method": "qr", "status": "pending", "payment_request_id": "PR-2026-0457",
}
_JEJU_CONTENT = "821056873336 Park So An  Fl8ZP"  # l thường — nguyên văn bank txn


# ---------------------------------------------------------------------------
# 1. Fold helper
# ---------------------------------------------------------------------------

class TestFoldHelper:
    def test_i_l_1_same_class(self):
        from sepay_routes import _fold_ambiguous

        assert _fold_ambiguous("FI8ZP") == _fold_ambiguous("FL8ZP") == _fold_ambiguous("F18ZP")

    def test_o_0_same_class(self):
        from sepay_routes import _fold_ambiguous

        assert _fold_ambiguous("FO8ZP") == _fold_ambiguous("F08ZP")

    def test_non_ambiguous_unchanged(self):
        from sepay_routes import _fold_ambiguous

        assert _fold_ambiguous("FHFQX") == "FHFQX"
        assert _fold_ambiguous("ABC23") == "ABC23"

    def test_idempotent(self):
        from sepay_routes import _fold_ambiguous

        once = _fold_ambiguous("FILO0")
        assert _fold_ambiguous(once) == once

    def test_no_extra_classes_folded(self):
        """S/5, Z/2, B/8 KHÔNG được fold — mỗi lớp thêm là nới va chạm mã."""
        from sepay_routes import _fold_ambiguous

        assert _fold_ambiguous("S5Z2B") == "S5Z2B"


# ---------------------------------------------------------------------------
# 2. Regression case thật — pending fold match
# ---------------------------------------------------------------------------

class TestFoldPendingMatch:
    def test_jeju_incident_auto_matches(self):
        """Case thật PR-2026-0457: code FI8ZP, khách gõ Fl8ZP, tiền khớp exact
        → auto_matched + mark paid + audit matched_by=system:sepay_folded."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = _build_sb(lines=[_JEJU_PENDING_LINE], upserts=upserts, line_updates=line_updates)

        with patch("payment_request_routes.recompute_payment_request_totals"), \
             patch("audit.log_audit"):
            result = _process_sepay_transaction(sb, {
                "id": 777001,
                "content": _JEJU_CONTENT,
                "transferAmount": 8_480_000,
            })

        assert result["status"] == "auto_matched"
        assert result["payment_line_id"] == "line-jeju"
        # Line được mark paid qua kênh sepay
        assert len(line_updates) == 1
        assert line_updates[0]["status"] == "paid"
        assert line_updates[0]["confirmed_source"] == "sepay"
        # Audit tag fold riêng — soi lại được
        assert upserts[0]["matched_by"] == "system:sepay_folded"

    def test_stored_content_not_folded(self):
        """Invariant: fold chỉ để SO — content lưu DB giữ nguyên văn 'Fl8ZP'."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        sb = _build_sb(lines=[_JEJU_PENDING_LINE], upserts=upserts)

        with patch("payment_request_routes.recompute_payment_request_totals"), \
             patch("audit.log_audit"):
            _process_sepay_transaction(sb, {
                "id": 777002,
                "content": _JEJU_CONTENT,
                "transferAmount": 8_480_000,
            })

        assert upserts[0]["content"] == _JEJU_CONTENT

    def test_exact_match_wins_over_fold(self):
        """2 line pending FI8ZP + FL8ZP, content chứa FL8ZP exact
        → exact pass thắng, chọn ĐÚNG line FL8ZP, không có audit fold."""
        from sepay_routes import _process_sepay_transaction

        line_fi = dict(_JEJU_PENDING_LINE, id="line-fi", transfer_code="FI8ZP")
        line_fl = dict(_JEJU_PENDING_LINE, id="line-fl", transfer_code="FL8ZP")
        upserts: list[dict] = []
        sb = _build_sb(lines=[line_fi, line_fl], upserts=upserts)

        with patch("payment_request_routes.recompute_payment_request_totals"), \
             patch("audit.log_audit"):
            result = _process_sepay_transaction(sb, {
                "id": 777003,
                "content": "84900000001 Khach FL8ZP",
                "transferAmount": 8_480_000,
            })

        assert result["status"] == "auto_matched"
        assert result["payment_line_id"] == "line-fl"
        assert "matched_by" not in upserts[0]

    def test_fold_amount_mismatch_no_auto_no_link(self):
        """Fold match nhưng tiền lệch → KHÔNG auto, KHÔNG link (khác exact:
        exact tiền lệch → needs_review + link; fold = bằng chứng yếu → bỏ)."""
        from sepay_routes import _match_transfer_code_in_content

        line = dict(_JEJU_PENDING_LINE, amount=5_000_000)
        sb = _build_sb(lines=[line])

        result = _match_transfer_code_in_content(sb, _JEJU_CONTENT.upper(), 8_480_000)

        assert result.get("matched") is False

    def test_fold_ambiguous_two_lines_no_auto(self):
        """2 line pending FI8ZP + F18ZP CÙNG tiền, content 'Fl8ZP' — exact trượt
        cả 2, fold khớp cả 2 → ambiguous guard chặn, chờ ghép tay.
        (Nếu content khớp exact 1 line — vd FL8ZP — thì exact thắng, xem
        test_exact_match_wins_over_fold.)"""
        from sepay_routes import _match_transfer_code_in_content

        line_fi = dict(_JEJU_PENDING_LINE, id="line-fi", transfer_code="FI8ZP")
        line_f1 = dict(_JEJU_PENDING_LINE, id="line-f1", transfer_code="F18ZP")
        sb = _build_sb(lines=[line_fi, line_f1])

        result = _match_transfer_code_in_content(sb, _JEJU_CONTENT.upper(), 8_480_000)

        assert result.get("matched") is False

    def test_exact_ambiguous_two_codes_in_content_no_auto(self):
        """Guard mới cho exact: content chứa 2 mã của 2 line pending khác nhau
        → không first-match-wins theo thứ tự DB nữa, chờ ghép tay."""
        from sepay_routes import _match_transfer_code_in_content

        line_a = dict(_JEJU_PENDING_LINE, id="line-a", transfer_code="ABCDE")
        line_b = dict(_JEJU_PENDING_LINE, id="line-b", transfer_code="FGHJK")
        sb = _build_sb(lines=[line_a, line_b])

        result = _match_transfer_code_in_content(
            sb, "CK GOP ABCDE FGHJK HAI DON", 8_480_000
        )

        assert result.get("matched") is False
        assert result.get("reason") == "ambiguous_exact"

    def test_exact_amount_mismatch_still_needs_review(self):
        """Regression: exact match tiền lệch giữ nguyên hành vi cũ
        (code_match_amount_mismatch → caller set needs_review + link line)."""
        from sepay_routes import _match_transfer_code_in_content

        line = dict(_JEJU_PENDING_LINE, transfer_code="FHB9T", amount=5_000_000)
        sb = _build_sb(lines=[line])

        result = _match_transfer_code_in_content(sb, "84989778983 MINH FHB9T", 4_000_000)

        assert result["matched"] is True
        assert result["match_type"] == "code_match_amount_mismatch"

    def test_exact_single_match_regression(self):
        """Regression: exact 1 line + tiền khớp → auto_matched như cũ."""
        from sepay_routes import _match_transfer_code_in_content

        line = dict(_JEJU_PENDING_LINE, transfer_code="FHB9T", amount=5_000_000)
        sb = _build_sb(lines=[line])

        result = _match_transfer_code_in_content(sb, "84989778983 MINH FHB9T", 5_000_000)

        assert result["matched"] is True
        assert result["match_type"] == "auto_matched"
        assert "folded" not in result


# ---------------------------------------------------------------------------
# 3. Late match fold (line đã paid qua kênh khác, CK về muộn với mã gõ nhầm)
# ---------------------------------------------------------------------------

class TestFoldLateMatch:
    _PAID_LINE = {
        "id": "line-paid-fold", "transfer_code": "FI8ZP", "amount": 8_480_000,
        "method": "qr", "status": "paid", "payment_request_id": "PR-2026-0457",
    }

    def test_late_fold_links_without_marking_paid(self):
        """Line đã paid (kênh khác), CK muộn mã gõ nhầm Fl8ZP → link-only +
        audit system:sepay_late_folded, KHÔNG update payment_lines (không notify lại)."""
        from sepay_routes import _process_sepay_transaction

        upserts: list[dict] = []
        line_updates: list[dict] = []
        sb = _build_sb(lines=[self._PAID_LINE], upserts=upserts, line_updates=line_updates)

        with patch("audit.log_audit"):
            result = _process_sepay_transaction(sb, {
                "id": 777010,
                "content": _JEJU_CONTENT,
                "transferAmount": 8_480_000,
            })

        assert result["status"] == "auto_matched"
        assert result["payment_line_id"] == "line-paid-fold"
        assert line_updates == []  # KHÔNG mark paid lại
        assert upserts[0]["matched_by"] == "system:sepay_late_folded"

    def test_late_fold_skips_already_linked_line(self):
        """Điều kiện 3 giữ nguyên với fold: line đã có bank txn link
        → CK lặp thật của khách → pending cho kế toán."""
        from sepay_routes import _match_paid_line_late

        sb = _build_sb(
            lines=[self._PAID_LINE],
            linked_txns=[{"txn_id": "old-txn", "payment_line_id": "line-paid-fold"}],
        )

        result = _match_paid_line_late(sb, _JEJU_CONTENT.upper(), 8_480_000)

        assert result.get("matched") is False

    def test_late_fold_ambiguous_no_auto(self):
        """2 line paid cùng tiền fold-khớp cùng content (exact trượt cả 2)
        → không auto."""
        from sepay_routes import _match_paid_line_late

        line_fi = dict(self._PAID_LINE, id="p-fi", transfer_code="FI8ZP")
        line_f1 = dict(self._PAID_LINE, id="p-f1", transfer_code="F18ZP")
        sb = _build_sb(lines=[line_fi, line_f1])

        result = _match_paid_line_late(sb, _JEJU_CONTENT.upper(), 8_480_000)

        assert result.get("matched") is False
        assert result.get("reason") == "ambiguous_late_fold"

    def test_allow_fold_false_blocks_fold_pass(self):
        """Pending fold đã thấy ứng viên → nhánh muộn bị tắt fold
        (chống giật txn sang line paid bằng bằng chứng mờ)."""
        from sepay_routes import _match_paid_line_late

        sb = _build_sb(lines=[self._PAID_LINE])

        result = _match_paid_line_late(
            sb, _JEJU_CONTENT.upper(), 8_480_000, allow_fold=False
        )

        assert result.get("matched") is False

    def test_late_exact_regression(self):
        """Regression: late match exact (learning 11/7) vẫn hoạt động."""
        from sepay_routes import _match_paid_line_late

        line = dict(self._PAID_LINE, transfer_code="FHBFF", amount=14_650_000)
        sb = _build_sb(lines=[line])

        result = _match_paid_line_late(sb, "84989778983 MINH FHBFF", 14_650_000)

        assert result["matched"] is True
        assert result["match_type"] == "late_matched"
        assert "folded" not in result


# ---------------------------------------------------------------------------
# 4. Scoring gợi ý ghép tay (tab CK ngoài)
# ---------------------------------------------------------------------------

class TestFoldScoring:
    def test_folded_code_earns_code_signal(self):
        from sepay_routes import _score_candidate

        cand = {"transfer_code": "FI8ZP", "amount": 8_480_000,
                "pr_phone": "", "pr_name": ""}
        score, signals = _score_candidate(_JEJU_CONTENT, cand, 8_480_000)

        assert "code" in signals
        assert score >= 120

    def test_exact_code_signal_regression(self):
        from sepay_routes import _score_candidate

        cand = {"transfer_code": "FHB9T", "amount": 5_000_000,
                "pr_phone": "", "pr_name": ""}
        score, signals = _score_candidate("84989778983 Minh FHB9T", cand, 5_000_000)

        assert "code" in signals

    def test_wrong_code_no_signal(self):
        from sepay_routes import _score_candidate

        cand = {"transfer_code": "XYZAB", "amount": 8_480_000,
                "pr_phone": "", "pr_name": ""}
        _score, signals = _score_candidate(_JEJU_CONTENT, cand, 8_480_000)

        assert "code" not in signals
