"""PalFish CRM — column mapping, data cleansing, safe math for Dashboard / BC03."""

from __future__ import annotations

import math
import re
from typing import Any

# ---------------------------------------------------------------------------
# Column keys (English PalFish CRM header row)
# ---------------------------------------------------------------------------
CRM_COLUMNS: dict[str, tuple[str, ...]] = {
    "department": ("department", "Department", "部门", "销售部门"),
    "sales": ("sale_name", "Sales", "Sale", "销售", "销售姓名", "销售顾问"),
    # Normalized snake_case (sau COLUMN_MAPPING) + English + Chinese
    "c1_call_time": ("total_call_time", "Total Call Time", "总通话时长", "通话总时长"),
    "c2_dials": ("total_dials", "Total Dials", "总拨打数", "拨打总数"),
    "c3_connections": (
        "total_connections", "Total Connections", "Total Connection",
        "总接通数", "接通数", "接通次数", "接通总次数", "Connections",
    ),
    "c4_connection_rate": ("connection_rate", "Connection Rate", "接通率"),
    "c5_over_3min_count": (
        "over_3min_connections",
        "Over 3 Min Connections", "Over 3 Min.Connections", "Over 3 Min. Conn",
        "超3分钟通话数", "三分钟以上通话数", "接通三分钟以上",
    ),
    "c5_over_3min_rate": (
        "over_3min_rate",
        "Over 3 Min.Rate", "Over 3 Min Rate", "超3分钟占比", "接通三分钟以上率",
    ),
    "l1_0_gd": ("gd_leads", "GD leads", "GD Leads", "公海Leads数"),
    "l1_1_ad": ("ad_leads", "AD leads", "AD Leads", "投放leads数"),
    "l1_1_ad_manual": ("ad_leads_manual", "AD leads manual entry", "AD Leads manual entry", "手动导入leads数"),
    "l1_2_referral": ("referral_leads", "Referral leads", "Referral Leads", "转介绍Leads数"),
    "l1_total": ("total_leads", "Total leads", "总Leads数", "总leads数", "Leads mới"),
    "l3_invitation": ("invitation_number", "Invitation Number", "Number of invitations", "邀约数"),
    "l3_1_scheduled": ("scheduled_classes", "Scheduled Class Number", "Scheduled Class number", "应上课数"),
    "l3_3_preview_rate": ("preview_rate", "Preview Rate", "Preview rate", "预习率"),
    "l4_completed": ("completed_classes", "Completed Class Number", "完课数"),
    "l4_completion_rate": ("completion_rate", "Completion Rate", "Completion rate", "完课率", "Complete Rate"),
    "l8_orders": ("orders", "Order", "Orders", "签单数"),
    "b3_gmv": ("gmv_rmb", "GMV", "业绩(元)", "业绩", "Performance (CNY)", "amount", "Amount"),
}

INVALID_TEAM_LABELS = frozenset(
    s.lower() for s in ("Sales", "Sale", "Department", "汇总", "Total", "合计", "")
)

SKIP_SALE_NAMES = frozenset(
    s.lower() for s in ("Sales", "Sale", "汇总", "Total", "合计", "Department", "")
)
HEADER_SALE_NAMES = frozenset(
    s.lower() for s in ("Sales", "Department", "Total", "合计", "")
)


def raw_get(raw: dict, *key_groups: tuple[str, ...] | str) -> Any:
    """Lookup first matching key across raw_data (exact then case-insensitive)."""
    if not isinstance(raw, dict):
        return None
    keys: list[str] = []
    for g in key_groups:
        if isinstance(g, str):
            keys.append(g)
        else:
            keys.extend(g)
    lower_map = {k.lower(): k for k in raw}
    for k in keys:
        if k in raw and raw[k] not in (None, ""):
            return raw[k]
        lk = k.lower()
        if lk in lower_map and raw[lower_map[lk]] not in (None, ""):
            return raw[lower_map[lk]]
    return None


def parse_metric(val: Any) -> int:
    """Integer counts — strips commas, currency symbols, % for whole numbers."""
    if val is None:
        return 0
    s = str(val).strip().replace(",", "").replace(" ", "")
    if s.endswith("%"):
        s = s[:-1]
    s = re.sub(r"[^0-9.\-]", "", s)
    if not s or s in (".", "-"):
        return 0
    try:
        f = float(s)
        if math.isnan(f) or math.isinf(f):
            return 0
        return int(f)
    except (ValueError, TypeError):
        return 0


def parse_rate(val: Any) -> float:
    """Rate columns: '39%', '0.00%' → 39.0, 0.0"""
    if val is None:
        return 0.0
    if isinstance(val, float) and math.isnan(val):
        return 0.0
    s = str(val).strip().replace(",", "")
    if not s:
        return 0.0
    if s.endswith("%"):
        s = s[:-1].strip()
    s = re.sub(r"[^0-9.\-]", "", s)
    if not s or s in (".", "-"):
        return 0.0
    try:
        f = float(s)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return round(f, 2)
    except (ValueError, TypeError):
        return 0.0


def parse_duration_minutes(val: Any) -> float:
    """Total Call Time — seconds, minutes, or HH:MM:SS."""
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s:
        return 0.0
    if ":" in s:
        parts = s.split(":")
        try:
            nums = [float(p) for p in parts]
            if len(nums) == 3:
                return round(nums[0] * 60 + nums[1] + nums[2] / 60, 2)
            if len(nums) == 2:
                return round(nums[0] + nums[1] / 60, 2)
        except (ValueError, TypeError):
            pass
    cleaned = re.sub(r"[^0-9.\-]", "", s.replace(",", ""))
    if not cleaned:
        return 0.0
    try:
        f = float(cleaned)
        if math.isnan(f) or math.isinf(f):
            return 0.0
        return round(f, 2)
    except (ValueError, TypeError):
        return 0.0


def safe_divide(numerator: Any, denominator: Any, *, as_percent: bool = False) -> float:
    """Avoid #DIV/0! — returns 0 when denominator invalid."""
    try:
        den = float(denominator) if denominator is not None else 0.0
        num = float(numerator) if numerator is not None else 0.0
    except (ValueError, TypeError):
        return 0.0
    if math.isnan(den) or math.isinf(den) or den == 0:
        return 0.0
    if math.isnan(num) or math.isinf(num):
        num = 0.0
    result = num / den
    if as_percent:
        result *= 100
    return round(result, 2)


def is_valid_sale_name(name: str | None) -> bool:
    """Tên sale hợp lệ — loại NaN, header, 汇总, Total."""
    s = str(name or "").strip()
    if not s:
        return False
    low = s.lower()
    if low in SKIP_SALE_NAMES:
        return False
    if low in ("nan", "none", "null", "na", "—", "-"):
        return False
    return True


def sale_label(row: dict) -> str:
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    name = (
        row.get("sale_name")
        or raw_get(raw, CRM_COLUMNS["sales"])
        or raw.get("销售")
        or ""
    )
    s = str(name).strip()
    return s if is_valid_sale_name(s) else "—"


def team_label(row: dict) -> str:
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    candidates = [
        raw_get(raw, CRM_COLUMNS["department"]),
        row.get("department"),
        row.get("team"),
        raw.get("部门"),
    ]
    for team in candidates:
        s = str(team or "").strip()
        if s and s.lower() not in INVALID_TEAM_LABELS:
            return s
    return "—"


def is_detail_sale_row(row: dict) -> bool:
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    name = row.get("sale_name") or raw_get(raw, CRM_COLUMNS["sales"]) or raw.get("销售") or ""
    return is_valid_sale_name(str(name).strip())


def is_summary_row(row: dict) -> bool:
    return sale_label(row).lower() == "汇总"


def aggregate_label(row: dict) -> str:
    sale = sale_label(row)
    if sale.lower() == "汇总":
        dept = team_label(row)
        return dept if dept and dept != "—" else "汇总 (tổng)"
    return sale


def row_identity_key(row: dict) -> str:
    """Unique sale within team — for deduping MTD cumulative snapshots."""
    return f"{team_label(row)}|{aggregate_label(row)}"


def _rows_have_kpi(rows: list[dict]) -> bool:
    """Detail rows có metric funnel thực sự (không chỉ 公海)?"""
    snap = latest_snapshot_rows(rows)
    if not snap:
        return False
    tot = sum_metrics(snap)
    return any(int(tot.get(k) or 0) > 0 for k in ("l1", "l3", "l4", "l8", "b3_gmv"))


def select_crm_rows(all_rows: list[dict]) -> tuple[list[dict], str]:
    detail = [r for r in all_rows if is_detail_sale_row(r)]
    summary = [r for r in all_rows if is_summary_row(r)]

    if detail and _rows_have_kpi(detail):
        return detail, "detail"
    if summary:
        return summary, "summary"
    if detail:
        return detail, "detail"
    return [], "none"


def rows_for_kpi(rows: list[dict]) -> list[dict]:
    """Sync v3: 1 dòng/sale/kỳ → cộng trực tiếp. Legacy: dedupe snapshot MTD."""
    picked, _ = select_crm_rows(rows)
    if not picked:
        return []
    dates = {str(r.get("report_date", ""))[:10] for r in picked if r.get("report_date")}
    if len(dates) <= 1:
        return picked
    return latest_snapshot_rows(picked)


def row_overlaps_period(row: dict, d_start: str, d_end: str) -> bool:
    """Khớp dòng báo cáo kỳ (period_start/end) với filter Dashboard."""
    rd = str(row.get("report_date", ""))[:10]
    if rd and d_start <= rd <= d_end:
        return True
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    ps = str(row.get("period_start") or raw.get("period_start") or "")[:10]
    pe = str(row.get("period_end") or raw.get("period_end") or raw.get("Date_Report") or "")[:10]
    if len(ps) == 10 and len(pe) == 10:
        return ps <= d_end and pe >= d_start
    return False


def latest_snapshot_rows(rows: list[dict]) -> list[dict]:
    """CRM PalFish export là MTD tích lũy — giữ 1 dòng mới nhất / sale trong kỳ."""
    buckets: dict[str, tuple[str, dict]] = {}
    for r in rows:
        key = row_identity_key(r)
        d = str(r.get("report_date", ""))[:10]
        if not d:
            continue
        if key not in buckets or d > buckets[key][0]:
            buckets[key] = (d, r)
    return [v[1] for v in buckets.values()]


def daily_mtd_snapshot_rows(
    rows: list[dict], d_start: str, d_end: str,
) -> list[dict[str, Any]]:
    """Tổng MTD CRM mỗi ngày sync — CRM xuất snapshot tích lũy, không phải delta."""
    from datetime import date as date_cls, timedelta

    by_date: dict[str, dict[str, int]] = {}
    for r in rows:
        d = str(r.get("report_date", ""))[:10]
        if not d or d < d_start or d > d_end:
            continue
        m = extract_row_metrics(r)
        bucket = by_date.setdefault(d, {"gmv_rmb": 0, "orders": 0, "l1": 0, "l8": 0})
        bucket["gmv_rmb"] += int(m["b3_gmv"])
        bucket["orders"] += int(m["l8"])
        bucket["l1"] += int(m["l1"])
        bucket["l8"] += int(m["l8"])

    try:
        cur = date_cls.fromisoformat(d_start[:10])
        end = date_cls.fromisoformat(d_end[:10])
    except ValueError:
        return []

    result: list[dict[str, Any]] = []
    last = {"gmv_rmb": 0, "orders": 0, "l1": 0, "l8": 0}
    prev_gmv = 0

    while cur <= end:
        ds = cur.isoformat()
        if ds in by_date:
            last = dict(by_date[ds])
        gmv_delta = max(0, last["gmv_rmb"] - prev_gmv)
        prev_gmv = last["gmv_rmb"]
        result.append({
            "date": ds,
            "gmv_rmb": last["gmv_rmb"],
            "gmv_rmb_delta": gmv_delta,
            "orders": last["orders"],
            "l1": last["l1"],
            "l8": last["l8"],
            "has_sync": ds in by_date,
            "collected_vnd": 0,
            "amount": last["gmv_rmb"],
            "collected": 0,
        })
        cur += timedelta(days=1)

    return result


def aggregate_daily_by_date(
    rows: list[dict], d_start: str, d_end: str,
) -> list[dict[str, Any]]:
    """Kiến trúc Hybrid — mỗi dòng DB = snapshot 1 ngày / 1 sale; cộng theo ngày."""
    from datetime import date as date_cls, timedelta

    by_date: dict[str, dict[str, int]] = {}
    for r in rows:
        d = str(r.get("report_date", ""))[:10]
        if not d or d < d_start or d > d_end:
            continue
        m = extract_row_metrics(r)
        bucket = by_date.setdefault(d, {"gmv_rmb": 0, "orders": 0, "l1": 0, "l8": 0})
        bucket["gmv_rmb"] += int(m["b3_gmv"])
        bucket["orders"] += int(m["l8"])
        bucket["l1"] += int(m["l1"])
        bucket["l8"] += int(m["l8"])

    try:
        cur = date_cls.fromisoformat(d_start[:10])
        end = date_cls.fromisoformat(d_end[:10])
    except ValueError:
        return []

    result: list[dict[str, Any]] = []
    while cur <= end:
        ds = cur.isoformat()
        b = by_date.get(ds, {"gmv_rmb": 0, "orders": 0, "l1": 0, "l8": 0})
        result.append({
            "date": ds,
            "gmv_rmb": b["gmv_rmb"],
            "orders": b["orders"],
            "l1": b["l1"],
            "l8": b["l8"],
            "has_sync": ds in by_date,
            "collected_vnd": 0,
            "amount": b["gmv_rmb"],
            "collected": 0,
        })
        cur += timedelta(days=1)

    return result


def daily_incremental_rows(rows: list[dict]) -> list[dict[str, Any]]:
    """Chênh lệch ngày từ snapshot tích lũy → biểu đồ doanh thu theo ngày."""
    by_sale: dict[str, list[tuple[str, dict]]] = {}
    for r in rows:
        key = row_identity_key(r)
        d = str(r.get("report_date", ""))[:10]
        if not d:
            continue
        by_sale.setdefault(key, []).append((d, r))

    date_map: dict[str, dict[str, Any]] = {}
    additive = ("b3_gmv", "l8")

    for series in by_sale.values():
        series.sort(key=lambda x: x[0])
        prev = empty_metrics()
        for d, r in series:
            m = extract_row_metrics(r)
            bucket = date_map.setdefault(
                d, {"date": d, "gmv_rmb": 0, "collected_vnd": 0, "orders": 0},
            )
            for k in additive:
                delta = int(m[k]) - int(prev[k])
                if delta > 0:
                    if k == "b3_gmv":
                        bucket["gmv_rmb"] += delta
                    elif k == "l8":
                        bucket["orders"] += delta
            prev = m

    # Backward-compatible aliases
    for b in date_map.values():
        b["amount"] = b["gmv_rmb"]
        b["collected"] = b["collected_vnd"]

    return sorted(date_map.values(), key=lambda x: x["date"])


def empty_metrics() -> dict[str, int | float]:
    return {
        "c1": 0.0,
        "c2": 0,
        "c4": 0.0,
        "c5": 0.0,
        "l1_0": 0,
        "l1_1": 0,
        "l1_2": 0,
        "l1": 0,
        "l3": 0,
        "l3_1": 0,
        "l3_3": 0.0,
        "l4": 0,
        "l8": 0,
        "b1_qr": 0,
        "b3_gmv": 0,
    }


def rate_per_call_time(numerator: int | float, call_time_minutes: float) -> float:
    """C4/C5 — PalFish: count / Total Call Time (phút) × 100."""
    return safe_divide(numerator, call_time_minutes, as_percent=True)


def preview_count_from_rate(preview_rate: float, scheduled: int) -> float:
    return float(preview_rate) / 100.0 * float(scheduled)


def extract_row_metrics(row: dict) -> dict[str, int | float]:
    """Normalize one crm_sales_data row → dashboard metric keys."""
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}

    ad = parse_metric(raw_get(raw, CRM_COLUMNS["l1_1_ad"]))
    ad_manual = parse_metric(raw_get(raw, CRM_COLUMNS["l1_1_ad_manual"]))
    l1_2 = parse_metric(raw_get(raw, CRM_COLUMNS["l1_2_referral"]))
    if not l1_2:
        l1_2 = parse_metric(row.get("referral_leads"))

    l4 = parse_metric(raw_get(raw, CRM_COLUMNS["l4_completed"]))
    if not l4:
        l4 = parse_metric(row.get("completed_classes"))

    b3 = parse_metric(raw_get(raw, CRM_COLUMNS["b3_gmv"]))
    if not b3:
        b3 = parse_metric(row.get("amount"))

    l1 = parse_metric(raw_get(raw, CRM_COLUMNS["l1_total"]))
    l3 = parse_metric(raw_get(raw, CRM_COLUMNS["l3_invitation"]))
    l8 = parse_metric(raw_get(raw, CRM_COLUMNS["l8_orders"]))

    c1 = parse_duration_minutes(raw_get(raw, CRM_COLUMNS["c1_call_time"]))
    c3 = parse_metric(raw_get(raw, CRM_COLUMNS["c3_connections"]))
    c5_count = parse_metric(raw_get(raw, CRM_COLUMNS["c5_over_3min_count"]))
    l3_1 = parse_metric(raw_get(raw, CRM_COLUMNS["l3_1_scheduled"]))
    preview_rate = parse_rate(raw_get(raw, CRM_COLUMNS["l3_3_preview_rate"]))

    return {
        "c1": c1,
        "c2": parse_metric(raw_get(raw, CRM_COLUMNS["c2_dials"])),
        "c3": c3,
        "c5_count": c5_count,
        "c4": rate_per_call_time(c3, c1),
        "c5": rate_per_call_time(c5_count, c1),
        "l1_0": parse_metric(raw_get(raw, CRM_COLUMNS["l1_0_gd"])),
        "l1_1": ad + ad_manual,
        "l1_2": l1_2,
        "l1": l1,
        "l3": l3,
        "l3_1": l3_1,
        "l3_3": preview_rate,
        "l4": l4,
        "l8": l8,
        "b1_qr": 0,
        "b3_gmv": b3,
    }


def extract_sale_detail(row: dict) -> dict[str, int | float | str]:
    """Một dòng crm_sales_data → object chi tiết cho bảng Dashboard (Việt hóa)."""
    raw = row.get("raw_data") if isinstance(row.get("raw_data"), dict) else {}
    m = extract_row_metrics(row)

    ad = parse_metric(raw_get(raw, CRM_COLUMNS["l1_1_ad"]))
    ad_manual = parse_metric(raw_get(raw, CRM_COLUMNS["l1_1_ad_manual"]))
    gmv = int(m["b3_gmv"])
    orders = int(m["l8"])
    scheduled = int(m["l3_1"])
    completed = int(m["l4"])

    completion_raw = raw_get(raw, CRM_COLUMNS["l4_completion_rate"])
    if completion_raw not in (None, ""):
        completion_rate = parse_rate(completion_raw)
    elif scheduled:
        completion_rate = round(safe_divide(completed, scheduled, as_percent=True), 2)
    else:
        completion_rate = 0.0

    avg_from_raw = raw_get(raw, ("avg_price", "Avg.Price per Customer (RMB)"))
    avg_price = (
        int(parse_metric(avg_from_raw))
        if avg_from_raw not in (None, "")
        else (int(safe_divide(gmv, orders)) if orders else 0)
    )

    dept = str(row.get("department") or "").strip()
    if not dept or dept.lower() in INVALID_TEAM_LABELS:
        dept = team_label(row)

    return {
        "department": dept or "—",
        "sale_name": sale_label(row),
        "ad_leads": ad,
        "ad_leads_manual": ad_manual,
        "referral_leads": int(m["l1_2"]),
        "total_leads": int(m["l1"]),
        "gd_leads": int(m["l1_0"]),
        "invitation_number": int(m["l3"]),
        "scheduled_classes": scheduled,
        "preview_rate": float(m["l3_3"]),
        "completed_classes": completed,
        "completion_rate": completion_rate,
        "orders": orders,
        "gmv_rmb": gmv,
        "avg_price": avg_price,
        "total_call_time": float(m["c1"]),
        "total_dials": int(m["c2"]),
        "total_connections": int(m["c3"]),
        "connection_rate": float(m["c4"]),
        "over_3min_connections": int(m["c5_count"]),
        "over_3min_rate": float(m["c5"]),
        # aliases chart / legacy
        "team": team_label(row),
        "total_amount": gmv,
        "collected": 0,
        "collected_vnd": 0,
        "l1": int(m["l1"]),
        "l3": int(m["l3"]),
        "l4": completed,
        "l8": orders,
        "l1_2": int(m["l1_2"]),
        "c2": int(m["c2"]),
    }


def _recompute_merged_sale_rates(acc: dict) -> None:
    """Tính lại % sau khi gộp nhiều ngày — C4/C5 theo C1, L3.3 theo L3.1."""
    acc["connection_rate"] = rate_per_call_time(
        acc.get("total_connections") or 0,
        float(acc.get("total_call_time") or 0),
    )
    acc["over_3min_rate"] = rate_per_call_time(
        acc.get("over_3min_connections") or 0,
        float(acc.get("total_call_time") or 0),
    )
    scheduled = int(acc.get("scheduled_classes") or 0)
    preview_done = float(acc.get("_preview_done") or 0)
    acc["preview_rate"] = safe_divide(preview_done, scheduled, as_percent=True)
    acc["completion_rate"] = safe_divide(
        int(acc.get("completed_classes") or 0), scheduled, as_percent=True,
    )


def merge_sale_detail(acc: dict, detail: dict) -> dict:
    """Gộp nhiều dòng cùng sale (nhiều ngày trong kỳ)."""
    acc_preview = float(acc.get("_preview_done") or 0)
    if not acc_preview:
        acc_preview = preview_count_from_rate(
            float(acc.get("preview_rate") or 0),
            int(acc.get("scheduled_classes") or 0),
        )
    detail_preview = preview_count_from_rate(
        float(detail.get("preview_rate") or 0),
        int(detail.get("scheduled_classes") or 0),
    )

    sum_keys = (
        "ad_leads", "ad_leads_manual", "referral_leads", "total_leads", "gd_leads",
        "invitation_number", "scheduled_classes", "completed_classes", "orders", "gmv_rmb",
        "total_dials", "total_connections", "over_3min_connections",
        "l1", "l3", "l4", "l8", "l1_2", "c2",
    )
    for k in sum_keys:
        acc[k] = int(acc.get(k) or 0) + int(detail.get(k) or 0)
    acc["total_amount"] = acc["gmv_rmb"]
    orders = int(acc["orders"])
    acc["avg_price"] = int(safe_divide(acc["gmv_rmb"], orders)) if orders else 0
    acc["total_call_time"] = float(acc.get("total_call_time") or 0) + float(detail.get("total_call_time") or 0)
    acc["_preview_done"] = acc_preview + detail_preview
    _recompute_merged_sale_rates(acc)
    return acc


def conversion_rates(l1: int, l3: int, l4: int, l8: int) -> list[dict]:
    return [
        {"label": "L3/L1", "value": safe_divide(l3, l1, as_percent=True)},
        {"label": "L4/L3", "value": safe_divide(l4, l3, as_percent=True)},
        {"label": "L8/L4", "value": safe_divide(l8, l4, as_percent=True)},
    ]


def sum_metrics(rows: list[dict]) -> dict[str, int | float]:
    """Sum counts; recompute C4/C5/L3.3 from aggregated numerators (PalFish formulas)."""
    tot = empty_metrics()
    c3_sum = 0
    c5_count_sum = 0
    preview_count_sum = 0.0

    for row in rows:
        m = extract_row_metrics(row)
        for k in ("c1", "c2", "l1_0", "l1_1", "l1_2", "l1", "l3", "l3_1", "l4", "l8", "b3_gmv"):
            tot[k] = (tot[k] or 0) + (m[k] or 0)  # type: ignore[operator]
        c3_sum += int(m.get("c3") or 0)
        c5_count_sum += int(m.get("c5_count") or 0)
        scheduled = int(m.get("l3_1") or 0)
        if scheduled:
            preview_count_sum += preview_count_from_rate(float(m.get("l3_3") or 0), scheduled)

    tot["c4"] = rate_per_call_time(c3_sum, float(tot.get("c1") or 0))
    tot["c5"] = rate_per_call_time(c5_count_sum, float(tot.get("c1") or 0))
    tot["l3_3"] = safe_divide(preview_count_sum, int(tot.get("l3_1") or 0), as_percent=True)
    tot["b1_qr"] = 0
    return tot


_SUPABASE_PAGE = 1000


def exclude_legacy_summary_rows(rows: list[dict]) -> list[dict]:
    """Bỏ dòng dual-pull cũ (record_type=summary) — MTD gom 1 ngày cuối."""
    return [
        r for r in rows
        if str(r.get("record_type") or "").strip().lower() != "summary"
    ]


def fetch_crm_sales_rows(
    sb,
    d_start: str,
    d_end: str,
    *,
    sale: str | None = None,
    team: str | None = None,
    department: str | None = None,
) -> list[dict]:
    """Paginate crm_sales_data — PostgREST mặc định giới hạn 1000 dòng/request."""
    rows: list[dict] = []
    offset = 0
    while True:
        q = (
            sb.table("crm_sales_data")
            .select("*")
            .gte("report_date", d_start)
            .lte("report_date", d_end)
            .order("report_date")
            .order("sale_name")
        )
        if sale:
            q = q.eq("sale_name", sale)
        if team:
            q = q.eq("team", team)
        if department:
            q = q.eq("department", department)
        chunk = q.range(offset, offset + _SUPABASE_PAGE - 1).execute().data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < _SUPABASE_PAGE:
            break
        offset += _SUPABASE_PAGE
    return rows


def sync_coverage_meta(rows: list[dict], d_start: str, d_end: str) -> dict[str, Any]:
    """Ngày nào đã có dòng daily trong DB vs kỳ báo cáo."""
    from datetime import date as date_cls, timedelta

    synced = sorted({
        str(r.get("report_date", ""))[:10]
        for r in rows
        if r.get("report_date")
    })
    try:
        cur = date_cls.fromisoformat(d_start[:10])
        end = date_cls.fromisoformat(d_end[:10])
    except ValueError:
        return {"synced_dates": synced, "synced_days": len(synced), "expected_days": 0, "missing_dates": []}

    expected: list[str] = []
    while cur <= end:
        expected.append(cur.isoformat())
        cur += timedelta(days=1)
    missing = [d for d in expected if d not in synced]
    return {
        "synced_dates": synced,
        "synced_days": len(synced),
        "expected_days": len(expected),
        "missing_dates": missing,
    }
