"""Dashboard routes — Module 6: Hybrid (daily_trends từ DB + live_summary từ PalFish)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException, Query, Header
from pydantic import BaseModel, Field

from rbac import enforce_report_scope, resolve_actor, scope_sale_names

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
from revenue_routes import load_team_map

DEFAULT_EXCHANGE_RATE = 3700
VN_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


# --- Bảng thông tin (gamification) — mock contract for FE ---


class TopSale(BaseModel):
    id: str
    name: str
    revenue: int
    avatar_url: str | None = None
    team: str | None = None
    sub_team: str | None = None


class GamificationCurrentUser(BaseModel):
    rank: int
    name: str
    revenue: int
    total_sales: int
    next_rank_name: str | None = None
    next_rank_revenue: int | None = None
    gap: int = 0


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
    """Bảng thông tin — GET /api/v1/dashboard/summary."""

    top_today: list[TopSale]
    top_month: list[TopSale]
    tasks: list[TaskItem]
    events: list[EventItem]
    commission: Commission
    current_user: GamificationCurrentUser | None = None


GAMIFICATION_TODAY_LIMIT = 5
GAMIFICATION_MONTH_LIMIT = 999


STATIC_TASKS: list[TaskItem] = [
    TaskItem(
        id="task-1",
        title="Team đạt 100% KPI",
        description="Toàn team chạm mốc KPI tháng",
        reward="+1.000.000đ",
    ),
    TaskItem(
        id="task-2",
        title="Team đạt 110% KPI",
        description="Vượt 10% KPI tháng — thưởng kép",
        reward="+2.000.000đ",
    ),
    TaskItem(
        id="task-3",
        title="Doanh số cá nhân tuần đạt 100 triệu",
        description="Mốc tuần · cá nhân",
        reward="+200.000đ",
    ),
    TaskItem(
        id="task-4",
        title="Doanh số cá nhân tuần đạt 115 triệu",
        description="Mốc tuần · cá nhân",
        reward="+300.000đ",
    ),
    TaskItem(
        id="task-5",
        title="Doanh số cá nhân tuần đạt 130 triệu",
        description="Mốc tuần · cá nhân",
        reward="+500.000đ",
    ),
]

STATIC_EVENTS: list[EventItem] = [
    EventItem(
        id="event-1",
        title="Gala Vinh Danh Quý II / 2026",
        date="2026-06-14",
        description="Đêm tôn vinh Top Sales · 14/06 · Khách sạn Lotte Hà Nội",
    ),
    EventItem(
        id="event-2",
        title='Đua Sprint "Bứt Tốc Tháng 6"',
        date="2026-06-30",
        description="Thưởng nóng 50 triệu cho team dẫn đầu doanh số",
    ),
    EventItem(
        id="event-3",
        title="Hành Trình Đà Nẵng 2026",
        date="2026-07-15",
        description="Top 30 toàn quốc · 3 ngày 2 đêm · All-inclusive",
    ),
    EventItem(
        id="event-4",
        title='Workshop "Chốt Đơn Đỉnh Cao"',
        date="2026-06-07",
        description="Chia sẻ từ Top 1 Đặng Hoàng Sơn · Thứ 6 hàng tuần",
    ),
]


def _vn_today_iso(now: datetime | None = None) -> str:
    return _coerce_vn_datetime(now).date().isoformat()


def _vn_month_start_iso(now: datetime | None = None) -> str:
    return _coerce_vn_datetime(now).replace(day=1).date().isoformat()


def _query_top_sales(
    sb,
    d_start: str,
    d_end: str,
    *,
    limit: int | None = None,
    staff_map: dict[str, tuple[str, str]] | None = None,
    staff_crm_map: dict[str, tuple[str, str, str]] | None = None,
) -> list[TopSale]:
    """BXH tháng — query so_doanh_thu, group by sale_crm_name, sorted by total VND desc."""
    sale_map: dict[str, int] = {}
    try:
        q = (
            sb.table("so_doanh_thu")
            .select("sale_crm_name, so_tien_vnd")
            .gte("ngay_tien_ve", d_start)
            .lte("ngay_tien_ve", d_end)
        )
        from analytics_limits import fetch_rows_capped

        def fetch_page(offset: int, limit: int) -> list[dict]:
            res = q.range(offset, offset + limit - 1).execute()
            return res.data or []

        all_data, _ = fetch_rows_capped(
            fetch_page, log_prefix="[Dashboard] top sales"
        )

        for r in all_data:
            sname = _sale_key(r.get("sale_crm_name"))
            if not sname or sname == "(Chưa gán sale)":
                continue
            vnd = int(float(r.get("so_tien_vnd") or 0))
            if vnd > 0:
                sale_map[sname] = sale_map.get(sname, 0) + vnd
    except Exception as exc:
        print(f"[Dashboard] so_doanh_thu top sales query failed: {exc}")

    if staff_map is None or staff_crm_map is None:
        staff_map, staff_crm_map = _load_staff_maps(sb)

    ranked = sorted(sale_map.items(), key=lambda x: x[1], reverse=True)
    if limit is not None:
        ranked = ranked[:limit]

    out: list[TopSale] = []
    for name, revenue in ranked:
        crm_info = staff_crm_map.get(name.strip())
        if crm_info:
            email, team, sub_team = crm_info
            out.append(
                TopSale(
                    id=email or f"sale-{name}",
                    name=name,
                    revenue=revenue,
                    team=team or None,
                    sub_team=sub_team or None,
                )
            )
        else:
            team, sub_team = ("", "")
            out.append(
                TopSale(
                    id=f"sale-{name}",
                    name=name,
                    revenue=revenue,
                    team=team or None,
                    sub_team=sub_team or None,
                )
            )
    return out


def _query_today_honors(
    sb,
    d_date: str,
    *,
    limit: int | None = None,
    staff_map: dict[str, tuple[str, str]] | None = None,
) -> list[TopSale]:
    """Vinh danh hôm nay — payment_lines status='paid' có paid_at trong ngày (RPC get_top_sales).

    Không đọc giao_dich (luồng prototype cũ, webhook PayOS hiện match payment_lines
    trước nên giao_dich không còn được ghi) và không phụ thuộc sync sổ doanh thu.
    QR lên bảng ngay khi webhook đánh dấu paid; cash/card/installment lên khi
    kế toán xác nhận ở B2.
    """
    day_start_vn = datetime.strptime(d_date, "%Y-%m-%d").replace(tzinfo=VN_TIMEZONE)
    day_end_vn = day_start_vn + timedelta(days=1)
    try:
        return _load_top_sales_rpc(
            sb,
            day_start_vn.astimezone(timezone.utc),
            day_end_vn.astimezone(timezone.utc),
            limit=limit if limit is not None else GAMIFICATION_TODAY_LIMIT,
            staff_map=staff_map,
        )
    except HTTPException as exc:
        print(f"[Dashboard] today honors RPC failed: {exc.detail}")
        return []


def _load_staff_maps(sb) -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str, str]]]:
    """email -> (team, sub_team); crm_name -> (email, team, sub_team)."""
    by_email: dict[str, tuple[str, str]] = {}
    by_crm: dict[str, tuple[str, str, str]] = {}
    try:
        res = sb.table("nhan_su_sale").select("email, crm_name, team, sub_team").execute()
        for row in res.data or []:
            email = str(row.get("email") or "").strip()
            crm_name = str(row.get("crm_name") or "").strip()
            team = str(row.get("team") or "").strip()
            sub_team = str(row.get("sub_team") or "").strip()
            if email:
                by_email[email.lower()] = (team, sub_team)
            if crm_name:
                key = _sale_key(crm_name)
                by_crm[key] = (email, team, sub_team)
    except Exception as exc:
        print(f"[Dashboard] nhan_su_sale lookup failed: {exc}")
    return by_email, by_crm


def _load_staff_team_map(sb) -> dict[str, tuple[str, str]]:
    by_email, _ = _load_staff_maps(sb)
    return by_email


def _build_gamification_current_user(
    top_month: list[TopSale],
    *,
    actor_email: str | None,
    actor_crm_name: str | None,
) -> GamificationCurrentUser | None:
    if not actor_email and not actor_crm_name:
        return None

    email_key = (actor_email or "").strip().lower()
    crm_name = (actor_crm_name or "").strip()
    user_idx: int | None = None

    for i, sale in enumerate(top_month):
        if email_key and sale.id.strip().lower() == email_key:
            user_idx = i
            break
        if crm_name and sale.name.strip() == crm_name:
            user_idx = i
            break

    total = len(top_month)
    if user_idx is None:
        last = top_month[-1] if top_month else None
        fallback_name = crm_name or (email_key.split("@", 1)[0] if email_key else "Unknown")
        return GamificationCurrentUser(
            rank=total + 1,
            name=fallback_name,
            revenue=0,
            total_sales=total,
            next_rank_name=last.name if last else None,
            next_rank_revenue=last.revenue if last else None,
            gap=int(last.revenue) if last else 0,
        )

    rank = user_idx + 1
    sale = top_month[user_idx]
    above = top_month[user_idx - 1] if user_idx > 0 else None
    return GamificationCurrentUser(
        rank=rank,
        name=sale.name,
        revenue=sale.revenue,
        total_sales=total,
        next_rank_name=above.name if above else None,
        next_rank_revenue=above.revenue if above else None,
        gap=max(0, int(above.revenue - sale.revenue)) if above else 0,
    )


def _build_gamification_summary(
    sb,
    *,
    actor_email: str | None = None,
    actor_crm_name: str | None = None,
) -> DashboardSummary:
    today_start_utc, today_end_utc = _vn_day_bounds_utc()
    staff_map, staff_crm_map = _load_staff_maps(sb)

    top_today = _query_today_honors(
        sb, _vn_today_iso(), limit=GAMIFICATION_TODAY_LIMIT, staff_map=staff_map
    )
    top_month = _query_top_sales(
        sb,
        _vn_month_start_iso(),
        _vn_today_iso(),
        limit=GAMIFICATION_MONTH_LIMIT,
        staff_map=staff_map,
        staff_crm_map=staff_crm_map,
    )
    current_user = _build_gamification_current_user(
        top_month,
        actor_email=actor_email,
        actor_crm_name=actor_crm_name,
    )

    return DashboardSummary(
        top_today=top_today,
        top_month=top_month,
        tasks=STATIC_TASKS,
        events=STATIC_EVENTS,
        commission=Commission(status="coming_soon", amount=0),
        current_user=current_user,
    )


def _dump_model(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


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
    allowed_sales: set[str] | None = None,
) -> tuple[int, dict[str, int], dict[str, int], int]:
    """Doanh thu thực thu + L8 — Sổ doanh thu theo ngay_tien_ve (BC03 logic)."""
    total = 0
    by_date: dict[str, int] = {}
    by_sale: dict[str, int] = {}
    order_count = 0
    try:
        rev_map, _ = _load_ledger_revenue(sb, d_start, d_end, team)
        if allowed_sales is not None:
            rev_map = {k: v for k, v in rev_map.items() if k in allowed_sales}
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
    allowed_sales: set[str] | None = None,
) -> tuple[int, int]:
    """Doanh thu tạo lần thanh toán: payment_lines.created_at trong kỳ (không lọc trạng thái)."""
    total = 0
    count = 0
    try:
        staff_by_email, staff_by_crm = _load_staff_maps(sb) if (team or sale or allowed_sales) else ({}, {})

        q = (
            sb.table("payment_lines")
            .select("amount, created_at, is_test, payment_request_id")
            .gte("created_at", f"{d_start}T00:00:00")
            .lte("created_at", f"{d_end}T23:59:59")
            .eq("is_test", False)
        )
        lines = q.execute().data or []
        if not lines:
            return 0, 0

        pr_ids = list({r["payment_request_id"] for r in lines})
        pr_map: dict[str, str] = {}
        for batch_start in range(0, len(pr_ids), 50):
            batch = pr_ids[batch_start:batch_start + 50]
            prs = sb.table("payment_requests").select("id, sale_email").in_("id", batch).execute().data or []
            for pr in prs:
                pr_map[pr["id"]] = str(pr.get("sale_email") or "").strip().lower()

        for r in lines:
            sale_email = pr_map.get(r["payment_request_id"], "")
            if team or sale or allowed_sales is not None:
                sale_team, _ = staff_by_email.get(sale_email, ("", ""))
                crm_name = ""
                for k, (em, t, st) in staff_by_crm.items():
                    if em.lower() == sale_email:
                        crm_name = k
                        break
                sname = crm_name or _sale_key(None)
                if sale and sname != sale:
                    continue
                if team and sname != "(Chưa gán sale)" and sale_team != team:
                    continue
                if allowed_sales is not None and sname not in allowed_sales:
                    continue

            vnd = int(r.get("amount") or 0)
            if vnd <= 0:
                continue
            count += 1
            total += vnd
    except Exception as exc:
        print(f"[Dashboard] payment_lines QR-created query failed: {exc}")
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

def _coerce_vn_datetime(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(VN_TIMEZONE)
    if now.tzinfo is None:
        return now.replace(tzinfo=VN_TIMEZONE)
    return now.astimezone(VN_TIMEZONE)


def _vn_day_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    now_vn = _coerce_vn_datetime(now)
    start_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
    end_vn = start_vn + timedelta(days=1)
    return start_vn.astimezone(timezone.utc), end_vn.astimezone(timezone.utc)


def _vn_month_bounds_utc(now: datetime | None = None) -> tuple[datetime, datetime]:
    now_vn = _coerce_vn_datetime(now)
    start_vn = now_vn.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start_vn.month == 12:
        end_vn = start_vn.replace(year=start_vn.year + 1, month=1)
    else:
        end_vn = start_vn.replace(month=start_vn.month + 1)
    return start_vn.astimezone(timezone.utc), end_vn.astimezone(timezone.utc)


def _load_top_sales_rpc(
    sb,
    start_utc: datetime,
    end_utc: datetime,
    limit: int = 5,
    staff_map: dict[str, tuple[str, str]] | None = None,
) -> list[TopSale]:
    try:
        res = sb.rpc(
            "get_top_sales",
            {
                "p_start": start_utc.isoformat(),
                "p_end": end_utc.isoformat(),
                "p_limit": limit,
            },
        ).execute()
    except Exception as exc:
        raise HTTPException(500, f"Query get_top_sales RPC that bai: {exc}") from exc

    teams = staff_map if staff_map is not None else _load_staff_team_map(sb)
    out: list[TopSale] = []
    for row in res.data or []:
        sale_email = str(row.get("sale_email") or "").strip()
        email_key = sale_email.lower()
        fallback_name = sale_email.split("@", 1)[0] if sale_email else "Unknown"
        team, sub_team = teams.get(email_key, ("", ""))
        out.append(
            TopSale(
                id=sale_email,
                name=str(row.get("sale_name") or fallback_name).strip() or fallback_name,
                avatar_url=row.get("avatar_url") or None,
                revenue=int(row.get("total_revenue") or 0),
                team=team or None,
                sub_team=sub_team or None,
            )
        )
    return out



def register_dashboard_routes(app, supabase_factory):

    @app.get(
        "/api/v1/dashboard/summary",
        tags=["Dashboard"],
        response_model=DashboardSummary,
        summary="Bảng thông tin — gamification (payment_lines RPC)",
    )
    def gamification_dashboard_summary(authorization: str | None = Header(None)):
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")

        actor = resolve_actor(sb, authorization)
        actor_email = (actor.email or "").strip().lower() or None
        staff = actor.staff or {}
        actor_crm_name = str(staff.get("crm_name") or "").strip() or None

        return _build_gamification_summary(
            sb,
            actor_email=actor_email,
            actor_crm_name=actor_crm_name,
        )

    @app.get("/dashboard/filters", tags=["Dashboard"])
    def dashboard_filters(authorization: str | None = Header(None)):
        sb = supabase_factory()
        if not sb:
            return {"teams": [], "sales": [], "departments": []}
        
        resolve_actor(sb, authorization)
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
        authorization: str | None = Header(None),
    ):
        """Nhanh — query crm_sales_data (incremental daily) cho biểu đồ & BC03."""
        sb = supabase_factory()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        
        actor = resolve_actor(sb, authorization)

        d_start, d_end = start_date[:10], end_date[:10]
        _validate_custom_range(d_start, d_end)
        team_filter, sub_team = enforce_report_scope(actor, team or department)

        allowed_sales: set[str] | None = None
        if sub_team and team_filter:
            allowed_sales = scope_sale_names(sb, team_filter, sub_team)

        try:
            rows = _query_crm_rows(sb, d_start, d_end, sale=sale, team=team_filter)
            if allowed_sales is not None:
                rows = [r for r in rows if (r.get("sale_name") or "").strip() in allowed_sales]
        except Exception as exc:
            raise HTTPException(500, f"Query crm_sales_data thất bại: {exc}") from exc

        _, collected_by_date, _, _ = _ledger_collected_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
            allowed_sales=allowed_sales,
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
                "sub_team_scoped": allowed_sales is not None,
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
        actor = resolve_actor(sb, authorization)
        if actor.staff:
            actor_crm_name = actor.staff.get("crm_name")
            actor_team = actor.staff.get("team")

        d_start, d_end = start_date[:10], end_date[:10]
        _validate_custom_range(d_start, d_end)
        team_filter, sub_team = enforce_report_scope(actor, team or department)
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

        allowed_sales: set[str] | None = None
        if sub_team and team_filter:
            allowed_sales = scope_sale_names(sb, team_filter, sub_team)

        if sale:
            live_rows = [r for r in live_rows if (r.get("sale_name") or "").strip() == sale]
        live_rows = _apply_team_filter(live_rows, team_filter)
        if allowed_sales is not None:
            live_rows = [r for r in live_rows if (r.get("sale_name") or "").strip() in allowed_sales]

        tot_collected_vnd, collected_by_date, collected_by_sale, collected_order_count = _ledger_collected_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
            allowed_sales=allowed_sales,
        )
        qr_created_vnd, qr_created_count = _load_qr_created_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
            allowed_sales=allowed_sales,
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
                    "qr_created_source": "payment_lines",
                    "exchange_rate": exchange_rate,
                    "kpi_source": "palfish_live",
                    "sub_team_scoped": allowed_sales is not None,
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
                "qr_created_source": "payment_lines",
                "exchange_rate": exchange_rate,
                "kpi_source": "palfish_live",
                "sub_team_scoped": allowed_sales is not None,
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
        actor = resolve_actor(sb, authorization)
        if actor.staff:
            actor_crm_name = actor.staff.get("crm_name")
            actor_team = actor.staff.get("team")

        d_start, d_end = _date_range(range_key, start, end)
        team_filter, sub_team = enforce_report_scope(actor, team or department)
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
        allowed_sales: set[str] | None = None
        if sub_team and team_filter:
            allowed_sales = scope_sale_names(sb, team_filter, sub_team)
            all_rows = [r for r in all_rows if (r.get("sale_name") or "").strip() in allowed_sales]
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
                    "sub_team_scoped": allowed_sales is not None,
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
            allowed_sales=allowed_sales,
        )
        qr_created_vnd, qr_created_count = _load_qr_created_maps(
            sb, d_start, d_end, team=team_filter, sale=sale,
            allowed_sales=allowed_sales,
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
                "qr_created_source": "payment_lines",
                "exchange_rate": exchange_rate,
                "kpi_source": kpi_source_type,
                "summary_rows": len(summary_rows),
                "daily_rows": len(daily_rows),
                "sub_team_scoped": allowed_sales is not None,
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

        resolve_actor(sb, authorization)

        today_str = _vn_today_iso()

        top_sales = _query_today_honors(sb, today_str, limit=3)

        top = [
            {
                "rank": i + 1,
                "sale_name": ts.name,
                "team": ts.team or "—",
                "collected_vnd": ts.revenue,
                "orders": 1,
            }
            for i, ts in enumerate(top_sales)
        ]

        return {
            "date": today_str,
            "honors": top,
        }
