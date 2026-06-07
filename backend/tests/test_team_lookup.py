"""Tests for batch team lookup."""
from unittest.mock import MagicMock


def _make_sb_with_staff(rows: list[dict]) -> MagicMock:
    sb = MagicMock()
    result = MagicMock()
    result.data = rows
    builder = MagicMock()
    builder.execute.return_value = result
    builder.eq.return_value = builder
    builder.range.return_value = builder
    sb.table.return_value = MagicMock(select=MagicMock(return_value=builder))
    return sb


def test_load_team_map_basic():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "Nguyen Van A", "team": "HCM (Online)"},
        {"crm_name": "Tran Thi B", "team": "Inhouse 1"},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"
    assert result["Tran Thi B"] == "Inhouse 1"


def test_load_team_map_strips_whitespace():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "  Nguyen Van A  ", "team": "  HCM (Online)  "},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"


def test_load_team_map_duplicate_keeps_first():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "Nguyen Van A", "team": "HCM (Online)"},
        {"crm_name": "Nguyen Van A", "team": "Inhouse 1"},
    ])
    result = load_team_map(sb)
    assert result["Nguyen Van A"] == "HCM (Online)"


def test_load_team_map_skips_empty_name():
    from revenue_routes import load_team_map

    sb = _make_sb_with_staff([
        {"crm_name": "", "team": "HCM (Online)"},
        {"crm_name": None, "team": "Inhouse 1"},
        {"crm_name": "Valid Sale", "team": "Inhouse 2"},
    ])
    result = load_team_map(sb)
    assert len(result) == 1
    assert result["Valid Sale"] == "Inhouse 2"
