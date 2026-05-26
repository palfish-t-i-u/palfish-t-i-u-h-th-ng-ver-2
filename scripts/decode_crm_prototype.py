#!/usr/bin/env python3
"""Extract screens/modules from PalFish CRM.html prototype."""
from __future__ import annotations

import re
from pathlib import Path

PATH = Path(r"c:\Users\silly\Downloads\PalFish CRM.html")
OUT = Path(__file__).resolve().parents[1] / "docs" / "PROTOTYPE_PAYMENT_FLOW.md"


def main() -> int:
    raw = PATH.read_text(encoding="utf-8", errors="replace")
    lines: list[str] = [
        "# Prototype — Quản lý thanh toán (PalFish CRM.html)",
        "",
        "**File:** `c:\\Users\\silly\\Downloads\\PalFish CRM.html`",
        "**Title:** Quản lý thanh toán · PalFish GMV",
        "",
        "Single-file HTML bundle (Figma Make / bundler). Mở bằng browser — cần JavaScript.",
        "",
        "---",
        "",
        "## Sơ đồ Logic kết nối (B1–B4)",
        "",
        "### Many-to-many (trên cùng sơ đồ)",
        "",
        "| Pattern | Ví dụ |",
        "|---------|--------|",
        "| N mã thanh toán → 1 PR → 1 Order | QR1 + QR2 + Cash1 → PR-ID → Order ID 1 |",
        "| 1 mã thanh toán → 1 PR → N Order | QR1 → PR-ID → Order ID 1 + Order ID 2 |",
        "",
        "### B1 — Tạo Payment Request",
        "",
        "- **Hành động:** điền thông tin user + tổng số tiền dự kiến thu.",
        "- **Trường:** UID CRM, Tên KH, Địa chỉ, SĐT, Tổng số tiền, Note.",
        "- **Output:** **PR-ID**.",
        "- Chưa cần gói học chi tiết.",
        "",
        "### B2 — Trong PR: tạo QR chuyển khoản",
        "",
        "- **Hành động:** tạo từng mã QR / lần thanh toán trong PR.",
        "- **Trường:** số tiền từng lần CK.",
        "- **Output:** QR (ảnh + nội dung CK).",
        "- **Điều kiện sang B3:** **Tiền về đủ 100%**.",
        "",
        "### B3 — Active Request / Yêu cầu tạo khóa học",
        "",
        "- **Hành động:** yêu cầu tạo **một hoặc nhiều** khóa học; mỗi khóa = một Order ID.",
        "- **Nút:** \"Yêu cầu tạo đơn hàng\".",
        "- **Trường:** UID (UID1 khớp B1, UID khác nhập tay), gói học / UID, số tiền từng khóa.",
        "- **Output:** **Course code** (ảnh + nội dung).",
        "- **Logic quan trọng:**",
        "  - Course code = xác nhận đủ thông tin để xuất HĐ; khớp module B4.",
        "  - Admin tạo đơn trên hệ thống → **nhập tay Order ID** vào Course code tương ứng.",
        "  - **1 Course code = 1 Order ID.**",
        "  - **1 hóa đơn** có thể chứa **một hoặc nhiều** Course code.",
        "  - Xuất HĐ khi tiền chuyển đủ — kể cả kích hoạt khóa tháng sau (đặt cọc loại trừ).",
        "",
        "### B4 — Yêu cầu xuất hóa đơn",
        "",
        "- Lấy thông tin **B1** (KH / thanh toán) + **B3** (Course code / gói) → xuất HĐ.",
        "",
        "### Khóa chính (tóm tắt)",
        "",
        "| Khóa | Sinh ở | Vai trò |",
        "|------|--------|---------|",
        "| **PR-ID** | B1 | Trạm thu tổng; gom mọi lần thanh toán |",
        "| **Mã thanh toán / QR / Info Code** | B2 | Từng lần CK / QR / cash / thẻ |",
        "| **Course code** | B3 | Cầu nối xuất HĐ ↔ Order ID CRM |",
        "| **Order ID** | CRM (Admin nhập tay) | Hoàn tất khớp CRM |",
        "",
        "---",
        "",
        "## Màn hình trong prototype HTML (CSS modules)",
        "",
    ]

    sections = sorted(set(m.group(1).strip() for m in re.finditer(r"/\* ─+ ([^─]+) ─+ \*/", raw)))
    for s in sections:
        lines.append(f"- {s}")

    lines.extend(
        [
            "",
            "---",
            "",
            "## Map prototype ↔ app hiện tại",
            "",
            "| Prototype | App hiện tại | Ghi chú |",
            "|-----------|--------------|---------|",
            "| B1 Payment Request | Tab 1 tạo đơn + QR trực tiếp | Cần tách PR làm entity riêng |",
            "| B2 QR trong PR | PaymentModal / Tab 1 | N lần QR / PR |",
            "| Đối soát giao dịch | PayOS history + tick tiền về Tab 2 | Thêm cash / CK tay |",
            "| Active Request (Kích hoạt khóa học) | Tab 3 M3 | Course code thay Activate Code |",
            "| Xuất hóa đơn | Tab 4 M4 | Input từ B1 + B3 |",
            "| Sổ doanh thu | Module 5 | Auto khi tiền về — chưa có |",
            "",
            "---",
            "",
            "## Liên kết doc",
            "",
            "- `docs/MINH_TASKS_2026-05-26.md` — task Minh + P0",
            "- `docs/TODO.md` — `F2605-*`",
            "- `E:\\PalFish\\DA\\Report\\ke-hoach-cai-thien-feedback-thu-hien.md`",
            "",
        ]
    )

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT} ({len(sections)} css sections)")
    for s in sections:
        print(" ", s)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
