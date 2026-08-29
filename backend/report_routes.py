"""BC03 — Báo cáo tổng bộ từ crm_sales_data + KPI/tỷ giá theo tháng."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import Header, HTTPException, Query
from pydantic import BaseModel, Field

from crm_metrics import (
    aggregate_label,
    exclude_legacy_summary_rows,
    extract_row_metrics,
    fetch_crm_sales_rows,
    is_detail_sale_row,
    is_valid_sale_name,
    parse_metric,
    sync_coverage_meta,
    team_label,
)
from admin_routes import require_module_access, require_module_write
from audit import log_audit
from rbac import enforce_report_scope, resolve_actor, scope_sale_names
from revenue_routes import DEFAULT_TY_GIA, get_rate_for_date, load_team_map
from sepay_routes import classify_cash_in, extract_settlement_code
from vn_staff import is_vn_sale_row

_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
DEFAULT_EXCHANGE_RATE = 3700



def _validate_month_key(month: str) -> str:
    m = (month or "").strip()
    if not _MONTH_RE.match(m):
        raise HTTPException(400, "month phải có dạng YYYY-MM")
    return m


class Bc03KpiRowIn(BaseModel):
    sale_name: str = ""
    b2_orders: int = Field(0, ge=0)
    b4_gmv_vnd: int = Field(0, ge=0)


class Bc03MonthlySaveBody(BaseModel):
    month: str
    exchange_rate: int = Field(DEFAULT_EXCHANGE_RATE, ge=1)
    kpi_rows: list[Bc03KpiRowIn] = Field(default_factory=list)


def _load_monthly(sb, month_key: str) -> dict:
    settings_res = (
        sb.table("bc03_month_settings")
        .select("*")
        .eq("month_key", month_key)
        .limit(1)
        .execute()
    )
    settings = settings_res.data[0] if settings_res.data else None

    kpi_res = (
        sb.table("bc03_kpi_rows")
        .select("id, sale_name, b2_orders, b4_gmv_vnd, sort_order")
        .eq("month_key", month_key)
        .order("sort_order")
        .execute()
    )
    rows = kpi_res.data or []

    return {
        "month": month_key,
        "exchange_rate": int(settings["exchange_rate"]) if settings else DEFAULT_EXCHANGE_RATE,
        "updated_at": settings.get("updated_at") if settings else None,
        "updated_by": settings.get("updated_by") if settings else None,
        "kpi_rows": [
            {
                "id": r["id"],
                "sale_name": r.get("sale_name") or "",
                "b2_orders": int(r.get("b2_orders") or 0),
                "b4_gmv_vnd": int(r.get("b4_gmv_vnd") or 0),
            }
            for r in rows
        ],
    }


def _save_monthly(sb, body: Bc03MonthlySaveBody, actor_email: str | None) -> dict:
    from rpc_helpers import MIGRATION_HINT, rpc_first_row

    month_key = _validate_month_key(body.month)
    rows_payload = [
        {
            "sale_name": (row.sale_name or "").strip(),
            "b2_orders": row.b2_orders,
            "b4_gmv_vnd": row.b4_gmv_vnd,
            "sort_order": i,
        }
        for i, row in enumerate(body.kpi_rows)
        if (row.sale_name or "").strip()
    ]
    try:
        rpc_first_row(
            sb,
            "save_bc03_monthly",
            {
                "p_month_key": month_key,
                "p_exchange_rate": body.exchange_rate,
                "p_actor": actor_email,
                "p_rows": rows_payload,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Lưu BC03 thất bại: {exc}. {MIGRATION_HINT}") from exc

    return _load_monthly(sb, month_key)


def _date_range(range_key: str, start: str | None, end: str | None) -> tuple[str, str]:
    today = date.today()
    if range_key == "today":
        return today.isoformat(), today.isoformat()
    if range_key == "week":
        monday = today - timedelta(days=today.weekday())
        return monday.isoformat(), today.isoformat()
    if range_key == "month":
        return today.replace(day=1).isoformat(), today.isoformat()
    if range_key == "custom" and start and end:
        return start, end
    return today.replace(day=1).isoformat(), today.isoformat()


def _metric(row: dict, *keys: str) -> int:
    m = extract_row_metrics(row)
    semantic = {
        "amount": "b3_gmv",
        "业绩(元)": "b3_gmv",
        "GMV": "b3_gmv",
        "签单数": "l8",
        "Order": "l8",
        "Orders": "l8",
        "completed_classes": "l4",
        "完课数": "l4",
        "Completed Class Number": "l4",
        "referral_leads": "l1_2",
        "转介绍Leads数": "l1_2",
        "Referral leads": "l1_2",
        "Referral Leads": "l1_2",
    }
    for k in keys:
        mk = semantic.get(k)
        if mk:
            return int(m.get(mk) or 0)
    for k in keys:
        if row.get(k) is not None:
            return parse_metric(row[k])
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    for k in keys:
        if k in raw:
            return parse_metric(raw[k])
    return 0


def _sale_key(name: str | None) -> str:
    s = (name or "").strip()
    return s if s else "(Chưa gán sale)"


def _list_dates(d_start: str, d_end: str) -> list[str]:
    try:
        start = date.fromisoformat(d_start[:10])
        end = date.fromisoformat(d_end[:10])
    except ValueError:
        return []
    out: list[str] = []
    cur = start
    while cur <= end:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _row_report_day(row: dict) -> str | None:
    raw = str(row.get("report_date") or "")[:10]
    return raw if len(raw) == 10 else None


def _empty_daily_bucket() -> dict:
    return {
        "gmv_rmb_crm": 0,
        "gmv_rmb_ledger": 0,
        "collected_vnd": 0,
        "collected_vnd_m2": 0,
        "orders_crm": 0,
        "orders_ledger": 0,
        "orders_m2": 0,
    }


def _bump_rev_daily(entry: dict, day: str | None, **parts: int) -> None:
    if not day:
        return
    daily: dict = entry.setdefault("daily", {})
    bucket = daily.setdefault(day, _empty_daily_bucket())
    for k, v in parts.items():
        if k in bucket:
            bucket[k] += int(v or 0)


def _ensure_rev(rev_map: dict, sname: str, team: str = "—") -> dict:
    if sname not in rev_map:
        rev_map[sname] = {
            "sale_name": sname,
            "team": team or "—",
            "gmv_rmb_crm": 0,
            "gmv_rmb_ledger": 0,
            "collected_vnd": 0,
            "collected_vnd_m2": 0,
            "orders_crm": 0,
            "orders_ledger": 0,
            "orders_m2": 0,
            "daily": {},
        }
    elif team and team != "—" and rev_map[sname]["team"] == "—":
        rev_map[sname]["team"] = team
    return rev_map[sname]


def _load_ledger_revenue(sb, d_start: str, d_end: str, team: str | None) -> tuple[dict[str, dict], set[str]]:
    """Sổ doanh thu — VND/RMB thực thu theo ngay_tien_ve."""
    out: dict[str, dict] = {}
    linked_don_ids: set[str] = set()
    try:
        q = (
            sb.table("so_doanh_thu")
            .select("sale_crm_name, team, so_tien_vnd, so_tien_net, phi_cong, gmv_rmb, don_hang_id, ngay_tien_ve")
            .gte("ngay_tien_ve", d_start)
            .lte("ngay_tien_ve", d_end)
            .eq("is_test", False)
        )
        if team:
            q = q.eq("team", team)
        for r in q.execute().data or []:
            sname = _sale_key(r.get("sale_crm_name"))
            entry = _ensure_rev(out, sname, (r.get("team") or "—").strip() or "—")
            net_val = r.get("so_tien_net")
            vnd = parse_metric(net_val if net_val is not None else r.get("so_tien_vnd"))
            gmv = int(float(r.get("gmv_rmb") or 0))
            day = str(r.get("ngay_tien_ve") or "")[:10]
            entry["collected_vnd"] += vnd
            entry["gmv_rmb_ledger"] += gmv
            entry["orders_ledger"] += 1
            _bump_rev_daily(entry, day, collected_vnd=vnd, gmv_rmb_ledger=gmv, orders_ledger=1)
            did = r.get("don_hang_id")
            if did:
                linked_don_ids.add(str(did))
    except Exception as exc:
        print(f"[BC03] so_doanh_thu query failed: {exc}")
    return out, linked_don_ids


def _load_m2_revenue(
    sb, d_start: str, d_end: str, team: str | None, skip_don_ids: set[str]
) -> dict[str, dict]:
    """Module 2 — don_hang tien_ve=true (bổ sung đơn chưa có trên Sổ)."""
    out: dict[str, dict] = {}
    try:
        team_map = load_team_map(sb) if team else {}
        q = (
            sb.table("don_hang")
            .select("id, sale_crm_name, so_tien_can_thu, updated_at")
            .eq("tien_ve", True)
            .gte("updated_at", f"{d_start}T00:00:00")
            .lte("updated_at", f"{d_end}T23:59:59")
        )
        for r in q.execute().data or []:
            oid = str(r.get("id") or "")
            if oid in skip_don_ids:
                continue
            sname = _sale_key(r.get("sale_crm_name"))
            sale_team = "—"
            if team and sname != "(Chưa gán sale)":
                sale_team = team_map.get(sname, "—")
                if sale_team != team:
                    continue
            entry = _ensure_rev(out, sname, sale_team)
            vnd = parse_metric(r.get("so_tien_can_thu"))
            day = str(r.get("updated_at") or "")[:10]
            entry["collected_vnd_m2"] += vnd
            entry["orders_m2"] += 1
            _bump_rev_daily(entry, day, collected_vnd_m2=vnd, orders_m2=1)
    except Exception as exc:
        print(f"[BC03] don_hang query failed: {exc}")
    return out


def _merge_rev_maps(*maps: dict[str, dict]) -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for m in maps:
        for sname, src in m.items():
            dst = _ensure_rev(merged, sname, src.get("team", "—"))
            for k in (
                "gmv_rmb_crm", "gmv_rmb_ledger", "collected_vnd", "collected_vnd_m2",
                "orders_crm", "orders_ledger", "orders_m2",
            ):
                dst[k] += int(src.get(k) or 0)
            src_daily = src.get("daily") or {}
            if src_daily:
                dst_daily = dst.setdefault("daily", {})
                for day, bucket in src_daily.items():
                    db = dst_daily.setdefault(day, _empty_daily_bucket())
                    for dk in db:
                        db[dk] += int((bucket or {}).get(dk) or 0)
    return merged


def _finalize_daily_bucket(bucket: dict) -> dict:
    gmv_rmb = bucket["gmv_rmb_crm"] + bucket["gmv_rmb_ledger"]
    collected_vnd = bucket["collected_vnd"] + bucket["collected_vnd_m2"]
    orders = bucket["orders_ledger"] + bucket["orders_m2"]
    if orders == 0:
        orders = bucket["orders_crm"]
    return {
        **bucket,
        "gmv_rmb": gmv_rmb,
        "collected_vnd": collected_vnd,
        "orders": orders,
    }


def _finalize_revenue_rows(rev_map: dict[str, dict], dates: list[str]) -> list[dict]:
    rows = []
    for v in rev_map.values():
        gmv_rmb = v["gmv_rmb_crm"] + v["gmv_rmb_ledger"]
        collected_vnd = v["collected_vnd"] + v["collected_vnd_m2"]
        orders = v["orders_ledger"] + v["orders_m2"]
        if orders == 0:
            orders = v["orders_crm"]
        raw_daily = v.get("daily") or {}
        daily_out: dict[str, dict] = {}
        for d in dates:
            daily_out[d] = _finalize_daily_bucket(raw_daily.get(d, _empty_daily_bucket()))
        rows.append({
            **{k: v[k] for k in v if k != "daily"},
            "gmv_rmb": gmv_rmb,
            "collected_vnd": collected_vnd,
            "orders": orders,
            "daily": daily_out,
        })
    return sorted(rows, key=lambda x: (x["collected_vnd"], x["gmv_rmb"]), reverse=True)


def _ensure_metric_row(metric_map: dict, sname: str, team: str, field: str) -> dict:
    if sname not in metric_map:
        metric_map[sname] = {"sale_name": sname, "team": team or "—", field: 0, "daily": {}}
    elif team and team != "—" and metric_map[sname]["team"] == "—":
        metric_map[sname]["team"] = team
    return metric_map[sname]


def _bump_metric_daily(entry: dict, day: str | None, field: str, amount: int) -> None:
    if not day:
        return
    daily: dict = entry.setdefault("daily", {})
    daily[day] = int(daily.get(day) or 0) + int(amount or 0)


def _load_sale_team_roster(sb) -> dict[str, str]:
    """crm_name → team app (nhan_su_sale) — ưu tiên hơn department CRM."""
    out: dict[str, str] = {}
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("crm_name, team")
            .eq("is_active", True)
            .execute()
        )
        for r in res.data or []:
            name = (r.get("crm_name") or "").strip()
            team = (r.get("team") or "").strip()
            if name and team:
                out[name] = team
    except Exception as exc:
        print(f"[BC03] nhan_su_sale roster failed: {exc}")
    return out


def _resolve_bc03_team(sname: str, crm_team: str, roster: dict[str, str]) -> str:
    from revenue_routes import team_to_canonical

    roster_team = roster.get(sname)
    if roster_team:
        return team_to_canonical(roster_team, None)
    return team_to_canonical(crm_team, None) if crm_team and crm_team != "—" else "Khác"


def _finalize_metric_rows(metric_map: dict[str, dict], field: str, dates: list[str]) -> list[dict]:
    rows = []
    for v in metric_map.values():
        raw_daily = v.get("daily") or {}
        daily_out = {d: int(raw_daily.get(d) or 0) for d in dates}
        total = sum(daily_out.values())
        rows.append({
            "sale_name": v["sale_name"],
            "team": v["team"],
            field: total,
            "daily": daily_out,
        })
    return sorted(rows, key=lambda x: x[field], reverse=True)


# ---------------------------------------------------------------------------
# BC04 — Báo cáo Dòng tiền về hàng ngày (thay báo cáo thủ công của chị Vân)
# ---------------------------------------------------------------------------
_BC04_ACCOUNT_HN_MB = "1680011668899"
_BC04_VN_TZ = timezone(timedelta(hours=7))

# Auto phân loại quản báo cho nhóm rõ ràng (§5 spec) — nhóm còn lại để trống,
# chị Vân chọn tay qua dropdown FE (lưu vào cash_in_annotations).
_BC04_AUTO_CLASSIFY = {
    "khach_tra": ("Giáo dục / 教育", "Doanh thu / 收入"),
    "the": ("Giáo dục / 教育", "Doanh thu / 收入"),
    "the_gop": ("Giáo dục / 教育", "Doanh thu / 收入"),
}
_BC04_LABEL_BY_GROUP = {
    "khach_tra": "Khách trả / 用户付款",
    "the": "Quẹt thẻ",
    "the_gop": "Quẹt thẻ (chưa tách)",
    "rut_tiktok": "Rút TikTok",
    "khac": "Khoản khác",
}


def _bc04_bank_vn_date(transaction_date: Any) -> str | None:
    """bank_transactions.transaction_date là timestamptz (lưu đúng UTC) — PHẢI quy
    đổi sang giờ VN (+7) trước khi lấy ngày. Không được lấy .date() thẳng từ UTC,
    sẽ lệch ngày quanh nửa đêm (xem docs/learnings/2026-08-08-ct1-ngay-tien-ve-don-the-paid-at-utc.md)."""
    text = str(transaction_date or "").strip()
    if not text:
        return None
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_BC04_VN_TZ).date().isoformat()
    except ValueError:
        return None


def _bc04_bank_vn_datetime_str(transaction_date: Any) -> str:
    """Chuỗi giờ VN naive (VD '2026-08-25 10:26:00') dùng để sort cùng thang đo với
    gateway.funded_date (đã naive VN sẵn) — không dùng để tính ngày (dùng
    _bc04_bank_vn_date cho việc đó)."""
    text = str(transaction_date or "").strip()
    if not text:
        return ""
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(_BC04_VN_TZ).replace(tzinfo=None).isoformat(sep=" ")
    except ValueError:
        return text


def _bc04_gateway_vn_date(funded_date: Any) -> str | None:
    """gateway_transactions.funded_date là timestamp WITHOUT time zone — đã là giờ VN
    naive sẵn (xem docs/learnings/timestamp-vs-date-funded-date-gateway.md). TUYỆT ĐỐI
    không gắn/convert timezone ở đây — sẽ lệch ngày ngược lại với bank."""
    text = str(funded_date or "").strip()
    if not text:
        return None
    return text[:10] or None


def _bc04_sale_team_maps(sb, sale_emails: list[str]) -> tuple[dict[str, str], dict[str, str]]:
    emails = sorted({e.strip().lower() for e in sale_emails if e and e.strip()})
    if not emails:
        return {}, {}
    sale_name_map: dict[str, str] = {}
    team_by_email: dict[str, str] = {}
    try:
        from payment_request_routes import _sale_name_map

        sale_name_map = _sale_name_map(sb)
    except Exception as exc:
        print(f"[BC04] sale name lookup failed: {exc}")
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("email, team, sub_team")
            .in_("email", emails)
            .execute()
        )
        team_by_email = {
            (row.get("email") or "").strip().lower(): (row.get("team") or row.get("sub_team") or "").strip()
            for row in (res.data or [])
            if (row.get("email") or "").strip()
        }
    except Exception as exc:
        print(f"[BC04] team lookup failed: {exc}")
    return sale_name_map, team_by_email


def _bc04_join_payment_lines(sb, payment_line_ids: list) -> tuple[dict, dict, dict, dict]:
    """(lines_by_id, prs_by_id, sale_name_map, team_by_email) cho tập payment_line_id.
    Dùng chung cho CẢ dòng thẻ (gateway) LẪN dòng bank non-card đã match — spec §6 bước 3
    ('Non-card → join payment_line_id lấy sale/team') áp dụng như nhau cho cả 2 nguồn,
    KHÔNG dùng cột bank_transactions.team (đó là tag chi nhánh HCM/HN thủ công, khác hẳn
    khái niệm team sale — xem docs/learnings/... nếu có ghi chú, hoặc hỏi lại nếu chưa)."""
    line_ids = sorted({pid for pid in payment_line_ids if pid})
    lines_by_id: dict[str, dict] = {}
    prs_by_id: dict[str, dict] = {}
    if line_ids:
        try:
            line_res = sb.table("payment_lines").select("*").in_("id", line_ids).execute()
            lines_by_id = {row["id"]: row for row in (line_res.data or [])}
            pr_ids = sorted({row.get("payment_request_id") for row in lines_by_id.values() if row.get("payment_request_id")})
            if pr_ids:
                pr_res = sb.table("payment_requests").select("*").in_("id", pr_ids).execute()
                prs_by_id = {row["id"]: row for row in (pr_res.data or [])}
        except Exception as exc:
            print(f"[BC04] payment_line/PR lookup failed: {exc}")
    sale_emails = [
        (prs_by_id.get(line.get("payment_request_id")) or {}).get("sale_email")
        for line in lines_by_id.values()
    ]
    sale_name_map, team_by_email = _bc04_sale_team_maps(sb, sale_emails)
    return lines_by_id, prs_by_id, sale_name_map, team_by_email


def _load_bc04_card_rows(sb, d_start: str, d_end: str) -> tuple[list[dict], set[str]]:
    """Per-đơn thẻ đã đồng bộ trong kỳ (funded_date, giờ VN naive). Trả kèm tập
    settlement_code để M1-T3b dùng loại cục bank trùng (dedup hybrid §3)."""
    res = (
        sb.table("gateway_transactions")
        .select("*")
        .gte("funded_date", d_start)
        .lte("funded_date", f"{d_end} 23:59:59")
        .neq("match_status", "ignored")
        .execute()
    )
    txns = res.data or []
    settlement_codes = {str(t.get("settlement_code")) for t in txns if t.get("settlement_code")}

    lines_by_id, prs_by_id, sale_name_map, team_by_email = _bc04_join_payment_lines(
        sb, [t.get("payment_line_id") for t in txns]
    )

    rows: list[dict] = []
    for t in txns:
        vn_date = _bc04_gateway_vn_date(t.get("funded_date"))
        if not vn_date:
            continue
        line = lines_by_id.get(t.get("payment_line_id")) or {}
        pr = prs_by_id.get(line.get("payment_request_id")) or {}
        sale_email = (pr.get("sale_email") or "").strip().lower()
        group = classify_cash_in(content="", payment_line_id=t.get("payment_line_id"), is_card=True)
        rows.append({
            "source": "gateway",
            "txn_id": t.get("id"),
            "date": vn_date,
            "sort_ts": str(t.get("funded_date") or vn_date),  # đã là giờ VN naive, so sánh chuỗi trực tiếp được
            "group": group,
            "label": _BC04_LABEL_BY_GROUP[group],
            "input": float(t.get("net_amount") or 0),
            "team": team_by_email.get(sale_email, ""),
            "sale_name": sale_name_map.get(sale_email, ""),
            "data_source": "mPOS" if t.get("source") == "mpos" else "Payoo",
            "settlement_code": t.get("settlement_code"),
        })
    return rows, settlement_codes


def _load_bc04_bank_rows(sb, d_start: str, d_end: str, known_settlement_codes: set[str]) -> list[dict]:
    """CK khách + cọc + rút TikTok/nội bộ/lạ + cục thẻ CHƯA đồng bộ. Cố ý KHÔNG lọc
    match_status — cục settle thẻ luôn ở match_status='ignored' nhưng vẫn là tiền
    thật về TK, phải hiện (đúng §3/§6.2 spec)."""
    res = (
        sb.table("bank_transactions")
        .select("*")
        .gt("amount", 0)
        .eq("account_number", _BC04_ACCOUNT_HN_MB)
        .gte("transaction_date", f"{d_start}T00:00:00+07:00")
        .lte("transaction_date", f"{d_end}T23:59:59+07:00")
        .execute()
    )
    bank_txns = res.data or []
    lines_by_id, prs_by_id, sale_name_map, team_by_email = _bc04_join_payment_lines(
        sb, [r.get("payment_line_id") for r in bank_txns]
    )

    rows: list[dict] = []
    for r in bank_txns:
        vn_date = _bc04_bank_vn_date(r.get("transaction_date"))
        if not vn_date or vn_date < d_start or vn_date > d_end:
            continue
        content = r.get("content") or r.get("transfer_content") or ""
        pc = extract_settlement_code(content)
        if pc and pc in known_settlement_codes:
            continue  # đã tách per-đơn ở gateway — bỏ cục, tránh đếm 2 lần (G3)
        group = classify_cash_in(content=content, payment_line_id=r.get("payment_line_id"))
        line = lines_by_id.get(r.get("payment_line_id")) or {}
        pr = prs_by_id.get(line.get("payment_request_id")) or {}
        sale_email = (pr.get("sale_email") or "").strip().lower()
        rows.append({
            "source": "bank",
            "txn_id": r.get("txn_id"),
            "date": vn_date,
            "sort_ts": _bc04_bank_vn_datetime_str(r.get("transaction_date")),
            "group": group,
            "label": _BC04_LABEL_BY_GROUP[group],
            "input": float(r.get("amount") or 0),
            "team": team_by_email.get(sale_email, ""),
            "sale_name": sale_name_map.get(sale_email, ""),
            "data_source": "HN BANK",
            "settlement_code": pc,
        })
    return rows


def _load_bc04_annotations(sb, keys: list[tuple[str, str]]) -> dict[tuple[str, str], dict]:
    if not keys:
        return {}
    try:
        sources = sorted({k[0] for k in keys})
        txn_ids = sorted({k[1] for k in keys})
        res = (
            sb.table("cash_in_annotations")
            .select("*")
            .in_("source", sources)
            .in_("txn_id", txn_ids)
            .execute()
        )
        return {(row.get("source"), str(row.get("txn_id"))): row for row in (res.data or [])}
    except Exception as exc:
        print(f"[BC04] annotations lookup failed: {exc}")
        return {}


def _build_bc04_rows(sb, d_start: str, d_end: str, opening_balance: float, team: str | None) -> dict:
    card_rows, settlement_codes = _load_bc04_card_rows(sb, d_start, d_end)
    bank_rows = _load_bc04_bank_rows(sb, d_start, d_end, settlement_codes)
    all_rows = card_rows + bank_rows
    if team:
        all_rows = [r for r in all_rows if (r.get("team") or "").strip().lower() == team.strip().lower()]

    all_rows.sort(key=lambda r: (r["date"], r["sort_ts"], r["source"], str(r["txn_id"])))

    annotations = _load_bc04_annotations(sb, [(r["source"], str(r["txn_id"])) for r in all_rows])

    balance = float(opening_balance or 0)
    total_input = 0.0
    total_rmb = 0.0
    days: dict[str, dict] = {}
    out_rows: list[dict] = []
    rate_cache: dict[str, Any] = {}
    for r in all_rows:
        if r["date"] not in rate_cache:
            rate_cache[r["date"]] = get_rate_for_date(sb, date.fromisoformat(r["date"]))
        rate = rate_cache[r["date"]]
        auto_business_line, auto_main_cat = _BC04_AUTO_CLASSIFY.get(r["group"], ("", ""))
        ann = annotations.get((r["source"], str(r["txn_id"]))) or {}

        balance += r["input"]
        total_input += r["input"]
        rmb_value = round(r["input"] / float(rate), 2) if rate else 0
        total_rmb += rmb_value

        day_bucket = days.setdefault(r["date"], {"total_input": 0.0, "total_rmb": 0.0, "ending_balance": 0.0})
        day_bucket["total_input"] += r["input"]
        day_bucket["total_rmb"] += rmb_value
        day_bucket["ending_balance"] = balance  # all_rows đã sắp theo (date, sort_ts) — dòng cuối cùng trong ngày là đúng

        out_rows.append({
            "source": r["source"],
            "txn_id": r["txn_id"],
            "date": r["date"],
            "details": r["label"],
            "group": r["group"],
            "output": 0,
            "input": r["input"],
            "balance": round(balance, 2),
            "income": r["input"],
            "expenditure": 0,
            "business_line": ann.get("business_line") or auto_business_line,
            "team": r["team"],
            "note": ann.get("note") or "",
            "rmb": rmb_value,
            "data_source": r["data_source"],
            "main_cat": ann.get("main_cat") or auto_main_cat,
            "detail": ann.get("detail") or "",
        })

    summary_rate = float(get_rate_for_date(sb, date.fromisoformat(d_start)))

    return {
        "period": {"start": d_start, "end": d_end},
        "summary": {
            "total_input": round(total_input, 2),
            "total_rmb": round(total_rmb, 2),
            "opening_balance": float(opening_balance or 0),
            "closing_balance": round(balance, 2),
            "rate": summary_rate,
            "row_count": len(out_rows),
        },
        "days": [
            {
                "date": d,
                "total_input": round(v["total_input"], 2),
                "total_rmb": round(v["total_rmb"], 2),
                "ending_balance": round(v["ending_balance"], 2),
            }
            for d, v in sorted(days.items())
        ],
        "rows": out_rows,
    }


class CashInAnnotationBody(BaseModel):
    business_line: str | None = None
    main_cat: str | None = None
    detail: str | None = None
    note: str | None = None


def register_report_routes(app, supabase_factory):

    @app.get("/reports/bc03", tags=["Reports"])
    def report_bc03(
        range_key: str = Query("month"),
        start: str | None = Query(None),
        end: str | None = Query(None),
        team: str | None = Query(None),
        department: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "bc03")
        team, sub_team = enforce_report_scope(actor, team or department)

        d_start, d_end = _date_range(range_key, start, end)
        dates = _list_dates(d_start, d_end)

        try:
            raw_rows = fetch_crm_sales_rows(
                sb, d_start, d_end, team=team,
            )
            rows = exclude_legacy_summary_rows(raw_rows)
            rows = [r for r in rows if is_detail_sale_row(r)]
            allowed_sales: set[str] | None = None
            if sub_team and team:
                allowed_sales = scope_sale_names(sb, team, sub_team)
                rows = [r for r in rows if aggregate_label(r) in allowed_sales]
            coverage = sync_coverage_meta(rows, d_start, d_end)
        except Exception as exc:
            raise HTTPException(500, f"Query BC03 thất bại: {exc}") from exc

        roster = _load_sale_team_roster(sb)

        rev_map: dict[str, dict] = {}
        trial_map: dict[str, dict] = {}
        ref_map: dict[str, dict] = {}

        for r in rows:
            sname = aggregate_label(r)
            if not is_valid_sale_name(sname):
                continue
            day = _row_report_day(r)
            m = extract_row_metrics(r)
            gmv = int(m["b3_gmv"])
            orders = int(m["l8"])
            completed = int(m["l4"])
            referral = int(m["l1_2"])
            team_l = _resolve_bc03_team(sname, team_label(r), roster)

            rev = _ensure_rev(rev_map, sname, team_l)
            rev["gmv_rmb_crm"] += gmv
            rev["orders_crm"] += orders
            _bump_rev_daily(rev, day, gmv_rmb_crm=gmv, orders_crm=orders)

            trial = _ensure_metric_row(trial_map, sname, team_l, "completed_classes")
            _bump_metric_daily(trial, day, "completed_classes", completed)

            ref = _ensure_metric_row(ref_map, sname, team_l, "referral_leads")
            _bump_metric_daily(ref, day, "referral_leads", referral)

        ledger_map, linked_don = _load_ledger_revenue(sb, d_start, d_end, team)
        m2_map = _load_m2_revenue(sb, d_start, d_end, team, linked_don)
        if allowed_sales is not None:
            ledger_map = {k: v for k, v in ledger_map.items() if k in allowed_sales}
            m2_map = {k: v for k, v in m2_map.items() if k in allowed_sales}
        rev_map = _merge_rev_maps(rev_map, ledger_map, m2_map)
        revenue = _finalize_revenue_rows(rev_map, dates)
        trial = _finalize_metric_rows(trial_map, "completed_classes", dates)
        referral = _finalize_metric_rows(ref_map, "referral_leads", dates)

        return {
            "period": {"start": d_start, "end": d_end},
            "dates": dates,
            "revenue": revenue,
            "trial": trial,
            "referral": referral,
            "meta": {
                "source": "supabase_daily",
                "row_count": len(rows),
                **coverage,
            },
        }

    @app.get("/reports/bc03/staff", tags=["Reports"])
    def bc03_staff_options(authorization: str | None = Header(None)):
        """Danh sách sale VN (nhan_su_sale) để thêm KPI hàng loạt."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "bc03")
        try:
            res = (
                sb.table("nhan_su_sale")
                .select("crm_name, team, display_name, is_active")
                .eq("is_active", True)
                .order("crm_name")
                .execute()
            )
            sales = []
            for r in res.data or []:
                if not is_vn_sale_row(r):
                    continue
                name = (r.get("crm_name") or "").strip()
                if not name:
                    continue
                sales.append(
                    {
                        "crm_name": name,
                        "team": (r.get("team") or "—").strip() or "—",
                        "display_name": (r.get("display_name") or name).strip(),
                    }
                )
            return {"sales": sales}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi tải danh sách nhân sự: {exc}") from exc

    @app.get("/reports/bc03/monthly", tags=["Reports"])
    def get_bc03_monthly(
        month: str = Query(..., description="YYYY-MM"),
        authorization: str | None = Header(None),
    ):
        """Tỷ giá + KPI đã lưu cho tháng."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "bc03")
        
        month_key = _validate_month_key(month)
        try:
            return _load_monthly(sb, month_key)
        except HTTPException:
            raise
        except Exception as exc:
            err = str(exc).lower()
            if "bc03_month" in err or "does not exist" in err or "pgrst205" in err:
                raise HTTPException(
                    503,
                    "Chưa có bảng bc03_month_settings — chạy docs/supabase_schema_patch_bc03_monthly.sql",
                ) from exc
            raise HTTPException(500, f"Đọc KPI tháng thất bại: {exc}") from exc

    @app.put("/reports/bc03/monthly", tags=["Reports"])
    def save_bc03_monthly(
        body: Bc03MonthlySaveBody,
        authorization: str | None = Header(None),
    ):
        """Lưu tỷ giá + KPI cho tháng (điền đầu tháng)."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "bc03")
        actor_email = actor.email

        try:
            return _save_monthly(sb, body, actor_email)
        except HTTPException:
            raise
        except Exception as exc:
            err = str(exc).lower()
            if "bc03_month" in err or "does not exist" in err or "pgrst205" in err:
                raise HTTPException(
                    503,
                    "Chưa có bảng bc03_month_settings — chạy docs/supabase_schema_patch_bc03_monthly.sql",
                ) from exc
            raise HTTPException(500, f"Lưu KPI tháng thất bại: {exc}") from exc

    @app.get("/reports/cash-in", tags=["Reports"])
    def report_cash_in(
        from_: str = Query(..., alias="from", description="YYYY-MM-DD"),
        to: str = Query(..., description="YYYY-MM-DD"),
        opening_balance: float = Query(0),
        team: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "bc04")

        try:
            date.fromisoformat(from_)
            date.fromisoformat(to)
        except ValueError as exc:
            raise HTTPException(400, "from/to phải có dạng YYYY-MM-DD") from exc
        if from_ > to:
            raise HTTPException(400, "from phải <= to")

        try:
            return _build_bc04_rows(sb, from_, to, opening_balance, team)
        except HTTPException:
            raise
        except Exception as exc:
            err = str(exc).lower()
            if "cash_in_annotations" in err or "does not exist" in err or "pgrst205" in err:
                raise HTTPException(
                    503,
                    "Chưa có bảng cash_in_annotations — chạy migration 2026-08-29-cash-in-annotations.sql",
                ) from exc
            raise HTTPException(500, f"Query Dòng tiền về thất bại: {exc}") from exc

    @app.put("/reports/cash-in/{source}/{txn_id}/annotation", tags=["Reports"])
    def save_cash_in_annotation(
        source: str,
        txn_id: str,
        body: CashInAnnotationBody,
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "bc04")

        if source not in ("bank", "gateway"):
            raise HTTPException(400, "source phải là 'bank' hoặc 'gateway'")

        payload = {
            "source": source,
            "txn_id": txn_id,
            "business_line": body.business_line,
            "main_cat": body.main_cat,
            "detail": body.detail,
            "note": body.note,
            "updated_by_email": actor.email,
        }
        try:
            sb.table("cash_in_annotations").upsert(payload, on_conflict="source,txn_id").execute()
            log_audit(
                sb,
                actor.email,
                "cash_in_annotation_update",
                target_type=source,
                target_id=txn_id,
                payload=payload,
            )
            return {"ok": True}
        except Exception as exc:
            err = str(exc).lower()
            if "cash_in_annotations" in err or "does not exist" in err or "pgrst205" in err:
                raise HTTPException(
                    503,
                    "Chưa có bảng cash_in_annotations — chạy migration 2026-08-29-cash-in-annotations.sql",
                ) from exc
            raise HTTPException(500, f"Lưu phân loại thất bại: {exc}") from exc
