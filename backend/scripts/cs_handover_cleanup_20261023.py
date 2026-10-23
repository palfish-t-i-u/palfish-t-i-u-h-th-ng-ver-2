"""G5 plan v2 (23/10) — sheet ops + dọn dữ liệu handover. DRY-RUN mặc định, --apply mới ghi.

Env: GOOGLE_SERVICE_ACCOUNT_JSON = đường dẫn key SA sodoanhthu-import (Editor trên 3 sheet).

    cd backend
    python scripts/cs_handover_cleanup_20261023.py marker-cols            # G5-T1: thêm header "App Order ID" cột trống cuối 4 tab
    python scripts/cs_handover_cleanup_20261023.py delete-dup ih1 " Bàn giao KH gia hạn" 854 855
                                                                          # G5-T2: xoá dòng 855 nếu ≡ dòng 854 (key) và không có CS data
    python scripts/cs_handover_cleanup_20261023.py relocate [--since 22/10/2026] [--phones 84-377422233,...]
                                                                          # G5-T4: dời dòng rơi dưới khoảng trống ≥5 lên sát dữ liệu
    ... --apply                                                           # ghi thật

Guardrail: không đè ô có data; chỉ xoá dòng không có CS data; verify đọc lại trước khi xoá.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cs_handover_dedup as dd  # noqa: E402
import cs_handover_sheet as hs  # noqa: E402

SHEETS = {"ih1": hs._SHEET_IH1, "offline": hs._SHEET_IH2_OFFLINE, "hcm": hs._SHEET_HCM}
MARKER_HDR = "App Order ID"
GAP_ROWS = 5


def _svc():
    return hs._sheets_write_service()


def _tabs() -> list[tuple[str, str]]:
    return dd.scan_tabs()  # 4 tab của 3 team append (bỏ IH2 QUERY)


def _col_count(service, sid: str, tab: str) -> int | None:
    meta = service.spreadsheets().get(spreadsheetId=sid, fields="sheets(properties(sheetId,title,gridProperties(columnCount)))").execute()
    for sh in meta.get("sheets", []):
        pr = sh.get("properties") or {}
        if pr.get("title") == tab:
            return int((pr.get("gridProperties") or {}).get("columnCount") or 0)
    return None


# ---------------- marker-cols (G5-T1) ----------------
def cmd_marker_cols(apply: bool) -> None:
    service = _svc()
    for sid, tab in _tabs():
        rows = hs._read_tab_rows(service, sid, tab)
        if not rows:
            print(f"[{tab!r}] KHÔNG đọc được tab — bỏ")
            continue
        hidx = hs._header_row_index(rows)
        header = rows[hidx]
        if hs._match_col(header, [MARKER_HDR], set()) is not None:
            print(f"[{tab!r}] đã có cột {MARKER_HDR!r} tại {hs._col_a1(hs._match_col(header, [MARKER_HDR], set()))} — bỏ qua")
            continue
        last_hdr = max((i for i, h in enumerate(header) if str(h).strip()), default=-1)
        # Header giả "Column N" (Google tự sinh khi import) → coi là trống: đặt marker vào cột
        # placeholder ĐẦU TIÊN ngay sau header thật (IH1 KH mới: W=Contact ID, X..AJ="Column 3..15").
        placeholder = None
        while last_hdr >= 0 and re.fullmatch(r"column \d+", hs._norm(header[last_hdr])):
            placeholder = header[last_hdr]
            last_hdr -= 1
        target = last_hdr + 1
        # cột đích phải trống TOÀN BỘ (mọi dòng, trừ header placeholder)
        dirty = [ri + 1 for ri in range(len(rows)) if ri != hidx and hs._cell(rows[ri], target).strip()]
        if placeholder is not None:
            print(f"[{tab!r}] cột {hs._col_a1(target)} có header giả {hs._cell(header, target)!r} → sẽ thay bằng {MARKER_HDR!r}")
        if dirty:
            print(f"[{tab!r}] cột {hs._col_a1(target)} có dữ liệu ở dòng {dirty[:10]}{'…' if len(dirty) > 10 else ''} — KHÔNG thêm, xem tay")
            continue
        blocked = hs._protected_cols(service, sid, tab)
        if target in blocked:
            print(f"[{tab!r}] cột {hs._col_a1(target)} bị khoá (protected) — KHÔNG thêm")
            continue
        ncol = _col_count(service, sid, tab)
        need_append = ncol is not None and target >= ncol
        a1 = f"'{tab}'!{hs._col_a1(target)}{hidx + 1}"
        print(f"[{tab!r}] header dòng {hidx + 1}, cột cuối {hs._col_a1(last_hdr)}={header[last_hdr]!r} → ghi {MARKER_HDR!r} tại {a1}"
              f"{' (+ thêm 1 cột, sheet hiện ' + str(ncol) + ' cột)' if need_append else ''}")
        if not apply:
            continue
        if need_append:
            gid = dd._sheet_gid(service, sid, tab)
            service.spreadsheets().batchUpdate(spreadsheetId=sid, body={"requests": [{"appendDimension": {
                "sheetId": gid, "dimension": "COLUMNS", "length": 1}}]}).execute()
        service.spreadsheets().values().update(
            spreadsheetId=sid, range=a1, valueInputOption="RAW", body={"values": [[MARKER_HDR]]}).execute()
        back = service.spreadsheets().values().get(spreadsheetId=sid, range=a1).execute()
        ok = ((back.get("values") or [[""]])[0] or [""])[0] == MARKER_HDR
        print(f"   → {'ĐÃ GHI ✓' if ok else 'GHI XONG NHƯNG ĐỌC LẠI LỆCH ✗'}")


# ---------------- delete-dup (G5-T2) ----------------
def _key_sig(header, r) -> tuple:
    def f(field):
        i = hs._match_col(header, hs._FIELD_HEADERS[field], set())
        return hs._cell(r, i).strip()
    return (hs._phone9(f("sdt")), hs._norm(f("uid")), hs._fold(f("ten_kh")), hs._fold(f("ten_hoc_sinh")), hs._amount_key(f("so_tien")))


def cmd_delete_dup(sheet_key: str, tab: str, keep: int, drop: int, apply: bool) -> None:
    service = _svc()
    sid = SHEETS[sheet_key]
    rows = hs._read_tab_rows(service, sid, tab)
    hidx = hs._header_row_index(rows)
    header = rows[hidx]
    rk, rd = rows[keep - 1], rows[drop - 1]
    sk, sd = _key_sig(header, rk), _key_sig(header, rd)
    print(f"dòng {keep}: {sk}\ndòng {drop}: {sd}")
    if sk != sd or not sk[0]:
        print("✗ 2 dòng KHÔNG cùng khoá (SĐT/UID/Tên/Tiền) — không xoá")
        return
    ccols = dd.cs_cols(header)
    score = dd.cs_score(rd, ccols)
    if score:
        print(f"✗ dòng {drop} có {score} ô CS ({[hs._col_a1(c) for c in ccols if hs._cell(rd, c).strip()]}) — không xoá")
        return
    # dòng giữ phải có ≥ số ô data của dòng xoá (giữ dòng đầy đủ hơn)
    nk, nd = sum(1 for c in rk if str(c).strip()), sum(1 for c in rd if str(c).strip())
    print(f"ô có data: dòng {keep}={nk}, dòng {drop}={nd}")
    if nd > nk:
        print(f"✗ dòng {drop} đầy đủ hơn dòng {keep} — đổi vai keep/drop rồi chạy lại")
        return
    print(f"→ XOÁ dòng {drop} tab {tab!r}{' (DRY)' if not apply else ''}")
    if not apply:
        return
    back = hs._read_tab_rows(service, sid, tab)
    if _key_sig(header, back[drop - 1]) != sd:
        print("✗ đọc lại: dòng đã dịch — không xoá, chạy lại")
        return
    ok = dd._delete_row(service, sid, tab, drop - 1)
    print("ĐÃ XOÁ ✓" if ok else "deleteDimension LỖI ✗")


# ---------------- merge-dup (quy tắc G4-T2 cho dòng app cũ không marker) ----------------
def cmd_merge_dup(sheet_key: str, tab: str, app_row: int, team_row: int, apply: bool) -> None:
    """Dòng app (cũ, không marker) trùng dòng team: điền ô TRỐNG Kênh/Contact/Note/UID từ dòng
    app sang dòng team, đọc lại xác nhận, rồi xoá dòng app (chỉ khi dòng app không có CS data)."""
    service = _svc()
    sid = SHEETS[sheet_key]
    rows = hs._read_tab_rows(service, sid, tab)
    hidx = hs._header_row_index(rows)
    header = rows[hidx]
    ra, rt = rows[app_row - 1], rows[team_row - 1]
    si = hs._match_col(header, hs._FIELD_HEADERS["sdt"], set())
    if hs._phone9(hs._cell(ra, si)) != hs._phone9(hs._cell(rt, si)) or not hs._phone9(hs._cell(ra, si)):
        print("✗ 2 dòng KHÔNG cùng SĐT — không merge")
        return
    ccols = dd.cs_cols(header)
    score = dd.cs_score(ra, ccols)
    if score:
        print(f"✗ dòng app {app_row} có {score} ô CS — không xoá (dup_manual, người xử)")
        return
    merge_map = hs._field_col_map(header, {f: "" for f in dd._MERGE_FIELDS})
    fv = {f: hs._cell(ra, idx) for f, idx in merge_map.items()}
    plan = {f: v for f, v in fv.items() if str(v).strip() and not hs._cell(rt, merge_map[f]).strip()}
    print(f"dòng app {app_row}: {ra}\ndòng team {team_row}: {rt}\n→ điền vào dòng team: {plan}; rồi XOÁ dòng {app_row}{' (DRY)' if not apply else ''}")
    if not apply:
        return
    blocked = hs._protected_cols(service, sid, tab)
    hs._fill_empty_cells(service, sid, tab, team_row, rt, header, fv, blocked)
    back = hs._read_tab_rows(service, sid, tab)
    if _key_sig(header, back[app_row - 1]) != _key_sig(header, ra):
        print("✗ đọc lại: dòng app đã dịch — KHÔNG xoá, chạy lại")
        return
    for f, v in plan.items():
        if hs._cell(back[team_row - 1], merge_map[f]).strip() != str(v).strip():
            print(f"✗ đọc lại dòng team: ô {f} chưa đúng — KHÔNG xoá")
            return
    ok = dd._delete_row(service, sid, tab, app_row - 1)
    print("ĐÃ MERGE + XOÁ dòng app ✓" if ok else "merge xong nhưng deleteDimension LỖI ✗")


# ---------------- fix-sale-codes (dòng app cũ ghi Sale = full name → mã dropdown) ----------------
def cmd_fix_sale_codes(apply: bool, since: date | None) -> None:
    import cs_l8_order as l8
    service = _svc()
    tv = l8._load_tvts(service)
    for sid, tab in _tabs():
        rows = hs._read_tab_rows(service, sid, tab)
        if not rows:
            continue
        hidx = hs._header_row_index(rows)
        header = rows[hidx]
        sa = hs._match_col(header, hs._FIELD_HEADERS["sale"], set())
        di = hs._match_col(header, hs._FIELD_HEADERS["ngay_ban_giao"], set())
        if sa is None:
            continue
        opts = hs._read_col_dropdown(service, sid, tab, sa)
        if not opts:
            print(f"[{tab!r}] cột Sale không có dropdown — bỏ")
            continue
        fo = {hs._fold(o) for o in opts}
        n = 0
        for ri in range(hidx + 1, len(rows)):
            d = hs._parse_dmy(hs._cell(rows[ri], di)) if di is not None else None
            if since and (d is None or d < since):
                continue
            cur = hs._cell(rows[ri], sa).strip()
            if not cur or hs._fold(cur) in fo:
                continue
            code = tv.get(l8._fold(cur), "")
            short = hs._TVTS_PREFIX_RE.sub("", code) if code else ""
            new = hs._dropdown_value(opts, code, short)
            n += 1
            print(f"[{tab!r}] dòng {ri + 1}: Sale {cur!r} ∉ dropdown → {new!r}{'' if new else ' (KHÔNG tra được — để nguyên)'}")
            if apply and new:
                service.spreadsheets().values().update(
                    spreadsheetId=sid, range=f"'{tab}'!{hs._col_a1(sa)}{ri + 1}",
                    valueInputOption="RAW", body={"values": [[new]]}).execute()
        if not n:
            print(f"[{tab!r}] mọi ô Sale (từ {since}) đều hợp lệ")


# ---------------- relocate (G5-T4) ----------------
def _stray_candidates(header, rows, hidx):
    """(last_data_row_idx, [stray row idx]) — stray = dòng có ô khoá sau khoảng trống ≥GAP_ROWS."""
    keys = hs._key_cols(header)

    def has_key(ri):
        return any(hs._cell(rows[ri], k).strip() for k in keys)

    last = hidx
    gap = 0
    strays: list[int] = []
    after_gap = False
    for ri in range(hidx + 1, len(rows)):
        if has_key(ri):
            if after_gap:
                strays.append(ri)
            else:
                last = ri
            gap = 0
        else:
            gap += 1
            if gap >= GAP_ROWS and not after_gap and strays == []:
                after_gap = True
    return last, strays


def cmd_relocate(apply: bool, since: date | None, phones: set[str]) -> None:
    service = _svc()
    for sid, tab in _tabs():
        rows = hs._read_tab_rows(service, sid, tab)
        if not rows:
            continue
        hidx = hs._header_row_index(rows)
        header = rows[hidx]
        last, strays = _stray_candidates(header, rows, hidx)
        if not strays:
            print(f"[{tab!r}] không có dòng rơi (dữ liệu liền tới dòng {last + 1})")
            continue
        di = hs._match_col(header, hs._FIELD_HEADERS["ngay_ban_giao"], set())
        si = hs._match_col(header, hs._FIELD_HEADERS["sdt"], set())
        picked: list[int] = []
        for ri in strays:
            d = hs._parse_dmy(hs._cell(rows[ri], di)) if di is not None else None
            p9 = hs._phone9(hs._cell(rows[ri], si))
            ok_date = since is None or (d is not None and d >= since)
            ok_phone = not phones or p9 in phones
            tag = "DỜI" if (ok_date and ok_phone) else "bỏ"
            print(f"[{tab!r}] dòng {ri + 1} ngày={hs._cell(rows[ri], di)!r} sđt=…{p9[-4:]} → {tag}")
            if ok_date and ok_phone:
                picked.append(ri)
        if not picked:
            continue
        print(f"[{tab!r}] dữ liệu liền tới dòng {last + 1}; dời {len(picked)} dòng lên từ dòng {last + 2}")
        if not apply:
            continue
        blocked = hs._protected_cols(service, sid, tab)
        stt_i = hs._match_col(header, ["STT"], set())  # STT điền sẵn (IH1 gia hạn tới dòng 847) → không tính
        target = last + 1  # index
        for ri in sorted(picked):  # ghi lên trước; xoá sau, từ dưới lên
            src = rows[ri]
            dst = rows[target] if target < len(rows) else []
            if any(hs._cell(dst, c).strip() for c in range(len(header)) if c != stt_i):
                print(f"   ✗ dòng đích {target + 1} không trống — dừng")
                return
            for c, v in enumerate(src):
                if str(v).strip() and c not in blocked:
                    service.spreadsheets().values().update(
                        spreadsheetId=sid, range=f"'{tab}'!{hs._col_a1(c)}{target + 1}",
                        valueInputOption="USER_ENTERED", body={"values": [[v]]}).execute()
            back = service.spreadsheets().values().get(
                spreadsheetId=sid, range=f"'{tab}'!A{target + 1}:{hs._col_a1(len(header) - 1)}{target + 1}").execute()
            br = (back.get("values") or [[]])[0]
            if _key_sig(header, br) != _key_sig(header, src):
                print(f"   ✗ đọc lại dòng {target + 1} lệch — dừng, KHÔNG xoá nguồn")
                return
            print(f"   ✓ dòng {ri + 1} → {target + 1}")
            target += 1
        for ri in sorted(picked, reverse=True):
            ok = dd._delete_row(service, sid, tab, ri)
            print(f"   {'xoá' if ok else 'KHÔNG xoá được'} dòng nguồn {ri + 1}")


def main() -> None:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--apply", action="store_true")
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("marker-cols", parents=[common])
    d = sub.add_parser("delete-dup", parents=[common])
    d.add_argument("sheet", choices=sorted(SHEETS))
    d.add_argument("tab")
    d.add_argument("keep", type=int)
    d.add_argument("drop", type=int)
    mg = sub.add_parser("merge-dup", parents=[common])
    mg.add_argument("sheet", choices=sorted(SHEETS))
    mg.add_argument("tab")
    mg.add_argument("app_row", type=int)
    mg.add_argument("team_row", type=int)
    r = sub.add_parser("relocate", parents=[common])
    r.add_argument("--since", default="22/10/2026")
    r.add_argument("--phones", default="")
    fx = sub.add_parser("fix-sale-codes", parents=[common])
    fx.add_argument("--since", default="22/10/2026")
    a = ap.parse_args()
    if a.cmd == "fix-sale-codes":
        cmd_fix_sale_codes(a.apply, hs._parse_dmy(a.since) if a.since else None)
        return
    if a.cmd == "marker-cols":
        cmd_marker_cols(a.apply)
    elif a.cmd == "delete-dup":
        cmd_delete_dup(a.sheet, a.tab, a.keep, a.drop, a.apply)
    elif a.cmd == "merge-dup":
        cmd_merge_dup(a.sheet, a.tab, a.app_row, a.team_row, a.apply)
    elif a.cmd == "relocate":
        since = hs._parse_dmy(a.since) if a.since else None
        phones = {hs._phone9(p) for p in a.phones.split(",") if p.strip()}
        cmd_relocate(a.apply, since, phones)


if __name__ == "__main__":
    main()
