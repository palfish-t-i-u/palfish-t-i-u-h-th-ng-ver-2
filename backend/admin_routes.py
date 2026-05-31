"""Admin & profile routes — /me, /admin/sales, /admin/auth-users."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from rbac import (
    require_min_role,
    resolve_actor,
    staff_to_profile,
    visible_creator_emails,
)
from vn_staff import is_vn_sale_row

router = APIRouter(tags=["profile-admin"])

ROOT = Path(__file__).resolve().parents[1]
HIERARCHY_JSON = ROOT / "docs" / "team_hierarchy.json"


class MePatchBody(BaseModel):
    displayName: str | None = None
    phone: str | None = None
    crmName: str | None = None


class SalePatchBody(BaseModel):
    email: str | None = None
    role: str | None = None
    team: str | None = None
    subTeam: str | None = None
    managerEmail: str | None = None
    leaderEmail: str | None = None
    isActive: bool | None = None
    displayName: str | None = None
    phone: str | None = None


class AuthUserPatchBody(BaseModel):
    banned: bool | None = None
    is_banned: bool | None = None
    role: str | None = None
    crmName: str | None = None
    crm_name: str | None = None
    is_activated: bool | None = None


class AuthUserCreateBody(BaseModel):
    email: str
    password: str
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    team: str | None = None
    crmName: str | None = None
    role: str | None = None
    is_activated: bool = False


def _sb_or_503(get_sb):
    sb = get_sb()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình")
    return sb


def _sale_row_to_api(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "crmName": row.get("crm_name"),
        "email": row.get("email"),
        "phone": row.get("sdt"),
        "displayName": row.get("display_name"),
        "team": row.get("team"),
        "subTeam": row.get("sub_team"),
        "role": row.get("role"),
        "managerEmail": row.get("manager_email"),
        "leaderEmail": row.get("leader_email"),
        "isActive": row.get("is_active", True),
        "depart6": row.get("depart6_name"),
        "depart7": row.get("depart7_name"),
        "depart8": row.get("depart8_name"),
        "syncedAt": row.get("synced_at"),
    }


def _flatten_hierarchy() -> list[dict[str, Any]]:
    if not HIERARCHY_JSON.exists():
        return []
    data = json.loads(HIERARCHY_JSON.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    tree = data.get("tree") or {}
    for _team, sub in tree.items():
        if not isinstance(sub, dict):
            continue
        for _sub, members in sub.items():
            if not isinstance(members, list):
                continue
            for m in members:
                if not isinstance(m, dict) or not m.get("sale"):
                    continue
                d6 = (m.get("depart6") or [None])[0]
                d7 = (m.get("depart7") or [None])[0]
                d8 = (m.get("depart8") or [None])[0]
                row = {
                    "crm_name": m["sale"].strip(),
                    "depart6_name": d6,
                    "depart7_name": d7,
                    "depart8_name": d8,
                    "team": (m.get("team") or "").strip() or None,
                    "sub_team": (m.get("sub_team") or "").strip() or None,
                    "role": "sale",
                    "is_active": True,
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }
                if is_vn_sale_row(row):
                    rows.append(row)
    return rows


def _deactivate_non_vn_staff(sb) -> None:
    """Mark Thailand / AU tele teams inactive (no delete)."""
    for team in ("Tele sale", "P'AU Group", "P'TEE Group"):
        sb.table("nhan_su_sale").update({"is_active": False}).eq("team", team).execute()
    sb.table("nhan_su_sale").update({"is_active": False}).ilike(
        "depart6_name", "%thailand%"
    ).execute()


def _model_to_dict(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return {
        "id": getattr(value, "id", None),
        "email": getattr(value, "email", None),
        "created_at": getattr(value, "created_at", None),
        "last_sign_in_at": getattr(value, "last_sign_in_at", None),
        "banned_until": getattr(value, "banned_until", None),
        "user_metadata": getattr(value, "user_metadata", {}) or {},
        "app_metadata": getattr(value, "app_metadata", {}) or {},
    }


def _auth_user_to_dict(value: Any) -> dict[str, Any]:
    user = getattr(value, "user", None)
    if user is not None:
        return _model_to_dict(user)
    data = _model_to_dict(value)
    nested = data.get("user") if isinstance(data, dict) else None
    if nested is not None and not data.get("id"):
        return _model_to_dict(nested)
    return data


def _metadata_crm_name(meta: dict[str, Any]) -> str | None:
    crm = meta.get("crmName")
    if crm is None:
        crm = meta.get("crm_name")
    crm = str(crm or "").strip()
    return crm or None


def _metadata_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _patch_crm_name(body: AuthUserPatchBody) -> str | None:
    crm = body.crm_name if body.crm_name is not None else body.crmName
    crm = str(crm or "").strip()
    return crm or None


def _wants_unlink_crm(body: AuthUserPatchBody) -> bool:
    """True when client explicitly sends empty crmName/crm_name to clear the link."""
    if body.crm_name is not None:
        return not str(body.crm_name).strip()
    if body.crmName is not None:
        return not str(body.crmName).strip()
    return False


def _patch_banned(body: AuthUserPatchBody) -> bool | None:
    return body.is_banned if body.is_banned is not None else body.banned


def register_admin_routes(app, get_supabase):
    """Attach routes to FastAPI app."""

    @app.get("/me")
    def get_me(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization, allow_unactivated=True)
        return staff_to_profile(actor)

    @app.patch("/me")
    def patch_me(body: MePatchBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization, allow_unactivated=True)
        patch: dict[str, Any] = {}
        if body.phone is not None:
            patch["sdt"] = body.phone.strip()
        if body.displayName is not None:
            patch["display_name"] = body.displayName.strip()

        if body.crmName and not actor.staff:
            # Onboard: link email to CRM record by name
            res = (
                sb.table("nhan_su_sale")
                .select("*")
                .eq("crm_name", body.crmName.strip())
                .limit(1)
                .execute()
            )
            if not res.data:
                raise HTTPException(404, "Không tìm thấy tên CRM trong danh sách nhân sự")
            if not is_vn_sale_row(res.data[0]):
                raise HTTPException(
                    400,
                    "Nhân sự này thuộc team ngoài phạm vi GMV VN — liên hệ quản trị",
                )
            row = res.data[0]
            sb.table("nhan_su_sale").update(
                {"email": actor.email, "sdt": body.phone or row.get("sdt"), **patch}
            ).eq("id", row["id"]).execute()
            actor.staff = {**row, "email": actor.email}
        elif actor.staff:
            if patch:
                sb.table("nhan_su_sale").update(patch).eq("id", actor.staff["id"]).execute()
        else:
            if body.crmName:
                raise HTTPException(
                    400,
                    "Chưa liên kết CRM — gửi crmName để ghép lần đầu",
                )
            if patch:
                raise HTTPException(400, "Chưa có hồ sơ nhân sự — cần ghép CRM trước")

        actor = resolve_actor(sb, authorization, allow_unactivated=True)
        return staff_to_profile(actor)

    @app.get("/admin/sales")
    def list_sales(
        authorization: str | None = Header(None),
        team: str | None = None,
        role: str | None = None,
        q: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "manager")

        query = sb.table("nhan_su_sale").select("*", count="exact")
        if team:
            query = query.eq("team", team)
        if role:
            query = query.eq("role", role)
        if q:
            query = query.ilike("crm_name", f"%{q}%")

        if actor.role == "manager" and actor.staff:
            query = query.eq("team", actor.staff.get("team"))

        res = query.order("crm_name").range(offset, offset + max(limit * 3, 200) - 1).execute()
        vn_rows = [r for r in (res.data or []) if is_vn_sale_row(r)]
        page = vn_rows[offset : offset + limit]
        return {
            "sales": [_sale_row_to_api(r) for r in page],
            "total": len(vn_rows),
        }

    @app.patch("/admin/sales/{crm_name}")
    def patch_sale(
        crm_name: str,
        body: SalePatchBody,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        patch: dict[str, Any] = {}
        if body.email is not None:
            patch["email"] = body.email.strip() or None
        if body.role is not None:
            patch["role"] = body.role.strip().lower()
        if body.team is not None:
            patch["team"] = body.team.strip() or None
        if body.subTeam is not None:
            patch["sub_team"] = body.subTeam.strip() or None
        if body.managerEmail is not None:
            patch["manager_email"] = body.managerEmail.strip() or None
        if body.leaderEmail is not None:
            patch["leader_email"] = body.leaderEmail.strip() or None
        if body.isActive is not None:
            patch["is_active"] = body.isActive
        if body.displayName is not None:
            patch["display_name"] = body.displayName.strip() or None
        if body.phone is not None:
            patch["sdt"] = body.phone.strip() or None

        if not patch:
            raise HTTPException(400, "Không có trường cần cập nhật")

        res = (
            sb.table("nhan_su_sale")
            .update(patch)
            .eq("crm_name", crm_name)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Không tìm thấy nhân sự CRM")
        return _sale_row_to_api(res.data[0])

    @app.post("/admin/sales/sync")
    def sync_sales(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        rows = _flatten_hierarchy()
        if not rows:
            raise HTTPException(500, "Không đọc được team_hierarchy.json")

        batch = 50
        for i in range(0, len(rows), batch):
            sb.table("nhan_su_sale").upsert(
                rows[i : i + batch], on_conflict="crm_name"
            ).execute()

        _deactivate_non_vn_staff(sb)

        return {
            "synced": len(rows),
            "deactivatedNonVn": True,
            "source": str(HIERARCHY_JSON.name),
        }

    @app.get("/crm/customers")
    def search_crm_customers(
        authorization: str | None = Header(None),
        q: str | None = None,
        limit: int = 20,
    ):
        """Droplist khách hàng CRM. RBAC: sale → khách thuộc đơn của mình; leader/manager → team; system → all.

        TODO: thay fallback (`khach_hang` JOIN `don_hang.created_by`) bằng call CRM API thật khi Giang/IT cấp endpoint.
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        allowed = visible_creator_emails(sb, actor)

        lim = min(max(limit, 1), 50)
        try:
            # Lấy danh sách khach_hang_id từ don_hang theo allowed creators
            don_q = sb.table("don_hang").select("khach_hang_id, created_by")
            if allowed is not None:
                don_q = don_q.in_("created_by", allowed)
            don_res = don_q.limit(2000).execute()
            kh_ids = list({r["khach_hang_id"] for r in (don_res.data or []) if r.get("khach_hang_id")})
            if not kh_ids:
                return {"customers": []}

            kh_q = sb.table("khach_hang").select(
                "id, crm_uid, ho_ten, so_dien_thoai, ma_vung, dia_chi, "
                "dia_chi_chi_tiet, phuong, quan, tinh"
            ).in_("id", kh_ids)
            if q:
                pattern = f"%{q}%"
                kh_q = kh_q.or_(f"crm_uid.ilike.{pattern},ho_ten.ilike.{pattern}")
            kh_res = kh_q.limit(lim).execute()

            out: list[dict[str, Any]] = []
            for k in kh_res.data or []:
                dia_chi = k.get("dia_chi") or ""
                if not dia_chi:
                    parts = [
                        k.get("dia_chi_chi_tiet"),
                        k.get("phuong"),
                        k.get("quan"),
                        k.get("tinh"),
                    ]
                    dia_chi = ", ".join(p for p in parts if p)
                sdt = k.get("so_dien_thoai") or ""
                if k.get("ma_vung") and sdt and not str(sdt).startswith("+"):
                    sdt = f"{k.get('ma_vung')} {sdt}"
                out.append(
                    {
                        "crmUid": k.get("crm_uid") or "",
                        "hoTen": k.get("ho_ten") or "",
                        "sdt": sdt,
                        "diaChi": dia_chi,
                    }
                )
            return {"customers": out}
        except Exception as exc:
            raise HTTPException(500, f"Lỗi tìm khách: {exc}") from exc

    @app.get("/admin/auth-users")
    def list_auth_users(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        try:
            users_res = sb.auth.admin.list_users()
            users = users_res if isinstance(users_res, list) else getattr(users_res, "users", []) or []
        except Exception as exc:
            raise HTTPException(500, f"Không liệt kê được auth users: {exc}") from exc

        staff_res = (
            sb.table("nhan_su_sale")
            .select("crm_name, email, role, team, sdt, display_name")
            .execute()
        )
        by_email = {
            (r.get("email") or "").lower(): r
            for r in (staff_res.data or [])
            if r.get("email")
        }

        out = []
        for u in users:
            u = _auth_user_to_dict(u)
            email = (u.get("email") or "").lower()
            meta = u.get("user_metadata") or {}
            app_meta = u.get("app_metadata") or {}
            providers = app_meta.get("providers") or []
            if not providers and app_meta.get("provider"):
                providers = [app_meta.get("provider")]
            linked = by_email.get(email)
            crm_name = linked.get("crm_name") if linked else _metadata_crm_name(meta)
            full_name = meta.get("full_name") or meta.get("fullName")
            out.append(
                {
                    "id": u.get("id"),
                    "email": u.get("email"),
                    "providers": providers,
                    "lastSignIn": u.get("last_sign_in_at"),
                    "createdAt": u.get("created_at"),
                    "bannedUntil": u.get("banned_until"),
                    "crmName": crm_name,
                    "staffRole": linked.get("role") if linked else meta.get("role"),
                    "isBanned": bool(u.get("banned_until")),
                    "isActivated": _metadata_bool(meta.get("is_activated", False)),
                    "department": meta.get("department"),
                    "team": meta.get("team") or (linked.get("team") if linked else None),
                    "fullName": full_name,
                    "phone": meta.get("phone") or (linked.get("sdt") if linked else None),
                }
            )
        return {"users": out}

    @app.patch("/admin/auth-users/{user_id}")
    def patch_auth_user(
        user_id: str,
        body: AuthUserPatchBody,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        try:
            target_res = sb.auth.admin.get_user_by_id(user_id)
            target_user = _auth_user_to_dict(target_res)
        except Exception as exc:
            raise HTTPException(500, f"Không đọc được auth user: {exc}") from exc

        if not target_user or not target_user.get("id"):
            raise HTTPException(404, "Không tìm thấy tài khoản Auth")

        target_email = str(target_user.get("email") or "").strip().lower()
        if not target_email:
            raise HTTPException(400, "Tài khoản Auth không có email")

        current_metadata = dict(target_user.get("user_metadata") or {})
        unlink_crm = _wants_unlink_crm(body)
        crm_name = _patch_crm_name(body)

        if crm_name:
            staff_res = (
                sb.table("nhan_su_sale")
                .select("email, crm_name")
                .eq("crm_name", crm_name)
                .limit(1)
                .execute()
            )
            if not staff_res.data:
                raise HTTPException(404, f"Không tìm thấy nhân sự CRM '{crm_name}'")

            linked_email = str(staff_res.data[0].get("email") or "").strip().lower()
            if linked_email and linked_email != target_email:
                raise HTTPException(
                    409,
                    f"Nhân sự CRM '{crm_name}' đã liên kết với tài khoản '{linked_email}'",
                )

        existing_staff_res = (
            sb.table("nhan_su_sale")
            .select("crm_name")
            .eq("email", target_email)
            .limit(1)
            .execute()
        )
        existing_staff_crm = (
            str((existing_staff_res.data or [{}])[0].get("crm_name") or "").strip()
            if existing_staff_res.data
            else ""
        )
        existing_crm_name = _metadata_crm_name(current_metadata) or existing_staff_crm or None

        if body.is_activated is True and not unlink_crm and not (crm_name or existing_crm_name):
            raise HTTPException(400, "Cần liên kết CRM trước khi kích hoạt tài khoản")

        attrs: dict[str, Any] = {}
        banned = _patch_banned(body)
        if banned is True:
            attrs["ban_duration"] = "876000h"
        elif banned is False:
            attrs["ban_duration"] = "none"

        role_value = body.role.strip().lower() if body.role is not None else None
        updated_metadata = dict(current_metadata)
        if role_value is not None:
            updated_metadata["role"] = role_value
        if unlink_crm:
            updated_metadata.pop("crmName", None)
            updated_metadata.pop("crm_name", None)
        elif crm_name:
            updated_metadata["crmName"] = crm_name
        if body.is_activated is not None:
            updated_metadata["is_activated"] = body.is_activated

        if updated_metadata != current_metadata:
            attrs["user_metadata"] = updated_metadata

        if not attrs and not crm_name and not unlink_crm:
            raise HTTPException(400, "Không có trường cần cập nhật")

        try:
            if attrs:
                sb.auth.admin.update_user_by_id(user_id, attrs)
            if unlink_crm:
                crm_to_clear = existing_crm_name
                if crm_to_clear:
                    sb.table("nhan_su_sale").update({"email": None}).eq(
                        "crm_name", crm_to_clear
                    ).execute()
            else:
                staff_crm_to_update = crm_name or existing_crm_name
                staff_patch: dict[str, Any] = {}
                if crm_name:
                    staff_patch["email"] = target_email
                if role_value is not None and staff_crm_to_update:
                    staff_patch["role"] = role_value
                if staff_patch and staff_crm_to_update:
                    sb.table("nhan_su_sale").update(staff_patch).eq(
                        "crm_name", staff_crm_to_update
                    ).execute()
        except Exception as exc:
            raise HTTPException(500, str(exc)) from exc

        return {"ok": True, "userId": user_id}

    @app.post("/admin/auth-users")
    def create_auth_user(
        body: AuthUserCreateBody,
        authorization: str | None = Header(None),
    ):
        """Admin tạo tài khoản mới trực tiếp (không cần user tự đăng ký)."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        user_meta: dict[str, Any] = {
            "is_activated": body.is_activated,
        }
        if body.full_name:
            user_meta["full_name"] = body.full_name.strip()
        if body.phone:
            user_meta["phone"] = body.phone.strip()
        if body.department:
            user_meta["department"] = body.department.strip()
        if body.team:
            user_meta["team"] = body.team.strip()
        if body.role:
            user_meta["role"] = body.role.strip()

        # Validate CRM link nếu admin truyền crmName
        if body.crmName:
            crm_clean = body.crmName.strip()
            crm_res = (
                sb.table("nhan_su_sale")
                .select("id, email")
                .eq("crm_name", crm_clean)
                .limit(1)
                .execute()
            )
            if not crm_res.data:
                raise HTTPException(404, f"Không tìm thấy nhân sự CRM '{crm_clean}'")
            existing_email = (crm_res.data[0].get("email") or "").strip().lower()
            target_email_lower = body.email.strip().lower()
            if existing_email and existing_email != target_email_lower:
                raise HTTPException(
                    409,
                    f"Nhân sự CRM '{crm_clean}' đã liên kết với tài khoản '{existing_email}'",
                )
            user_meta["crmName"] = crm_clean
            user_meta["full_name"] = user_meta.get("full_name") or crm_clean

        try:
            result = sb.auth.admin.create_user(
                {
                    "email": body.email.strip(),
                    "password": body.password,
                    "user_metadata": user_meta,
                    "email_confirm": True,  # admin tạo → skip email verification
                }
            )
            new_user = result.user if hasattr(result, "user") else result
            new_id = (
                new_user.id if hasattr(new_user, "id") else new_user.get("id")
            )
        except Exception as exc:
            raise HTTPException(500, f"Không tạo được tài khoản: {exc}") from exc

        # Link CRM nếu có
        if body.crmName:
            try:
                sb.table("nhan_su_sale").update({"email": body.email.strip()}).eq(
                    "crm_name", body.crmName.strip()
                ).execute()
            except Exception as exc:
                print(f"[admin] create_user CRM link failed: {exc}")

        return {"ok": True, "userId": new_id}
