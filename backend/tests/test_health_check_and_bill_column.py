"""Health-check timeout storm + bill-column fixes (2026-07-10).

Plan: docs/superpowers/plans/2026-07-10-fix-health-check-storm-bill-column.md
Sự cố: /healthz ping DB + route danh sách storm 111 lượt Storage-list → Render
giết instance vì health check >5s. Fix: /healthz không DB; route đọc cột DB.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_healthz_never_touches_db(monkeypatch):
    """Liveness probe của Render phải trả lời ngay, không gọi _supabase()."""
    import main

    called = {"n": 0}

    def _boom():
        called["n"] += 1
        raise AssertionError("/healthz phải KHÔNG gọi _supabase()")

    monkeypatch.setattr(main, "_supabase", _boom)
    res = main.health()
    assert res["status"] == "ok"
    assert called["n"] == 0


def test_bill_fields_uses_db_column_without_storage():
    """Cột bill_images điền sẵn → hiển thị bill mà KHÔNG cần tham số Storage."""
    from payment_request_routes import _bill_fields

    row = {"id": "L1", "bill_images": ["https://x/bill1.jpg", "https://x/bill2.jpg"]}
    out = _bill_fields(row)  # bill_urls/bill_assets = None
    assert out["bill"] is True
    assert out["bill_image"] == "https://x/bill2.jpg"
    assert out["bill_images"] == ["https://x/bill1.jpg", "https://x/bill2.jpg"]


def test_list_payment_requests_does_not_list_storage(monkeypatch):
    """Route danh sách PHẢI không gọi _fetch_bill_assets_fast (storm Storage)."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    def _boom(*a, **k):
        raise AssertionError("route danh sách KHÔNG được liệt kê Storage bill")

    monkeypatch.setattr(prr, "_fetch_bill_assets_fast", _boom)

    class _Actor:
        email = "admin@test.com"

    # _sb_or_503 uses a closure from the first registration (main.py),
    # which returns None in tests (no Supabase env vars). Patch it directly.
    monkeypatch.setattr(prr, "_sb_or_503", lambda _get_sb: sb)
    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})

    pr_row = {"id": "PR1", "sale_email": "s@x.com", "state": "pending",
              "created_at": "2026-01-01T00:00:00Z"}
    line_row = {"id": "L1", "payment_request_id": "PR1", "status": "paid",
                "bill_images": ["https://x/bill.jpg"], "created_at": "2026-01-01T00:00:00Z"}

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "in_", "order", "range", "limit", "single"):
            getattr(t, m).return_value = t
        if name == "payment_requests":
            t.execute.return_value = MagicMock(data=[pr_row])
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=[line_row])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    client = TestClient(app)
    res = client.get("/api/v1/payment-requests")

    assert res.status_code == 200
    payment = res.json()["requests"][0]["payments"][0]
    assert payment["bill"] is True
    assert payment["bill_image"] == "https://x/bill.jpg"


def test_single_line_cache_refresh_preserves_other_lines(monkeypatch):
    """force_refresh 1 line KHÔNG được xoá cache của line khác."""
    import payment_request_routes as prr

    prr._bill_assets_cache["assets_by_line"] = {
        "OTHER": [{"url": "u-other", "path": "payment-lines/OTHER/bill.jpg"}]
    }
    prr._bill_assets_cache["expires_at"] = 0.0

    # Ép fast-path (storage.objects) "fail" như prod → đi fallback per-line.
    monkeypatch.setattr(prr, "_build_bill_assets_from_storage_objects", lambda sb: {})
    monkeypatch.setattr(
        prr, "_build_bill_assets_from_storage_fallback",
        lambda sb, wanted: {"L1": [{"url": "u-l1", "path": "payment-lines/L1/bill.jpg"}]},
    )

    out = prr._fetch_bill_assets_fast(MagicMock(), ["L1"], force_refresh=True)

    assert out["L1"][0]["url"] == "u-l1"
    # Line OTHER phải còn trong cache sau refresh 1-line.
    assert prr._bill_assets_cache["assets_by_line"].get("OTHER"), "cache bị xoá line khác"
