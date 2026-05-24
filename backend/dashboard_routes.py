"""Dashboard routes — Module 6: Thống kê từ crm_sales_data + don_hang."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, Query

from crm_metrics import (
    INVALID_TEAM_LABELS,
    aggregate_label,
    conversion_rates,
    daily_mtd_snapshot_rows,
    empty_metrics,
    extract_sale_detail,
    is_detail_sale_row,
    is_valid_sale_name,
    merge_sale_detail,
    parse_metric,
    rows_for_kpi,
    safe_divide,
    select_crm_rows,
    sum_metrics,
    team_label,
)

DEFAULT_EXCHANGE_RATE = 3700


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


def _month_key(d: str) -> str:
    return d[:7] if len(d) >= 7 else date.today().strftime("%Y-%m")


def _load_exchange_rate(sb, d_end: str) -> int:
    try:
        res = (
            sb.table("bc03_month_settings")
            .select("exchange_rate")
            .eq("month_key", _month_key(d_end))
            .limit(1)
            .execute()
        )
        if res.data:
            return int(res.data[0].get("exchange_rate") or DEFAULT_EXCHANGE_RATE)
    except Exception as exc:
        print(f"[Dashboard] exchange_rate lookup failed: {exc}")
    return DEFAULT_EXCHANGE_RATE


def _load_collected_maps(
    sb,
    d_start: str,
    d_end: str,
    *,
    sale: str | None = None,
) -> tuple[int, dict[str, int], dict[str, int], int]:
    """Tiền về VND từ don_hang (ngày = updated_at khi tick tiền về)."""
    total = 0
    by_date: dict[str, int] = {}
    by_sale: dict[str, int] = {}
    order_count = 0
    try:
        q = (
            sb.table("don_hang")
            .select("sale_crm_name, so_tien_can_thu, updated_at")
            .eq("tien_ve", True)
            .gte("updated_at", f"{d_start}T00:00:00")
            .lte("updated_at", f"{d_end}T23:59:59")
        )
        for r in q.execute().data or []:
            sname = (r.get("sale_crm_name") or "").strip() or "(Chưa gán sale)"
            if sale and sname != sale:
                continue
            order_count += 1
            vnd = parse_metric(r.get("so_tien_can_thu"))
            if vnd <= 0:
                continue
            day = str(r.get("updated_at") or "")[:10]
            total += vnd
            by_sale[sname] = by_sale.get(sname, 0) + vnd
            if day:
                by_date[day] = by_date.get(day, 0) + vnd
    except Exception as exc:
        print(f"[Dashboard] don_hang collected query failed: {exc}")
    return total, by_date, by_sale, order_count


def _kpi_payload(
    tot: dict[str, int | float],
    crm_l8: int,
    tot_collected_vnd: int,
    collected_order_count: int,
    exchange_rate: int,
) -> dict[str, Any]:
    gmv_rmb = int(tot.get("b3_gmv") or 0)
    aov_vnd = (
        int(safe_divide(tot_collected_vnd, collected_order_count))
        if collected_order_count
        else 0
    )
    return {
        "total_orders": crm_l8,
        "collected_order_count": collected_order_count,
        "total_gmv_rmb": gmv_rmb,
        "total_collected_vnd": tot_collected_vnd,
        "gmv_vnd_est": gmv_rmb * exchange_rate,
        "exchange_rate": exchange_rate,
        # aliases — CRM GMV là RMB, không phải VND
        "total_amount_qr": gmv_rmb,
        "total_collected": tot_collected_vnd,
        "aov": aov_vnd,
        "b1_qr_count": int(tot.get("b1_qr") or 0),
        "b3_gmv_qr": gmv_rmb,
        "l1": int(tot.get("l1") or 0),
        "l3": int(tot.get("l3") or 0),
        "l4": int(tot.get("l4") or 0),
        "l8": int(tot.get("l8") or 0),
        "l1_0": int(tot.get("l1_0") or 0),
        "l1_1": int(tot.get("l1_1") or 0),
        "l1_2": int(tot.get("l1_2") or 0),
        "l3_1": int(tot.get("l3_1") or 0),
        "c1": float(tot.get("c1") or 0),
        "c2": int(tot.get("c2") or 0),
        "c4": float(tot.get("c4") or 0),
        "c5": float(tot.get("c5") or 0),
        "l3_3": float(tot.get("l3_3") or 0),
    }


def _apply_team_filter(rows: list[dict], team: str | None) -> list[dict]:
    if not team:
        return rows
    want = team.strip().lower()
    out = []
    for r in rows:
        dept = str(r.get("department") or "").strip().lower()
        tl = team_label(r).lower()
        tm = str(r.get("team") or "").strip().lower()
        if want in (dept, tl, tm):
            out.append(r)
    return out


def _day_bucket(daily: list[dict], day: str) -> dict[str, int]:
    for b in daily:
        if b.get("date") == day:
            return {
                "orders": int(b.get("orders") or 0),
                "gmv_rmb": int(b.get("gmv_rmb") or b.get("amount") or 0),
                "collected_vnd": int(b.get("collected_vnd") or b.get("collected") or 0),
            }
    return {"orders": 0, "gmv_rmb": 0, "collected_vnd": 0}


def _split_record_types(rows: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """Tách summary / daily / legacy (không có record_type)."""
    summary: list[dict] = []
    daily: list[dict] = []
    legacy: list[dict] = []
    for r in rows:
        rt = str(r.get("record_type") or "").strip().lower()
        if rt == "summary":
            summary.append(r)
        elif rt == "daily":
            daily.append(r)
        else:
            legacy.append(r)
    return summary, daily, legacy


def register_dashboard_routes(app, supabase_factory):

    @app.get("/dashboard/filters", tags=["Dashboard"])
    def dashboard_filters():
        sb = supabase_factory()
        if not sb:
            return {"teams": [], "sales": [], "departments": []}
        try:
            res = sb.table("crm_sales_data").select(
                "team, sale_name, department, raw_data, record_type"
            ).execute()
            rows = res.data or []
            summary, daily, legacy = _split_record_types(rows)
            pool = summary if summary else (daily if daily else legacy)
            teams: set[str] = set()
            sales: set[str] = set()
            depts: set[str] = set()
            for r in pool:
                if not is_detail_sale_row(r):
                    continue
                dept = str(r.get("department") or "").strip()
                if dept and dept.lower() not in INVALID_TEAM_LABELS:
                    teams.add(dept)
                    depts.add(dept)
                tl = team_label(r)
                if tl and tl != "—":
                    teams.add(tl)
                    depts.add(tl)
                tm = str(r.get("team") or "").strip()
                if tm and tm.lower() not in INVALID_TEAM_LABELS:
                    teams.add(tm)
                label = sale_label(r)
                if label and label != "—" and is_valid_sale_name(label):
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
        team_filter = team or department
        exchange_rate = _load_exchange_rate(sb, d_end)
        today_str = date.today().isoformat()

        try:
            q = (
                sb.table("crm_sales_data")
                .select("*")
                .gte("report_date", d_start)
                .lte("report_date", d_end)
            )
            if sale:
                q = q.eq("sale_name", sale)
            all_rows: list[dict] = q.execute().data or []
        except Exception as exc:
            raise HTTPException(500, f"Query crm_sales_data thất bại: {exc}") from exc

        all_rows = _apply_team_filter(all_rows, team_filter)
        summary_rows, daily_rows, legacy_rows = _split_record_types(all_rows)

        # KPI + bảng sale: CHỈ summary (chuẩn L1=2610, không cộng trùng theo ngày)
        if summary_rows:
            kpi_source, data_mode = select_crm_rows(summary_rows)
            kpi_rows = kpi_source
            kpi_source_type = "summary"
        else:
            fallback = daily_rows if daily_rows else legacy_rows
            kpi_source, data_mode = select_crm_rows(fallback)
            kpi_rows = rows_for_kpi(kpi_source)
            kpi_source_type = "daily_fallback"

        # Biểu đồ: CHỈ daily (group theo report_date)
        chart_rows = daily_rows if daily_rows else legacy_rows

        empty_kpi = _kpi_payload(empty_metrics(), 0, 0, 0, exchange_rate)
        if not kpi_rows and not chart_rows:
            return {
                "period": {"start": d_start, "end": d_end},
                "row_count": 0,
                "data_mode": "none",
                "meta": {
                    "crm_gmv_currency": "RMB",
                    "collected_currency": "VND",
                    "exchange_rate": exchange_rate,
                    "kpi_source": kpi_source_type,
                    "summary_rows": len(summary_rows),
                    "daily_rows": len(daily_rows),
                },
                "kpi": empty_kpi,
                "revenue_by_date": [],
                "top_sales": [],
                "conversion": conversion_rates(0, 0, 0, 0),
                "today": {"date": today_str, "is_calendar_today": True, "orders": 0, "gmv_rmb": 0, "collected_vnd": 0},
            }

        if not kpi_rows:
            kpi_rows = []
            data_mode = data_mode if summary_rows or daily_rows or legacy_rows else "none"

        tot = sum_metrics(kpi_rows) if kpi_rows else empty_metrics()
        crm_l8 = int(tot["l8"]) if kpi_rows else 0

        tot_collected_vnd, collected_by_date, collected_by_sale, collected_order_count = _load_collected_maps(
            sb, d_start, d_end, sale=sale,
        )

        revenue_by_date = daily_mtd_snapshot_rows(chart_rows, d_start, d_end) if chart_rows else []
        for bucket in revenue_by_date:
            d = str(bucket["date"])
            bucket["collected_vnd"] = collected_by_date.get(d, 0)
            bucket["collected"] = bucket["collected_vnd"]

        sale_map: dict[str, dict] = {}
        for r in kpi_rows:
            sname = aggregate_label(r)
            detail = extract_sale_detail(r)
            collected = collected_by_sale.get(sname, 0)
            detail["collected_vnd"] = collected
            detail["collected"] = collected
            if sname not in sale_map:
                sale_map[sname] = detail
            else:
                merge_sale_detail(sale_map[sname], detail)
                sale_map[sname]["collected_vnd"] = collected
                sale_map[sname]["collected"] = collected

        top_sales = sorted(
            [x for x in sale_map.values() if is_valid_sale_name(x.get("sale_name"))],
            key=lambda x: (x.get("gmv_rmb") or 0, x.get("sale_name") or ""),
            reverse=True,
        )

        focus_day = today_str if d_start <= today_str <= d_end else d_end
        day_stats = _day_bucket(revenue_by_date, focus_day)
        # Panel ngày: dùng delta GMV (phần tăng thêm) + tiền về thực tế
        focus_row = next((b for b in revenue_by_date if b.get("date") == focus_day), None)
        focus_gmv_delta = int((focus_row or {}).get("gmv_rmb_delta") or 0)

        l1, l3, l4, l8 = int(tot["l1"]), int(tot["l3"]), int(tot["l4"]), int(tot["l8"])

        return {
            "period": {"start": d_start, "end": d_end},
            "row_count": len(kpi_rows),
            "data_mode": data_mode,
            "meta": {
                "crm_gmv_currency": "RMB",
                "collected_currency": "VND",
                "exchange_rate": exchange_rate,
                "kpi_source": kpi_source_type,
                "summary_rows": len(summary_rows),
                "daily_rows": len(daily_rows),
            },
            "kpi": _kpi_payload(tot, crm_l8, tot_collected_vnd, collected_order_count, exchange_rate),
            "revenue_by_date": revenue_by_date,
            "top_sales": top_sales,
            "conversion": conversion_rates(l1, l3, l4, l8),
            "today": {
                "date": focus_day,
                "is_calendar_today": focus_day == today_str,
                "orders": day_stats["orders"],
                "gmv_rmb": focus_gmv_delta,
                "gmv_rmb_mtd": day_stats["gmv_rmb"],
                "collected_vnd": day_stats["collected_vnd"],
                "amount": focus_gmv_delta,
                "collected": day_stats["collected_vnd"],
            },
        }
