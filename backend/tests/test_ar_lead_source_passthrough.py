from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from activation_routes import _assign_course_codes


def test_assign_course_codes_carries_lead_source():
    uids = [{
        "uid": "u1", "courses": [
            {"name": "2/W- Both AB REFER 96", "amount": 35000000, "lead_source": "gioi_thieu"},
            {"name": "2/W- Normal 48", "amount": 10000000},
        ],
    }]
    out = _assign_course_codes(uids, "PR-2026-0249")
    courses = out[0]["courses"]
    assert courses[0]["lead_source"] == "gioi_thieu"
    assert "lead_source" not in courses[1]   # G7: gói thường không gắn nguồn
