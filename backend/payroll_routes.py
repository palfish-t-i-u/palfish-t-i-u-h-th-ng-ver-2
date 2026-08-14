"""Payroll routes -- M4 phiếu lương: nhận phiếu từ PhieuLuongGate (Sheet -> app).

GĐ1 / Milestone A: chỉ NHẬN + LƯU. Hiển thị / RBAC / confirm = Milestone B (chưa có ở đây).

Endpoint machine-to-machine: xác thực bằng header ``X-Gate-Token`` (KHÔNG dùng JWT user),
cùng pattern như gateway ingest (``_require_gateway_token`` trong gateway_routes.py).
Idempotent theo ``code|ky_luong|stage`` (upsert) -- Gate gửi lại KHÔNG tạo trùng.

Contract payload (xem docs/PHIEU_LUONG_CONTRACT.md):
    {
      "meta":  {"code": "HN0001", "ky_luong": "2026-07", "stage": "truoc_thue", ...},
      "phieu": {"<nhãn cột chị Trang>": <giá trị>, ...}
    }
"""

from __future__ import annotations

import hmac
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from rbac import actor_ma_nv, resolve_actor, visible_payslip_codes

_VALID_STAGES = ("truoc_thue", "sau_thue")
_PAYSLIP_LIST_COLS = (
    "id,code,name,ky_luong,stage,review_status,confirm_status,"
    "reviewed_at,confirmed_at,received_at,updated_at"
)


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _require_gate_token(token: str | None) -> None:
    expected = (os.getenv("GATE_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(503, "GATE_TOKEN chua cau hinh")
    if not token or not hmac.compare_digest(token.strip(), expected):
        raise HTTPException(401, "Invalid gate token")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _vn_today() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=7)).date()


def _review_locked(ky_luong: str) -> bool:
    """Khoá 'Yêu cầu xem xét lại' từ mùng 4 tháng trả lương (tháng sau kỳ).

    Kỳ 'YYYY-MM' trả lương mùng 5 tháng sau → khoá từ mùng 4 tháng sau.
    """
    try:
        y_s, m_s = ky_luong.split("-")
        y, m = int(y_s), int(m_s)
    except Exception:
        return False
    pay_y, pay_m = (y + 1, 1) if m == 12 else (y, m + 1)
    return _vn_today() >= date(pay_y, pay_m, 4)


def _serialize_payslip(row: dict[str, Any], *, include_payload: bool = False) -> dict[str, Any]:
    out = {
        "id": row.get("id"),
        "code": row.get("code"),
        "name": row.get("name"),
        "ky_luong": row.get("ky_luong"),
        "stage": row.get("stage"),
        "review_status": row.get("review_status"),
        "confirm_status": row.get("confirm_status"),
        "reviewed_at": row.get("reviewed_at"),
        "confirmed_at": row.get("confirmed_at"),
        "received_at": row.get("received_at"),
        "updated_at": row.get("updated_at"),
    }
    if include_payload:
        out["phieu"] = row.get("payload_json") or {}
    return out


class PayslipReceiveBody(BaseModel):
    meta: dict[str, Any]
    phieu: dict[str, Any]


def register_payroll_routes(app, get_supabase) -> None:
    router = APIRouter(prefix="/api/payroll", tags=["Payroll"])

    @router.post("/payslips/receive")
    def receive_payslip(
        body: PayslipReceiveBody,
        x_gate_token: str | None = Header(None, alias="X-Gate-Token"),
    ):
        """Nhận 1 phiếu (1 tầng) từ PhieuLuongGate, upsert vào ``payslips``.

        Re-send cùng (code, ky_luong, stage) = cập nhật payload, GIỮ received_at
        và trạng thái review/confirm (không reset xác nhận cũ).
        """
        _require_gate_token(x_gate_token)

        meta = body.meta or {}
        code = str(meta.get("code") or "").strip()
        ky_luong = str(meta.get("ky_luong") or "").strip()
        stage = str(meta.get("stage") or "").strip()
        if not code or not ky_luong:
            raise HTTPException(422, "Payload thieu code / ky_luong")
        if stage not in _VALID_STAGES:
            raise HTTPException(422, f"stage khong hop le: {stage!r}")
        if not body.phieu:
            raise HTTPException(422, "Payload thieu 'phieu'")

        name = str(body.phieu.get("Name") or meta.get("name") or "").strip() or None
        row = {
            "code": code,
            "name": name,
            "ky_luong": ky_luong,
            "stage": stage,
            "payload_json": body.phieu,
            "updated_at": _now_iso(),
        }

        sb = _sb_or_503(get_supabase)
        try:
            sb.table("payslips").upsert(
                row, on_conflict="code,ky_luong,stage"
            ).execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong luu duoc payslip: {exc}") from exc

        return {"ok": True, "code": code, "ky_luong": ky_luong, "stage": stage}

    # ---- Đọc / xác nhận (Milestone B) — user JWT + RBAC ----

    def _load_payslip(sb, payslip_id: str) -> dict[str, Any]:
        try:
            res = (
                sb.table("payslips").select("*").eq("id", payslip_id).limit(1).execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong doc duoc payslip: {exc}") from exc
        rows = res.data or []
        if not rows:
            raise HTTPException(404, "Khong tim thay phieu luong")
        return rows[0]

    def _require_owner(actor, row: dict[str, Any]) -> None:
        own = actor_ma_nv(actor)
        if not own or row.get("code") != own:
            raise HTTPException(403, "Chi nhan vien so huu phieu moi thao tac duoc")

    @router.get("/payslips")
    def list_payslips(
        ky_luong: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        """Danh sách phiếu actor được xem (RBAC: NV=mình, leader/manager=team, system=hết)."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        codes = visible_payslip_codes(sb, actor)  # None = xem hết
        q = sb.table("payslips").select(_PAYSLIP_LIST_COLS)
        if codes is not None:
            if not codes:
                return {"payslips": []}
            q = q.in_("code", codes)
        if ky_luong:
            q = q.eq("ky_luong", ky_luong)
        try:
            res = q.order("ky_luong", desc=True).order("stage").execute()
        except Exception as exc:
            raise HTTPException(500, f"Khong doc duoc payslips: {exc}") from exc
        return {"payslips": [_serialize_payslip(r) for r in (res.data or [])]}

    @router.get("/payslips/{payslip_id}")
    def get_payslip(payslip_id: str, authorization: str | None = Header(None)):
        """Chi tiết 1 phiếu (kèm payload). Ghi audit ai xem lúc nào."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        row = _load_payslip(sb, payslip_id)
        codes = visible_payslip_codes(sb, actor)
        if codes is not None and row.get("code") not in codes:
            raise HTTPException(403, "Khong co quyen xem phieu nay")
        try:
            sb.table("payslip_views").insert(
                {"payslip_id": row["id"], "viewer_email": actor.email.lower()}
            ).execute()
        except Exception:
            pass  # audit KHÔNG được chặn việc xem
        return {"payslip": _serialize_payslip(row, include_payload=True)}

    @router.patch("/payslips/{payslip_id}/confirm")
    def confirm_payslip(payslip_id: str, authorization: str | None = Header(None)):
        """NV sở hữu bấm 'Xác nhận' phiếu."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        row = _load_payslip(sb, payslip_id)
        _require_owner(actor, row)
        try:
            res = (
                sb.table("payslips")
                .update(
                    {
                        "confirm_status": "confirmed",
                        "confirmed_at": _now_iso(),
                        "updated_at": _now_iso(),
                    }
                )
                .eq("id", payslip_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong xac nhan duoc: {exc}") from exc
        return {"ok": True, "payslip": _serialize_payslip((res.data or [row])[0])}

    @router.patch("/payslips/{payslip_id}/review")
    def request_review(payslip_id: str, authorization: str | None = Header(None)):
        """NV sở hữu bấm 'Yêu cầu xem xét lại'. Khoá từ mùng 4 (trước ngày trả lương)."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        row = _load_payslip(sb, payslip_id)
        _require_owner(actor, row)
        if _review_locked(row.get("ky_luong") or ""):
            raise HTTPException(409, "Da qua han yeu cau xem xet lai (khoa tu mung 4)")
        try:
            res = (
                sb.table("payslips")
                .update(
                    {
                        "review_status": "requested",
                        "reviewed_at": _now_iso(),
                        "updated_at": _now_iso(),
                    }
                )
                .eq("id", payslip_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong gui duoc yeu cau: {exc}") from exc
        return {"ok": True, "payslip": _serialize_payslip((res.data or [row])[0])}

    app.include_router(router)
