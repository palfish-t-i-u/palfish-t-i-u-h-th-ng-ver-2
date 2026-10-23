"""G6-T3 plan v2: dry-run handover trên ĐƠN THẬT (không ghi sheet, không ghi DB).

    python scripts/cs_handover_dryrun.py --env ../backend/.env CC-2558-001 CC-2588-001 ... [--fresh] [--dedup]

--fresh : coi mọi course như CHƯA có trong cs_handover_log (bypass 'already') để xem nhánh match/append.
--dedup : chạy thêm cs_handover_dedup.reconcile_duplicates(dry_run=True) trên 4 tab.
Env cần: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON (đọc từ --env nếu thiếu).
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_env(path: str) -> None:
    if not path or not os.path.isfile(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_SERVICE_ACCOUNT_JSON") and not os.environ.get(k):
                os.environ[k] = v


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("codes", nargs="*")
    ap.add_argument("--env", default="")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--dedup", action="store_true")
    a = ap.parse_args()
    _load_env(a.env)
    from supabase import create_client
    import cs_handover_sheet as hs
    import cs_handover_store as st

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    if a.fresh:
        hs._store = type("FreshStore", (), {
            "fetch_statuses": staticmethod(lambda sb_, codes: {}),
            "is_done": staticmethod(st.is_done),
            "needs_retry": staticmethod(st.needs_retry),
            "claim": staticmethod(lambda *x, **k: (_ for _ in ()).throw(AssertionError("claim trong dry-run!"))),
            "mark": staticmethod(lambda *x, **k: (_ for _ in ()).throw(AssertionError("mark trong dry-run!"))),
        })()
    for code in a.codes:
        res = (sb.table("active_requests").select("id").contains("uids_data", []).execute())  # noqa: F841 (warm)
        q = sb.rpc  # noqa: F841
        # tìm ar_id chứa course
        rows = sb.table("active_requests").select("id, uids_data").gte("created_at", "2026-10-01").execute().data or []
        ar_id = next((r["id"] for r in rows if code in str(r.get("uids_data"))), "")
        if not ar_id:
            print(f"[{code}] không tìm thấy AR")
            continue
        print(f"\n===== {ar_id} / {code} =====")
        out = hs.maybe_push_cs_handover(sb, ar_id, code, dry_run=True)
        print(f"→ outcome: {out}")
    if a.dedup:
        import cs_handover_dedup as dd
        print("\n===== DEDUP DRY-RUN 4 tab =====")
        n = dd.reconcile_duplicates(sb, dry_run=True)
        print(f"→ {n} cặp dự kiến")


if __name__ == "__main__":
    main()
