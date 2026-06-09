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

    monkeypatch.setattr("gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0))
    monkeypatch.setattr("gsheet_ledger_import.collect_payloads_from_gsheet", lambda *_args, **_kwargs: [payload])

    result = sync_gsheet_to_ledger(_FakeSupabase([manual_row]), dry_run=True, log=lambda *_args, **_kwargs: None)

    assert result["fetched"] == 1
    assert result["skippedExisting"] == 1
    assert result["inserted"] == 0

