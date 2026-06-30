"""
Guardrail for VAC-09 (Đức) — fake-streaming exports must switch to FileResponse.
Run: cd backend && pytest tests/test_vac_09_export_use_file_response.py -v
Expected: FAIL on current code (StreamingResponse + BytesIO), PASS after fix.

Problem: 3 export endpoints build the full payload in a BytesIO buffer, then
wrap it in StreamingResponse — the "streaming" label is misleading because the
entire payload lives in the Python heap before the first byte reaches the
client. For batch exports of 3 XLSX + ZIP, peak RAM is 3-10 MB per concurrent
request on top of pandas + FastAPI baseline.

Affected sites:
    1. backend/activation_routes.py:1167  StreamingResponse(zip_buf, ...)
    2. backend/invoice_routes.py:805      StreamingResponse(zip_buf, ...)
    3. backend/crm_routes.py:1630         StreamingResponse(output, ...) [Excel]

Fix: replace BytesIO + StreamingResponse with tempfile + FileResponse(
background=BackgroundTask(cleanup)). openpyxl Workbook.save() accepts a file
path as well as a file-like, so builder logic is unchanged.

Ordering invariants that MUST be preserved (read before refactoring):
- activation_routes.py:1132-1157 — RPC that persists tax codes runs BEFORE
  the Excel build. Keep this order: DB-write → file-build → FileResponse.
- invoice_routes.py:710-805 — sequence allocation + DB upsert at step 6 runs
  AFTER the ZIP is fully built (intentional: ZIP failure = no codes consumed).
  Keep this order: file-build → DB-write → FileResponse.

Adversarial verifier flagged this divergence: do NOT apply a single uniform
ordering across all three endpoints.
"""
from __future__ import annotations

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"


def _read(name: str) -> str:
    return (BACKEND / name).read_text(encoding="utf-8")


class TestExportsUseFileResponseNotStreamingBytesIO:
    """
    VAC-09 — 3 export endpoints must not return StreamingResponse(<BytesIO>).

    Current code (unfixed): pattern StreamingResponse(zip_buf | output) present (FAIL).
    After fix: FileResponse used; BytesIO patterns removed (PASS).
    """

    def test_activation_export_batch_not_streaming_bytesio(self):
        """activation_routes.py _export_b4_tax_batch must use FileResponse."""
        src = _read("activation_routes.py")
        assert "StreamingResponse(zip_buf" not in src and "StreamingResponse(\n        zip_buf" not in src, (
            "activation_routes.py still returns StreamingResponse(zip_buf, ...). "
            "Replace with tempfile.NamedTemporaryFile + FileResponse(path, "
            "background=BackgroundTask(cleanup)). "
            "Preserve ordering: RPC at line ~1132-1148 runs BEFORE file-build (line ~1150-1165)."
        )
        assert "FileResponse" in src, (
            "activation_routes.py must import FileResponse from fastapi.responses."
        )

    def test_invoice_export_batch_not_streaming_bytesio(self):
        """invoice_routes.py invoice export batch must use FileResponse."""
        src = _read("invoice_routes.py")
        assert "StreamingResponse(zip_buf" not in src and "StreamingResponse(\n            zip_buf" not in src, (
            "invoice_routes.py still returns StreamingResponse(zip_buf, ...). "
            "Replace with tempfile.NamedTemporaryFile + FileResponse(path, "
            "background=BackgroundTask(cleanup)). "
            "Preserve ordering: file-build BEFORE DB upsert at step 6 (line ~770-799)."
        )
        assert "FileResponse" in src, (
            "invoice_routes.py must import FileResponse from fastapi.responses."
        )

    def test_crm_export_master_not_streaming_bytesio(self):
        """crm_routes.py /crm/export-master must use FileResponse."""
        src = _read("crm_routes.py")
        # The CRM endpoint streams `output` (a BytesIO holding the openpyxl xlsx).
        bad_patterns = [
            "StreamingResponse(\n            output",
            "StreamingResponse(\n        output",
            "StreamingResponse(output,",
        ]
        assert not any(p in src for p in bad_patterns), (
            "crm_routes.py /crm/export-master still uses StreamingResponse(output, ...). "
            "Replace pd.ExcelWriter(BytesIO) → pd.ExcelWriter(<tempfile path>) "
            "and return FileResponse(path, background=BackgroundTask(cleanup))."
        )
        assert "FileResponse" in src, (
            "crm_routes.py must import FileResponse from fastapi.responses for the export."
        )

    def test_no_new_bytesio_zip_pattern_in_export_files(self):
        """
        Regression: a future contributor must not reintroduce the BytesIO +
        zipfile + StreamingResponse pattern. The three export files should hold
        none of it after VAC-09.
        """
        offenders = []
        for fname in ("activation_routes.py", "invoice_routes.py", "crm_routes.py"):
            src = _read(fname)
            if "io.BytesIO()" in src and (
                "zipfile.ZipFile" in src or "pd.ExcelWriter" in src
            ):
                # Allow BytesIO for non-export uses (e.g. file uploads parsing).
                # The combination with zipfile or ExcelWriter is the export-build
                # smell.
                if "StreamingResponse" in src:
                    offenders.append(fname)
        assert not offenders, (
            f"Export pattern smell (BytesIO + zip/Excel + StreamingResponse) still "
            f"present in: {offenders}. After VAC-09, exports must use tempfile + "
            f"FileResponse."
        )

    def test_background_task_import_present(self):
        """
        FileResponse alone leaks temp files on disk. The fix REQUIRES
        BackgroundTask(cleanup) to delete the file after the response is sent.
        """
        for fname in ("activation_routes.py", "invoice_routes.py", "crm_routes.py"):
            src = _read(fname)
            if "FileResponse" in src:
                assert "BackgroundTask" in src, (
                    f"{fname} uses FileResponse but does not import/use "
                    f"BackgroundTask. Temp files will leak on /tmp. "
                    f"Add: from starlette.background import BackgroundTask, "
                    f"then FileResponse(path, background=BackgroundTask(os.unlink, path))."
                )
