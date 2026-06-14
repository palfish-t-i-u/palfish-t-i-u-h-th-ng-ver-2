# Handoff Đức — Đợt 2 (PR3 + PR4 + PR6) — 13/06/2026

> Đức đã xong PR1 BE restore + PR2 (5 bug đối soát) sáng nay. Đợt này 3 PR mới.
> Tổng ước ~10-12h, chia làm **3 commits riêng**.
> Đọc context: [docs/bug-hunt-report-2026-06-13.md](bug-hunt-report-2026-06-13.md).

## Tổng quan 3 commits

| Commit | Thuộc PR | Việc | Thời gian |
|--------|----------|------|-----------|
| **Commit 3** | PR3 (mixed BE+FE) | Chặn create_payment_line khi PR đã đủ tiền | ~30 phút |
| **Commit 4** | PR4 (mixed BE+FE+DB) | Notify in-app + tỷ giá theo ngày + chống nhập trùng sổ + fix dedup GSheet | ~6-8h |
| **Commit 5** | PR6 (BE + DB config) | Bỏ normalize role "ops" → "system" để chị Hiền theo bảng phân quyền | ~30 phút |

---

## Việc 7 — Chặn create_payment_line khi PR đã đủ (Bug 1B-04, PR3)

**Bối cảnh nghiệp vụ**: Sale có thể tạo lần thanh toán dù PR đã thu đủ → state chuyển "Thừa", KPI lệch. FE sẽ disable nút + popup hướng dẫn (em làm), BE chặn defense-in-depth.

**Spec fix**: [`backend/payment_request_routes.py:1534-1635`](../backend/payment_request_routes.py:1534) hàm `create_payment_line` — sau check `state.lower() == "cancelled"`, thêm:

```python
target = _parse_amount(pr_row.get("target"))
received = _parse_amount(pr_row.get("received"))
if target > 0 and received >= target:
    raise HTTPException(
        400,
        {
            "code": "PR_ALREADY_FULL",
            "message": "PR đã nhận đủ tiền, cần tăng số tiền dự kiến để tạo thêm lần thanh toán",
            "received": received,
            "target": target,
        },
    )
```

**Test**:
```bash
# 1. Tạo PR sandbox target 5tr, thanh toán đủ
# 2. Gọi tạo thêm lần TT
curl -X POST .../payment-requests/PR-XXXX/payment-lines \
  -d '{"amount": 1000000, "method": "qr"}'
# Kỳ vọng: 400 với detail code=PR_ALREADY_FULL
```

**Commit message**:
```
fix(BE): chặn tạo lần TT khi PR đã thu đủ (PR3 1B-04 BE phần)

Sale spam tạo lần TT khi PR đã state=done → KPI chuyển "Thừa" lệch.
BE chặn 400 với code PR_ALREADY_FULL để FE catch hiển thị popup
hướng dẫn sale sửa Tổng tiền dự kiến trước.

FE phần (disable nút + popup + highlight ô target) sẽ Claude làm.

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Việc 8 — Notify in-app + tỷ giá + chống nhập trùng sổ + fix dedup GSheet (PR4)

PR4 là PR lớn nhất — Đức làm trong 1 commit nhưng nhiều subtask.

### 8.1. DB migration — 2 bảng mới

**File**: `docs/sql/notifications_exchange_rates.sql` (mới)

```sql
-- Bảng notifications: in-app notification cho sale khi ops xác nhận AR
CREATE TABLE IF NOT EXISTS notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_email  TEXT NOT NULL,
    kind        TEXT NOT NULL,  -- ar_confirmed, ar_rejected, pr_paid_full, ...
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ NULL
);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
    ON notifications (user_email, created_at DESC)
    WHERE read_at IS NULL;

-- Bảng exchange_rates: tỷ giá VND/RMB theo thời gian
CREATE TABLE IF NOT EXISTS exchange_rates (
    effective_from DATE PRIMARY KEY,
    rate           NUMERIC(10, 4) NOT NULL CHECK (rate > 0),
    note           TEXT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by     TEXT NULL
);

-- Seed sẵn 3700 cho mọi date trước hôm nay (fallback giữ behavior cũ)
INSERT INTO exchange_rates (effective_from, rate, note)
VALUES ('2020-01-01', 3700, 'Default historical rate (pre-feature)')
ON CONFLICT (effective_from) DO NOTHING;
```

### 8.2. Notification endpoints + hook

**File**: `backend/notification_routes.py` (mới)

```python
"""Notification routes — in-app inbox cho sale."""
from fastapi import APIRouter, Header, HTTPException
from rbac import resolve_actor

def register_notification_routes(app, get_supabase):
    router = APIRouter(prefix="/api/v1/notifications", tags=["Notifications"])
    
    @router.get("")
    def list_notifications(
        unread: bool = False,
        limit: int = 20,
        authorization: str | None = Header(None),
    ):
        sb = get_supabase()
        actor = resolve_actor(sb, authorization)
        q = sb.table("notifications").select("*").eq("user_email", actor.email.lower())
        if unread:
            q = q.is_("read_at", "null")
        res = q.order("created_at", desc=True).limit(limit).execute()
        return {"notifications": res.data or []}
    
    @router.post("/{notification_id}/read")
    def mark_read(notification_id: str, authorization: str | None = Header(None)):
        sb = get_supabase()
        actor = resolve_actor(sb, authorization)
        from datetime import datetime, timezone
        res = (
            sb.table("notifications")
            .update({"read_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", notification_id)
            .eq("user_email", actor.email.lower())  # security: chỉ mark of self
            .execute()
        )
        if not res.data:
            raise HTTPException(404, "Khong tim thay notification")
        return {"ok": True}
    
    @router.post("/mark-all-read")
    def mark_all_read(authorization: str | None = Header(None)):
        sb = get_supabase()
        actor = resolve_actor(sb, authorization)
        from datetime import datetime, timezone
        sb.table("notifications").update(
            {"read_at": datetime.now(timezone.utc).isoformat()}
        ).eq("user_email", actor.email.lower()).is_("read_at", "null").execute()
        return {"ok": True}
    
    app.include_router(router)
```

**Hook insert vào `activation_routes.py`** sau `sync_ledger_from_ar_course` (line 1266):

```python
# Sau khi ops fill order_id thành công → notify sale
if ledger_id:
    pr_id_for_notify = str(row.get("pr_id") or "")
    if pr_id_for_notify:
        pr_for_notify = _fetch_payment_request(sb, pr_id_for_notify)
        sale_email = _clean_text(pr_for_notify.get("sale_email"))
        if sale_email:
            try:
                sb.table("notifications").insert({
                    "user_email": sale_email.lower(),
                    "kind": "ar_confirmed",
                    "payload": {
                        "ar_id": ar_id,
                        "pr_id": pr_id_for_notify,
                        "course_code": course_code,
                        "order_id": order_id,
                        "customer_name": pr_for_notify.get("name"),
                    },
                }).execute()
            except Exception as exc:
                print(f"[notify] insert failed (non-blocking): {exc}")
```

**Register routes** trong `main.py` cùng các register khác.

### 8.3. Tỷ giá lookup theo ngày

**File**: `backend/revenue_routes.py` — thêm helper:

```python
def get_rate_for_date(sb, target_date: date) -> Decimal:
    """Lookup rate có effective_from <= target_date mới nhất. Fallback 3700."""
    try:
        res = (
            sb.table("exchange_rates")
            .select("rate")
            .lte("effective_from", target_date.isoformat())
            .order("effective_from", desc=True)
            .limit(1)
            .execute()
        )
        if res.data:
            return Decimal(str(res.data[0]["rate"]))
    except Exception as exc:
        print(f"[exchange_rates] lookup failed: {exc}")
    return Decimal("3700")
```

Thay `3700` ở [`revenue_routes.py:1379`](../backend/revenue_routes.py:1379) và `:1459` bằng `get_rate_for_date(sb, ngay)`.

**Endpoint CRUD exchange_rates** (cho FE admin UI):
```python
@app.get("/api/v1/exchange-rates")
def list_rates(authorization: str | None = Header(None)):
    sb = supabase_factory()
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "manager")
    res = sb.table("exchange_rates").select("*").order("effective_from", desc=True).execute()
    return {"rates": res.data or []}

@app.post("/api/v1/exchange-rates")
def create_rate(body: dict, authorization: str | None = Header(None)):
    sb = supabase_factory()
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "manager")
    # body: {effective_from: "YYYY-MM-DD", rate: 3650, note: "..."}
    payload = {**body, "created_by": actor.email}
    res = sb.table("exchange_rates").upsert(payload).execute()
    return {"rate": (res.data or [{}])[0]}

# Optional: DELETE rate (admin only)
```

### 8.4. Chống nhập tay trùng sổ doanh thu (Bug 3-05)

**File**: `backend/revenue_routes.py:1371` `create_ledger` — trước `sb.table("so_doanh_thu").insert(payload).execute()`:

```python
# Check duplicate: same uid + ngay_tien_ve + so_tien_vnd + loai_nhap='tay'
dup_res = (
    sb.table("so_doanh_thu")
    .select("id")
    .eq("uid", payload["uid"])
    .eq("ngay_tien_ve", payload["ngay_tien_ve"])
    .eq("so_tien_vnd", payload["so_tien_vnd"])
    .eq("loai_nhap", "tay")
    .limit(1)
    .execute()
)
if dup_res.data:
    raise HTTPException(
        409,
        {
            "code": "LEDGER_DUPLICATE",
            "message": f"Da co dong tay tuong tu cho UID={payload['uid']} ngay {payload['ngay_tien_ve']} so tien {payload['so_tien_vnd']}",
            "existing_id": dup_res.data[0]["id"],
        },
    )
```

### 8.5. Fix dedup GSheet (Bug 5-04)

**File**: `backend/gsheet_ledger_import.py:393-398` — `_loose_fp_blank`:

```python
def _loose_fp_blank(row: dict[str, Any]) -> str:
    """Key dự phòng: ngày + số tiền + SĐT (giảm collision khi 2 KH cùng ngày/tiền)."""
    ngay = str(row.get("ngay_tien_ve") or "")[:10]
    vnd = str(row.get("so_tien_vnd") or 0)
    sdt = _fp_clean(row.get("sdt") or "")  # thêm sdt vào key
    return f"|{ngay}|{vnd}|{sdt}"
```

Cập nhật `_load_existing_loose_fps` và `_consume_budget` để dùng key mới (chắc đã reference `_loose_fp_blank`, không cần đổi gì khác).

### 8.6. Test

Đức viết test thêm vào `tests/test_be_bug_hunt_1306.py` hoặc file mới `test_be_bug_hunt_pr4.py`:
- Test notification insert + list + mark read
- Test get_rate_for_date với 3 rate khác nhau
- Test create_ledger trả 409 khi duplicate
- Test loose_fp_blank với 2 KH khác sdt cùng ngày/tiền

**Commit message**:
```
feat(BE): notify in-app + tỷ giá theo ngày + chống nhập trùng sổ + fix dedup GSheet (PR4)

- DB migration: 2 bảng notifications + exchange_rates (docs/sql/...)
- notification_routes.py: 3 endpoint list/mark-read/mark-all-read
- Hook insert notification sau ops fill order_id (1E-02)
- get_rate_for_date lookup theo ngày, seed 3700 default (3-03/3-04)
- create_ledger chặn 409 nếu duplicate uid+ngày+tiền+tay (3-05)
- _loose_fp_blank thêm sdt vào key tránh collision 2 KH cùng (5-04)
- Tests cover all 5 subtask

FE phần (NotificationBell + UI CRUD rate) sẽ Claude làm.

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Việc 9 — Bỏ normalize role "ops" → "system" cho chị Hiền (PR6 4-04)

**Bối cảnh**: Chị Hiền hiện có role="ops" nhưng code [`rbac.py:28-29`](../backend/rbac.py:28) nâng lên "system" → có toàn quyền sửa Phân quyền + Auth (ngược nghiệp vụ). Sau fix code, chị Hiền sẽ theo bảng phân quyền anh Minh chốt (đặt qua UI Phân quyền).

**Spec fix**: 

[`backend/rbac.py:26-32`](../backend/rbac.py:26):

```python
# TRƯỚC
def _normalize_role(raw: str | None) -> str:
    r = (raw or "sale").lower().strip()
    if r in ("ops", "admin"):
        return "system"   # ← bỏ
    if r not in ROLE_RANK:
        return "sale"
    return r

# SAU
def _normalize_role(raw: str | None) -> str:
    r = (raw or "sale").lower().strip()
    if r == "admin":
        return "system"   # admin vẫn nâng lên system
    if r not in ROLE_RANK:
        return "sale"
    return r
```

Và `ROLE_RANK` ở line 12 thêm "ops":
```python
ROLE_RANK = {"sale": 1, "ops": 2, "leader": 2, "manager": 3, "system": 4}
```

`_compute_permissions` ([`admin_routes.py:211-213`](../backend/admin_routes.py:211)) đã check `actor.role == "system"` cho full bypass — sau khi bỏ normalize, role "ops" sẽ đi nhánh department-based permissions. KHÔNG cần sửa admin_routes.py.

**Test**:

1. Anh Minh chạy script `python backend/scripts/create_test_accounts.py` (đã có entry `test.ops@dev` với role="ops") trên sandbox.
2. Login `test.ops@dev` trên Vercel preview URL.
3. **Trước fix**: sidebar có tab "Tài khoản Auth" + "Phân quyền sử dụng" (vì system bypass).
4. **Sau fix**: 2 tab này biến mất (vì role="ops" đi nhánh department permission, mặc định không có quyền authAccounts/permissions).
5. Anh Minh setup department permission cho dept "ops" qua UI Phân quyền (theo bảng đã chốt).

**Commit message**:
```
fix(BE): bỏ normalize role 'ops' → 'system' (PR6 4-04)

Hiện chị Hiền (role=ops) được code nâng lên 'system' → có toàn quyền
sửa Phân quyền + Auth. Ngược chốt nghiệp vụ.

Fix: chỉ 'admin' → 'system'. Role 'ops' giữ nguyên, đi nhánh
department-based permission ở _compute_permissions.

Setup UI Phân quyền cho dept 'ops' theo bảng anh Minh chốt (Đối soát/
B3/B4/Sổ doanh thu/BC = full; Auth + Phân quyền = none).

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Push lên sandbox

```bash
git checkout sandbox
git pull origin sandbox

# Sau khi xong Việc 7, commit Commit 3 (PR3 BE)
git add backend/payment_request_routes.py
git commit -m "..."  # message ở Việc 7

# Sau khi xong Việc 8, commit Commit 4 (PR4)
git add backend/notification_routes.py backend/main.py backend/revenue_routes.py \
        backend/activation_routes.py backend/gsheet_ledger_import.py \
        docs/sql/notifications_exchange_rates.sql tests/...
git commit -m "..."  # message ở Việc 8

# Sau khi xong Việc 9, commit Commit 5 (PR6 4-04)
git add backend/rbac.py
git commit -m "..."  # message ở Việc 9

git push origin sandbox
```

Push xong báo Claude qua chat — Claude sẽ làm FE phần PR3 (popup + highlight) + PR4 (NotificationBell + rate admin UI).

---

## Cần anh Minh xác nhận trước khi merge sandbox → main (TÍNH SAU)

> ⚠️ Anh Minh đã chốt: KHÔNG merge sandbox → main cho đến khi xong toàn bộ 8 PR.

Test acceptance criteria cho 3 commit này anh Minh test sau khi tất cả PR xong.
