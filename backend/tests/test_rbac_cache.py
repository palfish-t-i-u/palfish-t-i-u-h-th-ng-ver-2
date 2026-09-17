"""TTL cache in-process cho RBAC roster lookups (M2-T1, plan pr-list-server-pagination).

_lookup_staff/_sale_name_map/_staff_map/visible_creator_emails trước đây quét lại
nhan_su_sale MỖI request — cache TTL ngắn (mặc định 120s, env RBAC_CACHE_TTL) giảm tải
DB mà không làm quyền cũ sống dai (invalidate_roster() gọi ở điểm mutate nhan_su_sale).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import rbac as rb


def setup_function(_fn):
    # Cô lập cache giữa các test — tránh test trước rỉ sang test sau.
    rb._TTL_CACHE.clear()


def test_cached_hit_does_not_call_fn_again():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        return "value"

    assert rb._cached("k1", 60, fn) == "value"
    assert rb._cached("k1", 60, fn) == "value"
    assert calls["n"] == 1


def test_cached_miss_for_different_keys():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        return calls["n"]

    assert rb._cached("a", 60, fn) == 1
    assert rb._cached("b", 60, fn) == 2
    assert calls["n"] == 2


def test_cached_expires_after_ttl(monkeypatch):
    calls = {"n": 0}
    fake_now = {"t": 1000.0}
    monkeypatch.setattr(rb.time, "monotonic", lambda: fake_now["t"])

    def fn():
        calls["n"] += 1
        return calls["n"]

    assert rb._cached("k", 10, fn) == 1
    fake_now["t"] += 5  # còn trong TTL
    assert rb._cached("k", 10, fn) == 1
    fake_now["t"] += 6  # đã quá TTL (11s > 10s)
    assert rb._cached("k", 10, fn) == 2
    assert calls["n"] == 2


def test_ttl_zero_disables_cache_entirely():
    calls = {"n": 0}

    def fn():
        calls["n"] += 1
        return calls["n"]

    assert rb._cached("k", 0, fn) == 1
    assert rb._cached("k", 0, fn) == 2
    assert calls["n"] == 2


def test_invalidate_roster_clears_staff_and_roster_keys_only():
    rb._TTL_CACHE["staff:a@x.com"] = (0.0, "stale-a")
    rb._TTL_CACHE["roster_emails:leader:HN 1:None"] = (0.0, ["stale"])
    rb._TTL_CACHE["unrelated:key"] = (0.0, "keep-me")

    rb.invalidate_roster()

    assert "staff:a@x.com" not in rb._TTL_CACHE
    assert "roster_emails:leader:HN 1:None" not in rb._TTL_CACHE
    assert rb._TTL_CACHE["unrelated:key"] == (0.0, "keep-me")


def test_rbac_cache_ttl_reads_env(monkeypatch):
    monkeypatch.setenv("RBAC_CACHE_TTL", "45")
    assert rb._rbac_cache_ttl() == 45.0
    monkeypatch.setenv("RBAC_CACHE_TTL", "not-a-number")
    assert rb._rbac_cache_ttl() == 120.0  # fallback an toàn khi env sai định dạng
    monkeypatch.delenv("RBAC_CACHE_TTL", raising=False)
    assert rb._rbac_cache_ttl() == 120.0  # mặc định khi không set


def test_lookup_staff_hits_cache_on_second_call():
    calls = {"n": 0}

    class _FakeExec:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return _FakeExec([{"email": "a@x.com", "team": "HN 1"}])

    class _FakeSB:
        def table(self, _name):
            return _FakeQuery()

    sb = _FakeSB()
    r1 = rb._lookup_staff(sb, "a@x.com")
    r2 = rb._lookup_staff(sb, "a@x.com")
    assert r1 == r2 == {"email": "a@x.com", "team": "HN 1"}
    assert calls["n"] == 1  # lần 2 phải ăn cache, KHÔNG query lại


def test_visible_creator_emails_leader_uses_cached_roster_but_fresh_own_email():
    """2 actor khác nhau cùng team/sub_team phải luôn thấy ĐÚNG email CHÍNH MÌNH
    dù roster team dùng chung 1 cache key — không được lệ thuộc actor nào cache trước."""
    calls = {"n": 0}

    class _FakeExec:
        def __init__(self, data):
            self.data = data

    class _FakeQuery:
        def select(self, *_a, **_k):
            return self

        def eq(self, *_a, **_k):
            return self

        def execute(self):
            calls["n"] += 1
            return _FakeExec([{"email": "member@x.com"}])

    class _FakeSB:
        def table(self, _name):
            return _FakeQuery()

    sb = _FakeSB()
    leader1 = rb.Actor(
        email="leader1@x.com", user_id="u1", role="leader",
        staff={"team": "HN 1", "sub_team": "HN 1"},
    )
    leader2 = rb.Actor(
        email="leader2@x.com", user_id="u2", role="leader",
        staff={"team": "HN 1", "sub_team": "HN 1"},
    )
    emails1 = rb.visible_creator_emails(sb, leader1)
    emails2 = rb.visible_creator_emails(sb, leader2)
    assert "leader1@x.com" in emails1 and "member@x.com" in emails1
    assert "leader2@x.com" in emails2 and "member@x.com" in emails2
    assert "leader2@x.com" not in emails1  # không rò email actor khác
    assert calls["n"] == 1  # roster query chỉ chạy 1 lần, ăn cache ở lần thứ 2
