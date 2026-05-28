from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from activation_routes import (  # noqa: E402
    REQUEST_INVOICE_CONFLICT_DETAIL,
    _derive_status,
    _stamp_invoice_requested_at,
)


def _assert_equal(actual, expected, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def _assert_no_camel_keys(uids_data) -> None:
    forbidden = {
        "courseCode",
        "packageName",
        "orderId",
        "isInvoiced",
        "invoiceRequestedAt",
        "invoiceId",
        "invoicedAt",
        "taxInvoiceCode",
        "taxProductCode",
    }
    for uid_block in uids_data:
        for course in uid_block.get("courses", []):
            leaked = forbidden.intersection(course)
            if leaked:
                raise AssertionError(f"camelCase keys leaked into persistence payload: {sorted(leaked)}")


def main() -> None:
    missing_order = [
        {
            "uid": "U1",
            "courses": [
                {"code": "C1", "name": "A", "amount": 100000, "order_id": None, "invoiced": False}
            ],
        }
    ]
    _assert_equal(_derive_status(missing_order), "pending_order", "new/manual AR without order_id")

    whitespace_order = [
        {
            "uid": "U1",
            "courses": [
                {"code": "C1", "name": "A", "amount": 100000, "order_id": "   ", "invoiced": False}
            ],
        }
    ]
    _assert_equal(_derive_status(whitespace_order), "pending_order", "whitespace order_id")

    activated = [
        {
            "uid": "U1",
            "courses": [
                {
                    "code": "C1",
                    "name": "A",
                    "amount": 100000,
                    "order_id": "ORD-1",
                    "invoiced": False,
                    "invoice_requested_at": None,
                },
                {
                    "code": "C2",
                    "name": "B",
                    "amount": 200000,
                    "order_id": "ORD-2",
                    "invoiced": False,
                    "invoice_requested_at": "2026-05-27T01:02:03",
                },
            ],
        }
    ]
    _assert_equal(_derive_status(activated), "activated", "all courses ordered but not all invoiced")

    stamped = _stamp_invoice_requested_at(activated, "2026-05-28T00:00:00")
    courses = stamped[0]["courses"]
    _assert_equal(
        courses[0]["invoice_requested_at"],
        "2026-05-28T00:00:00",
        "missing invoice_requested_at is stamped",
    )
    _assert_equal(
        courses[1]["invoice_requested_at"],
        "2026-05-27T01:02:03",
        "existing invoice_requested_at is preserved",
    )
    _assert_equal(_derive_status(stamped), "activated", "request-invoice keeps AR activated")
    _assert_no_camel_keys(stamped)

    patched_new_course = [
        {
            "uid": "U1",
            "courses": [
                {
                    "code": "C1",
                    "name": "A",
                    "amount": 100000,
                    "order_id": "ORD-1",
                    "invoiced": False,
                    "invoice_requested_at": "2026-05-28T00:00:00",
                },
                {"code": "C2", "name": "B", "amount": 200000, "order_id": "", "invoiced": False},
            ],
        }
    ]
    _assert_equal(
        _derive_status(patched_new_course),
        "pending_order",
        "new course without order_id drops whole AR back to pending_order",
    )

    invoiced = [
        {
            "uid": "U1",
            "courses": [
                {"code": "C1", "name": "A", "amount": 100000, "order_id": None, "invoiced": True}
            ],
        }
    ]
    _assert_equal(_derive_status(invoiced), "invoiced", "all courses invoiced")
    _assert_equal(
        REQUEST_INVOICE_CONFLICT_DETAIL,
        "AR chưa kích hoạt đầy đủ — vui lòng điền hết Order ID trước khi xuất HĐ",
        "request-invoice 409 detail",
    )


if __name__ == "__main__":
    main()
    print("active request state machine tests passed")
