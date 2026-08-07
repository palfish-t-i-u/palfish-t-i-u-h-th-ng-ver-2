"""Regression: staff sync phải gộp store con của HN Offline Store về đúng cấp team.

Sự cố 2026-08-07: sync ghi team = tên store con (An Bình / Linh Đàm), sub_team = null.
Hậu quả: routing Zalo `payment_paid` (khớp team_code chính xác) rớt + team-scope
dashboard/báo cáo/RBAC lệch. Fix ở `_hierarchy_member_to_row` (admin_routes.py).
"""

from __future__ import annotations

import admin_routes as m


def _member(sale, team, sub_team, d6, d7, d8=None):
    return {
        "sale": sale,
        "team": team,
        "sub_team": sub_team,
        "depart6": [d6] if d6 is not None else [],
        "depart7": [d7] if d7 is not None else [],
        "depart8": [d8] if d8 is not None else [],
    }


def test_hn_offline_substore_collapses_to_team_with_subteam():
    """Store con dưới HN Offline Store → team='HN Offline Store', store thành sub-team."""
    for store in ("An Binh Store", "Linh Dam Store"):
        row = m._hierarchy_member_to_row(
            _member("Sale X", team=store, sub_team="", d6="HN Offline Store", d7=store)
        )
        assert row["team"] == "HN Offline Store", store
        assert row["sub_team"] == store, store
        # depart giữ nguyên để truy vết
        assert row["depart6_name"] == "HN Offline Store"
        assert row["depart7_name"] == store


def test_inhouse_teams_unchanged():
    """IH1/IH2 (depart6='HN Inhouse') KHÔNG bị đụng — team đúng vẫn là depart7."""
    for team in ("Inhouse 1", "Inhouse 2"):
        row = m._hierarchy_member_to_row(
            _member("Sale Y", team=team, sub_team="", d6="HN Inhouse", d7=team)
        )
        assert row["team"] == team, team
        # depart6 'HN Inhouse' KHÔNG được trở thành team
        assert row["team"] != "HN Inhouse"


def test_hn_offline_direct_member_not_clobbered():
    """Nhân sự đứng thẳng ở HN Offline Store (không có depart7) giữ team gốc."""
    row = m._hierarchy_member_to_row(
        _member("Leader Z", team="HN Offline Store", sub_team="", d6="HN Offline Store", d7=None)
    )
    assert row["team"] == "HN Offline Store"
    assert row["sub_team"] is None


def test_non_store_team_passthrough():
    """Team thường (không thuộc ô đặc biệt) giữ nguyên team/sub_team từ CRM."""
    row = m._hierarchy_member_to_row(
        _member("Sale W", team="Group KL", sub_team="Nhóm A", d6="Group KL", d7=None)
    )
    assert row["team"] == "Group KL"
    assert row["sub_team"] == "Nhóm A"
