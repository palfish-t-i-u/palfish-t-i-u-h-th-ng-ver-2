"""Dashboard routes — Module 6: Thống kê & biểu đồ từ crm_sales_data + don_hang.

CRM export là báo cáo aggregate theo Sale/ngày (không phải từng đơn):
  L1 ← 总Leads数   L3 ← 邀约数   L4 ← 完课数   L8 ← 签单数
  GMV ← 业绩(元)   Đã thu ← don_hang.tien_ve + so_tien_can_thu
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, Query

# Cột CRM (key trong raw_data JSONB)
_L1_KEYS = ("总Leads数", "Total leads", "总leads数", "Leads mới")
_L3_KEYS = ("邀约数", "Invitation Number")
_L4_KEYS = ("完课数", "Completed Class Number")
_L8_KEYS = ("签单数", "Order")
_GMV_KEYS = ("业绩(元)", "GMV", "业绩")
_L2_PROXY_KEYS = ("接通总数", "Total Connections")  # cho tỷ lệ L2/L1

_SKIP_SALE_NAMES = frozenset(
    s.lower() for s in ("Sales", "汇总", "Total", "合计", "Department", "")
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_range(range_key: str, start: str | None, end: str | None) -> tuple[str, str]:
    today = date.today()
    if range_key == "today":
        return today.isoformat(), today.isoformat()
    if range_key == "week":
        monday = today - timedelta(days=today.weekday())
        return monday.isoformat(), today.isoformat()
    if range_key == "month":
        return today.replace(day=1).isoformat(), today.isoformat()
    if range_key == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1).isoformat(), last_prev.isoformat()
    if range_key == "custom" and start and end:
        return start, end
    return today.replace(day=1).isoformat(), today.isoformat()


def _safe(val: Any, default=0):
    return val if val is not None else default


def _parse_metric(val: Any) -> int:
    if val is None:
        return 0
    s = str(val).strip().replace(",", "").replace(" ", "")
    s = re.sub(r"[^0-9.\-]", "", s)
    if not s or s in (".", "-"):
        return 0
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return 0


def _raw_get(raw: dict, keys: tuple[str, ...]) -> Any:
    for k in keys:
        if k in raw and raw[k] not in (None, ""):
            return raw[k]
    return None


def _sale_label(row: dict) -> str:
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    return str(row.get("sale_name") or raw.get("销售") or "—").strip()


def _team_label(row: dict) -> str:
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    return str(row.get("team") or raw.get("部门") or "—").strip()


def _is_detail_sale_row(row: dict) -> bool:
    """Bỏ header + dòng 汇总 (tránh cộng trùng với sale cá nhân)."""
    sale = _sale_label(row).lower()
    return sale not in _SKIP_SALE_NAMES


def _l_metrics(raw: dict, amount_fallback: Any = None) -> dict[str, int]:
    gmv = _parse_metric(_raw_get(raw, _GMV_KEYS))
    if not gmv and amount_fallback is not None:
        gmv = _parse_metric(amount_fallback)
    return {
        "l1": _parse_metric(_raw_get(raw, _L1_KEYS)),
        "l3": _parse_metric(_raw_get(raw, _L3_KEYS)),
        "l4": _parse_metric(_raw_get(raw, _L4_KEYS)),
        "l8": _parse_metric(_raw_get(raw, _L8_KEYS)),
        "l2_proxy": _parse_metric(_raw_get(raw, _L2_PROXY_KEYS)),
        "gmv": gmv,
    }


def _pct(num: int, den: int) -> int:
    if den <= 0:
        return 0
    return min(100, round(num / den * 100))


def _conversion_from_totals(l1: int, l2: int, l3: int, l4: int, l8: int) -> list[dict]:
    return [
        {"label": "L2/L1", "value": _pct(l2, l1)},
        {"label": "L3/L2", "value": _pct(l3, l2)},
        {"label": "L4/L3", "value": _pct(l4, l3)},
        {"label": "L8/L4", "value": _pct(l8, l4)},
    ]


def _load_collected_don_hang(
    sb,
    d_start: str,
    d_end: str,
    sale_filter: str | None = None,
) -> tuple[int, dict[str, int], dict[str, int]]:
    """
    Tổng tiền đã thu từ don_hang (tien_ve=true).
    Trả về (total, by_sale_name, by_date ISO).
    """
    total = 0
    by_sale: dict[str, int] = {}
    by_date: dict[str, int] = {}

    try:
        q = (
            sb.table("don_hang")
            .select("so_tien_can_thu, sale_crm_name, created_at, tien_ve")
            .eq("tien_ve", True)
            .gte("created_at", f"{d_start}T00:00:00")
            .lte("created_at", f"{d_end}T23:59:59")
        )
        if sale_filter:
            q = q.ilike("sale_crm_name", sale_filter)
        res = q.execute()
    except Exception as exc:
        print(f"[Dashboard] don_hang collected query failed: {exc}")
        return 0, {}, {}

    for row in res.data or []:
        amt = _parse_metric(row.get("so_tien_can_thu"))
        if amt <= 0:
            continue
        total += amt
        sname = (row.get("sale_crm_name") or "(Chưa gán sale)").strip()
        by_sale[sname] = by_sale.get(sname, 0) + amt
        d = str(row.get("created_at", ""))[:10]
        if d:
            by_date[d] = by_date.get(d, 0) + amt

    return total, by_sale, by_date


# ---------------------------------------------------------------------------
# Route registration
# ---------------------------------------------------------------------------

def register_dashboard_routes(app, supabase_factory):

    @app.get("/dashboard/filters", tags=["Dashboard"])
    def dashboard_filters():
        sb = supabase_factory()
        if not sb:
            return {"teams": [], "sales": [], "departments": []}
        try:
            res = sb.table("crm_sales_data").select("team, sale_name, department, raw_data").execute()
            teams: set[str] = set()
            sales: set[str] = set()
            depts: set[str] = set()
            for r in res.data or []:
                if not _is_detail_sale_row(r):
                    continue
                if r.get("team"):
                    teams.add(r["team"])
                if r.get("department"):
                    depts.add(r["department"])
                label = _sale_label(r)
                if label and label != "—":
                    sales.add(label)
            return {
                "teams": sorted(teams),
                "sales": sorted(sales),
                "departments": sorted(depts),
            }
        except Exception as exc:
            print(f"[Dashboard filters] {exc}")
            return {"teams": [], "sales": [], "departments": []}

    @app.get("/dashboard/summary", tags=["Dashboard"])
    def dashboard_summary(
        range_key: str = Query("month", description="today|week|month|last_month|custom"),
        start: str | None = Query(None),
        end: str | None = Query(None),
        team: str | None = Query(None),
        sale: str | None = Query(None),
        department: str | None = Query(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        d_start, d_end = _date_range(range_key, start, end)

        try:
            q = (
                sb.table("crm_sales_data")
                .select("*")
                .gte("report_date", d_start)
                .lte("report_date", d_end)
            )
            if team:
                q = q.eq("team", team)
            if sale:
                q = q.eq("sale_name", sale)
            if department:
                q = q.eq("department", department)
            all_rows: list[dict] = q.execute().data or []
        except Exception as exc:
            raise HTTPException(500, f"Query crm_sales_data thất bại: {exc}") from exc

        crm_rows = [r for r in all_rows if _is_detail_sale_row(r)]

        empty_kpi = {
            "total_orders": 0, "total_amount_qr": 0, "total_collected": 0,
            "aov": 0, "l1": 0, "l3": 0, "l4": 0, "l8": 0,
        }
        if not crm_rows:
            collected_total, _, _ = _load_collected_don_hang(sb, d_start, d_end, sale)
            return {
                "period": {"start": d_start, "end": d_end},
                "kpi": {**empty_kpi, "total_collected": collected_total},
                "revenue_by_date": [],
                "top_sales": [],
                "conversion": _conversion_from_totals(0, 0, 0, 0, 0),
                "today": {},
            }

        # ── Aggregate CRM metrics ───────────────────────────────────────────
        tot_l1 = tot_l3 = tot_l4 = tot_l8 = tot_l2 = tot_gmv = tot_orders = 0
        date_map: dict[str, dict] = {}
        sale_map: dict[str, dict] = {}

        for r in crm_rows:
            raw = r.get("raw_data") if isinstance(r.get("raw_data"), dict) else {}
            m = _l_metrics(raw, r.get("amount"))
            if m["gmv"] == 0 and r.get("amount"):
                m["gmv"] = _parse_metric(r.get("amount"))

            tot_l1 += m["l1"]
            tot_l3 += m["l3"]
            tot_l4 += m["l4"]
            tot_l8 += m["l8"]
            tot_l2 += m["l2_proxy"]
            tot_gmv += m["gmv"]
            tot_orders += m["l8"]  # 签单数 = số đơn ký

            d = str(r.get("report_date", ""))[:10]
            if d:
                if d not in date_map:
                    date_map[d] = {"date": d, "amount": 0, "collected": 0, "orders": 0}
                date_map[d]["amount"] += m["gmv"]
                date_map[d]["orders"] += m["l8"]

            sname = _sale_label(r)
            if sname not in sale_map:
                sale_map[sname] = {
                    "sale_name": sname,
                    "team": _team_label(r),
                    "total_amount": 0,
                    "collected": 0,
                    "orders": 0,
                    "l1": 0, "l3": 0, "l4": 0, "l8": 0,
                }
            sale_map[sname]["total_amount"] += m["gmv"]
            sale_map[sname]["orders"] += m["l8"]
            sale_map[sname]["l1"] += m["l1"]
            sale_map[sname]["l3"] += m["l3"]
            sale_map[sname]["l4"] += m["l4"]
            sale_map[sname]["l8"] += m["l8"]

        # ── Doanh thu đã thu từ don_hang ────────────────────────────────────
        collected_total, collected_by_sale, collected_by_date = _load_collected_don_hang(
            sb, d_start, d_end, sale
        )

        for d, amt in collected_by_date.items():
            if d in date_map:
                date_map[d]["collected"] = amt
            else:
                date_map[d] = {"date": d, "amount": 0, "collected": amt, "orders": 0}

        for sname, amt in collected_by_sale.items():
            if sname in sale_map:
                sale_map[sname]["collected"] = amt
            else:
                sale_map[sname] = {
                    "sale_name": sname,
                    "team": "—",
                    "total_amount": 0,
                    "collected": amt,
                    "orders": 0,
                    "l1": 0, "l3": 0, "l4": 0, "l8": 0,
                }

        revenue_by_date = sorted(date_map.values(), key=lambda x: x["date"])
        top_sales = sorted(sale_map.values(), key=lambda x: x["total_amount"], reverse=True)[:10]

        aov = collected_total // tot_orders if tot_orders and collected_total else (
            tot_gmv // tot_orders if tot_orders else 0
        )

        today_str = date.today().isoformat()
        today_crm = [r for r in crm_rows if str(r.get("report_date", ""))[:10] == today_str]
        today_gmv = sum(_l_metrics(r.get("raw_data") or {}, r.get("amount"))["gmv"] for r in today_crm)
        today_orders = sum(_l_metrics(r.get("raw_data") or {}, r.get("amount"))["l8"] for r in today_crm)
        today_collected = collected_by_date.get(today_str, 0)

        return {
            "period": {"start": d_start, "end": d_end},
            "kpi": {
                "total_orders": tot_orders,
                "total_amount_qr": tot_gmv,
                "total_collected": collected_total,
                "aov": aov,
                "l1": tot_l1,
                "l3": tot_l3,
                "l4": tot_l4,
                "l8": tot_l8,
            },
            "revenue_by_date": revenue_by_date,
            "top_sales": top_sales,
            "conversion": _conversion_from_totals(tot_l1, tot_l2, tot_l3, tot_l4, tot_l8),
            "today": {
                "orders": today_orders,
                "amount": today_gmv,
                "collected": today_collected,
            },
        }
