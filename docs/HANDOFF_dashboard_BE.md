# Handoff — Dashboard BE: 3 việc còn lại cho endpoint gamification

**Cập nhật:** 30/05/2026 — sau khi audit commits của Giang + Đạt

**File chính:** `backend/dashboard_routes.py`
**Endpoint chính:** `GET /api/v1/dashboard/summary`
**RPC SQL:** `docs/sql/dashboard_rpc.sql`

---

## Trạng thái hiện tại — ai đã làm gì

### Giang (feature-kem @ dc1f855)
- ✅ Tạo Supabase RPC `get_top_sales` — query `payment_lines` (status='paid') JOIN `payment_requests` → **tiền chuyển thực tế** (đúng yêu cầu anh Hiếu)
- ✅ Hàm `_load_top_sales_rpc(sb, start_utc, end_utc, limit)` gọi RPC
- ✅ Timezone handling VN (`_vn_day_bounds_utc`, `_vn_month_bounds_utc`)
- ✅ Static tasks/events khớp prototype
- ✅ `_build_gamification_summary` dùng RPC thay vì query trực tiếp

### Đạt (main @ 25fa084)
- ✅ `_personalize_ranking(top_sales, actor_crm_name, actor_team)` — tìm rank user
- ✅ `_gap_to_above(top_sales, user_idx, user_gmv)` — tính khoảng cách tới người trên
- ✅ Auth handling: `Authorization` header → `resolve_actor` → `crm_name`
- ✅ Trả `my_rank` trong response
- ⚠️ **CHỈ** wired vào `/dashboard/live_summary` + `/dashboard/summary` — **CHƯA** wired vào `/api/v1/dashboard/summary`

---

## Còn 3 việc cần làm

### Việc 1 — Tăng limit RPC cho bảng xếp hạng tháng

**Vấn đề:** `_load_top_sales_rpc` gọi với `p_limit=5` (default) → bảng xếp hạng chỉ hiện 5 sales thay vì toàn bộ (~168).

**Cách fix:** Trong `_build_gamification_summary`, gọi RPC với limit cao cho `top_month`:

```python
top_today = _load_top_sales_rpc(sb, today_start_utc, today_end_utc, limit=5)
top_month = _load_top_sales_rpc(sb, month_start_utc, month_end_utc, limit=999)
```

**File:** `backend/dashboard_routes.py` — hàm `_build_gamification_summary`

---

### Việc 2 — Thêm `team` + `sub_team` vào response

**Vấn đề:** RPC `get_top_sales` trả `sale_email, sale_name, avatar_url, total_revenue` — không có team/sub_team. FE cần hiện 2 cột riêng.

**Cách làm — Option A (sửa RPC):**
```sql
-- Thêm vào SELECT trong get_top_sales:
ns.team,
ns.sub_team,
-- Thêm vào GROUP BY:
GROUP BY pr.sale_email, ns.display_name, ns.avatar_url, ns.team, ns.sub_team
-- Thêm vào RETURNS TABLE:
team text,
sub_team text,
```

**Cách làm — Option B (lookup sau khi gọi RPC):**
```python
# Sau khi có kết quả từ RPC, bulk lookup nhan_su_sale
staff_res = sb.table("nhan_su_sale").select("email, team, sub_team").execute()
staff_map = {}
for s in staff_res.data or []:
    email = (s.get("email") or "").strip().lower()
    if email:
        staff_map[email] = (s.get("team") or "", s.get("sub_team") or "")

# Gán vào TopSale
for sale in result:
    team_info = staff_map.get(sale.id.lower(), ("", ""))  # sale.id = sale_email
    sale.team = team_info[0] or None
    sale.sub_team = team_info[1] or None
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

**File:** `backend/dashboard_routes.py` + (nếu Option A) `docs/sql/dashboard_rpc.sql`

---

### Việc 3 — Wire personalization vào endpoint `/api/v1/dashboard/summary`

**Vấn đề:** Đạt đã viết `_personalize_ranking` + `_gap_to_above` nhưng chỉ wired vào 2 endpoint cũ (`/dashboard/live_summary`, `/dashboard/summary`). Endpoint mà FE dashboard thực sự dùng (`/api/v1/dashboard/summary`) chưa có personalization.

**Cách làm:**

1. Endpoint nhận `Authorization` header:
```python
@app.get("/api/v1/dashboard/summary", ...)
def gamification_dashboard_summary(authorization: str | None = Header(None)):
    sb = supabase_factory()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình")
    
    crm_name = None
    if authorization:
        try:
            actor = resolve_actor(sb, authorization)
            crm_name = (actor.staff or {}).get("crm_name")
        except Exception:
            pass
    
    return _build_gamification_summary(sb, crm_name=crm_name)
```

2. `_build_gamification_summary` nhận `crm_name`, dùng `_personalize_ranking` của Đạt:
```python
def _build_gamification_summary(sb, crm_name: str | None = None) -> DashboardSummary:
    ...
    # Reuse Đạt's logic (nhưng cần adapt vì top_month ở đây là list[TopSale], không phải list[dict])
    current_user = None
    if crm_name and top_month:
        for i, sale in enumerate(top_month):
            if sale.name == crm_name:
                rank = i + 1
                above = top_month[i - 1] if i > 0 else None
                current_user = {
                    "rank": rank,
                    "name": sale.name,
                    "revenue": sale.revenue,
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
    top_today: list[TopSale]
    top_month: list[TopSale]
    tasks: list[TaskItem]
    events: list[EventItem]
    commission: Commission
    current_user: dict | None = None   # ← NEW
```

**Import cần thêm** (nếu chưa có từ code Đạt):
```python
from fastapi import HTTPException, Query, Header
from rbac import resolve_actor
```

**File:** `backend/dashboard_routes.py`

---

## FE cần biết

Response `GET /api/v1/dashboard/summary` sau khi hoàn thành sẽ có:

```jsonc
{
  "top_today": [
    { "id": "email@...", "name": "Tên Sale", "revenue": 86000000, "team": "Inhouse 1", "sub_team": "Ca Ganh" }
  ],
  "top_month": [
    // tương tự, có thể 100+ items
  ],
  "tasks": [ /* static */ ],
  "events": [ /* static */ ],
  "commission": { "status": "coming_soon", "amount": 0 },
  "current_user": {                    // null nếu không đăng nhập hoặc không tìm thấy
    "rank": 40,
    "name": "Nguyễn Văn A",
    "revenue": 470000000,
    "total_sales": 168,
    "next_rank_name": "Hồ Anh Tú",
    "next_rank_revenue": 485000000,
    "gap": 15000000
  }
}
```

Tất cả field mới đều optional → FE cũ vẫn hoạt động bình thường.
