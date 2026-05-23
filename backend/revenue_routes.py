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


def _fetch_so_doanh_thu(
    sb,
    select: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    loai_nhap: str | None = None,
) -> list[dict[str, Any]]:
    """PostgREST trả tối đa 1000 dòng/lần — paginate hết kết quả."""
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        q = sb.table("so_doanh_thu").select(select).order("ngay_tien_ve", desc=True)
        if from_date:
            q = q.gte("ngay_tien_ve", from_date[:10])
        if to_date:
            q = q.lte("ngay_tien_ve", to_date[:10])
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
    return rows


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
    return {
        "id": row["id"],
        "ngayTienVe": ngay_str,
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
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        _require_ops(actor)
        try:
            db_rows = _fetch_so_doanh_thu(
                sb,
                "*",
                from_date=from_date,
                to_date=to_date,
                loai_nhap=loai_nhap,
            )
            rows = _enrich_ledger_rows(sb, db_rows)
            return {"rows": rows, "count": len(rows)}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Lỗi đọc Sổ doanh thu: {exc}") from exc

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
