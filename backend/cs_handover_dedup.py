"""Reconcile trùng app + team trên sheet bàn giao (plan v2 G4 — 23/10).

Vì sao: team vẫn điền tay; app append lúc báo đơn → có thể 2 dòng cùng đơn (1 dòng có marker
"App Order ID" = course_code, 1 dòng team không marker). Worker quét mỗi tick:
  1) đọc tab 1 lần → dòng trong cửa sổ gần đây (_recent_rows) → gom theo phone9;
  2) cặp (dòng marker, dòng team cùng phone + tên bé tương thích) = ứng viên trùng;
  3) quy tắc giữ (G4-T2): điểm CS = số ô có data trong cột CS sở hữu (GVCN, Tình trạng chăm
     sóc, Ngày tiếp nhận, Tạo nhóm GV, Ghi chú-CS…).
     - dòng marker điểm CS = 0 → copy ô handover (fill-empty) sang dòng team → đọc lại xác
       nhận marker còn đúng chỗ → deleteDimension dòng marker → mark `merged`;
     - dòng marker CÓ CS data → KHÔNG xoá, mark `dup_manual` + log (người xử).
Guardrail: không đè ô team; không xoá dòng có CS data; chỉ xử dòng marker mà cs_handover_log
biết (appended/matched/verify_failed); mập mờ (≥2 dòng team) → bỏ, log. IH2 không quét (tab
QUERY; L8 tự dedup cột W).
"""
from __future__ import annotations

from typing import Any

import cs_handover_sheet as hs
import cs_handover_store as _store

# Cột CS/GVCN sở hữu (tên header startswith, fold). "Ghi chú"/"Note" THỨ 2+ cũng là cột CS.
_CS_HEADERS = ["GVCN", "Tình trạng chăm sóc", "Ngày tiếp nhận", "Tạo nhóm GV", "Handover date", "Thời gian tạo nhóm"]
_MERGE_FIELDS = ("kenh_cham_soc", "contact_id", "note", "uid", "app_order_id")
# Trạng thái log cho phép xử dòng marker (dòng app đã ghi / cần xác minh).
_MERGEABLE = frozenset({"appended", "matched", "verify_failed"})

_svc: Any = None
_gid_cache: dict[tuple[str, str], int] = {}


def scan_tabs() -> list[tuple[str, str]]:
    """(spreadsheet_id, tab) duy nhất của các team append (bỏ IH2 match-write)."""
    seen: list[tuple[str, str]] = []
    for team, (sid, t_new, t_renew) in hs._ROUTES.items():
        if team in hs._MATCH_WRITE_TEAMS:
            continue
        for t in (t_new, t_renew):
            if (sid, t) not in seen:
                seen.append((sid, t))
    return seen


def cs_cols(header: list[Any]) -> set[int]:
    hn = [hs._fold(h) for h in header]   # fold dấu: "Ghi chú" → "ghi chu"
    out: set[int] = set()
    for i, h in enumerate(hn):
        if h and any(h.startswith(hs._fold(c)) for c in _CS_HEADERS):
            out.add(i)
    notes = [i for i, h in enumerate(hn) if h.startswith("ghi chu") or h.startswith("note")]
    out.update(notes[1:])
    return out


def cs_score(row: list[Any], cols: set[int]) -> int:
    return sum(1 for c in cols if hs._cell(row, c).strip())


def find_duplicate_pairs(header: list[Any], rows: list[list[Any]], hidx: int, *, today=None) -> list[dict[str, Any]]:
    """[{code, marker_row, team_row}] (index trong rows). Chỉ cặp 1 marker ↔ đúng 1 dòng team
    cùng phone9 + tên bé tương thích (bằng hoặc 1 bên trống). ≥2 dòng team → bỏ + log."""
    sdt_i = hs._match_col(header, hs._FIELD_HEADERS["sdt"], set())
    mi = hs._match_col(header, hs._FIELD_HEADERS["app_order_id"], set())
    child_i = hs._match_col(header, hs._FIELD_HEADERS["ten_hoc_sinh"], set())
    contact_i = hs._match_col(header, hs._FIELD_HEADERS["contact_id"], set())
    if sdt_i is None or mi is None:
        return []
    eligible = hs._recent_rows(header, rows, hidx, today=today)
    # phone9 → dòng; mỗi dòng góp cả SĐT lẫn Contact ID (team hay ghi SĐT = số Zalo liên hệ)
    by_phone: dict[str, set[int]] = {}
    phones_of: dict[int, set[str]] = {}
    for ri in sorted(eligible):
        ps = hs._phone_set(hs._cell(rows[ri], sdt_i), hs._cell(rows[ri], contact_i))
        if ps:
            phones_of[ri] = ps
            for p in ps:
                by_phone.setdefault(p, set()).add(ri)

    def child(ri: int) -> str:
        return hs._norm_child(hs._cell(rows[ri], child_i)) if child_i is not None else ""

    out: list[dict[str, Any]] = []
    for m in sorted(phones_of):
        if not hs._cell(rows[m], mi).strip():
            continue  # không phải dòng marker
        linked: set[int] = set()
        for p in phones_of[m]:
            linked |= by_phone.get(p, set())
        teams = [t for t in sorted(linked) if t != m and not hs._cell(rows[t], mi).strip()]
        if not teams:
            continue
        cm = child(m)
        cand = [t for t in teams if not cm or not child(t) or child(t) == cm]
        if len(cand) == 1:
            out.append({"code": hs._cell(rows[m], mi).strip(), "marker_row": m, "team_row": cand[0]})
        elif len(cand) > 1:
            print(f"[cs_handover_dedup] dòng app {m + 1} khớp {len(cand)} dòng team {[t + 1 for t in cand]} — bỏ (verify tay)")
    return out


def _sheet_gid(service, spreadsheet_id: str, tab: str) -> int | None:
    key = (spreadsheet_id, tab)
    if key in _gid_cache:
        return _gid_cache[key]
    try:
        meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id, fields="sheets(properties(sheetId,title))").execute()
        for sh in meta.get("sheets", []) or []:
            pr = sh.get("properties") or {}
            if pr.get("title") is not None and pr.get("sheetId") is not None:
                _gid_cache[(spreadsheet_id, str(pr["title"]))] = int(pr["sheetId"])
    except Exception as exc:
        print(f"[cs_handover_dedup] đọc sheetId lỗi: {exc}")
    return _gid_cache.get(key)


def _confirm_marker(service, spreadsheet_id: str, tab: str, sheet_row: int, mi: int, code: str) -> bool:
    try:
        res = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id, range=f"'{tab}'!{hs._col_a1(mi)}{sheet_row}").execute()
        v = ((res.get("values") or [[]])[0] or [""])[0]
        return str(v).strip() == code
    except Exception as exc:
        print(f"[cs_handover_dedup] đọc lại marker lỗi: {exc}")
        return False


def _delete_row(service, spreadsheet_id: str, tab: str, row0: int) -> bool:
    gid = _sheet_gid(service, spreadsheet_id, tab)
    if gid is None:
        return False
    try:
        service.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id,
            body={"requests": [{"deleteDimension": {"range": {
                "sheetId": gid, "dimension": "ROWS", "startIndex": row0, "endIndex": row0 + 1}}}]},
        ).execute()
        return True
    except Exception as exc:
        print(f"[cs_handover_dedup] deleteDimension dòng {row0 + 1} tab {tab!r} lỗi: {exc}")
        return False


def _clear_app_cells(service, spreadsheet_id: str, tab: str, sheet_row: int, cols: set[int]) -> None:
    """Fallback khi không xoá được dòng: xoá nội dung các ô app sở hữu (không deleteDimension)."""
    for c in sorted(cols):
        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id, range=f"'{tab}'!{hs._col_a1(c)}{sheet_row}",
            valueInputOption="RAW", body={"values": [[""]]}).execute()


def reconcile_tab(sb, service, spreadsheet_id: str, tab: str, *, dry_run: bool = False, today=None) -> int:
    """Xử 1 tab. Trả số cặp đã xử (merged + dup_manual)."""
    rows = hs._read_tab_rows(service, spreadsheet_id, tab)
    if not rows:
        return 0
    hidx = hs._header_row_index(rows)
    header = rows[hidx]
    pairs = find_duplicate_pairs(header, rows, hidx, today=today)
    if not pairs:
        return 0
    mi = hs._match_col(header, hs._FIELD_HEADERS["app_order_id"], set())
    statuses = _store.fetch_statuses(sb, [p["code"] for p in pairs])
    ccols = cs_cols(header)
    blocked = hs._protected_cols(service, spreadsheet_id, tab) if not dry_run else set()
    merge_map = hs._field_col_map(header, {f: "" for f in _MERGE_FIELDS})
    app_cols = set(hs._field_col_map(header, {f: "" for f in hs._FIELD_HEADERS}).values())
    handled = 0
    deleted_rows: list[int] = []
    # Từ dưới lên: xoá dòng dưới không làm lệch dòng trên. Cặp có dòng team nằm DƯỚI dòng đã
    # xoá trong tick này → index đã lệch → để tick sau (đọc lại).
    for pair in sorted(pairs, key=lambda p: -p["marker_row"]):
        code, mrow, trow = pair["code"], pair["marker_row"], pair["team_row"]
        st = statuses.get(code)
        if not st or str(st.get("status") or "") not in _MERGEABLE:
            continue
        if any(d < trow for d in deleted_rows):
            continue
        score = cs_score(rows[mrow], ccols)
        if score > 0:
            print(f"[cs_handover_dedup] DUP_MANUAL {code} tab {tab!r}: dòng app {mrow + 1} có {score} ô CS, dòng team {trow + 1} — không xoá, người xử")
            if not dry_run:
                _store.mark(sb, code, "dup_manual", sheet_row=mrow + 1,
                            last_error=f"dòng app {mrow + 1} có {score} ô CS; dòng team {trow + 1}")
            handled += 1
            continue
        fv = {f: hs._cell(rows[mrow], idx) for f, idx in merge_map.items()}
        if dry_run:
            print(f"[cs_handover_dedup] [DRY] MERGE {code} tab {tab!r}: dòng app {mrow + 1} → dòng team {trow + 1}, điền {[k for k, v in fv.items() if str(v).strip()]}, rồi xoá dòng {mrow + 1}")
            handled += 1
            continue
        hs._fill_empty_cells(service, spreadsheet_id, tab, trow + 1, rows[trow], header, fv, blocked)
        if mi is None or not _confirm_marker(service, spreadsheet_id, tab, mrow + 1, mi, code):
            print(f"[cs_handover_dedup] {code}: marker không còn ở dòng {mrow + 1} — không xoá, tick sau")
            continue
        deleted = _delete_row(service, spreadsheet_id, tab, mrow)
        note = None
        if deleted:
            deleted_rows.append(mrow)
        else:
            _clear_app_cells(service, spreadsheet_id, tab, mrow + 1, {c for c in app_cols if c not in blocked})
            note = f"deleteDimension lỗi → đã xoá nội dung ô app dòng {mrow + 1}"
        _store.mark(sb, code, "merged", sheet_row=trow + 1, marker=code, last_error=note)
        print(f"[cs_handover_dedup] MERGED {code} tab {tab!r}: dòng team {trow + 1} giữ, dòng app {mrow + 1} {'đã xoá' if deleted else 'đã xoá nội dung'}")
        handled += 1
    return handled


def reconcile_duplicates(sb, service=None, *, dry_run: bool = False, today=None) -> int:
    """Quét mọi tab route (trừ IH2). Non-fatal per tab. Trả tổng cặp đã xử."""
    global _svc
    if service is None:
        if _svc is None:
            _svc = hs._sheets_write_service()
        service = _svc
    total = 0
    for sid, tab in scan_tabs():
        try:
            total += reconcile_tab(sb, service, sid, tab, dry_run=dry_run, today=today)
        except Exception as exc:
            print(f"[cs_handover_dedup] tab {tab!r} lỗi (bỏ qua): {exc}")
    return total
