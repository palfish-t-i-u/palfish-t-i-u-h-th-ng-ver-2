"""VN-only personnel scope for GMV reconciliation (excludes Thailand / AU tele teams)."""

from __future__ import annotations

from typing import Any

import os

_fallback_teams = "tele sale,thái,úc"
NON_VN_TEAMS = frozenset(
    t.strip().lower() for t in os.getenv("NON_VN_TEAMS", _fallback_teams).split(",") if t.strip()
)


def _depart6_str(row: dict[str, Any]) -> str:
    d6 = row.get("depart6_name") or row.get("depart6")
    if isinstance(d6, list):
        return (d6[0] or "").strip() if d6 else ""
    return (d6 or "").strip()


def is_vn_sale_row(row: dict[str, Any]) -> bool:
    """True if sale belongs in GMV VN personnel lists."""
    if "thailand" in _depart6_str(row).lower():
        return False
    team = (row.get("team") or "").strip().lower()
    if team in NON_VN_TEAMS:
        return False
    return True


def filter_vn_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in rows if is_vn_sale_row(r)]
