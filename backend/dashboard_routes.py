"""Dashboard routes — Module 6: Hybrid (daily_trends từ DB + live_summary từ PalFish)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException, Query, Header
from pydantic import BaseModel, Field

from rbac import resolve_actor

from crm_metrics import (
    INVALID_TEAM_LABELS,
    aggregate_daily_by_date,
    aggregate_label,
    conversion_rates,
    daily_mtd_snapshot_rows,
    empty_metrics,
    exclude_legacy_summary_rows,
    extract_sale_detail,
    fetch_crm_sales_rows,
    is_detail_sale_row,
    is_valid_sale_name,
    merge_sale_detail,
    parse_metric,
    rows_for_kpi,
    safe_divide,
    sale_label,
    select_crm_rows,
    sum_metrics,
    sync_coverage_meta,
    team_label,
)
from crm_routes import MAX_DAYS, fetch_live_crm_rows
from report_routes import _load_ledger_revenue, _sale_key

DEFAULT_EXCHANGE_RATE = 3700


# --- Bảng thông tin (gamification) — mock contract for FE ---


class TopSale(BaseModel):
    id: str
    name: str
    revenue: int
    avatar_url: str | None = None


class TaskItem(BaseModel):
    id: str
    title: str
    description: str
    reward: str


class EventItem(BaseModel):
    id: str
    title: str
    date: str
    description: str


class Commission(BaseModel):
    status: str = Field(..., description='e.g. "coming_soon"')
    amount: int


class DashboardSummary(BaseModel):
    """Mock-phase Bảng thông tin — GET /api/v1/dashboard/summary."""

    top_today: list[TopSale]
    top_month: list[TopSale]
    tasks: list[TaskItem]
    events: list[EventItem]
    commission: Commission


def _mock_gamification_summary() -> DashboardSummary:
    return DashboardSummary(
        top_today=[
            TopSale(id="sale-today-1", name="Trần Mỹ Linh", revenue=86_000_000),
            TopSale(id="sale-today-2", name="Phạm Quốc Anh", revenue=72_500_000),
            TopSale(id="sale-today-3", name="Lê Thị Thảo", revenue=45_000_000),
        ],
        top_month=[
            TopSale(id="sale-month-1", name="Trần Mỹ Linh", revenue=320_000_000),
            TopSale(id="sale-month-2", name="Hoàng Viết Đức", revenue=280_000_000),
            TopSale(id="sale-month-3", name="Phạm Quốc Anh", revenue=210_000_000),
        ],
        tasks=[
            TaskItem(
                id="task-1",
                title="Chốt 5 hợp đồng UPSCALE",
                description="Hoàn thành 5 hợp đồng gói UPSCALE trong tuần này",
                reward="+500.000đ",
            ),
            TaskItem(
                id="task-2",
                title="Đạt mốc 50tr GMV tuần",
                description="Tổng GMV tuần đạt ít nhất 50.000.000 VND",
                reward="+200.000đ",
            ),
            TaskItem(
                id="task-3",
                title="Team đạt 100% KPI tuần",
                description="Cả team hoàn thành KPI tuần được giao",
                reward="+1.000.000đ",
            ),
        ],
        events=[
            EventItem(
                id="event-1",
                title="Team Building Tháng 6",
                date="2026-06-15",
                description="Hoạt động gắn kết team — chi tiết sẽ cập nhật trên DingTalk",
            ),
            EventItem(
                id="event-2",
                title="Workshop Kỹ năng Chốt sale",
                date="2026-06-08",
                description="Buổi training nội bộ — case study chốt sale hiệu quả",
            ),
        ],
        commission=Commission(status="coming_soon", amount=0),
    )


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


def _ledger_collected_maps(
    sb,
    d_start: str,
    d_end: str,
    *,
    team: str | None = None,
    sale: str | None = None,
) -> tuple[int, dict[str, int], dict[str, int], int]:
    """Doanh thu thực thu + L8 — Sổ doanh thu theo ngay_tien_ve (BC03 logic)."""
    total = 0
    by_date: dict[str, int] = {}
    by_sale: dict[str, int] = {}
    order_count = 0
    try:
        rev_map, _ = _load_ledger_revenue(sb, d_start, d_end, team)
        for sname, entry in rev_map.items():
            if sale and sname != sale:
                continue
            vnd = int(entry.get("collected_vnd") or 0)
            cnt = int(entry.get("orders_ledger") or 0)
            total += vnd
            order_count += cnt
            if vnd:
                by_sale[sname] = by_sale.get(sname, 0) + vnd
            for day, bucket in (entry.get("daily") or {}).items():
                dv = int(bucket.get("collected_vnd") or 0)
                if dv:
                    by_date[day] = by_date.get(day, 0) + dv
    except Exception as exc:
        print(f"[Dashboard] so_doanh_thu collected query failed: {exc}")
    return total, by_date, by_sale, order_count


def _load_qr_created_maps(
    sb,
    d_start: str,
    d_end: str,
    *,
    team: str | None = None,
    sale: str | None = None,
) -> tuple[int, int]:
    """Module 2 — doanh thu tạo mã QR: don_hang.created_at trong kỳ (không cần tien_ve)."""
    total = 0
    count = 0
    try:
        q = (
            sb.table("don_hang")
            .select("sale_crm_name, so_tien_can_thu, created_at, trang_thai")
            .gte("created_at", f"{d_start}T00:00:00")
            .lte("created_at", f"{d_end}T23:59:59")
        )
        for r in q.execute().data or []:
            if str(r.get("trang_thai") or "").strip().lower() == "huy":
                continue
            sname = _sale_key(r.get("sale_crm_name"))
            if sale and sname != sale:
                continue
            if team and sname != "(Chưa gán sale)":
                sale_team = "—"
                try:
                    ns = (
                        sb.table("nhan_su_sale")
                        .select("team")
                        .eq("crm_name", sname)
                        .limit(1)
                        .execute()
                    )
                    if ns.data:
                        sale_team = str(ns.data[0].get("team") or "—")
                except Exception:
                    pass
                if sale_team != team:
                    continue
            vnd = parse_metric(r.get("so_tien_can_thu"))
            if vnd <= 0:
                continue
            count += 1
            total += vnd
    except Exception as exc:
        print(f"[Dashboard] don_hang QR-created query failed: {exc}")
    return total, count


def _kpi_payload(
    tot: dict[str, int | float],
    ledger_l8: int,
    tot_collected_vnd: int,
    collected_order_count: int,
    qr_created_vnd: int,
    qr_created_count: int,
    exchange_rate: int,
) -> dict[str, Any]:
    gmv_rmb = int(tot.get("b3_gmv") or 0)
    crm_l8 = int(tot.get("l8") or 0)
    aov_vnd = (
        int(safe_divide(tot_collected_vnd, collected_order_count))
        if collected_order_count
        else 0
    )
    return {
        "total_orders": ledger_l8,
        "collected_order_count": collected_order_count,
        "total_gmv_rmb": gmv_rmb,
        "total_collected_vnd": tot_collected_vnd,
        "gmv_vnd_est": gmv_rmb * exchange_rate,
        "exchange_rate": exchange_rate,
        "revenue_qr_created_vnd": qr_created_vnd,
        "qr_created_count": qr_created_count,
        "total_collected": tot_collected_vnd,
        "aov": aov_vnd,
        "b1_qr_count": int(tot.get("b1_qr") or 0),
        "b3_gmv_qr": gmv_rmb,
        "l1": int(tot.get("l1") or 0),
        "l3": int(tot.get("l3") or 0),
        "l4": int(tot.get("l4") or 0),
        "l8": ledger_l8,
        "crm_l8": crm_l8,
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


def _exclude_summary_rows(rows: list[dict]) -> list[dict]:
    """Hybrid DB — bỏ legacy record_type=summary."""
    return [
        r for r in rows
        if str(r.get("record_type") or "").strip().lower() != "summary"
    ]


def _query_crm_rows(
    sb,
    d_start: str,
    d_end: str,
    *,
    sale: str | None = None,
    team: str | None = None,
) -> list[dict]:
    rows = fetch_crm_sales_rows(sb, d_start, d_end, sale=sale, team=team)
    rows = exclude_legacy_summary_rows(rows)
    return _apply_team_filter(rows, team)


def _build_top_sales(
    kpi_rows: list[dict],
    collected_by_sale: dict[str, int],
) -> list[dict]:
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

    return sorted(
        [x for x in sale_map.values() if is_valid_sale_name(x.get("sale_name"))],
        key=lambda x: (x.get("gmv_rmb") or 0, x.get("sale_name") or ""),
        reverse=True,
    )


def _validate_custom_range(d_start: str, d_end: str) -> None:
    try:
        ds = date.fromisoformat(d_start)
        de = date.fromisoformat(d_end)
    except ValueError:
        raise HTTPException(400, "start/end phải có dạng YYYY-MM-DD")
    if de < ds:
        raise HTTPException(400, "end phải >= start")
    if (de - ds).days >= MAX_DAYS:
        raise HTTPException(400, f"Dải ngày tối đa {MAX_DAYS} ngày")


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


def _gap_to_above(top_sales: list[dict], user_idx: int, user_gmv: int) -> dict | None:
    if user_idx <= 0:
        return None
    above = top_sales[user_idx - 1]
    above_gmv = int(above.get("gmv_rmb") or 0)
    user_collected = int(top_sales[user_idx].get("collected_vnd") or 0) if user_idx < len(top_sales) else 0
    above_collected = int(above.get("collected_vnd") or 0)
    return {
        "amount_rmb": max(0, above_gmv - user_gmv + 1),
        "amount_vnd": max(0, above_collected - user_collected),
        "target_sale_name": above.get("sale_name") or "—",
        "target_rank": user_idx,
        "target_gmv_rmb": above_gmv,
        "target_collected_vnd": above_collected,
    }


def _personalize_ranking(top_sales: list[dict], actor_crm_name: str | None, actor_team: str | None) -> dict | None:
    if not actor_crm_name or not top_sales:
        return None

    user_idx = None
    for i, entry in enumerate(top_sales):
        sale = str(entry.get("sale_name") or "").strip()
        if sale == actor_crm_name:
            user_idx = i
            break

    if user_idx is None:
        return {
            "rank": len(top_sales) + 1,
            "sale_name": actor_crm_name,
            "team": actor_team or "—",
            "gmv_rmb": 0,
            "collected_vnd": 0,
            "orders": 0,
            "total_sales_count": len(top_sales),
            "gap_to_above": _gap_to_above(top_sales, len(top_sales), 0),
            "is_in_top5": False,
            "rank_change": 0,
        }

    rank = user_idx + 1
    user_entry = top_sales[user_idx]
    user_gmv = int(user_entry.get("gmv_rmb") or 0)

    return {
        "rank": rank,
        "sale_name": actor_crm_name,
        "team": user_entry.get("team") or actor_team or "—",
        "gmv_rmb": user_gmv,
        "collected_vnd": int(user_entry.get("collected_vnd") or 0),
        "orders": int(user_entry.get("orders") or 0),
        "total_sales_count": len(top_sales),
        "gap_to_above": _gap_to_above(top_sales, user_idx, user_gmv),
        "is_in_top5": rank <= 5,
        "rank_change": 0,
    }


def register_dashboard_routes(app, supabase_factory):

    @app.get(
        "/api/v1/dashboard/summary",
        tags=["Dashboard"],
        response_model=DashboardSummary,
        summary="Bảng thông tin — gamification (mock)",
    )
    def gamification_dashboard_summary():
        """Mock data phase — unblock FE Bảng thông tin."""
        return _mock_gamification_summary()

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
            pool = _exclude_summary_rows(rows)
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

    @app.get("/dashboard/daily_trends", tags=["Dashboard"])
    def dashboard_daily_trends(
        start_date: str = Query(..., description="YYYY-MM-DD"),
        end_date: str = Query(..., description="YYYY-MM-DD"),
        team: str | None = Query(None),
        sale: str | None = Query(None),
        department: str | None = Query(None),
    ):
        """Nhanh — query crm_sales_data (incremental daily) cho biểu đồ & BC03."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        d_start, d_end = start_date[:10], end_date[:10]
        _validate_custom_range(d_start, d_end)
        team_filter = team or department

        try:
            rows = _query_crm_rows(sb, d_start, d_end, sale=sale, team=team_filter)
        except Exception as exc:
            raise HTTPException(500, f"Query crm_sales_data thất bại: {exc}") from exc

        _, collected_by_date, _, _ = _ledger_collected_maps(
            sb, d_start, d_end, team=team_filter, sale=sale
        )
        revenue_by_date = aggregate_daily_by_date(rows, d_start, d_end)
        for bucket in revenue_by_date:
            d = str(bucket["date"])
            bucket["collected_vnd"] = collected_by_date.get(d, 0)
            bucket["collected"] = bucket["collected_vnd"]

        sync_dates = {str(r.get("report_date", ""))[:10] for r in rows if r.get("report_date")}
        coverage = sync_coverage_meta(rows, d_start, d_end)

        return {
            "period": {"start": d_start, "end": d_end},
            "row_count": len(rows),
            "revenue_by_date": revenue_by_date,
            "meta": {
                "source": "supabase_daily",
                "sync_days": len(sync_dates),
                "crm_gmv_currency": "RMB",
                "collected_currency": "VND",
                "collected_source": "so_doanh_thu",
                **{k: coverage[k] for k in ("synced_days", "expected_days", "missing_dates")},
            },
        }

    @app.get("/dashboard/live_summary", tags=["Dashboard"])
    async def dashboard_live_summary(
        start_date: str = Query(..., description="YYYY-MM-DD"),
        end_date: str = Query(..., description="YYYY-MM-DD"),
        team: str | None = Query(None),
        sale: str | None = Query(None),
        department: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        """Chậm — PalFish live 1 request, join don_hang, KHÔNG lưu DB."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor_crm_name = None
        actor_team = None
        if authorization and sb:
            try:
                actor = resolve_actor(sb, authorization)
                if actor.staff:
                    actor_crm_name = actor.staff.get("crm_name")
                    actor_team = actor.staff.get("team")
            except Exception:
                pass

        d_start, d_end = start_date[:10], end_date[:10]
        _validate_custom_range(d_start, d_end)
        team_filter = team or department
        exchange_rate = _load_exchange_rate(sb, d_end)
        today_str = date.today().isoformat()

        ds = date.fromisoformat(d_start)
        de = date.fromisoformat(d_end)

        try:
            live_rows, live_meta = await fetch_live_crm_rows(sb, ds, de)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(502, f"PalFish live fetch thất bại: {exc}") from exc

        if sale:
            live_rows = [r for r in live_rows if (r.get("sale_name") or "").strip() == sale]
        live_rows = _apply_team_filter(live_rows, team_filter)

        tot_collected_vnd, collected_by_date, collected_by_sale, collected_order_count = _ledger_collected_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
        )
        qr_created_vnd, qr_created_count = _load_qr_created_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
        )
        focus_day = today_str if d_start <= today_str <= d_end else d_end
        focus_collected = collected_by_date.get(focus_day, 0)

        if not live_rows:
            return {
                "period": {"start": d_start, "end": d_end},
                "row_count": 0,
                "meta": {
                    "crm_gmv_currency": "RMB",
                    "collected_currency": "VND",
                    "collected_source": "so_doanh_thu",
                    "l8_source": "so_doanh_thu",
                    "qr_created_source": "don_hang",
                    "exchange_rate": exchange_rate,
                    "kpi_source": "palfish_live",
                    **live_meta,
                },
                "kpi": _kpi_payload(
                    empty_metrics(),
                    collected_order_count,
                    tot_collected_vnd,
                    collected_order_count,
                    qr_created_vnd,
                    qr_created_count,
                    exchange_rate,
                ),
                "top_sales": [],
                "conversion": conversion_rates(0, 0, 0, 0),
                "today": {
                    "date": focus_day,
                    "is_calendar_today": focus_day == today_str,
                    "orders": 0,
                    "gmv_rmb": 0,
                    "collected_vnd": focus_collected,
                },
            }

        kpi_rows = rows_for_kpi(live_rows)
        tot = sum_metrics(kpi_rows)
        crm_l8 = int(tot["l8"])

        top_sales = _build_top_sales(kpi_rows, collected_by_sale)

        my_rank = _personalize_ranking(top_sales, actor_crm_name, actor_team)
        if my_rank and not my_rank.get("is_in_top5") and actor_crm_name:
            for entry in top_sales:
                if str(entry.get("sale_name") or "").strip() == actor_crm_name:
                    entry["is_current_user"] = True
                    entry["user_rank"] = my_rank["rank"]
                    break
            else:
                top_sales.append({
                    "sale_name": actor_crm_name,
                    "team": actor_team or "—",
                    "department": actor_team or "—",
                    "gmv_rmb": 0,
                    "orders": 0,
                    "collected_vnd": 0,
                    "collected": 0,
                    "is_current_user": True,
                    "user_rank": my_rank["rank"],
                })

        l1, l3, l4 = int(tot["l1"]), int(tot["l3"]), int(tot["l4"])

        return {
            "period": {"start": d_start, "end": d_end},
            "row_count": len(kpi_rows),
            "meta": {
                "crm_gmv_currency": "RMB",
                "collected_currency": "VND",
                "collected_source": "so_doanh_thu",
                "l8_source": "so_doanh_thu",
                "qr_created_source": "don_hang",
                "exchange_rate": exchange_rate,
                "kpi_source": "palfish_live",
                **live_meta,
            },
            "kpi": _kpi_payload(
                tot,
                collected_order_count,
                tot_collected_vnd,
                collected_order_count,
                qr_created_vnd,
                qr_created_count,
                exchange_rate,
            ),
            "my_rank": my_rank,
            "top_sales": top_sales,
            "conversion": conversion_rates(l1, l3, l4, crm_l8),
            "today": {
                "date": focus_day,
                "is_calendar_today": focus_day == today_str,
                "orders": 0,
                "gmv_rmb": 0,
                "collected_vnd": focus_collected,
                "amount": 0,
                "collected": focus_collected,
            },
        }

    @app.get("/dashboard/summary", tags=["Dashboard"])
    def dashboard_summary(
        range_key: str = Query("month", description="today|week|month|last_month|custom"),
        start: str | None = Query(None),
        end: str | None = Query(None),
        team: str | None = Query(None),
        sale: str | None = Query(None),
        department: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor_crm_name = None
        actor_team = None
        if authorization and sb:
            try:
                actor = resolve_actor(sb, authorization)
                if actor.staff:
                    actor_crm_name = actor.staff.get("crm_name")
                    actor_team = actor.staff.get("team")
            except Exception:
                pass

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

        empty_kpi = _kpi_payload(empty_metrics(), 0, 0, 0, 0, 0, exchange_rate)
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

        tot_collected_vnd, collected_by_date, collected_by_sale, collected_order_count = _ledger_collected_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
        )
        qr_created_vnd, qr_created_count = _load_qr_created_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
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

        my_rank = _personalize_ranking(top_sales, actor_crm_name, actor_team)
        if my_rank and not my_rank.get("is_in_top5") and actor_crm_name:
            for entry in top_sales:
                if str(entry.get("sale_name") or "").strip() == actor_crm_name:
                    entry["is_current_user"] = True
                    entry["user_rank"] = my_rank["rank"]
                    break
            else:
                top_sales.append({
                    "sale_name": actor_crm_name,
                    "team": actor_team or "—",
                    "department": actor_team or "—",
                    "gmv_rmb": 0,
                    "orders": 0,
                    "collected_vnd": 0,
                    "collected": 0,
                    "is_current_user": True,
                    "user_rank": my_rank["rank"],
                })

        focus_day = today_str if d_start <= today_str <= d_end else d_end
        day_stats = _day_bucket(revenue_by_date, focus_day)
        # Panel ngày: dùng delta GMV (phần tăng thêm) + tiền về thực tế
        focus_row = next((b for b in revenue_by_date if b.get("date") == focus_day), None)
        focus_gmv_delta = int((focus_row or {}).get("gmv_rmb_delta") or 0)

        l1, l3, l4 = int(tot["l1"]), int(tot["l3"]), int(tot["l4"])

        return {
            "period": {"start": d_start, "end": d_end},
            "row_count": len(kpi_rows),
            "data_mode": data_mode,
            "meta": {
                "crm_gmv_currency": "RMB",
                "collected_currency": "VND",
                "collected_source": "so_doanh_thu",
                "l8_source": "so_doanh_thu",
                "qr_created_source": "don_hang",
                "exchange_rate": exchange_rate,
                "kpi_source": kpi_source_type,
                "summary_rows": len(summary_rows),
                "daily_rows": len(daily_rows),
            },
            "kpi": _kpi_payload(
                tot,
                collected_order_count,
                tot_collected_vnd,
                collected_order_count,
                qr_created_vnd,
                qr_created_count,
                exchange_rate,
            ),
            "revenue_by_date": revenue_by_date,
            "my_rank": my_rank,
            "top_sales": top_sales,
            "conversion": conversion_rates(l1, l3, l4, crm_l8),
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

    @app.get("/dashboard/today-honors", tags=["Dashboard"])
    def dashboard_today_honors(
        authorization: str | None = Header(None),
    ):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        today_str = date.today().isoformat()
        
        res = (
            sb.table("so_doanh_thu")
            .select("sale_crm_name, so_tien_vnd")
            .eq("ngay_tien_ve", today_str)
            .execute()
        )
        rows = res.data or []

        sales_map = {}
        for r in rows:
            crm_name = (r.get("sale_crm_name") or "").strip()
            if not crm_name:
                continue
            amt = int(r.get("so_tien_vnd") or 0)
            if crm_name not in sales_map:
                sales_map[crm_name] = {"collected_vnd": 0, "orders": 0}
            sales_map[crm_name]["collected_vnd"] += amt
            sales_map[crm_name]["orders"] += 1

        top = sorted(
            [{"sale_name": k, **v} for k, v in sales_map.items()],
            key=lambda x: x["collected_vnd"],
            reverse=True
        )[:3]

        if top:
            names = [x["sale_name"] for x in top]
            staff_res = (
                sb.table("nhan_su_sale")
                .select("crm_name, team, display_name")
                .in_("crm_name", names)
                .execute()
            )
            staff_map = {
                (s.get("crm_name") or "").strip(): s
                for s in (staff_res.data or [])
            }
            
            for i, entry in enumerate(top):
                entry["rank"] = i + 1
                staff_info = staff_map.get(entry["sale_name"]) or {}
                entry["team"] = staff_info.get("team") or "—"
                entry["sale_name"] = staff_info.get("display_name") or entry["sale_name"]

        return {
            "date": today_str,
            "honors": top,
        }
