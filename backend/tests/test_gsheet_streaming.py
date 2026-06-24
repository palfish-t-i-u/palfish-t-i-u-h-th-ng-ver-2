from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Iterator


class _FakeQuery:
    def __init__(self, sb: "_FakeSupabase", table_name: str):
        self._sb = sb
        self._table = table_name
        self._like_filters: list[tuple[str, str]] = []
        self._insert_payload: list[dict] | None = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def like(self, column: str, pattern: str):
        self._like_filters.append((column, pattern))
        return self

    def range(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self._insert_payload = payload if isinstance(payload, list) else [payload]
        return self

    def execute(self):
        if self._insert_payload is not None:
            self._sb.inserted.extend(self._insert_payload)
            self._sb.ledger.extend(self._insert_payload)
            return SimpleNamespace(data=self._insert_payload)
        if self._table == "so_doanh_thu":
            rows = list(self._sb.ledger)
            for column, pattern in self._like_filters:
                if pattern == "import:%":
                    rows = [r for r in rows if str(r.get(column) or "").startswith("import:")]
            return SimpleNamespace(data=rows)
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, ledger_rows: list[dict]):
        self.ledger: list[dict] = list(ledger_rows)
        self.inserted: list[dict] = []

    def table(self, name: str):
        return _FakeQuery(self, name)


def _payload(tab: str, **over: Any) -> dict:
    base = {
        "uid": "3311069834",
        "ngay_tien_ve": "2026-05-29",
        "pay_time": "2026-05-29T10:00:00",
        "so_tien_vnd": 8_480_000,
        "sale_crm_name": "Le Thi Thuy Trang",
        "sdt": "81-7035239960",
        "ten_khach": "Hiro",
        "created_by_email": f"import:gsheet:{tab}",
        "updated_by_email": f"import:gsheet:{tab}",
    }
    base.update(over)
    return base


def test_cross_tab_exact_duplicate_inserted_once(monkeypatch):
    """Cùng fingerprint xuất hiện ở cả SM Hanoi và HCM REV → chỉ insert 1 lần."""
    from gsheet_ledger_import import sync_gsheet_to_ledger

    p_sm = _payload("SM Hanoi")
    p_hcm = _payload("HCM REV")

    def fake_iter(*_args, **_kwargs) -> Iterator[tuple[str, list[dict]]]:
        yield ("SM Hanoi", [p_sm])
        yield ("HCM REV", [p_hcm])

    monkeypatch.setattr(
        "gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0)
    )
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)

    sb = _FakeSupabase([])
    result = sync_gsheet_to_ledger(sb, log=lambda *_a, **_k: None)

    assert result["fetched"] == 1, f"Cross-tab fp duplicate → fetched=1, got {result['fetched']}"
    assert result["plannedInsert"] == 1
    assert result["inserted"] == 1
    assert len(sb.inserted) == 1


def test_loose_dedup_against_just_inserted_row(monkeypatch):
    """Tab 1 insert dòng A → Tab 2 có dòng A' loose-match (cùng uid+sale+
    tháng+tiền, khác sdt) → tab 2 phải skip vì loose_existing đã được cập
    nhật."""
    from gsheet_ledger_import import sync_gsheet_to_ledger

    p_a = _payload("SM Hanoi", sdt="81-1111111111")
    p_a_prime = _payload("HCM REV", sdt="81-2222222222", uid="3311069834")

    def fake_iter(*_args, **_kwargs):
        yield ("SM Hanoi", [p_a])
        yield ("HCM REV", [p_a_prime])

    monkeypatch.setattr(
        "gsheet_ledger_import.TeamLookupCache", lambda _sb: SimpleNamespace(size=0)
    )
    monkeypatch.setattr("gsheet_ledger_import.iter_payloads_by_tab", fake_iter)

    sb = _FakeSupabase([])
    result = sync_gsheet_to_ledger(sb, log=lambda *_a, **_k: None)

    assert result["inserted"] == 1, "Chỉ p_a vào DB, p_a_prime loose-skip"
    assert result["skippedLoose"] == 1
    assert len(sb.inserted) == 1
