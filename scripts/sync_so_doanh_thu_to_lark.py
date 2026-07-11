#!/usr/bin/env python3
"""Sync Supabase `so_doanh_thu` → Lark Base "PalFish Revenue Manager" (Payments table).

Dùng `so_doanh_thu` (đã được app GMV dedup + clean) làm source.
Dedup key trên Lark: field "Payment ID" = so_doanh_thu.id (UUID).

Cách dùng:
  python scripts/sync_so_doanh_thu_to_lark.py --dry-run --limit 50
  python scripts/sync_so_doanh_thu_to_lark.py --limit 500
  python scripts/sync_so_doanh_thu_to_lark.py
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# ─────────────────────────── Config ──────────────────────────────

LARK_APP_ID = os.environ.get("LARK_APP_ID", "")
LARK_APP_SECRET = os.environ.get("LARK_APP_SECRET", "")
LARK_DOMAIN = os.environ.get("LARK_DOMAIN", "https://open.larksuite.com")

BASE_APP_TOKEN = "OToBbmlAUaZ0i3sjbnQjwbQ9p3g"
TBL_PAYMENTS = "tbl4FJzV8YC21S9d"
TBL_SALES = "tbl2umPupa2LUKws"
TBL_CUSTOMERS = "tbl2RlAIpK0nQMlE"
TBL_CHANNELS = "tbl3aHNFWx08gPqm"
TBL_PACKAGES = "tbl6oFtSD0wW7Dqo"

TEAM_TO_LARK: dict[str, str] = {
    "Inhouse 1": "In-house",
    "In-house": "In-house",
    "Inhouse 2": "In-house 2",
    "In-house 2": "In-house 2",
    "HCM (Online)": "HCM",
    "HCM": "HCM",
    "Linh Dam (Store)": "Linh Dam Store",
    "Linh Dam": "Linh Dam Store",
    "Linh Dam Store": "Linh Dam Store",
    "An Binh (Store)": "An Binh Store",
    "An Binh": "An Binh Store",
    "An Binh Store": "An Binh Store",
    "Danang": "Danang",
    "DN": "Danang",
}

PAGE_SIZE_SUPABASE = 1000
LARK_PAGE_SIZE = 500
LARK_BATCH_SIZE = 100
LARK_PAUSE_SEC = 0.15
LARK_MAX_ATTEMPTS = 5


# ─────────────────────────── Helpers ──────────────────────────────

def _load_dotenv() -> None:
    env_path = ROOT / "backend" / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path, override=False)
        except ImportError:
            pass


def _log(msg: str) -> None:
    print(msg, flush=True)


def date_to_ms(value: Any) -> int | None:
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    elif isinstance(value, date):
        dt = datetime.combine(value, datetime.min.time(), tzinfo=timezone.utc)
    else:
        s = str(value).strip()
        if not s:
            return None
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if not dt.tzinfo:
                dt = dt.replace(tzinfo=timezone.utc)
        except ValueError:
            try:
                dt = datetime.strptime(s[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                return None
    return int(dt.timestamp() * 1000)


def _text_of(field_value: Any) -> str:
    if isinstance(field_value, list) and field_value:
        return str(field_value[0].get("text") or "").strip()
    if isinstance(field_value, str):
        return field_value.strip()
    if field_value is None:
        return ""
    return str(field_value).strip()


def ms_to_date_str(ms: Any) -> str:
    """Lark timestamp ms → YYYY-MM-DD."""
    if not ms:
        return ""
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, TypeError):
        return ""


def fingerprint(uid: str, pay_date: str, vnd: int, sale_short_code: str) -> str:
    """Stable composite key — same payment should produce same fingerprint
    whether built from Supabase row or Lark row.
    """
    parts = [
        (uid or "").strip(),
        (pay_date or "")[:10],
        str(int(vnd or 0)),
        (sale_short_code or "").strip(),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


# ─────────────────────────── Lark API client ──────────────────────────────

class LarkClient:
    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expire: float = 0
        self._client = httpx.Client(timeout=60.0, base_url=LARK_DOMAIN)

    def _refresh_token(self) -> None:
        res = self._client.post(
            "/open-apis/auth/v3/tenant_access_token/internal",
            json={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
        )
        res.raise_for_status()
        data = res.json()
        if data.get("code") != 0:
            raise RuntimeError(f"Lark token error: {data}")
        self._token = data["tenant_access_token"]
        self._token_expire = time.time() + data.get("expire", 7200) - 300

    def _headers(self) -> dict[str, str]:
        if not self._token or time.time() >= self._token_expire:
            self._refresh_token()
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json; charset=utf-8"}

    def _request(self, method: str, path: str, *, params=None, json=None) -> dict[str, Any]:
        last: Exception | None = None
        for attempt in range(1, LARK_MAX_ATTEMPTS + 1):
            try:
                res = self._client.request(method, path, headers=self._headers(),
                                            params=params, json=json)
                data = res.json()
                code = data.get("code")
                if code == 0:
                    return data
                if code in (99991663, 99991664):
                    self._refresh_token()
                    continue
                if code in (1254607, 1254290) and attempt < LARK_MAX_ATTEMPTS:
                    wait = min(2**attempt, 30)
                    _log(f"  Lark rate limit ({code}) — retry {attempt} sau {wait}s…")
                    time.sleep(wait)
                    continue
                raise RuntimeError(f"Lark API error {code}: {data.get('msg')} ({path})")
            except (httpx.HTTPError, httpx.ReadTimeout) as exc:
                last = exc
                if attempt >= LARK_MAX_ATTEMPTS:
                    raise
                wait = min(2**attempt, 30)
                _log(f"  Lark network err ({exc}) — retry {attempt} sau {wait}s…")
                time.sleep(wait)
        if last:
            raise last
        raise RuntimeError("Lark request failed")

    def search_records(self, table_id: str, *, field_names=None, filter_=None,
                        page_size=LARK_PAGE_SIZE, page_token=None) -> dict[str, Any]:
        params: dict[str, Any] = {"page_size": page_size}
        if page_token:
            params["page_token"] = page_token
        body: dict[str, Any] = {}
        if field_names:
            body["field_names"] = field_names
        if filter_:
            body["filter"] = filter_
        return self._request(
            "POST",
            f"/open-apis/bitable/v1/apps/{BASE_APP_TOKEN}/tables/{table_id}/records/search",
            params=params, json=body,
        )

    def list_all_records(self, table_id: str, field_names=None, *,
                          max_pages: int = 1000) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        seen_rids: set[str] = set()
        page_token: str | None = None
        for _ in range(max_pages):
            data = self.search_records(table_id, field_names=field_names, page_token=page_token)
            items = data["data"].get("items") or []
            new = 0
            for r in items:
                rid = r["record_id"]
                if rid in seen_rids:
                    continue
                seen_rids.add(rid)
                out.append(r)
                new += 1
            page_token = data["data"].get("page_token")
            if not data["data"].get("has_more") or not page_token or new == 0:
                break
        return out

    def find_one_by_field(self, table_id: str, field_name: str, value: str) -> dict[str, Any] | None:
        """Filter by text-equal. Returns first match or None."""
        if not value:
            return None
        filt = {
            "conjunction": "and",
            "conditions": [{
                "field_name": field_name,
                "operator": "is",
                "value": [value],
            }],
        }
        data = self.search_records(table_id, filter_=filt, page_size=1)
        items = data["data"].get("items") or []
        return items[0] if items else None

    def batch_create(self, table_id: str, records: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for i in range(0, len(records), LARK_BATCH_SIZE):
            chunk = records[i : i + LARK_BATCH_SIZE]
            data = self._request(
                "POST",
                f"/open-apis/bitable/v1/apps/{BASE_APP_TOKEN}/tables/{table_id}/records/batch_create",
                json={"records": chunk},
            )
            out.extend(data["data"].get("records") or [])
            if LARK_PAUSE_SEC and i + LARK_BATCH_SIZE < len(records):
                time.sleep(LARK_PAUSE_SEC)
        return out


# ─────────────────── Lookup caches & linked-record resolver ───────────────────

class LarkCache:
    """Small lookups + fingerprint dedup set for existing Payments."""

    def __init__(self, client: LarkClient) -> None:
        self.client = client
        self.sale_by_shortcode: dict[str, str] = {}
        self.shortcode_by_sale_rid: dict[str, str] = {}  # reverse for fingerprint lookup
        self.channel_by_name: dict[str, str] = {}
        self.package_by_name: dict[str, str] = {}
        self.existing_fingerprints: set[str] = set()
        self.customer_by_uid: dict[str, str] = {}  # populated on-demand

    def load(self) -> None:
        _log("  Load Sales…")
        for r in self.client.list_all_records(TBL_SALES, ["Short code"]):
            code = _text_of(r["fields"].get("Short code"))
            if code:
                self.sale_by_shortcode[code] = r["record_id"]
                self.shortcode_by_sale_rid[r["record_id"]] = code
        _log(f"    {len(self.sale_by_shortcode)} sale")

        _log("  Load Channels…")
        for r in self.client.list_all_records(TBL_CHANNELS, ["Tên kênh"]):
            name = _text_of(r["fields"].get("Tên kênh"))
            if name:
                self.channel_by_name[name] = r["record_id"]
        _log(f"    {len(self.channel_by_name)} channel")

        _log("  Load Packages…")
        for r in self.client.list_all_records(TBL_PACKAGES, ["Tên gói"]):
            name = _text_of(r["fields"].get("Tên gói"))
            if name:
                self.package_by_name[name] = r["record_id"]
        _log(f"    {len(self.package_by_name)} package")

        _log("  Load existing Payments (fingerprint dedup)…")
        loaded = 0
        for r in self.client.list_all_records(
            TBL_PAYMENTS,
            ["UID", "Ngày thanh toán", "GMV VND", "Sale"],
        ):
            f = r["fields"]
            uid = _text_of(f.get("UID"))
            ms = f.get("Ngày thanh toán")
            pay_date = ms_to_date_str(ms) if ms else ""
            vnd_raw = f.get("GMV VND") or 0
            try:
                vnd = int(float(vnd_raw))
            except (TypeError, ValueError):
                vnd = 0
            sale_link = f.get("Sale") or {}
            sale_rids = sale_link.get("link_record_ids") if isinstance(sale_link, dict) else []
            sale_code = ""
            if sale_rids:
                sale_code = self.shortcode_by_sale_rid.get(sale_rids[0], "")
            self.existing_fingerprints.add(fingerprint(uid, pay_date, vnd, sale_code))
            loaded += 1
        _log(f"    {loaded} payment ({len(self.existing_fingerprints)} unique fingerprint)")


class LinkedResolver:
    def __init__(self, client: LarkClient, cache: LarkCache, *, dry_run: bool) -> None:
        self.client = client
        self.cache = cache
        self.dry_run = dry_run
        self.stats_created = {"customers": 0, "channels": 0, "packages": 0}
        self.stats_missing_sale: set[str] = set()
        self.stats_lookup_customer = 0

    def get_sale(self, sale_crm_name: str | None) -> str | None:
        if not sale_crm_name:
            return None
        rid = self.cache.sale_by_shortcode.get(sale_crm_name.strip())
        if not rid:
            self.stats_missing_sale.add(sale_crm_name.strip())
        return rid

    def get_or_create_customer(self, uid: str | None, name: str | None,
                                sdt: str | None, first_seen: str | None) -> str | None:
        if not uid:
            return None
        uid = str(uid).strip()
        if uid in self.cache.customer_by_uid:
            return self.cache.customer_by_uid[uid]

        if self.dry_run:
            placeholder = f"<new_customer:{uid}>"
            self.cache.customer_by_uid[uid] = placeholder
            return placeholder

        # Lookup on Lark by UID
        self.stats_lookup_customer += 1
        existing = self.client.find_one_by_field(TBL_CUSTOMERS, "UID", uid)
        if existing:
            rid = existing["record_id"]
            self.cache.customer_by_uid[uid] = rid
            return rid

        # Create new
        fields: dict[str, Any] = {"UID": uid}
        if name:
            fields["Khách hàng"] = name
        if sdt:
            fields["SĐT"] = sdt
        if first_seen:
            ms = date_to_ms(first_seen)
            if ms:
                fields["First seen"] = ms
        created = self.client.batch_create(TBL_CUSTOMERS, [{"fields": fields}])
        if not created:
            return None
        rid = created[0]["record_id"]
        self.cache.customer_by_uid[uid] = rid
        self.stats_created["customers"] += 1
        return rid

    def get_or_create_channel(self, name: str | None) -> str | None:
        if not name:
            return None
        key = name.strip()
        if not key:
            return None
        rid = self.cache.channel_by_name.get(key)
        if rid:
            return rid
        if self.dry_run:
            placeholder = f"<new_channel:{key}>"
            self.cache.channel_by_name[key] = placeholder
            return placeholder
        created = self.client.batch_create(TBL_CHANNELS, [{"fields": {"Tên kênh": key}}])
        if not created:
            return None
        rid = created[0]["record_id"]
        self.cache.channel_by_name[key] = rid
        self.stats_created["channels"] += 1
        return rid

    def get_or_create_package(self, name: str | None, fixed_label: str | None = None) -> str | None:
        if not name:
            return None
        key = name.strip()
        if not key:
            return None
        rid = self.cache.package_by_name.get(key)
        if rid:
            return rid
        if self.dry_run:
            placeholder = f"<new_package:{key}>"
            self.cache.package_by_name[key] = placeholder
            return placeholder
        fields: dict[str, Any] = {"Tên gói": key}
        if fixed_label and fixed_label in {"12/M", "8/M", "3/W", "2/W", "Non-fixed", "x"}:
            fields["Fixed"] = fixed_label
        created = self.client.batch_create(TBL_PACKAGES, [{"fields": fields}])
        if not created:
            return None
        rid = created[0]["record_id"]
        self.cache.package_by_name[key] = rid
        self.stats_created["packages"] += 1
        return rid


# ─────────────────────────── Map row → Lark payload ──────────────────────────────

def map_row_to_lark(row: dict[str, Any], resolver: LinkedResolver) -> dict[str, Any] | None:
    vnd = int(row.get("so_tien_vnd") or 0)
    pay_time = row.get("pay_time") or row.get("ngay_tien_ve")
    if vnd <= 0 or not pay_time:
        return None

    payment_id = str(row.get("id") or "").strip()
    if not payment_id:
        return None

    fields: dict[str, Any] = {"Payment ID": payment_id}

    pay_ms = date_to_ms(pay_time)
    if pay_ms:
        fields["Ngày thanh toán"] = pay_ms

    bank_day = row.get("ngay_tien_ve")
    if bank_day:
        fields["Ngày ngân hàng"] = str(bank_day)[:10]

    uid = str(row.get("uid") or "").strip()
    if uid:
        fields["UID"] = uid

    fields["GMV VND"] = vnd
    gmv_rmb = row.get("gmv_rmb")
    if gmv_rmb is not None:
        try:
            fields["GMV RMB"] = float(gmv_rmb)
        except (TypeError, ValueError):
            pass

    team_raw = (row.get("team") or "").strip()
    team_lark = TEAM_TO_LARK.get(team_raw)
    if team_lark:
        fields["Team"] = team_lark

    sale_rid = resolver.get_sale(row.get("sale_crm_name"))
    if sale_rid:
        fields["Sale"] = [sale_rid]

    cust_rid = resolver.get_or_create_customer(
        uid or None,
        row.get("ten_khach"),
        row.get("sdt"),
        row.get("ngay_tien_ve") or pay_time,
    )
    if cust_rid and not cust_rid.startswith("<"):
        fields["Khách hàng"] = [cust_rid]

    ch_name = (row.get("loai") or "").strip() or (row.get("gateway") or "").strip()
    ch_rid = resolver.get_or_create_channel(ch_name)
    if ch_rid and not ch_rid.startswith("<"):
        fields["Kênh"] = [ch_rid]

    pkg_name = (row.get("goi_hoc") or "").strip()
    fixed_label = (row.get("fixed_non_fixed") or "").strip() or None
    pkg_rid = resolver.get_or_create_package(pkg_name, fixed_label)
    if pkg_rid and not pkg_rid.startswith("<"):
        fields["Gói"] = [pkg_rid]

    fields["Trạng thái"] = "active"

    note_parts = [str(row.get("note") or "").strip(), str(row.get("note2") or "").strip()]
    note = " | ".join(p for p in note_parts if p)
    if note:
        fields["Note"] = note

    return {"fields": fields}


# ─────────────────────────── Main ──────────────────────────────

def fetch_so_doanh_thu(sb, limit: int = 0) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        end = offset + PAGE_SIZE_SUPABASE - 1
        res = (
            sb.table("so_doanh_thu")
            .select("id, uid, ten_khach, sdt, pay_time, ngay_tien_ve, gateway, "
                    "goi_hoc, fixed_non_fixed, so_tien_vnd, gmv_rmb, payment_method, "
                    "loai, loai_2, sale_crm_name, note, note2, team")
            .order("pay_time", desc=False)
            .range(offset, end)
            .execute()
        )
        chunk = res.data or []
        if not chunk:
            break
        out.extend(chunk)
        if limit and len(out) >= limit:
            return out[:limit]
        if len(chunk) < PAGE_SIZE_SUPABASE:
            break
        offset += PAGE_SIZE_SUPABASE
    return out


def main() -> int:
    _load_dotenv()
    parser = argparse.ArgumentParser(description="Sync so_doanh_thu → Lark Payments")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        _log("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
        return 1

    from supabase import create_client
    sb = create_client(sb_url, sb_key)

    _log("[1/4] Connect Lark Base + load lookup caches…")
    lark = LarkClient()
    cache = LarkCache(lark)
    cache.load()

    _log(f"[2/4] Fetch so_doanh_thu từ Supabase (limit={args.limit or 'all'})…")
    rows = fetch_so_doanh_thu(sb, limit=args.limit)
    _log(f"  {len(rows)} row source")

    _log("[3/4] Map + dedup…")
    resolver = LinkedResolver(lark, cache, dry_run=args.dry_run)
    to_insert: list[dict[str, Any]] = []
    skipped_existing = 0
    skipped_invalid = 0

    seen_fps_this_run: set[str] = set()
    skipped_dup_in_run = 0
    for i, row in enumerate(rows):
        uid = str(row.get("uid") or "").strip()
        pay_date = str(row.get("pay_time") or row.get("ngay_tien_ve") or "")[:10]
        vnd = int(row.get("so_tien_vnd") or 0)
        sale_code = str(row.get("sale_crm_name") or "").strip()
        fp = fingerprint(uid, pay_date, vnd, sale_code)
        if fp in cache.existing_fingerprints:
            skipped_existing += 1
            continue
        if fp in seen_fps_this_run:
            skipped_dup_in_run += 1
            continue
        mapped = map_row_to_lark(row, resolver)
        if not mapped:
            skipped_invalid += 1
            continue
        seen_fps_this_run.add(fp)
        to_insert.append(mapped)
        if (i + 1) % 500 == 0:
            _log(f"  Mapped {i+1}/{len(rows)} — insert={len(to_insert)}, "
                 f"skip={skipped_existing} existing + {skipped_invalid} invalid, "
                 f"customer-lookups={resolver.stats_lookup_customer}")

    _log(f"\n  Summary: insert={len(to_insert)}, skip-existing={skipped_existing}, "
         f"skip-dup-in-run={skipped_dup_in_run}, skip-invalid={skipped_invalid}")
    _log(f"  Linked records mới: {resolver.stats_created}")
    _log(f"  Sale không tìm thấy ({len(resolver.stats_missing_sale)} unique): "
         f"{sorted(resolver.stats_missing_sale)[:10]}…" if resolver.stats_missing_sale else "")

    if args.dry_run:
        _log("\n[DRY-RUN] Sample 2 record:")
        for r in to_insert[:2]:
            _log(f"  {r}")
        return 0

    if not to_insert:
        _log("[4/4] Không có row mới — done.")
        return 0

    _log(f"[4/4] Insert {len(to_insert)} record vào Lark Payments (batch {LARK_BATCH_SIZE})…")
    inserted = 0
    for i in range(0, len(to_insert), LARK_BATCH_SIZE):
        chunk = to_insert[i : i + LARK_BATCH_SIZE]
        created = lark.batch_create(TBL_PAYMENTS, chunk)
        inserted += len(created)
        _log(f"  inserted {inserted}/{len(to_insert)}")

    _log(f"\nDone. {inserted} new. Linked created: {resolver.stats_created}, "
         f"customer lookups: {resolver.stats_lookup_customer}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
