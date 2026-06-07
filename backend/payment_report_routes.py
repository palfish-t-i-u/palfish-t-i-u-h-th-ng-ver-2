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

    app.include_router(router)
