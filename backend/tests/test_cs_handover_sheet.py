"""Test G3 — ghi sheet bàn giao: routing + mapping theo tên cột + tag (pure, không I/O)."""
from cs_handover_sheet import (
    resolve_route,
    build_field_values,
    build_row_values,
    _col_a1,
    _row_segments,
    _parse_course,
    _build_thang_index,
    _goi_hoc_label,
)

# Header thật (rút gọn) — KH mới (Offline, dòng 2) vs Team 2 (dòng 1).
HEADER_KH_MOI = [
    "STT", "Ngày bàn giao\n(Ngày - Tháng- Năm)", "Sale", "Tên KH", "Tên học sinh",
    "UID", "SDT KH", "Trình độ", "Quốc Tịch", "Kênh liên hệ", "Gói học",
    'Số tiền(Định dạng dấu ",")', "Ghi chú", "KH mới/ gia hạn", "Tạo nhóm GV",
    "Ngày tiếp nhận", "GVCN", "Tình trạng chăm sóc", "Ghi chú",
    "Handover date and time", "Thời gian tạo nhóm", "Contact ID",
]
HEADER_TEAM2 = [
    "STT", "TVTS", "Loại cts", "Họ tên", "SDT", "UID", "Ngày chuyển tiền",
    "Số tiền", "GV", "Gói học", "Trạng thái", "Tháng", "Tạo nhóm GV", "Note ",
    "Ngày tiếp nhận", "GVCN", "Tình trạng chăm sóc", "Ghi chú",
    "Handover date and time", "Thời gian tạo nhóm", "Kênh liên hệ", "Contact ID",
]

PR = {"name": "C Liên", "child_name": "", "phone": "84-900000000", "sale_email": "s@pf.vn"}
UID_BLOCK = {"uid": "3307581410", "name": "Uy Kha", "phone": "84-937865100"}
COURSE = {
    "code": "CC-1", "name": "Philipine 12 tháng", "amount": 17820000, "order_id": "6.8e18",
    "care_channel": "Zalo", "care_contact_id": "84-937865100", "handover_note": "care kĩ",
}


class TestRouting:
    def test_4_team_new_vs_renew(self):
        assert resolve_route("Offline", False)[1] == "Bàn giao KH mới + gia hạn Offline team"
        assert resolve_route("Offline", True)[1] == "Bàn giao KH mới + gia hạn Offline team"
        # Inhouse 2 RE-ENABLE 22/10 (match-write Kênh/Contact + ghi đơn L8).
        assert resolve_route("Inhouse 2", False)[1] == "Bàn giao KH mới Team 2"
        assert resolve_route("Inhouse 2", True)[1] == "Bàn giao KH gia hạn Team 2"
        assert resolve_route("HCM (Online)", False)[1] == "Bàn giao KH "
        assert resolve_route("Inhouse 1", False)[1] == "Bàn giao KH mới"
        assert resolve_route("Inhouse 1", True)[1] == " Bàn giao KH gia hạn"

    def test_store_teams_route_offline(self):
        assert resolve_route("Linh Dam (Store)", False)[0] == resolve_route("Offline", False)[0]
        assert resolve_route("An Binh (Store)", True)[1] == "Bàn giao KH mới + gia hạn Offline team"

    def test_unknown_team_none(self):
        assert resolve_route("Khác", False) is None
        assert resolve_route("", True) is None


class TestFieldValues:
    def test_gia_han_tag(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=True, sale_name="Vũ Thúy Hường")
        assert v["tag"] == "Gia hạn"
        v2 = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="Vũ Thúy Hường")
        assert v2["tag"] == "KH mới"

    def test_values(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="Vũ Thúy Hường")
        assert v["ten_kh"] == "C Liên"
        assert v["ten_hoc_sinh"] == "Uy Kha"
        assert v["uid"] == "3307581410"
        assert v["sdt"] == "84-937865100"          # SĐT của bé (uid_block), không dùng số PR
        assert v["so_tien"] == 17820000
        assert v["kenh_cham_soc"] == "Zalo"
        assert v["contact_id"] == "84-937865100"
        assert v["note"] == "care kĩ"

    def test_sdt_format_local_to_intl(self):
        # DB lưu số nội địa → format kèm mã nước "84-..."
        ub = {"uid": "33", "name": "Be", "phone": "977770297", "country": "VN"}
        v = build_field_values(PR, ub, COURSE, is_gia_han=False, sale_name="S")
        assert v["sdt"] == "84-977770297"
        # khách nước ngoài theo block.country
        ub_jp = {"uid": "33", "name": "Be", "phone": "8013204159", "country": "JP"}
        v2 = build_field_values(PR, ub_jp, COURSE, is_gia_han=False, sale_name="S")
        assert v2["sdt"].startswith("81-")


class TestRowMapping:
    def test_kh_moi_columns(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="Vũ Thúy Hường")
        row, owned = build_row_values(HEADER_KH_MOI, v)
        assert row[2] == "Vũ Thúy Hường"      # Sale
        assert row[3] == "C Liên"              # Tên KH
        assert row[4] == "Uy Kha"              # Tên học sinh
        assert row[5] == "3307581410"          # UID
        assert row[6] == "84-937865100"        # SDT KH
        assert row[9] == "Zalo"                # Kênh liên hệ
        assert row[11] == 17820000             # Số tiền (startswith)
        assert row[12] == "care kĩ"            # Ghi chú (ô SALE, index 12 — KHÔNG phải 18 GVCN)
        assert row[13] == "KH mới"             # tag
        assert row[21] == "84-937865100"       # Contact ID
        # owned_cols = chỉ cột G3 map; KHÔNG gồm Gói học(10), GVCN(14-18),
        # Handover date(19) + Thời gian tạo nhóm(20) của Chung.
        assert owned == {1, 2, 3, 4, 5, 6, 9, 11, 12, 13, 21}
        assert 19 not in owned and 20 not in owned   # cột Chung — KHÔNG ghi đè

    def test_team2_columns(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=True, sale_name="Vũ Thúy Hường")
        row, owned = build_row_values(HEADER_TEAM2, v)
        assert row[1] == "Vũ Thúy Hường"       # TVTS (= Sale)
        assert row[3] == "C Liên"              # Họ tên (= Tên KH)
        assert row[4] == "84-937865100"        # SDT
        assert row[5] == "3307581410"          # UID
        assert row[7] == 17820000              # Số tiền
        assert row[13] == "care kĩ"            # Note (ô sale) — KHÔNG phải "Ghi chú" (17 GVCN)
        assert row[20] == "Zalo"               # Kênh liên hệ
        assert row[21] == "84-937865100"       # Contact ID
        # Team2: Handover date(18=S) + Thời gian tạo nhóm(19=T) của Chung — KHÔNG ghi đè
        assert 18 not in owned and 19 not in owned
        assert owned == {1, 3, 4, 5, 7, 13, 20, 21}

    def test_missing_column_skipped(self):
        # Header KHÔNG có Contact ID / Kênh liên hệ → bỏ qua, không lỗi
        header = ["STT", "Sale", "Tên KH", "UID", "Ghi chú"]
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="X")
        row, owned = build_row_values(header, v)
        assert row[1] == "X"
        assert row[2] == "C Liên"
        assert row[3] == "3307581410"   # UID
        assert row[4] == "care kĩ"
        assert len(row) == 5
        assert owned == {1, 2, 3, 4}     # sale, tên KH, UID, note


class TestGvcn:
    """GVCN (mảnh 2): chỉ ghi khi field_values có 'gvcn' (maybe_push set từ CS app); build_field_values
    KHÔNG tự set → cột GVCN của Chung không bị đụng ngoài ý muốn."""

    def test_fill_fields_has_gvcn(self):
        from cs_handover_sheet import _FILL_FIELDS
        assert "gvcn" in _FILL_FIELDS   # fill-empty được phép điền cột GVCN

    def test_gvcn_not_touched_unless_set(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="S")
        assert "gvcn" not in v          # build_field_values không tự set GVCN
        _, owned = build_row_values(HEADER_KH_MOI, v)
        assert HEADER_KH_MOI.index("GVCN") not in owned

    def test_gvcn_written_when_set(self):
        v = build_field_values(PR, UID_BLOCK, COURSE, is_gia_han=False, sale_name="S")
        v["gvcn"] = "Thu Hà"            # như maybe_push làm sau khi hỏi CS app
        gi_km = HEADER_KH_MOI.index("GVCN")
        row, owned = build_row_values(HEADER_KH_MOI, v)
        assert row[gi_km] == "Thu Hà" and gi_km in owned
        gi_t2 = HEADER_TEAM2.index("GVCN")
        row2, owned2 = build_row_values(HEADER_TEAM2, v)
        assert row2[gi_t2] == "Thu Hà" and gi_t2 in owned2


class TestGvcnClient:
    def test_no_config_returns_empty(self, monkeypatch):
        import cs_gvcn_client
        monkeypatch.delenv("PALFISH_CS_SYNC_URL", raising=False)
        monkeypatch.delenv("PALFISH_CS_SYNC_KEY", raising=False)
        assert cs_gvcn_client.fetch_gvcn(["U1"]) == {}

    def test_parses_assignments(self, monkeypatch):
        import json
        import cs_gvcn_client
        monkeypatch.setenv("PALFISH_CS_SYNC_URL", "https://x/api/cs")
        monkeypatch.setenv("PALFISH_CS_SYNC_KEY", "k")

        class _Resp:
            def read(self):
                return json.dumps(
                    {"assignments": [
                        {"uid": "U1", "gvcn": "Thu Hà"},
                        {"uid": "U2", "gvcn": ""},   # không có GVCN → bỏ
                        {"uid": "", "gvcn": "X"},    # thiếu uid → bỏ
                    ]}
                ).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        monkeypatch.setattr(cs_gvcn_client.urllib.request, "urlopen", lambda *a, **k: _Resp())
        assert cs_gvcn_client.fetch_gvcn(["U1", "U2"]) == {"U1": "Thu Hà"}


class TestRowSegments:
    """_row_segments CHỈ ghi các cột trong write_cols (G3 sở hữu, trừ khóa) — cắt thành đoạn liền kề."""

    def test_col_a1(self):
        assert _col_a1(0) == "A"
        assert _col_a1(19) == "T"
        assert _col_a1(20) == "U"
        assert _col_a1(21) == "V"
        assert _col_a1(26) == "AA"

    def test_only_owned_cols_written(self):
        # G3 map {1,2,3, 20,21}; cột ngoài tập (gồm Chung/GVCN) KHÔNG ghi đè
        row = [f"c{i}" for i in range(22)]
        segs = _row_segments(row, {1, 2, 3, 20, 21})
        assert segs == [(1, ["c1", "c2", "c3"]), (20, ["c20", "c21"])]

    def test_contiguous_run(self):
        assert _row_segments(["a", "b", "c"], {0, 1, 2}) == [(0, ["a", "b", "c"])]

    def test_skip_start_col(self):
        assert _row_segments(["a", "b", "c"], {1, 2}) == [(1, ["b", "c"])]

    def test_empty_write_cols(self):
        assert _row_segments(["a", "b", "c"], set()) == []


class TestGoiHoc:
    """Auto-fill Gói học per-sheet: parse + index + nhãn đúng format từng tab."""

    def test_parse_course(self):
        assert _parse_course("2/W- NEW 48 PHI+5 HN") == ("PHI", 48, 5, 6)
        assert _parse_course("2/W- NEW 32 US-UK+2 HN") == ("US-UK", 32, 2, 4)
        assert _parse_course("2/W- NEW 192 PHI+20 HN") == ("PHI", 192, 20, 24)
        assert _parse_course("12/M - NEW 30 PHI+10 HN")[3] is None   # base 30 ngoài bảng → để trống
        assert _parse_course("96 PHI")[1] is None                    # thiếu +Y → base None

    def test_thang_index_per_tab(self):
        # Mỗi tab chỉ có 1 chính tả cho "4 tháng"
        assert _build_thang_index(["Philippines 4 tháng"])[("PHI", 4)] == "Philippines 4 tháng"
        assert _build_thang_index(["Philipine 4 tháng"])[("PHI", 4)] == "Philipine 4 tháng"
        # Ưu tiên mục có 'tháng' hơn 'th' (IH1 gia hạn loạn)
        assert _build_thang_index(["Native 6th", "Native 6 tháng"])[("US-UK", 6)] == "Native 6 tháng"
        assert _build_thang_index(["Phi 6 tháng", "Phil 9 tháng"])[("PHI", 9)] == "Phil 9 tháng"
        # Rác bị loại
        assert _build_thang_index(["Ket 36b", "Gói học", "Philippines 250b"]) == {}

    def test_label_team2_lesson(self):
        assert _goi_hoc_label(None, "x", "Bàn giao KH mới Team 2", ["Gói học"], "2/W- NEW 48 PHI+5 HN") == "48+5"
        assert _goi_hoc_label(None, "x", "Bàn giao KH gia hạn Team 2", ["Gói học"], "2/W- NEW 32 US-UK+2 HN") == "32+2"
        assert _goi_hoc_label(None, "x", "Bàn giao KH mới Team 2", ["Gói học"], "96 PHI") == ""  # hiếm

    def test_label_thang_match_and_edge(self, monkeypatch):
        import cs_handover_sheet as m
        # Offline dropdown có "Philippines 4 tháng" (riêng), KHÔNG có Native 4
        monkeypatch.setattr(m, "_read_goi_hoc_dropdown",
                            lambda svc, sid, tab, gi: ["Philippines 4 tháng", "Philipine 6 tháng", "Native 6 tháng"])
        tab = "Bàn giao KH mới + gia hạn Offline team"
        assert m._goi_hoc_label("SVC", "x", tab, ["Gói học"], "2/W- NEW 32 PHI+3 HN") == "Philippines 4 tháng"
        # Native 4 không có trong dropdown → để trống (edge)
        assert m._goi_hoc_label("SVC", "x", tab, ["Gói học"], "2/W- NEW 32 US-UK+2 HN") == ""

    def test_label_thang_no_dropdown_fallback(self, monkeypatch):
        import cs_handover_sheet as m
        # Dropdown không đọc được (vd IH1 mới range-ref) → canonical cho combo chuẩn, edge → trống
        monkeypatch.setattr(m, "_read_goi_hoc_dropdown", lambda svc, sid, tab, gi: [])
        tab = "Bàn giao KH mới"
        assert m._goi_hoc_label("SVC", "x", tab, ["Gói học"], "2/W- NEW 48 PHI+5 HN") == "Philipine 6 tháng"
        assert m._goi_hoc_label("SVC", "x", tab, ["Gói học"], "2/W- NEW 32 US-UK+2 HN") == ""   # Native 4 edge

    def test_label_no_goi_hoc_col(self):
        # Header không có cột Gói học → ""
        assert _goi_hoc_label(None, "x", "Bàn giao KH mới Team 2", ["STT", "Sale"], "2/W- NEW 48 PHI+5 HN") == ""


def _ar(is_gia_han=True, order_id="X", handover=True):
    course = {
        "code": "CC-1", "name": "Phil", "amount": 100, "order_id": order_id,
        "lead_source": "gia_han" if is_gia_han else "",
        "care_channel": "Zalo" if handover else "", "care_contact_id": "84-937865100" if handover else "",
        "handover_note": "ok" if handover else "",
    }
    return {"id": "AR1", "pr_id": "PR1",
            "uids_data": [{"uid": "3307", "name": "Uy Kha", "phone": "84-937865100", "courses": [course]}]}


class FakeStore:
    """Giả bảng cs_handover_log trong RAM (v2): fetch/claim/mark + is_done/needs_retry thật."""

    def __init__(self, rows=None, claim_ok=True):
        import cs_handover_store as real
        self.rows = dict(rows or {})
        self.claim_ok = claim_ok
        self.claims: list[str] = []
        self.marks: list[tuple[str, str]] = []
        self.is_done = real.is_done
        self.needs_retry = real.needs_retry

    def fetch_statuses(self, sb, codes):
        return {c: self.rows[c] for c in codes if c in self.rows}

    def claim(self, sb, code, ar_id, **kw):
        self.claims.append(code)
        if not self.claim_ok:
            return False
        self.rows[code] = {"course_code": code, "status": "claimed", "ar_id": ar_id, **kw}
        return True

    def mark(self, sb, code, status, **fields):
        self.marks.append((code, status))
        self.rows.setdefault(code, {})
        self.rows[code].update({"status": status, **{k: v for k, v in fields.items() if v is not None}})

    def record(self, sb, code, ar_id, status, **fields):
        self.marks.append((code, status))
        self.rows.setdefault(code, {"course_code": code})
        self.rows[code].update({"ar_id": ar_id, "status": status, **{k: v for k, v in fields.items() if v is not None}})


def _patch(monkeypatch, calls, team="Inhouse 1", header=None, store=None):
    import cs_handover_sheet as m
    store = store or FakeStore()
    monkeypatch.setattr(m, "_store", store)
    monkeypatch.setattr(m, "_fetch_ar", lambda sb, ar_id: calls.get("db_ar"))  # None → fallback snapshot
    monkeypatch.setattr(m, "_fetch_pr", lambda sb, pid: {"name": "C", "child_name": "", "phone": "84-9", "sale_email": "s@pf.vn"})
    monkeypatch.setattr(m, "_fetch_sale", lambda sb, e: {"display_name": "Full Name", "team": team})
    monkeypatch.setattr(m, "_sheets_write_service", lambda: "SVC")
    hdr = header or HEADER_TEAM2
    monkeypatch.setattr(m, "_read_header_cells", lambda svc, sid, tab: hdr)
    # G3: tab rows (mặc định chỉ header → 0 match → append), dropdown rỗng, verify OK
    monkeypatch.setattr(m, "_read_tab_rows", lambda svc, sid, tab: calls.get("rows") or [hdr])
    monkeypatch.setattr(m, "_read_col_dropdown", lambda svc, sid, tab, c: (calls.get("dropdown") or {}).get(c, []))
    monkeypatch.setattr(m, "_protected_cols", lambda svc, sid, tab: set())
    monkeypatch.setattr(m, "_verify_row", lambda svc, sid, tab, r, h, fv: calls.get("verify", True))

    def _fill(svc, sid, tab, sheet_row, existing, header_, fv, blocked):
        calls.setdefault("fill", []).append((sheet_row, dict(fv)))
        return [1]
    monkeypatch.setattr(m, "_fill_empty_cells", _fill)

    def _append(svc, sid, tab, row, owned, **kw):
        calls["append"].append((tab, row))
        return 42
    monkeypatch.setattr(m, "_append_row", _append)
    return m, store


class TestOrchestration:
    def test_happy_gia_han_to_renew_tab(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)
        out = m.maybe_push_cs_handover(None, _ar(is_gia_han=True), "CC-1")
        assert out == "appended"
        assert calls["append"][0][0] == " Bàn giao KH gia hạn"  # Inhouse 1 gia hạn (dấu cách đầu)
        assert store.claims == ["CC-1"]           # claim TRƯỚC khi ghi sheet
        assert store.marks == [("CC-1", "appended")]
        assert store.rows["CC-1"]["sheet_row"] == 42 and store.rows["CC-1"]["marker"] == "CC-1"

    def test_refetch_prefers_db_over_snapshot(self, monkeypatch):
        # Snapshot request thiếu Kênh/Contact, DB đã có → dùng DB (chống hook dùng AR cũ).
        calls = {"append": [], "db_ar": _ar()}
        m, store = _patch(monkeypatch, calls)
        out = m.maybe_push_cs_handover(None, _ar(handover=False), "CC-1")
        assert out == "appended" and len(calls["append"]) == 1

    def test_no_order_id_still_pushes(self, monkeypatch):
        # G2: trigger = báo đơn có Kênh/Contact, KHÔNG chờ order_id.
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)
        assert m.maybe_push_cs_handover(None, _ar(order_id=""), "CC-1") == "appended"

    def test_marker_written_when_tab_has_column(self, monkeypatch):
        calls = {"append": []}
        header = list(HEADER_TEAM2) + ["App Order ID"]
        m, store = _patch(monkeypatch, calls, header=header)
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "appended"
        row = calls["append"][0][1]
        assert row[len(header) - 1] == "CC-1"
        # Tab chưa có cột → không ghi marker, không lỗi
        calls2 = {"append": []}
        m, store = _patch(monkeypatch, calls2)
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "appended"
        assert "CC-1" not in calls2["append"][0][1]

    def test_accepts_ar_id_string(self, monkeypatch):
        calls = {"append": [], "db_ar": _ar()}
        m, store = _patch(monkeypatch, calls)
        assert m.maybe_push_cs_handover(None, "AR1", "CC-1") == "appended"
        calls["db_ar"] = None
        assert m.maybe_push_cs_handover(None, "AR1", "CC-1") == "no_ar"

    def test_dedup_done_in_store(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls, store=FakeStore({"CC-1": {"status": "appended"}}))
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "already"
        assert calls["append"] == [] and store.claims == []

    def test_fresh_claim_held_elsewhere(self, monkeypatch):
        from datetime import datetime, timezone
        calls = {"append": []}
        row = {"status": "claimed", "claimed_at": datetime.now(timezone.utc).isoformat()}
        m, store = _patch(monkeypatch, calls, store=FakeStore({"CC-1": row}))
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "claimed_elsewhere"
        assert calls["append"] == []

    def test_claim_lost_race_no_write(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls, store=FakeStore(claim_ok=False))
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "claimed_elsewhere"
        assert store.claims == ["CC-1"] and calls["append"] == [] and store.marks == []

    def test_retryable_row_is_retried(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls, store=FakeStore({"CC-1": {"status": "failed"}}))
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "appended"

    def test_sheet_error_marks_failed(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)

        def boom(*a, **k):
            raise RuntimeError("quota")
        monkeypatch.setattr(m, "_append_row", boom)
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "error"
        assert store.marks == [("CC-1", "failed")] and "quota" in store.rows["CC-1"]["last_error"]

    def test_no_handover_skip_without_log_row(self, monkeypatch):
        # Thiếu Kênh/Contact → không đẩy dòng rỗng và KHÔNG ghi row log (PATCH điền sau vẫn đẩy được)
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)
        assert m.maybe_push_cs_handover(None, _ar(handover=False), "CC-1") == "no_handover"
        assert calls["append"] == [] and store.claims == [] and store.marks == [] and store.rows == {}

    def test_pr_cancelled_not_pushed(self, monkeypatch):
        # Sale huỷ PR rồi tạo lại (PR-2590 → PR-2602 23/10): course của PR huỷ KHÔNG được đẩy, log 'cancelled' terminal
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)
        monkeypatch.setattr(m, "_fetch_pr", lambda sb, pid: {"id": "PR-1", "name": "C", "phone": "84-9", "sale_email": "s@pf.vn",
                                                             "state": "cancelled", "cancelled_at": "2026-10-23T07:02:35Z"})
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "pr_cancelled"
        assert calls["append"] == [] and store.claims == []
        assert store.rows["CC-1"]["status"] == "cancelled" and store.is_done(store.rows["CC-1"])
        # Lần sau: already, không đụng sheet
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "already"

    def test_unrouted_team_skip(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls, team="Khác")
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "unrouted"
        assert calls["append"] == [] and store.claims == []

    def test_dry_run_no_claim_no_write(self, monkeypatch):
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls)
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1", dry_run=True) == "appended"
        assert calls["append"] == [] and store.claims == [] and store.marks == []

    # ---- G3: upsert 3 team ----
    def _team_row(self, sdt="84-937865100", child="Uy Kha", uid="", date="", kenh="", marker=""):
        # HEADER_KH_MOI: 1=Ngày bàn giao, 4=Tên học sinh, 5=UID, 6=SDT KH, 9=Kênh liên hệ, cuối=App Order ID
        r = [""] * (len(HEADER_KH_MOI) + 1)
        r[1], r[4], r[5], r[6], r[9] = date, child, uid, sdt, kenh
        r[len(HEADER_KH_MOI)] = marker
        return r

    def _today(self):
        from datetime import datetime, timezone, timedelta
        return datetime.now(timezone(timedelta(hours=7))).strftime("%d/%m/%Y")

    def test_match_team_row_fill_empty(self, monkeypatch):
        hdr = list(HEADER_KH_MOI) + ["App Order ID"]
        calls = {"append": [], "rows": [["banner"], hdr, self._team_row(date=self._today())]}
        m, store = _patch(monkeypatch, calls, header=hdr)
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "matched"
        assert calls["append"] == []
        assert calls["fill"][0][0] == 3  # header dòng 2 → dòng team = 3
        assert store.rows["CC-1"]["status"] == "matched" and store.rows["CC-1"]["sheet_row"] == 3
        assert store.rows["CC-1"]["marker"] == "CC-1"

    def test_old_row_same_customer_not_matched(self, monkeypatch):
        # Đơn CŨ cùng khách (gia hạn) ngoài cửa sổ 14 ngày → append dòng mới, không điền vào dòng cũ
        hdr = list(HEADER_KH_MOI) + ["App Order ID"]
        calls = {"append": [], "rows": [["banner"], hdr, self._team_row(date="01/03/2026")]}
        m, store = _patch(monkeypatch, calls, header=hdr)
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "appended"
        assert "fill" not in calls

    def test_marker_of_other_course_not_matched(self, monkeypatch):
        hdr = list(HEADER_KH_MOI) + ["App Order ID"]
        calls = {"append": [], "rows": [["banner"], hdr, self._team_row(date=self._today(), marker="CC-OTHER")]}
        m, store = _patch(monkeypatch, calls, header=hdr)
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "appended"

    def test_own_marker_row_rematched(self, monkeypatch):
        # Retry sau verify_failed: dòng có marker == code → coi là dòng mình → matched (không append đôi)
        hdr = list(HEADER_KH_MOI) + ["App Order ID"]
        calls = {"append": [], "rows": [["banner"], hdr, self._team_row(date=self._today(), marker="CC-1")]}
        m, store = _patch(monkeypatch, calls, header=hdr, store=FakeStore({"CC-1": {"status": "verify_failed"}}))
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "matched"

    def test_two_team_rows_ambiguous(self, monkeypatch):
        hdr = list(HEADER_KH_MOI) + ["App Order ID"]
        today = self._today()
        calls = {"append": [], "rows": [["banner"], hdr, self._team_row(date=today), self._team_row(date=today)]}
        m, store = _patch(monkeypatch, calls, header=hdr)
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "ambiguous"
        assert calls["append"] == [] and store.rows["CC-1"]["status"] == "ambiguous"

    def test_verify_failed_marks_retryable(self, monkeypatch):
        calls = {"append": [], "verify": False}
        m, store = _patch(monkeypatch, calls)
        assert m.maybe_push_cs_handover(None, _ar(), "CC-1") == "verify_failed"
        assert store.rows["CC-1"]["status"] == "verify_failed" and store.needs_retry(store.rows["CC-1"])

    def test_dropdown_sale_and_kenh(self, monkeypatch):
        import cs_l8_order as l8
        hdr = list(HEADER_KH_MOI)
        sale_i, kenh_i = hdr.index("Sale"), hdr.index("Kênh liên hệ")
        calls = {"append": [], "dropdown": {sale_i: ["HuyenVTK", "LyVC", "Khác"], kenh_i: ["Zalo", "Kakao Talk", "Facebook"]}}
        m, store = _patch(monkeypatch, calls, header=hdr)
        monkeypatch.setattr(m, "_fetch_sale", lambda sb, e: {"display_name": "Full Name", "crm_name": "Vu Thi Khanh Huyen", "team": "Inhouse 1"})
        monkeypatch.setattr(l8, "_load_tvts", lambda svc: {"vu thi khanh huyen": "HN2 - HuyenVTK"})
        ar = _ar(is_gia_han=False)
        ar["uids_data"][0]["courses"][0]["care_channel"] = "kakao"
        assert m.maybe_push_cs_handover(None, ar, "CC-1") == "appended"
        row = calls["append"][0][1]
        assert row[sale_i] == "HuyenVTK"       # mã ngắn ∈ dropdown (không còn 'Không hợp lệ')
        assert row[kenh_i] == "Kakao Talk"     # kakao → giá trị list (startswith duy nhất)

    def test_ih2_pending_then_done(self, monkeypatch):
        import cs_l8_order as l8
        calls = {"append": []}
        m, store = _patch(monkeypatch, calls, team="Inhouse 2")
        monkeypatch.setattr(l8, "read_l8_header", lambda svc: ["UID", "App Order ID"])
        monkeypatch.setattr(l8, "fetch_payment_date", lambda sb, pid: None)
        monkeypatch.setattr(l8, "build_l8_fields", lambda *a, **k: {})
        l8_calls = []

        def _upsert(*a, **k):
            assert k["course_code"] == "CC-1" and k["legacy_order_id"] == "X"  # W = course_code (G2-T3)
            l8_calls.append(1)
            return "appended"
        monkeypatch.setattr(l8, "upsert_l8_order", _upsert)
        bg = {"v": "not_found"}
        monkeypatch.setattr(m, "_match_write_handover", lambda *a, **k: bg["v"])
        # Lần 1: L8 ghi xong, tab bàn giao chưa có đơn → not_found (retryable), l8_status lưu lại.
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "ih2_pending"
        assert store.rows["CC-1"]["status"] == "not_found" and store.rows["CC-1"]["l8_status"] == "appended"
        # Lần 2 (worker): KHÔNG gọi L8 lại, bàn giao written → done.
        bg["v"] = "written"
        assert m.maybe_push_cs_handover(None, _ar(is_gia_han=False), "CC-1") == "ih2_done"
        assert len(l8_calls) == 1 and store.rows["CC-1"]["status"] == "done"
