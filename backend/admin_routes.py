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
    role: str | None = None
    crmName: str | None = None
    is_activated: bool | None = None  # kích hoạt / thu hồi kích hoạt


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


def register_admin_routes(app, get_supabase):
    """Attach routes to FastAPI app."""

    @app.get("/me")
    def get_me(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        return staff_to_profile(actor)

    @app.patch("/me")
    def patch_me(body: MePatchBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
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

        actor = resolve_actor(sb, authorization)
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

        staff_res = sb.table("nhan_su_sale").select("crm_name, email, role").execute()
        by_email = {
            (r.get("email") or "").lower(): r
            for r in (staff_res.data or [])
            if r.get("email")
        }

        out = []
        for u in users:
            if hasattr(u, "model_dump"):
                u = u.model_dump()
            elif not isinstance(u, dict):
                u = {
                    "id": getattr(u, "id", None),
                    "email": getattr(u, "email", None),
                    "created_at": getattr(u, "created_at", None),
                    "last_sign_in_at": getattr(u, "last_sign_in_at", None),
                    "banned_until": getattr(u, "banned_until", None),
                    "user_metadata": getattr(u, "user_metadata", {}) or {},
                    "app_metadata": getattr(u, "app_metadata", {}) or {},
                }
            email = (u.get("email") or "").lower()
            meta = u.get("user_metadata") or {}
            app_meta = u.get("app_metadata") or {}
            providers = app_meta.get("providers") or []
            if not providers and app_meta.get("provider"):
                providers = [app_meta.get("provider")]
            linked = by_email.get(email)
            out.append(
                {
                    "id": u.get("id"),
                    "email": u.get("email"),
                    "providers": providers,
                    "lastSignIn": u.get("last_sign_in_at"),
                    "createdAt": u.get("created_at"),
                    "bannedUntil": u.get("banned_until"),
                    "crmName": linked.get("crm_name") if linked else meta.get("full_name"),
                    "staffRole": linked.get("role") if linked else meta.get("role"),
                    "isBanned": bool(u.get("banned_until")),
                    # ── fields mới cho FE AuthAccountsTab ──
                    "isActivated": bool(meta.get("is_activated", False)),
                    "department": meta.get("department"),
                    "team": meta.get("team"),
                    "fullName": meta.get("full_name"),
                    "phone": meta.get("phone"),
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

        attrs: dict[str, Any] = {}
        if body.banned is True:
            attrs["ban_duration"] = "876000h"
        elif body.banned is False:
            attrs["ban_duration"] = "none"

        meta_patch: dict[str, Any] = {}
        if body.role is not None:
            meta_patch["role"] = body.role

        # ── Liên kết CRM với validation ──
        if body.crmName is not None:
            crm_name_clean = body.crmName.strip()
            # Check 1: crmName tồn tại trong nhan_su_sale?
            exists_res = (
                sb.table("nhan_su_sale")
                .select("id, email")
                .eq("crm_name", crm_name_clean)
                .limit(1)
                .execute()
            )
            if not exists_res.data:
                raise HTTPException(404, f"Không tìm thấy nhân sự CRM '{crm_name_clean}'")
            # Check 2: crmName đã liên kết tài khoản Auth khác chưa?
            existing_crm_email = (exists_res.data[0].get("email") or "").strip().lower()
            if existing_crm_email:
                try:
                    target_obj = sb.auth.admin.get_user_by_id(user_id)
                    target_email = (
                        (target_obj.user.email if hasattr(target_obj, "user") else target_obj.get("email"))
                        or ""
                    ).strip().lower()
                except Exception:
                    target_email = ""
                if existing_crm_email != target_email:
                    raise HTTPException(
                        409,
                        f"Nhân sự CRM '{crm_name_clean}' đã liên kết với tài khoản '{existing_crm_email}'",
                    )
            # Ghi email của user này vào nhan_su_sale
            try:
                target_obj = sb.auth.admin.get_user_by_id(user_id)
                user_email = (
                    target_obj.user.email if hasattr(target_obj, "user") else target_obj.get("email")
                )
                if user_email:
                    sb.table("nhan_su_sale").update({"email": user_email}).eq(
                        "crm_name", crm_name_clean
                    ).execute()
            except Exception as exc:
                print(f"[admin] link CRM email failed: {exc}")
            meta_patch["full_name"] = crm_name_clean

        # ── Kích hoạt tài khoản với validation ──
        if body.is_activated is not None:
            if body.is_activated is True:
                # Phải link CRM trước mới được kích hoạt
                try:
                    target_obj = sb.auth.admin.get_user_by_id(user_id)
                    target_user_data = target_obj.user if hasattr(target_obj, "user") else target_obj
                    target_meta = (
                        target_user_data.user_metadata
                        if hasattr(target_user_data, "user_metadata")
                        else (target_user_data.get("user_metadata") or {})
                    ) or {}
                    target_email_check = (
                        target_user_data.email
                        if hasattr(target_user_data, "email")
                        else (target_user_data.get("email") or "")
                    ).strip().lower()
                except Exception:
                    target_meta = {}
                    target_email_check = ""
                # Nếu body.crmName cũng đang được set trong lần patch này → OK
                crm_in_patch = body.crmName is not None and body.crmName.strip()
                 # Check email đã có trong nhan_su_sale
                has_crm_link = False
                if target_email_check:
                    crm_link_res = (
                        sb.table("nhan_su_sale")
                        .select("id")
                        .eq("email", target_email_check)
                        .limit(1)
                        .execute()
                    )
                    has_crm_link = bool(crm_link_res.data)
                # Cho phép kích hoạt nếu: đã link CRM (qua email) HOẶC đang link cùng lúc
                if not has_crm_link and not crm_in_patch:
                    raise HTTPException(400, "Cần liên kết CRM trước khi kích hoạt tài khoản")
            meta_patch["is_activated"] = body.is_activated

        if meta_patch:
            attrs["user_metadata"] = meta_patch

        try:
            if attrs:
                sb.auth.admin.update_user_by_id(user_id, attrs)
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
            user_meta["full_name"] = crm_clean

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
