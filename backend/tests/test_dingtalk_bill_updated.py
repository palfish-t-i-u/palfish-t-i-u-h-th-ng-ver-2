"""DingTalk 'bill_updated' producer — unit tests.

Tin "SALE CẬP NHẬT ẢNH BILL" khi sale up bill lên đơn ĐÃ BÁO:
- CHỈ bắn khi có AR cho pr_id (đơn đã báo) — chưa báo → im lặng.
- Chỉ ảnh VỪA up (public_url), không gộp bill cũ.
- 2 row: text (SĐT đơn) + ảnh; PDF → chỉ text.
- RAW team routing, skip nếu team không có active group. Best-effort (không raise).
"""
import hashlib
import uuid
from unittest.mock import MagicMock

import activation_routes


# ---------------------------------------------------------------------------
# _ar_order_phones (pure)
# ---------------------------------------------------------------------------
class TestArOrderPhones:
    def test_single_phone_from_block(self):
        ar = {"uids_data": [{"phone": "0976082255", "courses": []}]}
        pr = {"phone": "0900000000", "country": "VN"}
        assert activation_routes._ar_order_phones(ar, pr) == ["84-976082255"]

    def test_multi_uid_two_phones(self):
        ar = {"uids_data": [
            {"phone": "0976082255", "courses": []},
            {"phone": "0912345678", "courses": []},
        ]}
        pr = {"phone": "0900000000", "country": "VN"}
        assert activation_routes._ar_order_phones(ar, pr) == ["84-976082255", "84-912345678"]

    def test_block_no_phone_falls_back_to_pr(self):
        ar = {"uids_data": [{"phone": "", "courses": []}]}
        pr = {"phone": "0976082255", "country": "VN"}
        assert activation_routes._ar_order_phones(ar, pr) == ["84-976082255"]

    def test_dedup_same_number_across_blocks(self):
        ar = {"uids_data": [
            {"phone": "0976082255", "courses": []},
            {"phone": "", "courses": []},  # → fallback pr.phone = trùng
        ]}
        pr = {"phone": "0976082255", "country": "VN"}
        assert activation_routes._ar_order_phones(ar, pr) == ["84-976082255"]

    def test_empty_uids_uses_pr_phone(self):
        assert activation_routes._ar_order_phones({"uids_data": []}, {"phone": "0976082255"}) == ["84-976082255"]

    def test_no_phone_anywhere_returns_empty(self):
        assert activation_routes._ar_order_phones({"uids_data": [{"courses": []}]}, {}) == []

    def test_non_dict_blocks_guarded(self):
        ar = {"uids_data": ["junk", None, {"phone": "0976082255", "courses": []}]}
        assert activation_routes._ar_order_phones(ar, {}) == ["84-976082255"]


# ---------------------------------------------------------------------------
# _is_bill_image_url
# ---------------------------------------------------------------------------
class TestIsBillImageUrl:
    def test_image_exts_true(self):
        for u in ["a/b.jpg", "a/b.JPEG", "x.png?token=1", "y.webp", "z.gif"]:
            assert activation_routes._is_bill_image_url(u) is True

    def test_pdf_false(self):
        assert activation_routes._is_bill_image_url("bills/x.pdf") is False
        assert activation_routes._is_bill_image_url("bills/noext") is False


# ---------------------------------------------------------------------------
# _maybe_enqueue_bill_updated_dingtalk (wiring)
# ---------------------------------------------------------------------------
def _chain(data):
    t = MagicMock()
    for m in ("select", "eq", "ilike", "order", "limit"):
        getattr(t, m).return_value = t
    t.execute.return_value = MagicMock(data=data)
    return t


def _build_sb(*, ar_rows=None, pr_rows=None, staff_rows=None, group_rows=None,
              insert_side_effect=None):
    outbox_calls = []

    def _outbox_insert(payload):
        if insert_side_effect is not None:
            raise insert_side_effect
        outbox_calls.append(payload)
        m = MagicMock()
        m.execute.return_value = MagicMock(data=[payload])
        return m

    outbox_table = MagicMock()
    outbox_table.insert = _outbox_insert

    tables = {
        "active_requests": _chain(ar_rows if ar_rows is not None else []),
        "payment_requests": _chain(pr_rows if pr_rows is not None else []),
        "nhan_su_sale": _chain(staff_rows or []),
        "dingtalk_team_groups": _chain(group_rows or []),
        "dingtalk_outbox": outbox_table,
    }
    sb = MagicMock()
    sb.table.side_effect = lambda name: tables.get(name, MagicMock())
    return sb, outbox_calls


def _happy_kwargs(**over):
    base = dict(
        ar_rows=[{"id": "AR-1", "pr_id": "PR-1", "is_test": False,
                  "uids_data": [{"phone": "0976082255", "courses": []}]}],
        pr_rows=[{"id": "PR-1", "is_test": False, "sale_email": "sale@x.com",
                  "phone": "0976082255", "country": "VN"}],
        staff_rows=[{"email": "sale@x.com", "team": "Inhouse 2"}],
        group_rows=[{"team_code": "Inhouse 2", "is_active": True}],
    )
    base.update(over)
    return base


_LINE = {"id": "L1", "payment_request_id": "PR-1"}
_IMG = "https://s/bills/L1/20260907.jpg"


def test_happy_path_enqueues_text_and_image(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs())
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)

    assert len(calls) == 2
    text, img = calls[0], calls[1]
    assert text["event_type"] == "bill_updated"
    assert text["source_table"] == "payment_lines"
    assert text["team_code"] == "Inhouse 2"
    assert text["message"] == "SALE CẬP NHẬT ẢNH BILL\nCập nhật cho đơn: 84-976082255"
    assert "image_url" not in text
    assert img["message"] == ""
    assert img["image_url"] == _IMG
    assert img["image_urls"] == [_IMG]
    # source_id UUID-cast, keyed theo URL vừa up
    bh = hashlib.md5(_IMG.encode()).hexdigest()
    assert text["source_id"] == str(uuid.UUID(hashlib.md5(f"L1:billupd:text:{bh}".encode()).hexdigest()))
    assert img["source_id"] == str(uuid.UUID(hashlib.md5(f"L1:billupd:img:{bh}".encode()).hexdigest()))
    assert text["source_id"] != img["source_id"]


def test_no_ar_means_order_not_reported_skips(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs(ar_rows=[]))
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls == []


def test_test_ar_skips(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    kw = _happy_kwargs()
    kw["ar_rows"][0]["is_test"] = True
    sb, calls = _build_sb(**kw)
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls == []


def test_team_without_active_group_skips(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs(group_rows=[{"team_code": "Inhouse 2", "is_active": False}]))
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls == []


def test_no_group_row_skips(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs(group_rows=[]))
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls == []


def test_pdf_bill_sends_only_text_row(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs())
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, "https://s/bills/L1/x.pdf")
    assert len(calls) == 1
    assert calls[0]["message"].startswith("SALE CẬP NHẬT ẢNH BILL")
    assert "image_url" not in calls[0]


def test_multi_uid_message_lists_all_phones(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    kw = _happy_kwargs()
    kw["ar_rows"][0]["uids_data"] = [
        {"phone": "0976082255", "courses": []},
        {"phone": "0912345678", "courses": []},
    ]
    sb, calls = _build_sb(**kw)
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls[0]["message"] == "SALE CẬP NHẬT ẢNH BILL\nCập nhật cho đơn: 84-976082255, 84-912345678"


def test_event_disabled_skips(monkeypatch):
    monkeypatch.setenv("DINGTALK_DISABLED_EVENTS", "bill_updated")
    sb, calls = _build_sb(**_happy_kwargs())
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
    assert calls == []


def test_empty_url_skips(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, calls = _build_sb(**_happy_kwargs())
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, "")
    assert calls == []


def test_duplicate_insert_swallowed(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb, _ = _build_sb(**_happy_kwargs(insert_side_effect=RuntimeError("duplicate key value")))
    # must NOT raise
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)


def test_never_raises_on_unexpected_error(monkeypatch):
    monkeypatch.delenv("DINGTALK_DISABLED_EVENTS", raising=False)
    sb = MagicMock()
    sb.table.side_effect = RuntimeError("db down")
    # best-effort — không được ném lỗi ra ngoài (không chặn upload)
    activation_routes._maybe_enqueue_bill_updated_dingtalk(sb, _LINE, _IMG)
