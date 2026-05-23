"""VN-only personnel scope for GMV reconciliation (excludes Thailand / AU tele teams)."""

from __future__ import annotations

from typing import Any

# Teams ngoài phạm vi GMV VN (wireframes / team_hierarchy.md)
NON_VN_TEAMS = frozenset({"Tele sale", "P'AU Group", "P'TEE Group"})


def _depart6_str(row: dict[str, Any]) -> str:
    d6 = row.get("depart6_name") or row.get("depart6")
    if isinstance(d6, list):
        return (d6[0] or "").strip() if d6 else ""
    return (d6 or "").strip()


def is_vn_sale_row(row: dict[str, Any]) -> bool:
    """True if sale belongs in GMV VN personnel lists."""
    if "thailand" in _depart6_str(row).lower():
        return False
    team = (row.get("team") or "").strip()
    if team in NON_VN_TEAMS:
        return False
    return True


def filter_vn_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in rows if is_vn_sale_row(r)]
