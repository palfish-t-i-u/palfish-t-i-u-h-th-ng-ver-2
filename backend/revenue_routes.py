"""Module 5 — Sổ doanh thu & pivot Doanh thu Sale."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import Header, HTTPException, Query
from pydantic import BaseModel

from rbac import can_confirm_payment, resolve_actor

DEFAULT_TY_GIA = Decimal("3700")

TEAM_PIVOT_LABELS: dict[str, str] = {
    "Inhouse 1": "HN inhouse",
    "Inhouse 2": "HN inhouse 2",
    "HCM (Online)": "HCM team",
    "In-house": "HN inhouse",
    "HCM team": "HCM team",
    "Linh Dam (Store)": "Linh Dam",
    "Offline": "Offline",
    "An Binh (Store)": "An Binh",
}

KNOWN_BC01_TEAMS = frozenset(
    {
        "Inhouse 1",
        "Inhouse 2",
        "HCM (Online)",
        "Linh Dam (Store)",
        "Offline",
        "An Binh (Store)",
    }
)

BC01_TEAM_ORDER = [
    "Inhouse 1",
    "Inhouse 2",
    "HCM (Online)",
    "Linh Dam (Store)",
    "Offline",
    "An Binh (Store)",
    "Khác",
]

TEAM_TO_CANONICAL: dict[str, str] = {
    "Inhouse 1": "Inhouse 1",
    "Inhouse 2": "Inhouse 2",
    "HCM (Online)": "HCM (Online)",
    "In-house": "Inhouse 1",
    "HN inhouse": "Inhouse 1",
    "HN inhouse 2": "Inhouse 2",
    "HCM team": "HCM (Online)",
    "Linh Dam": "Linh Dam (Store)",
    "Linh Dam Store": "Linh Dam (Store)",
    "Linh Dam (Store)": "Linh Dam (Store)",
    "Offline": "Offline",
    "Offline Store": "Offline",
    "An Binh": "An Binh (Store)",
    "An Binh Store": "An Binh (Store)",
    "An Binh (Store)": "An Binh (Store)",
}

BC02_TYPE_ORDER: list[str] = [
    "Quảng cáo",
    "Giới thiệu",
    "KOC",
    "Gia hạn",
    "Kho chung",
    "Lives",
    "Offline",
    "Other",
]

BC02_TYPE_ALIASES: dict[str, str] = {
    "广告": "Quảng cáo",
    "PNS": "Quảng cáo",
    "Partnership": "Quảng cáo",
    "FB": "Quảng cáo",
    "Bán mới": "Quảng cáo",
    "转介绍": "Giới thiệu",
    "Refer": "Giới thiệu",
    "Khách giới thiệu": "Giới thiệu",
    "KOC": "KOC",
    "续费": "Gia hạn",
    "Resell": "Gia hạn",
    "Gia hạn": "Gia hạn",
    "公海": "Kho chung",
    "GD": "Kho chung",
    "Kho chung": "Kho chung",
    "Lives": "Lives",
    "Livestream": "Lives",
    "Offline": "Offline",
    "Booth": "Offline",
    "Other": "Other",
    "KFT": "Other",
    "KET": "Other",
    "Nguồn khác": "Other",
}

BC02_AD_SOURCES = frozenset({"广告", "PNS", "Bán mới", "Quảng cáo", "Partnership", "FB"})
BC02_AD_LOAI2_OWN_COLUMN = frozenset({"KOC", "Lives", "Livestream", "Offline", "Booth", "KFT", "KET"})

BC02_GMV_GROUPS: list[tuple[str, str, str, str]] = [
    ("ads", "Quảng cáo", "Số đơn đầu", "GMV"),
    ("offline", "Offline", "Số đơn đầu", "GMV"),
    ("refer", "Giới thiệu", "Số đơn đầu", "GMV"),
    ("public_pool", "Kho chung", "Số đơn", "GMV"),
    ("renew", "Gia hạn", "Số đơn", "GMV"),
    ("koc", "KOC", "Số đơn", "GMV"),
    ("other", "Khác", "Số đơn", "GMV"),
    ("lives", "Livestream", "Số đơn", "GMV"),
]

BC02_TYPE_TO_GMV_KEY: dict[str, str] = {
    "Quảng cáo": "ads",
    "Offline": "offline",
    "Giới thiệu": "refer",
    "Kho chung": "public_pool",
    "Gia hạn": "renew",
    "KOC": "koc",
    "Other": "other",
    "Lives": "lives",
}


def _require_ops(actor) -> None:
    if not can_confirm_payment(actor):
        raise HTTPException(403, "Chỉ Thu Hiền / System được thao tác Sổ doanh thu")


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        return None


def vnd_to_rmb(vnd: int | float, rate: Decimal = DEFAULT_TY_GIA) -> float:
    if not vnd:
        return 0.0
    r = (Decimal(str(vnd)) / rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(r)


def team_to_pivot_label(team: str | None) -> str:
    t = (team or "").strip()
    if not t:
        return "Khác"
    return TEAM_PIVOT_LABELS.get(t, t)


def _is_test_email(email: str) -> bool:
    return email.strip().lower().endswith("@dev")


def team_to_canonical(team: str | None, team_pivot_label: str | None = None) -> str:
    t = (team or "").strip()
    if t in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[t]
    pl = (team_pivot_label or "").strip()
    if pl in TEAM_TO_CANONICAL:
        return TEAM_TO_CANONICAL[pl]
    if t in KNOWN_BC01_TEAMS:
        return t
    if pl in KNOWN_BC01_TEAMS:
        return pl
    return "Khác"


def _bc02_type_goc(loai: str | None, loai2: str | None) -> str:
    l1 = (loai or "").strip()
    l2 = (loai2 or "").strip()
    l1_norm = BC02_TYPE_ALIASES.get(l1, l1)
    if l1_norm in BC02_AD_SOURCES or l1 in BC02_AD_SOURCES:
        if l2:
            if l2 in BC02_AD_LOAI2_OWN_COLUMN:
                return l2
            return l1 or l2
    return l1 or l2


def bc02_type_from_row(loai: str | None, loai2: str | None) -> str:
    goc = _bc02_type_goc(loai, loai2).strip()
    if not goc:
        return "Other"
    if goc in BC02_TYPE_ALIASES:
        return BC02_TYPE_ALIASES[goc]
    lower = goc.lower()
    for alias, category in BC02_TYPE_ALIASES.items():
        if alias.lower() == lower:
            return category
    return "Other"


def _row_pay_date(row: dict[str, Any]) -> date | None:
    """BC02 day bucket — Pay Time (pay_time), fallback ngay_tien_ve."""
    return _parse_date(row.get("pay_time")) or _parse_date(row.get("ngay_tien_ve"))


def _row_month_date(row: dict[str, Any]) -> date | None:
    """BC01 month bucket — ngay_tien_ve per MODULE_SO_DOANH_THU §3.3."""
    return _parse_date(row.get("ngay_tien_ve"))


def _build_sales_performance_pivot(
    rows: list[dict[str, Any]],
    *,
    team_filter: str | None = None,
) -> dict[str, Any]:
    month_set: set[str] = set()
    grouped: dict[str, dict[str, dict[str, float]]] = {}

    for r in rows:
        ngay = _row_month_date(r)
        if not ngay:
            continue
        mk = _month_key(ngay)
        month_set.add(mk)
        team_label = team_to_canonical(r.get("team"), r.get("team_pivot_label"))
        if team_filter and team_label != team_filter:
            continue
        sale = (r.get("sale_crm_name") or "(Chưa gán sale)").strip()
        gmv = float(r.get("gmv_rmb") or 0)
        grouped.setdefault(team_label, {}).setdefault(sale, {})
        grouped[team_label][sale][mk] = grouped[team_label][sale].get(mk, 0) + gmv

    months = sorted(month_set, key=lambda m: (int(m.split("/")[0]), int(m.split("/")[1])))

    sorted_teams = [t for t in BC01_TEAM_ORDER if t in grouped]
    sorted_teams.extend(sorted(t for t in grouped if t not in BC01_TEAM_ORDER))

    teams_out = []
    grand: dict[str, float] = {m: 0.0 for m in months}
    grand_total = 0.0

    for team_label in sorted_teams:
        sales_map = grouped[team_label]
        team_total_row: dict[str, float] = {m: 0.0 for m in months}
        sales_out = []
        for sale_name in sorted(sales_map.keys()):
            cells = sales_map[sale_name]
            row_total = sum(cells.get(m, 0) for m in months)
            for m in months:
                team_total_row[m] += cells.get(m, 0)
            sales_out.append(
                {
                    "sale": sale_name,
                    "cells": {m: round(cells.get(m, 0), 2) for m in months},
                    "total": round(row_total, 2),
                }
            )
        team_row_total = sum(team_total_row.values())
        for m in months:
            grand[m] += team_total_row[m]
        grand_total += team_row_total
        teams_out.append(
            {
                "teamLabel": team_label,
                "totalRow": {m: round(team_total_row[m], 2) for m in months},
                "totalRowSum": round(team_row_total, 2),
                "sales": sales_out,
            }
        )

    return {
        "months": months,
        "teams": teams_out,
        "grandTotalRow": {m: round(grand[m], 2) for m in months},
        "grandTotal": round(grand_total, 2),
    }


def _empty_gmv_day_bucket() -> dict[str, dict[str, float]]:
    return {key: {"count": 0.0, "gmv": 0.0} for key, *_ in BC02_GMV_GROUPS}


def _build_key_data_pivot(
    rows: list[dict[str, Any]],
    *,
    team_filter: str | None = None,
    scope_label: str = "Toàn công ty",
) -> dict[str, Any]:
    """BC02 — tab GMV: mỗi ngày một dòng, cặp số đơn + GMV theo loại nguồn."""
    by_date: dict[str, dict[str, Any]] = {}

    for r in rows:
        team_label = team_to_canonical(r.get("team"), r.get("team_pivot_label"))
        if team_filter and team_label != team_filter:
            continue
        ngay = _row_pay_date(r)
        if not ngay:
            continue
        dk = ngay.isoformat()
        gmv = float(r.get("gmv_rmb") or 0)
        type_label = bc02_type_from_row(r.get("loai"), r.get("loai_2"))
        cat_key = BC02_TYPE_TO_GMV_KEY.get(type_label, "other")

        day = by_date.setdefault(
            dk,
            {
                "date": dk,
                "totalOrders": 0,
                "totalGmv": 0.0,
                "categories": _empty_gmv_day_bucket(),
            },
        )
        day["totalOrders"] += 1
        day["totalGmv"] += gmv
        day["categories"][cat_key]["count"] += 1
        day["categories"][cat_key]["gmv"] += gmv

    sorted_dates = sorted(by_date.keys(), reverse=True)
    rows_out = []
    grand = {
        "totalOrders": 0,
        "totalGmv": 0.0,
        "categories": _empty_gmv_day_bucket(),
    }

    for dk in sorted_dates:
        day = by_date[dk]
        cats_rounded: dict[str, dict[str, float]] = {}
        for key, *_ in BC02_GMV_GROUPS:
            c = day["categories"][key]
            cats_rounded[key] = {
                "count": int(c["count"]),
                "gmv": round(c["gmv"], 2),
            }
            grand["categories"][key]["count"] += c["count"]
            grand["categories"][key]["gmv"] += c["gmv"]
        grand["totalOrders"] += day["totalOrders"]
        grand["totalGmv"] += day["totalGmv"]
        rows_out.append(
            {
                "date": dk,
                "totalOrders": day["totalOrders"],
                "totalGmv": round(day["totalGmv"], 2),
                "categories": cats_rounded,
            }
        )

    grand_cats = {
        key: {
            "count": int(grand["categories"][key]["count"]),
            "gmv": round(grand["categories"][key]["gmv"], 2),
        }
        for key, *_ in BC02_GMV_GROUPS
    }

    return {
        "scopeLabel": scope_label,
        "columnGroups": [
            {"key": key, "label": label, "countLabel": count_lbl, "gmvLabel": gmv_lbl}
            for key, label, count_lbl, gmv_lbl in BC02_GMV_GROUPS
        ],
        "rows": rows_out,
        "grandTotal": {
            "totalOrders": grand["totalOrders"],
            "totalGmv": round(grand["totalGmv"], 2),
            "categories": grand_cats,
        },
    }


def _resolve_team(sb, sale_crm_name: str | None, created_by: str | None) -> str:
    if sale_crm_name:
        res = (
            sb.table("nhan_su_sale")
            .select("team")
            .eq("crm_name", sale_crm_name.strip())
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("team"):
            return str(res.data[0]["team"])
    if created_by:
        res = (
            sb.table("nhan_su_sale")
            .select("team")
            .ilike("email", created_by.strip())
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("team"):
            return str(res.data[0]["team"])
    return ""


def _resolve_payment_date(sb, order_row: dict[str, Any]) -> date:
    order_id = order_row.get("id")
    if order_id:
        try:
            gd = (
                sb.table("giao_dich")
                .select("thoi_gian_giao_dich")
                .eq("don_hang_id", order_id)
                .order("thoi_gian_giao_dich", desc=True)
                .limit(1)
                .execute()
            )
            if gd.data:
                d = _parse_date(gd.data[0].get("thoi_gian_giao_dich"))
                if d:
                    return d
        except Exception:
            pass
    for key in ("m3_approved_at", "updated_at", "created_at"):
        d = _parse_date(order_row.get(key))
        if d:
            return d
    return datetime.now(timezone.utc).date()


def _format_sdt(kh: dict[str, Any] | None) -> str:
    k = kh or {}
    sdt = k.get("so_dien_thoai") or ""
    ma_vung = (k.get("ma_vung") or "+84").strip()
    if sdt and not str(sdt).startswith("+"):
        return f"{ma_vung} {sdt}"
    return str(sdt)


def _info_code_from_ma(ma_don: str | None) -> str:
    ma = (ma_don or "").strip()
    return f"Thanh toan {ma}" if ma else ""


_SUPABASE_PAGE = 1000
LEDGER_TABLE_PAGE = 60

LEDGER_TYPE_FIXX_MAP: dict[str, str] = {
    "广告": "广告",
    "转介绍": "转介绍",
    "续费": "续费",
    "公海": "公海",
    "KOC": "KOC",
    "Lives": "Lives",
    "Booth": "Offline",
    "Refer": "转介绍",
    "Resell": "续费",
    "GD": "公海",
    "Offline": "Offline",
    "Other": "Other",
    "PNS": "广告",
    "Partnership": "广告",
    "FB": "广告",
    "KFT": "Other",
    "KET": "Other",
    "Livestream": "Lives",
    "Bán mới": "广告",
    "Khách giới thiệu": "转介绍",
    "Gia hạn": "续费",
    "Kho chung": "公海",
    "Nguồn khác": "Other",
}

LEDGER_AD_LOAI2_OWN_COLUMN = frozenset({"KOC", "Lives", "Livestream", "Offline", "Booth", "KFT", "KET"})

LEDGER_TYPE_FIXX_ORDER: list[str] = [
    "Lives",
    "Offline",
    "Other",
    "公海",
    "广告",
    "续费",
    "转介绍",
    "KOC",
]


def _apply_ledger_type_fixx(type_goc: str) -> str:
    key = (type_goc or "").strip()
    if not key:
        return "Other"
    if key in LEDGER_TYPE_FIXX_MAP:
        return LEDGER_TYPE_FIXX_MAP[key]
    lower = key.lower()
    for from_k, to_v in LEDGER_TYPE_FIXX_MAP.items():
        if from_k.lower() == lower:
            return to_v
    return "Other"


def _ledger_type_goc(loai: str | None, loai2: str | None) -> str:
    l1 = (loai or "").strip()
    l2 = (loai2 or "").strip()
    l1_fixed = _apply_ledger_type_fixx(l1)
    if l1_fixed == "广告" and l2:
        if l2 in LEDGER_AD_LOAI2_OWN_COLUMN:
            return l2
        return l1 or l2
    return l1 or l2


def ledger_type_fixx_from_row(loai: str | None, loai2: str | None) -> str:
    fixed = _apply_ledger_type_fixx(_ledger_type_goc(loai, loai2))
    if fixed in LEDGER_TYPE_FIXX_ORDER:
        return fixed
    return "Other"


def _filter_rows_by_team(
    rows: list[dict[str, Any]], team_filter: str | None
) -> list[dict[str, Any]]:
    if not team_filter:
        return rows
    want = team_filter.strip()
    return [
        r
        for r in rows
        if team_to_canonical(r.get("team"), r.get("team_pivot_label")) == want
    ]


def _ledger_query(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    count: str | None = None,
):
    """Lọc theo Pay Time (pay_time) — khớp pivot Excel Hiếu, không dùng ngay_tien_ve."""
    if count:
        q = sb.table("so_doanh_thu").select(select, count=count)
    else:
        q = sb.table("so_doanh_thu").select(select)
    q = q.order("pay_time", desc=True).order("created_at", desc=True)
    if from_date:
        q = q.gte("pay_time", f"{from_date[:10]}T00:00:00")
    if to_date:
        q = q.lte("pay_time", f"{to_date[:10]}T23:59:59")
    if loai_nhap in ("tu_dong", "tay"):
        q = q.eq("loai_nhap", loai_nhap)
    return q


def _dedupe_rows_by_id(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """PostgREST offset pagination can repeat rows when pay_time ties — keep first."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        rid = row.get("id")
        if rid:
            key = str(rid)
            if key in seen:
                continue
            seen.add(key)
        out.append(row)
    return out


def _count_so_doanh_thu(
    sb,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    team_filter: str | None = None,
) -> int:
    if team_filter:
        rows = _fetch_so_doanh_thu(
            sb,
            "id, team, team_pivot_label",
            from_date=from_date,
            to_date=to_date,
            loai_nhap=loai_nhap,
        )
        return len(_filter_rows_by_team(rows, team_filter))
    res = _ledger_query(
        sb,
        "id",
        from_date=from_date,
        to_date=to_date,
        loai_nhap=loai_nhap,
        count="exact",
    ).limit(0).execute()
    return int(res.count or 0)


def _fetch_so_doanh_thu_page(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
    limit: int = LEDGER_TABLE_PAGE,
    offset: int = 0,
) -> list[dict[str, Any]]:
    res = (
        _ledger_query(sb, select, from_date=from_date, to_date=to_date, loai_nhap=loai_nhap)
        .range(offset, offset + max(limit, 1) - 1)
        .execute()
    )
    return res.data or []


def _build_ledger_summary(
    rows: list[dict[str, Any]], *, team_filter: str | None = None
) -> dict[str, Any]:
    if team_filter:
        rows = _filter_rows_by_team(rows, team_filter)
    buckets = {k: {"gmvVnd": 0, "count": 0} for k in LEDGER_TYPE_FIXX_ORDER}
    total_gmv = 0
    for r in rows:
        vnd = int(r.get("so_tien_vnd") or 0)
        total_gmv += vnd
        key = ledger_type_fixx_from_row(r.get("loai"), r.get("loai_2"))
        buckets[key]["gmvVnd"] += vnd
        buckets[key]["count"] += 1
    by_source = [
        {"source": k, "gmvVnd": buckets[k]["gmvVnd"], "count": buckets[k]["count"]}
        for k in LEDGER_TYPE_FIXX_ORDER
    ]
    return {"totalGmvVnd": total_gmv, "orderCount": len(rows), "bySource": by_source}


def _fetch_ledger_summary_rows(
    sb,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
) -> list[dict[str, Any]]:
    """Chỉ cột cần cho thẻ tổng hợp — paginate, không enrich."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        chunk = _fetch_so_doanh_thu_page(
            sb,
            "so_tien_vnd, loai, loai_2, team, team_pivot_label",
            from_date=from_date,
            to_date=to_date,
            loai_nhap=loai_nhap,
            limit=_SUPABASE_PAGE,
            offset=offset,
        )
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < _SUPABASE_PAGE:
            break
        offset += _SUPABASE_PAGE
    return rows


def _fetch_so_doanh_thu(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
) -> list[dict[str, Any]]:
    """PostgREST trả tối đa 1000 dòng/lần — paginate hết kết quả."""
    select_cols = select if "id" in select else f"id, {select}"
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        q = sb.table("so_doanh_thu").select(select_cols).order("pay_time", desc=True).order("created_at", desc=True)
        if from_date:
            q = q.gte("pay_time", f"{from_date[:10]}T00:00:00")
        if to_date:
            q = q.lte("pay_time", f"{to_date[:10]}T23:59:59")
        if loai_nhap in ("tu_dong", "tay"):
            q = q.eq("loai_nhap", loai_nhap)
        res = q.range(offset, offset + _SUPABASE_PAGE - 1).execute()
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < _SUPABASE_PAGE:
            break
        offset += _SUPABASE_PAGE
    return _dedupe_rows_by_id(rows)


def _enrich_ledger_rows(sb, db_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    order_ids = [r["don_hang_id"] for r in db_rows if r.get("don_hang_id")]
    order_map: dict[str, dict[str, Any]] = {}
    if order_ids:
        try:
            res = (
                sb.table("don_hang")
                .select("id, info_code, ma_don_hang, crm_order_id")
                .in_("id", order_ids)
                .execute()
            )
            order_map = {str(r["id"]): r for r in (res.data or [])}
        except Exception as exc:
            print(f"[revenue] enrich don_hang failed: {exc}")

    out: list[dict[str, Any]] = []
    for r in db_rows:
        ledger = _row_to_ledger(r)
        oid = r.get("don_hang_id")
        if oid and str(oid) in order_map:
            o = order_map[str(oid)]
            ledger["infoCode"] = o.get("info_code") or _info_code_from_ma(
                o.get("ma_don_hang") or ledger.get("maDonHang")
            )
            if not ledger.get("crmOrderId"):
                ledger["crmOrderId"] = o.get("crm_order_id") or ""
            if not ledger.get("maDonHang"):
                ledger["maDonHang"] = o.get("ma_don_hang") or ""
        else:
            ledger["infoCode"] = _info_code_from_ma(ledger.get("maDonHang"))
        out.append(ledger)
    return out


def _row_to_ledger(row: dict[str, Any]) -> dict[str, Any]:
    ngay = row.get("ngay_tien_ve")
    ngay_str = ngay[:10] if isinstance(ngay, str) else (ngay.isoformat() if ngay else "")
    pay = row.get("pay_time")
    pay_str = pay[:10] if isinstance(pay, str) else ""
    if not pay_str and pay and hasattr(pay, "isoformat"):
        pay_str = pay.isoformat()[:10]
    return {
        "id": row["id"],
        "ngayTienVe": ngay_str,
        "payTime": pay_str or ngay_str,
        "tenKhach": row.get("ten_khach") or "",
        "sdt": row.get("sdt") or "",
        "uid": row.get("uid") or "",
        "goiHoc": row.get("goi_hoc") or "",
        "soTienVnd": int(row.get("so_tien_vnd") or 0),
        "gmvRmb": float(row.get("gmv_rmb") or 0),
        "tyGiaVndRmb": float(row.get("ty_gia_vnd_rmb") or 3700),
        "paymentMethod": row.get("payment_method") or "",
        "loai": row.get("loai") or "",
        "loai2": row.get("loai_2") or "",
        "saleCrmName": row.get("sale_crm_name") or "",
        "team": row.get("team") or "",
        "teamPivotLabel": row.get("team_pivot_label") or "",
        "note": row.get("note") or "",
        "note2": row.get("note2") or "",
        "loaiNhap": row.get("loai_nhap") or "tay",
        "donHangId": row.get("don_hang_id"),
        "maDonHang": row.get("ma_don_hang") or "",
        "crmOrderId": row.get("crm_order_id") or "",
        "infoCode": _info_code_from_ma(row.get("ma_don_hang")),
        "createdByEmail": row.get("created_by_email") or "",
        "updatedByEmail": row.get("updated_by_email") or "",
        "createdAt": row.get("created_at") or "",
        "updatedAt": row.get("updated_at") or "",
    }


def _month_key(d: date) -> str:
    return f"{d.year}/{d.month}"


_PAYMENT_LINE_METHOD_LABELS: dict[str, str] = {
    "qr": "QR",
    "cash": "Cash",
    "card": "Card",
    "installment": "Installment",
}


def _resolve_sale_from_pr_email(sb, pr: dict[str, Any]) -> tuple[str, str]:
    """Return (sale_crm_name, sale_email) from payment_requests.sale_email."""
    email = str(pr.get("sale_email") or "").strip().lower()
    if not email:
        return "", ""
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("crm_name, email")
            .ilike("email", email)
            .limit(1)
            .execute()
        )
        if res.data:
            return str(res.data[0].get("crm_name") or "").strip(), email
    except Exception:
        pass
    return "", email


def _resolve_payment_date_from_pr(sb, pr_id: str) -> date:
    try:
        res = (
            sb.table("payment_lines")
            .select("paid_at, created_at")
            .eq("payment_request_id", pr_id)
            .eq("status", "paid")
            .order("paid_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            for key in ("paid_at", "created_at"):
                d = _parse_date(res.data[0].get(key))
                if d:
                    return d
    except Exception:
        pass
    return datetime.now(timezone.utc).date()


def _resolve_payment_method_from_pr(sb, pr_id: str) -> str:
    try:
        res = (
            sb.table("payment_lines")
            .select("method")
            .eq("payment_request_id", pr_id)
            .eq("status", "paid")
            .order("paid_at", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            method = str(res.data[0].get("method") or "").strip().lower()
            return _PAYMENT_LINE_METHOD_LABELS.get(method, method.upper() if method else "")
    except Exception:
        pass
    return ""


def sync_ledger_from_ar_course(
    sb,
    ar_id: str,
    course_code: str,
    actor_email: str = "b3-activation@auto",
) -> str | None:
    """Tạo dòng Sổ khi B3 gắn CRM order_id lên course. Idempotent theo crm_order_id / course code."""
    try:
        ar_res = (
            sb.table("active_requests")
            .select("*")
            .eq("id", ar_id)
            .limit(1)
            .execute()
        )
        if not ar_res.data:
            return None
        ar_row = ar_res.data[0]

        uid_block: dict[str, Any] | None = None
        course: dict[str, Any] | None = None
        for ub in ar_row.get("uids_data") or []:
            if not isinstance(ub, dict):
                continue
            for c in ub.get("courses") or []:
                if isinstance(c, dict) and c.get("code") == course_code:
                    uid_block = ub
                    course = c
                    break
            if course:
                break
        if not course:
            return None

        order_id = str(course.get("order_id") or course.get("orderId") or "").strip()
        if not order_id:
            return None

        for field, val in (("crm_order_id", order_id), ("ma_don_hang", course_code)):
            existing = (
                sb.table("so_doanh_thu")
                .select("id")
                .eq("loai_nhap", "tu_dong")
                .eq(field, val)
                .limit(1)
                .execute()
            )
            if existing.data:
                return str(existing.data[0]["id"])

        pr_id = str(ar_row.get("pr_id") or "").strip()
        pr: dict[str, Any] | None = None
        if pr_id:
            pr_res = (
                sb.table("payment_requests")
                .select("*")
                .eq("id", pr_id)
                .limit(1)
                .execute()
            )
            pr = pr_res.data[0] if pr_res.data else None

        vnd = int(float(course.get("amount") or 0))
        rate = DEFAULT_TY_GIA
        sale, sale_email = _resolve_sale_from_pr_email(sb, pr or {})
        team = _resolve_team(sb, sale or None, sale_email or actor_email)

        if pr_id:
            ngay = _resolve_payment_date_from_pr(sb, pr_id)
            payment_method = _resolve_payment_method_from_pr(sb, pr_id)
        else:
            ngay = datetime.now(timezone.utc).date()
            payment_method = ""

        ten_khach = str(ar_row.get("customer_name") or "").strip()
        if not ten_khach and pr:
            ten_khach = str(pr.get("name") or "").strip()

        uid = str((uid_block or {}).get("uid") or (pr.get("uid") if pr else "") or "")
        phone = str((uid_block or {}).get("phone") or (pr.get("phone") if pr else "") or "")
        goi_hoc = str(course.get("name") or course_code).strip()

        payload = {
            "ngay_tien_ve": ngay.isoformat(),
            "pay_time": f"{ngay.isoformat()}T00:00:00",
            "ten_khach": ten_khach,
            "sdt": phone,
            "uid": uid,
            "goi_hoc": goi_hoc,
            "so_tien_vnd": vnd,
            "gmv_rmb": vnd_to_rmb(vnd, rate),
            "ty_gia_vnd_rmb": float(rate),
            "payment_method": payment_method or None,
            "sale_crm_name": sale or None,
            "team": team or None,
            "team_pivot_label": team_to_pivot_label(team),
            "loai_nhap": "tu_dong",
            "don_hang_id": None,
            "ma_don_hang": course_code,
            "crm_order_id": order_id,
            "note": f"AR {ar_id}",
            "created_by_email": actor_email,
            "updated_by_email": actor_email,
            "is_test": bool(pr.get("is_test")) if pr else False,
        }
        ins = sb.table("so_doanh_thu").insert(payload).execute()
        if ins.data:
            return str(ins.data[0]["id"])
    except Exception as exc:
        print(f"[revenue] sync B3 course → Sổ thất bại (non-fatal): {exc}")
    return None


def backfill_ledger_from_active_requests(sb, actor_email: str = "backfill@b3") -> dict[str, int]:
    """Backfill Sổ từ các course đã có order_id trong active_requests."""
    created = 0
    skipped = 0
    failed = 0
    try:
        res = sb.table("active_requests").select("id, uids_data").execute()
    except Exception as exc:
        print(f"[revenue] backfill B3 read AR failed: {exc}")
        return {"created": 0, "skipped": 0, "failed": 0}

    for ar_row in res.data or []:
        ar_id = str(ar_row.get("id") or "")
        for uid_block in ar_row.get("uids_data") or []:
            if not isinstance(uid_block, dict):
                continue
            for course in uid_block.get("courses") or []:
                if not isinstance(course, dict):
                    continue
                code = str(course.get("code") or "").strip()
                order_id = str(course.get("order_id") or course.get("orderId") or "").strip()
                if not code or not order_id:
                    continue
                before = (
                    sb.table("so_doanh_thu")
                    .select("id")
                    .eq("loai_nhap", "tu_dong")
                    .eq("crm_order_id", order_id)
                    .limit(1)
                    .execute()
                )
                had = bool(before.data)
                rid = sync_ledger_from_ar_course(sb, ar_id, code, actor_email)
                if rid and not had:
                    created += 1
                elif rid or had:
                    skipped += 1
                else:
                    failed += 1

    return {"created": created, "skipped": skipped, "failed": failed}


def sync_ledger_for_pr(
    sb,
    pr_id: str,
    actor_email: str = "pr-paid@auto",
) -> dict[str, int]:
    """Khi PR đủ tiền — sync mọi course có Order ID trong AR gắn PR (idempotent)."""
    created = 0
    skipped = 0
    failed = 0
    pr_id = str(pr_id or "").strip()
    if not pr_id:
        return {"created": 0, "skipped": 0, "failed": 0}
    try:
        ar_res = (
            sb.table("active_requests")
            .select("id, uids_data")
            .eq("pr_id", pr_id)
            .execute()
        )
    except Exception as exc:
        print(f"[revenue] sync PR {pr_id} read AR failed: {exc}")
        return {"created": 0, "skipped": 0, "failed": 0}

    for ar_row in ar_res.data or []:
        ar_id = str(ar_row.get("id") or "")
        for uid_block in ar_row.get("uids_data") or []:
            if not isinstance(uid_block, dict):
                continue
            for course in uid_block.get("courses") or []:
                if not isinstance(course, dict):
                    continue
                code = str(course.get("code") or "").strip()
                order_id = str(course.get("order_id") or course.get("orderId") or "").strip()
                if not code or not order_id:
                    continue
                before = (
                    sb.table("so_doanh_thu")
                    .select("id")
                    .eq("loai_nhap", "tu_dong")
                    .eq("crm_order_id", order_id)
                    .limit(1)
                    .execute()
                )
                had = bool(before.data)
                rid = sync_ledger_from_ar_course(sb, ar_id, code, actor_email)
                if rid and not had:
                    created += 1
                elif rid or had:
                    skipped += 1
                else:
                    failed += 1

    if created:
        print(f"[revenue] PR {pr_id} → Sổ: created={created}, skipped={skipped}, failed={failed}")
    return {"created": created, "skipped": skipped, "failed": failed}


def sync_ledger_from_m3_order(sb, don_hang_id: str, actor_email: str) -> str | None:
    """Tạo dòng Sổ từ đơn vừa M3 approve. Trả về id dòng hoặc None nếu đã có."""
    try:
        existing = (
            sb.table("so_doanh_thu")
            .select("id")
            .eq("don_hang_id", don_hang_id)
            .eq("loai_nhap", "tu_dong")
            .limit(1)
            .execute()
        )
        if existing.data:
            return str(existing.data[0]["id"])

        order_res = (
            sb.table("don_hang")
            .select("*")
            .eq("id", don_hang_id)
            .limit(1)
            .execute()
        )
        if not order_res.data:
            return None
        row = order_res.data[0]
        kh_res = (
            sb.table("khach_hang")
            .select("*")
            .eq("id", row.get("khach_hang_id"))
            .limit(1)
            .execute()
        )
        kh = kh_res.data[0] if kh_res.data else {}

        vnd = int(row.get("so_tien_can_thu") or 0)
        rate = DEFAULT_TY_GIA
        sale = (row.get("sale_crm_name") or "").strip()
        team = _resolve_team(sb, sale, row.get("created_by"))
        ngay = _resolve_payment_date(sb, row)

        payload = {
            "ngay_tien_ve": ngay.isoformat(),
            "pay_time": f"{ngay.isoformat()}T00:00:00",
            "ten_khach": kh.get("ho_ten") or "",
            "sdt": _format_sdt(kh),
            "uid": str(kh.get("crm_uid") or ""),
            "goi_hoc": row.get("goi_hoc") or "",
            "so_tien_vnd": vnd,
            "gmv_rmb": vnd_to_rmb(vnd, rate),
            "ty_gia_vnd_rmb": float(rate),
            "loai": row.get("nguon_doanh_thu") or "",
            "loai_2": row.get("lead_kenh") or "",
            "sale_crm_name": sale,
            "team": team,
            "team_pivot_label": team_to_pivot_label(team),
            "loai_nhap": "tu_dong",
            "don_hang_id": don_hang_id,
            "ma_don_hang": row.get("ma_don_hang"),
            "crm_order_id": row.get("crm_order_id"),
            "created_by_email": actor_email,
            "updated_by_email": actor_email,
            "is_test": _is_test_email(actor_email),
        }
        ins = sb.table("so_doanh_thu").insert(payload).execute()
        if ins.data:
            return str(ins.data[0]["id"])
    except Exception as exc:
        print(f"[revenue] sync M3 → Sổ thất bại (non-fatal): {exc}")
    return None


class LedgerCreateBody(BaseModel):
    ngayTienVe: str
    tenKhach: str = ""
    sdt: str = ""
    uid: str = ""
    goiHoc: str = ""
    soTienVnd: int = 0
    gmvRmb: float | None = None
    tyGiaVndRmb: float = 3700
    paymentMethod: str = ""
    loai: str = ""
    loai2: str = ""
    saleCrmName: str = ""
    team: str = ""
    note: str = ""
    note2: str = ""


class LedgerPatchBody(BaseModel):
    ngayTienVe: str | None = None
    tenKhach: str | None = None
    sdt: str | None = None
    uid: str | None = None
    goiHoc: str | None = None
    soTienVnd: int | None = None
    gmvRmb: float | None = None
    tyGiaVndRmb: float | None = None
    paymentMethod: str | None = None
    loai: str | None = None
    loai2: str | None = None
    saleCrmName: str | None = None
    team: str | None = None
    note: str | None = None
    note2: str | None = None


class GsheetSyncBody(BaseModel):
    dryRun: bool = False
    limit: int = 0
    spreadsheetId: str | None = None
    tabs: list[str] | None = None


LEDGER_PATCH_MAP = {
    "ngayTienVe": "ngay_tien_ve",
    "tenKhach": "ten_khach",
    "sdt": "sdt",
    "uid": "uid",
    "goiHoc": "goi_hoc",
    "soTienVnd": "so_tien_vnd",
    "gmvRmb": "gmv_rmb",
    "tyGiaVndRmb": "ty_gia_vnd_rmb",
    "paymentMethod": "payment_method",
    "loai": "loai",
    "loai2": "loai_2",
    "saleCrmName": "sale_crm_name",
    "team": "team",
    "note": "note",
    "note2": "note2",
}


def _write_audit(sb, row_id: str, actor, action: str, field: str | None, old_v, new_v) -> None:
    try:
        sb.table("so_doanh_thu_audit").insert(
            {
                "so_doanh_thu_id": row_id,
                "actor_email": actor.email,
                "actor_role": actor.role,
                "action": action,
                "field": field,
                "old_value": old_v,
                "new_value": new_v,
            }
        ).execute()
    except Exception as exc:
        print(f"[revenue] audit write failed: {exc}")


def register_revenue_routes(app, get_supabase) -> None:
    def _sb():
        sb = get_supabase()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        return sb

    @app.get("/revenue/ledger")
    def list_ledger(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        loai_nhap: str | None = Query(None),
        team_filter: str | None = Query(None, alias="team"),
        limit: int = Query(LEDGER_TABLE_PAGE, ge=1, le=200),
        offset: int = Query(0, ge=0),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            team = (team_filter or "").strip() or None
            if team:
                all_rows = _fetch_so_doanh_thu(
                    sb,
                    "*",
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                )
                filtered = _filter_rows_by_team(all_rows, team)
                total = len(filtered)
                page_rows = filtered[offset : offset + limit]
                rows = _enrich_ledger_rows(sb, page_rows)
            else:
                total = _count_so_doanh_thu(
                    sb,
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                )
                db_rows = _fetch_so_doanh_thu_page(
                    sb,
                    "*",
                    from_date=from_date or None,
                    to_date=to_date or None,
                    loai_nhap=loai_nhap,
                    limit=limit,
                    offset=offset,
                )
                rows = _enrich_ledger_rows(sb, db_rows)
            return {
                "rows": rows,
                "count": total,
                "offset": offset,
                "limit": limit,
                "hasMore": offset + len(rows) < total,
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi đọc Sổ doanh thu: {exc}") from exc

    @app.get("/revenue/ledger/summary")
    def ledger_summary(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        loai_nhap: str | None = Query(None),
        team_filter: str | None = Query(None, alias="team"),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            team = (team_filter or "").strip() or None
            summary_rows = _fetch_ledger_summary_rows(
                sb,
                from_date=from_date or None,
                to_date=to_date or None,
                loai_nhap=loai_nhap,
            )
            return _build_ledger_summary(summary_rows, team_filter=team)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi tổng hợp Sổ: {exc}") from exc

    @app.post("/revenue/ledger")
    def create_ledger(body: LedgerCreateBody, authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        ngay = _parse_date(body.ngayTienVe)
        if not ngay:
            raise HTTPException(400, "ngayTienVe không hợp lệ")
        rate = Decimal(str(body.tyGiaVndRmb or 3700))
        gmv = body.gmvRmb
        if gmv is None:
            gmv = vnd_to_rmb(body.soTienVnd, rate)
        team = (body.team or "").strip()
        payload = {
            "ngay_tien_ve": ngay.isoformat(),
            "ten_khach": body.tenKhach.strip(),
            "sdt": body.sdt.strip(),
            "uid": body.uid.strip(),
            "goi_hoc": body.goiHoc.strip(),
            "so_tien_vnd": int(body.soTienVnd or 0),
            "gmv_rmb": gmv,
            "ty_gia_vnd_rmb": float(rate),
            "payment_method": body.paymentMethod.strip() or None,
            "loai": body.loai.strip() or None,
            "loai_2": body.loai2.strip() or None,
            "sale_crm_name": body.saleCrmName.strip() or None,
            "team": team or None,
            "team_pivot_label": team_to_pivot_label(team) if team else None,
            "note": body.note.strip() or None,
            "note2": body.note2.strip() or None,
            "loai_nhap": "tay",
            "created_by_email": actor.email,
            "updated_by_email": actor.email,
            "is_test": _is_test_email(actor.email),
        }
        try:
            res = sb.table("so_doanh_thu").insert(payload).execute()
            if not res.data:
                raise HTTPException(500, "Không tạo được dòng")
            row = res.data[0]
            _write_audit(sb, row["id"], actor, "create", None, None, payload)
            return _row_to_ledger(row)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi tạo dòng Sổ: {exc}") from exc

    @app.patch("/revenue/ledger/{row_id}")
    def patch_ledger(
        row_id: str,
        body: LedgerPatchBody,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            cur = sb.table("so_doanh_thu").select("*").eq("id", row_id).limit(1).execute()
            if not cur.data:
                raise HTTPException(404, "Không tìm thấy dòng")
            old_row = cur.data[0]
            patch: dict[str, Any] = {"updated_by_email": actor.email}
            body_dict = body.model_dump(exclude_unset=True)
            for api_key, db_key in LEDGER_PATCH_MAP.items():
                if api_key not in body_dict:
                    continue
                val = body_dict[api_key]
                if db_key == "ngay_tien_ve":
                    d = _parse_date(val)
                    if not d:
                        raise HTTPException(400, "ngayTienVe không hợp lệ")
                    val = d.isoformat()
                if db_key == "team" and val is not None:
                    patch["team_pivot_label"] = team_to_pivot_label(str(val))
                patch[db_key] = val
                if old_row.get(db_key) != val:
                    _write_audit(
                        sb,
                        row_id,
                        actor,
                        "update",
                        db_key,
                        old_row.get(db_key),
                        val,
                    )
            if len(patch) <= 1:
                raise HTTPException(400, "Không có trường nào để cập nhật")
            if "so_tien_vnd" in patch and "gmv_rmb" not in body_dict:
                rate = Decimal(str(patch.get("ty_gia_vnd_rmb") or old_row.get("ty_gia_vnd_rmb") or 3700))
                patch["gmv_rmb"] = vnd_to_rmb(int(patch["so_tien_vnd"]), rate)
            res = sb.table("so_doanh_thu").update(patch).eq("id", row_id).execute()
            if not res.data:
                raise HTTPException(404, "Cập nhật thất bại")
            return _row_to_ledger(res.data[0])
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi cập nhật Sổ: {exc}") from exc

    @app.delete("/revenue/ledger/{row_id}")
    def delete_ledger(row_id: str, authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            cur = sb.table("so_doanh_thu").select("*").eq("id", row_id).limit(1).execute()
            if not cur.data:
                raise HTTPException(404, "Không tìm thấy dòng")
            row = cur.data[0]
            if row.get("loai_nhap") != "tay":
                raise HTTPException(403, "Chỉ được xóa dòng điền tay")
            sb.table("so_doanh_thu").delete().eq("id", row_id).execute()
            return {"ok": True, "id": row_id}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi xóa dòng Sổ: {exc}") from exc

    @app.get("/revenue/pivot/sales-performance")
    def revenue_pivot_sales_performance(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        team_filter: str | None = Query(None, alias="team"),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            rows = _fetch_so_doanh_thu(
                sb,
                "pay_time, ngay_tien_ve, gmv_rmb, sale_crm_name, team, team_pivot_label",
                from_date=from_date,
                to_date=to_date,
            )
            return _build_sales_performance_pivot(rows, team_filter=team_filter or None)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi BC01 Sales Performance: {exc}") from exc

    @app.get("/revenue/pivot/key-data")
    def revenue_pivot_key_data(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        team_filter: str | None = Query(None, alias="team"),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            rows = _fetch_so_doanh_thu(
                sb,
                "pay_time, ngay_tien_ve, gmv_rmb, loai, loai_2, team, team_pivot_label",
                from_date=from_date,
                to_date=to_date,
            )
            scope = (team_filter or "").strip() or "Toàn công ty"
            return _build_key_data_pivot(rows, team_filter=team_filter or None, scope_label=scope)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi BC02 Key Data: {exc}") from exc

    @app.get("/revenue/pivot")
    def revenue_pivot(
        authorization: str | None = Header(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        team_filter: str | None = Query(None, alias="team"),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            rows = _fetch_so_doanh_thu(
                sb,
                "ngay_tien_ve, gmv_rmb, sale_crm_name, team, team_pivot_label",
                from_date=from_date,
                to_date=to_date,
            )

            month_set: set[str] = set()
            grouped: dict[str, dict[str, dict[str, float]]] = {}

            for r in rows:
                ngay = _parse_date(r.get("ngay_tien_ve"))
                if not ngay:
                    continue
                mk = _month_key(ngay)
                month_set.add(mk)
                team_label = (r.get("team_pivot_label") or team_to_pivot_label(r.get("team")) or "Khác").strip()
                if team_filter and team_label != team_filter and (r.get("team") or "") != team_filter:
                    continue
                sale = (r.get("sale_crm_name") or "(Chưa gán sale)").strip()
                gmv = float(r.get("gmv_rmb") or 0)
                grouped.setdefault(team_label, {}).setdefault(sale, {})
                grouped[team_label][sale][mk] = grouped[team_label][sale].get(mk, 0) + gmv

            months = sorted(month_set, key=lambda m: (int(m.split("/")[0]), int(m.split("/")[1])))

            teams_out = []
            grand: dict[str, float] = {m: 0.0 for m in months}
            grand_total = 0.0

            for team_label in sorted(grouped.keys()):
                sales_map = grouped[team_label]
                team_total_row: dict[str, float] = {m: 0.0 for m in months}
                sales_out = []
                for sale_name in sorted(sales_map.keys()):
                    cells = sales_map[sale_name]
                    row_total = sum(cells.get(m, 0) for m in months)
                    for m in months:
                        team_total_row[m] += cells.get(m, 0)
                    sales_out.append(
                        {
                            "sale": sale_name,
                            "cells": {m: round(cells.get(m, 0), 2) for m in months},
                            "total": round(row_total, 2),
                        }
                    )
                team_row_total = sum(team_total_row.values())
                for m in months:
                    grand[m] += team_total_row[m]
                grand_total += team_row_total
                teams_out.append(
                    {
                        "teamLabel": team_label,
                        "totalRow": {m: round(team_total_row[m], 2) for m in months},
                        "totalRowSum": round(team_row_total, 2),
                        "sales": sales_out,
                    }
                )

            return {
                "months": months,
                "teams": teams_out,
                "grandTotalRow": {m: round(grand[m], 2) for m in months},
                "grandTotal": round(grand_total, 2),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi pivot Doanh thu Sale: {exc}") from exc

    @app.post("/revenue/ledger/backfill-b3")
    def backfill_ledger_b3(authorization: str | None = Header(None)):
        """Tạo dòng Sổ thiếu từ active_requests đã có Order ID (ops)."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        stats = backfill_ledger_from_active_requests(sb, actor.email or "backfill@b3")
        return {"ok": True, **stats}

    @app.post("/revenue/ledger/sync-gsheet")
    def sync_ledger_from_gsheet(body: GsheetSyncBody, authorization: str | None = Header(None)):
        """Import tab SM Hanoi + HCM REV từ All File Thu Hiền → Sổ (dedupe)."""
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            from gsheet_ledger_import import DEFAULT_SHEET_TABS, sync_gsheet_to_ledger

            tabs = tuple(body.tabs) if body.tabs else DEFAULT_SHEET_TABS
            result = sync_gsheet_to_ledger(
                sb,
                spreadsheet_id=body.spreadsheetId,
                tabs=tabs,
                limit=body.limit or 0,
                dry_run=body.dryRun,
                actor_email=actor.email or "import:gsheet",
                sb_factory=_sb,
            )
            return result
        except FileNotFoundError as exc:
            raise HTTPException(400, str(exc)) from exc
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi sync Google Sheet: {exc}") from exc
