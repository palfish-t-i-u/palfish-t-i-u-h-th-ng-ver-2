from datetime import date, timedelta
from fastapi import APIRouter, Header, Query, HTTPException

from rbac import resolve_actor, require_min_role

router = APIRouter(prefix="/api/v1")

def register_payment_report_routes(app, supabase):
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
        if not supabase:
            raise HTTPException(503, "Supabase chưa được cấu hình")

        # ── Guard Clauses ─────────────────────────────────────────
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

        # ── RBAC ──────────────────────────────────────────────────
        try:
            actor = resolve_actor(supabase, authorization)
            require_min_role(actor, "leader")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(401, f"Lỗi xác thực: {exc}")

        try:
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

            # ── 6. Return (Defensive #3: safe sort on None) ───────
            sorted_data = sorted(
                report_data.values(),
                key=lambda x: (
                    str(x.get("department") or ""),
                    str(x.get("team") or ""),
                    str(x.get("crm_name") or ""),
                ),
            )

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

    app.include_router(router)
