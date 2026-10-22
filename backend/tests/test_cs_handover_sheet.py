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


def _ar(is_gia_han=True, order_id="X", pushed=False):
    course = {
        "code": "CC-1", "name": "Phil", "amount": 100, "order_id": order_id,
        "lead_source": "gia_han" if is_gia_han else "",
        "care_channel": "Zalo", "care_contact_id": "84-937865100", "handover_note": "ok",
    }
    if pushed:
        course["handover_pushed_at"] = "now"
    return {"id": "AR1", "pr_id": "PR1",
            "uids_data": [{"uid": "3307", "name": "Uy Kha", "phone": "84-937865100", "courses": [course]}]}


def _patch(monkeypatch, calls, team="Inhouse 2", header=None):
    import cs_handover_sheet as m
    monkeypatch.setattr(m, "_fetch_pr", lambda sb, pid: {"name": "C", "child_name": "", "phone": "84-9", "sale_email": "s@pf.vn"})
    monkeypatch.setattr(m, "_fetch_sale", lambda sb, e: {"display_name": "Full Name", "team": team})
    monkeypatch.setattr(m, "_sheets_write_service", lambda: "SVC")
    monkeypatch.setattr(m, "_read_header_cells", lambda svc, sid, tab: header or HEADER_TEAM2)
    monkeypatch.setattr(m, "_append_row", lambda svc, sid, tab, row, owned: calls["append"].append((tab, row)))
    monkeypatch.setattr(m, "_mark_handover_pushed", lambda sb, ar, uids, cc: calls["mark"].append(cc))
    monkeypatch.setattr(m, "_read_goi_hoc_dropdown", lambda svc, sid, tab, gi: [])
    return m


class TestOrchestration:
    def test_happy_gia_han_to_renew_tab(self, monkeypatch):
        calls = {"append": [], "mark": []}
        m = _patch(monkeypatch, calls)
        m.maybe_push_cs_handover(None, _ar(is_gia_han=True), "CC-1")
        assert calls["append"][0][0] == "Bàn giao KH gia hạn Team 2"
        assert calls["mark"] == ["CC-1"]

    def test_dedup_skip(self, monkeypatch):
        calls = {"append": [], "mark": []}
        m = _patch(monkeypatch, calls)
        m.maybe_push_cs_handover(None, _ar(pushed=True), "CC-1")
        assert calls["append"] == []

    def test_no_order_id_skip(self, monkeypatch):
        calls = {"append": [], "mark": []}
        m = _patch(monkeypatch, calls)
        m.maybe_push_cs_handover(None, _ar(order_id=""), "CC-1")
        assert calls["append"] == []

    def test_unrouted_team_skip(self, monkeypatch):
        calls = {"append": [], "mark": []}
        m = _patch(monkeypatch, calls, team="Khác")
        m.maybe_push_cs_handover(None, _ar(), "CC-1")
        assert calls["append"] == []
