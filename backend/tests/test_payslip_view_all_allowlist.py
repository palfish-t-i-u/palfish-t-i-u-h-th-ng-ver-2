"""
rbac.visible_payslip_codes — allowlist PAYSLIP_VIEW_ALL_EMAILS.

Role system KHÔNG còn đủ để xem hết phiếu lương khi env allowlist đã đặt:
chỉ email trong allowlist xem hết, người khác (kể cả system) chỉ thấy phiếu mình.
Env chưa đặt = hành vi cũ (mọi system xem hết) để deploy code không đổi gì.
"""

from __future__ import annotations

from rbac import Actor, visible_payslip_codes

ENV = "PAYSLIP_VIEW_ALL_EMAILS"


def _actor(email: str, role: str, ma_nv: str | None = None) -> Actor:
    staff = {"ma_nv": ma_nv} if ma_nv is not None else None
    return Actor(email=email, user_id="u1", role=role, staff=staff)


def test_env_unset_system_sees_all(monkeypatch):
    monkeypatch.delenv(ENV, raising=False)
    assert visible_payslip_codes(None, _actor("a@x.com", "system", "HN0001")) is None


def test_env_blank_system_sees_all(monkeypatch):
    monkeypatch.setenv(ENV, " , ")
    assert visible_payslip_codes(None, _actor("a@x.com", "system", "HN0001")) is None


def test_system_in_allowlist_sees_all(monkeypatch):
    monkeypatch.setenv(ENV, "minh@x.com, Chung@X.com")
    assert visible_payslip_codes(None, _actor("chung@x.com", "system", "HN0181")) is None
    assert visible_payslip_codes(None, _actor("MINH@x.com", "system")) is None


def test_system_not_in_allowlist_sees_own_only(monkeypatch):
    monkeypatch.setenv(ENV, "minh@x.com")
    actor = _actor("hien@x.com", "system", "HN0062")
    assert visible_payslip_codes(None, actor) == ["HN0062"]


def test_system_not_in_allowlist_without_ma_nv_sees_nothing(monkeypatch):
    monkeypatch.setenv(ENV, "minh@x.com")
    assert visible_payslip_codes(None, _actor("hien@x.com", "system")) == []


def test_non_system_roles_unchanged_by_allowlist(monkeypatch):
    # Allowlist chỉ siết role system; role khác luôn chỉ thấy phiếu mình
    # (kể cả khi email họ có trong allowlist — role không phải system thì không được nâng).
    monkeypatch.setenv(ENV, "boss@x.com")
    for role in ("sale", "leader", "manager", "ops"):
        assert visible_payslip_codes(None, _actor("boss@x.com", role, "HN0007")) == ["HN0007"]
    monkeypatch.delenv(ENV, raising=False)
    for role in ("sale", "leader", "manager", "ops"):
        assert visible_payslip_codes(None, _actor("u@x.com", role, "HN0007")) == ["HN0007"]
