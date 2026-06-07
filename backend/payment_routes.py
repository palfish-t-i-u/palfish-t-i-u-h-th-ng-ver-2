"""Module Quản lý Doanh thu (payments) — song song Sổ doanh thu cũ."""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import Header, HTTPException, Query
from pydantic import BaseModel, Field

from admin_routes import require_module_access, require_module_write
from analytics_limits import MAX_ANALYTICS_ROWS, fetch_rows_capped
from payment_logic import compute_gmv_final
from rbac import require_min_role, resolve_actor

PAYMENT_SELECT = (
    "*, customers(full_name, phone), "
    "sales(short_code, full_name, team, khoi), "
    "channels(name, type, channel_code), "
    "packages(name, fixed)"
)

SUMMARY_SELECT = "payment_id, real_pay_vnd, gmv_final, bank_matched, crm_activated, status"


def _parse_pay_time(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise HTTPException(400, "pay_time không hợp lệ")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _apply_payment_filters(
    q,
    *,
    search: str = "",
    date_from: date | None = None,
    date_to: date | None = None,
    team: str = "",
    channel_id: str = "",
    sale_id: str = "",
    status: str = "",
    bank_matched: str = "",
    crm_activated: str = "",
    sb=None,
):
    q = q.is_("deleted_at", "null")
    if search.strip():
        term = search.strip()
        parts = [f"uid.ilike.%{term}%", f"note.ilike.%{term}%"]
        if sb is not None:
            extra_uids = _search_customer_uids(sb, term)
            if extra_uids:
                parts.append(f"uid.in.({','.join(extra_uids)})")
        q = q.or_(",".join(parts))
    if date_from:
        q = q.gte("pay_time", f"{date_from.isoformat()}T00:00:00")
    if date_to:
        q = q.lte("pay_time", f"{date_to.isoformat()}T23:59:59")
    if team:
        q = q.eq("team", team.strip())
    if channel_id:
        q = q.eq("channel_id", channel_id.strip())
    if sale_id:
        q = q.eq("sale_id", sale_id.strip())
    if status:
        q = q.eq("status", status.strip())
    if bank_matched in ("true", "false"):
        q = q.eq("bank_matched", bank_matched == "true")
    if crm_activated in ("true", "false"):
        q = q.eq("crm_activated", crm_activated == "true")
    return q


def _build_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    active_rows = [r for r in rows if r.get("status") == "active"]
    return {
        "gmv_final": sum(float(r.get("gmv_final") or 0) for r in active_rows),
        "real_pay_vnd": sum(float(r.get("real_pay_vnd") or 0) for r in active_rows),
        "count": len(rows),
        "unmatched_bank": sum(1 for r in rows if not r.get("bank_matched")),
        "uncrm": sum(1 for r in active_rows if not r.get("crm_activated")),
    }


def _fetch_payment_row(sb, payment_id: str) -> dict[str, Any]:
    res = (
        sb.table("payments")
        .select(PAYMENT_SELECT)
        .eq("payment_id", payment_id)
        .is_("deleted_at", "null")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, f"Payment {payment_id} không tồn tại")
    return res.data[0]


def _search_customer_uids(sb, term: str) -> list[str]:
    res = (
        sb.table("customers")
        .select("uid")
        .or_(f"uid.ilike.%{term}%,full_name.ilike.%{term}%,phone.ilike.%{term}%")
        .limit(50)
        .execute()
    )
    return [str(r["uid"]) for r in (res.data or []) if r.get("uid")]


class PaymentCreate(BaseModel):
    uid: str
    pay_time: datetime
    package_id: str | None = None
    sale_id: str
    channel_id: str | None = None
    real_pay_vnd: float = Field(..., gt=0)
    gmv_rmb: float | None = None
    payment_seq: str | None = None
    note: str | None = None
    bank_day: date | None = None
    customer_name: str | None = None
    customer_phone: str | None = None


class PaymentPatch(BaseModel):
    uid: str | None = None
    pay_time: datetime | None = None
    real_pay_vnd: float | None = None
    gmv_rmb: float | None = None
    sale_id: str | None = None
    channel_id: str | None = None
    package_id: str | None = None
    payment_seq: str | None = None
    note: str | None = None
    bank_day: date | None = None
    team: str | None = None


class LinkCrmBody(BaseModel):
    crm_order_id: str = Field(..., min_length=1)


class SaleCreate(BaseModel):
    full_name: str
    short_code: str | None = None
    team: str | None = None
    khoi: str | None = None
    active: bool = True


class SalePatch(BaseModel):
    full_name: str | None = None
    short_code: str | None = None
    team: str | None = None
    khoi: str | None = None
    active: bool | None = None


class ChannelCreate(BaseModel):
    channel_code: str | None = None
    name: str | None = None
    type: str | None = None


class ChannelPatch(BaseModel):
    channel_code: str | None = None
    name: str | None = None
    type: str | None = None


class PackageCreate(BaseModel):
    name: str
    fixed: str | None = None


class PackagePatch(BaseModel):
    name: str | None = None
    fixed: str | None = None


class CustomerPatch(BaseModel):
    full_name: str | None = None
    phone: str | None = None


def _trim(value: str | None) -> str | None:
    if value is None:
        return None
    s = value.strip()
    return s or None


def _trim_patch(body: BaseModel) -> dict[str, Any]:
    update: dict[str, Any] = {}
    for key, value in body.model_dump(exclude_none=True).items():
        if isinstance(value, str):
            trimmed = _trim(value)
            if trimmed is not None:
                update[key] = trimmed
        else:
            update[key] = value
    return update


def _patch_master_row(
    sb,
    *,
    table: str,
    id_field: str,
    id_value: str,
    update: dict[str, Any],
    select: str,
) -> dict[str, Any]:
    if not update:
        raise HTTPException(400, "Không có dữ liệu cập nhật")
    res = (
        sb.table(table)
        .update(update)
        .eq(id_field, id_value)
        .select(select)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, f"{table} {id_value} không tồn tại")
    return res.data[0]


def register_payment_routes(app, sb_getter) -> None:
    def _sb():
        sb = sb_getter()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        return sb

    @app.get("/api/v1/payments", tags=["Payments"])
    def list_payments(
        search: str = Query(""),
        date_from: date | None = Query(None, alias="from"),
        date_to: date | None = Query(None, alias="to"),
        team: str = Query(""),
        channel_id: str = Query(""),
        sale_id: str = Query(""),
        status: str = Query(""),
        bank_matched: str = Query(""),
        crm_activated: str = Query(""),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")

        offset = (page - 1) * page_size
        q = sb.table("payments").select(PAYMENT_SELECT, count="exact")
        q = _apply_payment_filters(
            q,
            search=search,
            date_from=date_from,
            date_to=date_to,
            team=team,
            channel_id=channel_id,
            sale_id=sale_id,
            status=status,
            bank_matched=bank_matched,
            crm_activated=crm_activated,
            sb=sb,
        )

        q = q.order("pay_time", desc=True).range(offset, offset + page_size - 1)
        res = q.execute()
        items = res.data or []
        total = int(res.count or len(items))

        def fetch_summary_page(off: int, limit: int) -> list[dict[str, Any]]:
            sq = sb.table("payments").select(SUMMARY_SELECT)
            sq = _apply_payment_filters(
                sq,
                search=search,
                date_from=date_from,
                date_to=date_to,
                team=team,
                channel_id=channel_id,
                sale_id=sale_id,
                status=status,
                bank_matched=bank_matched,
                crm_activated=crm_activated,
                sb=sb,
            )
            sq = sq.order("pay_time", desc=True).range(off, off + limit - 1)
            return sq.execute().data or []

        summary_rows, truncated = fetch_rows_capped(
            fetch_summary_page,
            page_size=1000,
            cap=MAX_ANALYTICS_ROWS,
            log_prefix="[payments] summary",
        )
        summary = _build_summary(summary_rows)
        if truncated:
            summary["truncated"] = True

        return {"items": items, "total": total, "summary": summary}

    @app.post("/api/v1/payments", tags=["Payments"])
    def create_payment(
        body: PaymentCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")

        uid = body.uid.strip()
        if not uid:
            raise HTTPException(400, "uid không được rỗng")

        existing = sb.table("customers").select("uid").eq("uid", uid).limit(1).execute()
        if not existing.data:
            sb.table("customers").insert(
                {
                    "uid": uid,
                    "full_name": (body.customer_name or "").strip() or None,
                    "phone": (body.customer_phone or "").strip() or None,
                    "first_seen": body.pay_time.date().isoformat(),
                }
            ).execute()

        sale_res = (
            sb.table("sales")
            .select("team")
            .eq("id", body.sale_id)
            .limit(1)
            .execute()
        )
        if not sale_res.data:
            raise HTTPException(400, "sale_id không tồn tại")
        team_raw = str(sale_res.data[0].get("team") or "").strip()
        if not team_raw:
            raise HTTPException(400, "sale chưa có team")

        pay_time = _parse_pay_time(body.pay_time)
        real_vnd = Decimal(str(body.real_pay_vnd))
        gmv_rmb = Decimal(str(body.gmv_rmb)) if body.gmv_rmb is not None else None
        gmv_final = compute_gmv_final(pay_time, real_vnd, gmv_rmb)

        row = {
            "uid": uid,
            "pay_time": pay_time.isoformat(),
            "bank_day": (body.bank_day or pay_time.date()).isoformat(),
            "package_id": body.package_id,
            "sale_id": body.sale_id,
            "channel_id": body.channel_id,
            "real_pay_vnd": float(real_vnd),
            "gmv_rmb": float(gmv_rmb) if gmv_rmb is not None else None,
            "gmv_final": float(gmv_final),
            "payment_seq": body.payment_seq,
            "team": team_raw,
            "note": body.note,
            "status": "active",
        }
        try:
            res = sb.table("payments").insert(row).execute()
        except Exception as exc:
            if "payments_bizkey" in str(exc).lower() or "duplicate" in str(exc).lower():
                raise HTTPException(409, "Trùng uid + pay_time + real_pay_vnd") from exc
            raise HTTPException(500, f"Không tạo payment: {exc}") from exc
        if not res.data:
            raise HTTPException(500, "Không tạo payment")
        return _fetch_payment_row(sb, res.data[0]["payment_id"])

    @app.patch("/api/v1/payments/{payment_id}", tags=["Payments"])
    def patch_payment(
        payment_id: str,
        body: PaymentPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")

        update = body.model_dump(exclude_none=True)
        if not update:
            raise HTTPException(400, "Không có dữ liệu cập nhật")

        current = (
            sb.table("payments")
            .select("pay_time, real_pay_vnd, gmv_rmb, sale_id, team")
            .eq("payment_id", payment_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not current.data:
            raise HTTPException(404, f"Payment {payment_id} không tồn tại")
        cur = current.data[0]

        if any(k in update for k in ("pay_time", "real_pay_vnd", "gmv_rmb")):
            pt_raw = update.get("pay_time", cur["pay_time"])
            pt = _parse_pay_time(pt_raw)
            rpv = Decimal(str(update.get("real_pay_vnd", cur["real_pay_vnd"])))
            grmb_raw = update.get("gmv_rmb", cur.get("gmv_rmb"))
            grmb = Decimal(str(grmb_raw)) if grmb_raw is not None else None
            update["gmv_final"] = float(compute_gmv_final(pt, rpv, grmb))
            if "pay_time" in update:
                update["pay_time"] = pt.isoformat()

        if "sale_id" in update and "team" not in update:
            sale = (
                sb.table("sales")
                .select("team")
                .eq("id", update["sale_id"])
                .limit(1)
                .execute()
            )
            if not sale.data:
                raise HTTPException(400, "sale_id không tồn tại")
            update["team"] = sale.data[0].get("team") or cur.get("team") or ""

        if "bank_day" in update and isinstance(update["bank_day"], date):
            update["bank_day"] = update["bank_day"].isoformat()

        update["updated_at"] = _now_iso()
        res = (
            sb.table("payments")
            .update(update)
            .eq("payment_id", payment_id)
            .is_("deleted_at", "null")
            .execute()
        )
        if not res.data:
            return _fetch_payment_row(sb, payment_id)
        return _fetch_payment_row(sb, payment_id)

    @app.post("/api/v1/payments/{payment_id}/refund", tags=["Payments"])
    def refund_payment(payment_id: str, authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        sb.table("payments").update(
            {"status": "refunded", "updated_at": _now_iso()}
        ).eq("payment_id", payment_id).is_("deleted_at", "null").execute()
        return {"ok": True, "status": "refunded", "payment_id": payment_id}

    @app.post("/api/v1/payments/{payment_id}/restore", tags=["Payments"])
    def restore_payment(payment_id: str, authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        sb.table("payments").update(
            {"status": "active", "updated_at": _now_iso()}
        ).eq("payment_id", payment_id).is_("deleted_at", "null").execute()
        return {"ok": True, "status": "active", "payment_id": payment_id}

    @app.post("/api/v1/payments/{payment_id}/link-crm", tags=["Payments"])
    def link_crm(
        payment_id: str,
        body: LinkCrmBody,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        sb.table("payments").update(
            {
                "crm_order_id": body.crm_order_id.strip(),
                "crm_activated": True,
                "activated_at": date.today().isoformat(),
                "updated_at": _now_iso(),
            }
        ).eq("payment_id", payment_id).is_("deleted_at", "null").execute()
        return {"ok": True, "payment_id": payment_id, "crm_order_id": body.crm_order_id}

    @app.delete("/api/v1/payments/{payment_id}", tags=["Payments"])
    def delete_payment(payment_id: str, authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")
        sb.table("payments").update({"deleted_at": _now_iso()}).eq(
            "payment_id", payment_id
        ).execute()
        return {"ok": True, "payment_id": payment_id}

    @app.get("/api/v1/customers/search", tags=["Payments"])
    def search_customers(
        q: str = Query(..., min_length=1),
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")
        term = q.strip()
        res = (
            sb.table("customers")
            .select("uid, full_name, phone")
            .or_(f"uid.ilike.%{term}%,full_name.ilike.%{term}%,phone.ilike.%{term}%")
            .limit(20)
            .execute()
        )
        return res.data or []

    @app.get("/api/v1/payments/master/sales", tags=["Payments"])
    def list_sales_master(authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")
        res = (
            sb.table("sales")
            .select("id, full_name, short_code, team, khoi, active")
            .eq("active", True)
            .order("full_name")
            .execute()
        )
        return res.data or []

    @app.get("/api/v1/payments/master/channels", tags=["Payments"])
    def list_channels_master(authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")
        res = (
            sb.table("channels")
            .select("id, channel_code, name, type")
            .order("type")
            .execute()
        )
        return res.data or []

    @app.get("/api/v1/payments/master/packages", tags=["Payments"])
    def list_packages_master(authorization: str | None = Header(None)):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")
        res = sb.table("packages").select("id, name, fixed").order("name").execute()
        return res.data or []

    @app.post("/api/v1/payments/master/sales", tags=["Payments"])
    def create_sale_master(
        body: SaleCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        full_name = _trim(body.full_name)
        if not full_name:
            raise HTTPException(400, "full_name không được rỗng")
        row = {
            "full_name": full_name,
            "short_code": _trim(body.short_code),
            "team": _trim(body.team),
            "khoi": _trim(body.khoi),
            "active": body.active,
        }
        res = sb.table("sales").insert(row).select(
            "id, full_name, short_code, team, khoi, active"
        ).execute()
        if not res.data:
            raise HTTPException(500, "Không tạo sale")
        return res.data[0]

    @app.patch("/api/v1/payments/master/sales/{sale_id}", tags=["Payments"])
    def patch_sale_master(
        sale_id: str,
        body: SalePatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        update = _trim_patch(body)
        if "full_name" in update and not update["full_name"]:
            raise HTTPException(400, "full_name không được rỗng")
        return _patch_master_row(
            sb,
            table="sales",
            id_field="id",
            id_value=sale_id,
            update=update,
            select="id, full_name, short_code, team, khoi, active",
        )

    @app.post("/api/v1/payments/master/channels", tags=["Payments"])
    def create_channel_master(
        body: ChannelCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        channel_code = _trim(body.channel_code)
        name = _trim(body.name)
        ch_type = _trim(body.type)
        if not name and not ch_type:
            name = channel_code or "Other"
        row = {
            "channel_code": channel_code,
            "name": name,
            "type": ch_type,
        }
        res = sb.table("channels").insert(row).select(
            "id, channel_code, name, type"
        ).execute()
        if not res.data:
            raise HTTPException(500, "Không tạo channel")
        return res.data[0]

    @app.patch("/api/v1/payments/master/channels/{channel_id}", tags=["Payments"])
    def patch_channel_master(
        channel_id: str,
        body: ChannelPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        return _patch_master_row(
            sb,
            table="channels",
            id_field="id",
            id_value=channel_id,
            update=_trim_patch(body),
            select="id, channel_code, name, type",
        )

    @app.post("/api/v1/payments/master/packages", tags=["Payments"])
    def create_package_master(
        body: PackageCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        name = _trim(body.name)
        if not name:
            raise HTTPException(400, "name không được rỗng")
        row = {"name": name, "fixed": _trim(body.fixed)}
        res = sb.table("packages").insert(row).select("id, name, fixed").execute()
        if not res.data:
            raise HTTPException(500, "Không tạo package")
        return res.data[0]

    @app.patch("/api/v1/payments/master/packages/{package_id}", tags=["Payments"])
    def patch_package_master(
        package_id: str,
        body: PackagePatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        update = _trim_patch(body)
        if "name" in update and not update["name"]:
            raise HTTPException(400, "name không được rỗng")
        return _patch_master_row(
            sb,
            table="packages",
            id_field="id",
            id_value=package_id,
            update=update,
            select="id, name, fixed",
        )

    @app.patch("/api/v1/payments/master/customers/{uid}", tags=["Payments"])
    def patch_customer_master(
        uid: str,
        body: CustomerPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "payments")
        customer_uid = uid.strip()
        if not customer_uid:
            raise HTTPException(400, "uid không được rỗng")
        return _patch_master_row(
            sb,
            table="customers",
            id_field="uid",
            id_value=customer_uid,
            update=_trim_patch(body),
            select="uid, full_name, phone, first_seen, created_at",
        )
