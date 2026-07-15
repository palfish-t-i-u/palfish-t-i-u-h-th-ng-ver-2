"""Admin & profile routes — /me, /admin/sales, /admin/auth-users."""

from __future__ import annotations

import json
import os
import time
import unicodedata
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from rbac import (
    _rank,
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
    full_name: str | None = None
    phone: str | None = None
    department: str | None = None
    team: str | None = None
    sub_team: str | None = None


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


class BulkDeleteAuthUsersBody(BaseModel):
    user_ids: list[str]


class PermissionPatchBody(BaseModel):
    department: str
    module_key: str
    access_level: str
    min_role: str = "sale"


class PermissionOverrideBody(BaseModel):
    email: str
    module_key: str
    access_level: str


class BulkOverrideBody(BaseModel):
    email: str
    overrides: dict[str, str]  # module_key -> access_level ("full"/"read"/"none"/"reset")


class ZaloGroupCreatePayload(BaseModel):
    team_code: str
    group_id: str
    group_name: str
    is_active: bool


class ZaloGroupPatchPayload(BaseModel):
    group_id: str | None = None
    group_name: str | None = None
    is_active: bool | None = None


class ZaloConfigPayload(BaseModel):
    app_id: str
    app_secret: str
    access_token: str
    refresh_token: str


class ZaloTestMessagePayload(BaseModel):
    group_id: str
    message: str
    image_url: str | None = None


class DingTalkGroupCreatePayload(BaseModel):
    team_code: str
    open_conversation_id: str
    group_name: str
    is_active: bool


class DingTalkGroupPatchPayload(BaseModel):
    open_conversation_id: str | None = None
    group_name: str | None = None
    is_active: bool | None = None


class DingTalkTestPayload(BaseModel):
    team_code: str
    message: str


MODULE_LIST = [
    "dashboard",
    "paymentRequests",
    "reconciliation",
    "reconCard",      # <-- Thêm mới phục vụ đối soát mPOS/Payoo
    "module3",
    "module4",
    "revenueLedger",
    "bc01",
    "bc02",
    "bc03",
    "module5",
    "module6",
    "gatewaySync",    # <-- Thêm mới phục vụ đồng bộ mPOS/Payoo
    "zalo",           # <-- Thêm mới phục vụ quản lý phân quyền Zalo OA
    "dingtalk",       # <-- Thêm mới phục vụ quản lý nhóm DingTalk
    "authAccounts",
    "profile",
    "permissions",
]

VALID_DEPARTMENTS = {"sale", "hr", "marketing", "cs"}
ACCESS_LEVELS = {"full", "read", "none"}
VALID_MIN_ROLES = {"sale", "leader", "manager"}

DEFAULT_DEPT_PERMISSIONS: dict[str, dict[str, str]] = {
    "sale": {
        "dashboard": "full", "paymentRequests": "full",
        "reconciliation": "full", "module3": "full", "module4": "read",
        "revenueLedger": "read", "bc01": "read", "bc02": "read", "bc03": "read",
        "module5": "none", "module6": "full",
        "authAccounts": "none", "profile": "full", "permissions": "none",
        "reconCard": "none", "gatewaySync": "none", "zalo": "none", "dingtalk": "none",
    },
    "hr": {
        "dashboard": "full", "paymentRequests": "full",
        "reconciliation": "full", "module3": "full", "module4": "full",
        "revenueLedger": "full", "bc01": "full", "bc02": "full", "bc03": "full",
        "module5": "full", "module6": "full",
        "authAccounts": "full", "profile": "full", "permissions": "full",
        "reconCard": "full", "gatewaySync": "full", "zalo": "full", "dingtalk": "full",
    },
    "marketing": {
        "dashboard": "read", "paymentRequests": "none",
        "reconciliation": "none", "module3": "none", "module4": "none",
        "revenueLedger": "full", "bc01": "read", "bc02": "read", "bc03": "read",
        "module5": "none", "module6": "none",
        "authAccounts": "none", "profile": "full", "permissions": "none",
        "reconCard": "none", "gatewaySync": "none", "zalo": "none", "dingtalk": "none",
    },
    "cs": {
        "dashboard": "read", "paymentRequests": "none",
        "reconciliation": "none", "module3": "full", "module4": "none",
        "revenueLedger": "none", "bc01": "none", "bc02": "none", "bc03": "none",
        "module5": "none", "module6": "none",
        "authAccounts": "none", "profile": "full", "permissions": "none",
        "reconCard": "none", "gatewaySync": "none", "zalo": "none", "dingtalk": "none",
    },
}

DEPARTMENT_ALIASES = {
    "sale": "sale",
    "sales": "sale",
    "ban hang": "sale",
    "doi sale": "sale",
    "doi ban hang": "sale",
    "team sale": "sale",
    "sales team": "sale",
    "hr": "hr",
    "human resources": "hr",
    "nhan su": "hr",
    "doi nhan su": "hr",
    "nhan su & quan tri": "hr",
    "marketing": "marketing",
    "mkt": "marketing",
    "cs": "cs",
    "customer service": "cs",
    "cskh": "cs",
    "doi cs": "cs",
}


def _system_admin_emails() -> set[str]:
    return {
        e.strip().lower()
        for e in (os.getenv("SYSTEM_ADMIN_EMAILS") or "").split(",")
        if e.strip()
    }


def _permissions_with_level(level: str) -> dict[str, str]:
    return {module: level for module in MODULE_LIST}


def _normalize_department(value: Any) -> str | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    lowered = raw.lower().replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", lowered)
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = " ".join(normalized.replace("_", " ").replace("-", " ").split())
    if normalized in VALID_DEPARTMENTS:
        return normalized
    return DEPARTMENT_ALIASES.get(normalized)


def _actor_department(actor) -> str | None:
    staff = actor.staff or {}
    candidates = [
        actor.department,
        staff.get("department"),
        staff.get("depart6_name"),
    ]
    for candidate in candidates:
        department = _normalize_department(candidate)
        if department:
            return department
    # Sale/leader đã link CRM nhưng metadata kiểu "Đội Sale" chưa map được
    if (getattr(actor, "role", None) or "sale") in ("sale", "leader") and staff:
        return "sale"
    return None


def _compute_permissions(sb, actor) -> dict[str, Any]:
    from rbac import can_credit_referral

    if actor.role == "system" or actor.email.lower() in _system_admin_emails():
        perms = _permissions_with_level("full")
        perms["referral.credit"] = True
        return perms

    department = _actor_department(actor)
    if not department:
        perms = _permissions_with_level("none")
        perms["referral.credit"] = False
        return perms

    permissions: dict[str, Any] = _permissions_with_level("none")
    defaults = DEFAULT_DEPT_PERMISSIONS.get(department, {})
    for module_key, access_level in defaults.items():
        if module_key in permissions and access_level in ACCESS_LEVELS:
            permissions[module_key] = access_level

    # Read department permissions from DB (includes min_role)
    min_roles: dict[str, str] = {}
    last_exc: Exception | None = None
    res = None
    for attempt in range(3):
        try:
            res = (
                sb.table("department_permissions")
                .select("module_key, access_level, min_role")
                .eq("department", department)
                .execute()
            )
            break
        except Exception as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(0.2 * (attempt + 1))
                continue
    if res is None:
        print(f"[permissions] department query failed after retries for {actor.email}: {last_exc}")
        permissions["referral.credit"] = can_credit_referral(actor)
        return permissions

    for row in res.data or []:
        module_key = row.get("module_key")
        access_level = row.get("access_level")
        mr = row.get("min_role")
        if module_key in permissions and access_level in ACCESS_LEVELS:
            permissions[module_key] = access_level
        if module_key in permissions and mr in VALID_MIN_ROLES:
            min_roles[module_key] = mr

    # Downgrade access when actor's role is below min_role
    actor_rank = _rank(actor.role)
    for module_key, mr in min_roles.items():
        if actor_rank < _rank(mr):
            permissions[module_key] = "none"

    # Personal overrides take priority — bypass min_role
    try:
        overrides = (
            sb.table("permission_overrides")
            .select("module_key, access_level")
            .eq("user_email", actor.email.lower())
            .execute()
        )

        for row in overrides.data or []:
            mk = row.get("module_key")
            al = row.get("access_level")
            if mk in permissions and al in ACCESS_LEVELS:
                permissions[mk] = al
    except Exception as exc:
        print(f"[permission_overrides] query failed for {actor.email.lower()}: {exc}")

    permissions["referral.credit"] = can_credit_referral(actor)
    return permissions


def require_module_write(sb, actor, module_key: str) -> None:
    perms = _compute_permissions(sb, actor)
    if perms.get(module_key, "none") != "full":
        raise HTTPException(
            403, "Bạn chỉ có quyền xem module này, không được phép thao tác"
        )


def require_module_access(sb, actor, module_key: str) -> str:
    """Check actor has at least 'read' on module_key. Returns the access level."""
    perms = _compute_permissions(sb, actor)
    level = perms.get(module_key, "none")
    if level == "none":
        raise HTTPException(403, f"Bạn không có quyền truy cập module này")
    return level


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


def _payload_dict(model: BaseModel) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=True)
    return model.dict(exclude_unset=True)


def _payload_crm_value(payload: dict[str, Any]) -> str | None:
    crm = payload.get("crm_name") if "crm_name" in payload else payload.get("crmName")
    crm = str(crm or "").strip()
    return crm or None


def _payload_has_crm(payload: dict[str, Any]) -> bool:
    return "crm_name" in payload or "crmName" in payload


def _payload_wants_unlink_crm(payload: dict[str, Any]) -> bool:
    if "crm_name" in payload:
        return not str(payload.get("crm_name") or "").strip()
    if "crmName" in payload:
        return not str(payload.get("crmName") or "").strip()
    return False


def _patch_banned(body: AuthUserPatchBody) -> bool | None:
    return body.is_banned if body.is_banned is not None else body.banned


def register_admin_routes(app, get_supabase):
    """Attach routes to FastAPI app."""

    @app.get("/me")
    def get_me(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization, allow_unactivated=True)
        profile = staff_to_profile(actor)
        profile["department"] = _actor_department(actor)
        profile["permissions"] = _compute_permissions(sb, actor)
        return profile

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
            users_res = sb.auth.admin.list_users(page=1, per_page=1000)
            users = users_res if isinstance(users_res, list) else getattr(users_res, "users", []) or []
        except Exception as exc:
            raise HTTPException(500, f"Không liệt kê được auth users: {exc}") from exc

        staff_res = (
            sb.table("nhan_su_sale")
            .select("crm_name, email, role, team, sub_team, sdt, display_name")
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
                    "subTeam": meta.get("sub_team") or (linked.get("sub_team") if linked else None),
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
        payload = _payload_dict(body)

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
        has_crm_payload = _payload_has_crm(payload)
        unlink_crm = _payload_wants_unlink_crm(payload)
        crm_name = _payload_crm_value(payload) if has_crm_payload else None
        old_crm_name = _metadata_crm_name(current_metadata)

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
        existing_crm_name = old_crm_name or existing_staff_crm or None

        if body.is_activated is True and not unlink_crm and not (crm_name or existing_crm_name):
            dept_for_check = _normalize_department(
                body.department if body.department is not None else current_metadata.get("department")
            )
            if dept_for_check is None or dept_for_check == "sale":
                raise HTTPException(
                    400,
                    "Cần liên kết CRM (hoặc đặt phòng ban HR/Marketing/CS) trước khi kích hoạt tài khoản",
                )

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
            updated_metadata["crmName"] = None
            updated_metadata["crm_name"] = None
            updated_metadata["is_activated"] = False
        elif crm_name:
            updated_metadata["crmName"] = crm_name
        if body.is_activated is not None and not unlink_crm:
            updated_metadata["is_activated"] = body.is_activated
        if body.full_name is not None:
            updated_metadata["full_name"] = body.full_name.strip() or None
        if body.phone is not None:
            updated_metadata["phone"] = body.phone.strip() or None
        if body.department is not None:
            updated_metadata["department"] = body.department.strip() or None
        if body.team is not None:
            updated_metadata["team"] = body.team.strip() or None
        if body.sub_team is not None:
            updated_metadata["sub_team"] = body.sub_team.strip() or None

        if updated_metadata != current_metadata:
            attrs["user_metadata"] = updated_metadata

        staff_crm_to_update = crm_name or existing_crm_name
        staff_patch: dict[str, Any] = {}
        if crm_name:
            staff_patch["email"] = target_email
        if role_value is not None and staff_crm_to_update:
            staff_patch["role"] = role_value

        if not attrs and not staff_patch and not crm_name and not unlink_crm:
            raise HTTPException(400, "Không có trường cần cập nhật")

        try:
            if attrs:
                sb.auth.admin.update_user_by_id(user_id, attrs)
            if unlink_crm:
                if old_crm_name:
                    sb.table("nhan_su_sale").update({"email": None}).eq(
                        "crm_name", old_crm_name
                    ).execute()
            elif staff_patch and staff_crm_to_update:
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

    @app.post("/admin/auth-users/bulk-delete")
    def bulk_delete_auth_users(
        body: BulkDeleteAuthUsersBody,
        authorization: str | None = Header(None),
    ):
        """Admin xóa nhiều tài khoản auth cùng lúc. Tự động gỡ liên kết CRM trước khi xóa.

        An toàn:
        - Cấm xóa chính mình (tránh tự khóa quyền truy cập).
        - Cấm xóa các tài khoản trong SYSTEM_ADMIN_EMAILS (Hiếu/Kem/Minh…).
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        if not body.user_ids:
            raise HTTPException(400, "Danh sách user_ids không được rỗng")

        actor_email = (getattr(actor, "email", "") or "").strip().lower()
        protected_emails = _system_admin_emails()

        deleted: list[str] = []
        errors: list[dict[str, str]] = []

        for uid in body.user_ids:
            email = ""
            try:
                # Lấy thông tin user để biết email và CRM
                try:
                    user_res = sb.auth.admin.get_user_by_id(uid)
                    user = _auth_user_to_dict(user_res)
                except Exception:
                    user = {}

                email = str(user.get("email") or "").strip().lower()

                # Chặn tự xóa chính mình
                if email and actor_email and email == actor_email:
                    errors.append({
                        "userId": uid,
                        "email": email,
                        "error": "Không thể tự xóa tài khoản đang đăng nhập",
                    })
                    continue

                # Chặn xóa system admin được bảo vệ
                if email and email in protected_emails:
                    errors.append({
                        "userId": uid,
                        "email": email,
                        "error": "Tài khoản System Admin được bảo vệ, không thể xóa",
                    })
                    continue

                # Gỡ liên kết CRM (nếu có) trước khi xóa
                if email:
                    meta = user.get("user_metadata") or {}
                    crm_name = _metadata_crm_name(meta)
                    if crm_name:
                        sb.table("nhan_su_sale").update({"email": None}).eq(
                            "crm_name", crm_name
                        ).execute()
                    else:
                        # Thử tìm theo email trong bảng nhân sự
                        sb.table("nhan_su_sale").update({"email": None}).eq(
                            "email", email
                        ).execute()

                # Xóa auth user
                sb.auth.admin.delete_user(uid)
                deleted.append(uid)

            except Exception as exc:
                errors.append({
                    "userId": uid,
                    "email": email or None,
                    "error": str(exc),
                })

        # Return partial success tracking
        return {
            "status": "success",
            "deleted_count": len(deleted),
            "deleted": deleted,
            "failed_items": [{"id": e["userId"], "reason": e["error"]} for e in errors],
        }

    @app.get("/admin/permissions")
    def get_admin_permissions(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        res = sb.table("department_permissions").select("*").execute()
        matrix: dict[str, dict[str, str]] = {}
        min_roles: dict[str, dict[str, str]] = {}
        for dept in VALID_DEPARTMENTS:
            matrix[dept] = {mod: "none" for mod in MODULE_LIST}
            min_roles[dept] = {mod: "sale" for mod in MODULE_LIST}
        for r in res.data or []:
            dept = r["department"]
            if dept in matrix:
                matrix[dept][r["module_key"]] = r["access_level"]
                min_roles[dept][r["module_key"]] = r.get("min_role", "sale")
        return {"matrix": matrix, "minRoles": min_roles}

    @app.patch("/admin/permissions")
    def patch_admin_permissions(body: PermissionPatchBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        if body.access_level not in ("none", "read", "full"):
            raise HTTPException(400, "Invalid access level")
        mr = body.min_role if body.min_role in VALID_MIN_ROLES else "sale"

        sb.table("department_permissions").upsert({
            "department": body.department.strip(),
            "module_key": body.module_key.strip(),
            "access_level": body.access_level,
            "min_role": mr,
        }, on_conflict="department, module_key").execute()

        return {"ok": True}

    @app.post("/admin/permissions/seed")
    def seed_admin_permissions(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        existing = sb.table("department_permissions").select("department, module_key").execute()
        existing_keys = {(r["department"], r["module_key"]) for r in existing.data or []}

        rows = []
        for dept, modules in DEFAULT_DEPT_PERMISSIONS.items():
            for mod, level in modules.items():
                if (dept, mod) not in existing_keys:
                    rows.append({"department": dept, "module_key": mod, "access_level": level})

        if rows:
            sb.table("department_permissions").insert(rows).execute()

        return {"seeded": len(rows)}

    @app.get("/admin/permission-overrides")
    def get_permission_overrides(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        res = sb.table("permission_overrides").select("*").order("created_at", desc=True).execute()
        out = []
        for r in res.data or []:
            out.append({
                "email": r["user_email"],
                "moduleKey": r["module_key"],
                "accessLevel": r["access_level"],
            })
        return {"overrides": out}

    @app.post("/admin/permission-overrides")
    def post_permission_override(body: PermissionOverrideBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        if body.access_level not in ("none", "read", "full"):
            raise HTTPException(400, "Invalid access level")

        sb.table("permission_overrides").upsert({
            "user_email": body.email.strip().lower(),
            "module_key": body.module_key.strip(),
            "access_level": body.access_level
        }, on_conflict="user_email, module_key").execute()

        return {"ok": True}

    @app.delete("/admin/permission-overrides")
    def delete_permission_override(email: str, module_key: str, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        sb.table("permission_overrides").delete().eq("user_email", email.strip().lower()).eq("module_key", module_key.strip()).execute()
        return {"ok": True}

    @app.put("/admin/permission-overrides/bulk")
    def bulk_override(body: BulkOverrideBody, authorization: str | None = Header(None)):
        """Set/reset all overrides for one user in a single call.

        body.overrides is a dict: module_key -> access_level.
        Use "reset" as the access_level to delete an override (revert to dept default).
        Only modules present in the dict are touched; others are left unchanged.
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_min_role(actor, "system")

        email = body.email.strip().lower()
        upserts: list[dict] = []
        deletes: list[str] = []

        for mk, al in body.overrides.items():
            mk = mk.strip()
            if mk not in MODULE_LIST:
                continue
            if al == "reset":
                deletes.append(mk)
            elif al in ACCESS_LEVELS:
                upserts.append({
                    "user_email": email,
                    "module_key": mk,
                    "access_level": al,
                })

        if upserts:
            sb.table("permission_overrides").upsert(
                upserts, on_conflict="user_email, module_key"
            ).execute()

        for mk in deletes:
            sb.table("permission_overrides").delete().eq(
                "user_email", email
            ).eq("module_key", mk).execute()

        return {"ok": True, "upserted": len(upserts), "deleted": len(deletes)}

    # ------------------------------------------------------------------
    # Audit logs — read-only query for reconciliation audit trail
    # ------------------------------------------------------------------
    @app.get("/audit-logs")
    def get_audit_logs(
        target_type: str | None = None,
        target_id: str | None = None,
        action: str | None = None,
        limit: int = 50,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "reconciliation")
        q = sb.table("audit_logs").select("*").order("created_at", desc=True).limit(min(limit, 200))
        if target_type:
            q = q.eq("target_type", target_type.strip())
        if target_id:
            q = q.eq("target_id", target_id.strip())
        if action:
            q = q.eq("action", action.strip())
        res = q.execute()
        rows = res.data or []

        # Enrich actor_name (display_name tu nhan_su_sale) de FE hien ten thay vi email.
        actor_emails: set[str] = set()
        for row in rows:
            email = str(row.get("actor_email") or "").strip()
            if not email or email.startswith("system:"):
                continue
            actor_emails.add(email.lower())
        name_map: dict[str, str] = {}
        if actor_emails:
            try:
                staff_res = (
                    sb.table("nhan_su_sale")
                    .select("email, display_name, crm_name")
                    .in_("email", list(actor_emails))
                    .execute()
                )
                for s in staff_res.data or []:
                    email = str(s.get("email") or "").strip().lower()
                    if not email:
                        continue
                    display = s.get("display_name") or s.get("crm_name")
                    if display:
                        name_map[email] = display
            except Exception as exc:
                print(f"[audit_logs] actor name lookup failed: {exc}")

        for row in rows:
            email = str(row.get("actor_email") or "").strip().lower()
            row["actor_name"] = name_map.get(email) if email else None

        return {"data": rows}

    # ------------------------------------------------------------------
    # Audit logs — read-only query for reconciliation audit trail
    # ------------------------------------------------------------------
    @app.get("/audit-logs")
    def get_audit_logs(
        target_type: str | None = None,
        target_id: str | None = None,
        action: str | None = None,
        limit: int = 50,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "reconciliation")
        q = sb.table("audit_logs").select("*").order("created_at", desc=True).limit(min(limit, 200))
        if target_type:
            q = q.eq("target_type", target_type.strip())
        if target_id:
            q = q.eq("target_id", target_id.strip())
        if action:
            q = q.eq("action", action.strip())
        res = q.execute()
        rows = res.data or []

        # Enrich actor_name (display_name tu nhan_su_sale) de FE hien ten thay vi email.
        actor_emails: set[str] = set()
        for row in rows:
            email = str(row.get("actor_email") or "").strip()
            if not email or email.startswith("system:"):
                continue
            actor_emails.add(email.lower())
        name_map: dict[str, str] = {}
        if actor_emails:
            try:
                staff_res = (
                    sb.table("nhan_su_sale")
                    .select("email, display_name, crm_name")
                    .in_("email", list(actor_emails))
                    .execute()
                )
                for s in staff_res.data or []:
                    email = str(s.get("email") or "").strip().lower()
                    if not email:
                        continue
                    display = s.get("display_name") or s.get("crm_name")
                    if display:
                        name_map[email] = display
            except Exception as exc:
                print(f"[audit_logs] actor name lookup failed: {exc}")

        for row in rows:
            email = str(row.get("actor_email") or "").strip().lower()
            row["actor_name"] = name_map.get(email) if email else None

        return {"data": rows}

    # ------------------------------------------------------------------
    # Zalo Team Groups Management (Task G5)
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/zalo-groups")
    def get_zalo_groups(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "zalo")

        res = sb.table("zalo_team_groups").select("*").order("updated_at", desc=True).execute()
        return {"data": res.data or []}

    @app.post("/api/v1/admin/zalo-groups")
    def create_zalo_group(payload: ZaloGroupCreatePayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        data = {
            "team_code": payload.team_code.strip(),
            "group_id": payload.group_id.strip(),
            "group_name": payload.group_name.strip(),
            "is_active": payload.is_active,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        try:
            res = sb.table("zalo_team_groups").insert(data).execute()
            if not res.data:
                raise HTTPException(400, "Không thể thêm mới Zalo Group (Có thể team_code đã tồn tại)")
            return {"data": res.data[0]}
        except Exception as e:
            raise HTTPException(400, f"Lỗi thao tác CSDL: {str(e)}")

    @app.patch("/api/v1/admin/zalo-groups/{team_code}")
    def update_zalo_group(team_code: str, payload: ZaloGroupPatchPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        patch_data = {}
        if payload.group_id is not None:
            patch_data["group_id"] = payload.group_id.strip()
        if payload.group_name is not None:
            patch_data["group_name"] = payload.group_name.strip()
        if payload.is_active is not None:
            patch_data["is_active"] = payload.is_active

        if not patch_data:
            raise HTTPException(400, "Không có dữ liệu cập nhật")

        patch_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        res = sb.table("zalo_team_groups").update(patch_data).eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy Zalo Group cho team_code: {team_code}")
        
        return {"data": res.data[0]}

    @app.delete("/api/v1/admin/zalo-groups/{team_code}")
    def delete_zalo_group(team_code: str, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        res = sb.table("zalo_team_groups").delete().eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy Zalo Group cho team_code: {team_code}")
        
        return {"success": True, "deleted_team_code": team_code}

    # ------------------------------------------------------------------
    # Zalo Outbox Admin (Task G6)
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/zalo-outbox")
    def get_zalo_outbox(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "zalo")

        res = sb.table("zalo_outbox").select("*").order("created_at", desc=True).limit(50).execute()
        return {"data": res.data or []}

    @app.post("/api/v1/admin/zalo-outbox/{msg_id}/retry")
    def retry_zalo_outbox(msg_id: int, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        patch_data = {
            "retries": 0,
            "last_error": None,
            "next_retry_at": datetime.now(timezone.utc).isoformat(),
            "sent_at": None
        }

        res = sb.table("zalo_outbox").update(patch_data).eq("id", msg_id).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy tin nhắn Zalo Outbox với ID: {msg_id}")
        
        return {"ok": True}

    @app.post("/api/v1/admin/zalo-outbox/{msg_id}/cancel")
    def cancel_zalo_outbox(msg_id: int, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        row = sb.table("zalo_outbox").select("sent_at").eq("id", msg_id).execute()
        if not row.data:
            raise HTTPException(404, f"Không tìm thấy tin nhắn Zalo Outbox với ID: {msg_id}")
        if row.data[0].get("sent_at"):
            raise HTTPException(400, "Tin nhắn đã gửi, không thể huỷ")

        patch_data = {
            "retries": 99,
            "last_error": "Cancelled by admin",
            "next_retry_at": None,
        }
        res = sb.table("zalo_outbox").update(patch_data).eq("id", msg_id).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy tin nhắn Zalo Outbox với ID: {msg_id}")

        return {"ok": True}

    # ------------------------------------------------------------------
    # Zalo OA Configuration (Task G4)
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/zalo-config")
    def get_zalo_config(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "zalo")

        res = sb.table("zalo_oa_credentials").select("app_id, expires_at").limit(1).execute()
        if not res.data:
            return {"data": None}

        record = res.data[0]
        expires_at_str = record.get("expires_at")
        status = "good"

        if expires_at_str:
            try:
                # Xử lý UTC iso format
                expires_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                now_dt = datetime.now(timezone.utc)
                remaining_seconds = (expires_dt - now_dt).total_seconds()
                if remaining_seconds <= 0:
                    status = "expired"
                elif remaining_seconds <= 3600:
                    status = "expiring"
            except Exception:
                pass

        return {
            "data": {
                "app_id": record.get("app_id"),
                "expires_at": expires_at_str,
                "status": status
            }
        }

    @app.post("/api/v1/admin/zalo-config")
    def upsert_zalo_config(payload: ZaloConfigPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        # Xóa cấu hình cũ và thêm cấu hình mới
        sb.table("zalo_oa_credentials").delete().neq("id", 0).execute()

        data = {
            "app_id": payload.app_id.strip(),
            "app_secret": payload.app_secret.strip(),
            "access_token": payload.access_token.strip(),
            "refresh_token": payload.refresh_token.strip(),
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=25)).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        res = sb.table("zalo_oa_credentials").insert(data).execute()
        if not res.data:
            raise HTTPException(400, "Không thể lưu cấu hình Zalo OA")

        return {"ok": True}

    @app.post("/api/v1/admin/zalo-config/refresh")
    def refresh_zalo_token(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        from zalo_notifier import refresh_access_token
        try:
            result = refresh_access_token(sb=sb)
            return {"ok": True, "expires_at": result.get("expires_at")}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    @app.post("/api/v1/admin/zalo-config/test")
    def test_zalo_config(payload: ZaloTestMessagePayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "zalo")

        from zalo_notifier import send_text_to_group
        try:
            msg_id = send_text_to_group(payload.group_id, payload.message, sb=sb)
            image_result = None
            if payload.image_url:
                from zalo_notifier import send_image_to_group
                try:
                    img_msg_id = send_image_to_group(payload.group_id, payload.image_url, sb=sb)
                    image_result = {"ok": True, "message_id": img_msg_id}
                except Exception as img_e:
                    image_result = {"ok": False, "error": str(img_e)}
            return {"ok": True, "message_id": msg_id, "image": image_result}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ------------------------------------------------------------------
    # DingTalk Team Groups Management
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/dingtalk-groups")
    def get_dingtalk_groups(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "dingtalk")

        res = (
            sb.table("dingtalk_team_groups")
            .select("team_code, open_conversation_id, group_name, is_active, updated_at")
            .order("updated_at", desc=True)
            .execute()
        )
        return {"data": res.data or []}

    @app.post("/api/v1/admin/dingtalk-groups")
    def create_dingtalk_group(payload: DingTalkGroupCreatePayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        data = {
            "team_code": payload.team_code.strip(),
            "open_conversation_id": payload.open_conversation_id.strip(),
            "group_name": payload.group_name.strip(),
            "is_active": payload.is_active,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            res = sb.table("dingtalk_team_groups").insert(data).execute()
            if not res.data:
                raise HTTPException(400, "Không thể thêm DingTalk group (team_code có thể đã tồn tại)")
            return {"data": res.data[0]}
        except Exception as e:
            raise HTTPException(400, f"Lỗi CSDL: {str(e)}")

    @app.patch("/api/v1/admin/dingtalk-groups/{team_code}")
    def update_dingtalk_group(team_code: str, payload: DingTalkGroupPatchPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        patch_data: dict[str, Any] = {}
        if payload.open_conversation_id is not None:
            patch_data["open_conversation_id"] = payload.open_conversation_id.strip()
        if payload.group_name is not None:
            patch_data["group_name"] = payload.group_name.strip()
        if payload.is_active is not None:
            patch_data["is_active"] = payload.is_active

        if not patch_data:
            raise HTTPException(400, "Không có dữ liệu cập nhật")

        patch_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        res = sb.table("dingtalk_team_groups").update(patch_data).eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Group: {team_code}")
        return {"data": res.data[0]}

    @app.delete("/api/v1/admin/dingtalk-groups/{team_code}")
    def delete_dingtalk_group(team_code: str, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        res = sb.table("dingtalk_team_groups").delete().eq("team_code", team_code).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Group: {team_code}")
        return {"success": True, "deleted_team_code": team_code}

    # ------------------------------------------------------------------
    # DingTalk Outbox
    # ------------------------------------------------------------------
    @app.get("/api/v1/admin/dingtalk-outbox")
    def get_dingtalk_outbox(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "dingtalk")

        res = (
            sb.table("dingtalk_outbox")
            .select("*")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        return {"data": res.data or []}

    @app.post("/api/v1/admin/dingtalk-outbox/{msg_id}/retry")
    def retry_dingtalk_outbox(msg_id: int, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        patch_data = {
            "retries": 0,
            "last_error": None,
            "next_retry_at": datetime.now(timezone.utc).isoformat(),
            "sent_at": None,
        }
        res = sb.table("dingtalk_outbox").update(patch_data).eq("id", msg_id).execute()
        if not res.data:
            raise HTTPException(404, f"Không tìm thấy DingTalk Outbox: {msg_id}")
        return {"ok": True}

    # ------------------------------------------------------------------
    # DingTalk test send
    # ------------------------------------------------------------------
    @app.post("/api/v1/admin/dingtalk-test")
    def test_dingtalk_message(payload: DingTalkTestPayload, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dingtalk")

        from dingtalk_notifier import send_group_message

        creds = (
            sb.table("dingtalk_team_groups")
            .select("open_conversation_id, is_active")
            .eq("team_code", payload.team_code)
            .limit(1)
            .execute()
        )
        if not creds.data:
            return {"ok": False, "error": f"team_code {payload.team_code} không tồn tại"}
        row = creds.data[0]
        if not row.get("is_active"):
            return {"ok": False, "error": "Group đang disable"}

        try:
            msg_id = send_group_message(
                open_conversation_id=row["open_conversation_id"],
                message=payload.message,
                title="Test DingTalk",
            )
            return {"ok": True, "message_id": msg_id}
        except Exception as e:
            return {"ok": False, "error": str(e)}
