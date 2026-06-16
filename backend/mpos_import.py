"""Import & Đối soát file mPOS (transaction.xls + settlement.xls).

Spec: docs/sepay_integration_spec_v1.md
Chuẩn: Financial Data Integrity — Audit Trail

Chạy: cd backend && python mpos_import.py --help
API:  POST /api/v1/mpos/import-transactions  (upload file)
      POST /api/v1/mpos/import-settlements   (upload file)
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

import pandas as pd
from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel

from rbac import resolve_actor
from admin_routes import require_module_write

router = APIRouter(prefix="/api/v1/mpos", tags=["mpos-reconciliation"])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Mapping TK thanh toán → Team / Điểm thu
COLLECTOR_MAP: dict[str, str] = {
    "palfish02": "Team HCM / Điểm thu 02",
    "palfish3": "Team HN / Điểm thu 03",
    # Thêm mapping mới khi mPOS portal có thêm TK
}

# Trạng thái giao dịch mPOS
MPOS_STATUS_SETTLED = "Kết toán"
MPOS_STATUS_REVERSED = "Đảo"

# Cột cần thiết trong transaction.xls
TXN_REQUIRED_COLS = [
    "Thời gian",
    "Chi tiết giao dịch",
    "Trạng thái giao dịch",
    "Số tiền",
    "TK thanh toán",
]

# Cột cần thiết trong settlement.xls
SETTLE_REQUIRED_COLS = [
    "Thời gian",
    "Số tiền",
    "Phí giao dịch",
    "Số tiền được nhận",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_text(v: Any) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def _parse_amount(v: Any) -> float:
    if v is None:
        return 0.0
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _extract_mpl_code(detail: str) -> str:
    """Trích xuất mã MPL_... từ cột Chi tiết giao dịch."""
    match = re.search(r"(MPL_\w+)", str(detail))
    return match.group(1) if match else ""


def _is_installment(row: dict[str, Any]) -> bool:
    """Nhận diện GD trả góp: Kỳ hạn hoặc Phí trả góp có giá trị."""
    ky_han = row.get("Kỳ hạn")
    phi_tra_gop = row.get("Phí trả góp")
    return (ky_han is not None and not pd.isna(ky_han)) or (
        phi_tra_gop is not None and not pd.isna(phi_tra_gop) and float(phi_tra_gop) > 0
    )


# ---------------------------------------------------------------------------
# Core: Parse transaction.xls
# ---------------------------------------------------------------------------
def parse_mpos_transactions(file_bytes: bytes) -> dict[str, Any]:
    """Parse file transaction.xls từ mPOS portal.

    Returns:
        {
            "transactions": [...],
            "reversed": [...],
            "installments": [...],
            "summary": {...},
            "warnings": [...],
        }
    """
    df = pd.read_excel(io.BytesIO(file_bytes), engine="xlrd")

    # Validate required columns
    missing_cols = [c for c in TXN_REQUIRED_COLS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Thiếu cột bắt buộc: {', '.join(missing_cols)}")

    transactions: list[dict[str, Any]] = []
    reversed_txns: list[dict[str, Any]] = []
    installments: list[dict[str, Any]] = []
    warnings: list[str] = []

    for idx, row in df.iterrows():
        txn_time = row.get("Thời gian")
        detail = _clean_text(row.get("Chi tiết giao dịch"))
        status = _clean_text(row.get("Trạng thái giao dịch"))
        amount = _parse_amount(row.get("Số tiền"))
        fee = _parse_amount(row.get("Phí giao dịch"))
        collector = _clean_text(row.get("TK thanh toán"))
        card_holder = _clean_text(row.get("Tên chủ thẻ"))
        card_number = _clean_text(row.get("Số thẻ"))
        ref_no = _clean_text(row.get("Mã tham chiếu (Ref No.)"))
        mpl_code = _extract_mpl_code(detail)

        record = {
            "row_index": int(idx),
            "txn_time": str(txn_time) if txn_time is not None else None,
            "detail": detail,
            "mpl_code": mpl_code,
            "status": status,
            "amount": amount,
            "fee": fee,
            "net_amount": amount - fee,
            "card_holder": card_holder,
            "card_number": card_number,
            "ref_no": ref_no,
            "collector": collector,
            "collector_label": COLLECTOR_MAP.get(collector, collector),
            "is_installment": _is_installment(row.to_dict()),
            "installment_months": _parse_amount(row.get("Kỳ hạn")) if not pd.isna(row.get("Kỳ hạn", float("nan"))) else None,
            "installment_fee": _parse_amount(row.get("Phí trả góp")) if not pd.isna(row.get("Phí trả góp", float("nan"))) else None,
        }

        if status == MPOS_STATUS_REVERSED:
            record["match_status"] = "reversed"
            reversed_txns.append(record)
        else:
            record["match_status"] = "pending"
            transactions.append(record)

        if record["is_installment"]:
            installments.append(record)

    # --- Audit Trail: Tạo Contra-entry cho GD "Đảo" ---
    contra_entries: list[dict[str, Any]] = []
    for rev in reversed_txns:
        contra = {
            **rev,
            "amount": -abs(rev["amount"]),  # Số tiền ÂM
            "net_amount": -abs(rev["net_amount"]),
            "match_status": "contra_entry",
            "parent_row_index": rev["row_index"],
            "note": f"Contra-entry cho GD Đảo (row {rev['row_index']})",
        }
        contra_entries.append(contra)

    # --- Cảnh báo Ambiguous: GD trùng mệnh giá + thời gian ---
    _check_ambiguous_matches(transactions, warnings)

    total_gross = sum(t["amount"] for t in transactions)
    total_reversed = sum(abs(r["amount"]) for r in reversed_txns)
    total_net = total_gross - total_reversed

    return {
        "transactions": transactions,
        "reversed": reversed_txns,
        "contra_entries": contra_entries,
        "installments": installments,
        "warnings": warnings,
        "summary": {
            "total_rows": len(df),
            "settled_count": len(transactions),
            "reversed_count": len(reversed_txns),
            "installment_count": len(installments),
            "total_gross": total_gross,
            "total_reversed": total_reversed,
            "total_net": total_net,
            "collectors": {
                k: {"count": v, "label": COLLECTOR_MAP.get(k, k)}
                for k, v in df["TK thanh toán"].value_counts().to_dict().items()
            },
        },
    }


def _check_ambiguous_matches(
    transactions: list[dict[str, Any]], warnings: list[str]
) -> None:
    """Phát hiện GD trùng mệnh giá + cùng phút → đánh cờ NEEDS_REVIEW.

    Rule: Nếu heuristic trả về >= 2 kết quả khớp, KHÔNG tự động map.
    """
    # Group by (amount, minute)
    groups: dict[tuple[float, str], list[dict[str, Any]]] = {}
    for txn in transactions:
        amount = txn["amount"]
        txn_time = txn.get("txn_time", "")
        # Cắt đến phút: "2026-06-09 14:38:36" → "2026-06-09 14:38"
        minute_key = str(txn_time)[:16] if txn_time else ""
        key = (amount, minute_key)
        groups.setdefault(key, []).append(txn)

    for (amount, minute), group in groups.items():
        if len(group) >= 2:
            row_indices = [t["row_index"] for t in group]
            for txn in group:
                txn["match_status"] = "needs_review"
            warnings.append(
                f"AMBIGUOUS: {len(group)} GD trùng mệnh giá {amount:,.0f} VND "
                f"tại phút {minute} (rows {row_indices}). Cần đối soát thủ công."
            )


# ---------------------------------------------------------------------------
# Core: Parse settlement.xls
# ---------------------------------------------------------------------------
def parse_mpos_settlements(file_bytes: bytes) -> dict[str, Any]:
    """Parse file settlement.xls từ mPOS portal.

    Returns:
        {
            "settlements": [...],
            "summary": {...},
        }
    """
    df = pd.read_excel(io.BytesIO(file_bytes), engine="xlrd")

    # Validate
    missing_cols = [c for c in SETTLE_REQUIRED_COLS if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Thiếu cột bắt buộc: {', '.join(missing_cols)}")

    settlements: list[dict[str, Any]] = []

    for idx, row in df.iterrows():
        settle_time = row.get("Thời gian")
        gross = _parse_amount(row.get("Số tiền"))
        fee = _parse_amount(row.get("Phí giao dịch"))
        net = _parse_amount(row.get("Số tiền được nhận"))
        mid = _clean_text(row.get("MID"))

        # Group by ngày → 1 batch kết toán
        settle_date = str(settle_time)[:10] if settle_time is not None else None

        settlements.append({
            "row_index": int(idx),
            "settle_time": str(settle_time) if settle_time is not None else None,
            "settle_date": settle_date,
            "gross_amount": gross,
            "fee": fee,
            "net_amount": net,
            "mid": mid,
        })

    # Group by settle_date cho reconciliation
    daily_batches: dict[str, dict[str, Any]] = {}
    for s in settlements:
        date = s.get("settle_date", "unknown")
        if date not in daily_batches:
            daily_batches[date] = {
                "date": date,
                "total_gross": 0,
                "total_fee": 0,
                "total_net": 0,
                "count": 0,
                "rows": [],
            }
        daily_batches[date]["total_gross"] += s["gross_amount"]
        daily_batches[date]["total_fee"] += s["fee"]
        daily_batches[date]["total_net"] += s["net_amount"]
        daily_batches[date]["count"] += 1
        daily_batches[date]["rows"].append(s["row_index"])

    total_gross = sum(s["gross_amount"] for s in settlements)
    total_fee = sum(s["fee"] for s in settlements)
    total_net = sum(s["net_amount"] for s in settlements)

    return {
        "settlements": settlements,
        "daily_batches": list(daily_batches.values()),
        "summary": {
            "total_rows": len(settlements),
            "total_gross": total_gross,
            "total_fee": total_fee,
            "total_net": total_net,
            "date_range": {
                "from": settlements[0]["settle_date"] if settlements else None,
                "to": settlements[-1]["settle_date"] if settlements else None,
            },
            "batch_count": len(daily_batches),
        },
    }


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------
def register_mpos_routes(app, get_supabase: Callable) -> None:
    """Đăng ký mPOS import/reconciliation routes."""

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
        """Upload và parse file transaction.xls từ mPOS portal.

        Trả về danh sách GD đã parse kèm:
        - Phân loại: Kết toán / Đảo (Refund)
        - Contra-entry cho GD Đảo (Audit Trail)
        - Cảnh báo AMBIGUOUS cho GD trùng mệnh giá
        - Nhận diện trả góp + collector mapping
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")

        if not file.filename or not file.filename.endswith((".xls", ".xlsx")):
            raise HTTPException(400, "File phải có đuôi .xls hoặc .xlsx")

        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "File rỗng")

        try:
            result = parse_mpos_transactions(file_bytes)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Lỗi parse file: {exc}") from exc

        return result

    @router.post("/import-settlements")
    async def import_mpos_settlements(
        file: UploadFile = File(...),
        authorization: str | None = Header(None),
    ):
        """Upload và parse file settlement.xls từ mPOS portal.

        Trả về danh sách đợt kết toán theo ngày, kèm tổng tiền
        (dùng để khớp với dòng tiền về MB qua webhook SePay).
        """
        sb = _sb_or_503(get_supabase)
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "reconciliation")

        if not file.filename or not file.filename.endswith((".xls", ".xlsx")):
            raise HTTPException(400, "File phải có đuôi .xls hoặc .xlsx")

        file_bytes = await file.read()
        if not file_bytes:
            raise HTTPException(400, "File rỗng")

        try:
            result = parse_mpos_settlements(file_bytes)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(500, f"Lỗi parse file: {exc}") from exc

        return result

    app.include_router(router)
