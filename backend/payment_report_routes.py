import io
from collections import defaultdict
from datetime import date, timedelta

import openpyxl
from fastapi import APIRouter, Header, Query, HTTPException
from fastapi.responses import StreamingResponse

from rbac import resolve_actor, require_min_role

router = APIRouter(prefix="/api/v1")


def register_payment_report_routes(app, supabase):

    # ══════════════════════════════════════════════════════════════
    #  SHARED GUARD CLAUSES & RBAC
    # ══════════════════════════════════════════════════════════════

    def _guard_and_rbac(date_from: date, date_to: date, authorization: str | None):
        """Validate date range and RBAC. Returns delta_days."""
        if not supabase:
            raise HTTPException(503, "Supabase chưa được cấu hình")

        delta_days = (date_to - date_from).days
        if delta_days < 0:
            raise HTTPException(
                status_code=400,
                detail="date_from không được lớn hơn date_to.",
            )
        if delta_days > 93:
            raise HTTPException(
                status_code=400,
                detail="Khoảng thời gian truy vấn tối đa là 93 ngày để tránh quá tải hệ thống.",
            )

        try:
            actor = resolve_actor(supabase, authorization)
            require_min_role(actor, "leader")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(401, f"Lỗi xác thực: {exc}")

        return delta_days

    # ══════════════════════════════════════════════════════════════
    #  REUSABLE DATA-FETCHING HELPERS
    # ══════════════════════════════════════════════════════════════

    def _get_bctb_data(date_from: date, date_to: date):
        """Core logic for BCTB report. Returns (date_keys, sorted_data)."""
        delta_days = (date_to - date_from).days

        # ── 1. Fetch payments in range ────────────────────────
        start_str = f"{date_from}T00:00:00"
        end_str = f"{date_to}T23:59:59"

        payments_res = (
            supabase.table("payments")
            .select("pay_time, sale_id, gmv_vnd, gmv_rmb, gmv_final")
            .gte("pay_time", start_str)
            .lte("pay_time", end_str)
            .execute()
        )
        payments = payments_res.data or []

        # Extract unique sale_ids (defensive: skip None)
        unique_sale_ids = set()
        for p in payments:
            sid = p.get("sale_id")
            if sid is not None:
                unique_sale_ids.add(sid)

        # ── 2. Fetch active sales ─────────────────────────────
        active_sales_res = (
            supabase.table("nhan_su_sale")
            .select("id, crm_name, team, sub_team, department")
            .eq("is_active", True)
            .execute()
        )
        all_fetched_sales = active_sales_res.data or []
        active_sales_keys = {
            s["id"] for s in all_fetched_sales if s.get("id") is not None
        }

        # ── 3. Fetch inactive sales that have transactions ────
        # Defensive #1: filter out None to prevent .in_() crash
        missing_ids = [
            sid
            for sid in unique_sale_ids
            if sid is not None and sid not in active_sales_keys
        ]
        if missing_ids:
            missing_res = (
                supabase.table("nhan_su_sale")
                .select("id, crm_name, team, sub_team, department")
                .in_("id", missing_ids)
                .execute()
            )
            all_fetched_sales.extend(missing_res.data or [])

        sales_dict = {
            sale["id"]: sale
            for sale in all_fetched_sales
            if sale.get("id") is not None
        }

        # ── 4. Zero-fill template ─────────────────────────────
        date_keys = [
            (date_from + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(delta_days + 1)
        ]
        date_keys_set = set(date_keys)  # O(1) lookup

        report_data = {}
        for sid, sale in sales_dict.items():
            report_data[sid] = {
                "sale_id": sid,
                "crm_name": sale.get("crm_name"),
                "department": sale.get("department"),
                "team": sale.get("team"),
                "sub_team": sale.get("sub_team"),
                "days": {
                    d: {"gmv_vnd": 0, "gmv_rmb": 0, "gmv_final": 0, "count": 0}
                    for d in date_keys
                },
                "total": {"gmv_vnd": 0, "gmv_rmb": 0, "gmv_final": 0, "count": 0},
            }

        # ── 5. Data Aggregation ───────────────────────────────
        for p in payments:
            # Defensive #2: guard against missing pay_time
            pay_time = p.get("pay_time")
            if not pay_time:
                continue

            day_str = pay_time[:10]
            sid = p.get("sale_id")

            if day_str in date_keys_set and sid in report_data:
                gv = float(p.get("gmv_vnd") or 0)
                gr = float(p.get("gmv_rmb") or 0)
                gf = float(p.get("gmv_final") or 0)

                # update day bucket
                bucket = report_data[sid]["days"][day_str]
                bucket["gmv_vnd"] += gv
                bucket["gmv_rmb"] += gr
                bucket["gmv_final"] += gf
                bucket["count"] += 1

                # update running total
                total = report_data[sid]["total"]
                total["gmv_vnd"] += gv
                total["gmv_rmb"] += gr
                total["gmv_final"] += gf
                total["count"] += 1

        # ── 6. Sort (Defensive #3: safe sort on None) ─────────
        sorted_data = sorted(
            report_data.values(),
            key=lambda x: (
                str(x.get("department") or ""),
                str(x.get("team") or ""),
                str(x.get("crm_name") or ""),
            ),
        )

        return date_keys, sorted_data

    def _get_team_data(date_from: date, date_to: date):
        """Core logic for Team report. Returns rows list."""
        start_str = f"{date_from}T00:00:00"
        end_str = f"{date_to}T23:59:59"

        payments_res = (
            supabase.table("payments")
            .select("sale_id, gmv_final, real_pay_vnd, gmv_rmb")
            .gte("pay_time", start_str)
            .lte("pay_time", end_str)
            .execute()
        )
        payments = payments_res.data or []

        # Early Return: no payments → no rows
        if not payments:
            return []

        # Extract unique sale_ids (exclude None)
        unique_sale_ids = set()
        for p in payments:
            sid = p.get("sale_id")
            if sid is not None:
                unique_sale_ids.add(sid)

        # Fetch sales data from `sales` table
        sale_mapping = {}
        if unique_sale_ids:
            sales_res = (
                supabase.table("sales")
                .select("id, team, khoi")
                .in_("id", list(unique_sale_ids))
                .execute()
            )
            sale_mapping = {
                s["id"]: (
                    s.get("khoi") or "Không xác định",
                    s.get("team") or "Không xác định",
                )
                for s in (sales_res.data or [])
            }

        # Aggregate by (khoi, team)
        report = defaultdict(
            lambda: {"gmv_final": 0, "real_pay_vnd": 0, "gmv_rmb": 0, "count": 0}
        )

        for p in payments:
            sale_id = p.get("sale_id")
            khoi, team = sale_mapping.get(
                sale_id, ("Không xác định", "Không xác định")
            )

            key = (khoi, team)
            report[key]["gmv_final"] += float(p.get("gmv_final") or 0)
            report[key]["real_pay_vnd"] += float(p.get("real_pay_vnd") or 0)
            report[key]["gmv_rmb"] += float(p.get("gmv_rmb") or 0)
            report[key]["count"] += 1

        # Build & sort rows
        rows = [
            {
                "khoi": k[0],
                "team": k[1],
                "gmv_final": v["gmv_final"],
                "real_pay_vnd": v["real_pay_vnd"],
                "gmv_rmb": v["gmv_rmb"],
                "count": v["count"],
            }
            for k, v in report.items()
        ]
        rows.sort(key=lambda x: (x["khoi"], x["team"]))

        return rows

    def _get_channel_data(date_from: date, date_to: date):
        """Core logic for Channel report. Returns rows list."""
        start_str = f"{date_from}T00:00:00"
        end_str = f"{date_to}T23:59:59"

        payments_res = (
            supabase.table("payments")
            .select("sale_id, gmv_final, real_pay_vnd, gmv_rmb")
            .gte("pay_time", start_str)
            .lte("pay_time", end_str)
            .execute()
        )
        payments = payments_res.data or []

        # Early Return: no payments → no rows
        if not payments:
            return []

        # Extract unique sale_ids (exclude None)
        unique_sale_ids = set()
        for p in payments:
            sid = p.get("sale_id")
            if sid is not None:
                unique_sale_ids.add(sid)

        # Fetch sales data from `sales` table (channel column)
        sale_mapping = {}
        if unique_sale_ids:
            sales_res = (
                supabase.table("sales")
                .select("id, channel")
                .in_("id", list(unique_sale_ids))
                .execute()
            )
            sale_mapping = {
                s["id"]: s.get("channel") or "Không xác định"
                for s in (sales_res.data or [])
            }

        # Aggregate by channel
        report = defaultdict(
            lambda: {"gmv_final": 0, "real_pay_vnd": 0, "gmv_rmb": 0, "count": 0}
        )

        for p in payments:
            sale_id = p.get("sale_id")
            channel = sale_mapping.get(sale_id, "Không xác định")

            report[channel]["gmv_final"] += float(p.get("gmv_final") or 0)
            report[channel]["real_pay_vnd"] += float(p.get("real_pay_vnd") or 0)
            report[channel]["gmv_rmb"] += float(p.get("gmv_rmb") or 0)
            report[channel]["count"] += 1

        # Build & sort rows
        rows = [
            {
                "channel": k,
                "gmv_final": v["gmv_final"],
                "real_pay_vnd": v["real_pay_vnd"],
                "gmv_rmb": v["gmv_rmb"],
                "count": v["count"],
            }
            for k, v in report.items()
        ]
        rows.sort(key=lambda x: x["channel"])

        return rows

    # ══════════════════════════════════════════════════════════════
    #  API ENDPOINTS
    # ══════════════════════════════════════════════════════════════

    @router.get("/recon/internal")
    def get_internal_reconciliation(
        authorization: str | None = Header(None),
        base_rate: float = Query(3700.0, description="Base exchange rate RMB to VND"),
        threshold: float = Query(0.2, description="Deviation threshold percentage (e.g. 0.2 for 20%)"),
    ):
        if not supabase:
            raise HTTPException(503, "Supabase chưa được cấu hình")

        try:
            actor = resolve_actor(supabase, authorization)
            require_min_role(actor, "leader")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(401, f"Lỗi xác thực: {exc}")

        try:
            res = supabase.rpc(
                "get_payment_warnings",
                {"base_rate": base_rate, "threshold": threshold}
            ).execute()
            return {"status": "success", "data": res.data or []}
        except Exception as exc:
            raise HTTPException(500, f"Lỗi gọi RPC đối soát nội bộ: {exc}")

    @router.get("/reports/bctb")
    def get_bctb_report(
        date_from: date,
        date_to: date,
        authorization: str | None = Header(None),
    ):
        """Báo cáo tổng hợp doanh số theo ngày (Zero-fill, Guard Clause, Defensive)."""
        _guard_and_rbac(date_from, date_to, authorization)

        try:
            date_keys, sorted_data = _get_bctb_data(date_from, date_to)
            return {
                "status": "success",
                "date_keys": date_keys,
                "data": sorted_data,
            }
        except HTTPException:
            raise
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise HTTPException(500, f"Lỗi tạo báo cáo BCTB: {exc}")

    @router.get("/reports/team")
    def get_team_report(
        date_from: date,
        date_to: date,
        authorization: str | None = Header(None),
    ):
        """Báo cáo doanh số theo Team (Aggregated, Early Return, Fallback)."""
        _guard_and_rbac(date_from, date_to, authorization)

        try:
            rows = _get_team_data(date_from, date_to)
            return {"status": "success", "rows": rows}
        except HTTPException:
            raise
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise HTTPException(500, f"Lỗi tạo báo cáo Team: {exc}")

    @router.get("/reports/channel")
    def get_channel_report(
        date_from: date,
        date_to: date,
        authorization: str | None = Header(None),
    ):
        """Báo cáo doanh số theo Kênh (Aggregated, Early Return, Fallback)."""
        _guard_and_rbac(date_from, date_to, authorization)

        try:
            rows = _get_channel_data(date_from, date_to)
            return {"status": "success", "rows": rows}
        except HTTPException:
            raise
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise HTTPException(500, f"Lỗi tạo báo cáo Kênh: {exc}")

    # ══════════════════════════════════════════════════════════════
    #  EXCEL EXPORT ENDPOINT
    # ══════════════════════════════════════════════════════════════

    @router.get("/reports/{report_type}/export")
    def export_report(
        report_type: str,
        date_from: date = Query(..., alias="from"),
        date_to: date = Query(..., alias="to"),
        authorization: str | None = Header(None),
    ):
        """Xuất báo cáo ra file Excel (.xlsx)."""
        if report_type not in ("bctb", "team", "channel"):
            raise HTTPException(
                status_code=400,
                detail=f"Loại báo cáo không hợp lệ: '{report_type}'. Chỉ hỗ trợ: bctb, team, channel.",
            )

        _guard_and_rbac(date_from, date_to, authorization)

        try:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = report_type.upper()

            if report_type == "team":
                rows = _get_team_data(date_from, date_to)
                headers = ["Khối", "Team", "GMV Final", "Doanh thu VNĐ", "GMV RMB", "Số đơn"]
                ws.append(headers)
                for r in rows:
                    ws.append([
                        r.get("khoi", ""),
                        r.get("team", ""),
                        r.get("gmv_final", 0),
                        r.get("real_pay_vnd", 0),
                        r.get("gmv_rmb", 0),
                        r.get("count", 0),
                    ])

            elif report_type == "channel":
                rows = _get_channel_data(date_from, date_to)
                headers = ["Kênh", "GMV Final", "Doanh thu VNĐ", "GMV RMB", "Số đơn"]
                ws.append(headers)
                for r in rows:
                    ws.append([
                        r.get("channel", ""),
                        r.get("gmv_final", 0),
                        r.get("real_pay_vnd", 0),
                        r.get("gmv_rmb", 0),
                        r.get("count", 0),
                    ])

            elif report_type == "bctb":
                date_keys, sorted_data = _get_bctb_data(date_from, date_to)
                headers = (
                    ["Phòng ban", "Team", "Nhân viên"]
                    + date_keys
                    + ["Total GMV", "Total VNĐ", "Total RMB", "Total Đơn"]
                )
                ws.append(headers)
                for row in sorted_data:
                    base = [
                        row.get("department") or "",
                        row.get("team") or "",
                        row.get("crm_name") or "",
                    ]
                    days = row.get("days", {})
                    day_values = [
                        days.get(d, {}).get("gmv_final", 0) for d in date_keys
                    ]
                    total = row.get("total", {})
                    totals = [
                        total.get("gmv_final", 0),
                        total.get("gmv_vnd", 0),
                        total.get("gmv_rmb", 0),
                        total.get("count", 0),
                    ]
                    ws.append(base + day_values + totals)

            # ── Stream Excel response ─────────────────────────
            buf = io.BytesIO()
            wb.save(buf)
            buf.seek(0)
            filename = f"report_{report_type}_{date_from}_{date_to}.xlsx"

            return StreamingResponse(
                buf,
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )

        except HTTPException:
            raise
        except Exception as exc:
            import traceback
            traceback.print_exc()
            raise HTTPException(500, f"Lỗi xuất báo cáo Excel: {exc}")

    app.include_router(router)
