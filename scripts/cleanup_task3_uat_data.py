#!/usr/bin/env python3
"""Task 3: cleanup test/UAT data for PR/AR and legacy order tables.

Tables in scope:
- payment_requests
- payment_lines
- active_requests
- don_hang
- giao_dich

Default mode is dry-run.
Use --apply to execute deletes.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

PAGE_SIZE = 500
DELETE_CHUNK = 200

DEFAULT_KEYWORDS = [
    "test",
    "uat",
    "demo",
    "sample",
    "manual",
    "abc",
    "fdgrg",
    "bgjyg",
    "hieu",
    "webhook",
    "persist",
    "email bug",
    "e2e",
]


def _load_dotenv() -> None:
    env_path = ROOT / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path)
        except ImportError:
            pass


def _normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text


def _compile_keywords(keywords: list[str]) -> re.Pattern[str]:
    escaped = [re.escape(_normalize_text(k)) for k in keywords if str(k).strip()]
    # include generic noisy numeric tests often used in this project.
    escaped.extend([r"\b123\b", r"\b1234\b", r"\b12345\b", r"xxxx"])
    return re.compile(r"(" + "|".join(escaped) + r")", flags=re.IGNORECASE)


def _is_on_or_after(created_at: str | None, since: str | None) -> bool:
    if not since:
        return True
    d = (created_at or "")[:10]
    if not d:
        return False
    return d >= since


def _fetch_all(sb, table: str, select: str = "*") -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        res = (
            sb.table(table)
            .select(select)
            .order("created_at", desc=True)
            .range(offset, offset + PAGE_SIZE - 1)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return rows


def _delete_ids(sb, table: str, ids: list[str]) -> int:
    if not ids:
        return 0
    deleted = 0
    for i in range(0, len(ids), DELETE_CHUNK):
        chunk = ids[i : i + DELETE_CHUNK]
        sb.table(table).delete().in_("id", chunk).execute()
        deleted += len(chunk)
    return deleted


def _blob_pr(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("id") or ""),
            str(row.get("name") or ""),
            str(row.get("uid") or ""),
            str(row.get("email") or ""),
            str(row.get("sale_email") or ""),
            str(row.get("phone") or ""),
            str(row.get("note") or ""),
        ]
    )


def _blob_ar(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("id") or ""),
            str(row.get("pr_id") or ""),
            str(row.get("customer_name") or ""),
            json.dumps(row.get("uids_data") or [], ensure_ascii=False),
        ]
    )


def _blob_order(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("id") or ""),
            str(row.get("ma_don_hang") or ""),
            str(row.get("ten_nguoi_mua") or ""),
            str(row.get("ma_khach_hang") or ""),
            str(row.get("info_code") or ""),
            str(row.get("created_by") or ""),
            str(row.get("sale_crm_name") or ""),
            str(row.get("goi_hoc") or ""),
            str(row.get("ghi_chu") or ""),
        ]
    )


def _blob_txn(row: dict[str, Any]) -> str:
    return " ".join(
        [
            str(row.get("id") or ""),
            str(row.get("ma_giao_dich_bank") or ""),
            str(row.get("noi_dung_chuyen_khoan") or ""),
            str(row.get("info_code_thuc_te") or ""),
        ]
    )


def _print_sample(title: str, rows: list[dict[str, Any]], cols: list[str]) -> None:
    print(f"\n{title}: {len(rows)}")
    for r in rows[:15]:
        vals = [str(r.get(c) or "") for c in cols]
        line = "  - " + " | ".join(vals)
        sys.stdout.buffer.write((line + "\n").encode("utf-8", errors="ignore"))
    if len(rows) > 15:
        print(f"  ... and {len(rows) - 15} more")


def main() -> int:
    _load_dotenv()

    parser = argparse.ArgumentParser(description="Cleanup Task 3 UAT/test data")
    parser.add_argument("--apply", action="store_true", help="Execute delete")
    parser.add_argument(
        "--since",
        default="2026-05-20",
        help="Only consider rows with created_at >= this date (YYYY-MM-DD). Use '' to disable.",
    )
    parser.add_argument(
        "--keywords",
        default=",".join(DEFAULT_KEYWORDS),
        help="Comma-separated keyword list",
    )
    parser.add_argument(
        "--pr-ids",
        default="",
        help="Comma-separated PR IDs to force-include (e.g. PR-2026-0007,PR-2026-0003). Bypasses keyword filter.",
    )
    parser.add_argument(
        "--backup-file",
        default="",
        help="Optional backup JSON path (default: docs/artifacts/task3_cleanup_backup_<ts>.json)",
    )
    args = parser.parse_args()

    since = (args.since or "").strip() or None
    keyword_list = [k.strip() for k in (args.keywords or "").split(",") if k.strip()]
    force_pr_ids = {p.strip() for p in (args.pr_ids or "").split(",") if p.strip()}
    if not keyword_list:
        print("Keyword list is empty.", file=sys.stderr)
        return 1
    pattern = _compile_keywords(keyword_list)

    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env", file=sys.stderr)
        return 1

    from supabase import create_client

    sb = create_client(url, key)

    payment_requests = _fetch_all(sb, "payment_requests")
    payment_lines = _fetch_all(sb, "payment_lines")
    active_requests = _fetch_all(sb, "active_requests")
    don_hang = _fetch_all(sb, "don_hang")
    giao_dich = _fetch_all(sb, "giao_dich")

    pr_candidates = [
        row
        for row in payment_requests
        if str(row.get("id") or "") in force_pr_ids
        or (
            _is_on_or_after(row.get("created_at"), since)
            and (
                bool(pattern.search(_normalize_text(_blob_pr(row))))
                or str(row.get("email") or "").lower().endswith("@example.com")
                or str(row.get("sale_email") or "").lower().endswith("@example.com")
            )
        )
    ]
    pr_ids = {str(row.get("id")) for row in pr_candidates if row.get("id")}

    pl_candidates = [
        row
        for row in payment_lines
        if (
            str(row.get("payment_request_id") or "") in pr_ids
            or (
                _is_on_or_after(row.get("created_at"), since)
                and bool(
                    pattern.search(
                        _normalize_text(
                            " ".join(
                                [
                                    str(row.get("transfer_code") or ""),
                                    str(row.get("payos_order_code") or ""),
                                    str(row.get("reject_reason") or ""),
                                ]
                            )
                        )
                    )
                )
            )
        )
    ]
    pl_ids = {str(row.get("id")) for row in pl_candidates if row.get("id")}

    ar_candidates = [
        row
        for row in active_requests
        if (
            str(row.get("pr_id") or "") in pr_ids
            or (
                _is_on_or_after(row.get("created_at"), since)
                and bool(pattern.search(_normalize_text(_blob_ar(row))))
            )
        )
    ]
    ar_ids = {str(row.get("id")) for row in ar_candidates if row.get("id")}

    dh_candidates = [
        row
        for row in don_hang
        if _is_on_or_after(row.get("created_at"), since)
        and bool(pattern.search(_normalize_text(_blob_order(row))))
    ]
    dh_ids = {str(row.get("id")) for row in dh_candidates if row.get("id")}

    gd_candidates = [
        row
        for row in giao_dich
        if (
            str(row.get("don_hang_id") or "") in dh_ids
            or (
                _is_on_or_after(row.get("created_at"), since)
                and bool(pattern.search(_normalize_text(_blob_txn(row))))
            )
        )
    ]
    gd_ids = {str(row.get("id")) for row in gd_candidates if row.get("id")}

    print("=== Task 3 Cleanup Preview ===")
    print(f"Since: {since or 'disabled'}")
    print(f"Keywords: {', '.join(keyword_list)}")
    print(f"Total rows | PR={len(payment_requests)} PL={len(payment_lines)} AR={len(active_requests)} DH={len(don_hang)} GD={len(giao_dich)}")
    print(f"Candidates | PR={len(pr_ids)} PL={len(pl_ids)} AR={len(ar_ids)} DH={len(dh_ids)} GD={len(gd_ids)}")

    _print_sample("payment_requests", pr_candidates, ["id", "name", "uid", "sale_email", "created_at"])
    _print_sample("active_requests", ar_candidates, ["id", "pr_id", "customer_name", "status", "created_at"])
    _print_sample("don_hang", dh_candidates, ["id", "ma_don_hang", "ten_nguoi_mua", "created_at"])
    _print_sample("giao_dich", gd_candidates, ["id", "don_hang_id", "ma_giao_dich_bank", "created_at"])

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to delete.")
        return 0

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = Path(args.backup_file) if args.backup_file else (ROOT / "docs" / "artifacts" / f"task3_cleanup_backup_{ts}.json")
    backup_path.parent.mkdir(parents=True, exist_ok=True)

    backup_payload = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "since": since,
        "keywords": keyword_list,
        "counts": {
            "payment_requests": len(pr_candidates),
            "payment_lines": len(pl_candidates),
            "active_requests": len(ar_candidates),
            "don_hang": len(dh_candidates),
            "giao_dich": len(gd_candidates),
        },
        "rows": {
            "payment_requests": pr_candidates,
            "payment_lines": pl_candidates,
            "active_requests": ar_candidates,
            "don_hang": dh_candidates,
            "giao_dich": gd_candidates,
        },
    }
    backup_path.write_text(json.dumps(backup_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nBackup saved: {backup_path}")

    # Delete order: children first.
    deleted_ar = _delete_ids(sb, "active_requests", sorted(ar_ids))
    deleted_pl = _delete_ids(sb, "payment_lines", sorted(pl_ids))
    deleted_pr = _delete_ids(sb, "payment_requests", sorted(pr_ids))
    deleted_gd = _delete_ids(sb, "giao_dich", sorted(gd_ids))
    deleted_dh = _delete_ids(sb, "don_hang", sorted(dh_ids))

    print("\n=== Deleted ===")
    print(f"active_requests: {deleted_ar}")
    print(f"payment_lines: {deleted_pl}")
    print(f"payment_requests: {deleted_pr}")
    print(f"giao_dich: {deleted_gd}")
    print(f"don_hang: {deleted_dh}")
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
