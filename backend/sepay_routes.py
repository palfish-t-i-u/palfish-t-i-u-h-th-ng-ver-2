"""SePay Webhook & Cron Fallback — Tích hợp biến động số dư qua SePay.

Spec: docs/sepay_integration_spec_v1.md
Migration: docs/migrations/2026-06-13-sepay-bank-transactions.sql
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Callable

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, Request
from pydantic import BaseModel

from rbac import resolve_actor
from admin_routes import require_module_write

router = APIRouter(tags=["sepay"])

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SEPAY_WEBHOOK_SECRET = os.getenv("SEPAY_WEBHOOK_SECRET", "").strip()
SEPAY_API_TOKEN = os.getenv("SEPAY_API_TOKEN", "").strip()
SEPAY_API_BASE = "https://my.sepay.vn/userapi"

# Dải IP chính thức của SePay (cập nhật khi SePay thông báo thay đổi)
# Nếu biến env SEPAY_ALLOWED_IPS được set, dùng biến đó; nếu không, cho phép tất cả
# (phù hợp giai đoạn dev/ngrok).
_raw_ips = os.getenv("SEPAY_ALLOWED_IPS", "").strip()
SEPAY_ALLOWED_IPS: set[str] = (
    {ip.strip() for ip in _raw_ips.split(",") if ip.strip()} if _raw_ips else set()
)

# Patterns nhận diện khoản kết toán mPOS settle về MB → ignore
MPOS_SETTLE_PATTERNS: list[re.Pattern] = [
    re.compile(r"MPOS\s*SETTLE", re.IGNORECASE),
    re.compile(r"KET\s*TOAN.*MPOS", re.IGNORECASE),
    re.compile(r"PAYOO.*SETTLE", re.IGNORECASE),
    re.compile(r"THANH\s*TOAN\s*THE.*MPOS", re.IGNORECASE),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _parse_amount(v: Any) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _is_mpos_settlement(content: str) -> bool:
    """Nhận diện nội dung CK là khoản kết toán mPOS → ignore."""
    for pattern in MPOS_SETTLE_PATTERNS:
        if pattern.search(content):
            return True
    return False


# ---------------------------------------------------------------------------
# Security: IP Whitelisting
# ---------------------------------------------------------------------------
def _get_client_ip(request: Request) -> str:
    """Lấy IP thật từ request (hỗ trợ proxy/ngrok)."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""


def _verify_ip(request: Request) -> None:
    """Chặn request không đến từ dải IP SePay (nếu đã cấu hình)."""
    if not SEPAY_ALLOWED_IPS:
        # Chưa cấu hình → cho qua (dev/ngrok mode)
        return
    client_ip = _get_client_ip(request)
    if client_ip not in SEPAY_ALLOWED_IPS:
        raise HTTPException(403, f"IP {client_ip} not allowed")


# ---------------------------------------------------------------------------
# Security: HMAC-SHA256 Verification
# ---------------------------------------------------------------------------
def _verify_hmac(raw_body: bytes, signature_header: str, timestamp_header: str) -> None:
    """Verify HMAC-SHA256 trên raw body bytes theo đặc tả của SePay.

    Chuỗi ký: {timestamp}.{raw_body}
    Header chữ ký: X-SePay-Signature = sha256={hex_hash}
    """
    if not SEPAY_WEBHOOK_SECRET:
        return  # Dev mode — chưa có secret
    if not signature_header:
        raise HTTPException(401, "Missing webhook signature")
    if not timestamp_header:
        raise HTTPException(401, "Missing webhook timestamp")

    # Bóc tách tiền tố "sha256=" nếu có
    provided_sig = signature_header.strip()
    if provided_sig.startswith("sha256="):
        provided_sig = provided_sig[len("sha256="):]

    # Ghép chuỗi ký: {timestamp}.{raw_body}
    msg = timestamp_header.encode("utf-8") + b"." + raw_body

    expected = hmac.new(
        SEPAY_WEBHOOK_SECRET.encode("utf-8"),
        msg,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, provided_sig):
        raise HTTPException(401, "Invalid webhook signature")


# ---------------------------------------------------------------------------
# Matching Logic — tái sử dụng hàm khớp transfer_code từ payment_request_routes
# ---------------------------------------------------------------------------
def _match_transfer_code_in_content(sb, content: str, amount: float) -> dict[str, Any]:
    """Khớp mã Base36 (5 ký tự) trong nội dung CK với payment_lines pending.

    Tái dụng logic đã có tại payment_request_routes.py:917
    (reconcile_payment_line_webhook — fallback description matching).

    Returns: {"matched": True/False, "line": ..., "match_type": ...}
    """
    if not content:
        return {"matched": False}

    desc = content.upper()

    try:
        candidates = (
            sb.table("payment_lines")
            .select("*")
            .eq("method", "qr")
            .eq("status", "pending")
            .execute()
        )
    except Exception as exc:
        print(f"[sepay] transfer_code lookup failed: {exc}")
        return {"matched": False, "error": str(exc)}

    matched_line = None
    for candidate in candidates.data or []:
        code = _clean_text(candidate.get("transfer_code")).upper()
        if code and code in desc:
            matched_line = candidate
            break

    if not matched_line:
        return {"matched": False}

    # Kiểm tra số tiền khớp
    expected_amount = _parse_amount(matched_line.get("amount"))
    if expected_amount > 0 and abs(amount - expected_amount) > 0.01:
        return {
            "matched": True,
            "match_type": "code_match_amount_mismatch",
            "line": matched_line,
        }

    return {
        "matched": True,
        "match_type": "auto_matched",
        "line": matched_line,
    }


# ---------------------------------------------------------------------------
# Core: Xử lý 1 giao dịch SePay
# ---------------------------------------------------------------------------
def _process_sepay_transaction(sb, txn: dict[str, Any]) -> dict[str, Any]:
    """Xử lý 1 giao dịch SePay: lưu DB, khớp payment_line.

    Luồng:
    1. Check duplicate (sepay_id)
    2. Check mPOS settle → ignore
    3. Khớp mã Base36 trong nội dung CK
    4. INSERT với ON CONFLICT DO NOTHING
    """
    sepay_id = txn.get("id")
    content = _clean_text(txn.get("content") or txn.get("transferContent", ""))
    amount = _parse_amount(txn.get("transferAmount") or txn.get("amount", 0))
    account_number = _clean_text(txn.get("accountNumber", ""))
    sub_account = _clean_text(txn.get("subAccount") or txn.get("sub_account", ""))
    transaction_date_raw = txn.get("transactionDate") or txn.get("when")
    gateway = txn.get("_gateway", "sepay_webhook")  # internal tag

    # Parse transaction date
    txn_date = None
    if transaction_date_raw:
        try:
            txn_date = datetime.fromisoformat(str(transaction_date_raw))
        except (ValueError, TypeError):
            txn_date = None

    # Step 1: Check mPOS settle → ignore
    match_status = "pending"
    payment_line_id = None

    if _is_mpos_settlement(content):
        match_status = "ignored"
    else:
        # Step 2: Khớp mã thanh toán
        match_result = _match_transfer_code_in_content(sb, content, amount)
        if match_result.get("matched"):
            line = match_result.get("line", {})
            payment_line_id = str(line.get("id", "")) or None

            if match_result["match_type"] == "auto_matched":
                match_status = "auto_matched"
                # Mark payment_line as paid
                if payment_line_id:
                    try:
                        from payment_request_routes import recompute_payment_request_totals

                        now_iso = _iso_now()
                        sb.table("payment_lines").update(
                            {"status": "paid", "paid_at": now_iso, "reject_reason": None}
                        ).eq("id", payment_line_id).execute()

                        pr_id = str(line.get("payment_request_id", ""))
                        if pr_id:
                            recompute_payment_request_totals(sb, pr_id)
                    except Exception as exc:
                        print(f"[sepay] mark_line_paid failed: {exc}")
                        match_status = "needs_review"
            else:
                # Mã đúng, tiền sai → needs_review
                match_status = "needs_review"

    # Step 3: INSERT into bank_transactions (ON CONFLICT DO NOTHING)
    insert_row = {
        "sepay_id": sepay_id,
        "gateway": gateway,
        "account_number": account_number,
        "sub_account": sub_account,
        "amount": amount,
        "content": content,
        "transfer_content": content,
        "transaction_date": txn_date.isoformat() if txn_date else None,
        "match_status": match_status,
        "raw": json.dumps(txn, ensure_ascii=False, default=str),
        "payment_line_id": payment_line_id,
        "created_at": _iso_now(),
        "updated_at": _iso_now(),
    }

    try:
        # Supabase Python client dùng PostgREST — ON CONFLICT cần header đặc biệt
        # Prefer: resolution=ignore-duplicates (tương đương ON CONFLICT DO NOTHING)
        res = (
            sb.table("bank_transactions")
            .upsert(insert_row, on_conflict="sepay_id", ignore_duplicates=True)
            .execute()
        )
        is_new = bool(res.data)
    except Exception as exc:
        err_msg = str(exc).lower()
        if "duplicate key" in err_msg or "23505" in err_msg:
            # Duplicate → đã xử lý trước đó (race condition resolved by DB)
            return {"sepay_id": sepay_id, "status": "duplicate", "skipped": True}
        print(f"[sepay] DB insert failed: {exc}")
        raise

    return {
        "sepay_id": sepay_id,
        "status": match_status,
        "skipped": not is_new,
        "payment_line_id": payment_line_id,
    }


# ---------------------------------------------------------------------------
# Webhook Endpoint: POST /webhook/sepay
# ---------------------------------------------------------------------------
def register_sepay_routes(app, get_supabase: Callable) -> None:
    """Đăng ký SePay webhook + cron fallback routes."""

    def _sb_or_503(get_sb):
        sb = get_sb()
        if not sb:
            raise HTTPException(503, "Database chưa cấu hình")
        return sb

    @router.post("/webhook/sepay")
    async def webhook_sepay(request: Request):
        """Nhận webhook biến động số dư từ SePay.

        Security: IP Whitelisting + HMAC-SHA256 verification (hoặc API Key fallback).
        Response: {"success": true} (bắt buộc theo spec SePay).
        Timeout: Phải trả về trong < 30 giây.
        """
        # Layer 1: IP Whitelisting
        _verify_ip(request)

        # Layer 2: Xác thực (HMAC-SHA256 hoặc API Key/Token)
        raw_body = await request.body()
        signature = request.headers.get("x-sepay-signature", "")
        timestamp = request.headers.get("x-sepay-timestamp", "")
        authorization = request.headers.get("authorization", "")

        # 1. Xác thực bằng HMAC-SHA256 (nếu có header chữ ký từ SePay)
        if signature:
            _verify_hmac(raw_body, signature, timestamp)
        # 2. Hoặc xác thực bằng API Key đơn giản (nếu có header Authorization)
        elif SEPAY_WEBHOOK_SECRET and authorization:
            token = authorization.replace("Apikey ", "").replace("Bearer ", "").strip()
            if not hmac.compare_digest(token, SEPAY_WEBHOOK_SECRET):
                raise HTTPException(401, "Invalid webhook token")
        # 3. Nếu cấu hình secret nhưng không gửi bất kỳ credential nào
        elif SEPAY_WEBHOOK_SECRET:
            raise HTTPException(401, "Missing webhook authentication credentials")

        # Parse payload
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, ValueError):
            # Trả 200 + success để SePay không retry payload hỏng
            return {"success": True}

        # Xử lý giao dịch
        sb = _sb_or_503(get_supabase)
        try:
            result = _process_sepay_transaction(sb, payload)
            print(f"[sepay] webhook processed: sepay_id={result.get('sepay_id')}, "
                  f"status={result.get('status')}, skipped={result.get('skipped')}")
        except Exception as exc:
            # Log lỗi nhưng VẪN trả 200 để SePay không retry vô hạn
            print(f"[sepay] webhook processing error: {exc}")

        # Response PHẢI đúng format theo spec SePay
        return {"success": True}

    # -----------------------------------------------------------------------
    # Cron Fallback: GET /api/v1/sepay/sync-pending
    # -----------------------------------------------------------------------
    @router.post("/api/v1/sepay/sync-pending")
    async def sync_pending_sepay(
        authorization: str | None = Header(None),
    ):
        """Poll SePay API lấy giao dịch mới — fallback khi webhook bị miss.

        Gọi GET /v2/transactions (Bearer token), lặp qua từng GD chưa có
        trong DB, chạy qua pipeline xử lý giống webhook.
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)

        if not SEPAY_API_TOKEN:
            raise HTTPException(
                503, "SEPAY_API_TOKEN chưa cấu hình. Set trong .env"
            )

        # Fetch recent transactions from SePay API
        url = f"{SEPAY_API_BASE}/transactions/list"
        headers = {
            "Authorization": f"Bearer {SEPAY_API_TOKEN}",
            "Content-Type": "application/json",
        }

        synced: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        skipped = 0

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            raise HTTPException(
                502, f"SePay API lỗi: {exc}"
            ) from exc

        transactions = data.get("transactions") or data.get("data") or []
        if isinstance(transactions, dict):
            transactions = transactions.get("items", [])

        for txn in transactions:
            txn["_gateway"] = "sepay_poll"  # Tag nguồn là poll, không phải webhook
            try:
                result = _process_sepay_transaction(sb, txn)
                if result.get("skipped"):
                    skipped += 1
                else:
                    synced.append(result)
            except Exception as exc:
                errors.append({
                    "sepay_id": txn.get("id"),
                    "error": str(exc),
                })

        return {
            "synced_count": len(synced),
            "skipped_count": skipped,
            "error_count": len(errors),
            "synced": synced,
            "errors": errors,
        }

    # -----------------------------------------------------------------------
    # Manual review: PATCH /api/v1/bank-transactions/{txn_id}/match
    # -----------------------------------------------------------------------
    @router.patch("/api/v1/bank-transactions/{txn_id}/match")
    def manual_match_bank_transaction(
        txn_id: str,
        payment_line_id: str = Query(..., description="UUID of payment_line to link"),
        authorization: str | None = Header(None),
    ):
        """Kế toán map thủ công 1 bank_transaction → payment_line (NEEDS_REVIEW flow)."""
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)

        # Verify bank_transaction exists and is in needs_review
        txn_res = (
            sb.table("bank_transactions")
            .select("*")
            .eq("txn_id", txn_id)
            .limit(1)
            .execute()
        )
        if not txn_res.data:
            raise HTTPException(404, "Không tìm thấy bank_transaction")

        txn = txn_res.data[0]
        current_status = _clean_text(txn.get("match_status"))
        if current_status == "auto_matched":
            raise HTTPException(400, "Giao dịch đã được khớp tự động")

        # Link to payment_line and mark paid
        try:
            from payment_request_routes import recompute_payment_request_totals

            now_iso = _iso_now()
            # Update bank_transaction
            sb.table("bank_transactions").update({
                "match_status": "auto_matched",
                "payment_line_id": payment_line_id,
                "updated_at": now_iso,
            }).eq("txn_id", txn_id).execute()

            # Mark payment_line as paid
            line_res = (
                sb.table("payment_lines")
                .update({"status": "paid", "paid_at": now_iso, "reject_reason": None})
                .eq("id", payment_line_id)
                .execute()
            )
            if line_res.data:
                pr_id = str(line_res.data[0].get("payment_request_id", ""))
                if pr_id:
                    recompute_payment_request_totals(sb, pr_id)

        except Exception as exc:
            raise HTTPException(500, f"Manual match failed: {exc}") from exc

        return {"matched": True, "txn_id": txn_id, "payment_line_id": payment_line_id}

    # Register router
    app.include_router(router)
