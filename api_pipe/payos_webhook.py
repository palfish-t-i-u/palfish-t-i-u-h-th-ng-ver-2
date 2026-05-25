"""PayOS webhook handler + bank reconciliation utilities.

Được import bởi backend/main.py:
  from api_pipe.payos_webhook import handle_payos_webhook, reconcile_bank_payment, find_don_hang
"""

from __future__ import annotations

import re
import datetime
from typing import Any


# Trạng thái đối soát — khớp frontend PayosHistoryTab (khop | sai_tien | chua_xu_ly)
RECONCILE_STATUS_KHOP = "khop"
RECONCILE_STATUS_SAI_TIEN = "sai_tien"
RECONCILE_STATUS_CHUA_XU_LY = "chua_xu_ly"

_LEGACY_STATUS_MAP: dict[str, str] = {
    "DA_KHOP": RECONCILE_STATUS_KHOP,
    "SAI_SO_TIEN": RECONCILE_STATUS_SAI_TIEN,
    "KHONG_TIM_THAY": RECONCILE_STATUS_CHUA_XU_LY,
    "CHUA_XU_LY": RECONCILE_STATUS_CHUA_XU_LY,
}


def normalize_reconcile_status(raw: str | None) -> str:
    """Chuẩn hóa enum DB (legacy UPPER) → lowercase frontend."""
    s = str(raw or "").strip()
    if s in (RECONCILE_STATUS_KHOP, RECONCILE_STATUS_SAI_TIEN, RECONCILE_STATUS_CHUA_XU_LY):
        return s
    return _LEGACY_STATUS_MAP.get(s.upper(), RECONCILE_STATUS_CHUA_XU_LY)


def reconcile_status_filter_values(frontend_status: str) -> list[str]:
    """Giá trị DB khi filter — gồm legacy để không mất dòng cũ."""
    key = normalize_reconcile_status(frontend_status)
    groups: dict[str, list[str]] = {
        RECONCILE_STATUS_KHOP: [RECONCILE_STATUS_KHOP, "DA_KHOP"],
        RECONCILE_STATUS_SAI_TIEN: [RECONCILE_STATUS_SAI_TIEN, "SAI_SO_TIEN"],
        RECONCILE_STATUS_CHUA_XU_LY: [
            RECONCILE_STATUS_CHUA_XU_LY, "CHUA_XU_LY", "KHONG_TIM_THAY",
        ],
    }
    return groups.get(key, [frontend_status])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_amount(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    digits = re.sub(r"\D", "", str(value or ""))
    return int(digits) if digits else 0


def _extract_ma_don(description: str) -> str | None:
    """Tách mã đơn (KHxxx / DHxxx) từ nội dung chuyển khoản."""
    clean = description.replace("\xa0", " ").strip()
    match = re.search(r"(KH|DH)\s*\d+", clean, re.IGNORECASE)
    if match:
        return match.group(0).replace(" ", "").upper()
    return None


def _info_code_from_ma_don(ma_don: str) -> str:
    return f"Thanh toan {ma_don}"


# ---------------------------------------------------------------------------
# find_don_hang — tìm đơn hàng theo info_code hoặc nội dung CK
# ---------------------------------------------------------------------------

def find_don_hang(sb, info_code: str) -> dict[str, Any] | None:
    """Trả về dict row don_hang hoặc None nếu không tìm thấy."""
    if not sb or not info_code:
        return None
    try:
        ma_don = _extract_ma_don(info_code)
        if ma_don:
            res = (
                sb.table("don_hang")
                .select("*")
                .ilike("info_code", f"%{ma_don}%")
                .limit(1)
                .execute()
            )
        else:
            res = (
                sb.table("don_hang")
                .select("*")
                .eq("info_code", info_code)
                .limit(1)
                .execute()
            )
        return res.data[0] if res.data else None
    except Exception as exc:
        print(f"[payos_webhook] find_don_hang error: {exc}")
        return None


# ---------------------------------------------------------------------------
# reconcile_bank_payment — đối soát tiền về
# ---------------------------------------------------------------------------

def reconcile_bank_payment(
    sb,
    description: str,
    amount: int,
    bank_tx_id: str,
) -> dict[str, Any]:
    """Ghi giao_dich + cập nhật don_hang.tien_ve nếu số tiền khớp.

    Returns:
      {
        matched: bool,
        amount_ok: bool,
        received_amount: int,
        expected_amount: int,
        don_hang_id: str | None,
      }
    """
    result: dict[str, Any] = {
        "matched": False,
        "amount_ok": False,
        "received_amount": amount,
        "expected_amount": 0,
        "don_hang_id": None,
    }

    if not sb:
        return result

    don = find_don_hang(sb, description)
    trang_thai_doi_soat = RECONCILE_STATUS_CHUA_XU_LY

    if don:
        result["matched"] = True
        result["don_hang_id"] = don["id"]
        expected = _parse_amount(don.get("so_tien_can_thu", 0))
        result["expected_amount"] = expected

        if amount >= expected:
            result["amount_ok"] = True
            trang_thai_doi_soat = RECONCILE_STATUS_KHOP
            try:
                sb.table("don_hang").update(
                    {
                        "tien_ve": True,
                        "trang_thai": "da_thanh_toan",
                        "trang_thai_thu_tuc": "CHO_XAC_NHAN",
                    }
                ).eq("id", don["id"]).execute()
            except Exception as exc:
                print(f"[payos_webhook] update don_hang error: {exc}")
        else:
            trang_thai_doi_soat = RECONCILE_STATUS_SAI_TIEN
    else:
        trang_thai_doi_soat = RECONCILE_STATUS_CHUA_XU_LY

    # Ghi log giao_dich
    try:
        ma_don = _extract_ma_don(description)
        info_code = _info_code_from_ma_don(ma_don) if ma_don else description
        sb.table("giao_dich").insert(
            {
                "ma_giao_dich_bank": bank_tx_id,
                "so_tien_nhan": amount,
                "noi_dung_chuyen_khoan": description,
                "info_code_thuc_te": info_code,
                "thoi_gian_giao_dich": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "trang_thai_doi_soat": trang_thai_doi_soat,
                "don_hang_id": result["don_hang_id"],
            }
        ).execute()
    except Exception as exc:
        print(f"[payos_webhook] insert giao_dich error: {exc}")

    return result


# ---------------------------------------------------------------------------
# handle_payos_webhook — entry point từ POST /webhook/payos
# ---------------------------------------------------------------------------

def handle_payos_webhook(sb, payload: dict) -> dict[str, Any]:
    """Xử lý payload từ PayOS webhook."""
    try:
        data = payload.get("data", payload) or {}
        description = str(data.get("description") or data.get("content") or "")
        amount = _parse_amount(data.get("amount") or data.get("transferAmount") or 0)
        order_code = str(data.get("orderCode") or data.get("reference") or "")
        bank_tx_id = order_code or f"PAYOS-{description[:20]}"

        if not description:
            return {"error": 1, "message": "Thiếu nội dung chuyển khoản"}

        result = reconcile_bank_payment(sb, description, amount, bank_tx_id)

        return {
            "error": 0,
            "message": "Xử lý thành công",
            "matched": result["matched"],
            "amountOk": result["amount_ok"],
        }
    except Exception as exc:
        print(f"[payos_webhook] handle_payos_webhook error: {exc}")
        return {"error": 1, "message": str(exc)}
