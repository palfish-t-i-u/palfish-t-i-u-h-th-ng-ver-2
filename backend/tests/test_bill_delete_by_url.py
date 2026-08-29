"""Unit tests cho _storage_path_from_public_url — cache-independent path extraction."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from payment_request_routes import _storage_path_from_public_url


def test_standard_public_url():
    url = "https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/payment-lines/3b5eaa90-7058-41ce-abc8-d4683592690d/bill-20260826090034853791.jpg"
    assert _storage_path_from_public_url(url) == "payment-lines/3b5eaa90-7058-41ce-abc8-d4683592690d/bill-20260826090034853791.jpg"


def test_url_with_query_param():
    url = "https://example.supabase.co/storage/v1/object/public/bills/payment-lines/abc/bill-123.jpg?token=xyz"
    assert _storage_path_from_public_url(url) == "payment-lines/abc/bill-123.jpg"


def test_url_not_in_bucket():
    url = "https://example.supabase.co/storage/v1/object/public/other-bucket/payment-lines/abc/bill.jpg"
    assert _storage_path_from_public_url(url) == ""


def test_empty_url():
    assert _storage_path_from_public_url("") == ""


def test_none_url():
    assert _storage_path_from_public_url(None) == ""


def test_path_validation_different_line():
    """path suy từ URL phải startswith payment-lines/{line_id}/ — URL line khác bị loại."""
    url = "https://x.supabase.co/storage/v1/object/public/bills/payment-lines/OTHER-LINE/bill-x.jpg"
    path = _storage_path_from_public_url(url)
    line_id = "MY-LINE-ID"
    # Không startswith -> không đưa vào paths_to_remove
    assert not path.startswith(f"payment-lines/{line_id}/")
