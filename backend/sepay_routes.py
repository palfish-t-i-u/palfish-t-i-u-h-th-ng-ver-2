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
import time
from datetime import datetime, timedelta, timezone
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


def _first_value(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _first_text(data: dict[str, Any], *keys: str) -> str:
    return _clean_text(_first_value(data, *keys))


# ---------------------------------------------------------------------------
# Scoring: chấm điểm candidate khi ghép CK ngoài (parse NDCK)
# ---------------------------------------------------------------------------
_PHONE_RE = re.compile(r"(?:^|\D)(0\d{9})(?:\D|$)")
_NOISE_WORDS = {"CK", "CHUYEN", "KHOAN", "THANH", "TOAN", "TIEN", "HOC", "PHI",
                "GD", "IBFT", "VCB", "TCB", "MB", "ACB", "BIDV", "VIETINBANK",
                "VIETCOMBANK", "SACOMBANK", "TECHCOMBANK", "MBBANK", "NGUYEN", "TRAN",
                "LE", "PHAM", "HOANG", "DANG", "BUI", "DO", "HO", "NGO", "DUONG", "LY",
                "VU", "VO", "TRUONG", "VND", "CT", "TU", "DEN", "CHO", "TAI"}


def _score_candidate(content: str, cand: dict, txn_amount: float) -> tuple[int, list[str]]:
    """Chấm điểm 1 candidate so với nội dung chuyển khoản (NDCK).

    Trả (score, match_signals) — signals ⊆ {"code", "phone", "amount", "name"}.
    Weights: mã TT +120, SĐT +100, cùng tiền +50, tên +30 (xem HANDOFF_RECON_ORPHAN_REDIRECT_SCORING.md).
    """
    score = 0
    signals: list[str] = []
    desc = _clean_text(content).upper()
    if not desc:
        if txn_amount > 0 and abs(txn_amount - cand.get("amount", 0)) < 1:
            return 50, ["amount"]
        return 0, []

    # Mã TT (transfer_code)
    tc = _clean_text(cand.get("transfer_code", "")).upper()
    if tc and len(tc) >= 4 and tc in desc:
        score += 120
        signals.append("code")

    # SĐT
    phones_in_content = _PHONE_RE.findall(desc.replace(" ", ""))
    cand_phone = _clean_text(cand.get("pr_phone", "")).replace(" ", "")
    if cand_phone and len(cand_phone) >= 9:
        cand_phone_norm = cand_phone[-9:]
        for p in phones_in_content:
            if p[-9:] == cand_phone_norm:
                score += 100
                signals.append("phone")
                break

    # Cùng số tiền
    if txn_amount > 0 and abs(txn_amount - cand.get("amount", 0)) < 1:
        score += 50
        signals.append("amount")

    # Tên (bỏ noise word: tên ngân hàng, họ phổ biến VN)
    cand_name = _clean_text(cand.get("pr_name", "")).upper()
    if cand_name:
        name_words = [w for w in cand_name.split() if len(w) >= 2 and w not in _NOISE_WORDS]
        if name_words:
            desc_words = set(desc.split())
            matched = sum(1 for w in name_words if w in desc_words)
            if matched >= 1 and matched >= len(name_words) * 0.5:
                score += 30
                signals.append("name")

    return score, signals


def _extract_sepay_amount(txn: dict[str, Any]) -> float:
    """Normalize amount fields from both webhook and SePay list API payloads."""
    incoming = _parse_amount(_first_value(
        txn,
        "transferAmount",
        "transfer_amount",
        "amount",
        "amount_in",
        "amountIn",
        "money_in",
        "inAmount",
        "creditAmount",
        "credit_amount",
    ))
    if incoming:
        return incoming

    outgoing = _parse_amount(_first_value(
        txn,
        "amount_out",
        "amountOut",
        "money_out",
        "outAmount",
        "debitAmount",
        "debit_amount",
    ))
    if outgoing:
        return -abs(outgoing)

    return 0.0


def _extract_sepay_transaction_fields(txn: dict[str, Any]) -> dict[str, Any]:
    """Normalize SePay webhook and poll API field names into our DB shape."""
    return {
        "sepay_id": _first_value(txn, "id", "sepay_id", "transaction_id", "transactionId"),
        "content": _first_text(
            txn,
            "content",
            "transferContent",
            "transfer_content",
            "transaction_content",
            "transactionContent",
            "description",
            "note",
            "remark",
        ),
        "amount": _extract_sepay_amount(txn),
        "account_number": _first_text(
            txn,
            "accountNumber",
            "account_number",
            "bank_account",
            "bankAccount",
            "accountNo",
            "account_no",
        ),
        "sub_account": _first_text(txn, "subAccount", "sub_account"),
        "transaction_date_raw": _first_value(
            txn,
            "transactionDate",
            "transaction_date",
            "when",
            "created_at",
            "createdAt",
            "time",
        ),
    }


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

    # Anti-replay: reject requests older than 5 minutes (per SePay docs)
    try:
        ts = int(timestamp_header)
        if abs(time.time() - ts) > 300:
            raise HTTPException(401, "Webhook request expired")
    except (ValueError, TypeError):
        raise HTTPException(401, "Invalid webhook timestamp")

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
    fields = _extract_sepay_transaction_fields(txn)
    sepay_id = fields["sepay_id"]
    content = fields["content"]
    amount = fields["amount"]
    account_number = fields["account_number"]
    sub_account = fields["sub_account"]
    transaction_date_raw = fields["transaction_date_raw"]
    gateway = txn.get("_gateway", "sepay_webhook")  # internal tag

    # Parse transaction date — SePay returns Vietnam local time (UTC+7)
    _VN_TZ = timezone(timedelta(hours=7))
    txn_date = None
    if transaction_date_raw:
        try:
            txn_date = datetime.fromisoformat(str(transaction_date_raw))
            if txn_date.tzinfo is None:
                txn_date = txn_date.replace(tzinfo=_VN_TZ)
        except (ValueError, TypeError):
            txn_date = None

    # Step 1: Quyết định match_status + tìm payment_line_id ứng viên
    # KHÔNG được mark payment_line=paid ở đây — chỉ tính toán. Việc mark paid
    # sẽ làm SAU INSERT bank_transactions thành công để chống race condition
    # khiến payment_line=paid nhưng không có bank_transaction (state inconsistent).
    match_status = "pending"
    payment_line_id = None
    line_to_pay: dict[str, Any] | None = None  # set nếu cần mark paid sau INSERT

    if _is_mpos_settlement(content):
        match_status = "ignored"
    else:
        match_result = _match_transfer_code_in_content(sb, content, amount)
        if match_result.get("matched"):
            line = match_result.get("line", {})
            payment_line_id = str(line.get("id", "")) or None
            if match_result["match_type"] == "auto_matched":
                match_status = "auto_matched"
                line_to_pay = line
            else:
                # Mã đúng, tiền sai → needs_review
                match_status = "needs_review"

    # Step 2: INSERT into bank_transactions TRƯỚC (ON CONFLICT DO NOTHING)
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
        res = (
            sb.table("bank_transactions")
            .upsert(insert_row, on_conflict="sepay_id", ignore_duplicates=True)
            .execute()
        )
        is_new = bool(res.data)
    except Exception as exc:
        err_msg = str(exc).lower()
        if "duplicate key" in err_msg or "23505" in err_msg:
            return {"sepay_id": sepay_id, "status": "duplicate", "skipped": True}
        print(f"[sepay] DB insert failed: {exc}")
        raise

    # Step 3: CHỈ KHI bank_transactions INSERT thành công (is_new=True) MỚI mark
    # payment_line=paid + recompute PR. Tránh case INSERT fail nhưng line đã paid.
    if is_new and line_to_pay is not None:
        line_paid_ok = False
        try:
            now_iso = _iso_now()
            sb.table("payment_lines").update(
                {"status": "paid", "paid_at": now_iso, "reject_reason": None,
                 "confirmed_by": "system:sepay", "confirmed_at": now_iso, "confirmed_source": "sepay"}
            ).eq("id", payment_line_id).execute()
            line_paid_ok = True
        except Exception as exc:
            # payment_line update fail → line CHƯA paid, an toàn revert match_status.
            print(f"[sepay] mark_line_paid failed sau khi INSERT: {exc}")
            try:
                sb.table("bank_transactions").update(
                    {"match_status": "needs_review", "updated_at": _iso_now()}
                ).eq("sepay_id", sepay_id).execute()
                match_status = "needs_review"
            except Exception as exc2:
                print(f"[sepay] revert match_status failed: {exc2}")

        # Recompute + audit: best-effort, KHÔNG revert match_status nếu fail —
        # line đã paid rồi, revert sẽ tạo orphan (line=paid, match_status=needs_review).
        if line_paid_ok:
            try:
                from payment_request_routes import recompute_payment_request_totals
                from audit import log_audit

                pr_id = str(line_to_pay.get("payment_request_id", ""))
                if pr_id:
                    recompute_payment_request_totals(sb, pr_id)
                log_audit(sb, "system:sepay", "recon.line_marked_paid", "payment_line", payment_line_id, {
                    "pr_id": pr_id, "source": "sepay", "sepay_id": sepay_id,
                })
            except Exception as exc:
                print(f"[sepay] recompute/audit failed (line already paid, match_status kept): {exc}")

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

        # Production safeguard: SEPAY_WEBHOOK_SECRET BẮT BUỘC khi APP_ENV=production.
        # Chống bypass do ai đó deploy prod quên set env → mọi webhook đi qua không verify.
        # Sandbox/dev/test vẫn cho phép (đã log cảnh báo ở module load nếu thiếu).
        app_env = os.getenv("APP_ENV", "").lower()
        if not SEPAY_WEBHOOK_SECRET and app_env == "production":
            raise HTTPException(
                503,
                "SEPAY_WEBHOOK_SECRET chưa cấu hình trên environment production — từ chối nhận webhook",
            )

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
            err_msg = str(exc).lower()
            is_transient = any(kw in err_msg for kw in (
                "connectionterminated", "connection", "timeout",
                "timed out", "too many", "rate limit", "503", "502",
            ))
            if is_transient:
                print(f"[sepay] webhook TRANSIENT error (trả 500 để SePay retry): {exc}")
                raise HTTPException(500, "Transient DB error — please retry")
            print(f"[sepay] webhook processing error (permanent, trả 200): {exc}")

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
        require_module_write(sb, actor, "reconciliation")

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
        require_module_write(sb, actor, "reconciliation")

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
        if current_status in ("auto_matched", "manual_matched"):
            raise HTTPException(400, "Giao dịch đã được khớp")

        # Link to payment_line and mark paid
        try:
            from payment_request_routes import recompute_payment_request_totals

            now_iso = _iso_now()
            line_lookup = (
                sb.table("payment_lines")
                .select("*")
                .eq("id", payment_line_id)
                .limit(1)
                .execute()
            )
            if not line_lookup.data:
                raise HTTPException(404, "Khong tim thay payment_line")
            line_row = line_lookup.data[0]
            discrepancy_amount = _parse_amount(txn.get("amount")) - _parse_amount(line_row.get("amount"))

            # Update bank_transaction
            sb.table("bank_transactions").update({
                "match_status": "manual_matched",
                "payment_line_id": payment_line_id,
                "matched_by": actor.email,
                "discrepancy_amount": discrepancy_amount,
                "updated_at": now_iso,
            }).eq("txn_id", txn_id).execute()

            # Mark payment_line as paid
            line_res = (
                sb.table("payment_lines")
                .update({"status": "paid", "paid_at": now_iso, "reject_reason": None,
                         "confirmed_by": actor.email, "confirmed_at": now_iso, "confirmed_source": "manual"})
                .eq("id", payment_line_id)
                .execute()
            )
            if line_res.data:
                pr_id = str(line_res.data[0].get("payment_request_id", ""))
                if pr_id:
                    recompute_payment_request_totals(sb, pr_id)

            from audit import log_audit
            log_audit(sb, actor.email, "recon.bank_txn_matched", "bank_transaction", txn_id, {
                "payment_line_id": payment_line_id, "discrepancy_amount": discrepancy_amount,
            })
        except Exception as exc:
            if isinstance(exc, HTTPException):
                raise
            raise HTTPException(500, f"Manual match failed: {exc}") from exc

        return {
            "matched": True,
            "txn_id": txn_id,
            "payment_line_id": payment_line_id,
            "discrepancy_amount": discrepancy_amount,
        }

    # -----------------------------------------------------------------------
    # List bank transactions: GET /api/v1/bank-transactions
    # -----------------------------------------------------------------------
    @router.get("/api/v1/bank-transactions")
    def list_bank_transactions(
        status: str | None = Query(None),
        q: str | None = Query(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        limit: int = Query(200, ge=1, le=1000),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")

        query = (
            sb.table("bank_transactions")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status and status != "all":
            query = query.eq("match_status", status)
        if from_date:
            query = query.gte("transaction_date", from_date)
        if to_date:
            query = query.lte("transaction_date", to_date)

        res = query.execute()
        rows = res.data or []

        if q:
            q_lower = q.lower()
            rows = [
                r for r in rows
                if q_lower in (r.get("transfer_content") or "").lower()
                or q_lower in (r.get("content") or "").lower()
                or q_lower in str(r.get("amount", "")).lower()
                or q_lower in (r.get("account_number") or "").lower()
            ]

        return rows

    # -----------------------------------------------------------------------
    # Match candidates for bank transaction (reuse gateway pattern)
    # -----------------------------------------------------------------------
    @router.get("/api/v1/bank-transactions/{txn_id}/match-candidates")
    def bank_txn_match_candidates(
        txn_id: str,
        amount_exact: float | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")

        txn_res = (
            sb.table("bank_transactions")
            .select("*")
            .eq("txn_id", txn_id)
            .limit(1)
            .execute()
        )
        if not txn_res.data:
            raise HTTPException(404, "Không tìm thấy giao dịch")

        txn = txn_res.data[0]
        txn_amount = _parse_amount(txn.get("amount", 0))

        lines_query = (
            sb.table("payment_lines")
            .select("id, payment_request_id, amount, method, status, transfer_code, created_at, student_name, bill_images, bill_image")
            .in_("status", ["pending", "paid"])
            .order("created_at", desc=True)
            .limit(500)
        )
        if amount_exact is not None:
            # payment_lines.amount là bigint → cast int để tránh postgrest gửi
            # "10080000.0" (postgrest err 22P02 invalid bigint syntax).
            lines_query = lines_query.eq("amount", int(amount_exact))
        lines_res = lines_query.execute()
        lines = lines_res.data or []

        # Lookup PR info (payment_request_id là text, không phải FK → query riêng)
        pr_ids = list({l.get("payment_request_id") for l in lines if l.get("payment_request_id")})
        pr_info: dict[str, dict] = {}
        if pr_ids:
            try:
                pr_res = (
                    sb.table("payment_requests")
                    .select("id, name, uid, phone, child_name, sale_email, state")
                    .in_("id", pr_ids)
                    .execute()
                )
                pr_info = {p["id"]: p for p in (pr_res.data or [])}
            except Exception as exc:
                print(f"[sepay] pr lookup with state failed, fallback: {exc}")
                try:
                    pr_res_fallback = (
                        sb.table("payment_requests")
                        .select("id, name, uid, phone, child_name, sale_email")
                        .in_("id", pr_ids)
                        .execute()
                    )
                    pr_info = {p["id"]: p for p in (pr_res_fallback.data or [])}
                except Exception as exc_fallback:
                    print(f"[sepay] pr fallback lookup failed: {exc_fallback}")

        # T1 — lần TT đã ghép với bank_transaction KHÁC (đã "tiêu thụ") → loại.
        # Mirror gateway_match_candidates used_line_ids (gateway_routes.py ~388).
        used_line_ids: set[str] = set()
        try:
            used_res = (
                sb.table("bank_transactions")
                .select("payment_line_id, txn_id, match_status")
                .in_("match_status", ["manual_matched", "auto_matched"])
                .execute()
            )
            used_line_ids = {
                str(r.get("payment_line_id"))
                for r in (used_res.data or [])
                if r.get("payment_line_id") and str(r.get("txn_id")) != str(txn_id)
            }
        except Exception as exc:
            print(f"[sepay] used-line anti-join failed (fail-open): {exc}")

        def _line_is_dead(line: dict) -> bool:
            if str(line.get("id")) in used_line_ids:
                return True                                   # T1
            pr_row = pr_info.get(line.get("payment_request_id", ""), {})
            if _clean_text(pr_row.get("state")).lower() == "cancelled":
                return True                                   # T2
            return False

        lines = [l for l in lines if not _line_is_dead(l)]

        sale_name_map: dict[str, str] = {}
        try:
            from payment_request_routes import _sale_name_map

            sale_name_map = _sale_name_map(sb)
        except Exception as exc:
            print(f"[sepay] sale name lookup failed: {exc}")

        sale_emails = sorted({
            _clean_text(pr.get("sale_email")).lower()
            for pr in pr_info.values()
            if _clean_text(pr.get("sale_email"))
        })
        team_by_email: dict[str, str] = {}
        if sale_emails:
            try:
                ns_res = (
                    sb.table("nhan_su_sale")
                    .select("email, team, sub_team")
                    .in_("email", sale_emails)
                    .execute()
                )
                team_by_email = {
                    _clean_text(row.get("email")).lower(): _clean_text(row.get("team") or row.get("sub_team"))
                    for row in (ns_res.data or [])
                    if _clean_text(row.get("email"))
                }
            except Exception as exc:
                print(f"[sepay] team lookup failed: {exc}")

        candidates = []
        for line in lines:
            pr_id = line.get("payment_request_id", "")
            pr = pr_info.get(pr_id, {})
            sale_email = _clean_text(pr.get("sale_email")).lower()
            candidates.append({
                "payment_line_id": line["id"],
                "pr_id": pr_id,
                "pr_name": pr.get("name", ""),
                "pr_uid": pr.get("uid", ""),
                "pr_phone": pr.get("phone", ""),
                "child_name": line.get("student_name") or pr.get("child_name") or "",
                "sale_name": sale_name_map.get(sale_email, sale_email),
                "team_name": team_by_email.get(sale_email, ""),
                "amount": _parse_amount(line.get("amount", 0)),
                "created_at": line.get("created_at"),
                "method": line.get("method", ""),
                "status": line.get("status", ""),
                "transfer_code": line.get("transfer_code", ""),
                "bill_images": (
                    line.get("bill_images") if isinstance(line.get("bill_images"), list) else []
                ) + ([line["bill_image"]] if line.get("bill_image") and line["bill_image"] not in (line.get("bill_images") or []) else []),
                "has_bill": bool(line.get("bill_images") or line.get("bill_image")),
            })

        # Scoring: parse NDCK (txn.content) → chấm điểm mỗi candidate
        txn_content = txn.get("content", "") or txn.get("transfer_content", "") or ""
        for c in candidates:
            sc, sigs = _score_candidate(txn_content, c, txn_amount)
            c["score"] = sc
            c["match_signals"] = sigs

        # Sort: score DESC trước (khớp NDCK nhiều nhất lên đầu), amount proximity ASC sau
        candidates.sort(
            key=lambda c: (-c["score"], abs(c["amount"] - txn_amount) if txn_amount > 0 else 0)
        )

        return candidates

    # Register router
    app.include_router(router)
