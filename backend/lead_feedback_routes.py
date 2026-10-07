"""Feedback lead — sale gửi bằng chứng + ghi chú về chất lượng lead đã nhận;
team Marketing xem và nhận xét lại (Block 3). PIVOT anh Hiếu 7/10.

Phân quyền (ma trận module Phân quyền, mở rộng được cho phòng/cấp khác sau):
  - leadFeedback: thấy module + xem (theo scope) + TẠO (full). Default Sale=full, Marketing=full.
  - leadFeedbackReview: ĐIỀN Block 3 (nhận xét MKT) + xem HẾT. Default Marketing=full.
  Scope xem = visible_creator_emails (sale=mình · leader=team · manager/system=hết)
  + override = HẾT nếu có leadFeedbackReview hoặc rank >= manager.

Spec: palfish-internal-notes/gmv-lead-feedback-sale-2026-10-07.md
"""

import re
from datetime import datetime, timezone

from fastapi import File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel

from rbac import _rank, resolve_actor, visible_creator_emails
from admin_routes import _compute_permissions, _sb_or_503

_BUCKET = "lead-feedback"
_IMG_EXT = {"jpg", "jpeg", "png", "webp", "gif"}


class CreateFeedbackBody(BaseModel):
    phone: str
    sale_note: str
    uid: str | None = None
    customer_name: str | None = None
    lead_source: str | None = None
    lead_channel: str | None = None
    lead_id: str | None = None


class MktFeedbackBody(BaseModel):
    note: str


def _phone9(raw: str | None) -> str | None:
    digits = re.sub(r"[^0-9]", "", str(raw or ""))
    return digits[-9:] if len(digits) >= 9 else None


def _public_url(bucket, path: str) -> str:
    try:
        url = bucket.get_public_url(path) or ""
    except Exception:
        return ""
    return url.split("?")[0]  # bỏ query token nếu Storage trả kèm


def _sale_name(actor) -> str:
    staff = actor.staff or {}
    for key in ("display_name", "crm_name", "ho_ten", "full_name", "name"):
        val = (staff.get(key) or "").strip()
        if val:
            return val
    return actor.email


def _serialize(r: dict) -> dict:
    return {
        "id": r["id"],
        "created_at": r.get("created_at"),
        "sale_email": r.get("sale_email"),
        "sale_name": r.get("sale_name"),
        "phone": r.get("phone"),
        "uid": r.get("uid"),
        "customer_name": r.get("customer_name"),
        "lead_source": r.get("lead_source"),
        "lead_channel": r.get("lead_channel"),
        "lead_id": r.get("lead_id"),
        "sale_note": r.get("sale_note"),
        "sale_images": r.get("sale_images") or [],
        "status": r.get("status") or "wait",
        "mkt_note": r.get("mkt_note"),
        "mkt_images": r.get("mkt_images") or [],
        "mkt_by": r.get("mkt_by"),
        "mkt_at": r.get("mkt_at"),
    }


def register_lead_feedback_routes(app, get_sb):

    def _ctx(authorization):
        sb = _sb_or_503(get_sb)
        actor = resolve_actor(sb, authorization)
        perms = _compute_permissions(sb, actor)
        level = perms.get("leadFeedback", "none")
        if level == "none":
            raise HTTPException(403, "Bạn không có quyền truy cập Feedback lead")
        can_review = perms.get("leadFeedbackReview", "none") == "full"
        can_create = level == "full"
        return sb, actor, can_review, can_create

    def _load(sb, fid):
        res = sb.table("lead_feedback").select("*").eq("id", fid).limit(1).execute()
        if not res.data:
            raise HTTPException(404, "Không tìm thấy feedback")
        return res.data[0]

    def _store_image(sb, fid, kind, content, content_type, ext):
        ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        path = f"{fid}/{kind}-{ts}.{ext}"
        bucket = sb.storage.from_(_BUCKET)
        bucket.upload(
            path=path,
            file=content,
            file_options={"content-type": content_type, "upsert": "false"},
        )
        url = _public_url(bucket, path)
        if not url:
            raise HTTPException(500, "Không lấy được URL ảnh sau upload Storage")
        return url

    @app.get("/api/v1/lead-feedback")
    def list_feedback(
        q: str | None = Query(None),
        status: str | None = Query(None),
        date_from: str | None = Query(None),
        date_to: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb, actor, can_review, can_create = _ctx(authorization)
        query = sb.table("lead_feedback").select("*").order("created_at", desc=True)
        if status in ("wait", "done"):
            query = query.eq("status", status)
        if date_from:
            query = query.gte("created_at", date_from)
        if date_to:
            query = query.lte("created_at", f"{date_to}T23:59:59.999Z")

        see_all = can_review or _rank(actor.role) >= _rank("manager")
        if not see_all:
            emails = visible_creator_emails(sb, actor)  # sale=own, leader=team, else None(all)
            if emails is not None:
                if not emails:
                    return {"items": [], "can_review": can_review, "can_create": can_create}
                query = query.in_("sale_email", emails)

        rows = (query.limit(500).execute().data) or []

        if q:
            needle = q.strip().lower()
            digits = re.sub(r"[^0-9]", "", q)
            def _hit(r: dict) -> bool:
                hay = (
                    f"{r.get('customer_name') or ''} {r.get('phone') or ''} "
                    f"{r.get('sale_name') or ''} {r.get('sale_email') or ''}"
                ).lower()
                if needle and needle in hay:
                    return True
                if len(digits) >= 3 and digits[-9:] in (r.get("phone9") or ""):
                    return True
                return False
            rows = [r for r in rows if _hit(r)]

        return {
            "items": [_serialize(r) for r in rows],
            "can_review": can_review,
            "can_create": can_create,
        }

    @app.post("/api/v1/lead-feedback")
    def create_feedback(body: CreateFeedbackBody, authorization: str | None = Header(None)):
        sb, actor, can_review, can_create = _ctx(authorization)
        if not can_create:
            raise HTTPException(403, "Bạn chỉ có quyền xem, không được tạo feedback")
        note = (body.sale_note or "").strip()
        if not note:
            raise HTTPException(400, "Ghi chú là bắt buộc")
        phone = (body.phone or "").strip()
        if not phone:
            raise HTTPException(400, "Thiếu SĐT khách")
        rec = {
            "sale_email": actor.email.lower(),
            "sale_name": _sale_name(actor),
            "phone": phone,
            "phone9": _phone9(phone),
            "uid": body.uid or None,
            "customer_name": body.customer_name or None,
            "lead_source": body.lead_source or None,
            "lead_channel": body.lead_channel or None,
            "lead_id": body.lead_id or None,
            "sale_note": note,
            "sale_images": [],
            "status": "wait",
        }
        res = sb.table("lead_feedback").insert(rec).execute()
        if not res.data:
            raise HTTPException(500, "Không tạo được feedback")
        return {"item": _serialize(res.data[0])}

    @app.post("/api/v1/lead-feedback/{fid}/images")
    async def upload_image(
        fid: str,
        kind: str = Query("sale"),
        file: UploadFile = File(...),
        authorization: str | None = Header(None),
    ):
        sb, actor, can_review, can_create = _ctx(authorization)
        row = _load(sb, fid)
        if kind == "mkt":
            if not can_review:
                raise HTTPException(403, "Chỉ team Marketing được đính ảnh nhận xét")
        else:
            kind = "sale"
            is_owner = (row.get("sale_email") or "") == actor.email.lower()
            if not (is_owner or can_create):
                raise HTTPException(403, "Không có quyền đính ảnh cho feedback này")
        content = await file.read()
        if not content:
            raise HTTPException(400, "File rỗng")
        ext = (file.filename or "img").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
        if ext == "jpeg":
            ext = "jpg"
        if ext not in _IMG_EXT:
            ext = "jpg"
        content_type = file.content_type or f"image/{'jpeg' if ext == 'jpg' else ext}"
        try:
            url = _store_image(sb, fid, kind, content, content_type, ext)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Upload Storage thất bại (bucket '{_BUCKET}'): {exc}") from exc
        col = "mkt_images" if kind == "mkt" else "sale_images"
        imgs = list(row.get(col) or [])
        imgs.append({"url": url})
        sb.table("lead_feedback").update({col: imgs}).eq("id", fid).execute()
        return {"url": url, "images": imgs}

    @app.post("/api/v1/lead-feedback/{fid}/mkt-feedback")
    def mkt_feedback(fid: str, body: MktFeedbackBody, authorization: str | None = Header(None)):
        sb, actor, can_review, _can_create = _ctx(authorization)
        if not can_review:
            raise HTTPException(403, "Chỉ team Marketing được gửi nhận xét")
        note = (body.note or "").strip()
        if not note:
            raise HTTPException(400, "Nhập nhận xét của team Marketing")
        _load(sb, fid)
        upd = {
            "mkt_note": note,
            "mkt_by": actor.email.lower(),
            "mkt_at": datetime.now(timezone.utc).isoformat(),
            "status": "done",
        }
        res = sb.table("lead_feedback").update(upd).eq("id", fid).execute()
        if not res.data:
            raise HTTPException(404, "Không tìm thấy feedback")
        return {"item": _serialize(res.data[0])}
