# Handoff Đức — Đợt 3 (PR7 + PR8) — 13/06/2026

> Đức đã xong PR1+PR2 (sáng) và PR3+PR4+PR6 (chiều). Đợt cuối cùng trước khi merge sandbox → main.
> Tổng ước ~6-8h, chia làm **2 commits**.
> Đọc context: [docs/bug-hunt-report-2026-06-13.md](bug-hunt-report-2026-06-13.md) section "PR7" và "PR8".

## Tổng quan 2 commits

| Commit | Thuộc PR | Việc | Thời gian |
|--------|----------|------|-----------|
| **Commit 6** | PR7 (BE auth) | Vá 4 endpoint thiếu auth: `/crm/sync`, `/crm/sync/backfill`, `/crm/token-status`, `/payos-webhook` cũ | ~2-3h |
| **Commit 7** | PR8 (BE scope + defense + retry) | Scope leader/manager khi staff=None + dashboard filters + ledger code defense + permission retry | ~4-5h |

> Sau khi Đức push 2 commit này, em sẽ test integration sandbox bằng curl + Supabase MCP. Khi cả 8 PR đều xanh, anh Minh cho merge sandbox → main.

---

## Việc 13 — Vá auth 4 endpoint (PR7)

**Bối cảnh nghiệp vụ**: Bug hunt phát hiện 4 endpoint thiếu authentication — attacker hoặc nhân viên ngoài bộ phận có thể trigger CRM sync, đọc trạng thái token CRM, hoặc giả webhook PayOS để "trả tiền giả" cho PR pending. Đây là lỗ hổng nghiêm trọng, phải vá trước khi go-live prod.

### Bug 1C-01 — `/payos-webhook` cũ KHÔNG verify HMAC signature

**File**: [`backend/payment_request_routes.py:1637-1643`](../backend/payment_request_routes.py:1637) — hàm `payos_webhook_v1`.

**Vấn đề**: Hàm này KHÔNG gọi `_verify_payos_webhook_signature` (trong khi `/webhook/payos` ở [`main.py:1100`](../backend/main.py:1100) có verify). Attacker brute-force `order_code` (số tuần tự theo thời gian) → POST giả → BE mark `status=paid` → KPI doanh thu nhảy giả.

**Fix có 2 option**:

**Option A (recommended)**: Xoá hẳn endpoint `/payos-webhook` cũ. Đã có `/webhook/payos` ở `main.py` xử lý đầy đủ + có verify. Endpoint cũ chỉ tồn tại để backward-compat.
- Xoá route handler + import liên quan.
- Search codebase xem PayOS dashboard cấu hình URL nào → nếu vẫn còn dùng URL cũ thì migrate trước.

**Option B**: Thêm verify giống `main.py:1100`:
```python
@app.post("/payos-webhook")
async def payos_webhook_v1(request: Request):
    body_bytes = await request.body()
    signature = request.headers.get("x-payos-signature", "")
    if not _verify_payos_webhook_signature(body_bytes, signature):
        raise HTTPException(400, "Invalid signature")
    # ... rest unchanged
```

**Test sau fix**:
```bash
# Phải trả 400
curl -X POST https://palfish-gmv-api-sandbox.onrender.com/payos-webhook \
  -H "Content-Type: application/json" \
  -d '{"data":{"orderCode":"99999"}}'
```

---

### Bug 5-01 — `POST /crm/sync` không có authentication

**File**: [`backend/crm_routes.py:1405-1431`](../backend/crm_routes.py:1405) — hàm `crm_sync`.

**Vấn đề**: Function signature không có `authorization: str | None = Header(None)`, không gọi `resolve_actor`. Bất kỳ ai (anonymous) cũng trigger được sync → abuse rate limit CRM, overwrite data sai.

**Fix**:
```python
from fastapi import Header
from rbac import resolve_actor, require_min_role

@app.post("/crm/sync")
def crm_sync(
    body: CrmSyncRequest,
    authorization: str | None = Header(None),
):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "manager")  # chỉ manager+ được sync
    # ... rest unchanged
```

**Test sau fix**:
```bash
# Không token → 401
curl -X POST https://palfish-gmv-api-sandbox.onrender.com/crm/sync \
  -H "Content-Type: application/json" \
  -d '{"sync_date":"2026-06-13"}'
```

---

### Bug 5-02 — `POST /crm/sync/backfill` cùng lỗi 5-01

**File**: [`backend/crm_routes.py:1433-1446`](../backend/crm_routes.py:1433) — hàm `crm_sync_backfill`.

**Vấn đề**: Cùng pattern thiếu auth như 5-01. Tệ hơn vì backfill chạy concurrency=8 nhiều ngày → DoS CRM + bill cao.

**Fix**: Cùng pattern với 5-01:
```python
@app.post("/crm/sync/backfill")
def crm_sync_backfill(
    body: CrmBackfillRequest,
    authorization: str | None = Header(None),
):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "manager")
    # ... rest unchanged
```

---

### Bug 5-03 — `GET /crm/token-status` public

**File**: [`backend/crm_routes.py:1384-1403`](../backend/crm_routes.py:1384) — hàm `crm_token_status`.

**Vấn đề**: Public endpoint trả "đã có token CRM / chưa có" + thời điểm update → leak trạng thái hệ thống.

**Fix**: Yêu cầu leader+ (nhẹ hơn `/crm/sync` vì chỉ read status):
```python
@app.get("/crm/token-status")
def crm_token_status(authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_min_role(actor, "leader")
    # ... rest unchanged
```

---

### Test PR7 (commit 6)

Viết tests vào [`backend/tests/test_be_bug_hunt_1306.py`](../backend/tests/test_be_bug_hunt_1306.py) — class `TestAuthPatches`:

```python
class TestAuthPatches:
    def test_crm_sync_requires_manager(self):
        # patch resolve_actor → role=sale → assert 403
        # patch resolve_actor → role=manager → assert pass
        ...

    def test_crm_backfill_requires_manager(self):
        ...

    def test_crm_token_status_requires_leader(self):
        ...

    def test_payos_webhook_old_rejects_unsigned(self):
        # POST giả không signature → 400 (option A: 404 vì xoá route)
        ...
```

---

## Việc 14 — Scope + dashboard filters + ledger defense + permission retry (PR8)

**Bối cảnh nghiệp vụ**: Sau khi vá auth (PR7), còn 7 bug RBAC/scope gây leak data chéo team hoặc fragile error handling:
- 4-01, 4-02: leader/manager mới chưa link CRM tạm thời thấy data toàn công ty
- 4-03: sale gọi `/dashboard/filters` thấy danh sách team/sale toàn công ty
- 3-01, 3-02: code-level scope cho ledger phòng admin cấp nhầm permission tương lai
- 6-01: permission check fail 1 lần → user thấy lỗi 500 thay vì retry
- 6-02: override query lỗi silent → user mất quyền không log

### Bug 4-01 — `visible_creator_emails` leak khi staff=None

**File**: [`backend/rbac.py:241-253`](../backend/rbac.py:241) — hàm `visible_creator_emails`.

**Vấn đề**: 
```python
staff = actor.staff or {}
team = staff.get("team")  # None nếu chưa link nhan_su_sale
if team:
    # query nhan_su_sale filter team
    ...
# Nếu team is None → KHÔNG vào nhánh if → return toàn bộ active emails
```

**Hậu quả**: Leader/manager mới được tạo account, chưa có dòng trong `nhan_su_sale` → tạm thời có quyền xem ledger toàn công ty.

**Fix**:
```python
def visible_creator_emails(sb, actor: Actor) -> list[str]:
    if actor.role == "sale":
        return [actor.email.lower()]
    
    staff = actor.staff or {}
    team = staff.get("team")
    
    # NEW: leader/manager thiếu team → degrade về sale-level
    if actor.role in ("leader", "manager") and not team:
        return [actor.email.lower()]
    
    if actor.role in ("leader", "manager") and team:
        # ... existing logic
        ...
    
    # system/ops → toàn bộ
    return _all_active_emails(sb)
```

---

### Bug 4-02 — `enforce_report_scope` cho manager không team

**File**: [`backend/rbac.py:202`](../backend/rbac.py:202) — hàm `enforce_report_scope`.

**Vấn đề**: 
```python
if role == "manager" and actor_team:  # actor_team is None → skip
    ...
# Fall through → return (requested_team, None) → manager request team nào trả team đó
```

**Fix**: Khi manager thiếu team → raise 403 (nghiêm hơn) hoặc force scope = email actor.
```python
if role == "manager":
    if not actor_team:
        raise HTTPException(403, "Tài khoản manager chưa được link với team trong nhan_su_sale")
    # ... existing logic for valid manager
    ...
```

---

### Bug 4-03 — `/dashboard/filters` leak toàn bộ team/sale

**File**: [`backend/dashboard_routes.py:818-858`](../backend/dashboard_routes.py:818) — hàm trả về `{teams, sales, departments}`.

**Vấn đề**: Không filter theo actor → sale có quyền `dashboard:read` enumerate được toàn bộ nhân sự + team.

**Fix**: Áp scope theo `visible_creator_emails`:
```python
@app.get("/dashboard/filters")
def dashboard_filters(authorization: str | None = Header(None)):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    
    # Sale chỉ thấy chính mình + team mình
    if actor.role == "sale":
        return {
            "teams": [actor.staff.get("team")] if actor.staff else [],
            "sales": [{"email": actor.email, "crm_name": actor.staff.get("crm_name")}],
            "departments": [actor.staff.get("department")] if actor.staff else [],
        }
    
    # leader/manager → filter theo visible_creator_emails
    if actor.role in ("leader", "manager"):
        emails = visible_creator_emails(sb, actor)
        # query nhan_su_sale where email in emails → trả về teams/sales/departments scope
        ...
    
    # system/ops → full
    ...
```

---

### Bug 3-01 + 3-02 — `/revenue/ledger` + `/revenue/ledger/summary` code-level defense

**Files**: 
- [`backend/revenue_routes.py:1285`](../backend/revenue_routes.py:1285) — hàm `list_revenue_ledger`
- [`backend/revenue_routes.py`](../backend/revenue_routes.py) — hàm `revenue_ledger_summary` (tương tự)

**Bối cảnh**: Em vừa fix permission DB chiều nay (sale `revenueLedger` = "none"). Phần này là **defense-in-depth** — phòng admin tương lai cấp nhầm `revenueLedger:read` cho sale, code vẫn scope:

**Fix**:
```python
@app.get("/revenue/ledger")
def list_revenue_ledger(
    team: str | None = None,
    # ... other params
    authorization: str | None = Header(None),
):
    sb = _sb()
    actor = resolve_actor(sb, authorization)
    require_module_access(actor, "revenueLedger")
    
    query = sb.table("so_doanh_thu").select("*")
    
    # NEW: code-level scope phòng admin cấp nhầm
    if actor.role in ("sale", "leader"):
        visible_emails = visible_creator_emails(sb, actor)
        query = query.in_("created_by_email", visible_emails)
    
    # ... rest unchanged (filter team, date, etc.)
```

Áp cùng pattern cho `revenue_ledger_summary`.

---

### Bug 6-01 — `_compute_permissions` không retry

**File**: [`backend/admin_routes.py:234-235`](../backend/admin_routes.py:234)

**Vấn đề**: Một lần fail query DB → raise 500 → user thấy "lỗi hệ thống" mọi request kế tiếp. DB chập chờn = downtime cho user.

**Fix**: Retry 1-2 lần với backoff ngắn, hoặc fallback về role-based default:
```python
def _compute_permissions(sb, actor: Actor) -> dict:
    last_exc = None
    for attempt in range(3):
        try:
            # ... existing query logic
            return permissions
        except Exception as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(0.2 * (attempt + 1))
                continue
    # Sau 3 lần fail → fallback default role-based thay vì 500
    print(f"[permissions] compute failed after retries: {last_exc}")
    return DEFAULT_DEPT_PERMISSIONS.get(actor.department or "sale", {})
```

---

### Bug 6-02 — `permission_overrides` swallow exception silent

**File**: [`backend/admin_routes.py:265-266`](../backend/admin_routes.py:265)

**Vấn đề**: `except Exception: pass` → query overrides lỗi → user mất quyền cá nhân, không log gì cả.

**Fix**: Log warning:
```python
try:
    res = sb.table("permission_overrides").select("*").eq("email", email).execute()
    overrides = {row["module_key"]: row["access_level"] for row in (res.data or [])}
except Exception as exc:
    print(f"[permission_overrides] query failed for {email}: {exc}")
    overrides = {}
```

---

### Test PR8 (commit 7)

Viết tests vào `test_be_bug_hunt_1306.py` — class `TestScopeDefense`:

```python
class TestScopeDefense:
    def test_visible_creator_emails_leader_without_team(self):
        # Actor role=leader, staff=None → return [actor.email]
        ...

    def test_enforce_report_scope_manager_without_team_raises(self):
        # Actor role=manager, actor_team=None, requested_team="X" → raise 403
        ...

    def test_dashboard_filters_sale_scope(self):
        # Sale → trả teams/sales/departments chỉ chứa của chính mình
        ...

    def test_revenue_ledger_sale_filter_by_email(self):
        # Mock visible_creator_emails → assert query có `.in_("created_by_email", ...)`
        ...

    def test_compute_permissions_retries_on_db_error(self):
        # Mock supabase fail 2 lần đầu, success lần 3 → return permissions
        ...

    def test_compute_permissions_fallback_after_max_retries(self):
        # Mock supabase fail 3 lần → return DEFAULT_DEPT_PERMISSIONS
        ...
```

---

## Quy trình làm việc

1. **Đọc bug-hunt-report** sections "PR7", "PR8" (line 100-117 + chi tiết phase tương ứng).
2. **Commit 6 — PR7**: 4 endpoint patches + tests. Message: `fix(BE): va auth /crm/sync, /crm/sync/backfill, /crm/token-status, /payos-webhook (PR7)`.
3. **Commit 7 — PR8**: scope + defense + retry + tests. Message: `fix(BE): scope leader/manager + dashboard filter + ledger defense + permission retry (PR8)`.
4. **Push sandbox**: `git push origin sandbox`. Anh Minh hoặc em sẽ trigger deploy hook.
5. Báo em (claude) push xong → em test integration trên sandbox real bằng curl + Supabase MCP, review code, viết test report cuối.

## Ghi chú cuối

- **Không sửa main.py `/webhook/payos`** (đã đúng) — chỉ sửa hoặc xoá `/payos-webhook` cũ ở `payment_request_routes.py`.
- **`visible_creator_emails` thay đổi affect nhiều endpoint** — verify list_payment_requests, active_requests, revenue_ledger, dashboard_summary vẫn pass test.
- Test phải pass `pytest backend/tests/` trước khi push.
- Sau khi PR7+PR8 xanh → ready merge sandbox → main (anh Minh quyết định khi nào).
