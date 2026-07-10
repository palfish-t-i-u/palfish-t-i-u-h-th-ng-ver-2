# Legacy Endpoints Auth Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all unauthenticated legacy endpoints in `backend/main.py` and sanitize `.env.example`. Zero functionality loss — FE axios interceptor (`frontend/src/lib/api.ts:49-53`) already sends `Authorization: Bearer <token>` on every request.

**Architecture:** Add `resolve_actor()` calls to legacy endpoints that currently skip auth. Remove the `X-Operator-Role` header fallback (trusted client-supplied header = auth bypass). Gate `bank-simulate` to sandbox-only. Replace real secrets in `.env.example` with placeholders.

**Tech Stack:** Python / FastAPI, pytest (source-code analysis pattern from `backend/tests/test_audit_auth.py`)

**4 tiêu chí đánh giá:**

| Tiêu chí | Đánh giá |
|---|---|
| 1. Triệt để | Tất cả 11 legacy endpoints đều được fix, không để sót |
| 2. Không lỗi con | FE interceptor đã gửi JWT mọi request → chỉ chặn caller ngoài |
| 3. Không tăng hạ tầng / giảm hiệu năng | `resolve_actor()` đã chạy mọi `/api/v1/*` request, thêm vào legacy = cùng cost. Không thêm DB table, RPC, hay external call |
| 4. Token frugal | 1 agent chạy tuần tự, không fan-out |

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/tests/test_legacy_auth_hardening.py` | **Create** | Guardrail tests — source analysis + HTTP probing |
| `backend/main.py` | **Modify** | Add auth to 11 endpoints, gate bank-simulate |
| `backend/.env.example` | **Modify** | Replace real secrets with placeholders |

---

## Important Context

### How `resolve_actor()` works (`backend/rbac.py:119`)
```python
def resolve_actor(sb, authorization: str | None, *, allow_unactivated: bool = False) -> Actor:
    # Extracts Bearer token → validates JWT via Supabase → looks up role from nhan_su_sale
    # Raises HTTPException(401) if no/invalid token
    # Raises HTTPException(403) if account not activated
    # Returns Actor(email, user_id, role, staff, department, is_activated)
```

### How FE sends auth (`frontend/src/lib/api.ts:49-53`)
```typescript
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
Every FE request already has the token. Making `authorization` mandatory on BE only blocks unauthenticated external callers.

### How `_supabase()` works
Returns a Supabase client instance (always truthy in production). The `if not sb:` branches are in-memory fallback for local dev without Supabase — keep them but add auth gate before them where feasible.

### `_require_ops()` — the function to DELETE (`backend/main.py:344-346`)
```python
def _require_ops(role: str | None) -> None:
    if (role or "").lower() not in OPS_ROLES:
        raise HTTPException(403, "Chỉ bộ phận hệ thống được xác nhận tiền về thủ công")
```
This trusts a client-supplied `X-Operator-Role` header. Any caller can set `X-Operator-Role: ops`. Must be replaced with real JWT auth via `resolve_actor()`.

### `is_sandbox_env()` (`backend/env_utils.py:12`)
```python
def is_sandbox_env() -> bool:
    return app_env() == "sandbox"  # APP_ENV env var
```

### Existing test pattern (`backend/tests/test_audit_auth.py`)
Tests use source-code analysis (inspect + regex) to verify handlers call `resolve_actor`. Follow this exact pattern — no mock Supabase calls needed.

### `POST /info-code` calls `create_order()` internally (main.py:868)
```python
def create_info_code(body: InfoCodeBody):
    created = create_order(CreateOrderBody(...))  # direct Python call
```
When we add `authorization` param to `create_order`, we must also add it to `create_info_code` and forward it. Both are FastAPI route handlers — FastAPI injects `Header()` params automatically for HTTP calls.

---

## Task 1: Write guardrail tests

**Files:**
- Create: `backend/tests/test_legacy_auth_hardening.py`

These tests will FAIL initially (proving the vulnerabilities exist), then PASS after Task 2-5 fix the code.

- [ ] **Step 1: Create the test file**

```python
"""
Legacy endpoint auth hardening — guardrail tests.

Verify all legacy endpoints in main.py require authentication.
Pattern: source-code analysis (same as test_audit_auth.py).

Endpoints covered:
- GET /orders (was: auth optional → anonymous gets all data)
- POST /orders (was: no auth)
- PATCH /orders/{id} (was: X-Operator-Role header bypass)
- POST /orders/{id}/cancel (was: X-Operator-Role header bypass)
- POST /info-code (was: no auth)
- GET /info-code/{code}/status (was: no auth)
- GET /webhook/events (was: no auth → leaks transaction data)
- POST /crm/activate (was: no auth → anyone activates CRM orders)
- POST /webhook/bank-simulate (was: no auth → anyone fakes bank payments)
- POST /orders/{id}/bill (was: auth optional)
- GET /payos/transactions (was: auth optional)
"""

from __future__ import annotations

import inspect
import re

import pytest


def _get_main_func_source(func_name: str) -> str:
    """Extract a function's source from main.py by exact name."""
    import main

    full = inspect.getsource(main)
    pattern = rf"(def\s+{func_name}\b[^:]*:.*?)(?=\n@app\.|\ndef\s|\nregister_|\Z)"
    match = re.search(pattern, full, re.S)
    return match.group(1) if match else ""


def _requires_auth(source: str) -> bool:
    """Check that handler calls resolve_actor and authorization is NOT optional."""
    has_resolve = bool(re.search(r"resolve_actor", source))
    # authorization: str = Header(...) is mandatory
    # authorization: str | None = Header(None) is optional — NOT sufficient
    auth_optional = bool(
        re.search(r"authorization:\s*str\s*\|\s*None", source)
    )
    return has_resolve and not auth_optional


def _has_x_operator_role_fallback(source: str) -> bool:
    """Check if handler falls back to trusting X-Operator-Role header."""
    return bool(re.search(r"_require_ops|x_operator_role", source, re.I))


# ─── CRITICAL: bank-simulate must be sandbox-only ───


class TestBankSimulateLocked:

    def test_bank_simulate_requires_auth(self):
        """POST /webhook/bank-simulate must require JWT auth."""
        source = _get_main_func_source("bank_simulate")
        assert source, "bank_simulate function not found"
        assert re.search(r"resolve_actor", source), (
            "CRITICAL: /webhook/bank-simulate has no auth. "
            "Anyone can fake a bank payment arriving."
        )

    def test_bank_simulate_sandbox_only(self):
        """POST /webhook/bank-simulate must be blocked in production."""
        source = _get_main_func_source("bank_simulate")
        assert source, "bank_simulate function not found"
        assert re.search(r"is_sandbox_env|sandbox", source, re.I), (
            "CRITICAL: /webhook/bank-simulate is available in production. "
            "Must be gated to sandbox only."
        )


# ─── HIGH: endpoints that must require mandatory auth ───


class TestOrdersRequireAuth:

    def test_list_orders_mandatory_auth(self):
        """GET /orders — auth must be mandatory, not optional."""
        source = _get_main_func_source("list_orders")
        assert source, "list_orders not found"
        assert _requires_auth(source), (
            "GET /orders has optional auth. Without token, returns ALL orders "
            "to anonymous callers."
        )

    def test_create_order_requires_auth(self):
        """POST /orders — must require auth."""
        source = _get_main_func_source("create_order")
        assert source, "create_order not found"
        assert re.search(r"resolve_actor", source), (
            "POST /orders has no auth. Anyone can create orders."
        )

    def test_patch_order_no_header_bypass(self):
        """PATCH /orders/{id} — must NOT fall back to X-Operator-Role."""
        source = _get_main_func_source("patch_order")
        assert source, "patch_order not found"
        assert not _has_x_operator_role_fallback(source), (
            "PATCH /orders/{id} trusts client-supplied X-Operator-Role header. "
            "Any caller can set 'X-Operator-Role: ops' to bypass auth."
        )
        assert _requires_auth(source), (
            "PATCH /orders/{id} must require mandatory JWT auth."
        )

    def test_cancel_order_no_header_bypass(self):
        """POST /orders/{id}/cancel — must NOT fall back to X-Operator-Role."""
        source = _get_main_func_source("cancel_order")
        assert source, "cancel_order not found"
        assert not _has_x_operator_role_fallback(source), (
            "POST /orders/{id}/cancel trusts client-supplied X-Operator-Role header."
        )
        assert _requires_auth(source), (
            "POST /orders/{id}/cancel must require mandatory JWT auth."
        )

    def test_upload_bill_mandatory_auth(self):
        """POST /orders/{id}/bill — auth must be mandatory."""
        source = _get_main_func_source("upload_order_bill")
        assert source, "upload_order_bill not found"
        assert _requires_auth(source), (
            "POST /orders/{id}/bill has optional auth. Must be mandatory."
        )


class TestInfoCodeRequiresAuth:

    def test_create_info_code_requires_auth(self):
        """POST /info-code — must require auth."""
        source = _get_main_func_source("create_info_code")
        assert source, "create_info_code not found"
        assert re.search(r"authorization", source), (
            "POST /info-code has no auth. Anyone can create info codes."
        )

    def test_info_code_status_requires_auth(self):
        """GET /info-code/{code}/status — must require auth."""
        source = _get_main_func_source("info_code_status")
        assert source, "info_code_status not found"
        assert re.search(r"resolve_actor", source), (
            "GET /info-code/{code}/status has no auth. "
            "Anyone can probe payment status of any code."
        )


class TestWebhookEventsRequiresAuth:

    def test_webhook_events_requires_auth(self):
        """GET /webhook/events — must require auth (leaks transaction data)."""
        source = _get_main_func_source("webhook_events")
        assert source, "webhook_events not found"
        assert _requires_auth(source), (
            "GET /webhook/events has no auth. Leaks transaction amounts and info codes."
        )


class TestCrmActivateRequiresAuth:

    def test_crm_activate_requires_auth(self):
        """POST /crm/activate — must require auth."""
        source = _get_main_func_source("crm_activate")
        assert source, "crm_activate not found"
        assert _requires_auth(source), (
            "POST /crm/activate has no auth. "
            "Anyone can mark CRM orders as activated."
        )


class TestPayosTransactionsRequiresAuth:

    def test_payos_transactions_mandatory_auth(self):
        """GET /payos/transactions — auth must be mandatory."""
        source = _get_main_func_source("list_payos_transactions")
        assert source, "list_payos_transactions not found"
        assert _requires_auth(source), (
            "GET /payos/transactions has optional auth. Must be mandatory."
        )


# ─── MEDIUM: .env.example must not contain real secrets ───


class TestEnvExampleSanitized:

    def test_no_real_jwt_in_env_example(self):
        """backend/.env.example must not contain real Supabase JWTs."""
        from pathlib import Path

        env_example = Path(__file__).resolve().parent.parent / ".env.example"
        if not env_example.exists():
            pytest.skip(".env.example not found")
        content = env_example.read_text()
        assert "eyJ" not in content, (
            ".env.example contains a real JWT token (starts with eyJ). "
            "Replace with a placeholder like YOUR_SERVICE_ROLE_KEY."
        )

    def test_no_real_sepay_secret_in_env_example(self):
        """backend/.env.example must not contain real SePay secrets."""
        from pathlib import Path

        env_example = Path(__file__).resolve().parent.parent / ".env.example"
        if not env_example.exists():
            pytest.skip(".env.example not found")
        content = env_example.read_text()
        assert "palfish-toiuu" not in content, (
            ".env.example contains a real-looking SePay webhook secret. "
            "Replace with YOUR_SEPAY_WEBHOOK_SECRET."
        )
        assert "palfish_danew" not in content, (
            ".env.example contains a real-looking SePay API token. "
            "Replace with YOUR_SEPAY_API_TOKEN."
        )


# ─── GUARDRAIL: _require_ops must be removed ───


class TestRequireOpsRemoved:

    def test_require_ops_function_removed(self):
        """_require_ops() trusts client headers — must be deleted."""
        import main

        assert not hasattr(main, "_require_ops"), (
            "_require_ops() still exists. This function trusts a client-supplied "
            "X-Operator-Role header — any caller can set it to 'ops'. "
            "Replace all usages with resolve_actor() + can_confirm_payment()."
        )
```

- [ ] **Step 2: Run tests — verify they FAIL**

Run:
```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py -v 2>&1 | head -80
```

Expected: Most tests FAIL (proving the vulnerabilities exist). This is the "red" phase.

- [ ] **Step 3: Commit the failing tests**

```bash
cd backend && git add tests/test_legacy_auth_hardening.py
git commit -m "test: add guardrail tests for legacy endpoint auth hardening (all fail — red phase)"
```

---

## Task 2: Fix orders endpoints auth (5 endpoints)

**Files:**
- Modify: `backend/main.py` — lines 673-795 (list, create, patch, cancel) and 1216-1280 (bill upload)

- [ ] **Step 1: Fix `GET /orders` (line 673) — make auth mandatory**

Change the function signature and body. The key change: `authorization` becomes `str` (required), not `str | None` (optional). Remove the `if authorization:` conditional — always resolve.

```python
@app.get("/orders")
def list_orders(authorization: str = Header(...)):
    sb = _supabase()
    actor = resolve_actor(sb, authorization) if sb else None
    allowed = visible_creator_emails(sb, actor) if sb and actor else None

    if sb:
        try:
            return {"orders": _list_orders_supabase(sb, allowed)}
        except Exception as exc:
            print(f"Supabase list_orders: {exc}")
            raise HTTPException(500, f"Lỗi đọc đơn hàng: {exc}") from exc
    items = sorted(_orders_mem.values(), key=lambda x: x.get("createdAt", ""), reverse=True)
    if allowed is not None:
        allowed_set = set(allowed)
        items = [
            o
            for o in items
            if (o.get("createdBy") or "").lower() in allowed_set
            or not o.get("createdBy")
        ]
    return {"orders": items}
```

- [ ] **Step 2: Fix `POST /orders` (line 704) — add auth**

Add `authorization` param + `resolve_actor()` call. This sets `created_by` from the authenticated user.

```python
@app.post("/orders", status_code=201)
def create_order(body: CreateOrderBody, authorization: str = Header(...)):
    if not body.uid.strip():
        raise HTTPException(400, "UID CRM là bắt buộc — mọi đơn phải gắn với khách đã có trên CRM.")
    sb = _supabase()
    if sb:
        resolve_actor(sb, authorization)
    # ... rest unchanged
```

- [ ] **Step 3: Fix `POST /info-code` (line 866) — add auth + forward**

`create_info_code` calls `create_order()` as a Python function. After Step 2, `create_order` now requires `authorization`. Forward it:

```python
@app.post("/info-code", status_code=201)
def create_info_code(body: InfoCodeBody, authorization: str = Header(...)):
    created = create_order(
        CreateOrderBody(
            uid=body.uid,
            tenKhach=body.customerName,
            tongTien=body.amount,
            nguon="Gia hạn",
        ),
        authorization=authorization,
    )
    return {
        "infoCode": created["infoCode"],
        "customerName": body.customerName,
        "uid": body.uid,
        "amount": body.amount,
        "status": "PENDING",
        "order": created,
    }
```

- [ ] **Step 4: Fix `PATCH /orders/{id}` (line 731) — remove X-Operator-Role fallback**

Remove `x_operator_role` param entirely. Make `authorization` mandatory. Always use `resolve_actor()`.

```python
@app.patch("/orders/{order_id}")
def patch_order(
    order_id: str,
    body: PatchOrderBody,
    authorization: str = Header(...),
):
    sb = _supabase()
    if body.tienVe is not None:
        if sb:
            actor = resolve_actor(sb, authorization)
            require_module_write(sb, actor, "dashboard")
            if not can_confirm_payment(actor):
                raise HTTPException(403, "Chỉ bộ phận hệ thống được xác nhận tiền về thủ công")
        else:
            raise HTTPException(503, "Supabase chưa cấu hình")
    elif sb:
        resolve_actor(sb, authorization)

    # ... rest of function body unchanged from line 751 onward
```

- [ ] **Step 5: Fix `POST /orders/{id}/cancel` (line 797) — remove X-Operator-Role fallback**

Remove `x_operator_role` param. Make `authorization` mandatory. Always use `resolve_actor()`.

```python
@app.post("/orders/{order_id}/cancel")
def cancel_order(
    order_id: str,
    authorization: str = Header(...),
):
    """Cancel order (trang_thai='huy'). RBAC: sale/leader own only, manager/system any.
    Blocked if tien_ve=true (force manual refund flow)."""
    sb = _supabase()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình")

    actor = resolve_actor(sb, authorization)
    require_module_write(sb, actor, "dashboard")
    actor_role = actor.role.lower()
    actor_email = (actor.email or "").lower()

    res = sb.table("don_hang").select("*").eq("id", order_id).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Order not found")
    row = res.data[0]
    if row.get("tien_ve"):
        raise HTTPException(
            409,
            "Đơn đã ghi nhận tiền về — không thể huỷ tự động. Liên hệ ops xử lý hoàn tiền.",
        )
    if row.get("trang_thai") == "huy":
        kh_res = (
            sb.table("khach_hang").select("*").eq("id", row["khach_hang_id"]).limit(1).execute()
        )
        return _row_to_order(row, kh_res.data[0] if kh_res.data else None)

    if actor_role not in CANCEL_ANY_ROLES:
        creator = (row.get("created_by") or "").strip().lower()
        if not actor_email or creator != actor_email:
            raise HTTPException(403, "Chỉ huỷ được đơn do mình tạo.")

    # ... rest unchanged from line 846 onward
```

Note: Remove `"ops"` from `CANCEL_ANY_ROLES` at the top of the file. Change line 37:
```python
CANCEL_ANY_ROLES = {"manager", "system"}
```

- [ ] **Step 6: Fix `POST /orders/{id}/bill` (line 1216) — make auth mandatory**

```python
@app.post("/orders/{order_id}/bill")
async def upload_order_bill(
    order_id: str,
    file: UploadFile = File(...),
    authorization: str = Header(...),
):
    """Upload bill multipart → Supabase Storage bucket 'bills'."""
    sb = _supabase()
    if not sb:
        raise HTTPException(503, "Supabase chưa cấu hình — không upload được Storage")

    resolve_actor(sb, authorization)

    # ... rest unchanged from line 1236 onward (content = await file.read() ...)
```

Remove the `try/except` wrapper around `resolve_actor` that previously swallowed errors.

- [ ] **Step 7: Delete `_require_ops` function and remove `OPS_ROLES` if unused**

Delete lines 344-346:
```python
# DELETE THIS:
def _require_ops(role: str | None) -> None:
    if (role or "").lower() not in OPS_ROLES:
        raise HTTPException(403, "Chỉ bộ phận hệ thống được xác nhận tiền về thủ công")
```

Check if `OPS_ROLES` is used elsewhere. If only by `_require_ops`, delete it too. Search for `OPS_ROLES` in `main.py` first.

- [ ] **Step 8: Update FE `api.ts` — remove `X-Operator-Role` header from `patch`**

In `frontend/src/lib/api.ts:64-73`, the `patch` function sends `X-Operator-Role`. Remove it since BE no longer accepts it:

```typescript
    patch: (
      id: string,
      body: { tienVe?: boolean; donCRM?: boolean; billImage?: string | null },
      timeout?: number
    ) =>
      api.patch<Order>(`/orders/${id}`, body, {
        ...(timeout ? { timeout } : {}),
      }),
```

Also remove the `operatorRole = "sale"` parameter.

- [ ] **Step 9: Run tests**

```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestOrdersRequireAuth -v
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestInfoCodeRequiresAuth -v
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestRequireOpsRemoved -v
```

Expected: All PASS.

- [ ] **Step 10: Commit**

```bash
git add backend/main.py frontend/src/lib/api.ts
git commit -m "fix(security): require JWT auth on all legacy order endpoints, remove X-Operator-Role bypass"
```

---

## Task 3: Fix remaining endpoints auth (3 endpoints)

**Files:**
- Modify: `backend/main.py` — lines 886, 900, 939

- [ ] **Step 1: Fix `GET /info-code/{code}/status` (line 886)**

```python
@app.get("/info-code/{code}/status")
def info_code_status(code: str, authorization: str = Header(...)):
    sb = _supabase()
    if sb:
        resolve_actor(sb, authorization)
        found = _find_don_by_info(sb, code)
        if found:
            paid = bool(found["don"].get("tien_ve"))
            return {"infoCode": code, "status": "MATCHED" if paid else "PENDING"}
    return {"infoCode": code, "status": "PENDING"}
```

- [ ] **Step 2: Fix `GET /webhook/events` (line 900)**

```python
@app.get("/webhook/events")
def webhook_events(limit: int = 50, authorization: str = Header(...)):
    sb = _supabase()
    if sb:
        resolve_actor(sb, authorization)
        try:
            res = (
                sb.table("giao_dich")
                .select("id, so_tien_nhan, info_code_thuc_te, thoi_gian_giao_dich, trang_thai_doi_soat")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            events = [
                {
                    "id": r["id"],
                    "type": "BANK_CREDIT",
                    "amount": r.get("so_tien_nhan"),
                    "infoCode": r.get("info_code_thuc_te"),
                    "ts": r.get("thoi_gian_giao_dich"),
                }
                for r in (res.data or [])
            ]
            return {"events": events}
        except Exception as exc:
            print(f"giao_dich list: {exc}")
    return {"events": []}
```

- [ ] **Step 3: Fix `POST /crm/activate` (line 939)**

```python
@app.post("/crm/activate")
def crm_activate(body: CrmBody, authorization: str = Header(...)):
    sb = _supabase()
    if sb:
        resolve_actor(sb, authorization)
        found = _find_don_by_info(sb, body.infoCode)
        if found:
            sb.table("don_hang").update({"don_crm": True, "trang_thai": "da_tao_crm"}).eq(
                "id", found["don"]["id"]
            ).execute()
            return {"infoCode": body.infoCode, "activated": True}
    return {"infoCode": body.infoCode, "activated": False}
```

- [ ] **Step 4: Fix `GET /payos/transactions` (line 1142)**

Make auth mandatory (currently optional):

```python
@app.get("/payos/transactions")
def list_payos_transactions(
    authorization: str = Header(...),
    limit: int = 100,
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
    status: str | None = None,
    q: str | None = None,
):
    """List giao_dich joined với don_hang. RBAC: sale → own, leader/manager → team, system → all."""
    sb = _supabase()
    if not sb:
        return {"transactions": []}

    actor = resolve_actor(sb, authorization)
    allowed = visible_creator_emails(sb, actor)
    # ... rest unchanged from line 1166 onward
```

Remove the `try/except` that previously swallowed auth errors (lines 1158-1164). `resolve_actor` will raise 401 directly.

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestWebhookEventsRequiresAuth tests/test_legacy_auth_hardening.py::TestCrmActivateRequiresAuth tests/test_legacy_auth_hardening.py::TestPayosTransactionsRequiresAuth tests/test_legacy_auth_hardening.py::TestInfoCodeRequiresAuth -v
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py
git commit -m "fix(security): require JWT auth on info-code, webhook/events, crm/activate, payos/transactions"
```

---

## Task 4: Gate bank-simulate to sandbox-only + auth

**Files:**
- Modify: `backend/main.py` — line 1283

- [ ] **Step 1: Add sandbox gate + auth to `POST /webhook/bank-simulate`**

```python
@app.post("/webhook/bank-simulate")
def bank_simulate(body: BankSimulateBody, authorization: str = Header(...)):
    """
    Test luồng tiền về — CHỈ sandbox.
    Tạo bản ghi giao_dich + bật tien_ve trên don_hang.
    """
    if not is_sandbox_env():
        raise HTTPException(403, "bank-simulate chỉ khả dụng trong môi trường sandbox")

    sb = _supabase()
    if sb:
        actor = resolve_actor(sb, authorization)
        require_module_write(sb, actor, "dashboard")

    content = body.noiDung or body.infoCode
    tx_id = body.maGiaoDichBank or f"SIM-{uuid.uuid4().hex[:8]}"
    # ... rest unchanged from line 1292 onward
```

- [ ] **Step 2: Run tests**

```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestBankSimulateLocked -v
```

Expected: Both PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "fix(security): gate bank-simulate to sandbox-only + require JWT auth"
```

---

## Task 5: Sanitize `.env.example`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Replace real secrets with placeholders**

```
SUPABASE_URL=https://your-project.supabase.co
# Project Settings → API → Legacy → service_role (secret) — chỉ backend
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

```
SEPAY_WEBHOOK_SECRET=YOUR_SEPAY_WEBHOOK_SECRET
SEPAY_API_TOKEN=YOUR_SEPAY_API_TOKEN
```

Keep all other lines as-is (PayOS, Google Sheets, etc. already have `YOUR_*` placeholders).

- [ ] **Step 2: Run tests**

```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py::TestEnvExampleSanitized -v
```

Expected: Both PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "fix(security): replace real secrets in .env.example with placeholders"
```

---

## Task 6: Full test suite — verify green + no regressions

- [ ] **Step 1: Run ALL legacy auth hardening tests**

```bash
cd backend && python -m pytest tests/test_legacy_auth_hardening.py -v
```

Expected: All tests PASS.

- [ ] **Step 2: Run existing audit tests (regression check)**

```bash
cd backend && python -m pytest tests/test_audit_auth.py tests/test_audit_db.py tests/test_audit_other.py -v
```

Expected: All still PASS. Our changes do not touch `/api/v1/*` routes or any code those tests check.

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && python -m pytest tests/ -v --timeout=30 2>&1 | tail -30
```

Expected: No new failures.

- [ ] **Step 4: Type-check frontend**

```bash
cd frontend && npx tsc -b
```

Expected: PASS. The only FE change is removing the `operatorRole` param from `api.ts:patch()`. Search callers for `operatorRole` first — if any caller passes it, update those too.

Before running `tsc -b`, grep for callers:
```bash
grep -rn "operatorRole\|operator_role\|X-Operator-Role" frontend/src/ --include="*.ts" --include="*.tsx"
```

Update any callers that pass the removed `operatorRole` parameter.

- [ ] **Step 5: Commit (if any caller fixes needed)**

```bash
# Only if Step 4 found callers to fix
git add frontend/src/
git commit -m "fix: remove operatorRole param from order patch callers"
```

---

## Summary of changes

| What | Before | After |
|---|---|---|
| `GET /orders` | Auth optional | Auth mandatory |
| `POST /orders` | No auth | Auth mandatory |
| `PATCH /orders/{id}` | JWT or X-Operator-Role header | JWT only |
| `POST /orders/{id}/cancel` | JWT or X-Operator-Role header | JWT only |
| `POST /orders/{id}/bill` | Auth optional | Auth mandatory |
| `POST /info-code` | No auth | Auth mandatory |
| `GET /info-code/{code}/status` | No auth | Auth mandatory |
| `GET /webhook/events` | No auth | Auth mandatory |
| `POST /crm/activate` | No auth | Auth mandatory |
| `GET /payos/transactions` | Auth optional | Auth mandatory |
| `POST /webhook/bank-simulate` | No auth, any env | Auth + sandbox-only |
| `_require_ops()` | Trusts client header | Deleted |
| `CANCEL_ANY_ROLES` | `{"manager", "system", "ops"}` | `{"manager", "system"}` |
| `.env.example` | Real JWT + SePay secrets | Placeholders |
