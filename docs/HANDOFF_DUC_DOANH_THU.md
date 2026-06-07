# Handoff — Đức: DB + BE core module Doanh thu

**Ngày:** 2026-06-07
**Spec đầy đủ:** `docs/SPEC_DOANH_THU.md`
**Ưu tiên:** Top 1 trước (DB + migration + API payments), Top 2 sau (CRUD master)

---

## Tổng quan việc cần làm

| # | Việc | Ưu tiên | Giờ |
|---|------|---------|-----|
| 1 | DB: tạo 5 bảng + index | Top 1 | 2h |
| 2 | Migration ~28k dòng từ Google Sheet | Top 1 | 4h |
| 3 | BE: `GET /payments` (list + filter + summary) | Top 1 | 2h |
| 4 | BE: `POST /payments` + `GET /customers/search` | Top 1 | 2h |
| 5 | BE: `PATCH /payments/{id}` + refund/restore/link-crm + `DELETE` | Top 1 | 2h |
| 6 | BE: `GET/POST/PATCH` master (sales, channels, packages, customers) | Top 2 | 2h |
| 7 | Config tỷ giá GMV | Top 2 | ~30m |

---

## Việc 1 — DB: tạo bảng (2h)

Chạy migration SQL trên Supabase. File lưu tại `docs/migrations/2026-06-xx-payments-module.sql`.

```sql
-- 1. Bảng khách hàng
create table customers (
  uid         text primary key,
  full_name   text,
  phone       text,
  first_seen  date,
  created_at  timestamptz default now()
);

-- 2. Bảng master nhân sự bán hàng
-- LƯU Ý: TÁCH với bảng nhan_su_sale hiện tại (bảng đó phục vụ CRM/PR).
-- Bảng này phục vụ riêng module doanh thu, có cấu trúc khác (short_code, khoi).
create table sales (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,          -- "Vu Cam Ly"
  short_code  text,                   -- "LyVC" (tên hiển thị BCTB)
  team        text,                   -- Stellar/Imperia/sub-team cụ thể
  khoi        text,                   -- Stellar Garden | Imperia Garden | Offline | HCM
  active      boolean default true,
  created_at  timestamptz default now()
);

-- 3. Bảng master kênh
create table channels (
  id            uuid primary key default gen_random_uuid(),
  channel_code  text,                 -- mã kênh gốc (渠道号): 1133, 300445...
  name          text,                 -- tên hiển thị
  type          text                  -- Ads | Renewal | Referral | Public | Offline | Lives | KOC | Other
);

-- 4. Bảng master gói
create table packages (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,               -- "2/W- NEW 48 PHI+5"
  fixed  text                         -- fixed | non-fixed
);

-- 5. Bảng doanh thu chính
create table payments (
  payment_id    uuid primary key default gen_random_uuid(),
  uid           text not null references customers(uid),
  pay_time      timestamptz not null,
  bank_day      date,
  package_id    uuid references packages(id),
  payment_seq   text,                 -- '1st' | '2nd' | '3rd'...
  real_pay_vnd  numeric not null,
  gmv_rmb       numeric,
  gmv_final     numeric,
  channel_id    uuid references channels(id),
  sale_id       uuid not null references sales(id),
  team          text not null,        -- thô: In-house | In-house 2 | store...
  status        text not null default 'active',  -- active | refunded
  note          text,
  crm_order_id  text,                 -- nullable, điền sau khi kích hoạt CRM
  crm_activated boolean not null default false,
  activated_at  date,
  bank_matched  boolean not null default false,
  deleted_at    timestamptz,          -- soft delete
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_payments_pay_time on payments (pay_time);
create index idx_payments_uid on payments (uid);
create index idx_payments_sale_id on payments (sale_id);
create unique index payments_bizkey
  on payments (uid, pay_time, real_pay_vnd)
  where deleted_at is null;

-- 6. Bảng tương lai (tạo sẵn, chưa dùng trong GĐ1)
create table bank_transactions (
  txn_id             uuid primary key default gen_random_uuid(),
  date               date,
  amount             numeric,
  content            text,
  matched_payment_id uuid references payments(payment_id)
);

create table crm_orders (
  crm_order_id text primary key,
  uid          text references customers(uid),
  course       text,
  activated    boolean,
  activated_at date
);
```

**Sau khi chạy SQL:** kiểm tra trên Supabase Table Editor, đảm bảo 5 bảng chính + 2 bảng tương lai xuất hiện.

---

## Việc 2 — Migration ~28k dòng (4h)

### Nguồn dữ liệu

Google Sheet: https://docs.google.com/spreadsheets/d/1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc

3 sheet:
- `SM Hanoi`: ~14.800 dòng, 35 cột
- `HCM REV`: ~13.800 dòng, 20 cột
- `Danang REV`: ~50 dòng, 22 cột

### Cách làm

Viết script Python (chạy 1 lần, không cần endpoint — file riêng `backend/scripts/migrate_payments.py`).

**Bước 1 — Export Google Sheet → CSV/Excel**

Tải 3 sheet ra file `.xlsx`.

**Bước 2 — Dựng master `customers`**

```python
# Gom uid phân biệt từ cả 3 sheet
# SM Hanoi: ~9.320 uid unique (từ 14.315 dòng)
# Upsert vào bảng customers: uid, full_name (cột tên khách), phone (nếu có)
```

**Bước 3 — Dựng master `sales`** ⚠️ CẦN REVIEW TAY

```python
# Gom tên sale phân biệt: SM Hanoi ~164, HCM ~29 → ~190 tổng
# Map: full_name, short_code (tạm = viết tắt), team, khoi
# Team mapping (dựa trên dữ liệu thực):
#   In-house → tra theo BCTB (Stellar/Imperia/sub-team cụ thể)
#   In-house 2 → tương tự
#   Linh Dam Store / An Binh Store / Aeon mall Booth → khoi = "Offline"
#   HCM → khoi = "HCM"
# XUẤT RA CSV ĐỂ MINH/ANH HIẾU REVIEW TRƯỚC KHI IMPORT
```

**Bước 4 — Dựng master `channels` + `packages`**

```python
# channels: gom Type/渠道号 phân biệt → ~8 loại (Ads, Renewal, Referral, Public, Offline, Lives, KOC, Other)
# packages: gom tên gói phân biệt → insert
```

**Bước 5 — Insert `payments`**

```python
# Map cột nguồn → schema payments:
#   pay_time      ← cột ngày thanh toán
#   real_pay_vnd  ← cột tiền VND
#   gmv_rmb       ← cột GMV RMB (nếu có)
#   team          ← cột TEAM (thô)
#   sale_id       ← lookup từ bảng sales theo tên
#   channel_id    ← lookup từ bảng channels theo type/code
#   package_id    ← lookup từ bảng packages theo tên
#   uid           ← cột UID khách

# Tính gmv_final:
#   if pay_time < 2026-06-01: gmv_final = gmv_rmb
#   else: gmv_final = real_pay_vnd / 3700

# HCM REV đặc biệt:
#   - Không có cột 渠道号 → channel_id = null hoặc suy từ cột Type
#   - Không có cột TEAM → team = 'HCM'

# Danang: 50 dòng, team đóng (chỉ lịch sử)

# Phát hiện trùng: khoá (uid + pay_time + real_pay_vnd) → log cảnh báo, insert 1 lần
```

**Bước 6 — Verify**

```sql
-- Kiểm tra sau migrate
select count(*) from payments;              -- ~28.000
select count(*) from customers;             -- ~9.500+
select count(*) from sales;                 -- ~190
select team, count(*) from payments group by team;
select status, count(*) from payments group by status;
```

---

## Việc 3 — BE: `GET /payments` (2h)

### File mới: `backend/payment_routes.py`

Pattern giống `revenue_routes.py` — tạo file mới, register vào `main.py`.

```python
"""Module Doanh thu — CRUD payments."""

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import Header, HTTPException, Query
from pydantic import BaseModel

from admin_routes import require_module_access, require_module_write
from rbac import resolve_actor


# Tỷ giá mặc định, sau có thể đọc từ DB config
GMV_EXCHANGE_RATE = Decimal("3700")
GMV_CUTOFF = datetime(2026, 6, 1)


def compute_gmv_final(pay_time: datetime, real_pay_vnd: Decimal, gmv_rmb: Decimal | None) -> Decimal:
    """Quy tắc GMV: trước 01/06/2026 dùng gmv_rmb, từ 01/06 dùng VND/tỷ giá."""
    if pay_time < GMV_CUTOFF:
        return gmv_rmb or Decimal(0)
    return (real_pay_vnd / GMV_EXCHANGE_RATE).quantize(Decimal("0.01"))


def register_payment_routes(app, sb_getter):
    def _sb():
        sb = sb_getter()
        if not sb:
            raise HTTPException(503, "Supabase chưa cấu hình")
        return sb

    @app.get("/api/v1/payments")
    async def list_payments(
        search: str = Query(""),
        date_from: date | None = Query(None, alias="from"),
        date_to: date | None = Query(None, alias="to"),
        team: str = Query(""),
        channel: str = Query(""),
        sale_id: str = Query(""),
        status: str = Query(""),
        bank_matched: str = Query(""),
        crm_activated: str = Query(""),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, le=200),
        authorization: str | None = Header(None),
    ):
        sb = _sb()
        actor = resolve_actor(sb, authorization)
        require_module_access(sb, actor, "payments")  # module key mới

        q = sb.table("payments").select("*, customers(full_name, phone), sales(short_code, team, khoi), channels(name, type), packages(name)")
        q = q.is_("deleted_at", "null")

        if search:
            # Tìm theo uid, tên khách, SĐT
            q = q.or_(f"uid.ilike.%{search}%,note.ilike.%{search}%")
        if date_from:
            q = q.gte("pay_time", date_from.isoformat())
        if date_to:
            q = q.lte("pay_time", f"{date_to.isoformat()}T23:59:59")
        if team:
            q = q.eq("team", team)
        if sale_id:
            q = q.eq("sale_id", sale_id)
        if status:
            q = q.eq("status", status)
        if bank_matched:
            q = q.eq("bank_matched", bank_matched == "true")
        if crm_activated:
            q = q.eq("crm_activated", crm_activated == "true")

        q = q.order("pay_time", desc=True)
        q = q.range((page - 1) * page_size, page * page_size - 1)

        res = q.execute()
        items = res.data or []

        # Summary — query riêng (không paginate)
        sq = sb.table("payments").select("real_pay_vnd, gmv_final, bank_matched, crm_activated, status")
        sq = sq.is_("deleted_at", "null")
        # Áp cùng filter...
        # (copy filter logic ở trên)
        summary_res = sq.execute()
        summary_rows = summary_res.data or []

        active_rows = [r for r in summary_rows if r["status"] == "active"]
        summary = {
            "gmv_final": sum(float(r.get("gmv_final") or 0) for r in active_rows),
            "real_pay_vnd": sum(float(r.get("real_pay_vnd") or 0) for r in active_rows),
            "count": len(summary_rows),
            "unmatched_bank": sum(1 for r in summary_rows if not r.get("bank_matched")),
            "uncrm": sum(1 for r in active_rows if not r.get("crm_activated")),
        }

        return {"items": items, "total": len(summary_rows), "summary": summary}
```

### Register vào main.py

```python
# main.py — thêm import + register
from payment_routes import register_payment_routes
# ...
register_payment_routes(app, _supabase)
```

### Permission key

Module key = `"payments"`. Đạt sẽ thêm vào RBAC matrix (xem handoff Đạt).

### Response format

```json
{
  "items": [
    {
      "payment_id": "uuid",
      "uid": "abc123",
      "pay_time": "2026-06-07T10:00:00+07:00",
      "real_pay_vnd": 5550000,
      "gmv_final": 1500.00,
      "gmv_rmb": 1500.00,
      "team": "In-house",
      "status": "active",
      "bank_matched": false,
      "crm_activated": false,
      "customers": { "full_name": "Nguyen Van A", "phone": "0901234567" },
      "sales": { "short_code": "LyVC", "team": "Stellar", "khoi": "Stellar Garden" },
      "channels": { "name": "广告", "type": "Ads" },
      "packages": { "name": "2/W- NEW 48 PHI+5" }
    }
  ],
  "total": 28000,
  "summary": {
    "gmv_final": 1200000.00,
    "real_pay_vnd": 4500000000,
    "count": 320,
    "unmatched_bank": 18,
    "uncrm": 42
  }
}
```

---

## Việc 4 — BE: `POST /payments` + search (2h)

Thêm vào `payment_routes.py`:

```python
class PaymentCreate(BaseModel):
    uid: str
    pay_time: datetime
    package_id: str | None = None
    sale_id: str
    channel_id: str | None = None
    real_pay_vnd: float
    gmv_rmb: float | None = None
    payment_seq: str | None = None
    note: str | None = None
    # Nếu uid mới, tạo customer:
    customer_name: str | None = None
    customer_phone: str | None = None


@app.post("/api/v1/payments")
async def create_payment(body: PaymentCreate, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "payments")

    # 1. Tạo customer nếu uid mới
    existing = sb.table("customers").select("uid").eq("uid", body.uid).execute()
    if not (existing.data):
        sb.table("customers").insert({
            "uid": body.uid,
            "full_name": body.customer_name,
            "phone": body.customer_phone,
            "first_seen": body.pay_time.date().isoformat(),
        }).execute()

    # 2. Lấy team thô từ sales
    sale = sb.table("sales").select("team").eq("id", body.sale_id).single().execute()
    team_raw = sale.data.get("team", "")

    # 3. Tính gmv_final
    gmv = compute_gmv_final(body.pay_time, Decimal(str(body.real_pay_vnd)), Decimal(str(body.gmv_rmb)) if body.gmv_rmb else None)

    # 4. Insert
    row = {
        "uid": body.uid,
        "pay_time": body.pay_time.isoformat(),
        "package_id": body.package_id,
        "sale_id": body.sale_id,
        "channel_id": body.channel_id,
        "real_pay_vnd": body.real_pay_vnd,
        "gmv_rmb": body.gmv_rmb,
        "gmv_final": float(gmv),
        "payment_seq": body.payment_seq,
        "team": team_raw,
        "note": body.note,
    }
    res = sb.table("payments").insert(row).execute()
    return res.data[0]


@app.get("/api/v1/customers/search")
async def search_customers(q: str = Query("", min_length=1), authorization: str | None = Header(None)):
    """Dropdown search khách hàng — tìm theo uid, tên, SĐT."""
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_access(sb, actor, "payments")

    res = sb.table("customers").select("uid, full_name, phone") \
        .or_(f"uid.ilike.%{q}%,full_name.ilike.%{q}%,phone.ilike.%{q}%") \
        .limit(20).execute()
    return res.data or []


# Master dropdown endpoints
@app.get("/api/v1/payments/master/sales")
async def list_sales_master(authorization: str | None = Header(None)):
    sb = _sb()
    resolve_actor(sb, authorization)
    res = sb.table("sales").select("id, full_name, short_code, team, khoi, active").eq("active", True).order("full_name").execute()
    return res.data or []

@app.get("/api/v1/payments/master/channels")
async def list_channels_master(authorization: str | None = Header(None)):
    sb = _sb()
    resolve_actor(sb, authorization)
    res = sb.table("channels").select("id, channel_code, name, type").order("type").execute()
    return res.data or []

@app.get("/api/v1/payments/master/packages")
async def list_packages_master(authorization: str | None = Header(None)):
    sb = _sb()
    resolve_actor(sb, authorization)
    res = sb.table("packages").select("id, name, fixed").order("name").execute()
    return res.data or []
```

---

## Việc 5 — BE: PATCH + refund/restore + DELETE (2h)

```python
class PaymentPatch(BaseModel):
    uid: str | None = None
    pay_time: datetime | None = None
    real_pay_vnd: float | None = None
    gmv_rmb: float | None = None
    sale_id: str | None = None
    channel_id: str | None = None
    package_id: str | None = None
    payment_seq: str | None = None
    note: str | None = None


@app.patch("/api/v1/payments/{payment_id}")
async def patch_payment(payment_id: str, body: PaymentPatch, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "payments")

    update = {k: v for k, v in body.dict(exclude_none=True).items()}

    # Nếu đổi pay_time/real_pay_vnd/gmv_rmb → tính lại gmv_final
    if any(k in update for k in ("pay_time", "real_pay_vnd", "gmv_rmb")):
        # Lấy row hiện tại để merge
        current = sb.table("payments").select("pay_time, real_pay_vnd, gmv_rmb").eq("payment_id", payment_id).single().execute()
        cur = current.data
        pt = update.get("pay_time") or cur["pay_time"]
        rpv = update.get("real_pay_vnd") or cur["real_pay_vnd"]
        grmb = update.get("gmv_rmb") or cur.get("gmv_rmb")
        pt_dt = datetime.fromisoformat(pt) if isinstance(pt, str) else pt
        update["gmv_final"] = float(compute_gmv_final(pt_dt, Decimal(str(rpv)), Decimal(str(grmb)) if grmb else None))

    if "sale_id" in update:
        sale = sb.table("sales").select("team").eq("id", update["sale_id"]).single().execute()
        update["team"] = sale.data.get("team", "")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    res = sb.table("payments").update(update).eq("payment_id", payment_id).execute()
    return res.data[0] if res.data else {"ok": True}


@app.post("/api/v1/payments/{payment_id}/refund")
async def refund_payment(payment_id: str, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "payments")
    sb.table("payments").update({"status": "refunded", "updated_at": datetime.now(timezone.utc).isoformat()}).eq("payment_id", payment_id).execute()
    return {"ok": True, "status": "refunded"}


@app.post("/api/v1/payments/{payment_id}/restore")
async def restore_payment(payment_id: str, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "payments")
    sb.table("payments").update({"status": "active", "updated_at": datetime.now(timezone.utc).isoformat()}).eq("payment_id", payment_id).execute()
    return {"ok": True, "status": "active"}


@app.post("/api/v1/payments/{payment_id}/link-crm")
async def link_crm(payment_id: str, body: dict, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "payments")
    sb.table("payments").update({
        "crm_order_id": body["crm_order_id"],
        "crm_activated": True,
        "activated_at": date.today().isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("payment_id", payment_id).execute()
    return {"ok": True}


@app.delete("/api/v1/payments/{payment_id}")
async def delete_payment(payment_id: str, authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    # Chỉ system mới được xóa
    from rbac import require_min_role
    require_min_role(actor, "system")
    sb.table("payments").update({"deleted_at": datetime.now(timezone.utc).isoformat()}).eq("payment_id", payment_id).execute()
    return {"ok": True}
```

---

## Việc 6 — CRUD Master (Top 2, 2h)

Thêm vào `payment_routes.py` — CRUD đơn giản cho 4 bảng master:

```python
# POST /api/v1/payments/master/sales — tạo sale mới
# PATCH /api/v1/payments/master/sales/{id} — sửa short_code, team, khoi, active
# POST /api/v1/payments/master/channels — tạo kênh
# PATCH /api/v1/payments/master/channels/{id}
# POST /api/v1/payments/master/packages — tạo gói
# PATCH /api/v1/payments/master/packages/{id}
# PATCH /api/v1/payments/master/customers/{uid} — sửa tên/SĐT
```

Pattern giống các endpoint GET ở trên — require `manager+`.

---

## Việc 7 — Config tỷ giá GMV (30m)

Hiện tại hard-code `GMV_EXCHANGE_RATE = 3700` trong `payment_routes.py`. Sau có thể:
- Tạo bảng `config` (key-value) trên Supabase
- Hoặc dùng env var `GMV_EXCHANGE_RATE`
- GĐ1: hard-code đủ dùng, system admin sửa tay khi cần

---

## Checklist xong

- [ ] 5 bảng chính + 2 bảng tương lai đã tạo trên Supabase
- [ ] ~28k dòng đã migrate vào `payments`, verify count
- [ ] Master `sales` đã review tay (short_code + team mapping đúng)
- [ ] `GET /payments` trả data + summary, filter hoạt động
- [ ] `POST /payments` tạo được record mới, `gmv_final` tự tính
- [ ] `PATCH`, refund, restore, link-crm hoạt động
- [ ] `DELETE` soft delete (chỉ system)
- [ ] Master dropdown endpoints trả data
- [ ] File mới `backend/payment_routes.py` đã register vào `main.py`
