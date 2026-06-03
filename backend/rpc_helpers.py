"""Thin helpers for Supabase RPC calls (DB audit 2026-06-03)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException

MIGRATION_HINT = (
    "Chạy docs/supabase_schema_patch_db_audit_20260603.sql trên Supabase "
    "rồi NOTIFY pgrst, 'reload schema';"
)


def rpc_first_row(sb, fn: str, params: dict[str, Any] | None = None) -> Any:
    try:
        res = sb.rpc(fn, params or {}).execute()
    except Exception as exc:
        msg = str(exc).lower()
        if "could not find the function" in msg or fn.lower() in msg:
            raise HTTPException(503, MIGRATION_HINT) from exc
        raise
    data = res.data
    if isinstance(data, list):
        return data[0] if data else None
    return data


def rpc_next_ma_don(sb) -> str:
    row = rpc_first_row(sb, "next_ma_don")
    if isinstance(row, str):
        return row
    if isinstance(row, dict):
        return str(row.get("next_ma_don") or row.get("ma_don") or "")
    return str(row or "")


def rpc_next_payment_request_id(sb, year: int | None = None) -> str:
    params: dict[str, Any] = {}
    if year is not None:
        params["p_year"] = year
    row = rpc_first_row(sb, "next_payment_request_id", params)
    if isinstance(row, str):
        return row
    if isinstance(row, dict):
        return str(
            row.get("next_payment_request_id")
            or row.get("pr_id")
            or row.get("id")
            or ""
        )
    return str(row or "")


def _raise_ar_rpc_error(exc: Exception, fn: str) -> None:
    msg = str(exc).lower()
    if "active_request_not_found" in msg:
        raise HTTPException(404, "Active Request không tồn tại") from exc
    if "course_code_not_found" in msg:
        raise HTTPException(404, "Không tìm thấy course code") from exc
    if "course_already_invoiced" in msg:
        raise HTTPException(400, "Course đã xuất hoá đơn") from exc
    if "course_not_invoiced" in msg:
        raise HTTPException(400, "Course chưa xuất hoá đơn") from exc
    if "could not find the function" in msg or fn.lower() in msg:
        raise HTTPException(503, MIGRATION_HINT) from exc


def rpc_active_request_row(
    sb, fn: str, params: dict[str, Any] | None = None
) -> dict[str, Any]:
    try:
        row = rpc_first_row(sb, fn, params)
    except HTTPException:
        raise
    except Exception as exc:
        _raise_ar_rpc_error(exc, fn)
        raise HTTPException(500, f"RPC {fn} lỗi: {exc}") from exc
    if isinstance(row, dict) and row.get("id"):
        return row
    raise HTTPException(500, f"RPC {fn} không trả active_requests")


def rpc_allocate_tax_sequences(sb, n: int, date_key: str) -> tuple[int, int]:
    row = rpc_first_row(
        sb,
        "allocate_tax_sequences",
        {"p_date_key": date_key, "p_n": n},
    )
    if not isinstance(row, dict):
        raise HTTPException(503, f"{MIGRATION_HINT} (allocate_tax_sequences)")
    return int(row.get("inv_start") or 0), int(row.get("prod_start") or 0)
