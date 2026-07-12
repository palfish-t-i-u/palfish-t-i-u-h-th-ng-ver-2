"""Many-to-many payment request API — B1/B2 (Hiếu prototype)."""

from __future__ import annotations

import hashlib
import hmac
import io
import json
import mimetypes
import os
import re
import time
import unicodedata
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Callable


from fastapi import APIRouter, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from rbac import resolve_actor, visible_creator_emails, can_confirm_payment
from admin_routes import require_module_write
from activation_routes import _compute_referral_status

from payos_qr import create_payos_payment_link, fetch_payos_payment, payos_payment_is_paid
from audit import log_audit

router = APIRouter(prefix="/api/v1", tags=["payment-requests"])

# Module-level reference to the supabase factory, set by register_payment_request_routes.
# Exposed here so tests can patch it via patch.object(payment_request_routes, "get_supabase").
get_supabase: Callable[[], Any] = lambda: None

PAYMENT_METHODS = frozenset({"qr", "cash", "card", "installment"})
LINE_STATUSES = frozenset({"pending", "paid", "rejected"})
PR_STATES = frozenset({"pending", "short", "done", "over", "cancelled"})

METHOD_ALIASES = {
    "qr": "qr",
    "vietqr": "qr",
    "cash": "cash",
    "tien_mat": "cash",
    "card": "card",
    "quet_the": "card",
    "installment": "installment",
    "tra_gop": "installment",
}

_BILL_STORAGE_CACHE_TTL_SECONDS = 30.0
_bill_assets_cache: dict[str, Any] = {"expires_at": 0.0, "assets_by_line": {}}


def _payos_signature_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
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


class PaymentRequestCreate(BaseModel):
    uid: str | None = None
    name: str | None = None
    child_name: str | None = None
    phone: str | None = None
    country: str | None = "VN"
    address: str | None = ""
    ward: str | None = ""
    province: str | None = ""
    note: str | None = ""
    email: str | None = ""
    target: int | str | None = None
    tax_id: str | None = None
    customer_type: str | None = "individual"
    company_name: str | None = None
    lead_source: str | None = None
    lead_channel: str | None = None
    wants_invoice: bool | None = None
    children: list[dict] | None = None  # [{name, uid?}] — bé 1 + bé 2+; BE tách bé 1 vào child_name/uid

    uid_khach_hang: str | None = None
    ten_khach: str | None = None
    sdt: str | None = None
    dia_chi: str | None = None
    tong_tien_phai_thu: int | str | None = None


class PaymentRequestPatch(BaseModel):
    uid: str | None = None
    name: str | None = None
    child_name: str | None = None
    phone: str | None = None
    country: str | None = None
    address: str | None = None
    ward: str | None = None
    province: str | None = None
    note: str | None = None
    email: str | None = None
    target: int | str | None = None
    tax_id: str | None = None
    customer_type: str | None = None
    company_name: str | None = None
    lead_source: str | None = None
    lead_channel: str | None = None
    wants_invoice: bool | None = None
    children: list[dict] | None = None  # [{name, uid?}] — như Create; None = không đổi

    uid_khach_hang: str | None = None
    ten_khach: str | None = None
    sdt: str | None = None
    dia_chi: str | None = None
    tong_tien_phai_thu: int | str | None = None


class PaymentLineCreate(BaseModel):
    amount: int | str | None = None
    method: str | None = None
    transfer_code: str | None = None
    code: str | None = None
    name_for_transfer: str | None = None
    installment_platform: str | None = None
    installment_total: int | str | None = None
    sale_received: int | str | None = None
    student_name: str | None = None  # multi-con: lần TT của bé nào (None = bé 1)

    so_tien: int | str | None = None
    hinh_thuc: str | None = None


class TransactionStatusPatch(BaseModel):
    status: str
    reject_reason: str | None = None
    verified_total: int | str | None = None
    verified_received: int | str | None = None


class PaymentLineAmountPatch(BaseModel):
    amount: int | str


class PaymentLineRefreshContentBody(BaseModel):
    """Body optional cho refresh-content. Nếu name_for_transfer = None → dùng stored hoặc default child→parent."""
    name_for_transfer: str | None = None


class PaymentRequestCancelBody(BaseModel):
    reason: str | None = None


class PaymentLineBillDeleteBody(BaseModel):
    bill_url: str | None = None
    delete_all: bool = False
    index: int | None = None


class InvoiceRemindCreate(BaseModel):
    note: str | None = None


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Supabase chua duoc cau hinh")
    return sb


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _parse_amount(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0


def _normalize_method(raw: str | None) -> str:
    key = _clean_text(raw).lower()
    method = METHOD_ALIASES.get(key)
    if not method:
        allowed = ", ".join(sorted(PAYMENT_METHODS))
        raise HTTPException(400, f"method khong hop le. Gia tri hop le: {allowed}")
    return method


def _normalize_line_status(raw: str | None) -> str:
    key = _clean_text(raw).lower()
    if key not in LINE_STATUSES:
        allowed = ", ".join(sorted(LINE_STATUSES))
        raise HTTPException(400, f"status khong hop le. Gia tri hop le: {allowed}")
    return key


def _compute_state(received: int, target: int) -> str:
    if received <= 0:
        return "pending"
    if received < target:
        return "short"
    if received == target:
        return "done"
    return "over"


FEE_METHODS = {"card", "installment"}


def _line_net(line: dict[str, Any]) -> int:
    method = (line.get("method") or "").lower()
    verified = line.get("verified_received")
    if method in FEE_METHODS and verified not in (None, "", 0):
        return int(verified)
    return int(line.get("amount") or 0)


def _sum_paid_amount(lines: list[dict[str, Any]]) -> int:
    return sum(
        _line_net(line)
        for line in lines
        if str(line.get("status", "")).lower() == "paid"
    )


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_payment_request(row: dict[str, Any]) -> dict[str, Any]:
    target = _parse_amount(row.get("target"))
    received = _parse_amount(row.get("received"))
    result = {
        "id": row.get("id") or "",
        "name": row.get("name") or "",
        "uid": row.get("uid") or "",
        "phone": row.get("phone") or "",
        "country": row.get("country") or "VN",
        "address": row.get("address") or "",
        "ward": row.get("ward") or "",
        "province": row.get("province") or "",
        "note": row.get("note") or "",
        "email": row.get("email") or "",
        "tax_id": row.get("tax_id") or None,
        "customer_type": row.get("customer_type") or "individual",
        "company_name": row.get("company_name") or None,
        "lead_source": row.get("lead_source") or None,
        "lead_channel": row.get("lead_channel") or None,
        "target": target,
        "received": received,
        "state": row.get("state") or "pending",
        "delta": received - target,
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
        "sale_email": row.get("sale_email") or "",
        "is_test": bool(row.get("is_test")),
        "wants_invoice": bool(row.get("wants_invoice")),
    }
    if row.get("child_name"):
        result["child_name"] = row["child_name"]
    # Multi-con: children = bé 1 (child_name/uid) + extra_children
    children = [{"name": row.get("child_name") or "", "uid": row.get("uid") or None}]
    for extra in (row.get("extra_children") or []):
        if isinstance(extra, dict) and extra.get("name"):
            children.append({"name": extra["name"], "uid": extra.get("uid")})
    result["children"] = children
    return result


def _is_test_email(email: str) -> bool:
    return email.strip().lower().endswith("@dev")


def _storage_public_url(bucket, object_path: str) -> str:
    public = bucket.get_public_url(object_path)
    if isinstance(public, str):
        return public
    return str(public.get("publicURL") or public.get("publicUrl") or "")


def _bill_object_path(line_id: str, ext: str = "jpg") -> str:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    return f"payment-lines/{line_id}/bill-{ts}.{ext}"


def _sanitize_download_filename(raw: str, fallback: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", _clean_text(raw))
    cleaned = cleaned.strip("._")
    return cleaned or fallback


def _content_type_for_asset(name: str) -> str:
    guessed, _ = mimetypes.guess_type(name or "")
    return guessed or "application/octet-stream"


def _download_bill_bytes(sb, object_path: str) -> bytes:
    try:
        raw = sb.storage.from_("bills").download(object_path)
    except Exception as exc:
        raise HTTPException(502, f"Khong tai duoc file bill tu Storage: {exc}") from exc
    if raw is None:
        raise HTTPException(404, "Bill khong ton tai tren Storage")
    if isinstance(raw, bytes):
        return raw
    if isinstance(raw, bytearray):
        return bytes(raw)
    if isinstance(raw, str):
        return raw.encode("utf-8")
    try:
        return bytes(raw)
    except Exception as exc:
        raise HTTPException(500, f"Du lieu bill khong hop le: {exc}") from exc


def _fetch_bill_urls_from_storage(sb, line_ids: list[str]) -> dict[str, str]:
    """Map payment_line id → public bill URL when file exists in Storage (works without DB column)."""
    wanted = {str(line_id) for line_id in line_ids if line_id}
    if not wanted:
        return {}
    out: dict[str, str] = {}
    bucket = sb.storage.from_("bills")
    try:
        folders = bucket.list("payment-lines") or []
    except Exception as exc:
        print(f"[payment_lines] bill storage list root: {exc}")
        return out
    for folder in folders:
        line_id = str(folder.get("name") or "")
        if line_id not in wanted:
            continue
        try:
            files = bucket.list(f"payment-lines/{line_id}") or []
        except Exception as exc:
            print(f"[payment_lines] bill storage list {line_id}: {exc}")
            continue
        for file_row in files:
            name = str(file_row.get("name") or "")
            if not name.startswith("bill."):
                continue
            out[line_id] = _storage_public_url(bucket, f"payment-lines/{line_id}/{name}")
            break
    return out


def _fetch_bill_assets_from_storage(sb, line_ids: list[str]) -> dict[str, list[dict[str, str]]]:
    """Map payment_line id -> ordered bill assets (oldest -> newest)."""
    wanted = {str(line_id) for line_id in line_ids if line_id}
    if not wanted:
        return {}
    out: dict[str, list[dict[str, str]]] = {}
    bucket = sb.storage.from_("bills")
    try:
        folders = bucket.list("payment-lines") or []
    except Exception as exc:
        print(f"[payment_lines] bill storage list root: {exc}")
        return out
    for folder in folders:
        line_id = str(folder.get("name") or "")
        if line_id not in wanted:
            continue
        try:
            files = bucket.list(f"payment-lines/{line_id}") or []
        except Exception as exc:
            print(f"[payment_lines] bill storage list {line_id}: {exc}")
            continue
        assets: list[dict[str, str]] = []
        for file_row in files:
            name = str(file_row.get("name") or "")
            if not name.startswith("bill"):
                continue
            path = f"payment-lines/{line_id}/{name}"
            assets.append(
                {
                    "name": name,
                    "path": path,
                    "url": _storage_public_url(bucket, path),
                    "created_at": str(file_row.get("created_at") or file_row.get("updated_at") or ""),
                }
            )
        assets.sort(key=lambda x: (x.get("created_at") or "", x.get("name") or ""))
        out[line_id] = assets
    return out


def _invalidate_bill_storage_cache() -> None:
    _bill_assets_cache["expires_at"] = 0.0
    _bill_assets_cache["assets_by_line"] = {}


def _build_bill_assets_from_storage_objects(sb) -> dict[str, list[dict[str, str]]]:
    """
    Build full bill assets index in one DB-flow via storage.objects.
    Falls back to {} when schema access is unavailable.
    """
    out: dict[str, list[dict[str, str]]] = {}
    bucket = sb.storage.from_("bills")
    start = 0
    page_size = 1000

    try:
        while True:
            res = (
                sb.schema("storage")
                .table("objects")
                .select("name, created_at, updated_at")
                .eq("bucket_id", "bills")
                .like("name", "payment-lines/%/bill%")
                .order("name")
                .range(start, start + page_size - 1)
                .execute()
            )
            rows = res.data or []
            if not rows:
                break
            for row in rows:
                raw_path = str(row.get("name") or "").strip().lstrip("/")
                if not raw_path.startswith("payment-lines/"):
                    continue
                parts = raw_path.split("/", 2)
                if len(parts) != 3:
                    continue
                line_id = parts[1].strip()
                filename = parts[2].strip()
                if not line_id or not filename or not filename.startswith("bill"):
                    continue
                path = f"payment-lines/{line_id}/{filename}"
                out.setdefault(line_id, []).append(
                    {
                        "name": filename,
                        "path": path,
                        "url": _storage_public_url(bucket, path),
                        "created_at": str(row.get("created_at") or row.get("updated_at") or ""),
                    }
                )
            if len(rows) < page_size:
                break
            start += page_size
    except Exception as exc:
        print(f"[payment_lines] storage.objects query failed; fallback to direct Storage list: {exc}")
        return {}

    for line_id, assets in out.items():
        assets.sort(key=lambda x: (x.get("created_at") or "", x.get("name") or ""))
    return out


def _build_bill_assets_from_storage_fallback(sb, wanted: set[str]) -> dict[str, list[dict[str, str]]]:
    """Fallback when storage.objects query is unavailable: list per line_id."""
    out: dict[str, list[dict[str, str]]] = {}
    bucket = sb.storage.from_("bills")
    for line_id in wanted:
        try:
            files = bucket.list(f"payment-lines/{line_id}") or []
        except Exception as exc:
            print(f"[payment_lines] bill storage list {line_id}: {exc}")
            continue
        assets: list[dict[str, str]] = []
        for file_row in files:
            name = str(file_row.get("name") or "")
            if not name.startswith("bill"):
                continue
            path = f"payment-lines/{line_id}/{name}"
            assets.append(
                {
                    "name": name,
                    "path": path,
                    "url": _storage_public_url(bucket, path),
                    "created_at": str(file_row.get("created_at") or file_row.get("updated_at") or ""),
                }
            )
        assets.sort(key=lambda x: (x.get("created_at") or "", x.get("name") or ""))
        out[line_id] = assets
    return out


def _fetch_bill_assets_fast(
    sb,
    line_ids: list[str],
    *,
    force_refresh: bool = False,
) -> dict[str, list[dict[str, str]]]:
    """
    Fast path for bill assets:
    1) Try cached storage.objects index (single query flow)
    2) Fallback to per-line Storage API listing
    """
    wanted = {str(line_id) for line_id in line_ids if line_id}
    if not wanted:
        return {}

    now = time.monotonic()
    cached = _bill_assets_cache.get("assets_by_line")
    if not force_refresh and isinstance(cached, dict) and cached:
        # Serve stale cache to avoid periodic latency spikes during polling.
        if now >= float(_bill_assets_cache.get("expires_at") or 0.0):
            _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
        return {line_id: cached.get(line_id, []) for line_id in wanted}

    indexed = _build_bill_assets_from_storage_objects(sb)
    if indexed:
        _bill_assets_cache["assets_by_line"] = indexed
        _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
        return {line_id: indexed.get(line_id, []) for line_id in wanted}

    fallback = _build_bill_assets_from_storage_fallback(sb, wanted)
    if fallback:
        existing = _bill_assets_cache.get("assets_by_line")
        if not isinstance(existing, dict):
            existing = {}
        # Merge: fallback là kết quả từng-line (thường 1 line), KHÔNG được xoá
        # các line khác đang cache — nếu không route drawer/download báo nhầm
        # "không có bill" cho line kế tiếp (bug mất bill 2026-07-10).
        _bill_assets_cache["assets_by_line"] = {**existing, **fallback}
        _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
    return fallback


def _bill_urls_from_assets(bill_assets: dict[str, list[dict[str, str]]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line_id, assets in (bill_assets or {}).items():
        if not assets:
            continue
        out[line_id] = str(assets[-1].get("url") or "").strip()
    return out


def _maybe_enqueue_bill_uploaded_zalo(sb, line: dict) -> None:
    """Line đã paid + vừa có bill mới → enqueue tin ảnh bill Zalo (best-effort, không chặn upload).

    Logic thật nằm trong SQL fn enqueue_bill_uploaded_zalo (migration 2026-07-10):
    tự check status/bill/group và tự chống trùng — Python chỉ gọi RPC.
    """
    try:
        if (str(line.get("status") or "").strip().lower()) == "paid":
            sb.rpc("enqueue_bill_uploaded_zalo", {"p_line_id": line.get("id")}).execute()
    except Exception as exc:
        print(f"[zalo] enqueue bill_uploaded failed for line {line.get('id')}: {exc}")


def _persist_bill_image(sb, line_id: str, public_url: str) -> bool:
    """Try DB column first; ignore if schema patch not applied yet."""
    try:
        # Read current bill_images
        res = sb.table("payment_lines").select("bill_image, bill_images").eq("id", line_id).limit(1).execute()
        if res.data:
            row = res.data[0]
            bill_images = row.get("bill_images") or []
            if not isinstance(bill_images, list):
                bill_images = []
            
            # Migrate old bill_image if needed
            old_bill = (row.get("bill_image") or "").strip()
            if old_bill and old_bill not in bill_images:
                bill_images.append(old_bill)
                
            if public_url and public_url not in bill_images:
                bill_images.append(public_url)
            
            patch = {
                "bill_image": public_url,
                "bill_images": bill_images
            }
        else:
            patch = {"bill_image": public_url}

        updated_res = (
            sb.table("payment_lines")
            .update(patch)
            .eq("id", line_id)
            .execute()
        )
        return bool(updated_res.data)
    except Exception as exc:
        msg = str(exc).lower()
        if "bill_image" in msg and (
            "does not exist" in msg
            or "42703" in msg
            or "pgrst204" in msg
            or "schema cache" in msg
        ):
            print("[payment_lines] bill_image column missing — using Storage-only until SQL patch is applied")
            return False
        raise


def _bill_fields(
    row: dict[str, Any],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    line_id = str(row.get("id") or "")
    bill_images = row.get("bill_images")
    if not isinstance(bill_images, list):
        bill_images = []
        
    if not bill_images:
        bill_images = [
            asset.get("url") or ""
            for asset in ((bill_assets or {}).get(line_id) or [])
            if (asset.get("url") or "").strip()
        ]
        bill_image = (row.get("bill_image") or "").strip()
        if not bill_image and bill_urls:
            bill_image = (bill_urls.get(line_id) or "").strip()
        if bill_image and bill_image not in bill_images:
            bill_images.append(bill_image)
            
    bill_image = bill_images[-1] if bill_images else None
    return {
        "bill_image": bill_image,
        "bill": bool(bill_images),
        "bill_images": bill_images,
    }


def _resolve_confirmed_by_name(email: str | None, display_names: dict[str, str] | None) -> str | None:
    if not email or email.startswith("system:"):
        return None
    if not display_names:
        return None
    return display_names.get(email.strip().lower())


def _serialize_payment_line(
    row: dict[str, Any],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
    display_names: dict[str, str] | None = None,
    pr_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    confirmed_by = row.get("confirmed_by") or None
    return {
        "id": str(row.get("id") or ""),
        "payment_request_id": row.get("payment_request_id") or "",
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "payos_order_code": row.get("payos_order_code") or "",
        "transfer_code": row.get("transfer_code") or "",
        "transfer_content": row.get("transfer_content") or "",
        "name_for_transfer": row.get("name_for_transfer"),
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": row.get("paid_at") or "",
        "reject_reason": row.get("reject_reason") or "",
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
        "installment_platform": row.get("installment_platform") or None,
        "installment_total": row.get("installment_total") or None,
        "sale_received": row.get("sale_received") or None,
        "verified_total": row.get("verified_total") or None,
        "verified_received": row.get("verified_received") or None,
        "student_name": row.get("student_name") or None,
        "confirmed_by": confirmed_by,
        "confirmed_by_name": _resolve_confirmed_by_name(confirmed_by, display_names),
        "confirmed_at": row.get("confirmed_at") or None,
        "confirmed_source": row.get("confirmed_source") or None,
        "is_content_stale": _is_payment_line_content_stale(pr_row, row) if pr_row else False,
        **_bill_fields(row, bill_urls, bill_assets),
    }


def _serialize_payment_for_list(
    row: dict[str, Any],
    idx: int,
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
    display_names: dict[str, str] | None = None,
    pr_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    reject = row.get("reject_reason")
    paid_at = row.get("paid_at")
    confirmed_by = row.get("confirmed_by") or None
    result = {
        "id": str(row.get("id") or ""),
        "idx": idx,
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "transfer_code": row.get("transfer_code") or "",
        "transfer_content": row.get("transfer_content") or "",
        "name_for_transfer": row.get("name_for_transfer"),
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": paid_at if paid_at else None,
        "created_at": row.get("created_at") or "",
        "reject_reason": reject if reject else None,
        "installment_platform": row.get("installment_platform") or None,
        "installment_total": row.get("installment_total") or None,
        "sale_received": row.get("sale_received") or None,
        "verified_total": row.get("verified_total") or None,
        "verified_received": row.get("verified_received") or None,
        "student_name": row.get("student_name") or None,
        "confirmed_by": confirmed_by,
        "confirmed_by_name": _resolve_confirmed_by_name(confirmed_by, display_names),
        "confirmed_at": row.get("confirmed_at") or None,
        "confirmed_source": row.get("confirmed_source") or None,
        "is_content_stale": _is_payment_line_content_stale(pr_row, row) if pr_row else False,
        **_bill_fields(row, bill_urls, bill_assets),
    }
    return result


def _serialize_payment_request_list_item(
    row: dict[str, Any],
    lines: list[dict[str, Any]],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
    display_names: dict[str, str] | None = None,
) -> dict[str, Any]:
    sorted_lines = sorted(lines, key=lambda item: str(item.get("created_at") or ""))
    payments = [
        _serialize_payment_for_list(line, idx, bill_urls, bill_assets, display_names, pr_row=row)
        for idx, line in enumerate(sorted_lines, start=1)
    ]
    done_count = sum(1 for payment in payments if payment["status"] == "paid")
    item = _serialize_payment_request(row)
    item["cancelled_at"] = row.get("cancelled_at") or None
    item["cancelled_reason"] = row.get("cancelled_reason") or None
    item["done_count"] = done_count
    item["total_count"] = len(payments)
    item["payments"] = payments
    return item


def _group_lines_by_request(lines: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in lines:
        pr_id = str(line.get("payment_request_id") or "")
        if not pr_id:
            continue
        grouped.setdefault(pr_id, []).append(line)
    return grouped


def _chunked(items: list, size: int) -> list[list]:
    """Chia list thành lô — in_() với >100 uuid làm query string phình ~19KB, dễ vượt giới hạn proxy."""
    return [items[i : i + size] for i in range(0, len(items), size)]


def _sale_name_map(sb) -> dict[str, str]:
    """Map email (lower) -> ten TVTS (display_name/crm_name) tu nhan_su_sale."""
    try:
        res = sb.table("nhan_su_sale").select("email, display_name, crm_name").execute()
    except Exception as exc:
        print(f"[payment_requests] nhan_su_sale lookup failed: {exc}")
        return {}
    mapping: dict[str, str] = {}
    for row in res.data or []:
        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue
        mapping[email] = row.get("display_name") or row.get("crm_name") or email
    return mapping


def _build_display_names_for_lines(sb, lines: list[dict[str, Any]]) -> dict[str, str]:
    """Batch lookup display_name cho danh sach payment_lines theo confirmed_by."""
    emails: set[str] = set()
    for line in lines:
        confirmed_by = str(line.get("confirmed_by") or "").strip()
        if not confirmed_by or confirmed_by.startswith("system:"):
            continue
        emails.add(confirmed_by.lower())
    if not emails:
        return {}
    try:
        res = (
            sb.table("nhan_su_sale")
            .select("email, display_name, crm_name")
            .in_("email", list(emails))
            .execute()
        )
    except Exception as exc:
        print(f"[payment_requests] display name lookup failed: {exc}")
        return {}
    mapping: dict[str, str] = {}
    for row in res.data or []:
        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue
        display = row.get("display_name") or row.get("crm_name")
        if display:
            mapping[email] = display
    return mapping


def _can_access_request(sb, actor: Any, pr_row: dict[str, Any]) -> bool:
    allowed_emails = visible_creator_emails(sb, actor)
    if allowed_emails is None:
        return True
    row_email = _clean_text(pr_row.get("sale_email")).lower()
    allowed = {str(email).strip().lower() for email in allowed_emails if str(email).strip()}
    return bool(row_email) and row_email in allowed


def _parse_children(raw: list | None) -> tuple[str | None, list[dict] | None]:
    """Tách children FE gửi → (child_name bé 1, extra_children bé 2+).

    Trả (None, None) nếu FE không gửi children (giữ flow cũ)."""
    if raw is None:
        return None, None
    cleaned: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            raise HTTPException(400, "children phai la danh sach {name, uid}")
        name = _clean_text(item.get("name"))
        if not name:
            raise HTTPException(400, "Ten con khong duoc de trong")
        uid = _clean_text(item.get("uid")) or None
        cleaned.append({"name": name, "uid": uid})
    if not cleaned:
        return None, None
    names = [c["name"] for c in cleaned]
    if len(names) != len(set(names)):
        raise HTTPException(400, "Ten cac con khong duoc trung nhau")
    return cleaned[0]["name"], (cleaned[1:] or None)


def _child_rename_map(old_extra: list | None, new_extra: list | None) -> dict[str, str]:
    """Map tên cũ → tên mới cho bé phụ, khớp theo uid (ưu tiên) rồi theo vị trí."""
    renames: dict[str, str] = {}
    old_list = [e for e in (old_extra or []) if isinstance(e, dict)]
    new_list = [e for e in (new_extra or []) if isinstance(e, dict)]
    for i, new in enumerate(new_list):
        old = None
        if new.get("uid"):
            old = next((o for o in old_list if o.get("uid") == new["uid"]), None)
        if old is None and i < len(old_list):
            old = old_list[i]
        if old and old.get("name") and new.get("name") and old["name"] != new["name"]:
            renames[old["name"]] = new["name"]
    return renames


def _payment_request_insert_row(body: PaymentRequestCreate) -> dict[str, Any]:
    uid = _clean_text(body.uid or body.uid_khach_hang)
    name = _clean_text(body.name or body.ten_khach)
    phone = _clean_text(body.phone or body.sdt)
    target = _parse_amount(body.target or body.tong_tien_phai_thu)
    address = _clean_text(body.address or body.dia_chi)

    missing: list[str] = []
    if not uid:
        missing.append("uid")
    if not name:
        missing.append("name")
    if not phone:
        missing.append("phone")
    if target <= 0:
        missing.append("target")
    if missing:
        raise HTTPException(400, f"Thieu du lieu bat buoc: {', '.join(missing)}")

    row = {
        "name": name,
        "uid": uid,
        "phone": phone,
        "country": _clean_text(body.country) or "VN",
        "address": address,
        "ward": _clean_text(body.ward),
        "province": _clean_text(body.province),
        "note": _clean_text(body.note),
        "email": _clean_text(body.email),
        "tax_id": _clean_text(body.tax_id) or None,
        "target": target,
        "received": 0,
        "state": "pending",
    }
    child_name = _clean_text(body.child_name)
    if child_name:
        row["child_name"] = child_name
    # Multi-con: children ưu tiên hơn child_name đơn khi FE gửi
    first_name, extra = _parse_children(body.children)
    if first_name:
        row["child_name"] = first_name
    if extra:
        row["extra_children"] = extra

    ct = _clean_text(body.customer_type) or "individual"
    if ct not in ("individual", "business"):
        raise HTTPException(400, "customer_type phai la 'individual' hoac 'business'")
    row["customer_type"] = ct
    if ct == "business":
        company = _clean_text(body.company_name)
        if company:
            row["company_name"] = company

    if body.lead_source:
        row["lead_source"] = body.lead_source
    if body.lead_channel:
        row["lead_channel"] = body.lead_channel
    if body.wants_invoice is not None:
        row["wants_invoice"] = body.wants_invoice
    return row


def _payment_request_patch_row(body: PaymentRequestPatch, current_row: dict[str, Any]) -> dict[str, Any]:
    patch: dict[str, Any] = {}

    uid_val = body.uid if body.uid is not None else body.uid_khach_hang
    if uid_val is not None:
        uid = _clean_text(uid_val)
        if not uid:
            raise HTTPException(400, "uid khong duoc de trong")
        patch["uid"] = uid

    name_val = body.name if body.name is not None else body.ten_khach
    if name_val is not None:
        name = _clean_text(name_val)
        if not name:
            raise HTTPException(400, "name khong duoc de trong")
        patch["name"] = name

    phone_val = body.phone if body.phone is not None else body.sdt
    if phone_val is not None:
        phone = _clean_text(phone_val)
        if not phone:
            raise HTTPException(400, "phone khong duoc de trong")
        patch["phone"] = phone

    if body.country is not None:
        patch["country"] = _clean_text(body.country) or "VN"

    address_val = body.address if body.address is not None else body.dia_chi
    if address_val is not None:
        patch["address"] = _clean_text(address_val)

    if body.ward is not None:
        patch["ward"] = _clean_text(body.ward)
    if body.province is not None:
        patch["province"] = _clean_text(body.province)
    if body.note is not None:
        patch["note"] = _clean_text(body.note)
    if body.email is not None:
        patch["email"] = _clean_text(body.email)
    if body.child_name is not None:
        patch["child_name"] = _clean_text(body.child_name) or None
    if body.children is not None:
        # Multi-con: children ghi đè cả child_name (bé 1) lẫn extra_children (bé 2+)
        first_name, extra = _parse_children(body.children)
        if first_name:
            patch["child_name"] = first_name
        patch["extra_children"] = extra  # None = xóa hết bé phụ
    if body.tax_id is not None:
        patch["tax_id"] = _clean_text(body.tax_id) or None

    target_val = body.target if body.target is not None else body.tong_tien_phai_thu
    if target_val is not None:
        target = _parse_amount(target_val)
        if target <= 0:
            raise HTTPException(400, "target khong hop le")
        patch["target"] = target

    if body.tax_id is not None:
        patch["tax_id"] = _clean_text(body.tax_id) or None
    if body.customer_type is not None:
        ct = _clean_text(body.customer_type) or "individual"
        if ct not in ("individual", "business"):
            raise HTTPException(400, "customer_type phai la 'individual' hoac 'business'")
        patch["customer_type"] = ct
    if body.company_name is not None:
        patch["company_name"] = _clean_text(body.company_name) or None

    final_ct = patch.get("customer_type", current_row.get("customer_type") or "individual")
    if final_ct == "individual":
        patch["company_name"] = None

    if body.lead_source is not None:
        patch["lead_source"] = body.lead_source or None
    if body.lead_channel is not None:
        patch["lead_channel"] = body.lead_channel or None
    if body.wants_invoice is not None:
        patch["wants_invoice"] = body.wants_invoice

    if not patch:
        return {}

    next_uid = patch.get("uid", _clean_text(current_row.get("uid")))
    next_name = patch.get("name", _clean_text(current_row.get("name")))
    next_phone = patch.get("phone", _clean_text(current_row.get("phone")))
    if not next_uid or not next_name or not next_phone:
        raise HTTPException(400, "uid, name, phone la bat buoc")

    patch["updated_at"] = _iso_now()
    return patch


def _allocate_pr_id(sb, year: int | None = None) -> str:
    from rpc_helpers import rpc_next_payment_request_id

    pr_id = rpc_next_payment_request_id(sb, year).strip()
    if not pr_id:
        raise HTTPException(500, "RPC next_payment_request_id không trả mã PR")
    return pr_id


_BASE36_DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_PAYOS_DESCRIPTION_MAX_LEN = 40  # tested 19/6: img.vietqr.io cắt cứng ở 40 chars
# (PayOS API trước limit 25, nhưng đã bỏ PayOS path theo Sprint 3 decision)


def _int_to_base36(n: int) -> str:
    if n <= 0:
        return "0"
    out: list[str] = []
    num = n
    while num:
        num, remainder = divmod(num, 36)
        out.append(_BASE36_DIGITS[remainder])
    return "".join(reversed(out))


def _int_to_base36_padded(n: int, width: int = 5) -> str:
    encoded = _int_to_base36(n).upper()
    if len(encoded) > width:
        encoded = encoded[-width:]
    return encoded.rjust(width, "0")


def _transfer_code_hint(payment_request_id: str, line_count: int) -> str:
    match = re.fullmatch(r"PR-(\d{4})-(\d{4})", payment_request_id.strip(), re.I)
    if match:
        year = int(match.group(1))
        pr_seq = int(match.group(2))
        yy = year % 100
        line_seq = line_count + 1
        raw = f"{yy:02d}{pr_seq:04d}{line_seq:02d}"
        numeric = int(raw)
    else:
        seed = f"{payment_request_id}:{line_count}"
        numeric = int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16)
    return _int_to_base36_padded(numeric, 5)


def _ascii_transfer_name(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    text = text.replace("Đ", "D").replace("đ", "d")
    normalized = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(char for char in normalized if not unicodedata.combining(char))
    cleaned = re.sub(r"[^A-Za-z0-9 ]", "", ascii_only)
    return " ".join(cleaned.split())


_COUNTRY_DIAL: dict[str, str] = {
    "VN": "84", "US": "1", "GB": "44", "CN": "86", "JP": "81",
    "KR": "82", "TH": "66", "SG": "65", "MY": "60", "ID": "62", "PH": "63",
    "DE": "49", "FR": "33", "AU": "61", "CA": "1", "RU": "7", "IN": "91",
    "TW": "886", "HK": "852", "NZ": "64", "NL": "31", "IT": "39", "ES": "34",
}



def _build_payos_transfer_description(
    pr_row: dict[str, Any],
    name_for_transfer: str | None,
    transfer_code: str,
) -> str:
    code = _clean_text(transfer_code).upper()
    if not code:
        return ""

    raw_phone = re.sub(r"\D", "", str(pr_row.get("phone") or pr_row.get("sdt") or ""))
    country = str(pr_row.get("country") or "VN").upper()
    dial = _COUNTRY_DIAL.get(country, "84")
    phone = f"{dial}{raw_phone}" if raw_phone and not raw_phone.startswith(dial) else raw_phone
    name = _ascii_transfer_name(name_for_transfer)
    if not name:
        name = _ascii_transfer_name(pr_row.get("name") or pr_row.get("ten_khach"))

    parts: list[str] = []
    if phone:
        parts.append(phone)
    if name:
        parts.append(name)
    if len(parts) == 0:
        return code[:_PAYOS_DESCRIPTION_MAX_LEN]

    parts.append(code)
    description = " ".join(parts)
    if len(description) <= _PAYOS_DESCRIPTION_MAX_LEN and code in description:
        return description

    # Vietnamese name convention (anh feedback 19/6):
    # 3 tier ưu tiên — full → 2 từ cuối → 1 từ cuối (tên riêng).
    # KHÔNG cắt giữa từ. KHÔNG có tier "bỏ họ giữ 2 từ đệm + tên riêng"
    # (vd "Thi Bich Van") vì nghe ngang.
    name_words = name.split() if name else []
    name_candidates: list[str] = []
    if name_words:
        full = " ".join(name_words)
        last2 = " ".join(name_words[-2:]) if len(name_words) >= 2 else ""
        last1 = name_words[-1]
        for candidate in (full, last2, last1):
            if candidate and candidate not in name_candidates:
                name_candidates.append(candidate)

    # Ưu tiên 1: phone + tên (full → last2 → last1) + code.
    if phone and name_candidates:
        for candidate in name_candidates:
            trial = f"{phone} {candidate} {code}"
            if len(trial) <= _PAYOS_DESCRIPTION_MAX_LEN and code in trial:
                return trial

    # Ưu tiên 2: chỉ tên + code (bỏ phone nếu phone không vừa).
    if name_candidates:
        for candidate in name_candidates:
            trial = f"{candidate} {code}"
            if len(trial) <= _PAYOS_DESCRIPTION_MAX_LEN and code in trial:
                return trial

    # Cuối: phone + code, không tên.
    if phone:
        max_phone_len = _PAYOS_DESCRIPTION_MAX_LEN - len(code) - 1
        if max_phone_len > 0:
            trial = f"{phone[:max_phone_len]} {code}"
            trial = " ".join(trial.split())
            if len(trial) <= _PAYOS_DESCRIPTION_MAX_LEN and code in trial:
                return trial

    return code[:_PAYOS_DESCRIPTION_MAX_LEN]


def _is_payment_line_content_stale(
    pr_row: dict[str, Any],
    line: dict[str, Any],
) -> bool:
    """True nếu transfer_content lưu trên line không còn khớp với PR hiện tại.

    Quy tắc:
    - line không PENDING (paid/rejected/cancelled) → False (không cần warning).
    - line không phải method=qr → False (cash/card không có QR).
    - Rebuild expected content từ pr_row dùng cả hai tên có thể (child_name và name).
      Nếu stored content khớp ít nhất một variant hiện tại → not stale.
    - Nếu line.name_for_transfer NULL (line cũ trước migration), fallback theo
      thứ tự: pr_row.child_name → pr_row.name.
    - So sánh expected variants vs line.transfer_content. Nếu không khớp variant nào → stale.
    """
    status = _clean_text(line.get("status")).lower()
    if status != "pending":
        return False
    if _clean_text(line.get("method")).lower() != "qr":
        return False
    reject_reason = line.get("reject_reason")
    if reject_reason and "huy" in _ascii_transfer_name(reject_reason).lower():
        return False

    transfer_code = _clean_text(line.get("transfer_code"))
    if not transfer_code:
        return False

    stored = _clean_text(line.get("transfer_content"))

    # Build the set of currently-valid content variants:
    # one for child_name, one for parent_name. If line.name_for_transfer is NULL
    # (pre-migration row), only use child_name → name fallback variant.
    name_for_transfer = line.get("name_for_transfer")
    if not name_for_transfer:
        # Pre-migration: we don't know which name was used, default child→name.
        fallback = pr_row.get("child_name") or pr_row.get("name") or pr_row.get("ten_khach")
        expected = _build_payos_transfer_description(pr_row, fallback, transfer_code)
        return expected.strip() != stored.strip()

    # Build all current name variants from PR and check if stored still matches any.
    current_names: list = []
    child_name = pr_row.get("child_name")
    parent_name = pr_row.get("name") or pr_row.get("ten_khach")
    if child_name:
        current_names.append(child_name)
    if parent_name and parent_name != child_name:
        current_names.append(parent_name)
    # Multi-con: tên bé phụ cũng là biến thể hợp lệ của nội dung CK
    for extra in (pr_row.get("extra_children") or []):
        if isinstance(extra, dict) and _clean_text(extra.get("name")):
            current_names.append(extra["name"])
    if not current_names:
        current_names.append(None)

    for name_candidate in current_names:
        expected = _build_payos_transfer_description(pr_row, name_candidate, transfer_code)
        if expected.strip() == stored.strip():
            return False

    return True


def recompute_payment_request_totals(sb, payment_request_id: str) -> dict[str, Any]:
    request_res = (
        sb.table("payment_requests")
        .select("*")
        .eq("id", payment_request_id)
        .limit(1)
        .execute()
    )
    if not request_res.data:
        raise HTTPException(404, "Khong tim thay payment_request")

    pr_row = request_res.data[0]
    if _clean_text(pr_row.get("state")).lower() == "cancelled":
        return {
            "payment_request_id": payment_request_id,
            "received": _parse_amount(pr_row.get("received")),
            "target": _parse_amount(pr_row.get("target")),
            "state": "cancelled",
            "payment_request": _serialize_payment_request(pr_row),
        }

    line_res = (
        sb.table("payment_lines")
        .select("amount, status, method, verified_received")
        .eq("payment_request_id", payment_request_id)
        .execute()
    )
    target = _parse_amount(pr_row.get("target"))
    received = _sum_paid_amount(line_res.data or [])
    state = _compute_state(received, target)

    update_res = (
        sb.table("payment_requests")
        .update({"received": received, "state": state})
        .eq("id", payment_request_id)
        .execute()
    )
    updated = update_res.data[0] if update_res.data else {**pr_row, "received": received, "state": state}
    if state in ("done", "over"):
        try:
            from revenue_routes import sync_ledger_for_pr

            sync_ledger_for_pr(sb, payment_request_id)
        except Exception as exc:
            print(f"[payment_requests] ledger sync after PR paid skipped: {exc}")
    return {
        "payment_request_id": payment_request_id,
        "received": received,
        "target": target,
        "state": state,
        "payment_request": _serialize_payment_request(updated),
    }


def _extract_payos_data(payload: dict[str, Any]) -> tuple[str, int, str]:
    data = payload.get("data", payload) or {}
    order_code = _clean_text(data.get("orderCode") or data.get("order_code") or data.get("reference"))
    amount = _parse_amount(data.get("amount") or data.get("transferAmount") or data.get("transfer_amount") or 0)
    description = _clean_text(data.get("description") or data.get("content") or data.get("transferContent"))
    return order_code, amount, description


def _mark_line_paid(sb, line_id: str, *, actor_email: str = "system", source: str = "unknown", extra: dict[str, Any] | None = None) -> dict[str, Any]:
    from audit import log_audit

    existing_res = (
        sb.table("payment_lines")
        .select("*")
        .eq("id", line_id)
        .limit(1)
        .execute()
    )
    if not existing_res.data:
        raise HTTPException(404, "Khong tim thay payment_line")
    existing = existing_res.data[0]
    if _clean_text(existing.get("status")).lower() == "paid":
        totals = recompute_payment_request_totals(sb, str(existing["payment_request_id"]))
        return {
            "payment_line": _serialize_payment_line(
                existing,
                display_names=_build_display_names_for_lines(sb, [existing]),
            ),
            **totals,
        }

    now_iso = _iso_now()
    patch = {
        "status": "paid", "paid_at": now_iso, "reject_reason": None,
        "confirmed_by": actor_email, "confirmed_at": now_iso, "confirmed_source": source,
    }
    if extra:
        patch.update(extra)

    line_res = (
        sb.table("payment_lines")
        .update(patch)
        .eq("id", line_id)
        .execute()
    )
    if not line_res.data:
        raise HTTPException(404, "Khong tim thay payment_line")
    line = line_res.data[0]
    pr_id = str(line["payment_request_id"])
    log_audit(sb, actor_email, "recon.line_marked_paid", "payment_line", line_id, {
        "pr_id": pr_id, "source": source,
    })
    totals = recompute_payment_request_totals(sb, pr_id)
    return {
        "payment_line": _serialize_payment_line(
            line,
            display_names=_build_display_names_for_lines(sb, [line]),
        ),
        **totals,
    }


def _find_payment_line_by_payos_code(sb, order_code: str) -> dict[str, Any] | None:
    """Lookup payment_line — PayOS gửi orderCode number, DB lưu text."""
    keys: list[str] = []
    cleaned = _clean_text(order_code)
    if cleaned:
        keys.append(cleaned)
    if cleaned.isdigit():
        keys.append(str(int(cleaned)))
    seen: set[str] = set()
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            line_res = (
                sb.table("payment_lines")
                .select("*")
                .eq("payos_order_code", key)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            print(f"[payment_requests] webhook lookup skipped: {exc}")
            return None
        if line_res.data:
            return line_res.data[0]
    return None


def _find_payment_line_by_payment_link_id(sb, payment_link_id: str) -> dict[str, Any] | None:
    link_id = _clean_text(payment_link_id)
    if not link_id:
        return None
    try:
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("checkout_url", f"https://pay.payos.vn/web/{link_id}")
            .limit(1)
            .execute()
        )
        if line_res.data:
            return line_res.data[0]
    except Exception as exc:
        print(f"[payment_requests] payment_link_id lookup skipped: {exc}")
    return None


async def sync_payment_line_from_payos(sb, line: dict[str, Any]) -> dict[str, Any] | None:
    """Poll PayOS — nếu PAID thì cập nhật payment_line (fallback khi webhook không tới)."""
    if _clean_text(line.get("status")).lower() == "paid":
        return None
    order_code = _clean_text(line.get("payos_order_code"))
    if not order_code:
        return None
    try:
        payos_data = await fetch_payos_payment(order_code)
    except Exception as exc:
        print(f"[payment_requests] payos fetch skipped: {exc}")
        return {"line_id": line.get("id"), "error": str(exc)}
    if not payos_data or not payos_payment_is_paid(payos_data):
        return None
    line_id = str(line.get("id") or "")
    if not line_id:
        return None
    try:
        result = _mark_line_paid(sb, line_id, actor_email="system:payos", source="payos")
    except Exception as exc:
        return {"line_id": line_id, "error": str(exc)}
    return {
        "line_id": line_id,
        "payos_order_code": order_code,
        "payos_status": payos_data.get("status"),
        **result,
    }


async def sync_all_pending_payos_lines(sb) -> dict[str, Any]:
    try:
        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("method", "qr")
            .eq("status", "pending")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(500, f"Khong doc payment_lines: {exc}") from exc

    synced: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    for line in line_res.data or []:
        if not _clean_text(line.get("payos_order_code")):
            continue
        outcome = await sync_payment_line_from_payos(sb, line)
        if not outcome:
            continue
        if outcome.get("error"):
            errors.append(outcome)
        else:
            synced.append(
                {
                    "line_id": outcome.get("line_id"),
                    "payment_request_id": outcome.get("payment_request_id"),
                    "payos_order_code": outcome.get("payos_order_code"),
                }
            )
    return {"synced": synced, "synced_count": len(synced), "errors": errors}


def _transfer_code_in_description(code: str, description: str) -> bool:
    cleaned = _clean_text(code).upper()
    if not cleaned:
        return False
    return bool(re.search(rf"\b{re.escape(cleaned)}\b", description.upper()))


def reconcile_payment_line_webhook(sb, payload: dict[str, Any]) -> dict[str, Any]:
    """Match PayOS webhook to payment_lines; fallback to don_hang when unmatched."""
    order_code, amount, description = _extract_payos_data(payload)
    data = payload.get("data", payload) or {}
    payment_link_id = _clean_text(data.get("paymentLinkId") or data.get("payment_link_id"))

    if not sb:
        return {"matched": False}

    line = None
    if order_code:
        line = _find_payment_line_by_payos_code(sb, order_code)
    if not line and payment_link_id:
        line = _find_payment_line_by_payment_link_id(sb, payment_link_id)
    if not line and description:
        # Fallback: khớp transfer_code trong nội dung CK (PayOS description)
        try:
            candidates = (
                sb.table("payment_lines")
                .select("*")
                .eq("method", "qr")
                .eq("status", "pending")
                .execute()
            )
            for candidate in candidates.data or []:
                code = _clean_text(candidate.get("transfer_code"))
                if code and _transfer_code_in_description(code, description):
                    line = candidate
                    break
        except Exception as exc:
            print(f"[payment_requests] description lookup skipped: {exc}")

    if not line:
        return {"matched": False}

    line_id = str(line.get("id") or "")
    if not line_id:
        return {"matched": False}

    try:
        result = _mark_line_paid(sb, line_id, actor_email="system:payos", source="payos")
    except Exception as exc:
        print(f"[payment_requests] webhook reconcile error: {exc}")
        return {"matched": True, "error": 1, "message": str(exc)}

    return {
        "matched": True,
        "error": 0,
        "message": "Xu ly payment_line thanh cong",
        "payos_order_code": order_code,
        "amount": amount,
        "description": description,
        **result,
    }


def _parse_iso_datetime(val: str) -> datetime:
    if val.endswith("Z"):
        val = val[:-1] + "+00:00"
    return datetime.fromisoformat(val)


def _has_invoice_since(sb, pr_id: str, since: datetime) -> bool:
    """Check if any course was invoiced after `since` for this PR's active requests."""
    try:
        ar_res = sb.table("active_requests").select("uids_data").eq("pr_id", pr_id).execute()
        for ar in (ar_res.data or []):
            for uid in (ar.get("uids_data") or []):
                for c in (uid.get("courses") or []):
                    if c.get("invoiced") and c.get("invoicedAt"):
                        inv_time = _parse_iso_datetime(str(c["invoicedAt"]))
                        if inv_time > since:
                            return True
    except Exception:
        pass
    return False


def _is_accountant_or_manager(sb, actor) -> bool:
    if _clean_text(actor.role).lower() in ("manager", "system"):
        return True
    if can_confirm_payment(actor):
        return True
    try:
        from admin_routes import _compute_permissions
        perms = _compute_permissions(sb, actor)
        if perms.get("module4", "none") != "none":
            return True
    except Exception as exc:
        print(f"[invoice_reminders] check permissions failed: {exc}")
    return False


def _get_user_id_to_name_map(sb) -> dict[str, str]:
    """Map auth_user_id -> display_name or crm_name or email."""
    try:
        users_res = sb.auth.admin.list_users()
        users = users_res if isinstance(users_res, list) else getattr(users_res, "users", []) or []
    except Exception as exc:
        print(f"[invoice_reminders] list_users failed: {exc}")
        users = []

    email_to_id: dict[str, str] = {}
    for u in users:
        u_id = getattr(u, "id", None) or (isinstance(u, dict) and u.get("id"))
        u_email = getattr(u, "email", None) or (isinstance(u, dict) and u.get("email"))
        if u_id and u_email:
            email_to_id[str(u_email).strip().lower()] = str(u_id)

    try:
        staff_res = sb.table("nhan_su_sale").select("email, display_name, crm_name").execute()
        staff_list = staff_res.data or []
    except Exception as exc:
        print(f"[invoice_reminders] nhan_su_sale query failed: {exc}")
        staff_list = []

    email_to_name: dict[str, str] = {}
    for s in staff_list:
        email = str(s.get("email") or "").strip().lower()
        if not email:
            continue
        name = s.get("display_name") or s.get("crm_name") or email
        email_to_name[email] = name

    id_to_name: dict[str, str] = {}
    for email, uid in email_to_id.items():
        id_to_name[uid] = email_to_name.get(email, email)

    for u in users:
        u_id = str(getattr(u, "id", None) or (isinstance(u, dict) and u.get("id")) or "")
        if not u_id:
            continue
        if u_id not in id_to_name:
            u_email = getattr(u, "email", None) or (isinstance(u, dict) and u.get("email"))
            id_to_name[u_id] = str(u_email) if u_email else u_id

    return id_to_name


def _get_user_name_by_id(sb, user_id: str) -> str:
    try:
        user_res = sb.auth.admin.get_user_by_id(user_id)
        user = user_res.user if hasattr(user_res, "user") else user_res
        if user:
            email = getattr(user, "email", None) or (isinstance(user, dict) and user.get("email"))
            if email:
                staff_res = (
                    sb.table("nhan_su_sale")
                    .select("display_name, crm_name")
                    .eq("email", email)
                    .limit(1)
                    .execute()
                )
                if staff_res.data:
                    return staff_res.data[0].get("display_name") or staff_res.data[0].get("crm_name") or email
                return email
    except Exception as exc:
        print(f"[invoice_reminders] get_user_name_by_id failed: {exc}")
    return user_id


def register_payment_request_routes(app, _get_supabase) -> None:
    # Expose the factory at module level so tests can patch it via
    # patch.object(payment_request_routes, "get_supabase", ...).
    import payment_request_routes as _self
    _self.get_supabase = _get_supabase
    # Use the local name throughout this closure for backward compatibility.
    get_supabase = _get_supabase

    @router.get("/payment-requests")
    def list_payment_requests(
        state: str | None = Query(None),
        uid: str | None = Query(None),
        limit: int = Query(100, ge=1, le=500),
        offset: int = Query(0, ge=0),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        query = sb.table("payment_requests").select("*", count="exact")
        allowed_emails = visible_creator_emails(sb, actor)
        if allowed_emails is not None:
            query = query.in_("sale_email", allowed_emails)
        state_filter = _clean_text(state).lower()
        if state_filter:
            if state_filter not in PR_STATES:
                allowed = ", ".join(sorted(PR_STATES))
                raise HTTPException(400, f"state khong hop le. Gia tri hop le: {allowed}")
            query = query.eq("state", state_filter)
        uid_filter = _clean_text(uid)
        if uid_filter:
            query = query.eq("uid", uid_filter)

        try:
            pr_res = (
                query.order("created_at", desc=True)
                .range(offset, offset + limit - 1)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong doc duoc payment_requests: {exc}") from exc

        pr_rows = pr_res.data or []
        total = pr_res.count if pr_res.count is not None else len(pr_rows)
        if not pr_rows:
            return {"requests": [], "total": total}

        pr_ids = [str(row.get("id") or "") for row in pr_rows if row.get("id")]
        lines_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                all_line_rows: list[dict[str, Any]] = []
                for chunk in _chunked(pr_ids, 100):
                    line_res = (
                        sb.table("payment_lines")
                        .select("*")
                        .in_("payment_request_id", chunk)
                        .execute()
                    )
                    all_line_rows.extend(line_res.data or [])
                grouped = _group_lines_by_request(all_line_rows)
                lines_by_pr.update(grouped)
            except Exception as exc:
                raise HTTPException(500, f"Khong doc duoc payment_lines: {exc}") from exc

        ars_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                for chunk in _chunked(pr_ids, 100):
                    ar_res = (
                        sb.table("active_requests")
                        .select("pr_id, uids_data")
                        .in_("pr_id", chunk)
                        .execute()
                    )
                    for ar in (ar_res.data or []):
                        pid = str(ar.get("pr_id") or "")
                        if pid in ars_by_pr:
                            ars_by_pr[pid].append(ar)
            except Exception as exc:
                print(f"Khong doc duoc active_requests for PR referral_status: {exc}")

        # Map ten TVTS dung cho ca sale_name (PR) lan confirmed_by_name (payment lines).
        name_map = _sale_name_map(sb)

        requests = []
        for row in pr_rows:
            pr_id = str(row.get("id") or "")
            item = _serialize_payment_request_list_item(
                row, lines_by_pr.get(pr_id, []), {}, {}, name_map
            )

            ars = ars_by_pr.get(pr_id, [])
            all_courses = []
            for ar in ars:
                for u in (ar.get("uids_data") or []):
                    if isinstance(u, dict):
                        for c in (u.get("courses") or []):
                            if isinstance(c, dict):
                                all_courses.append(c)

            item["referral_status"] = _compute_referral_status(all_courses)
            requests.append(item)

        # Enrich ten TVTS de FE hien cot TVTS cho leader+ ngay tren bang chinh.
        for item in requests:
            email = str(item.get("sale_email") or "").strip().lower()
            item["sale_name"] = name_map.get(email, "")

        return {"requests": requests, "total": total}

    @router.patch("/payment-requests/{payment_request_id}")
    def patch_payment_request(
        payment_request_id: str,
        body: PaymentRequestPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        current_row = request_res.data[0]
        if not _can_access_request(sb, actor, current_row):
            raise HTTPException(403, "Khong co quyen thao tac phieu nay")
        patch = _payment_request_patch_row(body, current_row)
        if not patch:
            raise HTTPException(400, "Khong co du lieu de cap nhat")

        try:
            updated_res = (
                sb.table("payment_requests")
                .update(patch)
                .eq("id", payment_request_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat duoc payment_request: {exc}") from exc

        updated_row = updated_res.data[0] if updated_res.data else {**current_row, **patch}

        # Multi-con: đổi tên bé phụ → cập nhật student_name các line đã gắn bé đó
        if "extra_children" in patch:
            renames = _child_rename_map(current_row.get("extra_children"), patch.get("extra_children"))
            for old_name, new_name in renames.items():
                try:
                    sb.table("payment_lines").update({"student_name": new_name}) \
                      .eq("payment_request_id", payment_request_id).eq("student_name", old_name).execute()
                except Exception as exc:
                    print(f"[pr-multi-con] rename propagate failed: {exc}")

        # target thay doi co the anh huong state => recompute theo payment_lines.
        if "target" in patch:
            totals = recompute_payment_request_totals(sb, payment_request_id)
            refreshed = totals.get("payment_request")
            if isinstance(refreshed, dict):
                updated_row = {**updated_row, **refreshed}

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        return {
            "payment_request": _serialize_payment_request_list_item(
                updated_row,
                line_res.data or [],
                display_names=_build_display_names_for_lines(sb, line_res.data or []),
            )
        }

    @router.post("/payment-requests/{payment_request_id}/cancel")
    def cancel_payment_request(
        payment_request_id: str,
        body: PaymentRequestCancelBody | None = None,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen thao tac phieu nay")
        current_state = _clean_text(pr_row.get("state")).lower()
        if current_state == "cancelled":
            raise HTTPException(400, "Payment request da bi huy")
        if _parse_amount(pr_row.get("received")) > 0:
            raise HTTPException(400, "Khong the huy payment request da nhan tien")

        line_res = (
            sb.table("payment_lines")
            .select("status")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        if any(_clean_text(line.get("status")).lower() == "paid" for line in (line_res.data or [])):
            raise HTTPException(400, "Khong the huy payment request da co lan thanh toan thanh cong")

        now_iso = _iso_now()
        reason = _clean_text(body.reason if body else None) or None
        patch: dict[str, Any] = {
            "state": "cancelled",
            "cancelled_at": now_iso,
            "cancelled_reason": reason,
        }
        try:
            updated_res = (
                sb.table("payment_requests")
                .update(patch)
                .eq("id", payment_request_id)
                .execute()
            )
        except Exception as exc:
            msg = str(exc)
            if "cancelled_at" in msg or "cancelled_reason" in msg:
                raise HTTPException(
                    503,
                    "Thieu cot cancelled_at/cancelled_reason tren payment_requests. "
                    "Chay docs/supabase_schema_patch_payment_requests_cancel.sql",
                ) from exc
            raise HTTPException(500, f"Khong huy duoc payment_request: {exc}") from exc

        updated = updated_res.data[0] if updated_res.data else {**pr_row, **patch}
        line_res_full = (
            sb.table("payment_lines")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        from audit import log_audit
        log_audit(sb, actor.email, "pr.cancelled", "payment_request", payment_request_id, {
            "reason": reason,
        })
        return {
            "payment_request": _serialize_payment_request_list_item(
                updated,
                line_res_full.data or [],
                display_names=_build_display_names_for_lines(sb, line_res_full.data or []),
            )
        }

    @router.post("/payment-requests/{payment_request_id}/restore")
    def restore_payment_request(
        payment_request_id: str,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen thao tac phieu nay")
        current_state = _clean_text(pr_row.get("state")).lower()
        if current_state != "cancelled":
            raise HTTPException(400, "Chi restore duoc payment request da bi huy")

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        lines = line_res.data or []
        target = _parse_amount(pr_row.get("target"))
        received = _sum_paid_amount(lines)
        state = _compute_state(received, target)

        patch: dict[str, Any] = {
            "state": state,
            "received": received,
            "cancelled_at": None,
            "cancelled_reason": None,
        }
        try:
            updated_res = (
                sb.table("payment_requests")
                .update(patch)
                .eq("id", payment_request_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong restore duoc payment_request: {exc}") from exc

        updated = updated_res.data[0] if updated_res.data else {**pr_row, **patch}
        return {
            "payment_request": _serialize_payment_request_list_item(
                updated, lines, display_names=_build_display_names_for_lines(sb, lines)
            )
        }

    @router.post("/payment-requests/sync-pending-payos")
    async def sync_pending_payos_payments(authorization: str | None = Header(None)):
        """Poll PayOS cho mọi QR pending — dùng khi webhook chưa tới (local/prod).

        No-op khi USE_PAYOS=false: tránh hit PayOS API + spawn N httpx.AsyncClient
        cho mỗi stale pending line → OOM trên Render 512MB (Sprint 3 SePay-only).
        """
        if os.getenv("USE_PAYOS", "false").lower() != "true":
            return {"synced": [], "synced_count": 0, "errors": []}
        sb = _sb_or_503(get_supabase)
        resolve_actor(sb, authorization)
        return await sync_all_pending_payos_lines(sb)

    @router.post("/payment-lines/{line_id}/sync-payos")
    async def sync_payment_line_payos(line_id: str):
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")
        outcome = await sync_payment_line_from_payos(sb, line_res.data[0])
        if not outcome:
            return {"synced": False, "line_id": line_id}
        if outcome.get("error"):
            raise HTTPException(502, f"PayOS sync loi: {outcome['error']}")
        return {"synced": True, **outcome}

    @router.post("/payment-requests")
    def create_payment_request(
        body: PaymentRequestCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")
        row = _payment_request_insert_row(body)
        row["sale_email"] = actor.email.lower()
        row["is_test"] = _is_test_email(actor.email)
        try:
            row["id"] = _allocate_pr_id(sb)
            res = sb.table("payment_requests").insert(row).execute()
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_request: {exc}") from exc

        inserted = res.data[0] if res.data else row
        return {"payment_request": _serialize_payment_request(inserted)}

    @router.post("/payment-requests/{payment_request_id}/payment-lines")
    async def create_payment_line(
        payment_request_id: str,
        body: PaymentLineCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen thao tac phieu nay")
        if _clean_text(pr_row.get("state")).lower() == "cancelled":
            raise HTTPException(400, "Payment request da bi huy")
        target = _parse_amount(pr_row.get("target"))
        received = _parse_amount(pr_row.get("received"))
        if target > 0 and received >= target:
            raise HTTPException(
                400,
                {
                    "code": "PR_ALREADY_FULL",
                    "message": (
                        "PR da nhan du tien, can tang so tien du kien "
                        "de tao them lan thanh toan"
                    ),
                    "received": received,
                    "target": target,
                },
            )

        amount = _parse_amount(body.amount or body.so_tien)
        if amount <= 0:
            raise HTTPException(400, "amount khong hop le")

        method = _normalize_method(body.method or body.hinh_thuc)
        existing_lines = (
            sb.table("payment_lines")
            .select("id")
            .eq("payment_request_id", payment_request_id)
            .execute()
        )
        line_count = len(existing_lines.data or [])
        transfer_code = _clean_text(body.transfer_code or body.code) or _transfer_code_hint(
            payment_request_id, line_count
        )

        payos_payload: dict[str, Any] | None = None
        insert_row: dict[str, Any] = {
            "payment_request_id": payment_request_id,
            "method": method,
            "amount": amount,
            "status": "pending",
            "transfer_code": transfer_code,
            "is_test": bool(pr_row.get("is_test")),
        }
        # Multi-con: lần TT gắn bé nào (None/rỗng = bé 1)
        student_name = _clean_text(body.student_name) or None
        if student_name:
            insert_row["student_name"] = student_name

        if method == "installment":
            inst_total = _parse_amount(body.installment_total) if body.installment_total is not None else None
            sale_rec = _parse_amount(body.sale_received) if body.sale_received is not None else None
            if sale_rec is not None and inst_total is not None:
                if sale_rec > inst_total:
                    raise HTTPException(400, "sale_received vượt installment_total")

            if body.installment_platform:
                insert_row["installment_platform"] = body.installment_platform
            if inst_total is not None:
                insert_row["installment_total"] = inst_total
            if sale_rec is not None:
                insert_row["sale_received"] = sale_rec

        if method == "qr":
            description = _build_payos_transfer_description(
                pr_row, body.name_for_transfer, transfer_code
            )
            # USE_PAYOS=true → gọi PayOS dựng link (legacy, đang được cắt theo decision 19/6).
            # USE_PAYOS=false → chỉ build description với mã 5 ký tự, FE self-gen VietQR,
            # SePay webhook match content. Đơn giản hoá thanh toán về 1 cổng.
            use_payos = os.getenv("USE_PAYOS", "false").lower() == "true"
            if use_payos:
                try:
                    payos_payload = await create_payos_payment_link(amount, description)
                except ValueError as exc:
                    raise HTTPException(503, str(exc)) from exc
                except Exception as exc:
                    raise HTTPException(502, f"Khong ket noi duoc PayOS: {exc}") from exc

                insert_row.update(
                    {
                        "payos_order_code": payos_payload["order_code"],
                        "qr_code": payos_payload.get("qr_code") or "",
                        "checkout_url": payos_payload.get("checkout_url") or "",
                        "transfer_content": payos_payload.get("transfer_content") or description,
                        "name_for_transfer": body.name_for_transfer,
                    }
                )
            else:
                # SePay-only path — FE dựng VietQR tĩnh, SePay webhook match content.
                # payos_order_code = NULL (không "") để tránh duplicate unique constraint
                # khi nhiều lần TT trên cùng PR (Postgres UNIQUE cho phép multiple NULL).
                insert_row.update(
                    {
                        "payos_order_code": None,
                        "qr_code": "",
                        "checkout_url": "",
                        "transfer_content": description,
                        "name_for_transfer": body.name_for_transfer,
                    }
                )

        try:
            line_res = sb.table("payment_lines").insert(insert_row).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_line: {exc}") from exc

        line_row = line_res.data[0] if line_res.data else insert_row
        response: dict[str, Any] = {
            "payment_line": _serialize_payment_line(line_row, pr_row=pr_row),
            "payment_request": totals["payment_request"],
            "received": totals["received"],
            "target": totals["target"],
            "state": totals["state"],
        }
        if payos_payload:
            response["payos"] = {
                "checkout_url": payos_payload.get("checkout_url") or "",
                "qr_code": payos_payload.get("qr_code") or "",
                "order_code": payos_payload.get("order_code") or "",
                "transfer_content": payos_payload.get("transfer_content") or "",
                "payment_link_id": payos_payload.get("payment_link_id") or "",
            }
        return response

    @router.post("/payos-webhook")
    async def payos_webhook_v1(request: Request):
        raw_body = await request.body()
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, "Invalid JSON payload") from exc
        if not isinstance(payload, dict):
            raise HTTPException(400, "Invalid JSON payload")
        _verify_payos_webhook_signature(payload, request)

        sb = _sb_or_503(get_supabase)
        result = reconcile_payment_line_webhook(sb, payload)
        if not result.get("matched"):
            raise HTTPException(404, "Khong tim thay payment_line tuong ung webhook")
        return result

    @router.patch("/payment-lines/{line_id}/amount")
    def patch_payment_line_amount(
        line_id: str,
        body: PaymentLineAmountPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("id", line_id)
            .limit(1)
            .execute()
        )
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        if _clean_text(line.get("status")).lower() != "pending" or line.get("cancelled"):
            raise HTTPException(400, "Chi duoc sua so tien khi chua thanh toan")

        pr_id = str(line.get("payment_request_id") or "")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen sua payment_line nay")

        amount = _parse_amount(body.amount)
        if amount <= 0:
            raise HTTPException(400, "amount khong hop le")

        old_amount = _parse_amount(line.get("amount"))
        try:
            updated_res = (
                sb.table("payment_lines")
                .update({"amount": amount})
                .eq("id", line_id)
                .execute()
            )
            totals = recompute_payment_request_totals(sb, pr_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat amount: {exc}") from exc

        from audit import log_audit
        log_audit(sb, actor.email, "recon.amount_changed", "payment_line", line_id, {
            "pr_id": pr_id, "old_amount": old_amount, "new_amount": amount,
        })
        updated_line = updated_res.data[0] if updated_res.data else {**line, "amount": amount}
        return {
            "payment_line": _serialize_payment_line(
                updated_line,
                display_names=_build_display_names_for_lines(sb, [updated_line]),
                pr_row=pr_res.data[0],
            ),
            "payment_request": totals["payment_request"],
            "received": totals["received"],
            "target": totals["target"],
            "state": totals["state"],
        }

    @router.post("/payment-lines/{line_id}/refresh-content")
    def refresh_payment_line_content(
        line_id: str,
        body: PaymentLineRefreshContentBody | None = None,
        authorization: str | None = Header(None),
    ):
        import payment_request_routes as _self_mod
        sb = _sb_or_503(_self_mod.get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("id", line_id)
            .limit(1)
            .execute()
        )
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")
        line = line_res.data[0]

        if _clean_text(line.get("status")).lower() != "pending":
            raise HTTPException(400, "Chi rebuild duoc khi lan thanh toan chua thanh toan")
        if _clean_text(line.get("method")).lower() != "qr":
            raise HTTPException(400, "Chi rebuild duoc voi phuong thuc QR")

        pr_id = str(line.get("payment_request_id") or "")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        pr_row = pr_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen rebuild payment_line nay")

        explicit_name = body.name_for_transfer if body else None
        name_for_transfer = explicit_name or line.get("name_for_transfer") or pr_row.get("child_name") or pr_row.get("name")
        transfer_code = _clean_text(line.get("transfer_code"))
        if not transfer_code:
            raise HTTPException(400, "payment_line thieu transfer_code")

        old_content = _clean_text(line.get("transfer_content"))
        new_content = _build_payos_transfer_description(pr_row, name_for_transfer, transfer_code)

        if new_content == old_content and (not explicit_name or explicit_name == line.get("name_for_transfer")):
            return {
                "payment_line": _serialize_payment_line(
                    line,
                    display_names=_build_display_names_for_lines(sb, [line]),
                    pr_row=pr_row,
                ),
                "updated": False,
                "old_content": old_content,
                "new_content": new_content,
            }

        update_payload: dict[str, Any] = {"transfer_content": new_content}
        if explicit_name is not None:
            update_payload["name_for_transfer"] = explicit_name
        try:
            updated_res = (
                sb.table("payment_lines")
                .update(update_payload)
                .eq("id", line_id)
                .execute()
            )
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat duoc transfer_content: {exc}") from exc

        updated_line = updated_res.data[0] if updated_res.data else {**line, **update_payload}

        log_audit(sb, actor.email, "payment_line.refresh_content", "payment_line", line_id, {
            "pr_id": pr_id,
            "old_content": old_content,
            "new_content": new_content,
            "name_for_transfer": name_for_transfer,
        })

        return {
            "payment_line": _serialize_payment_line(
                updated_line,
                display_names=_build_display_names_for_lines(sb, [updated_line]),
                pr_row=pr_row,
            ),
            "updated": True,
            "old_content": old_content,
            "new_content": new_content,
        }

    @router.patch("/transactions/{transaction_id}/status")
    def patch_transaction_status(
        transaction_id: str,
        body: TransactionStatusPatch,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        if not can_confirm_payment(actor):
            raise HTTPException(403, "Khong co quyen xac nhan thanh toan")
        status = _normalize_line_status(body.status)

        line_res = (
            sb.table("payment_lines")
            .select("*")
            .eq("id", transaction_id)
            .limit(1)
            .execute()
        )
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay transaction")

        line = line_res.data[0]

        # TOP2.4 soft-lock: quẹt thẻ / trả góp PHẢI có ảnh bill mới được xác nhận tiền về.
        if status == "paid" and _clean_text(line.get("method")).lower() in ("card", "installment"):
            bill_images = line.get("bill_images")
            has_bill = (isinstance(bill_images, list) and len(bill_images) > 0) or bool(_clean_text(line.get("bill_image")))
            if not has_bill:
                raise HTTPException(
                    400,
                    "Lan thanh toan quet the/tra gop chua co anh bill — yeu cau sales upload bill truoc khi xac nhan.",
                )

        payment_request_id = str(line.get("payment_request_id") or "")
        if not payment_request_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        from audit import log_audit

        old_status = _clean_text(line.get("status"))
        now_iso = _iso_now()
        patch: dict[str, Any] = {"status": status}
        if status == "paid":
            patch["paid_at"] = now_iso
            patch["reject_reason"] = None
            patch["confirmed_by"] = actor.email
            patch["confirmed_at"] = now_iso
            patch["confirmed_source"] = "manual"
        elif status == "rejected":
            patch["paid_at"] = None
            patch["reject_reason"] = _clean_text(body.reject_reason) or "Ke toan tu choi"
            patch["confirmed_by"] = actor.email
            patch["confirmed_at"] = now_iso
            patch["confirmed_source"] = "manual"
        else:
            patch["paid_at"] = None
            patch["reject_reason"] = None

        if body.verified_total is not None:
            patch["verified_total"] = _parse_amount(body.verified_total) or None
        if body.verified_received is not None:
            patch["verified_received"] = _parse_amount(body.verified_received) or None

        try:
            updated_res = sb.table("payment_lines").update(patch).eq("id", transaction_id).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat transaction: {exc}") from exc

        log_audit(sb, actor.email, "recon.line_status_changed", "payment_line", transaction_id, {
            "pr_id": payment_request_id, "from_status": old_status, "to_status": status,
            "reject_reason": patch.get("reject_reason"),
        })
        updated_line = updated_res.data[0] if updated_res.data else {**line, **patch}
        return {
            "payment_line": _serialize_payment_line(
                updated_line,
                display_names=_build_display_names_for_lines(sb, [updated_line]),
            ),
            "payment_request": totals["payment_request"],
            "received": totals["received"],
            "target": totals["target"],
            "state": totals["state"],
        }

    @router.post("/payment-lines/{line_id}/bill")
    async def upload_payment_line_bill(
        line_id: str,
        file: UploadFile = File(...),
        authorization: str | None = Header(None),
    ):
        """Upload bill multipart → Supabase Storage bucket 'bills' → payment_lines.bill_image."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)

        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        pr_id = line.get("payment_request_id")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")
        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen upload bill cho phieu nay")
        content = await file.read()
        if not content:
            raise HTTPException(400, "File rong")
        ext = (file.filename or "bill").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
        if ext not in {"jpg", "jpeg", "png", "webp", "gif", "pdf"}:
            ext = "jpg"
        if ext == "jpeg":
            ext = "jpg"
        object_path = _bill_object_path(line_id, ext)
        content_type = file.content_type or f"image/{'jpeg' if ext == 'jpg' else ext}"

        try:
            bucket = sb.storage.from_("bills")
            bucket.upload(
                path=object_path,
                file=content,
                file_options={"content-type": content_type, "upsert": "false"},
            )
            public_url = _storage_public_url(bucket, object_path)
        except Exception as exc:
            raise HTTPException(
                500, f"Storage upload that bai (bucket 'bills' ton tai?): {exc}"
            ) from exc

        if not public_url:
            raise HTTPException(500, "Khong lay duoc public URL sau upload Storage")

        try:
            sb.rpc("append_payment_line_bill", {
                "p_line_id": line_id,
                "p_bill_url": public_url
            }).execute()
        except Exception as exc:
            raise HTTPException(500, f"Lỗi lưu trữ bill atomic: {exc}") from exc

        # 10/7: ghi vết thời gian up bill — phục vụ đối soát / truy vết bug
        log_audit(sb, actor.email, "payment_line.bill_uploaded", "payment_line", line_id, {
            "pr_id": pr_id,
            "bill_url": public_url,
            "filename": file.filename or "",
        })

        _invalidate_bill_storage_cache()
        
        # Read the newly saved line state
        try:
            updated_res = sb.table("payment_lines").select("*").eq("id", line_id).single().execute()
            if updated_res.data:
                line = updated_res.data
        except Exception:
            pass

        _maybe_enqueue_bill_uploaded_zalo(sb, line)

        bill_assets = _fetch_bill_assets_fast(sb, [line_id], force_refresh=True)
        return {
            "billImage": public_url,
            "payment_line": _serialize_payment_line(
                line,
                {line_id: public_url},
                bill_assets,
                display_names=_build_display_names_for_lines(sb, [line]),
                pr_row=pr_res.data[0],
            ),
        }

    @router.delete("/payment-lines/{line_id}/bills/latest")
    def delete_latest_uploaded_bill(line_id: str, authorization: str | None = Header(None)):
        """Delete latest uploaded bill, but keep the original first bill."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        pr_id = line.get("payment_request_id")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")
        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen xoa bill cua phieu nay")
        assets = _fetch_bill_assets_fast(sb, [line_id]).get(line_id, [])
        if len(assets) <= 1:
            raise HTTPException(400, "Khong the xoa bill ban dau")

        latest = assets[-1]
        latest_path = latest.get("path") or ""
        if not latest_path:
            raise HTTPException(400, "Khong xac dinh duoc path bill can xoa")

        try:
            sb.storage.from_("bills").remove([latest_path])
        except Exception as exc:
            raise HTTPException(500, f"Khong xoa duoc bill tren Storage: {exc}") from exc

        _invalidate_bill_storage_cache()
        next_assets = _fetch_bill_assets_fast(sb, [line_id], force_refresh=True).get(line_id, [])
        next_bill_url = (next_assets[-1].get("url") if next_assets else "") or ""
        try:
            _persist_bill_image(sb, line_id, next_bill_url)
        except Exception as exc:
            raise HTTPException(500, f"Loi cap nhat bill_image sau khi xoa: {exc}") from exc

        # 10/7: ghi vết thời gian xoá bill — phục vụ đối soát / truy vết bug
        log_audit(sb, actor.email, "payment_line.bill_deleted", "payment_line", line_id, {
            "pr_id": pr_id,
            "mode": "latest",
            "deleted_url": latest.get("url") or "",
            "remaining_count": len(next_assets),
        })

        merged_line = {**line, "bill_image": next_bill_url}
        return {
            "payment_line": _serialize_payment_line(
                merged_line,
                {line_id: next_bill_url},
                {line_id: next_assets},
                display_names=_build_display_names_for_lines(sb, [merged_line]),
                pr_row=pr_res.data[0],
            )
        }

    @router.post("/payment-lines/{line_id}/bills/delete")
    def delete_payment_line_bill(
        line_id: str,
        body: PaymentLineBillDeleteBody,
        authorization: str | None = Header(None),
    ):
        """
        Delete bill image(s) for a payment line.
        - delete_all=true  -> remove all bills
        - index provided  -> remove bill at that index in bill_images array
        - bill_url provided -> remove that exact bill
        - otherwise -> remove latest bill
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        pr_id = line.get("payment_request_id")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")
        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen xoa bill cua phieu nay")
        bill_images = line.get("bill_images") or []
        if not isinstance(bill_images, list):
            bill_images = []

        assets = _fetch_bill_assets_fast(sb, [line_id]).get(line_id, [])
        if not assets and not bill_images:
            raise HTTPException(400, "Khong co bill de xoa")

        paths_to_remove: list[str] = []
        url_to_remove = ""

        if body.delete_all:
            paths_to_remove = [str(a.get("path") or "") for a in assets if (a.get("path") or "").strip()]
            bill_images = []
        elif body.index is not None:
            idx = body.index
            if idx < 0 or idx >= len(bill_images):
                raise HTTPException(400, f"Index {idx} khong hop le (mang co {len(bill_images)} phan tu)")
            url_to_remove = bill_images[idx]
            bill_images.pop(idx)
            
            matched = next((a for a in assets if (a.get("url") or "").strip() == url_to_remove), None)
            if matched:
                matched_path = (matched.get("path") or "").strip()
                if matched_path:
                    paths_to_remove = [matched_path]
        elif (body.bill_url or "").strip():
            url_to_remove = (body.bill_url or "").strip()
            matched = next((a for a in assets if (a.get("url") or "").strip() == url_to_remove), None)
            if not matched:
                raise HTTPException(404, "Khong tim thay bill tuong ung bill_url")
            matched_path = (matched.get("path") or "").strip()
            if matched_path:
                paths_to_remove = [matched_path]
            if url_to_remove in bill_images:
                bill_images.remove(url_to_remove)
        else:
            if bill_images:
                url_to_remove = bill_images[-1]
                bill_images.pop()
                matched = next((a for a in assets if (a.get("url") or "").strip() == url_to_remove), None)
                if matched:
                    matched_path = (matched.get("path") or "").strip()
                    if matched_path:
                        paths_to_remove = [matched_path]
            elif assets:
                latest_path = (assets[-1].get("path") or "").strip()
                if latest_path:
                    paths_to_remove = [latest_path]

        if paths_to_remove:
            try:
                sb.storage.from_("bills").remove(paths_to_remove)
            except Exception as exc:
                raise HTTPException(500, f"Khong xoa duoc bill tren Storage: {exc}") from exc

        _invalidate_bill_storage_cache()
        next_assets = _fetch_bill_assets_fast(sb, [line_id], force_refresh=True).get(line_id, [])
        next_bill_url = bill_images[-1] if bill_images else ((next_assets[-1].get("url") if next_assets else "") or "")
        
        # If DB columns are updated, sync bill_image and bill_images
        try:
            patch = {
                "bill_image": next_bill_url or None,
                "bill_images": bill_images,
                "updated_at": _iso_now(),
            }
            sb.table("payment_lines").update(patch).eq("id", line_id).execute()
        except Exception as exc:
            raise HTTPException(500, f"Loi cap nhat database sau khi xoa: {exc}") from exc

        # 10/7: ghi vết thời gian xoá bill — phục vụ đối soát / truy vết bug
        delete_mode = (
            "all" if body.delete_all
            else "index" if body.index is not None
            else "url" if (body.bill_url or "").strip()
            else "latest"
        )
        log_audit(sb, actor.email, "payment_line.bill_deleted", "payment_line", line_id, {
            "pr_id": pr_id,
            "mode": delete_mode,
            "deleted_url": url_to_remove or None,
            "deleted_count": len(paths_to_remove) if body.delete_all else 1,
            "remaining_count": len(bill_images) if bill_images else len(next_assets),
        })

        # Read the newly saved line state
        try:
            updated_res = sb.table("payment_lines").select("*").eq("id", line_id).single().execute()
            if updated_res.data:
                line = updated_res.data
        except Exception:
            pass

        return {
            "payment_line": _serialize_payment_line(
                line,
                {line_id: next_bill_url},
                {line_id: next_assets},
                display_names=_build_display_names_for_lines(sb, [line]),
                pr_row=pr_res.data[0],
            )
        }

    @router.get("/payment-lines/{line_id}/bills/download")
    def download_payment_line_bill(
        line_id: str,
        bill_index: int | None = Query(None, ge=0),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        pr_id = line.get("payment_request_id")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")
        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen tai bill cua phieu nay")

        assets = _fetch_bill_assets_fast(sb, [line_id]).get(line_id, [])
        if not assets:
            raise HTTPException(404, "Khong co bill de tai")

        if bill_index is None:
            asset = assets[-1]
        else:
            if bill_index >= len(assets):
                raise HTTPException(400, "bill_index vuot qua so luong bill hien co")
            asset = assets[bill_index]

        object_path = _clean_text(asset.get("path"))
        if not object_path:
            raise HTTPException(404, "Khong xac dinh duoc file bill can tai")

        raw_name = _clean_text(asset.get("name")) or f"{line_id}-bill-{(bill_index or 0) + 1}.jpg"
        filename = _sanitize_download_filename(raw_name, f"{line_id}-bill.jpg")
        payload = _download_bill_bytes(sb, object_path)
        content_type = _content_type_for_asset(filename)
        return Response(
            content=payload,
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @router.get("/payment-lines/{line_id}/bills/download-all")
    def download_all_payment_line_bills(line_id: str, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
        pr_id = line.get("payment_request_id")
        if not pr_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")
        pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
        if not pr_res.data:
            raise HTTPException(404, "Khong tim thay payment_request lien quan")
        if not _can_access_request(sb, actor, pr_res.data[0]):
            raise HTTPException(403, "Khong co quyen tai bill cua phieu nay")

        assets = _fetch_bill_assets_fast(sb, [line_id]).get(line_id, [])
        if not assets:
            raise HTTPException(404, "Khong co bill de tai")

        archive_buffer = io.BytesIO()
        saved_count = 0
        failed_count = 0

        with zipfile.ZipFile(archive_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for idx, asset in enumerate(assets, start=1):
                object_path = _clean_text(asset.get("path"))
                if not object_path:
                    failed_count += 1
                    continue
                base_name = _clean_text(asset.get("name")) or f"{line_id}-bill-{idx}.jpg"
                filename = _sanitize_download_filename(base_name, f"{line_id}-bill-{idx}.jpg")
                try:
                    payload = _download_bill_bytes(sb, object_path)
                except HTTPException:
                    failed_count += 1
                    continue
                zf.writestr(filename, payload)
                saved_count += 1

        if saved_count == 0:
            raise HTTPException(502, "Khong tai duoc bat ky bill nao de dong goi ZIP")

        archive_name = _sanitize_download_filename(f"{line_id}-bills.zip", "payment-line-bills.zip")
        return Response(
            content=archive_buffer.getvalue(),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{archive_name}"',
                "X-Bills-Failed": str(failed_count),
            },
        )

    @router.post("/payment-requests/{payment_request_id}/invoice-remind")
    def create_invoice_reminder(
        payment_request_id: str,
        body: InvoiceRemindCreate,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "paymentRequests")

        # Check PR exists and actor has access
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        current_row = request_res.data[0]
        if not _can_access_request(sb, actor, current_row):
            raise HTTPException(403, "Khong co quyen thao tac phieu nay")

        target = _parse_amount(current_row.get("target"))
        received = _parse_amount(current_row.get("received"))
        if target > 0 and received < target:
            raise HTTPException(
                400,
                f"PR chua thu du tien ({received}/{target}), khong nhac xuat HD duoc",
            )

        # Throttle: block if reminded in 24h AND no invoice issued since that remind
        remind_res = (
            sb.table("invoice_reminders")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .order("requested_at", desc=True)
            .limit(1)
            .execute()
        )
        if remind_res.data:
            last_remind = remind_res.data[0]
            last_time = _parse_iso_datetime(last_remind["requested_at"])
            now_time = datetime.now(timezone.utc)
            diff = now_time - last_time
            if diff.total_seconds() < 24 * 3600:
                if not _has_invoice_since(sb, payment_request_id, last_time):
                    raise HTTPException(429, "Da nhac trong 24h qua, vui long cho")

        # Insert
        insert_res = (
            sb.table("invoice_reminders")
            .insert({
                "payment_request_id": payment_request_id,
                "requested_by": actor.user_id,
                "note": _clean_text(body.note) if body.note else None
            })
            .execute()
        )
        if not insert_res.data:
            raise HTTPException(500, "Khong the luu remind")

        row = insert_res.data[0]
        return {
            "reminder": {
                "id": str(row.get("id")),
                "payment_request_id": str(row.get("payment_request_id")),
                "requested_by": str(row.get("requested_by")),
                "requested_at": str(row.get("requested_at")),
                "note": row.get("note")
            }
        }

    @router.get("/invoice-reminders")
    def list_invoice_reminders(
        status: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)

        # check role kế toán/manager
        if not _is_accountant_or_manager(sb, actor):
            raise HTTPException(403, "Chỉ kế toán hoặc manager được phép xem danh sách nhắc nhở")

        reminders_res = (
            sb.table("invoice_reminders")
            .select("*")
            .order("requested_at", desc=True)
            .execute()
        )
        reminders_data = reminders_res.data or []
        if not reminders_data:
            return {"reminders": []}

        # Query related payment requests
        pr_ids = list({r["payment_request_id"] for r in reminders_data if r.get("payment_request_id")})
        pr_res = sb.table("payment_requests").select("id, name").in_("id", pr_ids).execute()
        pr_map = {r["id"]: r for r in (pr_res.data or [])}

        # Query related active requests — check if ALL courses invoiced
        ar_res = sb.table("active_requests").select("pr_id, uids_data").in_("pr_id", pr_ids).execute()
        ar_all_invoiced: dict[str, bool] = {}
        for ar in (ar_res.data or []):
            pid = ar.get("pr_id")
            if not pid:
                continue
            uids = ar.get("uids_data") or []
            courses = [c for u in (uids if isinstance(uids, list) else []) for c in (u.get("courses") or [])]
            all_done = bool(courses) and all(c.get("invoiced") for c in courses)
            ar_all_invoiced[pid] = ar_all_invoiced.get(pid, True) and all_done

        def is_pending(pr_id: str) -> bool:
            if pr_id not in pr_map:
                return False
            return not ar_all_invoiced.get(pr_id, False)

        if status == "pending":
            reminders_data = [r for r in reminders_data if is_pending(r["payment_request_id"])]

        user_names = _get_user_id_to_name_map(sb)

        reminders = []
        for r in reminders_data:
            pr_id = r["payment_request_id"]
            pr = pr_map.get(pr_id)
            if not pr:
                continue

            requested_by = r.get("requested_by")
            requested_by_name = user_names.get(requested_by, requested_by)

            reminders.append({
                "id": str(r["id"]),
                "payment_request_id": pr_id,
                "pr_code": pr_id,
                "customer_name": pr.get("name") or "",
                "requested_by_name": requested_by_name,
                "requested_at": str(r["requested_at"]),
                "note": r.get("note")
            })

        return {"reminders": reminders}

    @router.get("/payment-requests/{payment_request_id}/invoice-remind")
    def get_invoice_reminder_status(
        payment_request_id: str,
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)

        # Check PR exists and actor has access
        request_res = (
            sb.table("payment_requests")
            .select("*")
            .eq("id", payment_request_id)
            .limit(1)
            .execute()
        )
        if not request_res.data:
            raise HTTPException(404, "Khong tim thay payment_request")

        pr_row = request_res.data[0]
        if not _can_access_request(sb, actor, pr_row):
            raise HTTPException(403, "Khong co quyen access PR")

        remind_res = (
            sb.table("invoice_reminders")
            .select("*")
            .eq("payment_request_id", payment_request_id)
            .order("requested_at", desc=True)
            .limit(1)
            .execute()
        )

        can_remind = True
        last_reminder = None
        if remind_res.data:
            row = remind_res.data[0]
            last_time = _parse_iso_datetime(row["requested_at"])
            now_time = datetime.now(timezone.utc)
            diff = now_time - last_time
            if diff.total_seconds() < 24 * 3600:
                if not _has_invoice_since(sb, payment_request_id, last_time):
                    can_remind = False

            requested_by_name = _get_user_name_by_id(sb, row.get("requested_by"))
            last_reminder = {
                "id": str(row["id"]),
                "requested_at": str(row["requested_at"]),
                "requested_by_name": requested_by_name,
                "note": row.get("note")
            }

        return {
            "last_reminder": last_reminder,
            "can_remind": can_remind
        }

    app.include_router(router)
