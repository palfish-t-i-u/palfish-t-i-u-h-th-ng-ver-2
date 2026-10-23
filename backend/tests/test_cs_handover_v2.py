"""G1 plan v2 (23/10): claim/dedup qua bảng cs_handover_log + worker đọc store.

Fake Supabase client tối thiểu (table → upsert/select/update chain) để kiểm chứng logic
claim: insert-ignore thắng/thua, reclaim có điều kiện (retryable / claim treo), mark set pushed_at.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import cs_handover_store as store


# ---------------- Fake Supabase (PostgREST-ish) ----------------
class _Res:
    def __init__(self, data):
        self.data = data


class _Query:
    def __init__(self, db: dict, op: str, payload=None, on_conflict=None, ignore_duplicates=False):
        self.db, self.op, self.payload = db, op, payload
        self.on_conflict, self.ignore_dup = on_conflict, ignore_duplicates
        self.filters: list[tuple[str, str, object]] = []

    def eq(self, k, v):
        self.filters.append(("eq", k, v)); return self

    def lt(self, k, v):
        self.filters.append(("lt", k, v)); return self

    def in_(self, k, vals):
        self.filters.append(("in", k, list(vals))); return self

    def _match(self, row):
        for op, k, v in self.filters:
            cur = row.get(k)
            if op == "eq" and cur != v:
                return False
            if op == "in" and cur not in v:
                return False
            if op == "lt" and not (cur is not None and str(cur) < str(v)):
                return False
        return True

    def execute(self):
        if self.op == "select":
            return _Res([dict(r) for r in self.db.values() if self._match(r)])
        if self.op == "upsert":
            code = self.payload["course_code"]
            if code in self.db:
                if self.ignore_dup:
                    return _Res([])
                self.db[code].update(self.payload)
                return _Res([dict(self.db[code])])
            self.db[code] = dict(self.payload)
            return _Res([dict(self.db[code])])
        if self.op == "update":
            out = []
            for r in self.db.values():
                if self._match(r):
                    r.update(self.payload)
                    out.append(dict(r))
            return _Res(out)
        raise AssertionError(self.op)


class _Table:
    def __init__(self, db):
        self.db = db

    def select(self, *_):
        return _Query(self.db, "select")

    def upsert(self, payload, on_conflict=None, ignore_duplicates=False):
        return _Query(self.db, "upsert", payload, on_conflict, ignore_duplicates)

    def update(self, payload):
        return _Query(self.db, "update", payload)


class FakeSB:
    def __init__(self, rows=None):
        self.db = {r["course_code"]: dict(r) for r in (rows or [])}

    def table(self, name):
        assert name == store.TABLE
        return _Table(self.db)


def _iso(dt):
    return dt.isoformat()


# ---------------- Tests: store ----------------
class TestClaim:
    def test_first_claim_wins(self):
        sb = FakeSB()
        assert store.claim(sb, "C1", "AR1", team="Inhouse 1", spreadsheet_id="S", tab="T") is True
        row = sb.db["C1"]
        assert row["status"] == "claimed" and row["ar_id"] == "AR1" and row["tab"] == "T"

    def test_second_claim_same_code_loses(self):
        sb = FakeSB()
        assert store.claim(sb, "C1", "AR1") is True
        assert store.claim(sb, "C1", "AR1") is False  # claim còn tươi → kênh kia đang giữ

    def test_done_row_never_reclaimed(self):
        sb = FakeSB([{"course_code": "C1", "status": "appended", "ar_id": "AR1"}])
        assert store.claim(sb, "C1", "AR1") is False
        assert sb.db["C1"]["status"] == "appended"

    def test_retryable_row_reclaimed_once(self):
        sb = FakeSB([{"course_code": "C1", "status": "failed", "ar_id": "AR1", "attempts": 2}])
        assert store.claim(sb, "C1", "AR1") is True
        assert sb.db["C1"]["status"] == "claimed" and sb.db["C1"]["attempts"] == 3
        # Kênh thứ 2 tới ngay sau: row đã 'claimed' tươi → thua.
        assert store.claim(sb, "C1", "AR1") is False

    def test_stale_claim_reclaimed(self):
        old = _iso(datetime.now(timezone.utc) - store.STALE_CLAIM - timedelta(minutes=1))
        sb = FakeSB([{"course_code": "C1", "status": "claimed", "ar_id": "AR1", "claimed_at": old}])
        assert store.needs_retry(sb.db["C1"]) is True
        assert store.claim(sb, "C1", "AR9") is True
        assert sb.db["C1"]["ar_id"] == "AR9"

    def test_empty_code_rejected(self):
        assert store.claim(FakeSB(), "", "AR1") is False

    def test_claim_falls_back_on_23505(self):
        """Client không hỗ trợ ignore_duplicates → raise 23505 → rơi sang nhánh reclaim (không crash)."""
        sb = FakeSB([{"course_code": "C1", "status": "not_found", "ar_id": "AR1"}])
        orig = _Table.upsert

        def boom(self, payload, **kw):
            raise RuntimeError('duplicate key value violates unique constraint (23505)')
        _Table.upsert = boom
        try:
            assert store.claim(sb, "C1", "AR1") is True
        finally:
            _Table.upsert = orig


class TestStatusHelpers:
    def test_is_done(self):
        for s in ("appended", "matched", "merged", "done", "dup_manual", "ambiguous"):
            assert store.is_done({"status": s})
        # skipped_no_handover KHÔNG terminal: sale điền Kênh sau qua PATCH phải đẩy được
        for s in ("claimed", "not_found", "failed", "skipped_no_handover", ""):
            assert not store.is_done({"status": s})
        assert not store.is_done(None)

    def test_needs_retry(self):
        assert store.needs_retry(None)
        assert store.needs_retry({"status": "not_found"})
        assert store.needs_retry({"status": "verify_failed"})
        assert not store.needs_retry({"status": "done"})
        fresh = {"status": "claimed", "claimed_at": _iso(datetime.now(timezone.utc))}
        assert not store.needs_retry(fresh)
        assert store.needs_retry({"status": "claimed", "claimed_at": "garbage"})  # parse lỗi → cho thử lại

    def test_mark_sets_pushed_at_only_on_success(self):
        sb = FakeSB([{"course_code": "C1", "status": "claimed", "ar_id": "AR1"}])
        store.mark(sb, "C1", "not_found", l8_status="appended")
        assert sb.db["C1"]["status"] == "not_found" and "pushed_at" not in sb.db["C1"]
        assert sb.db["C1"]["l8_status"] == "appended"
        store.mark(sb, "C1", "appended", sheet_row=12, marker="C1", last_error=None)
        assert sb.db["C1"]["pushed_at"] and sb.db["C1"]["sheet_row"] == 12
        assert "last_error" not in sb.db["C1"]  # None không ghi đè

    def test_fetch_statuses_batch(self):
        sb = FakeSB([{"course_code": "C1", "status": "done"}, {"course_code": "C2", "status": "failed"}])
        got = store.fetch_statuses(sb, ["C1", "C2", "C3", ""])
        assert set(got) == {"C1", "C2"}
        assert store.fetch_statuses(sb, []) == {}


# ---------------- Tests: khoá match v2 (G2-T2) ----------------
class TestMatchKey:
    HDR = ["STT", "Ngày bàn giao", "Sale", "Tên KH", "Tên học sinh", "UID", "SDT KH", "Số tiền", "Kênh liên hệ"]

    def _r(self, child="", uid="", sdt="", tien=""):
        return ["", "", "", "KH", child, uid, sdt, tien, ""]

    def test_phone9_and_child_norm(self):
        from cs_handover_sheet import _phone9, _norm_child
        assert _phone9("84-977770297") == _phone9("0977770297") == _phone9("977 770 297") == "977770297"
        assert _phone9("+84 (977) 770-297") == "977770297"
        assert _phone9("12345") == "12345"
        assert _norm_child("Bé Minh Anh") == _norm_child("minh anh") == _norm_child("MINH  ANH") == "minh anh"
        assert _norm_child("con Đức") == "duc"
        assert _norm_child("") == ""

    def test_amount_close(self):
        from cs_handover_sheet import _amount_close
        assert _amount_close("17.820.000", 17778324)        # NET vs niêm yết (~0,23%)
        assert _amount_close("9,050,000", "9050000.0")
        assert not _amount_close("5.000.000", 9050000)
        assert not _amount_close("", 9050000) and not _amount_close("abc", 1)

    def test_single_match_by_phone(self):
        from cs_handover_sheet import _match_key_rows
        rows = [self.HDR, self._r(sdt="0911111111"), self._r(child="Bé Na", sdt="84-977770297")]
        assert _match_key_rows(self.HDR, rows, phone_intl="84-977770297", child_name="Na") == [2]

    def test_child_name_filters_but_empty_child_accepted(self):
        from cs_handover_sheet import _match_key_rows
        rows = [self.HDR,
                self._r(child="Bé Na", sdt="84-977770297"),
                self._r(child="Bé Bi", sdt="84-977770297"),
                self._r(child="", sdt="84-977770297")]
        got = _match_key_rows(self.HDR, rows, phone_intl="977770297", child_name="Na")
        assert got == [1, 3] or got == [1, 3]  # Na + dòng trống tên (≥2 → caller ambiguous nếu không tiebreak)

    def test_tiebreak_uid_then_amount(self):
        from cs_handover_sheet import _match_key_rows
        rows = [self.HDR,
                self._r(child="Na", uid="3301", sdt="0977770297", tien="9.050.000"),
                self._r(child="Na", uid="3302", sdt="0977770297", tien="5.000.000"),
                self._r(child="Na", uid="", sdt="0977770297", tien="9.050.000")]
        assert _match_key_rows(self.HDR, rows, phone_intl="977770297", child_name="Na", uid="3302") == [2]
        # Không UID → tiền ±3%: dòng 1 và 3 cùng tiền → vẫn 2 → ambiguous
        got = _match_key_rows(self.HDR, rows, phone_intl="977770297", child_name="Na", amount=9050000)
        assert got == [1, 3]
        # Tiền NET lệch nhẹ vẫn khớp dòng 5.000.000? Không: 5tr vs 9tr lệch xa → chỉ dòng 1, 3
        got = _match_key_rows(self.HDR, rows, phone_intl="977770297", child_name="Na", amount=9000000)
        assert got == [1, 3]

    def test_no_phone_or_no_column(self):
        from cs_handover_sheet import _match_key_rows
        rows = [self.HDR, self._r(sdt="0977770297")]
        assert _match_key_rows(self.HDR, rows, phone_intl="", child_name="Na") == []
        assert _match_key_rows(self.HDR, rows, phone_intl="123", child_name="Na") == []
        hdr_no_sdt = ["STT", "Tên KH"]
        assert _match_key_rows(hdr_no_sdt, [hdr_no_sdt, ["", "x"]], phone_intl="0977770297", child_name="") == []

    def test_contact_phone_cross_match(self):
        # AR-1731: team ghi SĐT = số Zalo (…3668), app SĐT tài khoản (…7839) + Contact ID …3668 → vẫn khớp
        from cs_handover_sheet import _match_key_rows
        hdr = self.HDR + ["Contact ID"]
        rows = [hdr, self._r(child="Anh Minh", sdt="84-939693668") + [""]]
        assert _match_key_rows(hdr, rows, phone_intl="84-919227839", child_name="Anh Minh", contact="0939693668") == [1]
        # chiều ngược: dòng team SĐT khác nhưng Contact ID = SĐT app
        rows2 = [hdr, self._r(child="Anh Minh", sdt="0911111111") + ["0919227839"]]
        assert _match_key_rows(hdr, rows2, phone_intl="84-919227839", child_name="Anh Minh") == [1]
        # tên bé khác → không khớp dù số trùng
        assert _match_key_rows(hdr, rows, phone_intl="84-919227839", child_name="Bi", contact="0939693668") == []

    def test_no_child_column_phone_only(self):
        from cs_handover_sheet import _match_key_rows
        hdr = ["Tên KH", "SDT", "UID"]
        rows = [hdr, ["A", "0977770297", "1"], ["B", "0977770297", "2"]]
        assert _match_key_rows(hdr, rows, phone_intl="84-977770297", child_name="Na") == [1, 2]
        assert _match_key_rows(hdr, rows, phone_intl="84-977770297", child_name="Na", uid="2") == [2]


# ---------------- Tests: G3 neo hàng trống / recent / fill-empty / dropdown ----------------
class _FakeSvc:
    """Mock Sheets tối thiểu: get() trả grid theo range, update() ghi lại."""

    def __init__(self, grid, row_fetch=None):
        self.grid, self.updates, self.row_fetch = grid, [], row_fetch

    def spreadsheets(self): return self
    def values(self): return self

    def get(self, spreadsheetId=None, range=None, **kw):
        if self.row_fetch is not None and range and "!A" in range and ":" in range.split("!")[1]:
            # đọc 1 dòng Ax:Yx (verify)
            return _Res_({"values": self.row_fetch})
        return _Res_({"values": self.grid})

    def update(self, spreadsheetId=None, range=None, valueInputOption=None, body=None):
        self.updates.append((range, body["values"]))
        return _Res_({})


class _Res_:
    def __init__(self, d): self.d = d
    def execute(self): return self.d


class TestAnchoredNextRow:
    HDR = ["STT", "Ngày bàn giao", "Sale", "Tên KH", "Tên học sinh", "UID", "SDT KH", "Kênh liên hệ", "Tạo nhóm GV"]
    OWNED = {1, 2, 3, 4, 5, 6, 7}  # app sở hữu; cột 8 (Tạo nhóm GV) KHÔNG

    def test_stray_cell_below_does_not_pull_anchor(self):
        from cs_handover_sheet import _anchored_next_row, _key_cols
        rows = [["banner"], self.HDR,
                ["1", "22/10", "S", "KH A", "Bé A", "1", "0911", "Zalo", ""],
                ["2", "23/10", "S", "KH B", "Bé B", "2", "0912", "Zalo", ""],
                [], [], [], [],
                ["", "", "", "", "", "", "", "", "Und…"]]   # ô nháp dropdown cột N (Ms Trinh)
        # legacy = len+1 = 10; neo cột khoá = ngay sau dòng dữ liệu cuối = 5
        assert _anchored_next_row(rows, 1, _key_cols(self.HDR), self.OWNED) == 5

    def test_skips_rows_where_owned_cells_occupied(self):
        from cs_handover_sheet import _anchored_next_row, _key_cols
        rows = [self.HDR,
                ["1", "", "", "KH A", "", "", "0911", "", ""],
                ["", "23/10", "", "", "", "", "", "", ""]]  # dòng 3 có Ngày (owned) nhưng không có khoá → bị chiếm → bỏ qua
        assert _anchored_next_row(rows, 0, _key_cols(self.HDR), self.OWNED) == 4

    def test_empty_tab_writes_after_header(self):
        from cs_handover_sheet import _anchored_next_row, _key_cols, _next_empty_row
        assert _anchored_next_row([["banner"], self.HDR], 1, _key_cols(self.HDR), self.OWNED) == 3
        # _next_empty_row legacy (không header) = len+1
        assert _next_empty_row(_FakeSvc([["a"], ["b"]]), "S", "T") == 3
        assert _next_empty_row(_FakeSvc([self.HDR, ["1", "", "", "KH", "", "", "09", "", ""], [], ["", "", "", "", "", "", "", "", "x"]]),
                               "S", "T", header=self.HDR, owned_cols=self.OWNED) == 3

    def test_l8_append_anchored(self):
        import cs_l8_order as l8
        hdr = ["STT", "TVTS", "Loại cts", "Họ tên", "SDT", "UID", "Ngày chuyển tiền", "Số tiền", "GV", "App Order ID"]
        grid = [hdr, ["1", "HN2 - A", "FB", "KH - Bé", "84-9", "3301", "22/10", "9.050.000", "", ""],
                [], [], ["", "", "", "", "", "", "", "", "GV nháp", ""]]
        svc = _FakeSvc(grid)
        fields = {"TVTS": "HN2 - B", "Họ tên": "X - Y", "SDT": "84-8", "UID": "3302", "Số tiền": "5000000", "App Order ID": "CC-2"}
        assert l8.upsert_l8_order(svc, hdr, fields, uid="3302", so_tien="5000000", course_code="CC-2") == "appended"
        assert all(rng.endswith("3") for rng, _ in svc.updates), svc.updates  # dòng 3, không phải 6

    def test_l8_prefilled_thang_and_stt_not_occupied(self):
        # L8 23/10: team điền sẵn STT + Tháng 8 dòng dưới dữ liệu → app phải ghi ngay dòng kế, không nhảy xuống 1404
        import cs_l8_order as l8
        hdr = ["STT", "TVTS", "Họ tên", "SDT", "UID", "Số tiền", "Tháng", "App Order ID"]
        grid = [hdr, ["1395", "HN2 - A", "KH", "84-9", "3301", "9.050.000", "2026-10", "CC-1"]]
        grid += [[str(1396 + i), "", "", "", "", "", "2026-10", ""] for i in range(8)]
        svc = _FakeSvc(grid)
        fields = {"TVTS": "HN2 - B", "Họ tên": "X", "SDT": "84-8", "UID": "3302", "Số tiền": "5000000", "Tháng": "2026-10", "App Order ID": "CC-2"}
        assert l8.upsert_l8_order(svc, hdr, fields, uid="3302", so_tien="5000000", course_code="CC-2") == "appended"
        assert all(rng.endswith("3") for rng, _ in svc.updates), svc.updates  # dòng 3 (ngay sau 1395), không phải 11
        # cột Tháng vẫn được ghi (cùng giá trị), STT không đụng
        assert not any("!A" in rng for rng, _ in svc.updates)


class TestRecentAndFill:
    HDR = ["STT", "Ngày bàn giao", "Sale", "Tên KH", "Tên học sinh", "UID", "SDT KH", "Kênh liên hệ", "Contact ID", "Ghi chú"]

    def test_recent_rows_window_and_tail(self):
        from cs_handover_sheet import _recent_rows
        from datetime import date
        today = date(2026, 10, 23)
        rows = [self.HDR, ["", "23/10/2026"], ["", "01/03/2026"], ["", "20-10-26"], ["", "không có ngày"], ["", "25/10/2026"]]
        got = _recent_rows(self.HDR, rows, 0, today=today)
        assert got == {1, 3, 4, 5}  # 01/03 loại; 'không có ngày' nhận vì trong tail

    def test_recent_rows_no_date_col_uses_tail(self):
        from cs_handover_sheet import _recent_rows, _RECENT_TAIL
        hdr = ["STT", "Tên KH", "SDT"]
        rows = [hdr] + [["", "x", "0"] for _ in range(_RECENT_TAIL + 50)]
        got = _recent_rows(hdr, rows, 0)
        assert len(got) == _RECENT_TAIL and min(got) == 51

    def test_fill_empty_does_not_overwrite(self):
        from cs_handover_sheet import _fill_empty_cells
        svc = _FakeSvc([])
        existing = ["1", "23/10", "S", "KH", "Bé", "", "0911", "Zalo", "", "ghi chú team"]
        fv = {"kenh_cham_soc": "Facebook", "contact_id": "84-911", "note": "note app", "uid": "3301", "sdt": "x"}
        written = _fill_empty_cells(svc, "S", "T", 7, existing, self.HDR, fv, blocked={8})
        # Kênh có data → không đè; Contact bị khoá → bỏ; Ghi chú có data → không đè; UID trống → ghi
        assert written == [5] and svc.updates == [("'T'!F7", [["3301"]])]

    def test_verify_row(self):
        from cs_handover_sheet import _verify_row
        hdr = self.HDR + ["App Order ID"]
        fv = {"sdt": "84-937865100", "app_order_id": "CC-1"}
        ok = _FakeSvc([], row_fetch=[["", "", "", "", "", "", "0937865100", "", "", "", "CC-1"]])
        assert _verify_row(ok, "S", "T", 5, hdr, fv) is True
        bad = _FakeSvc([], row_fetch=[["", "", "", "", "", "", "0937865100", "", "", "", "CC-9"]])
        assert _verify_row(bad, "S", "T", 5, hdr, fv) is False
        # Không có cột marker → so SĐT
        fv2 = {"sdt": "84-937865100"}
        assert _verify_row(ok, "S", "T", 5, self.HDR, fv2) is True
        assert _verify_row(_FakeSvc([], row_fetch=[["", "", "", "", "", "", "0900000000"]]), "S", "T", 5, self.HDR, fv2) is False


class TestDropdown:
    def test_dropdown_value(self):
        from cs_handover_sheet import _dropdown_value
        opts = ["Zalo", "Kakao Talk", "Facebook", "Zalo OA"]
        assert _dropdown_value(opts, "zalo ") == "Zalo"              # bằng (fold) thắng startswith
        assert _dropdown_value(opts, "Kakao") == "Kakao Talk"         # startswith duy nhất
        assert _dropdown_value(opts, "Za") is None                    # startswith 2 hit → không đoán
        assert _dropdown_value(opts, "", None, "facebook") == "Facebook"
        assert _dropdown_value(opts, "Line") is None

    def test_sale_label_priority(self, monkeypatch):
        import cs_handover_sheet as m
        import cs_l8_order as l8
        hdr = ["STT", "Sale", "Tên KH"]
        monkeypatch.setattr(l8, "_load_tvts", lambda svc: {"nguyen van a": "HN1 - AnhNV"})
        monkeypatch.setattr(m, "_read_col_dropdown", lambda svc, sid, tab, c: ["AnhNV", "LyVC"])
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A") == "AnhNV"
        monkeypatch.setattr(m, "_read_col_dropdown", lambda svc, sid, tab, c: ["HN1 - AnhNV"])
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A") == "HN1 - AnhNV"
        monkeypatch.setattr(m, "_read_col_dropdown", lambda svc, sid, tab, c: ["Ai đó"])
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A") == "Nguyễn Văn A"
        monkeypatch.setattr(m, "_read_col_dropdown", lambda svc, sid, tab, c: [])
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A") == "Nguyễn Văn A"
        # IH1: luôn mã ngắn kể cả tab không dropdown (KH mới 23/10: 7 dòng app full name vs team ThaoPT/SonTT)
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A", team="Inhouse 1") == "AnhNV"
        # IH1 nhưng không có trong TVTS → full name
        assert m._sale_label("S", "x", "t", hdr, crm_name="Ai Do", full_name="Ai Đó", team="Inhouse 1") == "Ai Đó"
        # Team khác không dropdown → full name (chưa rõ quy ước)
        assert m._sale_label("S", "x", "t", hdr, crm_name="Nguyen Van A", full_name="Nguyễn Văn A", team="HCM (Online)") == "Nguyễn Văn A"

    def test_read_col_dropdown_list_and_range(self):
        import cs_handover_sheet as m

        class Svc:
            def __init__(self, dv, ref_vals=None):
                self.dv, self.ref_vals = dv, ref_vals
            def spreadsheets(self): return self
            def values(self): return self
            def get(self, **kw):
                if "ranges" in kw:
                    return _Res_({"sheets": [{"data": [{"rowData": [{"values": [{"dataValidation": {"condition": self.dv}}]}]}]}]})
                return _Res_({"values": self.ref_vals or []})

        m._dv_cache.clear()
        lst = Svc({"type": "ONE_OF_LIST", "values": [{"userEnteredValue": "Zalo"}, {"userEnteredValue": "Line"}]})
        assert m._read_col_dropdown(lst, "S1", "T", 9) == ["Zalo", "Line"]
        rng = Svc({"type": "ONE_OF_RANGE", "values": [{"userEnteredValue": "='Danh mục'!A2:A50"}]}, ref_vals=[["Zalo"], [""], ["Kakao Talk"]])
        assert m._read_col_dropdown(rng, "S2", "T", 9) == ["Zalo", "Kakao Talk"]
        # cache: đổi svc nhưng cùng key → giá trị cũ
        assert m._read_col_dropdown(lst, "S2", "T", 9) == ["Zalo", "Kakao Talk"]
        m._dv_cache.clear()


# ---------------- Tests: worker dùng store ----------------
class TestWorkerReconcile:
    def _ars(self):
        def course(code, oid="OID", chan="Zalo"):
            return {"code": code, "order_id": oid, "care_channel": chan, "care_contact_id": "x" if chan else ""}
        return [
            {"id": "AR1", "pr_id": "P", "uids_data": [{"uid": "1", "courses": [course("C1"), course("C2")]}]},
            {"id": "AR2", "pr_id": "P", "uids_data": [{"uid": "2", "courses": [course("C3"), course("C4", oid="")]}]},
            {"id": "AR3", "pr_id": "P", "uids_data": [{"uid": "3", "courses": [course("C5", chan="")]}]},
        ]

    def test_only_needs_retry_courses_pushed(self, monkeypatch):
        import cs_handover_reconcile_worker as w

        class SB:
            def __init__(self, ars, cancelled_prs=None):
                self.ars, self.cancelled_prs, self.t = ars, cancelled_prs or [], ""

            def table(self, name):
                self.t = name
                return self

            def select(self, *_): return self
            def gte(self, *_): return self
            def in_(self, *_): return self
            def eq(self, *_): return self

            def execute(self):
                if self.t == "payment_requests":
                    return _Res([{"id": p, "cancelled_at": "2026-10-23T07:02:35Z"} for p in self.cancelled_prs])
                return _Res(self.ars)

        fresh = _iso(datetime.now(timezone.utc))
        statuses = {
            "C1": {"status": "appended"},                       # xong → bỏ
            "C2": {"status": "claimed", "claimed_at": fresh},   # kênh khác đang giữ → bỏ
            # C3: chưa có row → làm
        }
        monkeypatch.setattr(w._store, "fetch_statuses", lambda sb, codes: {c: statuses[c] for c in codes if c in statuses})
        pushed = []
        monkeypatch.setattr(w, "maybe_push_cs_handover", lambda sb, ar_id, code: (pushed.append((ar_id, code)), "appended")[1])
        n = w.reconcile_pending(SB(self._ars()))
        # G2: C4 KHÔNG order_id vẫn là ứng viên (trigger = báo đơn); C5 không Kênh/Contact → bỏ.
        assert pushed == [("AR2", "C3"), ("AR2", "C4")] and n == 2

    def test_pushed_course_whose_pr_cancelled_later_is_flagged(self, monkeypatch):
        # PR-2590 23/10: course đã đẩy (done) rồi sale huỷ PR → worker ghi 'cancelled' + cảnh báo, không push lại
        import cs_handover_reconcile_worker as w

        class SB:
            def __init__(self): self.t = ""
            def table(self, name): self.t = name; return self
            def select(self, *_): return self
            def gte(self, *_): return self
            def in_(self, *_): return self
            def eq(self, *_): return self
            def execute(self):
                if self.t == "payment_requests":
                    return _Res([{"id": "PR-X", "cancelled_at": "2026-10-23T07:02:35Z"}])
                return _Res([{"id": "AR-X", "pr_id": "PR-X", "uids_data": [{"uid": "1", "courses": [
                    {"code": "C-done", "care_channel": "Zalo"}, {"code": "C-new", "care_channel": "Zalo"}]}]}])

        recorded = []
        monkeypatch.setattr(w._store, "fetch_statuses", lambda sb, codes: {"C-done": {"status": "done", "tab": "T", "sheet_row": 9}})
        monkeypatch.setattr(w._store, "record", lambda sb, code, ar_id, status, **f: recorded.append((code, status)))
        pushed = []
        monkeypatch.setattr(w, "maybe_push_cs_handover", lambda sb, ar_id, code: (pushed.append(code), "pr_cancelled")[1])
        w.reconcile_pending(SB())
        assert recorded == [("C-done", "cancelled")]   # course chưa có log → để maybe_push tự ghi cancelled
        assert pushed == ["C-new"]                      # course done đã chuyển cancelled → không push lại

    def test_worker_passes_ar_id_not_snapshot(self, monkeypatch):
        import cs_handover_reconcile_worker as w

        class SB:
            def __init__(self): self.t = ""
            def table(self, name): self.t = name; return self
            def select(self, *_): return self
            def gte(self, *_): return self
            def in_(self, *_): return self
            def eq(self, *_): return self
            def execute(self):
                if self.t == "payment_requests":
                    return _Res([])
                return _Res([{"id": "AR7", "pr_id": "P", "uids_data": [
                    {"uid": "1", "courses": [{"code": "C9", "order_id": "O", "care_channel": "Zalo"}]}]}])

        monkeypatch.setattr(w._store, "fetch_statuses", lambda sb, codes: {})
        seen = []
        monkeypatch.setattr(w, "maybe_push_cs_handover", lambda sb, ar_ref, code: (seen.append(ar_ref), "appended")[1])
        w.reconcile_pending(SB())
        assert seen == ["AR7"]  # str id → maybe_push tự re-fetch AR mới
