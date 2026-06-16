"""Import & reconciliation parsers for mPOS / Payoo gateway exports.

Legacy routes under /api/v1/mpos are kept for manual parser checks. The primary
extension ingest contract is implemented in gateway_routes.py.
"""

from __future__ import annotations

import io
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd
from fastapi import APIRouter, File, Header, HTTPException, UploadFile

from admin_routes import require_module_write
from rbac import resolve_actor

router = APIRouter(prefix="/api/v1/mpos", tags=["mpos-reconciliation"])

COLLECTOR_MAP: dict[str, str] = {
    "palfish02": "HCM",
    "palfish3": "HN",
}

MPOS_STATUS_REVERSED = "Đảo"

DETAIL_ALIASES = {
    "paid_at": ("Ngày khởi tạo", "Thời gian"),
    "txn_code": ("Số giao dịch", "Mã tham chiếu (Ref No.)"),
    "detail": ("Chi tiết giao dịch",),
    "status": ("Trạng thái giao dịch",),
    "amount": ("Số tiền",),
    "fee": ("Phí giao dịch",),
    "net_amount": ("Số tiền thực nhận", "Số tiền được nhận"),
    "cardholder_name": ("Tên chủ thẻ",),
    "card_masked": ("Số thẻ",),
    "card_type": ("Loại thẻ",),
    "collector": ("TK thanh toán",),
    "settlement_code": ("Mã phiếu chi", "Mã chuẩn chi"),
    "installment_term": ("Kỳ hạn",),
    "installment_fee": ("Phí trả góp",),
    "bank": ("NH Hỗ trợ", "Ngân hàng"),
    "store_name": ("Tên cửa hàng", "Business name"),
}

SETTLEMENT_ALIASES = {
    "settlement_code": ("Mã phiếu chi",),
    "created_date": ("Ngày khởi tạo", "Thời gian"),
    "gross": ("Số tiền",),
    "fee": ("Phí giao dịch",),
    "installment_fee": ("Phí trả góp",),
    "transfer_fee": ("Phí chuyển tiền",),
    "net": ("Số tiền thực nhận", "Số tiền được nhận"),
    "bank": ("Ngân hàng",),
    "branch": ("Chi nhánh",),
    "account": ("Số tài khoản",),
    "store_name": ("Tên cửa hàng",),
}

PAYOO_ONLINE_ALIASES = {
    "txn_code": ("Mã đơn hàng",),
    "payment_code": ("Mã thanh toán",),
    "settlement_code": ("Mã chuẩn chi",),
    "paid_at": ("Ngày thanh toán",),
    "amount": ("Số tiền",),
    "fee": ("Phí thanh toán",),
    "net_amount": ("Số tiền sau phí",),
    "cardholder_name": ("Tên chủ thẻ",),
    "card_masked": ("Số thẻ",),
    "card_type": ("Hình thức phát hành thẻ", "Nguồn tiền"),
    "method": ("Hình thức thanh toán",),
    "store_name": ("Tên cửa hàng",),
}

PAYOO_INSTALLMENT_ALIASES = {
    "txn_code": ("Mã ĐH/GD trả góp",),
    "settlement_code": ("Mã chuẩn chi",),
    "paid_at": ("Ngày cập nhật", "Ngày tạo giao dịch"),
    "amount": ("Số tiền",),
    "installment_amount": ("Số tiền trả góp",),
    "fee": ("Phí thanh toán thẻ", "Phí dịch vụ thu KH"),
    "installment_fee": ("Phí trả góp",),
    "net_amount": ("Số tiền sau phí",),
    "installment_term": ("Kỳ hạn",),
    "cardholder_name": ("Tên chủ thẻ",),
    "card_masked": ("Số thẻ",),
    "card_type": ("Loại thẻ",),
    "bank": ("Ngân hàng",),
    "store_name": ("Tên cửa hàng",),
}


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def _fold_text(value: Any) -> str:
    text = _clean_text(value).lower().replace("đ", "d").replace("Đ", "d")
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


def _parse_amount(value: Any) -> float:
    text = _clean_text(value)
    if not text:
        return 0.0
    text = text.replace("\u00a0", "").replace(" ", "")
    if "," in text and "." in text:
        text = text.replace(",", "")
    elif "," in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", "")
    text = re.sub(r"[^0-9.\-]", "", text)
    if text in ("", "-", ".", "-."):
        return 0.0
    try:
        return float(text)
    except (TypeError, ValueError):
        return 0.0


def _parse_int(value: Any) -> int | None:
    amount = _parse_amount(value)
    return int(amount) if amount > 0 else None


def _parse_datetime(value: Any) -> str | None:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    if isinstance(value, datetime):
        dt = value
    else:
        text = _clean_text(value)
        if not text:
            return None
        dt = pd.to_datetime(text, dayfirst=True, errors="coerce")
        if pd.isna(dt):
            return text
        dt = dt.to_pydatetime()
    return dt.isoformat()


def _date_only(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    return parsed[:10] if parsed else None


def _row_raw(row: pd.Series) -> dict[str, Any]:
    raw: dict[str, Any] = {}
    for key, value in row.to_dict().items():
        if value is None:
            raw[str(key)] = None
            continue
        try:
            if pd.isna(value):
                raw[str(key)] = None
                continue
        except Exception:
            pass
        raw[str(key)] = value.isoformat() if isinstance(value, datetime) else _clean_text(value)
    return raw


def _first(row: pd.Series, aliases: dict[str, tuple[str, ...]], field: str) -> Any:
    for col in aliases[field]:
        if col in row.index:
            return row.get(col)
    return None


def _require_columns(df: pd.DataFrame, aliases: dict[str, tuple[str, ...]], fields: tuple[str, ...]) -> None:
    missing = [field for field in fields if not any(col in df.columns for col in aliases[field])]
    if missing:
        pretty = ", ".join(f"{field} ({'/'.join(aliases[field])})" for field in missing)
        raise ValueError(f"Thiếu cột bắt buộc: {pretty}")


def _read_excel(file_bytes: bytes, *, header: int = 0, prefer_xlsx: bool = False) -> pd.DataFrame:
    engine = "openpyxl" if prefer_xlsx or file_bytes[:2] == b"PK" else "xlrd"
    try:
        return pd.read_excel(io.BytesIO(file_bytes), engine=engine, header=header, dtype=object)
    except ImportError as exc:
        raise RuntimeError(f"Thiếu thư viện {engine}; cài backend requirements rồi chạy lại") from exc


def _read_csv(file_bytes: bytes) -> pd.DataFrame:
    for encoding in ("utf-8-sig", "utf-8", "cp1258"):
        try:
            return pd.read_csv(io.BytesIO(file_bytes), dtype=str, encoding=encoding)
        except UnicodeDecodeError:
            continue
    return pd.read_csv(io.BytesIO(file_bytes), dtype=str)


def _extract_mpl_code(detail: str) -> str:
    match = re.search(r"(MPL_\w+)", detail)
    return match.group(1) if match else ""


def _collector_region(collector: str) -> str | None:
    return COLLECTOR_MAP.get(collector.strip().lower()) if collector else None


def _is_reversed(status: str) -> bool:
    return "dao" in _fold_text(status)


def _is_settled(status: str) -> bool:
    if not status:
        return True
    return "ket toan" in _fold_text(status) or not _is_reversed(status)


def _record_match_status(status: str) -> str:
    return "ignored" if _is_reversed(status) else "pending"


def _mpos_transaction_from_row(row: pd.Series, idx: int) -> dict[str, Any]:
    detail = _clean_text(_first(row, DETAIL_ALIASES, "detail"))
    txn_code = _clean_text(_first(row, DETAIL_ALIASES, "txn_code")) or _extract_mpl_code(detail)
    if not txn_code:
        txn_code = detail
    status = _clean_text(_first(row, DETAIL_ALIASES, "status"))
    amount = _parse_amount(_first(row, DETAIL_ALIASES, "amount"))
    fee = _parse_amount(_first(row, DETAIL_ALIASES, "fee"))
    explicit_net = _parse_amount(_first(row, DETAIL_ALIASES, "net_amount"))
    installment_fee = _parse_amount(_first(row, DETAIL_ALIASES, "installment_fee"))
    collector = _clean_text(_first(row, DETAIL_ALIASES, "collector"))
    term = _parse_int(_first(row, DETAIL_ALIASES, "installment_term"))
    is_installment = bool(term or installment_fee > 0)
    category = "Trả góp" if is_installment else "Quẹt thẻ"
    net_amount = explicit_net if explicit_net else amount - fee - installment_fee
    return {
        "row_index": int(idx),
        "source": "mpos",
        "category": category,
        "txn_code": txn_code,
        "settlement_code": _clean_text(_first(row, DETAIL_ALIASES, "settlement_code")) or None,
        "paid_at": _parse_datetime(_first(row, DETAIL_ALIASES, "paid_at")),
        "status": status,
        "amount": amount,
        "fee": fee,
        "net_amount": net_amount,
        "cardholder_name": _clean_text(_first(row, DETAIL_ALIASES, "cardholder_name")),
        "card_masked": _clean_text(_first(row, DETAIL_ALIASES, "card_masked")),
        "card_type": _clean_text(_first(row, DETAIL_ALIASES, "card_type")),
        "collector": collector,
        "collector_region": _collector_region(collector),
        "bank": _clean_text(_first(row, DETAIL_ALIASES, "bank")) or None,
        "installment_term": term,
        "installment_fee": installment_fee if installment_fee else None,
        "is_installment": is_installment,
        "installment_months": term,
        "mpl_code": _extract_mpl_code(detail),
        "detail": detail,
        "match_status": _record_match_status(status),
        "payment_line_id": None,
        "raw": _row_raw(row),
    }


def _check_ambiguous_matches(transactions: list[dict[str, Any]], warnings: list[str]) -> None:
    groups: dict[tuple[float, str], list[dict[str, Any]]] = {}
    for txn in transactions:
        minute_key = str(txn.get("paid_at") or "")[:16]
        groups.setdefault((float(txn.get("amount") or 0), minute_key), []).append(txn)
    for (amount, minute), group in groups.items():
        if minute and amount and len(group) >= 2:
            for txn in group:
                txn["match_status"] = "needs_review"
            warnings.append(
                f"AMBIGUOUS: {len(group)} GD trùng mệnh giá {amount:,.0f} VND tại phút {minute}"
            )


def parse_mpos_transactions(file_bytes: bytes) -> dict[str, Any]:
    """Parse mPOS transaction/detail export into gateway transaction rows."""
    df = _read_excel(file_bytes, header=0, prefer_xlsx=file_bytes[:2] == b"PK")
    _require_columns(df, DETAIL_ALIASES, ("paid_at", "txn_code", "status", "amount", "collector"))

    transactions: list[dict[str, Any]] = []
    reversed_txns: list[dict[str, Any]] = []
    installments: list[dict[str, Any]] = []
    warnings: list[str] = []
    skipped = 0

    for idx, row in df.iterrows():
        record = _mpos_transaction_from_row(row, int(idx))
        if not record["txn_code"]:
            skipped += 1
            continue
        if _is_reversed(record["status"]):
            reversed_txns.append(record)
        elif _is_settled(record["status"]):
            transactions.append(record)
        if record["is_installment"]:
            installments.append(record)

    contra_entries: list[dict[str, Any]] = []
    for rev in reversed_txns:
        contra = {
            **rev,
            "txn_code": f"{rev['txn_code']}-REV",
            "amount": -abs(float(rev.get("amount") or 0)),
            "net_amount": -abs(float(rev.get("net_amount") or 0)),
            "match_status": "ignored",
            "parent_txn_code": rev["txn_code"],
            "note": f"Contra-entry cho GD Đảo row {rev['row_index']}",
        }
        contra_entries.append(contra)

    _check_ambiguous_matches(transactions, warnings)

    collectors: dict[str, dict[str, Any]] = {}
    for rec in transactions + reversed_txns:
        collector = rec.get("collector") or ""
        if not collector:
            continue
        bucket = collectors.setdefault(
            collector,
            {"count": 0, "label": rec.get("collector_region") or collector},
        )
        bucket["count"] += 1

    return {
        "transactions": transactions,
        "reversed": reversed_txns,
        "contra_entries": contra_entries,
        "installments": installments,
        "warnings": warnings,
        "summary": {
            "total_rows": len(df),
            "skipped_rows": skipped,
            "settled_count": len(transactions),
            "reversed_count": len(reversed_txns),
            "installment_count": len(installments),
            "total_gross": sum(t["amount"] for t in transactions),
            "total_reversed": sum(abs(r["amount"]) for r in reversed_txns),
            "total_net": sum(t["net_amount"] for t in transactions),
            "collectors": collectors,
        },
    }


def parse_mpos_settlements(file_bytes: bytes) -> dict[str, Any]:
    """Parse mPOS settlement list export."""
    df = _read_excel(file_bytes, header=0)
    # "Danh sách phiếu chi" .xls: dòng 0 là tiêu đề, header thật ở dòng 1 → tự dò
    if not any(col in df.columns for col in SETTLEMENT_ALIASES["settlement_code"]):
        df = _read_excel(file_bytes, header=1)
    _require_columns(df, SETTLEMENT_ALIASES, ("created_date", "gross", "net"))

    settlements: list[dict[str, Any]] = []
    for idx, row in df.iterrows():
        code = _clean_text(_first(row, SETTLEMENT_ALIASES, "settlement_code"))
        created_date = _date_only(_first(row, SETTLEMENT_ALIASES, "created_date"))
        if not code:
            raw_time = _clean_text(_first(row, SETTLEMENT_ALIASES, "created_date"))
            code = f"MPOS-SETTLE-{raw_time or created_date or idx}-{idx + 1}".replace(" ", "-")
        fee = _parse_amount(_first(row, SETTLEMENT_ALIASES, "fee"))
        fee += _parse_amount(_first(row, SETTLEMENT_ALIASES, "installment_fee"))
        fee += _parse_amount(_first(row, SETTLEMENT_ALIASES, "transfer_fee"))
        settlement = {
            "row_index": int(idx),
            "source": "mpos",
            "settlement_code": code,
            "settle_date": created_date,
            "created_date": created_date,
            "gross_amount": _parse_amount(_first(row, SETTLEMENT_ALIASES, "gross")),
            "gross": _parse_amount(_first(row, SETTLEMENT_ALIASES, "gross")),
            "fee": fee,
            "net_amount": _parse_amount(_first(row, SETTLEMENT_ALIASES, "net")),
            "net": _parse_amount(_first(row, SETTLEMENT_ALIASES, "net")),
            "bank": _clean_text(_first(row, SETTLEMENT_ALIASES, "bank")) or None,
            "branch": _clean_text(_first(row, SETTLEMENT_ALIASES, "branch")) or None,
            "account": _clean_text(_first(row, SETTLEMENT_ALIASES, "account")) or None,
            "raw": _row_raw(row),
        }
        settlements.append(settlement)

    daily_batches: dict[str, dict[str, Any]] = {}
    for settlement in settlements:
        date_key = settlement.get("settle_date") or "unknown"
        batch = daily_batches.setdefault(
            date_key,
            {"date": date_key, "total_gross": 0, "total_fee": 0, "total_net": 0, "count": 0, "rows": []},
        )
        batch["total_gross"] += settlement["gross"]
        batch["total_fee"] += settlement["fee"]
        batch["total_net"] += settlement["net"]
        batch["count"] += 1
        batch["rows"].append(settlement["row_index"])

    return {
        "settlements": settlements,
        "daily_batches": list(daily_batches.values()),
        "summary": {
            "total_rows": len(settlements),
            "total_gross": sum(s["gross"] for s in settlements),
            "total_fee": sum(s["fee"] for s in settlements),
            "total_net": sum(s["net"] for s in settlements),
            "batch_count": len(daily_batches),
        },
    }


def _payoo_row(row: pd.Series, idx: int, aliases: dict[str, tuple[str, ...]], category: str) -> dict[str, Any]:
    amount = _parse_amount(_first(row, aliases, "amount"))
    fee = _parse_amount(_first(row, aliases, "fee"))
    installment_fee = _parse_amount(_first(row, aliases, "installment_fee")) if "installment_fee" in aliases else 0
    net = _parse_amount(_first(row, aliases, "net_amount"))
    return {
        "row_index": int(idx),
        "source": "payoo",
        "category": category,
        "txn_code": _clean_text(_first(row, aliases, "txn_code")),
        "settlement_code": _clean_text(_first(row, aliases, "settlement_code")) or None,
        "paid_at": _parse_datetime(_first(row, aliases, "paid_at")),
        "amount": amount,
        "fee": fee + installment_fee,
        "net_amount": net if net else amount - fee - installment_fee,
        "cardholder_name": _clean_text(_first(row, aliases, "cardholder_name")),
        "card_masked": _clean_text(_first(row, aliases, "card_masked")),
        "card_type": _clean_text(_first(row, aliases, "card_type")),
        "installment_term": _parse_int(_first(row, aliases, "installment_term")) if "installment_term" in aliases else None,
        "bank": _clean_text(_first(row, aliases, "bank")) if "bank" in aliases else None,
        "collector_region": None,
        "match_status": "pending",
        "payment_line_id": None,
        "raw": _row_raw(row),
    }


def parse_payoo_online(file_bytes: bytes) -> dict[str, Any]:
    df = _read_csv(file_bytes)
    _require_columns(df, PAYOO_ONLINE_ALIASES, ("txn_code", "paid_at", "amount"))
    txns = [
        _payoo_row(row, int(idx), PAYOO_ONLINE_ALIASES, "Trực tuyến")
        for idx, row in df.iterrows()
        if _clean_text(_first(row, PAYOO_ONLINE_ALIASES, "txn_code"))
    ]
    return {"transactions": txns, "warnings": [], "summary": {"total_rows": len(df), "parsed_count": len(txns)}}


def parse_payoo_installment(file_bytes: bytes) -> dict[str, Any]:
    df = _read_csv(file_bytes)
    _require_columns(df, PAYOO_INSTALLMENT_ALIASES, ("txn_code", "paid_at", "amount"))
    txns = [
        _payoo_row(row, int(idx), PAYOO_INSTALLMENT_ALIASES, "Trả góp")
        for idx, row in df.iterrows()
        if _clean_text(_first(row, PAYOO_INSTALLMENT_ALIASES, "txn_code"))
    ]
    return {"transactions": txns, "warnings": [], "summary": {"total_rows": len(df), "parsed_count": len(txns)}}


def parse_payoo_orders(orders: list[dict[str, Any]]) -> dict[str, Any]:
    """Parse Payoo JSON OrderList[] (extension auto-fetch GET /api/ecom/order/).

    Khác parser CSV: nhận thẳng mảng dict JSON từ Payoo, map theo field thật
    (OrderNo, MoneyAmount, PurchaseDate...). Xem handoff §4.4.
    """
    txns: list[dict[str, Any]] = []
    for idx, order in enumerate(orders or []):
        if not isinstance(order, dict):
            continue
        txn_code = _clean_text(order.get("OrderNo"))
        if not txn_code:
            continue
        installment_bank = _clean_text(order.get("InstallmentBankName"))
        term = _parse_int(order.get("InstallmentPeriod"))
        is_installment = bool(installment_bank or term)
        amount = _parse_amount(order.get("MoneyAmount"))
        fee = _parse_amount(order.get("TransactionFeeEcomer"))
        net = _parse_amount(order.get("MoneyAmountAfterFee"))
        txns.append(
            {
                "row_index": int(idx),
                "source": "payoo",
                "category": "Trả góp" if is_installment else "Trực tuyến",
                "txn_code": txn_code,
                "settlement_code": _clean_text(order.get("BillingCode")) or None,
                "paid_at": _parse_datetime(order.get("PurchaseDate")),
                "amount": amount,
                "fee": fee,
                "net_amount": net if net else amount - fee,
                # PaymentCustomerName = tên người quẹt (không che) — chỉ hiển thị tham khảo,
                # KHÔNG dùng làm khóa ghép (sales đặt tên tự do; có thể là phụ huynh).
                "cardholder_name": _clean_text(order.get("PaymentCustomerName"))
                or _clean_text(order.get("BankCardHolderName")),
                "card_masked": _clean_text(order.get("CardNumber")),
                "card_type": _clean_text(order.get("CardIssuanceTypeName")),
                "installment_term": term,
                "bank": _clean_text(order.get("BankName")) or installment_bank or None,
                "collector_region": None,
                "match_status": "pending",
                "payment_line_id": None,
                "raw": order,
            }
        )
    return {
        "transactions": txns,
        "warnings": [],
        "summary": {"total_rows": len(orders or []), "parsed_count": len(txns)},
    }


def register_mpos_routes(app, get_supabase: Callable) -> None:
    """Register legacy mPOS parse-only routes."""

    def _sb_or_503(get_sb):
        sb = get_sb()
        if not sb:
            raise HTTPException(503, "Database chưa cấu hình")
        return sb

    @router.post("/import-transactions")
    async def import_mpos_transactions(
        file: UploadFile = File(...),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")
        if not file.filename or not file.filename.endswith((".xls", ".xlsx")):
            raise HTTPException(400, "File phải có đuôi .xls hoặc .xlsx")
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "File rỗng")
        try:
            return parse_mpos_transactions(file_bytes)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Lỗi parse file: {exc}") from exc

    @router.post("/import-settlements")
    async def import_mpos_settlements(
        file: UploadFile = File(...),
        authorization: str | None = Header(None),
    ):
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")
        if not file.filename or not file.filename.endswith((".xls", ".xlsx")):
            raise HTTPException(400, "File phải có đuôi .xls hoặc .xlsx")
        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "File rỗng")
        try:
            return parse_mpos_settlements(file_bytes)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Lỗi parse file: {exc}") from exc

    app.include_router(router)
