"""G4 plan v2: worker gom trùng app + team trên sheet (mock Sheets + fake store)."""
from __future__ import annotations

from datetime import date

import cs_handover_dedup as dd
import cs_handover_sheet as hs

TODAY = date(2026, 10, 23)
HDR = ["STT", "Ngày bàn giao", "Sale", "Tên KH", "Tên học sinh", "UID", "SDT KH", "Kênh liên hệ",
       "Contact ID", "Ghi chú", "Tạo nhóm GV", "GVCN", "Tình trạng chăm sóc", "App Order ID"]
I = {h: i for i, h in enumerate(HDR)}


def row(sdt="0937865100", child="Bé Na", uid="", kenh="", contact="", note="", tao_nhom="", gvcn="", tt="", marker="", date_="23/10/2026"):
    r = [""] * len(HDR)
    r[I["Ngày bàn giao"]], r[I["Tên KH"]], r[I["Tên học sinh"]], r[I["UID"]], r[I["SDT KH"]] = date_, "KH", child, uid, sdt
    r[I["Kênh liên hệ"]], r[I["Contact ID"]], r[I["Ghi chú"]] = kenh, contact, note
    r[I["Tạo nhóm GV"]], r[I["GVCN"]], r[I["Tình trạng chăm sóc"]], r[I["App Order ID"]] = tao_nhom, gvcn, tt, marker
    return r


class _R:
    def __init__(self, d): self.d = d
    def execute(self): return self.d


class FakeSvc:
    """get(range tab) → grid; get(range 1 ô) → ô marker từ grid; update ghi lại; batchUpdate ghi lại."""

    def __init__(self, grid, fail_delete=False):
        self.grid, self.updates, self.batch, self.fail_delete = grid, [], [], fail_delete

    def spreadsheets(self): return self
    def values(self): return self

    def get(self, spreadsheetId=None, range=None, fields=None, **kw):
        if fields and "sheetId" in fields:
            return _R({"sheets": [{"properties": {"sheetId": 777, "title": "Bàn giao KH mới"}},
                                  {"properties": {"sheetId": 778, "title": "T"}}]})
        if range and "!" in range and ":" not in range.split("!")[1]:
            # 1 ô: 'tab'!N5 → cột N, dòng 5
            import re
            m = re.match(r"([A-Z]+)(\d+)$", range.split("!")[1])
            col = 0
            for ch in m.group(1):
                col = col * 26 + ord(ch) - 64
            col -= 1
            r = int(m.group(2)) - 1
            v = self.grid[r][col] if r < len(self.grid) and col < len(self.grid[r]) else ""
            return _R({"values": [[v]]})
        return _R({"values": self.grid})

    def update(self, spreadsheetId=None, range=None, valueInputOption=None, body=None):
        self.updates.append((range, body["values"]))
        return _R({})

    def batchUpdate(self, spreadsheetId=None, body=None):
        if self.fail_delete:
            raise RuntimeError("protected")
        self.batch.append(body)
        return _R({})


class FakeStore:
    def __init__(self, rows):
        self.rows, self.marks = dict(rows), []

    def fetch_statuses(self, sb, codes):
        return {c: self.rows[c] for c in codes if c in self.rows}

    def mark(self, sb, code, status, **f):
        self.marks.append((code, status))
        self.rows.setdefault(code, {}).update({"status": status, **{k: v for k, v in f.items() if v is not None}})


def _setup(monkeypatch, grid, store_rows, fail_delete=False):
    svc = FakeSvc(grid, fail_delete=fail_delete)
    store = FakeStore(store_rows)
    monkeypatch.setattr(dd, "_store", store)
    monkeypatch.setattr(hs, "_protected_cols", lambda s, sid, tab: set())
    dd._gid_cache.clear()
    return svc, store


class TestHelpers:
    def test_cs_cols_and_score(self):
        cols = dd.cs_cols(HDR)
        assert cols == {I["Tạo nhóm GV"], I["GVCN"], I["Tình trạng chăm sóc"]}
        # Ghi chú thứ 2 là cột CS
        hdr2 = HDR + ["Ghi chú"]
        assert len(HDR) in dd.cs_cols(hdr2) and I["Ghi chú"] not in dd.cs_cols(hdr2)
        assert dd.cs_score(row(gvcn="Cô A"), cols) == 1 and dd.cs_score(row(), cols) == 0

    def test_scan_tabs_excludes_ih2(self):
        tabs = dd.scan_tabs()
        assert (hs._SHEET_IH1, "Bàn giao KH mới") in tabs and (hs._SHEET_IH1, " Bàn giao KH gia hạn") in tabs
        assert all("Team 2" not in t for _, t in tabs)
        assert len(tabs) == len(set(tabs))

    def test_find_pairs(self):
        grid = [["banner"], HDR,
                row(marker="CC-1"),                       # dòng 3 app
                row(child="Na"),                           # dòng 4 team (tên bé tương thích)
                row(sdt="0911111111"),                     # khác phone
                row(sdt="0922222222", marker="CC-2"),      # app không có team → không cặp
                row(sdt="0933333333", child="Bi", marker="CC-3"), row(sdt="0933333333", child="Bo"),  # tên bé khác → không cặp
                row(sdt="0944444444", marker="CC-4", date_="01/01/2026")]  # ngoài cửa sổ
        pairs = dd.find_duplicate_pairs(HDR, grid, 1, today=TODAY)
        assert pairs == [{"code": "CC-1", "marker_row": 2, "team_row": 3}]

    def test_find_pairs_via_contact_phone(self):
        # dòng team SĐT = số Zalo; dòng app SĐT khác nhưng Contact ID = số Zalo → vẫn là cặp
        grid = [HDR, row(sdt="0939693668", child="Anh Minh"),
                row(sdt="0919227839", child="Anh Minh", contact="0939693668", marker="CC-7")]
        assert dd.find_duplicate_pairs(HDR, grid, 0, today=TODAY) == [{"code": "CC-7", "marker_row": 2, "team_row": 1}]

    def test_find_pairs_two_team_rows_skipped(self):
        grid = [HDR, row(marker="CC-1"), row(), row()]
        assert dd.find_duplicate_pairs(HDR, grid, 0, today=TODAY) == []


class TestReconcile:
    def test_merge_when_app_row_has_no_cs_data(self, monkeypatch):
        grid = [["banner"], HDR,
                row(child="Na", uid="", kenh="", contact="", note="team note", gvcn="Cô A"),            # dòng 3 team (có CS)
                row(uid="3301", kenh="Zalo", contact="84-937865100", note="app note", marker="CC-1")]  # dòng 4 app (CS=0)
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "appended"}})
        n = dd.reconcile_tab(None, svc, "S", "Bàn giao KH mới", today=TODAY)
        assert n == 1 and store.marks == [("CC-1", "merged")]
        assert store.rows["CC-1"]["sheet_row"] == 3 and store.rows["CC-1"]["marker"] == "CC-1"
        # fill-empty vào dòng team: Kênh, Contact, UID, marker — KHÔNG đè Ghi chú team
        written = {rng: vals for rng, vals in svc.updates}
        assert written[f"'Bàn giao KH mới'!{hs._col_a1(I['Kênh liên hệ'])}3"] == [["Zalo"]]
        assert written[f"'Bàn giao KH mới'!{hs._col_a1(I['UID'])}3"] == [["3301"]]
        assert written[f"'Bàn giao KH mới'!{hs._col_a1(I['App Order ID'])}3"] == [["CC-1"]]
        assert not any(rng.endswith(f"{hs._col_a1(I['Ghi chú'])}3") for rng in written)
        # xoá dòng app (index 3 → start 3,end 4)
        rng = svc.batch[0]["requests"][0]["deleteDimension"]["range"]
        assert rng == {"sheetId": 777, "dimension": "ROWS", "startIndex": 3, "endIndex": 4}

    def test_dup_manual_when_app_row_has_cs_data(self, monkeypatch):
        grid = [HDR, row(), row(marker="CC-1", gvcn="Cô B")]
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "appended"}})
        assert dd.reconcile_tab(None, svc, "S", "T", today=TODAY) == 1
        assert store.marks == [("CC-1", "dup_manual")] and not svc.batch and not svc.updates

    def test_unknown_or_done_status_untouched(self, monkeypatch):
        grid = [HDR, row(), row(marker="CC-1"), row(sdt="0911111111"), row(sdt="0911111111", marker="CC-2")]
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "merged"}})  # CC-2 không có log
        assert dd.reconcile_tab(None, svc, "S", "T", today=TODAY) == 0
        assert not svc.batch and not svc.updates and store.marks == []

    def test_marker_moved_before_delete_skips(self, monkeypatch):
        grid = [HDR, row(), row(marker="CC-1")]
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "appended"}})
        # đọc lại marker trả ô khác → không xoá, không mark
        monkeypatch.setattr(dd, "_confirm_marker", lambda *a, **k: False)
        assert dd.reconcile_tab(None, svc, "S", "T", today=TODAY) == 0
        assert not svc.batch and store.marks == []

    def test_delete_fail_falls_back_to_clear(self, monkeypatch):
        grid = [HDR, row(), row(kenh="Zalo", marker="CC-1")]
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "appended"}}, fail_delete=True)
        assert dd.reconcile_tab(None, svc, "S", "T", today=TODAY) == 1
        assert store.marks == [("CC-1", "merged")] and "deleteDimension" in store.rows["CC-1"]["last_error"]
        # đã xoá nội dung ô app dòng 3 (RAW "")
        cleared = [rng for rng, vals in svc.updates if rng.endswith("3") and vals == [[""]]]
        assert cleared

    def test_bottom_up_and_stale_skip(self, monkeypatch):
        # Cặp A: app dòng 5, team dòng 2. Cặp B: app dòng 3, team dòng 6 (DƯỚI dòng 5 sẽ bị xoá) → để tick sau.
        grid = [HDR,
                row(sdt="0911111111"),                 # 2 team A
                row(sdt="0922222222", marker="CC-B"),  # 3 app B
                row(sdt="0933333333"),                 # 4
                row(sdt="0911111111", marker="CC-A"),  # 5 app A
                row(sdt="0922222222")]                 # 6 team B
        svc, store = _setup(monkeypatch, grid, {"CC-A": {"status": "appended"}, "CC-B": {"status": "matched"}})
        assert dd.reconcile_tab(None, svc, "S", "T", today=TODAY) == 1
        assert store.marks == [("CC-A", "merged")]
        assert len(svc.batch) == 1
        rng = svc.batch[0]["requests"][0]["deleteDimension"]["range"]
        assert rng["startIndex"] == 4 and rng["sheetId"] == 778

    def test_dry_run_no_writes(self, monkeypatch):
        grid = [HDR, row(), row(kenh="Zalo", marker="CC-1")]
        svc, store = _setup(monkeypatch, grid, {"CC-1": {"status": "appended"}})
        assert dd.reconcile_tab(None, svc, "S", "T", dry_run=True, today=TODAY) == 1
        assert not svc.updates and not svc.batch and store.marks == []

    def test_reconcile_duplicates_iterates_tabs_nonfatal(self, monkeypatch):
        calls = []

        def _tab(sb, service, sid, tab, **kw):
            calls.append(tab)
            if tab.startswith(" "):  # chỉ IH1 " Bàn giao KH gia hạn" lỗi
                raise RuntimeError("quota")
            return 1
        monkeypatch.setattr(dd, "reconcile_tab", _tab)
        n = dd.reconcile_duplicates(None, service="SVC")
        assert n == len(dd.scan_tabs()) - 1 and len(calls) == len(dd.scan_tabs())
