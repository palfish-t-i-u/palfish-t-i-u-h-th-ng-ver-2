# Handoff — Giang: BE báo cáo + đối soát nội bộ module Doanh thu

**Ngày:** 2026-06-07
**Spec đầy đủ:** `docs/SPEC_DOANH_THU.md`
**Phụ thuộc:** Đức phải tạo xong DB + migration trước (bảng `payments`, `sales`, `channels` phải có data)

---

## Tổng quan việc cần làm

| # | Việc | Ưu tiên | Giờ |
|---|------|---------|-----|
| 1 | BE: đối soát nội bộ (`GET /recon/internal`) | Top 1 | 2h |
| 2 | BE: báo cáo BCTB (`GET /reports/bctb`) | Top 2 | 2h |
| 3 | BE: báo cáo theo team (`GET /reports/team`) | Top 2 | 1h |
| 4 | BE: báo cáo theo kênh (`GET /reports/channel`) | Top 2 | 1h |
| 5 | BE: export Excel cho báo cáo | Top 2 | 1h |

**GĐ2 (CHƯA LÀM):** đối soát ngân hàng, đối soát CRM — bỏ qua ở GĐ1.

---

## File mới: `backend/payment_report_routes.py`

Pattern giống `report_routes.py`. Tạo file mới, register vào `main.py`.

```python
# main.py — thêm:
from payment_report_routes import register_payment_report_routes
register_payment_report_routes(app, _supabase)
```

---

## Việc 1 — Đối soát nội bộ (Top 1, 2h)

Endpoint: `GET /api/v1/recon/internal`

**Mục đích:** Phát hiện dòng có vấn đề trong bảng `payments` — trùng, thiếu trường, sale/kênh lạ, lệch tỷ giá. Giống Tab 4 "Cảnh báo" của app Streamlit hiện tại.

**Logic:**

```python
@app.get("/api/v1/recon/internal")
async def recon_internal(authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_access(sb, actor, "payments")

    warnings = []

    # --- 1. Trùng khoá nghiệp vụ ---
    # Query tìm (uid, pay_time, real_pay_vnd) xuất hiện > 1 lần
    # Supabase client không hỗ trợ GROUP BY + HAVING
    # → dùng RPC hoặc query raw
    dup_sql = """
      select uid, pay_time, real_pay_vnd, count(*) as cnt
      from payments
      where deleted_at is null
      group by uid, pay_time, real_pay_vnd
      having count(*) > 1
      limit 100
    """
    dup_res = sb.rpc("exec_sql", {"query": dup_sql}).execute()
    # HOẶC: tạo Postgres function `get_duplicate_payments()` trả bảng
    for row in (dup_res.data or []):
        warnings.append({
            "type": "duplicate",
            "message": f"Trùng đơn: uid={row['uid']}, ngày={row['pay_time']}, tiền={row['real_pay_vnd']} ({row['cnt']} lần)",
            "uid": row["uid"],
            "pay_time": row["pay_time"],
        })

    # --- 2. Thiếu trường bắt buộc ---
    missing_res = sb.table("payments").select("payment_id, uid, pay_time") \
        .is_("deleted_at", "null") \
        .or_("sale_id.is.null,real_pay_vnd.is.null,team.is.null") \
        .limit(100).execute()
    for row in (missing_res.data or []):
        warnings.append({
            "type": "missing_field",
            "message": f"Thiếu trường bắt buộc",
            "payment_id": row["payment_id"],
            "uid": row["uid"],
        })

    # --- 3. Sale/kênh lạ (sale_id không tồn tại trong master) ---
    # Query payments where sale_id NOT IN (select id from sales)
    orphan_sql = """
      select p.payment_id, p.uid, p.sale_id
      from payments p
      left join sales s on s.id = p.sale_id
      where p.deleted_at is null and s.id is null
      limit 100
    """
    # Hoặc tạo RPC

    # --- 4. Lệch tỷ giá (đơn từ 01/06, có gmv_rmb, kiểm tra VND/RMB lệch ngưỡng) ---
    # Quy tắc: nếu real_pay_vnd / gmv_rmb lệch quá ±20% so với 3700 → cảnh báo
    rate_sql = """
      select payment_id, uid, real_pay_vnd, gmv_rmb,
             real_pay_vnd / nullif(gmv_rmb, 0) as actual_rate
      from payments
      where deleted_at is null
        and pay_time >= '2026-06-01'
        and gmv_rmb is not null
        and gmv_rmb > 0
        and abs(real_pay_vnd / gmv_rmb - 3700) / 3700 > 0.2
      limit 100
    """

    # --- 5. Control totals theo ngày ---
    # Tổng đơn + tổng VND + tổng GMV group by date
    # Hiển thị để cross-check, không phải warning

    return {"warnings": warnings, "total": len(warnings)}
```

**Lưu ý về RPC/raw SQL:**

Supabase client Python không hỗ trợ GROUP BY/HAVING trực tiếp. 2 cách:

**Cách 1 (khuyên dùng):** Tạo Postgres function trên Supabase SQL Editor:

```sql
create or replace function get_payment_warnings()
returns table (
  warning_type text,
  payment_id uuid,
  uid text,
  pay_time timestamptz,
  real_pay_vnd numeric,
  message text
) language sql as $$
  -- Trùng
  select 'duplicate'::text, null::uuid, p.uid, p.pay_time, p.real_pay_vnd,
         format('Trùng %s lần', count(*))
  from payments p where p.deleted_at is null
  group by p.uid, p.pay_time, p.real_pay_vnd having count(*) > 1

  union all

  -- Lệch tỷ giá
  select 'rate_mismatch', p.payment_id, p.uid, p.pay_time, p.real_pay_vnd,
         format('Tỷ giá thực tế: %s (kỳ vọng ~3700)', round(p.real_pay_vnd / nullif(p.gmv_rmb, 0)))
  from payments p
  where p.deleted_at is null and p.pay_time >= '2026-06-01'
    and p.gmv_rmb > 0
    and abs(p.real_pay_vnd / p.gmv_rmb - 3700) / 3700 > 0.2
$$;
```

Gọi: `sb.rpc("get_payment_warnings").execute()`

**Cách 2:** Fetch toàn bộ payments (28k dòng) rồi xử lý trong Python — chậm hơn nhưng đơn giản.

**Response format:**

```json
{
  "warnings": [
    {
      "type": "duplicate",
      "message": "Trùng đơn: uid=abc123, ngày=2026-05-15, tiền=5550000 (2 lần)",
      "uid": "abc123",
      "pay_time": "2026-05-15T10:00:00",
      "payment_id": null
    },
    {
      "type": "rate_mismatch",
      "message": "Tỷ giá thực tế: 4200 (kỳ vọng ~3700)",
      "uid": "def456",
      "payment_id": "uuid-xxx"
    }
  ],
  "total": 15
}
```

---

## Việc 2 — Báo cáo BCTB (Top 2, 2h)

Endpoint: `GET /api/v1/reports/bctb?from=2026-06-01&to=2026-06-30`

**Mục đích:** Pivot table — hàng = sale (short_code + team), cột = từng ngày, giá trị = GMV / số đơn.

**Logic:**

```python
@app.get("/api/v1/reports/bctb")
async def report_bctb(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    authorization: str | None = Header(None),
):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_access(sb, actor, "payments")

    # 1. Query payments trong khoảng ngày, status=active
    res = sb.table("payments") \
        .select("pay_time, real_pay_vnd, gmv_final, gmv_rmb, sale_id") \
        .is_("deleted_at", "null") \
        .eq("status", "active") \
        .gte("pay_time", date_from.isoformat()) \
        .lte("pay_time", f"{date_to.isoformat()}T23:59:59") \
        .execute()
    rows = res.data or []

    # 2. Load sales master (short_code, team, khoi)
    sales_res = sb.table("sales").select("id, short_code, team, khoi").execute()
    sales_map = {s["id"]: s for s in (sales_res.data or [])}

    # 3. Pivot: group by (sale_id, date) → {gmv_vnd, gmv_rmb, count}
    from collections import defaultdict
    pivot = defaultdict(lambda: defaultdict(lambda: {"gmv_vnd": 0, "gmv_rmb": 0, "gmv_final": 0, "count": 0}))

    for r in rows:
        sale_id = r["sale_id"]
        day = r["pay_time"][:10]  # "2026-06-07"
        cell = pivot[sale_id][day]
        cell["gmv_vnd"] += float(r.get("real_pay_vnd") or 0)
        cell["gmv_rmb"] += float(r.get("gmv_rmb") or 0)
        cell["gmv_final"] += float(r.get("gmv_final") or 0)
        cell["count"] += 1

    # 4. Build response
    result = []
    for sale_id, days in pivot.items():
        sale = sales_map.get(sale_id, {})
        result.append({
            "sale_id": sale_id,
            "short_code": sale.get("short_code", "?"),
            "team": sale.get("team", "?"),
            "khoi": sale.get("khoi", "?"),
            "days": dict(days),
            "total": {
                "gmv_vnd": sum(d["gmv_vnd"] for d in days.values()),
                "gmv_rmb": sum(d["gmv_rmb"] for d in days.values()),
                "gmv_final": sum(d["gmv_final"] for d in days.values()),
                "count": sum(d["count"] for d in days.values()),
            }
        })

    # Sắp theo khối → team → short_code
    result.sort(key=lambda x: (x["khoi"] or "", x["team"] or "", x["short_code"] or ""))

    return {
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "rows": result,
    }
```

**Response format:**

```json
{
  "from": "2026-06-01",
  "to": "2026-06-30",
  "rows": [
    {
      "sale_id": "uuid",
      "short_code": "LyVC",
      "team": "Stellar - Nina",
      "khoi": "Stellar Garden",
      "days": {
        "2026-06-01": { "gmv_vnd": 5550000, "gmv_rmb": 1500, "gmv_final": 1500, "count": 1 },
        "2026-06-02": { "gmv_vnd": 11100000, "gmv_rmb": 3000, "gmv_final": 3000, "count": 2 }
      },
      "total": { "gmv_vnd": 16650000, "gmv_rmb": 4500, "gmv_final": 4500, "count": 3 }
    }
  ]
}
```

**Lưu ý quan trọng:**
- Team trong BCTB lấy từ `sales.team` (chính xác), KHÔNG dùng `payments.team` (thô).
- Tên hiển thị = `sales.short_code`, không dùng `full_name`.
- Khoảng Trials & Referral **chừa chỗ** — response có thể thêm field sau, GĐ1 không có data.

---

## Việc 3 — Báo cáo theo Team (Top 2, 1h)

Endpoint: `GET /api/v1/reports/team?from=&to=`

```python
@app.get("/api/v1/reports/team")
async def report_team(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    authorization: str | None = Header(None),
):
    # Tương tự BCTB nhưng group by (team, khoi) thay vì sale_id
    # Response:
    # { "rows": [
    #     { "team": "Stellar - Nina", "khoi": "Stellar Garden",
    #       "gmv_final": 150000, "real_pay_vnd": 555000000, "count": 100 }
    # ]}
```

---

## Việc 4 — Báo cáo theo Kênh (Top 2, 1h)

Endpoint: `GET /api/v1/reports/channel?from=&to=`

```python
@app.get("/api/v1/reports/channel")
async def report_channel(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    authorization: str | None = Header(None),
):
    # Group by channels.type
    # Response:
    # { "rows": [
    #     { "channel_type": "Ads", "gmv_final": 500000, "real_pay_vnd": 1850000000, "count": 200 },
    #     { "channel_type": "Renewal", "gmv_final": 300000, ... }
    # ]}
```

---

## Việc 5 — Export Excel (Top 2, 1h)

Endpoint: `GET /api/v1/reports/{type}/export?from=&to=`

Dùng thư viện `openpyxl` (đã có trong project) hoặc `xlsxwriter`.

```python
from fastapi.responses import StreamingResponse
import io, openpyxl

@app.get("/api/v1/reports/{report_type}/export")
async def export_report(
    report_type: str,  # "bctb" | "team" | "channel"
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    authorization: str | None = Header(None),
):
    # 1. Gọi lại logic báo cáo tương ứng (refactor thành function chung)
    # 2. Render vào workbook
    # 3. Trả StreamingResponse

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = report_type.upper()
    # ... fill data ...

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"report_{report_type}_{date_from}_{date_to}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

---

## Checklist xong

- [ ] `GET /recon/internal` trả danh sách warnings (trùng, thiếu, lệch tỷ giá)
- [ ] Postgres function `get_payment_warnings()` đã tạo (nếu dùng cách 1)
- [ ] `GET /reports/bctb` trả pivot day×sale với GMV VND/RMB/count
- [ ] `GET /reports/team` trả tổng theo team/khối
- [ ] `GET /reports/channel` trả tổng theo channel type
- [ ] Export Excel hoạt động cho cả 3 loại báo cáo
- [ ] File `backend/payment_report_routes.py` đã register vào `main.py`
