"""Gateway reconciliation API for mPOS / Payoo card transactions."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Callable

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel

from admin_routes import require_module_access, require_module_write
from mpos_import import (
    parse_mpos_settlements,
    parse_mpos_transactions,
    parse_payoo_installment,
    parse_payoo_online,
    parse_payoo_orders,
)
from rbac import resolve_actor

VALID_SOURCES = {"mpos", "payoo"}
VALID_KINDS = {"detail", "settlement", "online", "installment"}
VALID_STATUSES = {"pending", "matched", "ignored", "needs_review"}


class GatewayMatchBody(BaseModel):
    payment_line_id: str


class GatewayStatusBody(BaseModel):
    match_status: str
    payment_line_id: str | None = None


class GatewayOrdersBody(BaseModel):
    orders: list[dict[str, Any]]


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _parse_amount(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _sb_or_503(get_supabase: Callable[[], Any]):
    sb = get_supabase()
    if not sb:
        raise HTTPException(503, "Database chua cau hinh")
    return sb


def _require_gateway_token(token: str | None) -> None:
    expected = os.getenv("GATEWAY_EXTENSION_INGEST_TOKEN", "").strip()
    if not expected:
        raise HTTPException(503, "GATEWAY_EXTENSION_INGEST_TOKEN chua cau hinh")
    if not token or token.strip() != expected:
        raise HTTPException(401, "Invalid gateway ingest token")


def _public_match_status(status: str) -> str:
    return "pending" if status == "needs_review" else (status or "pending")


def _format_dt(value: Any) -> str:
    text = _clean_text(value)
    if not text:
        return ""
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return text[:16]


def _to_dt(value: Any) -> datetime | None:
    text = _clean_text(value)
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None


def _day_diff(a: Any, b: Any) -> float:
    da, db = _to_dt(a), _to_dt(b)
    if not da or not db:
        return 1e6
    return abs((da - db).total_seconds()) / 86400.0


def _matched_label(line: dict[str, Any] | None, pr: dict[str, Any] | None) -> str | None:
    if not line or not pr:
        return None
    pr_id = _clean_text(pr.get("id") or line.get("payment_request_id"))
    name = _clean_text(pr.get("name") or pr.get("ten_khach"))
    idx = line.get("_attempt_idx") or line.get("idx") or ""
    parts = [part for part in (pr_id, name, f"lan TT {idx}" if idx else "") if part]
    return " · ".join(parts) if parts else None


def _serialize_gateway_txn(
    row: dict[str, Any],
    *,
    line: dict[str, Any] | None = None,
    pr: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": _clean_text(row.get("id")),
        "source": _clean_text(row.get("source")),
        "category": _clean_text(row.get("category")),
        "txn_code": _clean_text(row.get("txn_code")),
        "settlement_code": row.get("settlement_code"),
        "cardholder_name": _clean_text(row.get("cardholder_name")),
        "card_masked": _clean_text(row.get("card_masked")),
        "card_type": _clean_text(row.get("card_type")),
        "amount": _parse_amount(row.get("amount")),
        "fee": _parse_amount(row.get("fee")),
        "net_amount": _parse_amount(row.get("net_amount")),
        "installment_term": row.get("installment_term"),
        "bank": row.get("bank"),
        "collector_region": row.get("collector_region"),
        "paid_at": _format_dt(row.get("paid_at")),
        "match_status": _public_match_status(_clean_text(row.get("match_status"))),
        "payment_line_id": row.get("payment_line_id"),
        "matched_label": _matched_label(line, pr),
        "bill_url": ((line or {}).get("bill_image") if line else None),
    }


def _txn_insert_row(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": record.get("source"),
        "category": record.get("category"),
        "txn_code": record.get("txn_code"),
        "settlement_code": record.get("settlement_code"),
        "cardholder_name": record.get("cardholder_name") or "",
        "card_masked": record.get("card_masked") or "",
        "card_type": record.get("card_type") or "",
        "amount": record.get("amount") or 0,
        "fee": record.get("fee") or 0,
        "net_amount": record.get("net_amount") or 0,
        "installment_term": record.get("installment_term"),
        "bank": record.get("bank"),
        "collector_region": record.get("collector_region"),
        "paid_at": record.get("paid_at"),
        "match_status": record.get("match_status") or "pending",
        "raw": record.get("raw") or {},
    }


def _settlement_insert_row(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "source": record.get("source") or "mpos",
        "settlement_code": record.get("settlement_code"),
        "created_date": record.get("created_date") or record.get("settle_date"),
        "gross": record.get("gross") or record.get("gross_amount") or 0,
        "fee": record.get("fee") or 0,
        "net": record.get("net") or record.get("net_amount") or 0,
        "bank": record.get("bank"),
        "branch": record.get("branch"),
        "account": record.get("account"),
        "raw": record.get("raw") or {},
    }


def _parse_gateway_file(source: str, kind: str, file_bytes: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[str]]:
    if source == "mpos" and kind == "detail":
        result = parse_mpos_transactions(file_bytes)
        txns = result["transactions"] + result.get("contra_entries", [])
        return txns, [], result.get("warnings", [])
    if source == "mpos" and kind == "settlement":
        result = parse_mpos_settlements(file_bytes)
        return [], result["settlements"], []
    if source == "payoo" and kind == "online":
        result = parse_payoo_online(file_bytes)
        return result["transactions"], [], result.get("warnings", [])
    if source == "payoo" and kind == "installment":
        result = parse_payoo_installment(file_bytes)
        return result["transactions"], [], result.get("warnings", [])
    raise HTTPException(400, f"source/kind khong hop le: {source}/{kind}")


def _upsert_rows(sb, table: str, rows: list[dict[str, Any]], conflict: str) -> tuple[int, int]:
    if not rows:
        return 0, 0
    res = sb.table(table).upsert(rows, on_conflict=conflict, ignore_duplicates=True).execute()
    inserted = len(res.data or [])
    return inserted, max(len(rows) - inserted, 0)


def _load_lines_and_prs(sb, line_ids: list[str]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    if not line_ids:
        return {}, {}
    line_res = sb.table("payment_lines").select("*").in_("id", line_ids).execute()
    lines = {str(row.get("id")): row for row in (line_res.data or [])}
    pr_ids = sorted({_clean_text(row.get("payment_request_id")) for row in lines.values() if row.get("payment_request_id")})
    prs: dict[str, dict[str, Any]] = {}
    if pr_ids:
        pr_res = sb.table("payment_requests").select("*").in_("id", pr_ids).execute()
        prs = {str(row.get("id")): row for row in (pr_res.data or [])}
    return lines, prs


def register_gateway_routes(app, get_supabase: Callable[[], Any]) -> None:
    router = APIRouter(prefix="/api/v1", tags=["gateway-reconciliation"])

    @router.post("/gateway-sync/ingest")
    async def ingest_gateway_file(
        source: str = Query(...),
        kind: str = Query(...),
        file: UploadFile = File(...),
        x_gateway_ext_token: str | None = Header(None, alias="X-GATEWAY-EXT-TOKEN"),
    ):
        _require_gateway_token(x_gateway_ext_token)
        source = source.strip().lower()
        kind = kind.strip().lower()
        if source not in VALID_SOURCES or kind not in VALID_KINDS:
            raise HTTPException(400, "source/kind khong hop le")
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "File rong")

        sb = _sb_or_503(get_supabase)
        try:
            txns, settlements, warnings = _parse_gateway_file(source, kind, file_bytes)
            txn_rows = [_txn_insert_row(row) for row in txns if row.get("txn_code")]
            settlement_rows = [_settlement_insert_row(row) for row in settlements if row.get("settlement_code")]
            inserted_txns, skipped_txns = _upsert_rows(sb, "gateway_transactions", txn_rows, "txn_code")
            inserted_settles, skipped_settles = _upsert_rows(
                sb, "gateway_settlements", settlement_rows, "settlement_code"
            )
        except HTTPException:
            raise
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Loi ingest gateway: {exc}") from exc

        return {
            "total": len(txn_rows) + len(settlement_rows),
            "inserted": inserted_txns + inserted_settles,
            "skipped": skipped_txns + skipped_settles,
            "transactions": {"inserted": inserted_txns, "skipped": skipped_txns},
            "settlements": {"inserted": inserted_settles, "skipped": skipped_settles},
            "warnings": warnings,
            "last_sync_at": _iso_now(),
        }

    @router.post("/gateway-sync/ingest-orders")
    async def ingest_gateway_orders(
        body: GatewayOrdersBody,
        source: str = Query("payoo"),
        kind: str = Query("online"),
        x_gateway_ext_token: str | None = Header(None, alias="X-GATEWAY-EXT-TOKEN"),
    ):
        """Payoo auto-fetch: extension gọi GET /api/ecom/order/ rồi POST mảng OrderList (JSON) về đây."""
        _require_gateway_token(x_gateway_ext_token)
        source = source.strip().lower()
        if source != "payoo":
            raise HTTPException(400, "ingest-orders chi ho tro source=payoo (JSON OrderList)")
        sb = _sb_or_503(get_supabase)
        try:
            parsed = parse_payoo_orders(body.orders)
            txn_rows = [_txn_insert_row(row) for row in parsed["transactions"] if row.get("txn_code")]
            inserted, skipped = _upsert_rows(sb, "gateway_transactions", txn_rows, "txn_code")
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Loi ingest gateway orders: {exc}") from exc
        return {
            "total": len(txn_rows),
            "inserted": inserted,
            "skipped": skipped,
            "transactions": {"inserted": inserted, "skipped": skipped},
            "warnings": parsed.get("warnings", []),
            "last_sync_at": _iso_now(),
        }

    @router.get("/gateway-txns")
    def list_gateway_txns(
        source: str | None = Query(None),
        status: str | None = Query(None),
        q: str | None = Query(None),
        from_date: str | None = Query(None, alias="from"),
        to_date: str | None = Query(None, alias="to"),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "reconciliation")

        query = sb.table("gateway_transactions").select("*").order("paid_at", desc=True).limit(500)
        if source:
            query = query.eq("source", source.strip().lower())
        if status and status != "all":
            raw_status = "needs_review" if status == "needs_review" else status
            query = query.eq("match_status", raw_status)
        if from_date:
            query = query.gte("paid_at", f"{from_date[:10]}T00:00:00")
        if to_date:
            query = query.lte("paid_at", f"{to_date[:10]}T23:59:59")
        if q and q.strip():
            pattern = f"*{q.strip()}*"
            query = query.or_(
                ",".join(
                    f"{col}.ilike.{pattern}"
                    for col in ("txn_code", "settlement_code", "cardholder_name", "card_masked")
                )
            )
        rows = query.execute().data or []
        line_ids = [str(row.get("payment_line_id")) for row in rows if row.get("payment_line_id")]
        lines, prs = _load_lines_and_prs(sb, line_ids)
        return [
            _serialize_gateway_txn(
                row,
                line=lines.get(str(row.get("payment_line_id"))),
                pr=prs.get(str((lines.get(str(row.get("payment_line_id"))) or {}).get("payment_request_id"))),
            )
            for row in rows
        ]

    @router.get("/gateway-txns/{txn_id}/match-candidates")
    def gateway_match_candidates(
        txn_id: str,
        search: str | None = Query(None),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "reconciliation")
        txn_res = sb.table("gateway_transactions").select("*").eq("id", txn_id).limit(1).execute()
        if not txn_res.data:
            raise HTTPException(404, "Khong tim thay gateway transaction")
        txn = txn_res.data[0]
        amount = _parse_amount(txn.get("amount"))
        txn_paid = txn.get("paid_at")
        # Ghép theo SỐ TIỀN (khóa mạnh) — KHÔNG lọc theo status để không ẩn lần TT đã 'paid'
        # (giao dịch thẻ có thể ứng với lần TT đã xác nhận trong app).
        search_text = _clean_text(search)
        if search_text:
            pattern = f"*{search_text.replace(',', ' ').strip()}*"
            pr_res = (
                sb.table("payment_requests")
                .select("id")
                .or_(
                    ",".join(
                        f"{col}.ilike.{pattern}"
                        for col in ("id", "name", "child_name", "uid", "phone")
                    )
                )
                .limit(50)
                .execute()
            )
            pr_ids = [str(row.get("id")) for row in (pr_res.data or []) if row.get("id")]
            if not pr_ids:
                return []
            line_res = sb.table("payment_lines").select("*").in_("payment_request_id", pr_ids).limit(100).execute()
            lines = line_res.data or []
        else:
            # payment_lines.amount là bigint → cast int để tránh postgrest gửi "10080000.0" (22P02).
            amount_int = int(amount) if amount else 0
            line_res = sb.table("payment_lines").select("*").eq("amount", amount_int).limit(100).execute()
            lines = line_res.data or []
        # Bỏ lần TT đã ghép với giao dịch gateway KHÁC (tránh ghép trùng).
        matched_res = (
            sb.table("gateway_transactions")
            .select("payment_line_id, id")
            .eq("match_status", "matched")
            .execute()
        )
        used_line_ids = {
            str(row.get("payment_line_id"))
            for row in (matched_res.data or [])
            if row.get("payment_line_id") and str(row.get("id")) != str(txn_id)
        }
        lines = [ln for ln in lines if str(ln.get("id")) not in used_line_ids]
        # Xếp theo độ gần ngày (gần nhất trước), rồi theo created_at.
        lines.sort(key=lambda ln: (_day_diff(txn_paid, ln.get("created_at")), str(ln.get("created_at") or "")))
        lines = lines[:50]
        pr_ids = sorted({_clean_text(line.get("payment_request_id")) for line in lines if line.get("payment_request_id")})
        prs: dict[str, dict[str, Any]] = {}
        if pr_ids:
            pr_res = sb.table("payment_requests").select("*").in_("id", pr_ids).execute()
            prs = {str(row.get("id")): row for row in (pr_res.data or [])}
        candidates: list[dict[str, Any]] = []
        for idx, line in enumerate(lines, start=1):
            pr = prs.get(str(line.get("payment_request_id"))) or {}
            bill_images = line.get("bill_images") if isinstance(line.get("bill_images"), list) else []
            if line.get("bill_image") and line.get("bill_image") not in bill_images:
                bill_images = [*bill_images, line.get("bill_image")]
            candidates.append(
                {
                    "payment_line_id": str(line.get("id") or ""),
                    "pr_id": str(line.get("payment_request_id") or ""),
                    "pr_name": _clean_text(pr.get("name") or pr.get("ten_khach")),
                    "attempt_idx": idx,
                    "amount": _parse_amount(line.get("amount")),
                    "created_at": _format_dt(line.get("created_at")),
                    "uid": _clean_text(pr.get("uid") or pr.get("uid_khach_hang")),
                    "has_bill": bool(bill_images),
                    "bill_images": bill_images,
                }
            )
        return candidates

    @router.patch("/gateway-txns/{txn_id}/match")
    def match_gateway_txn(txn_id: str, body: GatewayMatchBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")
        line_id = body.payment_line_id.strip()
        if not line_id:
            raise HTTPException(400, "payment_line_id bat buoc")
        line_res = sb.table("payment_lines").select("*").eq("id", line_id).limit(1).execute()
        if not line_res.data:
            raise HTTPException(404, "Khong tim thay payment_line")
        now_iso = _iso_now()
        res = (
            sb.table("gateway_transactions")
            .update(
                {
                    "match_status": "matched",
                    "payment_line_id": line_id,
                    "matched_by": actor.email,
                    "matched_at": now_iso,
                }
            )
            .eq("id", txn_id)
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Khong tim thay gateway transaction")
        pr_id = _clean_text(line_res.data[0].get("payment_request_id"))
        pr = {}
        if pr_id:
            pr_res = sb.table("payment_requests").select("*").eq("id", pr_id).limit(1).execute()
            pr = (pr_res.data or [{}])[0]
        return _serialize_gateway_txn(res.data[0], line=line_res.data[0], pr=pr)

    @router.patch("/gateway-txns/{txn_id}/status")
    def patch_gateway_status(txn_id: str, body: GatewayStatusBody, authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")
        status = body.match_status.strip().lower()
        if status not in VALID_STATUSES:
            raise HTTPException(400, "match_status khong hop le")
        if status == "matched":
            if not body.payment_line_id:
                raise HTTPException(400, "matched can payment_line_id")
            return match_gateway_txn(txn_id, GatewayMatchBody(payment_line_id=body.payment_line_id), authorization)
        patch = {
            "match_status": status,
            "payment_line_id": None,
            "matched_by": None,
            "matched_at": None,
        }
        res = sb.table("gateway_transactions").update(patch).eq("id", txn_id).execute()
        if not res.data:
            raise HTTPException(404, "Khong tim thay gateway transaction")
        return _serialize_gateway_txn(res.data[0])

    @router.get("/gateway-sync/status")
    def gateway_sync_status(authorization: str | None = Header(None)):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "reconciliation")
        res = (
            sb.table("gateway_transactions")
            .select("source, match_status, imported_at")
            .order("imported_at", desc=True)
            .limit(1000)
            .execute()
        )
        rows = res.data or []
        counts: dict[str, dict[str, int]] = {}
        for row in rows:
            source = _clean_text(row.get("source")) or "unknown"
            status = _clean_text(row.get("match_status")) or "pending"
            counts.setdefault(source, {}).setdefault(status, 0)
            counts[source][status] += 1
        last_sync_at = rows[0].get("imported_at") if rows else None
        return {"last_sync_at": last_sync_at, "ext_connected": bool(last_sync_at), "counts": counts}

    app.include_router(router)
