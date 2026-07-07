"""Guard: chặn tạo AR khi gói học chưa có tên (feedback 7/7).

Tin Zalo 'yêu cầu kích hoạt' bắn ngay lúc tạo AR — thiếu tên gói thì Ops
không biết kích hoạt gói gì → _save_active_request phải chặn từ đầu.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from activation_routes import _assert_course_names_present, _assign_course_codes


def _uids(name: str):
    return [{"uid": "3287032666", "courses": [{"name": name, "amount": 4_550_000}]}]


class TestAssertCourseNamesPresent:
    def test_empty_name_blocked(self):
        data = _assign_course_codes(_uids(""), "PR-2026-0137")
        with pytest.raises(HTTPException) as exc:
            _assert_course_names_present(data)
        assert exc.value.status_code == 400
        assert "tên gói" in exc.value.detail

    def test_whitespace_name_blocked(self):
        data = _assign_course_codes(_uids("   "), "PR-2026-0137")
        with pytest.raises(HTTPException):
            _assert_course_names_present(data)

    def test_named_course_passes(self):
        data = _assign_course_codes(_uids("2/W-NEW 24 PHI+2 HN"), "PR-2026-0137")
        _assert_course_names_present(data)  # không raise

    def test_multi_course_one_missing_blocked(self):
        data = _assign_course_codes(
            [
                {
                    "uid": "3287032666",
                    "courses": [
                        {"name": "Gói A", "amount": 1_000_000},
                        {"name": "", "amount": 2_000_000},
                    ],
                }
            ],
            "PR-2026-0137",
        )
        with pytest.raises(HTTPException):
            _assert_course_names_present(data)
