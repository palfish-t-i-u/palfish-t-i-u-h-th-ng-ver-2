"""REV-03: Backfill ngay_tien_ve cho dòng tu_dong theo luật mốc 22h.

Chỉ chạm dòng loai_nhap='tu_dong' có don_hang_id hoặc pr link để truy giờ thực.
Dòng import:*/tay giữ nguyên.

Usage:
    # Dry-run (mặc định, không ghi gì)
    python scripts/backfill_ngay_tien_ve_22h.py

    # Apply thật (backup trước!)
    python scripts/backfill_ngay_tien_ve_22h.py --apply

⚠️  BACKUP so_doanh_thu TRƯỚC khi --apply:
    CREATE TABLE so_doanh_thu_backup_rev03_YYYYMMDD AS SELECT * FROM so_doanh_thu;
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from supabase import create_client
from revenue_routes import _parse_datetime, ky_tu_gio_thuc, VN_TZ


def get_supabase():
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit("❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY chưa set")
    return create_client(url, key)


def resolve_real_time(sb, row: dict) -> datetime | None:
    """Truy giờ thực từ giao_dich (M3) hoặc payment_lines (AR/PR)."""
    don_hang_id = row.get("don_hang_id")
    ma_don_hang = row.get("ma_don_hang")
    crm_order_id = row.get("crm_order_id")

    # M3 path: có don_hang_id → tìm giao_dich
    if don_hang_id:
        try:
            gd = (
                sb.table("giao_dich")
                .select("thoi_gian_giao_dich")
                .eq("don_hang_id", don_hang_id)
                .order("thoi_gian_giao_dich", desc=True)
                .limit(1)
                .execute()
            )
            if gd.data:
                dt = _parse_datetime(gd.data[0].get("thoi_gian_giao_dich"))
                if dt:
                    return dt
        except Exception as exc:
            print(f"  [warn] giao_dich lookup {don_hang_id}: {exc}")

    # AR path: tìm PR theo ma_don_hang/crm_order_id → payment_lines
    pr_id = _find_pr_id(sb, ma_don_hang=ma_don_hang, crm_order_id=crm_order_id)
    if pr_id:
        try:
            res = (
                sb.table("payment_lines")
                .select("paid_at, created_at")
                .eq("payment_request_id", pr_id)
                .eq("status", "paid")
                .order("paid_at", desc=True)
                .limit(1)
                .execute()
            )
            if res.data:
                for key in ("paid_at", "created_at"):
                    dt = _parse_datetime(res.data[0].get(key))
                    if dt:
                        return dt
        except Exception as exc:
            print(f"  [warn] payment_lines lookup {pr_id}: {exc}")

    return None


def _find_pr_id(sb, *, ma_don_hang: str | None, crm_order_id: str | None) -> str | None:
    for col, val in (("ma_don_hang", ma_don_hang), ("crm_order_id", crm_order_id)):
        if not val:
            continue
        try:
            res = (
                sb.table("payment_requests")
                .select("id")
                .eq(col, val)
                .limit(1)
                .execute()
            )
            if res.data:
                return str(res.data[0]["id"])
        except Exception:
            pass
    return None


def run(apply: bool = False):
    sb = get_supabase()

    print("📥  Đang tải dòng loai_nhap='tu_dong'…")
    rows = []
    offset = 0
    PAGE = 1000
    while True:
        res = (
            sb.table("so_doanh_thu")
            .select("id, ngay_tien_ve, don_hang_id, ma_don_hang, crm_order_id")
            .eq("loai_nhap", "tu_dong")
            .range(offset, offset + PAGE - 1)
            .execute()
        )
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE

    print(f"  Tổng dòng tu_dong: {len(rows)}")

    changed = []   # (id, old_ngay, new_ngay)
    skipped_no_time = 0
    skipped_same = 0

    for row in rows:
        t = resolve_real_time(sb, row)
        if t is None:
            skipped_no_time += 1
            continue
        new_ngay = ky_tu_gio_thuc(t)
        new_pay_time = t.isoformat()
        old_ngay = str(row.get("ngay_tien_ve") or "")[:10]
        if new_ngay.isoformat() == old_ngay:
            skipped_same += 1
            continue
        changed.append((str(row["id"]), old_ngay, new_ngay.isoformat(), new_pay_time))

    print(f"\n📊  Kết quả scan:")
    print(f"  Cần đổi ngay_tien_ve : {len(changed)}")
    print(f"  Không truy được giờ  : {skipped_no_time}")
    print(f"  Đã đúng (giữ nguyên) : {skipped_same}")

    if not changed:
        print("\n✅  Không có dòng nào cần backfill.")
        return

    # Tổng hợp VND dịch giữa các ngày
    print(f"\n  Top 10 dòng sẽ đổi:")
    for row_id, old, new, _ in changed[:10]:
        print(f"    {row_id[:8]}… {old} → {new}")
    if len(changed) > 10:
        print(f"    … và {len(changed) - 10} dòng khác")

    if not apply:
        print("\n🔍  DRY-RUN — không ghi gì. Thêm --apply để thực thi.")
        print("⚠️   Nhớ backup so_doanh_thu TRƯỚC khi --apply!")
        return

    print(f"\n✍️   APPLY — đang cập nhật {len(changed)} dòng…")
    ok = 0
    err = 0
    for row_id, old_ngay, new_ngay, new_pay_time in changed:
        try:
            sb.table("so_doanh_thu").update({
                "ngay_tien_ve": new_ngay,
                "pay_time": new_pay_time,
            }).eq("id", row_id).execute()
            ok += 1
        except Exception as exc:
            print(f"  [error] {row_id}: {exc}")
            err += 1

    print(f"\n✅  Hoàn tất: {ok} thành công, {err} lỗi.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill ngay_tien_ve theo luật 22h")
    parser.add_argument("--apply", action="store_true", help="Ghi thật vào DB (mặc định dry-run)")
    args = parser.parse_args()

    if args.apply:
        confirm = input("⚠️  Bạn đã backup so_doanh_thu chưa? (yes/no): ").strip().lower()
        if confirm != "yes":
            print("Hủy. Backup trước rồi chạy lại.")
            sys.exit(0)

    run(apply=args.apply)
