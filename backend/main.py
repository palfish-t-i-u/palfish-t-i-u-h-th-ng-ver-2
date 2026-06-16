import hashlib
import hmac
import json
import os
import random
import re
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from activation_routes import register_activation_routes
from admin_routes import register_admin_routes, require_module_write
from crm_routes import register_crm_routes
from dashboard_routes import register_dashboard_routes
from invoice_routes import register_invoice_routes
from notification_routes import register_notification_routes
from payment_request_routes import (
    reconcile_payment_line_webhook,
    register_payment_request_routes,
)
from report_routes import register_report_routes
from revenue_routes import register_revenue_routes
from rbac import can_confirm_payment, resolve_actor, visible_creator_emails
from payos_qr import parse_transfer_content_from_qr
from env_utils import app_env, is_sandbox_env
from sepay_routes import register_sepay_routes
from mpos_import import register_mpos_routes

CANCEL_ANY_ROLES = {"manager", "system", "ops"}
PAYOS_MAX_SAFE_ORDER_CODE = 9_007_199_254_740_991

_REPO_ROOT = Path(__file__).resolve().parent.parent
# fix: uvicorn --reload trên Windows spawn subprocess với __file__ không ổn định
# → dùng đường dẫn tuyệt đối tính từ vị trí file này tại compile time
_BACKEND_DIR = Path(__file__).parent.absolute()
_BACKEND_ENV = _BACKEND_DIR / ".env"
load_dotenv(_REPO_ROOT / "api_pipe" / ".env")
load_dotenv(_BACKEND_ENV, override=True)

import sys

if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from api_pipe.payos_webhook import (
    handle_payos_webhook,
    normalize_reconcile_status,
    reconcile_bank_payment,
    reconcile_status_filter_values,
)

app = FastAPI(title="PalFish GMV Reconciliation API")

_frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
_extra = os.getenv("FRONTEND_URLS", "")
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://palfish-gmv-manager.vercel.app",
    "https://pf-gmv-reconciliation.vercel.app",
]
_origins = list(
    {
        o.strip()
        for o in (_frontend, *_default_origins, *_extra.split(","))
        if o and o.strip()
    }
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=r"https://(pf-gmv|palfish).*\.vercel\.app|http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fallback in-memory khi chưa cấu hình Supabase
_orders_mem: dict[str, dict[str, Any]] = {}
_order_seq = 0
_giao_dich_mem: list[dict[str, Any]] = []

FALLBACK_PACKAGES = [
    "2/W- NEW 24 PHI+2 HN 河内",
    "2/W- NEW 48 PHI+5 HN 河内",
    "2/W- NEW 96 PHI+10 HN 河内",
    "2/W- NEW 144 PHI+15 HN 河内",
    "2/W- NEW 192 PHI+20 HN 河内",
    "2/W- UPSALE 24 PHI+2 HN 河内",
    "2/W- UPSALE 48 PHI+5 HN 河内",
    "2/W- UPSALE 96 PHI+10 HN 河内",
    "2/W- UPSALE 144 PHI+15 HN 河内",
    "2/W- UPSALE 192 PHI+20 HN 河内",
    "2/W- NEW 24 US-UK+1 HN 河内",
    "2/W- NEW 48 US-UK+2 HN 河内",
    "2/W- NEW 96 US-UK+5 HN 河内",
    "2/W- UPSALE 24 US-UK+1 HN 河内",
    "2/W- UPSALE 48 US-UK+2 HN 河内",
    "2/W- UPSALE 96 US-UK+5 HN 河内",
    "2/W- Only A REFER 24 PHI+2 HN 河内",
    "2/W- Only A REFER 48 PHI+5 HN 河内",
    "2/W- Only A REFER 96 PHI+10 HN 河内",
    "2/W- Both AB REFER 24 PHI+2 HN 河内",
    "2/W- Both AB REFER 48 PHI+5 HN 河内",
    "2/W- Both AB REFER 96 PHI+10 HN 河内",
    "2/W- Both AB REFER 144 PHI+15 HN 河内",
    "2/W- Both AB REFER 192 PHI+20 HN 河内",
    "2/W- Both AB REFER 24 US-UK+1 HN 河内",
    "2/W- Both AB REFER 48 US-UK+2 HN 河内",
    "2/W- Both AB REFER 96 US-UK+5 HN 河内",
    "2/W- Both AB 96 PHI+10 HN 河内",
    "2/W- NEW 24 PHI+2 HCM 胡志明",
    "2/W- NEW 48 PHI+5 HCM 胡志明",
    "2/W- NEW 96 PHI+10 HCM 胡志明",
    "2/W- NEW 24 PHI+2 HCM",
    "2/W- NEW 48 PHI+5 HCM",
    "2/W- NEW 24 US-UK+1 HCM 胡志明",
    "2/W- NEW 48 US-UK+2 HCM 胡志明",
    "2/W- NEW 24 US-UK+1 HCM",
    "2/W- UPSALE 24 PHI+2 HCM 胡志明",
    "2/W- UPSALE 48 PHI+5 HCM 胡志明",
    "2/W- UPSALE 96 PHI+10 HCM 胡志明",
    "2/W- UPSALE 24 US-UK+1 HCM 胡志明",
    "2/W- UPSALE 48 US-UK+2 HCM 胡志明",
    "2/W- Both AB REFER 24 PHI+2 HCM 胡志明",
    "2/W- Both AB REFER 48 PHI+5 HCM 胡志明",
    "2/W- Both AB REFER 96 PHI+10 HCM 胡志明",
    "2/W- Both AB REFER 96 US-UK+5 HCM 胡志明",
    "2/W- NEW 24 PHI+2 DN 岘港",
    "2/W- NEW 48 PHI+5 DN 岘港",
    "2/W- NEW 96 PHI+10 DN 岘港",
    "2/W- NEW 24 US-UK+1 DN 岘港",
    "2/W- UPSALE 24 PHI+2 DN 岘港",
    "2/W- UPSALE 48 PHI+5 DN 岘港",
    "2/W- Both AB REFER 24 PHI+2 DN 岘港",
    "2/W- Both AB REFER 48 PHI+5 DN 岘港",
    "3/W - NEW 24 PHI+2+2 HN 河内",
    "3/W - NEW 48 PHI+5+5 HN 河内",
    "3/W - NEW 96 PHI+10+10 HN 河内",
    "8/M - NEW 30 US-UK+5 HN 河内",
    "8/M - NEW 60 US-UK+10 HN 河内",
    "8/M - NEW 120 US-UK+20 HN 河内",
    "8/M - UPSALE 30 US-UK+5 HN 河内",
    "8/M - UPSALE 60 US-UK+10 HN 河内",
    "8/M - Only A REFER 30 US-UK+5 HN 河内",
    "12/M - NEW 30 PHI+10 HN 河内",
    "12/M - NEW 60 PHI+20 HN 河内",
    "12/M - NEW 90 PHI+30 HN 河内",
    "12/M - NEW 96 PHI+10+10 HN 河内",
    "12/M - NEW 120 PHI+40 HN 河内",
    "12/M - UPSALE 30 PHI+10 HN 河内",
    "12/M - UPSALE 60 PHI+20 HN 河内",
    "12/M - UPSALE 90 PHI+30 HN 河内",
    "12/M - UPSALE 120 PHI+40 HN 河内",
    "12/M - UPSALE 150 PHI+50 HN 河内",
    "12/M - Only A REFER 30 PHI +10 HN 河内",
    "12/M - Only A REFER 60 PHI +20 HN 河内",
    "12/M - Both AB REFER 60 PHI +20 HN 河内",
    "APR FIXED 2/W+NEW HN-BẠC-24B 河内菲24节白银",
    "APR FIXED 2/W+NEW HN-VÀNG-48B 河内菲48节黄金",
    "APR FIXED 2/W+NEW HN-VÀNG-48B 河内菲48节黄金 （特殊）",
    "APR FIXED 2/W+NEW HN-VÀNG-60B 河内菲60节黄金",
    "APR FIXED 2/W+NEW HN-KC-96B 河内菲96节钻石",
    "APR FIXED 2/W+UPSALES HN-BẠC-24B 河内菲24节白银",
    "APR FIXED 2/W+UPSALES HN-VÀNG-48B 河内菲48节黄金",
    "APR FIXED 2/W+UPSALES HN-KC-96B 河内菲96节钻石",
    "APR FIXED 2/W+REFER A-PH HN-BẠC-24B 河内菲24节白银",
    "APR FIXED 2/W+REFER A-PH HN-VÀNG-48B 河内菲48节黄金",
    "APR FIXED 2/W+REFER A-PH HN-KC-96B 河内菲96节钻石",
    "APR FIXED 2/W+REFER A-UK HN-VÀNG-48B 河内菲48节黄金",
    "APR FIXED 2/W+NEW HN-BẠC-24B UK 河内欧 24白银",
    "APR FIXED 2/W+NEW HN-VÀNG-48B UK 河内欧48黄金",
    "APR FIXED 2/W+NEW HN-KC-96B UK 河内欧96钻石",
    "APR FIXED 2/W+UPSALE HN-BẠC-24B UK 河内欧24白银",
    "APR FIXED 2/W+UPSALE HN-VÀNG-48B UK 河内欧48黄金",
    "APR FIXED 2/W+UPSALE HN-KC-96B UK 河内欧96钻石",
    "APR FIXED 2/W+REFER A-PH HN-BẠC-24B UK 河内欧24白银",
    "APR FIXED 2/W+REFER A-UK HN-VÀNG-48B UK 河内欧48黄金",
    "APR FIXED 3/W+NEW HN-BẠC-30B 河内菲30节白银",
    "APR FIXED 3/W+NEW HN-VÀNG-60B 河内菲60节黄金",
    "APR FIXED 3/W+UPSALES HN-BẠC-30B 河内菲30节白银",
    "APR FIXED 3/W+REFER A-PH HN-BẠC-30B 河内菲30节白银",
    "APR FIXED 3/W+NEW HN-VÀNG-60B UK 河内欧60黄金",
    "New logic FIXED 2/W+REFER HN 河内 24菲 PHI",
    "New logic FIXED 2/W+REFER HN 河内 48菲 PHI",
    "New logic FIXED 2/W+REFER HN 河内 96菲 PHI",
    "New logic FIXED 2/W+REFER HN 河内 48 UK",
    "New logic FIXED 2/W+REFER HN 河内 96 UK",
    "New logic FIXED 3/W+REFER HN 河内 30菲 PHI",
    "A-only FIXED 2/W+REFER HN 河内 24菲 PHI",
    "A-only FIXED 2/W+REFER HN 河内 48菲 PHI",
    "A-only FIXED 2/W+REFER HN 河内 96菲 PHI",
    "A-only FIXED 2/W+REFER HN 河内 24 UK",
    "+A+B New logic FIXED 2/W+REFER HN 河内 24菲 PHI",
    "+A+B New logic FIXED 2/W+REFER HN 河内 48菲 PHI",
    "+A+B New logic FIXED 2/W+REFER HN 河内 96菲 PHI",
    "UPSALES - 3/W 48 PHI+5+5 HN 河内",
    "UPSALES - 3/W 96 PHI+10+10 HN 河内",
    "UPSALES - 12/M 12 PHI HN 河内",
    "Non Fixed - KOC 10 PHI HN 河内",
    "UP-Non Fixed - KOC 10 PHI HN 河内",
    "KET 36 PHI HCM 胡志明",
    "新签-菲教-特惠-18单元",
]

OPS_ROLES = {"ops", "system"}


def _supabase():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    if "YOUR_PROJECT" in url or "PASTE_" in key or key.startswith("YOUR_"):
        return None
    try:
        from supabase import create_client
        from supabase._sync.client import SupabaseException

        return create_client(url, key)
    except SupabaseException as exc:
        print(f"Supabase client init failed: {exc}")
        return None
    except Exception as exc:
        print(f"Supabase client init failed: {exc}")
        return None


def _next_ma_don(sb=None) -> str:
    if sb:
        from rpc_helpers import rpc_next_ma_don

        ma = rpc_next_ma_don(sb).strip()
        if ma:
            return ma
        raise HTTPException(500, "RPC next_ma_don không trả mã đơn")
    global _order_seq
    _order_seq += 1
    return f"KH{str(_order_seq).zfill(3)}"


def _info_code(ma_don: str) -> str:
    return f"Thanh toan {ma_don}"


def _parse_amount(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0


def _row_to_order(row: dict[str, Any], kh: dict[str, Any] | None = None) -> dict[str, Any]:
    k = kh or {}
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
    return {
        "id": row["id"],
        "maDonHang": row.get("ma_don_hang") or row.get("maDonHang") or "",
        "uid": k.get("crm_uid") or row.get("uid") or "",
        "tenKhach": k.get("ho_ten") or row.get("tenKhach") or "",
        "diaChi": dia_chi or row.get("diaChi") or "",
        "sdt": sdt or row.get("sdt") or "",
        "goiHoc": row.get("goi_hoc") or row.get("goiHoc") or "",
        "tongTien": _parse_amount(row.get("so_tien_can_thu") or row.get("tongTien") or 0),
        "nguon": row.get("nguon_doanh_thu") or row.get("nguon") or "",
        "leadKenh": row.get("lead_kenh") or row.get("leadKenh") or "",
        "datCoc": bool(row.get("dat_coc") if "dat_coc" in row else row.get("datCoc")),
        "uidPhu": row.get("uid_phu") if isinstance(row.get("uid_phu"), list) else (row.get("uidPhu") or []),
        "ghiChu": row.get("ghi_chu") or row.get("ghiChu") or "",
        "infoCode": row.get("info_code") or row.get("infoCode") or "",
        "tienVe": bool(row.get("tien_ve") if "tien_ve" in row else row.get("tienVe")),
        "donCRM": bool(row.get("don_crm") if "don_crm" in row else row.get("donCRM")),
        "billImage": row.get("bill_image") or row.get("billImage"),
        "trangThai": row.get("trang_thai") or row.get("trangThai") or "",
        "trangThaiThuTuc": row.get("trang_thai_thu_tuc") or row.get("trangThaiThuTuc") or "",
        "createdBy": row.get("created_by") or row.get("createdBy"),
        "createdAt": row.get("created_at") or row.get("createdAt"),
    }


class CreateOrderBody(BaseModel):
    uid: str = ""
    uidPhu: list[str] = []
    tenKhach: str = ""
    diaChi: str = ""
    sdt: str = ""
    maVung: str = "+84"
    tinh: str = ""
    quan: str = ""
    phuong: str = ""
    diaChiChiTiet: str = ""
    goiHoc: str = ""
    tongTien: int | str = 0
    nguon: str = ""
    leadKenh: str = ""
    datCoc: bool = False
    ghiChu: str = ""
    createdBy: str | None = None


class InfoCodeBody(BaseModel):
    customerName: str
    uid: str
    amount: int


class PatchOrderBody(BaseModel):
    tienVe: bool | None = None
    donCRM: bool | None = None
    billImage: str | None = None


class CrmBody(BaseModel):
    infoCode: str


class BankSimulateBody(BaseModel):
    infoCode: str
    amount: int | None = None
    noiDung: str | None = None
    maGiaoDichBank: str | None = None


def _require_ops(role: str | None) -> None:
    if (role or "").lower() not in OPS_ROLES:
        raise HTTPException(403, "Chỉ bộ phận hệ thống được xác nhận tiền về thủ công")


def _create_order_mem(body: CreateOrderBody) -> dict[str, Any]:
    global _order_seq
    ma_don = _next_ma_don()
    order_id = str(uuid.uuid4())
    amount = _parse_amount(body.tongTien)
    row = {
        "id": order_id,
        "maDonHang": ma_don,
        "uid": body.uid.strip(),
        "uidPhu": [u.strip() for u in (body.uidPhu or []) if u and u.strip()],
        "tenKhach": (body.tenKhach or "Chưa cập nhật").strip(),
        "diaChi": body.diaChi.strip(),
        "sdt": body.sdt.strip(),
        "goiHoc": body.goiHoc.strip(),
        "tongTien": amount,
        "nguon": body.nguon.strip(),
        "leadKenh": (body.leadKenh or "").strip(),
        "datCoc": bool(body.datCoc),
        "ghiChu": body.ghiChu.strip(),
        "infoCode": _info_code(ma_don),
        "tienVe": False,
        "donCRM": False,
        "billImage": None,
        "trangThai": "cho_thanh_toan",
        "createdBy": body.createdBy,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    _orders_mem[order_id] = row
    return row


def _normalize_sdt(ma_vung: str, sdt: str) -> str:
    """Chuẩn hóa SĐT lưu DB — khớp format import (+84 0xxxxxxxxx)."""
    code = (ma_vung or "+84").strip()
    raw = (sdt or "").strip()
    m = re.match(r"^(\+\d{1,4})\s*(.*)$", raw)
    if m:
        code = m.group(1)
        raw = m.group(2).strip()
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return raw
    if code == "+84":
        if len(digits) == 9:
            digits = f"0{digits}"
        elif len(digits) == 11 and digits.startswith("84"):
            digits = f"0{digits[2:]}"
    return f"{code} {digits}"


def _sdt_lookup_variants(ma_vung: str, sdt: str) -> list[str]:
    norm = _normalize_sdt(ma_vung, sdt)
    variants = {(sdt or "").strip(), norm}
    m = re.match(r"^(\+\d{1,4})\s*(.*)$", norm)
    if m:
        code = m.group(1)
        digits = re.sub(r"\D", "", m.group(2))
        variants.add(f"{code} {digits}")
        if code == "+84" and digits.startswith("0"):
            variants.add(f"{code} {digits[1:]}")
        elif code == "+84":
            variants.add(f"{code} 0{digits}")
    return [v for v in variants if v]


def _find_khach_hang_by_phone(sb, ma_vung: str, sdt: str) -> dict[str, Any] | None:
    for variant in _sdt_lookup_variants(ma_vung, sdt):
        res = (
            sb.table("khach_hang")
            .select("id, crm_uid")
            .eq("so_dien_thoai", variant)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]
    return None


def _khach_hang_fields(body: CreateOrderBody, sdt_norm: str) -> dict[str, Any]:
    return {
        "ho_ten": body.tenKhach.strip() or "Chưa cập nhật",
        "so_dien_thoai": sdt_norm,
        "ma_vung": body.maVung,
        "dia_chi": body.diaChi.strip(),
        "tinh": body.tinh,
        "quan": body.quan,
        "phuong": body.phuong,
        "dia_chi_chi_tiet": body.diaChiChiTiet,
    }


def _update_khach_hang_safe(sb, kh_id: str, patch: dict[str, Any]) -> None:
    phone = patch.get("so_dien_thoai")
    if phone:
        conflict = (
            sb.table("khach_hang")
            .select("id")
            .eq("so_dien_thoai", phone)
            .neq("id", kh_id)
            .limit(1)
            .execute()
        )
        if conflict.data:
            patch = {k: v for k, v in patch.items() if k != "so_dien_thoai"}
    if patch:
        sb.table("khach_hang").update(patch).eq("id", kh_id).execute()


def _resolve_khach_hang_id(sb, body: CreateOrderBody) -> str:
    """Tìm KH theo UID, fallback SĐT — tránh duplicate so_dien_thoai_key."""
    sdt_norm = _normalize_sdt(body.maVung, body.sdt)
    fields = _khach_hang_fields(body, sdt_norm)
    crm_uid = body.uid.strip()

    if crm_uid:
        by_uid = (
            sb.table("khach_hang").select("id").eq("crm_uid", crm_uid).limit(1).execute()
        )
        if by_uid.data:
            kh_id = by_uid.data[0]["id"]
            _update_khach_hang_safe(sb, kh_id, fields)
            return kh_id

    by_phone = _find_khach_hang_by_phone(sb, body.maVung, body.sdt)
    if by_phone:
        kh_id = by_phone["id"]
        patch = {k: v for k, v in fields.items() if k != "so_dien_thoai"}
        if crm_uid and not (by_phone.get("crm_uid") or "").strip():
            patch["crm_uid"] = crm_uid
        _update_khach_hang_safe(sb, kh_id, patch)
        return kh_id

    payload = dict(fields)
    if crm_uid:
        payload["crm_uid"] = crm_uid
    ins = sb.table("khach_hang").insert(payload).execute()
    return ins.data[0]["id"]


def _create_order_supabase(sb, body: CreateOrderBody) -> dict[str, Any]:
    ma_don = _next_ma_don(sb)
    amount = _parse_amount(body.tongTien)
    info = _info_code(ma_don)

    kh_id = _resolve_khach_hang_id(sb, body)

    uid_phu_clean = [u.strip() for u in (body.uidPhu or []) if u and u.strip()]
    don_payload: dict[str, Any] = {
        "khach_hang_id": kh_id,
        "ma_don_hang": ma_don,
        "info_code": info,
        "so_tien_can_thu": amount,
        "goi_hoc": body.goiHoc.strip(),
        "nguon_doanh_thu": body.nguon.strip(),
        "ghi_chu": body.ghiChu.strip(),
        "trang_thai": "cho_thanh_toan",
        "tien_ve": False,
        "don_crm": False,
        "created_by": body.createdBy,
        "dat_coc": bool(body.datCoc),
        "lead_kenh": (body.leadKenh or "").strip() or None,
        "uid_phu": uid_phu_clean,
    }
    try:
        don = sb.table("don_hang").insert(don_payload).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if any(k in msg for k in ("dat_coc", "lead_kenh", "uid_phu", "pgrst204", "column")):
            for k in ("dat_coc", "lead_kenh", "uid_phu"):
                don_payload.pop(k, None)
            note = don_payload.get("ghi_chu") or ""
            tags: list[str] = []
            if body.datCoc:
                tags.append("[CỌC]")
            if body.leadKenh:
                tags.append(f"[Lead: {body.leadKenh.strip()}]")
            if uid_phu_clean:
                tags.append(f"[UID phụ: {','.join(uid_phu_clean)}]")
            if tags:
                don_payload["ghi_chu"] = (" ".join(tags) + (" " + note if note else "")).strip()
            don = sb.table("don_hang").insert(don_payload).execute()
        else:
            raise
    row = don.data[0]
    kh = sb.table("khach_hang").select("*").eq("id", kh_id).single().execute().data
    return _row_to_order(row, kh)


def _list_orders_supabase(
    sb, allowed_creators: list[str] | None = None
) -> list[dict[str, Any]]:
    res = (
        sb.table("don_hang")
        .select("*, khach_hang(*)")
        .order("created_at", desc=True)
        .execute()
    )
    out = []
    for row in res.data or []:
        if allowed_creators is not None:
            creator = (row.get("created_by") or "").strip().lower()
            if creator and creator not in allowed_creators:
                continue
        kh = row.pop("khach_hang", None) if isinstance(row, dict) else None
        out.append(_row_to_order(row, kh))
    return out


def _find_don_by_info(sb, info_code: str) -> dict[str, Any] | None:
    from api_pipe.payos_webhook import find_don_hang

    don = find_don_hang(sb, info_code)
    if not don:
        return None
    res = (
        sb.table("don_hang")
        .select("*, khach_hang(*)")
        .eq("id", don["id"])
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = dict(res.data[0])
    kh = row.pop("khach_hang", None)
    return {"don": row, "kh": kh}


def _record_bank_payment(sb, info_code: str, amount: int, bank_content: str, bank_tx_id: str) -> dict[str, Any]:
    """Đối soát thử (bank-simulate) — cùng logic PayOS."""
    content = bank_content or info_code
    return reconcile_bank_payment(
        sb,
        description=content,
        amount=amount,
        bank_tx_id=bank_tx_id,
    )


@app.get("/healthz")
def health():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    # Project ref từ URL (không phải secret) — để chẩn đoán backend trỏ đúng project nào
    url_ref = url.replace("https://", "").replace("http://", "").split(".")[0] if url else ""
    configured = bool(url and key and "PASTE_" not in key and not key.startswith("YOUR_"))
    # Format key: hỗ trợ cả JWT legacy (eyJ..., 3 phần) lẫn API key mới (sb_secret_/sb_publishable_)
    key_looks_valid = configured and (
        (key.startswith("eyJ") and key.count(".") >= 2 and len(key) > 40)
        or key.startswith("sb_secret_")
        or key.startswith("sb_publishable_")
    )
    # Ping DB thật để xác nhận key xác thực được với Supabase (không đổi HTTP status nếu fail)
    db_reachable = False
    if configured:
        try:
            sb = _supabase()
            if sb:
                sb.table("payment_requests").select("id").limit(1).execute()
                db_reachable = True
        except Exception as exc:
            print(f"[healthz] DB ping failed: {exc}")
    payos_ok = bool(os.getenv("PAYOS_CLIENT_ID", "").strip())
    api_pipe_env = (_REPO_ROOT / "api_pipe" / ".env").is_file()
    return {
        "status": "ok",
        "app_env": app_env(),
        "sandbox": is_sandbox_env(),
        "supabase_configured": configured,
        "supabase_project_ref": url_ref,
        "supabase_key_valid_format": key_looks_valid,
        "supabase_db_reachable": db_reachable,
        "supabase_url_present": bool(url),
        "supabase_key_length": len(key),
        "supabase_key_starts_eyJ": key.startswith("eyJ"),
        "payos_configured": payos_ok,
        "api_pipe_env_present": api_pipe_env,
    }


@app.get("/packages")
async def list_packages():
    question_id = os.getenv("METABASE_PACKAGES_QUESTION_ID")
    base_url = os.getenv("METABASE_BASE_URL", "https://metabase.ibanyu.com").rstrip("/")
    email = os.getenv("METABASE_EMAIL")
    password = os.getenv("METABASE_PASSWORD")

    if question_id and email and password:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                session = await client.post(
                    f"{base_url}/api/session",
                    json={"username": email, "password": password},
                )
                session.raise_for_status()
                token = session.json().get("id")
                res = await client.post(
                    f"{base_url}/api/card/{question_id}/query/json",
                    headers={"X-Metabase-Session": token},
                    json={},
                )
                res.raise_for_status()
                rows = res.json()
                names: list[str] = []
                for row in rows if isinstance(rows, list) else []:
                    if isinstance(row, dict):
                        for key in ("package_name", "goi_hoc", "name", "ten_goi", "Gói học"):
                            if key in row and row[key]:
                                names.append(str(row[key]).strip())
                                break
                        else:
                            vals = [str(v).strip() for v in row.values() if v]
                            if vals:
                                names.append(vals[0])
                names = sorted({n for n in names if n})
                if names:
                    return {"packages": names, "source": "metabase"}
        except Exception as exc:
            print(f"Metabase packages fetch failed: {exc}")

    return {"packages": FALLBACK_PACKAGES, "source": "fallback"}


@app.get("/orders")
def list_orders(authorization: str | None = Header(None)):
    sb = _supabase()
    allowed: list[str] | None = None
    if sb and authorization:
        try:
            actor = resolve_actor(sb, authorization)
            allowed = visible_creator_emails(sb, actor)
        except HTTPException:
            raise
        except Exception as exc:
            print(f"orders RBAC: {exc}")

    if sb:
        try:
            return {"orders": _list_orders_supabase(sb, allowed)}
        except Exception as exc:
            print(f"Supabase list_orders: {exc}")
            raise HTTPException(500, f"Lỗi đọc đơn hàng: {exc}") from exc
    items = sorted(_orders_mem.values(), key=lambda x: x.get("createdAt", ""), reverse=True)
    if allowed is not None:
        allowed_set = set(allowed)
        items = [
            o
            for o in items
            if (o.get("createdBy") or "").lower() in allowed_set
            or not o.get("createdBy")
        ]
    return {"orders": items}


@app.post("/orders", status_code=201)
def create_order(body: CreateOrderBody):
    if not body.uid.strip():
        raise HTTPException(400, "UID CRM là bắt buộc — mọi đơn phải gắn với khách đã có trên CRM.")
    sb = _supabase()
    if sb:
        try:
            return _create_order_supabase(sb, body)
        except Exception as exc:
            err = str(exc)
            low = err.lower()
            if "schema cache" in low or "pgrst204" in low:
                raise HTTPException(
                    500,
                    f"PostgREST schema cache stale. Chạy `NOTIFY pgrst, 'reload schema';` "
                    f"trên Supabase SQL Editor rồi thử lại. (raw: {err})",
                ) from exc
            if "column" in low or "does not exist" in low:
                raise HTTPException(
                    500,
                    f"Schema Supabase chưa đủ cột. Chạy docs/supabase_schema_patch_v5.sql "
                    f"(và v4/v3 nếu chưa). (raw: {err})",
                ) from exc
            raise HTTPException(500, f"Lỗi tạo đơn: {err}") from exc
    return _create_order_mem(body)


@app.patch("/orders/{order_id}")
def patch_order(
    order_id: str,
    body: PatchOrderBody,
    x_operator_role: str | None = Header(None, alias="X-Operator-Role"),
    authorization: str | None = Header(None),
):
    if body.tienVe is not None:
        sb_check = _supabase()
        if sb_check and authorization:
            try:
                actor = resolve_actor(sb_check, authorization)
                require_module_write(sb_check, actor, "dashboard")
                if not can_confirm_payment(actor):
                    raise HTTPException(403, "Chỉ bộ phận hệ thống được xác nhận tiền về thủ công")
            except HTTPException:
                raise
        else:
            _require_ops(x_operator_role)

    sb = _supabase()
    if sb:
        try:
            patch: dict[str, Any] = {}
            if body.tienVe is not None:
                patch["tien_ve"] = body.tienVe
                if body.tienVe:
                    patch["trang_thai"] = "da_thanh_toan"
                    # Kích hoạt luồng hóa đơn thuế (Module 3)
                    patch["trang_thai_thu_tuc"] = "CHO_XAC_NHAN"
            if body.donCRM is not None:
                patch["don_crm"] = body.donCRM
            if body.billImage is not None:
                patch["bill_image"] = body.billImage
            if not patch:
                raise HTTPException(400, "Nothing to update")
            res = sb.table("don_hang").update(patch).eq("id", order_id).execute()
            if not res.data:
                raise HTTPException(404, "Order not found")
            row = res.data[0]
            kh_res = (
                sb.table("khach_hang")
                .select("*")
                .eq("id", row["khach_hang_id"])
                .limit(1)
                .execute()
            )
            kh = kh_res.data[0] if kh_res.data else None
            return _row_to_order(row, kh)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, str(exc)) from exc

    row = _orders_mem.get(order_id)
    if not row:
        raise HTTPException(404, "Order not found")
    if body.tienVe is not None:
        row["tienVe"] = body.tienVe
    if body.donCRM is not None:
        row["donCRM"] = body.donCRM
    if body.billImage is not None:
        row["billImage"] = body.billImage
    return row


@app.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: str,
    authorization: str | None = Header(None),
    x_operator_role: str | None = Header(None, alias="X-Operator-Role"),
):
    """Cancel order (trang_thai='huy'). RBAC: sale/leader own only, manager/system/ops any.
    Blocked if tien_ve=true (force manual refund flow)."""
    sb = _supabase()
    if not sb:
        row = _orders_mem.get(order_id)
        if not row:
            raise HTTPException(404, "Order not found")
        if row.get("tienVe"):
            raise HTTPException(409, "Đơn đã ghi nhận tiền về — không thể huỷ tự động. Liên hệ ops xử lý hoàn tiền.")
        row["trangThai"] = "huy"
        return row

    actor_role = (x_operator_role or "").lower()
    actor_email: str | None = None
    if authorization:
        try:
            actor = resolve_actor(sb, authorization)
            require_module_write(sb, actor, "dashboard")
            actor_role = actor.role.lower()
            actor_email = (actor.email or "").lower()
        except HTTPException:
            raise

    res = sb.table("don_hang").select("*").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    row = res.data[0]
    if row.get("tien_ve"):
        raise HTTPException(
            409,
            "Đơn đã ghi nhận tiền về — không thể huỷ tự động. Liên hệ ops xử lý hoàn tiền.",
        )
    if row.get("trang_thai") == "huy":
        kh_res = (
            sb.table("khach_hang").select("*").eq("id", row["khach_hang_id"]).limit(1).execute()
        )
        return _row_to_order(row, kh_res.data[0] if kh_res.data else None)

    if actor_role not in CANCEL_ANY_ROLES:
        creator = (row.get("created_by") or "").strip().lower()
        if not actor_email or creator != actor_email:
            raise HTTPException(403, "Chỉ huỷ được đơn do mình tạo.")

    upd = (
        sb.table("don_hang")
        .update({"trang_thai": "huy"})
        .eq("id", order_id)
        .execute()
    )
    if not upd.data:
        raise HTTPException(404, "Order not found")
    new_row = upd.data[0]
    kh_res = (
        sb.table("khach_hang")
        .select("*")
        .eq("id", new_row["khach_hang_id"])
        .limit(1)
        .execute()
    )
    kh = kh_res.data[0] if kh_res.data else None
    return _row_to_order(new_row, kh)


@app.post("/info-code", status_code=201)
def create_info_code(body: InfoCodeBody):
    created = create_order(
        CreateOrderBody(
            uid=body.uid,
            tenKhach=body.customerName,
            tongTien=body.amount,
            nguon="Gia hạn",
        )
    )
    return {
        "infoCode": created["infoCode"],
        "customerName": body.customerName,
        "uid": body.uid,
        "amount": body.amount,
        "status": "PENDING",
        "order": created,
    }


@app.get("/info-code/{code}/status")
def info_code_status(code: str):
    sb = _supabase()
    if sb:
        found = _find_don_by_info(sb, code)
        if found:
            paid = bool(found["don"].get("tien_ve"))
            return {"infoCode": code, "status": "MATCHED" if paid else "PENDING"}
    for row in _orders_mem.values():
        if row["infoCode"] == code or row["maDonHang"] in code:
            return {"infoCode": row["infoCode"], "status": "MATCHED" if row["tienVe"] else "PENDING"}
    return {"infoCode": code, "status": "PENDING"}


@app.get("/webhook/events")
def webhook_events(limit: int = 50):
    sb = _supabase()
    if sb:
        try:
            res = (
                sb.table("giao_dich")
                .select("id, so_tien_nhan, info_code_thuc_te, thoi_gian_giao_dich, trang_thai_doi_soat")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            events = [
                {
                    "id": r["id"],
                    "type": "BANK_CREDIT",
                    "amount": r.get("so_tien_nhan"),
                    "infoCode": r.get("info_code_thuc_te"),
                    "ts": r.get("thoi_gian_giao_dich"),
                }
                for r in (res.data or [])
            ]
            return {"events": events}
        except Exception as exc:
            print(f"giao_dich list: {exc}")
    matched = [o for o in _orders_mem.values() if o.get("tienVe")]
    events = [
        {
            "id": o["id"],
            "type": "BANK_CREDIT",
            "amount": o["tongTien"],
            "infoCode": o["infoCode"],
            "ts": o.get("createdAt"),
        }
        for o in matched[-limit:]
    ]
    return {"events": events}


@app.post("/crm/activate")
def crm_activate(body: CrmBody):
    sb = _supabase()
    if sb:
        found = _find_don_by_info(sb, body.infoCode)
        if found:
            sb.table("don_hang").update({"don_crm": True, "trang_thai": "da_tao_crm"}).eq(
                "id", found["don"]["id"]
            ).execute()
            return {"infoCode": body.infoCode, "activated": True}
    for row in _orders_mem.values():
        if row["infoCode"] == body.infoCode:
            row["donCRM"] = True
            return {"infoCode": body.infoCode, "activated": True}
    return {"infoCode": body.infoCode, "activated": False}


def _payos_signature_value(value: Any) -> str:
    if value in (None, "null", "NULL", "undefined"):
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, list):
        sorted_items = [
            dict(sorted(item.items())) if isinstance(item, dict) else item
            for item in value
        ]
        return json.dumps(sorted_items, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, dict):
        return json.dumps(
            dict(sorted(value.items())),
            ensure_ascii=False,
            separators=(",", ":"),
        )
    return str(value)


def _payos_signature_payload(data: dict[str, Any]) -> str:
    return "&".join(
        f"{key}={_payos_signature_value(data.get(key))}"
        for key in sorted(data)
    )


def _normalize_payos_signature(signature: str | None) -> str:
    sig = str(signature or "").strip()
    if not sig:
        return ""
    if "=" in sig:
        parts = [part.strip() for part in sig.replace(",", " ").split() if part.strip()]
        for part in parts:
            if part.startswith("v1="):
                return part.split("=", 1)[1].strip()
    return sig


def _verify_payos_webhook_signature(payload: dict[str, Any], request: Request) -> None:
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "").strip()
    if not checksum_key:
        raise HTTPException(503, "PayOS checksum key not configured")

    data = payload.get("data")
    if not isinstance(data, dict):
        raise HTTPException(400, "Invalid signature")

    received = _normalize_payos_signature(
        payload.get("signature") or request.headers.get("x-payos-signature")
    )
    if not received:
        raise HTTPException(400, "Invalid signature")

    signed_data = _payos_signature_payload(data)
    expected = hmac.new(
        checksum_key.encode("utf-8"),
        signed_data.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected.lower(), received.lower()):
        raise HTTPException(400, "Invalid signature")


@app.post("/payos/create-link")
async def payos_create_link(body: dict):
    """Tạo PayOS payment link từ amount + infoCode.

    Body: { amount: int, infoCode: str, maDonHang: str }
    Returns: { checkoutUrl, qrCode, orderCode }
    """
    import hashlib
    import hmac
    import time
    import re as _re

    client_id = os.getenv("PAYOS_CLIENT_ID", "")
    api_key = os.getenv("PAYOS_API_KEY", "")
    checksum_key = os.getenv("PAYOS_CHECKSUM_KEY", "")

    if not all([client_id, api_key, checksum_key]):
        raise HTTPException(503, "PayOS chưa cấu hình — kiểm tra .env")

    amount = int(body.get("amount") or 0)
    if amount <= 0:
        raise HTTPException(400, "Số tiền không hợp lệ")

    # PayOS description: tối đa 25 ký tự, chỉ a-zA-Z0-9 và dấu cách
    raw_desc = str(body.get("infoCode") or body.get("maDonHang") or "Thanh toan")
    description = _re.sub(r"[^a-zA-Z0-9 ]", "", raw_desc)[:25].strip()

    # Add a random suffix to avoid same-millisecond PayOS orderCode collisions.
    order_code = (int(time.time() * 1000) * 1000 + random.randint(0, 999)) % PAYOS_MAX_SAFE_ORDER_CODE

    frontend_url = (os.getenv("FRONTEND_URL") or "http://localhost:5174").rstrip("/")
    return_url = f"{frontend_url}/"
    cancel_url = f"{frontend_url}/"

    # Signature: HMAC-SHA256, key=value theo thứ tự alpha
    sig_str = (
        f"amount={amount}"
        f"&cancelUrl={cancel_url}"
        f"&description={description}"
        f"&orderCode={order_code}"
        f"&returnUrl={return_url}"
    )
    signature = hmac.new(
        checksum_key.encode("utf-8"),
        sig_str.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    payload = {
        "orderCode": order_code,
        "amount": amount,
        "description": description,
        "returnUrl": return_url,
        "cancelUrl": cancel_url,
        "signature": signature,
    }

    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api-merchant.payos.vn/v2/payment-requests",
                json=payload,
                headers={
                    "x-client-id": client_id,
                    "x-api-key": api_key,
                    "Content-Type": "application/json",
                },
            )
            data = resp.json()
    except Exception as exc:
        raise HTTPException(502, f"Không kết nối được PayOS: {exc}") from exc

    if data.get("code") != "00":
        raise HTTPException(400, f"PayOS lỗi: {data.get('desc') or data}")

    link_data = data.get("data", {})
    qr_code = str(link_data.get("qrCode") or "")
    transfer_content = parse_transfer_content_from_qr(qr_code) or description
    return {
        "checkoutUrl": link_data.get("checkoutUrl", ""),
        "qrCode": qr_code,
        "orderCode": order_code,
        "description": description,
        "transferContent": transfer_content,
        "paymentLinkId": link_data.get("paymentLinkId", ""),
    }


@app.post("/webhook/payos")
async def payos_webhook(request: Request):
    """PayOS webhook: payment_lines first, then deprecated don_hang fallback."""
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid JSON payload") from exc
    if not isinstance(payload, dict):
        raise HTTPException(400, "Invalid JSON payload")

    _verify_payos_webhook_signature(payload, request)

    sb = _supabase()
    if sb:
        line_result = reconcile_payment_line_webhook(sb, payload)
        if line_result.get("matched"):
            return line_result
        return handle_payos_webhook(sb, payload)

    try:
        data = payload.get("data", payload) or {}
        description = str(data.get("description") or data.get("content") or "")
        for row in _orders_mem.values():
            if row["infoCode"] in description or row["maDonHang"] in description:
                row["tienVe"] = True
        return {"error": 0, "message": "Webhook nhận (bộ nhớ — chưa cấu hình Supabase)", "matched": True}
    except Exception as exc:
        return {"error": 1, "message": str(exc)}


@app.get("/payos/transactions")
def list_payos_transactions(
    authorization: str | None = Header(None),
    limit: int = 100,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    status: str | None = None,
    q: str | None = None,
):
    """List giao_dich joined với don_hang. RBAC: sale → own, leader/manager → team, system → all."""
    sb = _supabase()
    if not sb:
        return {"transactions": []}

    allowed: list[str] | None = None
    if authorization:
        try:
            actor = resolve_actor(sb, authorization)
            allowed = visible_creator_emails(sb, actor)
        except HTTPException:
            raise
        except Exception as exc:
            print(f"payos RBAC: {exc}")

    try:
        query = sb.table("giao_dich").select(
            "id, ma_giao_dich_bank, so_tien_nhan, noi_dung_chuyen_khoan, "
            "thoi_gian_giao_dich, info_code_thuc_te, trang_thai_doi_soat, "
            "don_hang_id, don_hang(ma_don_hang, created_by)"
        )
        if status:
            status_values = reconcile_status_filter_values(status)
            if len(status_values) == 1:
                query = query.eq("trang_thai_doi_soat", status_values[0])
            else:
                query = query.in_("trang_thai_doi_soat", status_values)
        if from_date:
            query = query.gte("thoi_gian_giao_dich", from_date)
        if to_date:
            query = query.lte("thoi_gian_giao_dich", to_date)
        if q:
            query = query.ilike("info_code_thuc_te", f"%{q}%")

        res = (
            query.order("thoi_gian_giao_dich", desc=True)
            .limit(min(max(limit, 1), 500))
            .execute()
        )
        out: list[dict[str, Any]] = []
        for row in res.data or []:
            don = row.get("don_hang") or {}
            creator = ((don or {}).get("created_by") or "").strip().lower()
            if allowed is not None and creator and creator not in allowed:
                continue
            out.append(
                {
                    "id": row.get("id"),
                    "maGiaoDichBank": row.get("ma_giao_dich_bank"),
                    "soTien": row.get("so_tien_nhan"),
                    "noiDung": row.get("noi_dung_chuyen_khoan"),
                    "thoiGian": row.get("thoi_gian_giao_dich"),
                    "infoCode": row.get("info_code_thuc_te"),
                    "trangThaiDoiSoat": normalize_reconcile_status(
                        row.get("trang_thai_doi_soat"),
                    ),
                    "maDonHang": (don or {}).get("ma_don_hang"),
                }
            )
        return {"transactions": out}
    except Exception as exc:
        print(f"payos list: {exc}")
        raise HTTPException(500, f"Lỗi đọc giao dịch: {exc}") from exc


@app.post("/orders/{order_id}/bill")
async def upload_order_bill(
    order_id: str,
    file: UploadFile = File(...),
    authorization: str | None = Header(None),
):
    """Upload bill multipart → Supabase Storage bucket 'bills' → set don_hang.bill_image = public URL."""
    sb = _supabase()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình — không upload được Storage")

    # Auth optional but resolved for audit purposes (no RBAC gate for own bill upload yet)
    if authorization:
        try:
            resolve_actor(sb, authorization)
        except HTTPException:
            raise
        except Exception as exc:
            print(f"bill upload auth: {exc}")

    content = await file.read()
    if not content:
        raise HTTPException(400, "File rỗng")
    ext = (file.filename or "bill").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif", "pdf"}:
        ext = "jpg"
    object_path = f"{order_id}/{uuid.uuid4().hex}.{ext}"
    content_type = file.content_type or f"image/{ 'jpeg' if ext=='jpg' else ext }"

    try:
        bucket = sb.storage.from_("bills")
        bucket.upload(
            path=object_path,
            file=content,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        public = bucket.get_public_url(object_path)
        public_url = public if isinstance(public, str) else (public.get("publicURL") or public.get("publicUrl") or "")
    except Exception as exc:
        # Bucket may not exist yet — see docs/supabase_storage_setup.md
        raise HTTPException(500, f"Storage upload thất bại (bucket 'bills' tồn tại?): {exc}") from exc

    try:
        res = (
            sb.table("don_hang")
            .update({"bill_image": public_url})
            .eq("id", order_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Order not found")
        row = res.data[0]
        kh_res = (
            sb.table("khach_hang")
            .select("*")
            .eq("id", row.get("khach_hang_id"))
            .limit(1)
            .execute()
        )
        kh = kh_res.data[0] if kh_res.data else None
        return {"billImage": public_url, "order": _row_to_order(row, kh)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Lỗi cập nhật bill_image: {exc}") from exc


@app.post("/webhook/bank-simulate")
def bank_simulate(body: BankSimulateBody):
    """
    Test luồng tiền về khi chưa có PayOS:
    tạo bản ghi giao_dich + bật tien_ve trên don_hang (theo mô hình Giang).
    """
    sb = _supabase()
    content = body.noiDung or body.infoCode
    tx_id = body.maGiaoDichBank or f"SIM-{uuid.uuid4().hex[:8]}"
    if sb:
        result = _record_bank_payment(sb, body.infoCode, body.amount or 0, content, tx_id)
        if not result.get("matched"):
            raise HTTPException(404, "Không tìm thấy đơn theo Info Code / nội dung CK")
        if not result.get("amount_ok"):
            raise HTTPException(
                422,
                f"Số tiền không khớp: nhận {result.get('received_amount')}, "
                f"cần {result.get('expected_amount')}",
            )
        return {"matched": True, "amountOk": True, "infoCode": body.infoCode, **result}
    for row in _orders_mem.values():
        if row["infoCode"] == body.infoCode or body.infoCode in row["infoCode"]:
            row["tienVe"] = True
            _giao_dich_mem.append(
                {
                    "info_code": body.infoCode,
                    "amount": body.amount or row["tongTien"],
                    "tx_id": tx_id,
                }
            )
            return {"matched": True, "infoCode": body.infoCode}
    raise HTTPException(404, "Order not found")


register_admin_routes(app, _supabase)
register_invoice_routes(app, _supabase)
register_payment_request_routes(app, _supabase)
register_revenue_routes(app, _supabase)
register_activation_routes(app, _supabase)
register_notification_routes(app, _supabase)
register_crm_routes(app, _supabase)
register_dashboard_routes(app, _supabase)
register_report_routes(app, _supabase)
register_sepay_routes(app, _supabase)
register_mpos_routes(app, _supabase)


@app.on_event("startup")
async def _register_payos_webhook_on_startup() -> None:
    """Đăng ký webhook URL với PayOS khi deploy (Render / prod)."""
    from payos_qr import confirm_payos_webhook_url

    if is_sandbox_env():
        print("[sandbox] PayOS confirm-webhook skipped")
        return

    webhook_url = os.getenv("PAYOS_WEBHOOK_URL", "").strip()
    if not webhook_url:
        render_url = os.getenv("RENDER_EXTERNAL_URL", "").strip()
        if render_url:
            webhook_url = f"{render_url.rstrip('/')}/webhook/payos"
    if not webhook_url:
        return
    try:
        result = await confirm_payos_webhook_url(webhook_url)
        print(f"[payos] confirm-webhook {webhook_url} -> {result.get('code')} {result.get('desc')}")
    except Exception as exc:
        print(f"[payos] confirm-webhook skipped: {exc}")
