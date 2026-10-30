"""Test ghi đơn IH2 vào L8: map Loại cts/TVTS fold/Gói + dedup cột W (mock Sheets)."""
from datetime import datetime, timezone, timedelta

import cs_l8_order as l8
from cs_handover_reconcile_worker import _next_sleep_seconds, _seconds_until_830

VN = timezone(timedelta(hours=7))

# Header L8 rút gọn: UID=idx5(F), Số tiền=idx7(H), App Order ID=idx19(T).
HEADER = ["STT", "TVTS", "Loại cts", "Họ tên", "SDT", "UID", "Ngày chuyển tiền",
          "Số tiền", "GV", "Gói học", "Trạng thái", "Tháng", "Tạo nhóm GV", "Note",
          "Ghi chú", "Refer", "Ngày leads", "Số buổi", "Check", "App Order ID"]
FIELDS = {"TVTS": "HN2 - LyVC", "Loại cts": "Facebook", "Họ tên": "A - B", "SDT": "84-9",
          "UID": "3301", "Ngày chuyển tiền": "22/10/2026", "Số tiền": 9050000, "Gói học": "48+5",
          "Trạng thái": "Chưa kích hoạt", "Tháng": "2026-10", "App Order ID": "ORD-1"}


def _row(uid="", tien="", w="", note=""):
    r = [""] * len(HEADER)
    r[5], r[7], r[19] = uid, tien, w
    if note:
        r[13] = note   # cột Note (N)
    return r


class _Exec:
    def __init__(self, r):
        self._r = r

    def execute(self):
        return self._r


class FakeSheets:
    """Mock googleapiclient sheets service: get trả grid cố định, update ghi lại."""

    def __init__(self, grid):
        self.grid = grid
        self.updates = []  # [(range, values)]

    def spreadsheets(self):
        return self

    def values(self):
        return self

    def get(self, spreadsheetId=None, range=None, **kw):
        return _Exec({"values": self.grid})

    def update(self, spreadsheetId=None, range=None, valueInputOption=None, body=None):
        self.updates.append((range, body["values"]))
        return _Exec({})


class TestLoaiCts:
    def test_source_priority(self):
        assert l8.loai_cts("gia_han", "") == "Gia hạn"
        assert l8.loai_cts("kho_chung", "300265") == "Kho chung"   # source thắng channel
        assert l8.loai_cts("gioi_thieu", "832") == "Refer"

    def test_channel_map(self):
        assert l8.loai_cts("quang_cao", "300265") == "Facebook"
        assert l8.loai_cts("quang_cao", "300531") == "Paid Partnership"
        assert l8.loai_cts("quang_cao", "300431") == "Livestream"
        assert l8.loai_cts("quang_cao", "300551") == "Tiktok shop"
        assert l8.loai_cts("khac", "300444") == "Tài App"   # khớp typo sheet 'Tài App'
        assert l8.loai_cts("khac", "300311") == "Tự kiếm"

    def test_unmapped_verbatim(self):
        # nguồn lạ: ghi nguyên văn (không ép Kho chung)
        assert l8.loai_cts("", "999999") == "999999"
        assert l8.loai_cts("abc", "") == "abc"


class TestHelpers:
    def test_fold(self):
        assert l8._fold("Đinh Ngọc Hải") == "dinh ngoc hai"
        assert l8._fold("Nguyễn Thị Thu Huyền") == "nguyen thi thu huyen"
        assert l8._fold("  To  Thi\xa0Ha ") == "to thi ha"

    def test_goi_buoi(self):
        assert l8._goi_buoi("2/W- UPSALE 48 PHI+5 HN") == "48+5"
        assert l8._goi_buoi("2/W- NEW 96 PHI+10 HN") == "96+10"
        assert l8._goi_buoi("gói lạ không số") == ""

    def test_amount_key_float(self):
        from cs_handover_sheet import _amount_key
        assert _amount_key(8480000) == "8480000"        # int
        assert _amount_key(8480000.0) == "8480000"      # float (bug cũ → '84800000')
        assert _amount_key("8480000.0") == "8480000"    # float string
        assert _amount_key("9.010.000") == "9010000"    # sheet: dấu chấm nghìn
        assert _amount_key("9,050,000") == "9050000"    # sheet: dấu phẩy nghìn
        assert _amount_key("") == "" and _amount_key(None) == ""


class _SB:
    """Fake supabase: payment_lines theo pr, payment_requests.target."""

    def __init__(self, lines, target):
        self.lines, self.target, self.t = lines, target, ""

    def table(self, name): self.t = name; return self
    def select(self, *_): return self
    def eq(self, *_): return self
    def in_(self, *_): return self
    def limit(self, *_): return self

    def execute(self):
        class R:
            def __init__(s, d): s.data = d
        return R(self.lines if self.t == "payment_lines" else [{"target": self.target}])


class TestPaymentDate:
    # Mẹ Hà PR-2416 (23/10): lần 1 8.350.000 rejected (confirmed_at = giờ từ chối 19/10), lần 2 1.000.000 paid 14/10,
    # lần 3 7.350.000 paid 19/10 → sale ghi 19/10 (ngày tiền về ĐỦ). Code cũ lấy min + tính cả rejected → 14/10.
    LINES = [
        {"amount": 8350000, "status": "rejected", "paid_at": None, "confirmed_at": "2026-10-19T02:30:00+00:00"},
        {"amount": 1000000, "status": "paid", "paid_at": "2026-10-14T15:01:45+00:00", "confirmed_at": "2026-10-14T15:01:45+00:00"},
        {"amount": 7350000, "status": "paid", "paid_at": "2026-10-19T02:08:11+00:00", "confirmed_at": "2026-10-19T02:08:11+00:00"},
    ]

    def test_latest_paid_when_fully_paid(self):
        assert l8.fetch_payment_date(_SB(self.LINES, 8350000), "PR-2416") == "19/10/2026"

    def test_rejected_only_is_empty(self):
        assert l8.fetch_payment_date(_SB(self.LINES[:1], 8350000), "PR-1") == ""

    def test_partial_payment_is_empty_until_full(self):
        assert l8.fetch_payment_date(_SB(self.LINES[:2], 8350000), "PR-1") == ""   # mới 1tr/8,35tr
        assert l8.fetch_payment_date(_SB(self.LINES[1:2], 1000000), "PR-1") == "14/10/2026"  # target = 1tr → đủ

    def test_pending_only_is_empty(self):
        assert l8.fetch_payment_date(_SB([{"amount": 1, "status": "pending", "paid_at": None, "confirmed_at": None}], 1), "PR-1") == ""

    def test_backfill_only_empty_g_cells(self, monkeypatch):
        hdr = ["STT", "TVTS", "Họ tên", "SDT", "UID", "Ngày chuyển tiền", "Số tiền", "App Order ID"]
        grid = [hdr,
                ["1", "HN2 - A", "KH", "84-9", "3301", "", "9.050.000", "CC-A"],          # G trống → điền
                ["2", "HN2 - B", "KH", "84-8", "3302", "22/10/2026", "5.000.000", "CC-B"],  # đã có → không đụng
                ["3", "HN2 - C", "KH", "84-7", "3303", "", "5.000.000", "CC-C"]]           # chưa đủ tiền → bỏ
        svc = FakeSheets(grid)
        monkeypatch.setattr(l8, "read_l8_header", lambda s: hdr)
        monkeypatch.setattr(l8, "fetch_payment_date", lambda sb, pr: {"PR-A": "23/10/2026", "PR-B": "22/10/2026", "PR-C": ""}.get(pr, ""))

        class SB:
            def table(self, *_): return self
            def select(self, *_): return self
            def in_(self, *_): return self
            def execute(self):
                class R: data = [{"id": "AR-A", "pr_id": "PR-A"}, {"id": "AR-B", "pr_id": "PR-B"}, {"id": "AR-C", "pr_id": "PR-C"}]
                return R()
        n = l8.backfill_payment_dates(SB(), svc, [{"course_code": c, "ar_id": f"AR-{c[-1]}"} for c in ("CC-A", "CC-B", "CC-C", "CC-X")])
        assert n == 1 and svc.updates == [("'Tổng hợp L8'!F2", [["23/10/2026"]])]


class TestUpsertDedup:
    def test_appended_when_empty(self):
        svc = FakeSheets([HEADER])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "appended"
        assert svc.updates, "phải có ghi dòng mới"

    def test_stamped_on_sale_row(self):
        # dòng team điền (W trống), khớp UID+tiền → chỉ đóng dấu W, KHÔNG tạo mới
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "stamped"
        assert len(svc.updates) == 1
        rng, vals = svc.updates[0]
        assert vals == [["ORD-1"]] and rng.endswith("2")  # đóng dấu W dòng 2

    def test_exists_when_app_row(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="ORD-1")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "exists"
        assert not svc.updates  # idempotent, không ghi

    def test_cleaned_when_both(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="ORD-1"),
                          _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "cleaned"

    def test_ambiguous_two_sale_rows(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w=""),
                          _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "ambiguous"

    def test_different_amount_not_matched(self):
        # cùng UID nhưng khác tiền → không coi là trùng → append mới
        svc = FakeSheets([HEADER, _row(uid="3301", tien="5,000,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1") == "appended"

    def test_legacy_w_order_id_recognised(self):
        # Dòng app ghi trước 23/10 có W = order_id CRM → vẫn coi là app_row (không append đôi)
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="CRM-777")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000",
                                  course_code="CC-9", legacy_order_id="CRM-777") == "exists"
        assert not svc.updates
        # Không truyền legacy → W lạ bị coi là dòng app của order khác → append mới
        svc2 = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="CRM-777")])
        assert l8.upsert_l8_order(svc2, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="CC-9") == "appended"

    def test_stamp_writes_course_code(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000",
                                  course_code="CC-9", legacy_order_id="CRM-777") == "stamped"
        assert svc.updates[0][1] == [["CC-9"]]  # W = course_code, KHÔNG phải order_id

    def test_dry_run_no_write(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", course_code="ORD-1", dry_run=True) == "stamped"
        assert not svc.updates  # dry-run không ghi


class TestNoteFill:
    """24/10: dẫn Note sale điền lúc báo đơn (IH2) vào cột Note (N) của L8 — chỉ ô trống, ko đè team."""
    NOTE = "Lịch học linh hoạt"

    def _fields(self):
        f = dict(FIELDS)
        f["Note"] = self.NOTE
        return f

    def test_stamped_fills_empty_note(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "stamped"
        assert ("'Tổng hợp L8'!T2", [["CC-9"]]) in svc.updates      # đóng dấu W
        assert ("'Tổng hợp L8'!N2", [[self.NOTE]]) in svc.updates   # điền Note ô trống

    def test_exists_fills_note_when_empty(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="CC-9")])  # app row, Note trống
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "exists"
        assert ("'Tổng hợp L8'!N2", [[self.NOTE]]) in svc.updates

    def test_exists_keeps_team_note(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="CC-9", note="team đã ghi")])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "exists"
        assert svc.updates == []   # có note team → không đè, không ghi gì

    def test_appended_row_carries_note(self):
        svc = FakeSheets([HEADER])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "appended"
        wrote = " ".join(str(v) for _, vals in svc.updates for row in vals for v in row)
        assert self.NOTE in wrote   # dòng mới gồm Note


class TestGvLabel:
    """30/10: GV mặc định suy từ tên gói (đã kiểm chứng trên 264 đơn IH2 thật)."""

    def test_phil_and_native_from_real_names(self):
        for name, want in [
            ("2/W- UPSALE 96 PHI+10 HN", "Phil 2b/tuần"),
            ("2/W- NEW 48 PHI+5", "Phil 2b/tuần"),
            ("2/W- Both AB (A-PH) REFER 48 PHI+5", "Phil 2b/tuần"),
            ("2/W- Both AB REFER 24 PHI+2 HN", "Phil 2b/tuần"),
            ("2/W- UPSALE 144 PHI+15 HN", "Phil 2b/tuần"),
            ("2/W- UPSALE 24 US-UK+1 HN", "Native 2b/tuần"),
            ("2/W- NEW 24 US-UK+1 HN", "Native 2b/tuần"),
            ("2/W- Both AB REFER 24 US-UK+1 HN", "Native 2b/tuần"),
            ("3/W - NEW 96 PHI+10+10 HN", "Phil 3b/tuần"),
        ]:
            assert l8.gv_label(name) == want, name

    def test_blank_when_cannot_infer(self):
        assert l8.gv_label("") == "" and l8.gv_label(None) == ""
        assert l8.gv_label("Thuy Tien") == ""                       # tên tay, không có N/W
        assert l8.gv_label("2/W- NEW 48 HN") == ""                  # thiếu loại PHI/US-UK
        assert l8.gv_label("2/W- NEW 48 PHI US-UK+5") == ""         # CONFLICT → không đoán
        assert l8.gv_label("1/M- NEW 12 PHI+1") == ""               # gói theo tháng, không có N/W

    def test_for_course_matches_dropdown_option(self, monkeypatch):
        monkeypatch.setattr(l8, "_read_col_dropdown", lambda *a, **k: ["Phil 2b/tuần ", "Phil 3b/tuần", "Native 2b/tuần"])
        assert l8.gv_for_course(object(), HEADER, "2/W- NEW 48 PHI+5 HN") == "Phil 2b/tuần"   # chuỗi đúng option, bỏ khoảng trắng thừa

    def test_for_course_skips_unknown_option(self, monkeypatch):
        monkeypatch.setattr(l8, "_read_col_dropdown", lambda *a, **k: ["Phil 2b/tuần"])
        assert l8.gv_for_course(object(), HEADER, "2/W- NEW 24 US-UK+1 HN") == ""             # không có option Native → không ghi rác

    def test_for_course_falls_back_when_dropdown_unreadable(self, monkeypatch):
        monkeypatch.setattr(l8, "_read_col_dropdown", lambda *a, **k: [])
        assert l8.gv_for_course(object(), HEADER, "2/W- NEW 48 PHI+5 HN") == "Phil 2b/tuần"

    def test_build_fields_carries_gv(self, monkeypatch):
        monkeypatch.setattr(l8, "_read_col_dropdown", lambda *a, **k: [])
        monkeypatch.setattr(l8, "tvts_code", lambda *a, **k: "HN2 - X")
        f = l8.build_l8_fields(
            object(), sale_crm_name="x", pr={"name": "Mẹ A"}, uid_block={"uid": "3301", "name": "bé B"},
            course={"name": "2/W- UPSALE 48 PHI+5 HN", "amount": 8500000, "lead_source": "gia_han"},
            is_gia_han=True, payment_date="", course_code="CC-1", phone_intl="84-9", header=HEADER)
        assert f["GV"] == "Phil 2b/tuần" and f["Gói học"] == "48+5"


class TestGvFill:
    """GV điền khi ghi đơn, chỉ ô TRỐNG — sale đổi 3b/tuần (khách tăng cường) thì giữ nguyên."""

    def _fields(self):
        f = dict(FIELDS)
        f["GV"] = "Phil 2b/tuần"
        return f

    @staticmethod
    def _grow(uid="3301", w="", gv=""):
        r = _row(uid=uid, tien="9,050,000", w=w)
        r[8] = gv   # cột GV (I)
        return r

    def test_appended_row_carries_gv(self):
        svc = FakeSheets([HEADER])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "appended"
        wrote = " ".join(str(v) for _, vals in svc.updates for row in vals for v in row)
        assert "Phil 2b/tuần" in wrote

    def test_stamped_fills_empty_gv(self):
        svc = FakeSheets([HEADER, self._grow()])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "stamped"
        assert ("'Tổng hợp L8'!I2", [["Phil 2b/tuần"]]) in svc.updates

    def test_stamped_keeps_sale_gv(self):
        svc = FakeSheets([HEADER, self._grow(gv="Phil 3b/tuần")])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "stamped"
        assert not any(rng.endswith("I2") for rng, _ in svc.updates)   # không đè 3b/tuần của sale

    def test_exists_keeps_edited_gv(self):
        svc = FakeSheets([HEADER, self._grow(w="CC-9", gv="Phil 3b/tuần")])
        assert l8.upsert_l8_order(svc, HEADER, self._fields(), uid="3301", so_tien="9050000", course_code="CC-9") == "exists"
        assert svc.updates == []

    def test_no_gv_field_leaves_cell_alone(self):
        f = dict(FIELDS)
        f["GV"] = ""    # tên gói không suy được → không ghi
        svc = FakeSheets([HEADER, self._grow()])
        assert l8.upsert_l8_order(svc, HEADER, f, uid="3301", so_tien="9050000", course_code="CC-9") == "stamped"
        assert not any(rng.endswith("I2") for rng, _ in svc.updates)


class TestWorkerSchedule:
    def _sl(self, h, m=0):
        return _next_sleep_seconds(datetime(2026, 10, 22, h, m, tzinfo=VN))

    def test_tiers(self):
        assert self._sl(10) == 5 * 60      # 8h30-18h
        assert self._sl(9) == 5 * 60
        assert self._sl(19) == 10 * 60     # 18-22h
        assert self._sl(23) == 15 * 60     # 22-24h
        assert self._sl(3) == 60 * 60      # 0-8h

    def test_wait_window_830(self):
        s = _seconds_until_830(datetime(2026, 10, 22, 8, 15, tzinfo=VN))
        assert s == 15 * 60  # 8h15 → chờ 15 phút tới 8h30
