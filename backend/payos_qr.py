"""Parse PayOS VietQR EMV payload — lấy nội dung CK đầy đủ (tag 62)."""

from __future__ import annotations


def _read_tlv_block(data: str, pos: int) -> tuple[str, int] | None:
    """Read one TLV at pos; return (value, next_pos)."""
    if pos + 4 > len(data):
        return None
    length = int(data[pos + 2 : pos + 4])
    start = pos + 4
    end = start + length
    if end > len(data):
        return None
    return data[start:end], end


def parse_transfer_content_from_qr(qr_code: str) -> str | None:
    """
    Trích nội dung chuyển khoản từ chuỗi EMV VietQR (qrCode PayOS trả về).
    Gộp các sub-field trong tag 62 (01 bill, 08 purpose, …) — khớp màn PayOS / app NH.
    """
    if not qr_code or len(qr_code) < 10:
        return None

    pos = 0
    while pos < len(qr_code) - 4:
        if qr_code[pos : pos + 2] != "62":
            pos += 1
            continue
        block_result = _read_tlv_block(qr_code, pos)
        if not block_result:
            break
        block, _ = block_result
        parts: list[str] = []
        sub = 0
        while sub < len(block) - 4:
            sub_id = block[sub : sub + 2]
            try:
                sub_len = int(block[sub + 2 : sub + 4])
            except ValueError:
                break
            val_start = sub + 4
            val_end = val_start + sub_len
            if val_end > len(block):
                break
            val = block[val_start:val_end].strip()
            if val:
                parts.append(val)
            sub = val_end
        if parts:
            return " ".join(parts)
        break

    return None
