"""Test Feedback lead routes — RBAC (sale/leader/MKT scope), create validate note,
mkt-feedback đổi trạng thái. Fake Supabase in-memory + patch resolve_actor/permissions.
"""
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lead_feedback_routes as lf  # noqa: E402
from rbac import Actor  # noqa: E402


# ---------------- Fake Supabase (in-memory) ----------------
class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, store, table):
        self.store, self.table = store, table
        self.filters, self._order, self._desc, self._limit = [], None, False, None

    def select(self, *a, **k):
        return self

    def order(self, col, desc=False):
        self._order, self._desc = col, desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def eq(self, col, val):
        self.filters.append(("eq", col, val)); return self

    def in_(self, col, vals):
        self.filters.append(("in", col, list(vals))); return self

    def gte(self, col, val):
        self.filters.append(("gte", col, val)); return self

    def lte(self, col, val):
        self.filters.append(("lte", col, val)); return self

    def _match(self, row):
        for op, col, val in self.filters:
            cv = row.get(col)
            if op == "eq" and cv != val:
                return False
            if op == "in" and cv not in val:
                return False
            if op == "gte" and not (str(cv) >= str(val)):
                return False
            if op == "lte" and not (str(cv) <= str(val)):
                return False
        return True

    def execute(self):
        rows = [r for r in self.store[self.table] if self._match(r)]
        if self._order:
            rows = sorted(rows, key=lambda r: r.get(self._order) or "", reverse=self._desc)
        if self._limit:
            rows = rows[: self._limit]
        return _Res([dict(r) for r in rows])


class _Insert:
    def __init__(self, store, table, rec):
        self.store, self.table, self.rec = store, table, rec

    def execute(self):
        import uuid
        row = dict(self.rec)
        row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("created_at", "2026-10-07T10:00:00Z")
        self.store[self.table].append(row)
        return _Res([dict(row)])


class _Update:
    def __init__(self, store, table, upd):
        self.store, self.table, self.upd, self.filters = store, table, upd, []

    def eq(self, col, val):
        self.filters.append((col, val)); return self

    def execute(self):
        out = []
        for r in self.store[self.table]:
            if all(r.get(c) == v for c, v in self.filters):
                r.update(self.upd); out.append(dict(r))
        return _Res(out)


class _Table:
    def __init__(self, store, name):
        self.store, self.name = store, name

    def select(self, *a, **k):
        return _Query(self.store, self.name).select(*a)

    def insert(self, rec):
        return _Insert(self.store, self.name, rec)

    def update(self, upd):
        return _Update(self.store, self.name, upd)


class _Bucket:
    def upload(self, path, file, file_options=None):
        return True

    def get_public_url(self, path):
        return f"https://sb.test/storage/v1/object/public/lead-feedback/{path}"


class _Storage:
    def from_(self, b):
        return _Bucket()


class FakeSB:
    def __init__(self):
        self.store = {"lead_feedback": []}
        self.storage = _Storage()

    def table(self, name):
        return _Table(self.store, name)


# ---------------- harness ----------------
_CUR = {}

PERMS_SALE = {"leadFeedback": "full", "leadFeedbackReview": "none"}
PERMS_MKT = {"leadFeedback": "full", "leadFeedbackReview": "full"}
PERMS_READ = {"leadFeedback": "read", "leadFeedbackReview": "none"}


def _set(role, email, perms, visible, staff=None):
    _CUR["actor"] = Actor(email=email, user_id="u", role=role, staff=staff or {}, department=None)
    _CUR["perms"] = perms
    _CUR["visible"] = visible


@pytest.fixture(autouse=True)
def _patch(monkeypatch):
    monkeypatch.setattr(lf, "resolve_actor", lambda sb, auth, **k: _CUR["actor"])
    monkeypatch.setattr(lf, "_compute_permissions", lambda sb, actor: _CUR["perms"])
    monkeypatch.setattr(lf, "visible_creator_emails", lambda sb, actor: _CUR["visible"])
    monkeypatch.setattr(lf, "_sb_or_503", lambda get_sb: get_sb())
    yield


def _client(sb):
    app = FastAPI()
    lf.register_lead_feedback_routes(app, lambda: sb)
    return TestClient(app)


# ---------------- tests ----------------
def test_phone9_helper():
    assert lf._phone9("84-912345678") == "912345678"
    assert lf._phone9("0912345678") == "912345678"
    assert lf._phone9("123") is None


def test_create_requires_note():
    sb = FakeSB(); _set("sale", "a@x.com", PERMS_SALE, ["a@x.com"])
    r = _client(sb).post("/api/v1/lead-feedback", json={"phone": "84-912345678", "sale_note": "   "})
    assert r.status_code == 400


def test_create_ok_sale():
    sb = FakeSB(); _set("sale", "a@x.com", PERMS_SALE, ["a@x.com"])
    r = _client(sb).post("/api/v1/lead-feedback", json={"phone": "84-912345678", "sale_note": "khach quan tam", "uid": "84200"})
    assert r.status_code == 200, r.text
    item = r.json()["item"]
    assert item["status"] == "wait"
    assert item["sale_email"] == "a@x.com"
    assert item["phone"] == "84-912345678"
    assert len(sb.store["lead_feedback"]) == 1


def test_create_forbidden_when_readonly():
    sb = FakeSB(); _set("sale", "a@x.com", PERMS_READ, ["a@x.com"])
    r = _client(sb).post("/api/v1/lead-feedback", json={"phone": "84-9", "sale_note": "x"})
    assert r.status_code == 403


def _seed(sb):
    sb.store["lead_feedback"] = [
        {"id": "1", "sale_email": "a@x.com", "phone": "84-912345678", "phone9": "912345678",
         "sale_note": "n", "status": "wait", "created_at": "2026-10-07T10:00:00Z", "mkt_images": []},
        {"id": "2", "sale_email": "b@x.com", "phone": "84-903112233", "phone9": "903112233",
         "sale_note": "n", "status": "done", "created_at": "2026-10-06T10:00:00Z", "mkt_images": []},
    ]


def test_list_sale_sees_own_only():
    sb = FakeSB(); _seed(sb); _set("sale", "a@x.com", PERMS_SALE, ["a@x.com"])
    r = _client(sb).get("/api/v1/lead-feedback")
    assert r.status_code == 200
    assert [i["id"] for i in r.json()["items"]] == ["1"]
    assert r.json()["can_review"] is False
    assert r.json()["can_create"] is True


def test_list_leader_sees_team():
    sb = FakeSB(); _seed(sb); _set("leader", "lead@x.com", PERMS_SALE, ["a@x.com", "b@x.com"])
    r = _client(sb).get("/api/v1/lead-feedback")
    assert r.status_code == 200
    assert {i["id"] for i in r.json()["items"]} == {"1", "2"}


def test_list_mkt_sees_all_and_can_review():
    sb = FakeSB(); _seed(sb); _set("sale", "mkt@x.com", PERMS_MKT, None)
    r = _client(sb).get("/api/v1/lead-feedback")
    assert r.status_code == 200
    assert {i["id"] for i in r.json()["items"]} == {"1", "2"}
    assert r.json()["can_review"] is True


def test_list_filter_status():
    sb = FakeSB(); _seed(sb); _set("sale", "mkt@x.com", PERMS_MKT, None)
    r = _client(sb).get("/api/v1/lead-feedback?status=done")
    assert [i["id"] for i in r.json()["items"]] == ["2"]


def test_mkt_feedback_sets_done():
    sb = FakeSB(); _seed(sb); _set("sale", "mkt@x.com", PERMS_MKT, None)
    r = _client(sb).post("/api/v1/lead-feedback/1/mkt-feedback", json={"note": "da xac minh lead chuan"})
    assert r.status_code == 200, r.text
    assert r.json()["item"]["status"] == "done"
    assert r.json()["item"]["mkt_note"] == "da xac minh lead chuan"
    assert r.json()["item"]["mkt_by"] == "mkt@x.com"


def test_mkt_feedback_forbidden_for_sale():
    sb = FakeSB(); _seed(sb); _set("sale", "a@x.com", PERMS_SALE, ["a@x.com"])
    r = _client(sb).post("/api/v1/lead-feedback/1/mkt-feedback", json={"note": "x"})
    assert r.status_code == 403


def test_mkt_feedback_requires_note():
    sb = FakeSB(); _seed(sb); _set("sale", "mkt@x.com", PERMS_MKT, None)
    r = _client(sb).post("/api/v1/lead-feedback/1/mkt-feedback", json={"note": "  "})
    assert r.status_code == 400
