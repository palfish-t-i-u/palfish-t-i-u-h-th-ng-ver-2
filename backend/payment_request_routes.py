"""Many-to-many payment request API — B1/B2 (Hiếu prototype)."""

from __future__ import annotations

import io
import mimetypes
import re
import time
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd
from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from rbac import resolve_actor, visible_creator_emails
from admin_routes import require_module_write

from payos_qr import create_payos_payment_link, fetch_payos_payment, payos_payment_is_paid

router = APIRouter(prefix="/api/v1", tags=["payment-requests"])

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


class PaymentRequestCreate(BaseModel):
    uid: str | None = None
    name: str | None = None
    phone: str | None = None
    country: str | None = "VN"
    address: str | None = ""
    ward: str | None = ""
    province: str | None = ""
    note: str | None = ""
    email: str | None = ""
    target: int | str | None = None

    uid_khach_hang: str | None = None
    ten_khach: str | None = None
    sdt: str | None = None
    dia_chi: str | None = None
    tong_tien_phai_thu: int | str | None = None


class PaymentRequestPatch(BaseModel):
    uid: str | None = None
    name: str | None = None
    phone: str | None = None
    country: str | None = None
    address: str | None = None
    ward: str | None = None
    province: str | None = None
    note: str | None = None
    email: str | None = None
    target: int | str | None = None

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

    so_tien: int | str | None = None
    hinh_thuc: str | None = None


class TransactionStatusPatch(BaseModel):
    status: str
    reject_reason: str | None = None


class PaymentRequestCancelBody(BaseModel):
    reason: str | None = None


class PaymentLineBillDeleteBody(BaseModel):
    bill_url: str | None = None
    delete_all: bool = False
    index: int | None = None


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


def _sum_paid_amount(lines: list[dict[str, Any]]) -> int:
    if not lines:
        return 0
    df = pd.DataFrame(lines)
    if df.empty or "amount" not in df.columns:
        return 0
    if "status" not in df.columns:
        df["status"] = ""
    paid = df[df["status"].astype(str).str.lower() == "paid"].copy()
    paid["amount"] = pd.to_numeric(paid["amount"], errors="coerce").fillna(0)
    return int(paid["amount"].sum())


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _serialize_payment_request(row: dict[str, Any]) -> dict[str, Any]:
    target = _parse_amount(row.get("target"))
    received = _parse_amount(row.get("received"))
    return {
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
        "target": target,
        "received": received,
        "state": row.get("state") or "pending",
        "delta": received - target,
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
        "sale_email": row.get("sale_email") or "",
        "is_test": bool(row.get("is_test")),
    }


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
        _bill_assets_cache["assets_by_line"] = dict(fallback)
        _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
    return fallback


def _bill_urls_from_assets(bill_assets: dict[str, list[dict[str, str]]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for line_id, assets in (bill_assets or {}).items():
        if not assets:
            continue
        out[line_id] = str(assets[-1].get("url") or "").strip()
    return out


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


def _serialize_payment_line(
    row: dict[str, Any],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    return {
        "id": str(row.get("id") or ""),
        "payment_request_id": row.get("payment_request_id") or "",
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "payos_order_code": row.get("payos_order_code") or "",
        "transfer_code": row.get("transfer_code") or "",
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": row.get("paid_at") or "",
        "reject_reason": row.get("reject_reason") or "",
        "created_at": row.get("created_at") or "",
        "updated_at": row.get("updated_at") or "",
        **_bill_fields(row, bill_urls, bill_assets),
    }


def _serialize_payment_for_list(
    row: dict[str, Any],
    idx: int,
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    reject = row.get("reject_reason")
    paid_at = row.get("paid_at")
    return {
        "id": str(row.get("id") or ""),
        "idx": idx,
        "method": row.get("method") or "",
        "amount": _parse_amount(row.get("amount")),
        "status": row.get("status") or "pending",
        "transfer_code": row.get("transfer_code") or "",
        "qr_code": row.get("qr_code") or "",
        "checkout_url": row.get("checkout_url") or "",
        "paid_at": paid_at if paid_at else None,
        "created_at": row.get("created_at") or "",
        "reject_reason": reject if reject else None,
        **_bill_fields(row, bill_urls, bill_assets),
    }


def _serialize_payment_request_list_item(
    row: dict[str, Any],
    lines: list[dict[str, Any]],
    bill_urls: dict[str, str] | None = None,
    bill_assets: dict[str, list[dict[str, str]]] | None = None,
) -> dict[str, Any]:
    sorted_lines = sorted(lines, key=lambda item: str(item.get("created_at") or ""))
    payments = [
        _serialize_payment_for_list(line, idx, bill_urls, bill_assets)
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


def _can_access_request(sb, actor: Any, pr_row: dict[str, Any]) -> bool:
    allowed_emails = visible_creator_emails(sb, actor)
    if allowed_emails is None:
        return True
    row_email = _clean_text(pr_row.get("sale_email")).lower()
    allowed = {str(email).strip().lower() for email in allowed_emails if str(email).strip()}
    return bool(row_email) and row_email in allowed


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

    return {
        "name": name,
        "uid": uid,
        "phone": phone,
        "country": _clean_text(body.country) or "VN",
        "address": address,
        "ward": _clean_text(body.ward),
        "province": _clean_text(body.province),
        "note": _clean_text(body.note),
        "email": _clean_text(body.email),
        "target": target,
        "received": 0,
        "state": "pending",
    }


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

    target_val = body.target if body.target is not None else body.tong_tien_phai_thu
    if target_val is not None:
        target = _parse_amount(target_val)
        if target <= 0:
            raise HTTPException(400, "target khong hop le")
        patch["target"] = target

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
    year_key = str(year or datetime.now(timezone.utc).year)
    res = (
        sb.table("payment_request_sequences")
        .select("current_val")
        .eq("year_key", year_key)
        .limit(1)
        .execute()
    )
    if res.data:
        seq = int(res.data[0].get("current_val") or 0) + 1
        sb.table("payment_request_sequences").update({"current_val": seq}).eq("year_key", year_key).execute()
    else:
        seq = 1
        sb.table("payment_request_sequences").insert({"year_key": year_key, "current_val": seq}).execute()
    return f"PR-{year_key}-{seq:04d}"


def _transfer_code_hint(payment_request_id: str, line_count: int) -> str:
    suffix = payment_request_id.replace("PR-", "").replace("-", "")
    return f"TT-{suffix}-{line_count + 1:03d}"


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
        .select("amount, status")
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


def _mark_line_paid(sb, line_id: str) -> dict[str, Any]:
    now_iso = _iso_now()
    line_res = (
        sb.table("payment_lines")
        .update({"status": "paid", "paid_at": now_iso, "reject_reason": None})
        .eq("id", line_id)
        .execute()
    )
    if not line_res.data:
        raise HTTPException(404, "Khong tim thay payment_line")
    line = line_res.data[0]
    totals = recompute_payment_request_totals(sb, str(line["payment_request_id"]))
    return {
        "payment_line": _serialize_payment_line(line),
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
        result = _mark_line_paid(sb, line_id)
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
        desc = description.upper()
        try:
            candidates = (
                sb.table("payment_lines")
                .select("*")
                .eq("method", "qr")
                .eq("status", "pending")
                .execute()
            )
            for candidate in candidates.data or []:
                code = _clean_text(candidate.get("transfer_code")).upper()
                if code and code in desc:
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
        result = _mark_line_paid(sb, line_id)
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


def register_payment_request_routes(app, get_supabase) -> None:
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
        query = sb.table("payment_requests").select("*")
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
        if not pr_rows:
            return {"requests": []}

        pr_ids = [str(row.get("id") or "") for row in pr_rows if row.get("id")]
        lines_by_pr: dict[str, list[dict[str, Any]]] = {pr_id: [] for pr_id in pr_ids}
        if pr_ids:
            try:
                line_res = (
                    sb.table("payment_lines")
                    .select("*")
                    .in_("payment_request_id", pr_ids)
                    .execute()
                )
                lines_by_pr = _group_lines_by_request(line_res.data or [])
            except Exception as exc:
                raise HTTPException(500, f"Khong doc duoc payment_lines: {exc}") from exc

        all_line_ids = [
            str(line.get("id") or "")
            for lines in lines_by_pr.values()
            for line in lines
            if line.get("id")
        ]
        bill_assets = _fetch_bill_assets_fast(sb, all_line_ids)
        bill_urls = _bill_urls_from_assets(bill_assets)

        requests = [
            _serialize_payment_request_list_item(
                row, lines_by_pr.get(str(row.get("id") or ""), []), bill_urls, bill_assets
            )
            for row in pr_rows
        ]
        return {"requests": requests}

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
        return {
            "payment_request": _serialize_payment_request_list_item(
                updated, line_res_full.data or []
            )
        }

    @router.post("/payment-requests/sync-pending-payos")
    async def sync_pending_payos_payments():
        """Poll PayOS cho mọi QR pending — dùng khi webhook chưa tới (local/prod)."""
        sb = _sb_or_503(get_supabase)
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

        if method == "qr":
            try:
                payos_payload = await create_payos_payment_link(amount, transfer_code)
            except ValueError as exc:
                raise HTTPException(503, str(exc)) from exc
            except Exception as exc:
                raise HTTPException(502, f"Khong ket noi duoc PayOS: {exc}") from exc

            insert_row.update(
                {
                    "payos_order_code": payos_payload["order_code"],
                    "transfer_code": payos_payload.get("transfer_content") or transfer_code,
                    "qr_code": payos_payload.get("qr_code") or "",
                    "checkout_url": payos_payload.get("checkout_url") or "",
                }
            )

        try:
            line_res = sb.table("payment_lines").insert(insert_row).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except Exception as exc:
            raise HTTPException(500, f"Khong tao duoc payment_line: {exc}") from exc

        line_row = line_res.data[0] if line_res.data else insert_row
        response: dict[str, Any] = {
            "payment_line": _serialize_payment_line(line_row),
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
    async def payos_webhook_v1(payload: dict):
        sb = _sb_or_503(get_supabase)
        result = reconcile_payment_line_webhook(sb, payload)
        if not result.get("matched"):
            raise HTTPException(404, "Khong tim thay payment_line tuong ung webhook")
        return result

    @router.patch("/transactions/{transaction_id}/status")
    def patch_transaction_status(transaction_id: str, body: TransactionStatusPatch):
        sb = _sb_or_503(get_supabase)
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
        payment_request_id = str(line.get("payment_request_id") or "")
        if not payment_request_id:
            raise HTTPException(400, "payment_line thieu payment_request_id")

        patch: dict[str, Any] = {"status": status}
        if status == "paid":
            patch["paid_at"] = _iso_now()
            patch["reject_reason"] = None
        elif status == "rejected":
            patch["paid_at"] = None
            patch["reject_reason"] = _clean_text(body.reject_reason) or "Ke toan tu choi"
        else:
            patch["paid_at"] = None
            patch["reject_reason"] = None

        try:
            updated_res = sb.table("payment_lines").update(patch).eq("id", transaction_id).execute()
            totals = recompute_payment_request_totals(sb, payment_request_id)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Khong cap nhat transaction: {exc}") from exc

        updated_line = updated_res.data[0] if updated_res.data else {**line, **patch}
        return {
            "payment_line": _serialize_payment_line(updated_line),
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
        if authorization:
            try:
                resolve_actor(sb, authorization)
            except HTTPException:
                pass
            except Exception as exc:
                print(f"payment line bill upload auth: {exc}")

        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
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

        _invalidate_bill_storage_cache()
        
        # Read the newly saved line state
        try:
            updated_res = sb.table("payment_lines").select("*").eq("id", line_id).single().execute()
            if updated_res.data:
                line = updated_res.data
        except Exception:
            pass
            
        bill_assets = _fetch_bill_assets_fast(sb, [line_id], force_refresh=True)
        return {
            "billImage": public_url,
            "payment_line": _serialize_payment_line(
                line,
                {line_id: public_url},
                bill_assets,
            ),
        }

    @router.delete("/payment-lines/{line_id}/bills/latest")
    def delete_latest_uploaded_bill(line_id: str):
        """Delete latest uploaded bill, but keep the original first bill."""
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
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

        merged_line = {**line, "bill_image": next_bill_url}
        return {
            "payment_line": _serialize_payment_line(
                merged_line,
                {line_id: next_bill_url},
                {line_id: next_assets},
            )
        }

    @router.post("/payment-lines/{line_id}/bills/delete")
    def delete_payment_line_bill(line_id: str, body: PaymentLineBillDeleteBody):
        """
        Delete bill image(s) for a payment line.
        - delete_all=true  -> remove all bills
        - index provided  -> remove bill at that index in bill_images array
        - bill_url provided -> remove that exact bill
        - otherwise -> remove latest bill
        """
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

        line = line_res.data[0]
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
            )
        }

    @router.get("/payment-lines/{line_id}/bills/download")
    def download_payment_line_bill(line_id: str, bill_index: int | None = Query(None, ge=0)):
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("id").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

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
    def download_all_payment_line_bills(line_id: str):
        sb = _sb_or_503(get_supabase)
        line_res = sb.table("payment_lines").select("id").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")

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

    app.include_router(router)
