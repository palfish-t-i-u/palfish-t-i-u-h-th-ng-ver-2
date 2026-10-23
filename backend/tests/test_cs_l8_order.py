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


def _row(uid="", tien="", w=""):
    r = [""] * len(HEADER)
    r[5], r[7], r[19] = uid, tien, w
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


class TestUpsertDedup:
    def test_appended_when_empty(self):
        svc = FakeSheets([HEADER])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "appended"
        assert svc.updates, "phải có ghi dòng mới"

    def test_stamped_on_sale_row(self):
        # dòng team điền (W trống), khớp UID+tiền → chỉ đóng dấu W, KHÔNG tạo mới
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "stamped"
        assert len(svc.updates) == 1
        rng, vals = svc.updates[0]
        assert vals == [["ORD-1"]] and rng.endswith("2")  # đóng dấu W dòng 2

    def test_exists_when_app_row(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="ORD-1")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "exists"
        assert not svc.updates  # idempotent, không ghi

    def test_cleaned_when_both(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="ORD-1"),
                          _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "cleaned"

    def test_ambiguous_two_sale_rows(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w=""),
                          _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "ambiguous"

    def test_different_amount_not_matched(self):
        # cùng UID nhưng khác tiền → không coi là trùng → append mới
        svc = FakeSheets([HEADER, _row(uid="3301", tien="5,000,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1") == "appended"

    def test_dry_run_no_write(self):
        svc = FakeSheets([HEADER, _row(uid="3301", tien="9,050,000", w="")])
        assert l8.upsert_l8_order(svc, HEADER, FIELDS, uid="3301", so_tien="9050000", order_id="ORD-1", dry_run=True) == "stamped"
        assert not svc.updates  # dry-run không ghi


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
