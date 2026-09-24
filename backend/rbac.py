"""Role-based access helpers for PalFish GMV API."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import HTTPException

_http = httpx.Client(timeout=15)

ROLE_RANK = {"sale": 1, "ops": 2, "leader": 2, "manager": 3, "system": 4}
OPS_ROLES = {"ops", "system"}

# ---------------------------------------------------------------------------
# Cache in-process TTL (M2-T1, plan pr-list-server-pagination) — mỗi request
# GET /payment-requests trước đây query lại toàn bộ nhan_su_sale nhiều lần
# (_lookup_staff mỗi resolve_actor, _sale_name_map + _staff_map mỗi list/summary).
# TTL ngắn (mặc định 120s, env RBAC_CACHE_TTL, 0 = tắt cache) đủ để giảm tải mà
# không làm đổi quyền chậm hơn 1 vòng cache khi admin sửa nhan_su_sale.
# ---------------------------------------------------------------------------
_TTL_CACHE: dict[str, tuple[float, Any]] = {}


def _rbac_cache_ttl() -> float:
    try:
        return float(os.getenv("RBAC_CACHE_TTL", "120"))
    except ValueError:
        return 120.0


def _cached(key: str, ttl: float, fn: Callable[[], Any]) -> Any:
    if ttl <= 0:
        return fn()
    now = time.monotonic()
    hit = _TTL_CACHE.get(key)
    if hit is not None and (now - hit[0]) < ttl:
        return hit[1]
    value = fn()
    _TTL_CACHE[key] = (now, value)
    return value


def invalidate_roster() -> None:
    """Xoá cache liên quan nhan_su_sale — gọi ở điểm mutate bảng này
    (admin_routes.py: thêm/sửa/xoá nhân sự) để tránh quyền cũ sống sót
    quá TTL sau khi admin vừa đổi team/role/is_active."""
    for k in list(_TTL_CACHE.keys()):
        if k.startswith("staff:") or k.startswith("roster_emails:"):
            _TTL_CACHE.pop(k, None)


@dataclass
class Actor:
    email: str
    user_id: str | None
    role: str
    staff: dict[str, Any] | None
    department: str | None = None
    is_activated: bool = False


def _normalize_role(raw: str | None) -> str:
    r = (raw or "sale").lower().strip()
    if r == "admin":
        return "system"
    if r not in ROLE_RANK:
        return "sale"
    return r


def _rank(role: str) -> int:
    return ROLE_RANK.get(_normalize_role(role), 1)


def _effective_role(meta_role: str, staff_role: str | None, is_env_admin: bool) -> str:
    """nhan_su_sale = nguồn sự thật cho PHÂN CẤP SALE (sale/leader/manager) nhưng
    KHÔNG được HẠ CẤP identity mà auth tuyên bố là superuser: lấy role CAO hơn giữa
    (auth, staff). Chống bug staff role=sale (import nhầm vào bảng sale, team
    'Khác / Chưa phân loại') kéo tụt admin/system → scope PR về rỗng (sự cố 5/9)."""
    role = staff_role or meta_role
    if _rank(meta_role) > _rank(role):
        role = meta_role
    if is_env_admin:
        role = "system"
    return role


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def require_min_role(actor: Actor, minimum: str) -> None:
    if _rank(actor.role) < _rank(minimum):
        raise HTTPException(403, f"Cần quyền {minimum} trở lên")


def can_confirm_payment(actor: Actor) -> bool:
    if _normalize_role(actor.role) in OPS_ROLES:
        return True
    ops_raw = os.getenv("OPS_EMAILS", "") or os.getenv("VITE_OPS_EMAILS", "")
    ops = {e.strip().lower() for e in ops_raw.split(",") if e.strip()}
    return actor.email.lower() in ops


def can_credit_referral(actor: Actor) -> bool:
    if actor.role in ("system", "manager"):
        return True
    return can_confirm_payment(actor)


def require_referral_credit(actor: Actor) -> None:
    if not can_credit_referral(actor):
        raise HTTPException(403, "Cần quyền Ops/Manager/System để xác nhận cộng buổi")


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


_jwks_client: PyJWKClient | None = None
_jwks_url: str = ""


def _get_jwks_client() -> PyJWKClient | None:
    """PyJWKClient cache JWKS public key (ES256) — fetch 1 lần rồi verify offline."""
    global _jwks_client, _jwks_url
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        return None
    if _jwks_client is None or _jwks_url != url:
        _jwks_url = url
        _jwks_client = PyJWKClient(
            f"{url}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600
        )
    return _jwks_client


def _auth_user_from_jwt_remote(token: str) -> dict[str, Any] | None:
    """Fallback: gọi Supabase Auth API verify token (chậm ~400ms/network). Chỉ dùng khi
    verify local fail (token legacy HS256, JWKS chưa sẵn, lỗi). Giữ đúng hành vi cũ."""
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        res = _http.get(
            f"{url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": key,
            },
        )
        if res.status_code != 200:
            return None
        return res.json()
    except Exception as exc:
        print(f"JWT user lookup failed: {exc}")
        return None


def _claims_to_user(claims: dict[str, Any]) -> dict[str, Any]:
    """Dựng dict tương thích /auth/v1/user từ JWT claims (resolve_actor chỉ đọc
    email / user_metadata / id=sub)."""
    return {
        "id": claims.get("sub"),
        "email": claims.get("email"),
        "user_metadata": claims.get("user_metadata") or {},
    }


def _auth_user_from_jwt(token: str) -> dict[str, Any] | None:
    """Verify JWT LOCAL — 0 network, bỏ ~400ms/request (dính lên MỌI endpoint).
    Claims Supabase đã chứa email + user_metadata + sub.
    1) ES256 qua JWKS public key (token ký bằng signing key ECC hiện tại).
    2) HS256 qua SUPABASE_JWT_SECRET nếu đã set (token legacy chưa roll sang ECC).
    3) Fallback: _auth_user_from_jwt_remote (gọi Auth API — chậm, cho token lạ/JWKS lỗi).
    Bảo mật giữ nguyên: verify chữ ký + exp + aud='authenticated' ở cả 2 nhánh."""
    # 1) ES256 (JWKS public key)
    client = _get_jwks_client()
    if client is not None:
        try:
            signing_key = client.get_signing_key_from_jwt(token)
            return _claims_to_user(jwt.decode(
                token, signing_key.key, algorithms=["ES256"],
                audience="authenticated", options={"require": ["exp", "sub"]},
            ))
        except Exception:
            pass
    # 2) HS256 (legacy shared secret) — chỉ khi env có
    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if secret:
        try:
            return _claims_to_user(jwt.decode(
                token, secret, algorithms=["HS256"],
                audience="authenticated", options={"require": ["exp", "sub"]},
            ))
        except Exception:
            pass
    # 3) Fallback remote
    return _auth_user_from_jwt_remote(token)


def _lookup_staff(sb, email: str) -> dict[str, Any] | None:
    def _fetch() -> dict[str, Any] | None:
        try:
            res = (
                sb.table("nhan_su_sale")
                .select("*")
                .eq("email", email)
                .limit(1)
                .execute()
            )
            if res.data:
                return res.data[0]
            return None
        except Exception as exc:
            print(f"staff lookup: {exc}")
            return None

    return _cached(f"staff:{(email or '').strip().lower()}", _rbac_cache_ttl(), _fetch)


def resolve_actor(sb, authorization: str | None, *, allow_unactivated: bool = False) -> Actor:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(401, "Thiếu token đăng nhập")

    user = _auth_user_from_jwt(token)
    if not user:
        raise HTTPException(401, "Token không hợp lệ")

    email = (user.get("email") or "").strip()
    if not email:
        raise HTTPException(401, "Email không có trong token")

    admin_emails = {
        e.strip().lower()
        for e in (os.getenv("SYSTEM_ADMIN_EMAILS") or "").split(",")
        if e.strip()
    }
    is_system_admin_email = email.lower() in admin_emails

    meta = user.get("user_metadata") or {}
    meta_role = _normalize_role(meta.get("role"))
    staff = _lookup_staff(sb, email) if sb else None
    is_activated = _is_truthy(meta.get("is_activated", False))

    staff_role = _normalize_role(staff["role"]) if (staff and staff.get("role")) else None
    role = _effective_role(meta_role, staff_role, is_system_admin_email)

    if (
        not allow_unactivated
        and not is_activated
        and not is_system_admin_email
        and role != "system"
    ):
        raise HTTPException(
            403,
            "Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin.",
        )

    return Actor(
        email=email,
        user_id=user.get("id"),
        role=role,
        staff=staff,
        department=meta.get("department"),
        is_activated=is_activated,
    )


def staff_to_profile(actor: Actor) -> dict[str, Any]:
    s = actor.staff or {}
    return {
        "email": actor.email,
        "userId": actor.user_id,
        "role": actor.role,
        "crmName": s.get("crm_name"),
        "displayName": s.get("display_name") or (actor.staff and s.get("crm_name")),
        "phone": s.get("sdt"),
        "team": s.get("team"),
        "subTeam": s.get("sub_team"),
        "managerEmail": s.get("manager_email"),
        "leaderEmail": s.get("leader_email"),
        "isActive": s.get("is_active", True),
        "linked": bool(s.get("crm_name")),
        "canConfirmPayment": can_confirm_payment(actor),
        "canAccessAdmin": _rank(actor.role) >= _rank("manager"),
        "canManageStaff": _rank(actor.role) >= _rank("system"),
        "isActivated": actor.is_activated,
    }


def enforce_report_scope(
    actor: Actor,
    requested_team: str | None = None,
) -> tuple[str | None, str | None]:
    """Enforce data scope for reports based on role.

    Returns (team_filter, sub_team_filter):
    - system: honour the requested team, no sub_team restriction
    - manager: force to actor's team (whole branch)
    - leader / sale: force to actor's team + sub_team
    """
    role = _normalize_role(actor.role)
    if role in OPS_ROLES:
        return (requested_team or "").strip() or None, None

    staff = actor.staff or {}
    actor_team = (staff.get("team") or "").strip()
    actor_sub = (staff.get("sub_team") or "").strip()

    if role == "manager":
        if not actor_team:
            raise HTTPException(403, "Tai khoan manager chua duoc link voi team trong nhan_su_sale")
        return actor_team, None
    if role in ("leader", "sale"):
        if not actor_team:
            raise HTTPException(403, "Tai khoan chua duoc link voi team trong nhan_su_sale")
        return actor_team, actor_sub or None
    return (requested_team or "").strip() or None, None


def scope_sale_names(sb, team: str, sub_team: str) -> set[str]:
    """Return CRM names of active staff in a specific team + sub_team."""
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("crm_name")
            .eq("team", team)
            .eq("sub_team", sub_team)
            .eq("is_active", True)
            .execute()
        )
        return {
            (r.get("crm_name") or "").strip()
            for r in (res.data or [])
            if (r.get("crm_name") or "").strip()
        }
    except Exception as exc:
        print(f"scope_sale_names: {exc}")
        return set()


def visible_creator_emails(sb, actor: Actor) -> list[str] | None:
    """None = all orders (system). Otherwise filter don_hang.created_by.

    Roster (email theo team/sub_team) cache TTL (M2-T1) — actor.email tự thêm
    LUÔN TƯƠI (không cache) để không lệ thuộc key cache khớp đúng actor."""
    role = _normalize_role(actor.role)
    if role in OPS_ROLES:
        return None
    if role == "sale":
        return [actor.email.lower()]

    staff = actor.staff or {}
    team = staff.get("team")
    sub = staff.get("sub_team")
    if not team:
        return [actor.email.lower()]

    def _fetch() -> list[str]:
        try:
            q = sb.table("nhan_su_sale").select("email").eq("is_active", True).eq("team", team)
            if role == "leader" and sub:
                q = q.eq("sub_team", sub)
            res = q.execute()
            return [
                (row.get("email") or "").strip().lower()
                for row in (res.data or [])
                if (row.get("email") or "").strip()
            ]
        except Exception as exc:
            print(f"visible_emails: {exc}")
            return []

    roster = _cached(f"roster_emails:{role}:{team}:{sub}", _rbac_cache_ttl(), _fetch)
    return list({actor.email.lower(), *roster})


def actor_ma_nv(actor: Actor) -> str | None:
    """Mã NV (HN0001) của chính actor — cầu nối tới payslips.code (M4/N2)."""
    code = ((actor.staff or {}).get("ma_nv") or "").strip()
    return code or None


def visible_payslip_codes(sb, actor: Actor) -> list[str] | None:
    """Mã NV mà actor được xem phiếu lương.

    None = xem hết (chỉ admin/system).
    Mọi role khác (kể cả leader/manager/ops) chỉ thấy phiếu của chính mình.
    """
    role = _normalize_role(actor.role)
    if role == "system":
        return None

    own = actor_ma_nv(actor)
    return [own] if own else []
