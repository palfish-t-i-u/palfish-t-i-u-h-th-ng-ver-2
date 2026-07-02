"""
Guardrail for VAC-08 (Đức) — CRM backfill concurrency cap.
Run: cd backend && pytest tests/test_vac_08_crm_concurrency_cap.py -v
Expected: FAIL on current code (BACKFILL_CONCURRENCY_MAX = 8), PASS after fix.

Problem: At BACKFILL_CONCURRENCY_MAX = 8, peak in-flight DataFrame allocations
during a backfill run is 8 concurrent files × up to 5 header-attempt parses each
= 40 simultaneous pandas DataFrames in the Render Starter single-process
FastAPI worker. This is the primary memory hotspot causing OOM crashes on the
512 MB instance.

Fix: in backend/crm_routes.py around line 101, change
    BACKFILL_CONCURRENCY_MAX = 8
to
    BACKFILL_CONCURRENCY_MAX = 3
The existing clamp at line 938
    conc = max(1, min(int(concurrency or BACKFILL_CONCURRENCY_DEFAULT), BACKFILL_CONCURRENCY_MAX))
will then enforce the new ceiling for both POST /crm/sync/backfill and
POST /crm/sync/missing without further code changes.

Rationale: each day's CRM download is I/O-bound on the external API
(sea.pri.ibanyu.com). Reducing parallelism from 8 to 3 adds ~30-60 seconds to a
30-day backfill but cuts peak DataFrame count by ~60% (40 → 15).
"""
from __future__ import annotations

import importlib

import pytest

import crm_routes


class TestCrmBackfillConcurrencyCap:
    """
    VAC-08 — BACKFILL_CONCURRENCY_MAX must be ≤ 3 to keep Render Starter alive.

    Current code (unfixed): BACKFILL_CONCURRENCY_MAX = 8 (FAIL).
    After fix: BACKFILL_CONCURRENCY_MAX = 3 (PASS).
    """

    def test_concurrency_max_is_capped_at_3(self):
        """The hard ceiling must be ≤ 3 so peak parallel DataFrame count stays bounded."""
        importlib.reload(crm_routes)
        assert crm_routes.BACKFILL_CONCURRENCY_MAX <= 3, (
            f"BACKFILL_CONCURRENCY_MAX = {crm_routes.BACKFILL_CONCURRENCY_MAX}. "
            "Must be ≤ 3 to prevent OOM on Render Starter 512 MB. "
            "At max=8 with 5 header attempts per file, peak DataFrame count is 40. "
            "At max=3 it is 15."
        )

    def test_concurrency_default_does_not_exceed_max(self):
        """Default must not be higher than the cap."""
        importlib.reload(crm_routes)
        assert (
            crm_routes.BACKFILL_CONCURRENCY_DEFAULT
            <= crm_routes.BACKFILL_CONCURRENCY_MAX
        ), (
            f"BACKFILL_CONCURRENCY_DEFAULT ({crm_routes.BACKFILL_CONCURRENCY_DEFAULT}) "
            f"> BACKFILL_CONCURRENCY_MAX ({crm_routes.BACKFILL_CONCURRENCY_MAX}). "
            "After cap reduction, lower DEFAULT to ≤ MAX."
        )

    def test_clamp_pattern_unchanged(self):
        """
        The clamp formula at line ~938 must remain
            max(1, min(int(concurrency or DEFAULT), MAX))
        so the new ceiling actually takes effect. If a refactor removed the
        clamp, the cap reduction would be silently bypassed.
        """
        import inspect

        importlib.reload(crm_routes)
        src = inspect.getsource(crm_routes)
        assert "BACKFILL_CONCURRENCY_MAX" in src, (
            "BACKFILL_CONCURRENCY_MAX constant removed — cap no longer enforced."
        )
        # The clamp expression must reference BACKFILL_CONCURRENCY_MAX somewhere
        # in the file. Don't pin the exact phrasing to avoid brittle matches.
        assert src.count("BACKFILL_CONCURRENCY_MAX") >= 2, (
            "BACKFILL_CONCURRENCY_MAX is defined but never used in a clamp. "
            "The cap is dead code."
        )

    @pytest.mark.parametrize("requested", [5, 8, 16, 100])
    def test_simulated_clamp_returns_at_most_3(self, requested: int):
        """
        Emulate the clamp logic at line 938 and verify it actually limits
        any user-supplied concurrency to ≤ 3 after the fix.
        """
        importlib.reload(crm_routes)
        clamped = max(
            1,
            min(
                int(requested or crm_routes.BACKFILL_CONCURRENCY_DEFAULT),
                crm_routes.BACKFILL_CONCURRENCY_MAX,
            ),
        )
        assert clamped <= 3, (
            f"requested={requested}, clamped={clamped}. "
            f"After VAC-08 fix, no concurrency value should exceed 3."
        )
