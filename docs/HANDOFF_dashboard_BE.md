# Handoff — Dashboard BE: 3 việc còn lại cho endpoint gamification

**Cập nhật:** 30/05/2026 16:00 — bổ sung notes từ Đức (match email, schema VND, dead code)

**File chính:** `backend/dashboard_routes.py`
**Endpoint chính:** `GET /api/v1/dashboard/summary`
**RPC SQL:** `docs/sql/dashboard_rpc.sql`

---

## Trạng thái hiện tại — ai đã làm gì

### Giang (feature-kem → main)
- ✅ Supabase RPC `get_top_sales` — query `payment_lines` (status='paid') JOIN `payment_requests` → **tiền chuyển thực tế**
- ✅ `_load_top_sales_rpc(sb, start_utc, end_utc, limit)` gọi RPC
- ✅ RPC trả: `sale_email`, `sale_name` (= display_name hoặc email prefix), `avatar_url`, `total_revenue`
- ✅ `TopSale.id = sale_email` (KHÔNG phải crm_name)
- ✅ Timezone VN (`_vn_day_bounds_utc`, `_vn_month_bounds_utc`)
- ✅ Static tasks/events khớp prototype

### Đạt (main)
- ✅ `_personalize_ranking` + `_gap_to_above` — tìm rank + gap
- ⚠️ **CHỈ** wired vào `/dashboard/live_summary` + `/dashboard/summary` — **CHƯA** wired vào `/api/v1/dashboard/summary`
- ⚠️ Logic match: so khớp `sale_name == actor_crm_name` — **SAI** vì RPC trả `sale_name = display_name`, không phải `crm_name`
- ⚠️ Schema: dùng `gmv_rmb` / `collected_vnd` (CRM unit) — gamification endpoint dùng `revenue` (VND từ payment_lines) → **KHÔNG reuse nguyên được**

### Dead code
- `_query_top_sales` (dòng 125-148) — query `so_doanh_thu`, không ai gọi nữa. Xóa sau khi ổn định.

### Prod hiện tại
- `top_today=0, top_month=0` — đúng vì đã cleanup test data, chưa có giao dịch thật nào trong `payment_lines`.

---

## ⚡ LƯU Ý QUAN TRỌNG (từ Đức)

### 1. Match user phải dùng EMAIL, không dùng tên
RPC trả `sale_name = display_name` hoặc email prefix — KHÔNG phải `crm_name`.
→ Khi personalize, match `TopSale.id` (= `sale_email`) ↔ `actor.email`, KHÔNG dùng `sale.name == actor_crm_name`.

### 2. Schema current_user phải dùng `revenue` (VND), không dùng `gmv_rmb`
Code Đạt (`_personalize_ranking`) dùng `gmv_rmb` / `collected_vnd` — đây là unit CRM.
Gamification endpoint dùng `TopSale.revenue` — đây là VND thực từ `payment_lines`.
→ Viết hàm personalize riêng, **không reuse** `_personalize_ranking` nguyên bản.

---

## Còn 3 việc cần làm

### Việc 1 — Tăng limit RPC cho bảng xếp hạng tháng

**Vấn đề:** `_load_top_sales_rpc` gọi với `p_limit=5` (default) → chỉ hiện 5 sales.

**Fix:** Trong `_build_gamification_summary`:
```python
top_today = _load_top_sales_rpc(sb, today_start_utc, today_end_utc, limit=5)
top_month = _load_top_sales_rpc(sb, month_start_utc, month_end_utc, limit=999)
```

**File:** `backend/dashboard_routes.py` — hàm `_build_gamification_summary` (dòng 151)

---

### Việc 2 — Thêm `team` + `sub_team` vào response

**Vấn đề:** RPC không trả team/sub_team. FE cần 2 cột riêng.

**Cách làm — Option A (sửa RPC — khuyên dùng):**
```sql
-- Sửa docs/sql/dashboard_rpc.sql, thêm vào RETURNS TABLE:
team text,
sub_team text,
-- Thêm vào SELECT:
ns.team,
ns.sub_team,
-- Thêm vào GROUP BY:
GROUP BY pr.sale_email, ns.display_name, ns.avatar_url, ns.team, ns.sub_team
```

**Cách làm — Option B (lookup sau):**
```python
# Bulk lookup nhan_su_sale bằng email
staff_res = sb.table("nhan_su_sale").select("email, team, sub_team").execute()
staff_map = {
    (s.get("email") or "").strip().lower(): (s.get("team") or "", s.get("sub_team") or "")
    for s in (staff_res.data or [])
}
for sale in result:
    t = staff_map.get(sale.id.lower(), ("", ""))  # sale.id = sale_email
    sale.team = t[0] or None
    sale.sub_team = t[1] or None
```

**Model TopSale cần thêm:**
```python
class TopSale(BaseModel):
    id: str
    name: str
    revenue: int
    avatar_url: str | None = None
    team: str | None = None       # ← NEW
    sub_team: str | None = None   # ← NEW
```

**File:** `backend/dashboard_routes.py` + (nếu Option A) Supabase SQL Editor

---

### Việc 3 — Wire personalization vào `/api/v1/dashboard/summary`

**Vấn đề:** Endpoint gamification chưa có personalization.

**⚠️ KHÔNG reuse `_personalize_ranking` nguyên bản** — schema khác (gmv_rmb vs revenue).

**Cách làm:**

1. Endpoint nhận `Authorization` header + resolve actor **email** (không phải crm_name):
```python
@app.get("/api/v1/dashboard/summary", ...)
def gamification_dashboard_summary(authorization: str | None = Header(None)):
    sb = supabase_factory()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình")
    
    actor_email = None
    if authorization:
        try:
            actor = resolve_actor(sb, authorization)
            actor_email = actor.email  # dùng email, KHÔNG dùng crm_name
        except Exception:
            pass
    
    return _build_gamification_summary(sb, actor_email=actor_email)
```

2. Personalize riêng trong `_build_gamification_summary`, match bằng **email** (= `TopSale.id`):
```python
def _build_gamification_summary(sb, actor_email: str | None = None) -> DashboardSummary:
    ...
    current_user = None
    if actor_email and top_month:
        email_lower = actor_email.strip().lower()
        for i, sale in enumerate(top_month):
            if sale.id.strip().lower() == email_lower:  # sale.id = sale_email
                rank = i + 1
                above = top_month[i - 1] if i > 0 else None
                current_user = {
                    "rank": rank,
                    "name": sale.name,
                    "revenue": sale.revenue,           # VND thực
                    "total_sales": len(top_month),
                    "next_rank_name": above.name if above else None,
                    "next_rank_revenue": above.revenue if above else None,
                    "gap": (above.revenue - sale.revenue) if above else 0,
                }
                break
    
    return DashboardSummary(..., current_user=current_user)
```

3. Mở rộng `DashboardSummary`:
```python
class DashboardSummary(BaseModel):
    ...
    current_user: dict | None = None   # ← NEW
```

**Import cần thêm:**
```python
from fastapi import HTTPException, Query, Header
from rbac import resolve_actor
```

---

## FE cần biết

Response `GET /api/v1/dashboard/summary` sau khi hoàn thành:

```jsonc
{
  "top_today": [
    { "id": "sale@email.com", "name": "Tên Sale", "revenue": 86000000,
      "team": "Inhouse 1", "sub_team": "Ca Ganh" }
  ],
  "top_month": [
    // tương tự, có thể 100+ items
  ],
  "tasks": [ /* static */ ],
  "events": [ /* static */ ],
  "commission": { "status": "coming_soon", "amount": 0 },
  "current_user": {                    // null nếu không login hoặc chưa có doanh thu
    "rank": 40,
    "name": "Nguyễn Văn A",
    "revenue": 470000000,              // VND thực từ payment_lines
    "total_sales": 168,
    "next_rank_name": "Hồ Anh Tú",
    "next_rank_revenue": 485000000,
    "gap": 15000000
  }
}
```

**FE types cần cập nhật** (`frontend/src/types/dashboard.ts`):
```typescript
export interface GamificationTopSale {
  id: string;          // = sale_email
  name: string;
  revenue: number;
  avatar_url?: string | null;
  team?: string | null;       // ← NEW
  sub_team?: string | null;   // ← NEW
}

export interface GamificationCurrentUser {
  rank: number;
  name: string;
  revenue: number;
  total_sales: number;
  next_rank_name?: string | null;
  next_rank_revenue?: number | null;
  gap: number;
}

export interface GamificationDashboardSummary {
  ...
  current_user?: GamificationCurrentUser | null;  // ← NEW
}
```

Tất cả field mới đều optional → FE cũ vẫn hoạt động bình thường.
