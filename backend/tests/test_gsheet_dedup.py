from __future__ import annotations

from types import SimpleNamespace


class _FakeQuery:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self._like_filters: list[tuple[str, str]] = []

    def select(self, *_args, **_kwargs):
        return self

    def like(self, column: str, pattern: str):
        self._like_filters.append((column, pattern))
        return self

    def range(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=payload))

    def execute(self):
        rows = list(self._rows)
        for column, pattern in self._like_filters:
            if pattern == "import:%":
                rows = [r for r in rows if str(r.get(column) or "").startswith("import:")]
        return SimpleNamespace(data=rows)


class _FakeSupabase:
    def __init__(self, ledger_rows: list[dict]):
        self._ledger_rows = ledger_rows

    def table(self, name: str):
        if name == "so_doanh_thu":
            return _FakeQuery(self._ledger_rows)
        raise AssertionError(f"Unexpected table: {name}")


def test_sync_gsheet_skips_existing_manual_ledger_row(monkeypatch):
    from gsheet_ledger_import import sync_gsheet_to_ledger

    manual_row = {
        "uid": "PF123",
        "pay_time": "2026-06-08T10:00:00",
        "so_tien_vnd": 10_080_000,
        "sale_crm_name": "Dang Kim Thuong",
        "sdt": "0988888888",
        "created_by_email": "ops@palfish.vn",
    }
    payload = {
        "uid": "PF123",
        "pay_time": "2026-06-08T15:30:00",
        "so_tien_vnd": 10_080_000,
        "sale_crm_name": "Dang Kim Thuong",
        "sdt": "0988888888",
        "created_by_email": "import:gsheet:HCM REV",
        "updated_by_email": "import:gsheet:HCM REV",
        "ngay_tien_ve": "2026-06-08",
        "ten_khach": "Test Customer",
    }

    def fake_iter(*_args, **_kwargs):
        yield ("HCM REV", [payload])

    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)

    result = sync_gsheet_to_ledger(_FakeSupabase([manual_row]), dry_run=True, log=lambda *_args, **_kwargs: None)

    assert result["fetched"] == 1
    assert result["skippedExisting"] == 1
    assert result["plannedInsert"] == 0
    assert result["inserted"] == 0


def _gsheet_payload(**over) -> dict:
    base = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "ten_khach": "Hiro",
        "created_by_email": "import:gsheet:SM Hanoi",
        "updated_by_email": "import:gsheet:SM Hanoi",
    }
    base.update(over)
    return base


def _run_sync(monkeypatch, ledger_rows: list[dict], payloads: list[dict]) -> dict:
    from gsheet_ledger_import import sync_gsheet_to_ledger

    def fake_iter(*_args, **_kwargs):
        yield ("SM Hanoi", list(payloads))

    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)
    return sync_gsheet_to_ledger(_FakeSupabase(ledger_rows), dry_run=True, log=lambda *_a, **_k: None)


def test_pattern_x_renamed_customer_is_skipped(monkeypatch):
    """[[pattern X]] — Hiền sửa tên+SĐT trên sheet giữa các đợt sync.

    Cùng UID + sale + ngày + tiền, khác tên + khác SĐT → fingerprint exact
    đổi (do SĐT khác) nhưng loose key (UID+sale+tháng+tiền) khớp → skip.
    """
    old_row = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "created_by_email": "import:gsheet:SM Hanoi",
    }
    renamed = _gsheet_payload(ten_khach="Khang Vy", sdt="84-984950793")

    result = _run_sync(monkeypatch, [old_row], [renamed])

    assert result["fetched"] == 1
    assert result["skippedExisting"] == 0
    assert result["skippedLoose"] == 1
    assert result["plannedInsert"] == 0


def test_pattern_x_with_exact_match_payload_present(monkeypatch):
    """Sheet đợt sau còn cả dòng gốc + dòng đã-sửa-tên — pha 1 (exact)
    phải tiêu budget trước, pha 2 (loose) chặn dòng sửa tên."""
    old_row = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "created_by_email": "import:gsheet:SM Hanoi",
    }
    unchanged = _gsheet_payload()
    renamed = _gsheet_payload(ten_khach="Khang Vy", sdt="84-984950793")

    # renamed đứng trước trong sheet — đúng thứ tự bug từng xảy ra
    result = _run_sync(monkeypatch, [old_row], [renamed, unchanged])

    assert result["skippedExisting"] == 1
    assert result["skippedLoose"] == 1
    assert result["plannedInsert"] == 0


def test_blank_uid_early_row_absorbs_filled_version(monkeypatch):
    """[[pattern B]] — dòng đợt sớm UID trống, đợt sau sheet điền đủ UID →
    loose key fallback (sale+tháng+tiền) chặn."""
    early_blank = {
        "uid": None,
        "ngay_tien_ve": "2026-05-28",
        "pay_time": "2026-05-28T00:00:00",
        "so_tien_vnd": 9_010_000,
        "sale_crm_name": "Nguyen Thi Thao Ngoc",
        "sdt": None,
        "created_by_email": "import:gsheet:SM Hanoi",
    }
    filled = _gsheet_payload(
        uid="3312123609", pay_time="2026-05-28T10:00:00",
        ngay_tien_ve="2026-05-28", so_tien_vnd=9_010_000,
        sale_crm_name="Nguyen Thi Thao Ngoc", ten_khach="Minh", sdt="0911222333",
    )

    result = _run_sync(monkeypatch, [early_blank], [filled])

    assert result["skippedLoose"] == 1
    assert result["plannedInsert"] == 0


def test_two_real_payments_same_amount_in_different_months_not_skipped(monkeypatch):
    """False-positive guard: cùng khách + cùng sale + cùng tiền nhưng khác
    THÁNG (renew tháng kế tiếp) — phải insert, không skip."""
    old_row = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "created_by_email": "import:gsheet:SM Hanoi",
    }
    next_month = _gsheet_payload(pay_time="2026-06-29T10:00:00", ngay_tien_ve="2026-06-29")

    result = _run_sync(monkeypatch, [old_row], [next_month])

    assert result["skippedLoose"] == 0
    assert result["plannedInsert"] == 1


def test_date_drift_within_month_still_dedup(monkeypatch):
    """Hiền sửa `ngày tiền về` (vd 29/5 → 30/5) trên sheet đợt sau — cùng
    tháng, cùng UID/sale/tiền vẫn phải skip (key dùng tháng, không ngày)."""
    old_row = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "created_by_email": "import:gsheet:SM Hanoi",
    }
    date_shifted = _gsheet_payload(pay_time="2026-05-30T10:00:00", ngay_tien_ve="2026-05-30")

    result = _run_sync(monkeypatch, [old_row], [date_shifted])

    assert result["skippedLoose"] == 1
    assert result["plannedInsert"] == 0

