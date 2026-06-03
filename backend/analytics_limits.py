"""Shared caps for wide analytics queries (DB-06 / DB-07)."""

from __future__ import annotations

from typing import Any, Callable

MAX_ANALYTICS_ROWS = 50_000


def fetch_rows_capped(
    fetch_page: Callable[[int, int], list[dict[str, Any]]],
    *,
    page_size: int = 1000,
    cap: int = MAX_ANALYTICS_ROWS,
    log_prefix: str = "[analytics]",
) -> tuple[list[dict[str, Any]], bool]:
    """Paginate via fetch_page(offset, limit) until empty or cap reached."""
    rows: list[dict[str, Any]] = []
    offset = 0
    truncated = False
    while len(rows) < cap:
        limit = min(page_size, cap - len(rows))
        chunk = fetch_page(offset, limit)
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < limit:
            break
        offset += len(chunk)
        if len(rows) >= cap:
            truncated = True
            print(
                f"{log_prefix} truncated at {cap} rows (cap={cap})"
            )
            break
    return rows, truncated
