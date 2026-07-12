# Fix Health-Check Timeout Storm + Bill Storage Storm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngừng vòng restart của `palfish-gmv-api` bằng cách bỏ storm liệt-kê-Storage khỏi route danh sách PR (đọc thẳng cột DB), làm `/healthz` trả lời tức thì không ping DB, và vá bug cache ghi-đè làm mất bill.

**Architecture:** Route `GET /payment-requests` hiện gọi `_fetch_bill_assets_fast` để hỏi Supabase Storage trạng thái bill của TỪNG payment_line (fast-path `storage.objects` fail vĩnh viễn ở prod với PGRST106 → fallback 1 HTTP-list/line, 111 lượt tuần tự/trang). Hàm serialize `_bill_fields` **đã** ưu tiên cột DB `payment_lines.bill_images` và chỉ dùng Storage khi cột rỗng — nên chỉ cần (a) backfill 50 line cũ có bill trong Storage nhưng cột rỗng, (b) bỏ lời gọi Storage khỏi route danh sách. `/healthz` (Render health check, xác nhận `render.yaml:25,55`) hiện ping DB thật → chuyển deep-check sang `/healthz/deep`. Cache Storage single-line hiện ghi đè toàn bộ → đổi sang merge để route drawer/download không mất bill.

**Tech Stack:** Python 3 / FastAPI, Supabase (Postgres + Storage), pytest (mock qua `unittest.mock`, xem `backend/tests/conftest.py`).

---

## Bối cảnh chẩn đoán (đọc trước khi code)

- Sự cố 10/7: Render giết instance vì `/healthz` timeout >5s (KHÔNG phải OOM — RAM chỉ ~160MB/512MB; OOM fix `b4dd055` đã verify plateau OK).
- Số liệu prod (project `jozcvbbypwvzaefteoxn`): `payment_requests`=183, `payment_lines`=196, line trang đầu (100 PR)=111, object bill trong Storage=111, line có cột `bill_images` đã điền=**61** → **50 line có bill trong Storage nhưng cột rỗng** (đây là các line phải backfill, nếu không sẽ hiển thị "thiếu bill" sau khi bỏ Storage listing).
- Kiểu cột: `bill_images` = `jsonb` (mảng URL), `bill_image` = `text` (URL mới nhất, legacy).
- Upload bill dùng RPC atomic `append_payment_line_bill` (ghi cột) — line MỚI luôn có cột, không sinh gap mới. Delete bill (`payment_request_routes.py:2643`) cũng cập nhật cột. Nên backfill là one-time.
- `_bill_fields` (`payment_request_routes.py:626-653`): đọc `row["bill_images"]` trước, chỉ fallback sang `bill_assets`/`bill_urls` (Storage) khi cột rỗng → truyền `{}`/`None` cho tham số Storage là an toàn khi cột đã đủ.

## File Structure

- `backend/main.py` — tách `/healthz` (liveness, không DB) khỏi `/healthz/deep` (diagnostics, có ping DB). **Chỉ sửa hàm `health()` ~601-639.**
- `backend/payment_request_routes.py` — (1) route `list_payment_requests` ~1664-1697: bỏ `_fetch_bill_assets_fast` + `all_line_ids` + `bill_urls`; (2) `_fetch_bill_assets_fast` ~551-555: merge-not-overwrite cache fallback.
- `backend/migrations/2026-07-10-backfill-bill-images-column.sql` — **Create.** Backfill cột từ `storage.objects`. Chạy prod + sandbox TRƯỚC khi deploy code.
- `backend/tests/test_health_check_and_bill_column.py` — **Create.** 5 test cover cả 4 tiêu chí.

## Thứ tự triển khai BẮT BUỘC (guardrail chính)

1. Task 1–4 code + test xanh trên nhánh.
2. **Chạy migration Task 3 (backfill) trên prod VÀ sandbox TRƯỚC** — idempotent, chỉ thêm URL vào cột rỗng, không xoá gì.
3. Sau khi backfill xong mới deploy code (Task 2+4 bỏ Storage listing khỏi route). Nếu deploy code trước backfill → 50 line hiện "thiếu bill" tới khi backfill chạy.
4. Soak sandbox theo `deploying-gmv` rồi mới merge main.

---

### Task 1: `/healthz` liveness không chạm DB

**Files:**
- Modify: `backend/main.py:601-639` (hàm `health()`)
- Test: `backend/tests/test_health_check_and_bill_column.py`

- [ ] **Step 1: Viết test thất bại**

Tạo file `backend/tests/test_health_check_and_bill_column.py` với nội dung:

```python
"""Health-check timeout storm + bill-column fixes (2026-07-10).

Plan: docs/superpowers/plans/2026-07-10-fix-health-check-storm-bill-column.md
Sự cố: /healthz ping DB + route danh sách storm 111 lượt Storage-list → Render
giết instance vì health check >5s. Fix: /healthz không DB; route đọc cột DB.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def test_healthz_never_touches_db(monkeypatch):
    """Liveness probe của Render phải trả lời ngay, không gọi _supabase()."""
    import main

    called = {"n": 0}

    def _boom():
        called["n"] += 1
        raise AssertionError("/healthz phải KHÔNG gọi _supabase()")

    monkeypatch.setattr(main, "_supabase", _boom)
    res = main.health()
    assert res["status"] == "ok"
    assert called["n"] == 0
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py::test_healthz_never_touches_db -v`
Expected: FAIL với `AssertionError: /healthz phải KHÔNG gọi _supabase()` (code hiện tại ping DB trong `health()`).

- [ ] **Step 3: Sửa `health()` — tách liveness khỏi deep-check**

Trong `backend/main.py`, thay TOÀN BỘ hàm `health()` (từ `@app.get("/healthz")` tới hết `return {...}` ~dòng 601-639) bằng:

```python
@app.get("/healthz")
def health():
    """Liveness probe cho Render — PHẢI trả lời tức thì, KHÔNG chạm DB.
    Render giết instance nếu health check không đáp trong 5s; việc ping Supabase
    ở đây gây restart storm dưới tải cao (2026-07-10). Chẩn đoán sâu (ping DB,
    format key, ...) chuyển sang /healthz/deep."""
    return {"status": "ok", "app_env": app_env(), "sandbox": is_sandbox_env()}


@app.get("/healthz/deep")
def health_deep():
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    # Project ref từ URL (không phải secret) — để chẩn đoán backend trỏ đúng project nào
    url_ref = url.replace("https://", "").replace("http://", "").split(".")[0] if url else ""
    configured = bool(url and key and "PASTE_" not in key and not key.startswith("YOUR_"))
    # Format key: hỗ trợ cả JWT legacy (eyJ..., 3 phần) lẫn API key mới (sb_secret_/sb_publishable_)
    key_looks_valid = configured and (
        (key.startswith("eyJ") and key.count(".") >= 2 and len(key) > 40)
        or key.startswith("sb_secret_")
        or key.startswith("sb_publishable_")
    )
    # Ping DB thật để xác nhận key xác thực được với Supabase (không đổi HTTP status nếu fail)
    db_reachable = False
    if configured:
        try:
            sb = _supabase()
            if sb:
                sb.table("payment_requests").select("id").limit(1).execute()
                db_reachable = True
        except Exception as exc:
            print(f"[healthz/deep] DB ping failed: {exc}")
    payos_ok = bool(os.getenv("PAYOS_CLIENT_ID", "").strip())
    api_pipe_env = (_REPO_ROOT / "api_pipe" / ".env").is_file()
    return {
        "status": "ok",
        "app_env": app_env(),
        "sandbox": is_sandbox_env(),
        "supabase_configured": configured,
        "supabase_project_ref": url_ref,
        "supabase_key_valid_format": key_looks_valid,
        "supabase_db_reachable": db_reachable,
        "supabase_url_present": bool(url),
        "supabase_key_length": len(key),
        "supabase_key_starts_eyJ": key.startswith("eyJ"),
        "payos_configured": payos_ok,
        "api_pipe_env_present": api_pipe_env,
    }
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py::test_healthz_never_touches_db -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_health_check_and_bill_column.py
git commit -m "fix(healthz): liveness probe khong ping DB (chong restart storm); deep-check sang /healthz/deep"
```

---

### Task 2: Route danh sách PR — đọc cột DB, bỏ storm Storage

**Files:**
- Modify: `backend/payment_request_routes.py:1664-1697` (trong `list_payment_requests`)
- Test: `backend/tests/test_health_check_and_bill_column.py`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `backend/tests/test_health_check_and_bill_column.py`:

```python
def test_bill_fields_uses_db_column_without_storage():
    """Cột bill_images điền sẵn → hiển thị bill mà KHÔNG cần tham số Storage."""
    from payment_request_routes import _bill_fields

    row = {"id": "L1", "bill_images": ["https://x/bill1.jpg", "https://x/bill2.jpg"]}
    out = _bill_fields(row)  # bill_urls/bill_assets = None
    assert out["bill"] is True
    assert out["bill_image"] == "https://x/bill2.jpg"
    assert out["bill_images"] == ["https://x/bill1.jpg", "https://x/bill2.jpg"]


def test_list_payment_requests_does_not_list_storage(monkeypatch):
    """Route danh sách PHẢI không gọi _fetch_bill_assets_fast (storm Storage)."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import payment_request_routes as prr

    def _boom(*a, **k):
        raise AssertionError("route danh sách KHÔNG được liệt kê Storage bill")

    monkeypatch.setattr(prr, "_fetch_bill_assets_fast", _boom)

    class _Actor:
        email = "admin@test.com"

    monkeypatch.setattr(prr, "resolve_actor", lambda sb, auth: _Actor())
    monkeypatch.setattr(prr, "visible_creator_emails", lambda sb, actor: None)
    monkeypatch.setattr(prr, "_sale_name_map", lambda sb: {})

    pr_row = {"id": "PR1", "sale_email": "s@x.com", "state": "pending",
              "created_at": "2026-01-01T00:00:00Z"}
    line_row = {"id": "L1", "payment_request_id": "PR1", "status": "paid",
                "bill_images": ["https://x/bill.jpg"], "created_at": "2026-01-01T00:00:00Z"}

    def _table(name):
        t = MagicMock()
        for m in ("select", "eq", "in_", "order", "range", "limit", "single"):
            getattr(t, m).return_value = t
        if name == "payment_requests":
            t.execute.return_value = MagicMock(data=[pr_row])
        elif name == "payment_lines":
            t.execute.return_value = MagicMock(data=[line_row])
        else:
            t.execute.return_value = MagicMock(data=[])
        return t

    sb = MagicMock()
    sb.table.side_effect = _table

    app = FastAPI()
    prr.register_payment_request_routes(app, lambda: sb)
    client = TestClient(app)
    res = client.get("/payment-requests")

    assert res.status_code == 200
    payment = res.json()["requests"][0]["payments"][0]
    assert payment["bill"] is True
    assert payment["bill_image"] == "https://x/bill.jpg"
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py::test_list_payment_requests_does_not_list_storage -v`
Expected: FAIL với `AssertionError: route danh sách KHÔNG được liệt kê Storage bill` (route hiện gọi `_fetch_bill_assets_fast` ở dòng ~1670).

- [ ] **Step 3: Bỏ lời gọi Storage khỏi route**

Trong `backend/payment_request_routes.py`, tìm khối trong `list_payment_requests` (dòng ~1664-1671):

```python
        all_line_ids = [
            str(line.get("id") or "")
            for lines in lines_by_pr.values()
            for line in lines
            if line.get("id")
        ]
        bill_assets = _fetch_bill_assets_fast(sb, all_line_ids)
        bill_urls = _bill_urls_from_assets(bill_assets)
```

Xoá TOÀN BỘ khối trên (route đọc bill từ cột `payment_lines.bill_images` đã có trong `select("*")`; không cần liệt kê Storage).

- [ ] **Step 4: Cập nhật lời gọi serialize — truyền dict rỗng cho tham số Storage**

Trong cùng hàm, tìm (dòng ~1695-1697):

```python
            item = _serialize_payment_request_list_item(
                row, lines_by_pr.get(pr_id, []), bill_urls, bill_assets, name_map
            )
```

Thay bằng:

```python
            item = _serialize_payment_request_list_item(
                row, lines_by_pr.get(pr_id, []), {}, {}, name_map
            )
```

- [ ] **Step 5: Chạy test để xác nhận PASS + không vỡ test cũ**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py tests/test_pr_multi_child.py -v`
Expected: tất cả PASS

- [ ] **Step 6: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_health_check_and_bill_column.py
git commit -m "fix(pr-list): bo storm liet-ke Storage, doc trang-thai bill tu cot DB (O(trang) thay vi O(tong bill))"
```

---

### Task 3: Migration backfill cột `bill_images` cho line cũ

**Files:**
- Create: `backend/migrations/2026-07-10-backfill-bill-images-column.sql`

- [ ] **Step 1: Viết migration**

Tạo `backend/migrations/2026-07-10-backfill-bill-images-column.sql`:

```sql
-- 2026-07-10: Backfill cột payment_lines.bill_images từ storage.objects.
-- Vì sao: route danh sách PR chuyển sang đọc cột DB (bỏ storm liệt-kê Storage).
-- 50/111 line có bill trong Storage nhưng cột rỗng → phải điền trước khi deploy
-- code, nếu không các line này hiển thị "thiếu bill".
-- Idempotent: chỉ UPDATE line có cột rỗng; chạy lại nhiều lần vô hại.
--
-- CHẠY TRÊN CẢ 2 PROJECT, ĐỔI host cho đúng ref rồi mới chạy:
--   prod    ref = jozcvbbypwvzaefteoxn
--   sandbox ref = pxgybyfiwywksesyogti
-- (URL public bill có dạng https://<ref>.supabase.co/storage/v1/object/public/bills/<name>)
--
-- APPLIED: prod    (jozcvbbypwvzaefteoxn)  <để trống, điền ngày sau khi chạy>
-- APPLIED: sandbox (pxgybyfiwywksesyogti)  <để trống, điền ngày sau khi chạy>

WITH storage_bills AS (
  SELECT
    split_part(o.name, '/', 2) AS line_id,
    o.name AS object_name,
    o.created_at,
    'https://jozcvbbypwvzaefteoxn.supabase.co/storage/v1/object/public/bills/' || o.name AS url
  FROM storage.objects o
  WHERE o.bucket_id = 'bills'
    AND o.name LIKE 'payment-lines/%/bill%'
),
agg AS (
  SELECT
    line_id,
    jsonb_agg(url ORDER BY created_at, object_name) AS urls
  FROM storage_bills
  WHERE line_id <> ''
  GROUP BY line_id
)
UPDATE payment_lines pl
SET
  bill_images = agg.urls,
  bill_image  = agg.urls ->> (jsonb_array_length(agg.urls) - 1)
FROM agg
WHERE pl.id::text = agg.line_id
  AND (pl.bill_images IS NULL OR jsonb_array_length(pl.bill_images) = 0);
```

- [ ] **Step 2: Áp migration lên SANDBOX trước (đổi host thành `pxgybyfiwywksesyogti`)**

Dùng Supabase MCP `apply_migration` (project sandbox `pxgybyfiwywksesyogti`) hoặc SQL editor. Trước khi chạy, **sửa 2 chỗ host** trong câu SQL từ `jozcvbbypwvzaefteoxn` → `pxgybyfiwywksesyogti` (dòng `url` trong CTE).

- [ ] **Step 3: Verify sandbox — không còn line "bill ở Storage mà cột rỗng"**

Chạy SQL kiểm tra trên sandbox:

```sql
SELECT count(*) AS gap
FROM payment_lines pl
JOIN (
  SELECT DISTINCT split_part(name, '/', 2) AS line_id
  FROM storage.objects
  WHERE bucket_id = 'bills' AND name LIKE 'payment-lines/%/bill%'
) s ON s.line_id = pl.id::text
WHERE pl.bill_images IS NULL OR jsonb_array_length(pl.bill_images) = 0;
```

Expected: `gap = 0`. Điền ngày vào dòng `APPLIED: sandbox`.

- [ ] **Step 4: Áp migration lên PROD (host `jozcvbbypwvzaefteoxn` — giữ nguyên)**

Áp trên project prod `jozcvbbypwvzaefteoxn`. Chạy lại SQL verify Step 3 trên prod → `gap = 0`. Điền ngày vào dòng `APPLIED: prod`.

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/2026-07-10-backfill-bill-images-column.sql
git commit -m "chore(migration): backfill bill_images tu storage.objects (prod+sandbox) truoc khi bo Storage listing"
```

---

### Task 4: Vá cache poisoning — merge thay vì ghi đè

**Files:**
- Modify: `backend/payment_request_routes.py:551-555` (trong `_fetch_bill_assets_fast`)
- Test: `backend/tests/test_health_check_and_bill_column.py`

**Vì sao:** các route drawer/download/delete (một-line) gọi `_fetch_bill_assets_fast(sb, [line_id], force_refresh=True)`. Fast-path `storage.objects` fail ở prod → fallback trả dict CHỈ 1 line → code hiện `_bill_assets_cache["assets_by_line"] = dict(fallback)` **xoá sạch** các line khác trong cache → request kế tiếp đọc cache thấy line khác = [] → báo nhầm "không có bill". (Nghi liên quan popup "thiếu bill" 10/7.)

- [ ] **Step 1: Viết test thất bại**

Thêm vào `backend/tests/test_health_check_and_bill_column.py`:

```python
def test_single_line_cache_refresh_preserves_other_lines(monkeypatch):
    """force_refresh 1 line KHÔNG được xoá cache của line khác."""
    import payment_request_routes as prr

    prr._bill_assets_cache["assets_by_line"] = {
        "OTHER": [{"url": "u-other", "path": "payment-lines/OTHER/bill.jpg"}]
    }
    prr._bill_assets_cache["expires_at"] = 0.0

    # Ép fast-path (storage.objects) "fail" như prod → đi fallback per-line.
    monkeypatch.setattr(prr, "_build_bill_assets_from_storage_objects", lambda sb: {})
    monkeypatch.setattr(
        prr, "_build_bill_assets_from_storage_fallback",
        lambda sb, wanted: {"L1": [{"url": "u-l1", "path": "payment-lines/L1/bill.jpg"}]},
    )

    out = prr._fetch_bill_assets_fast(MagicMock(), ["L1"], force_refresh=True)

    assert out["L1"][0]["url"] == "u-l1"
    # Line OTHER phải còn trong cache sau refresh 1-line.
    assert prr._bill_assets_cache["assets_by_line"].get("OTHER"), "cache bị xoá line khác"
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py::test_single_line_cache_refresh_preserves_other_lines -v`
Expected: FAIL với `AssertionError: cache bị xoá line khác` (code hiện ghi đè bằng `dict(fallback)`).

- [ ] **Step 3: Đổi ghi-đè thành merge**

Trong `backend/payment_request_routes.py`, tìm (dòng ~551-555):

```python
        fallback = _build_bill_assets_from_storage_fallback(sb, wanted)
        if fallback:
            _bill_assets_cache["assets_by_line"] = dict(fallback)
            _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
        return fallback
```

Thay bằng:

```python
        fallback = _build_bill_assets_from_storage_fallback(sb, wanted)
        if fallback:
            existing = _bill_assets_cache.get("assets_by_line")
            if not isinstance(existing, dict):
                existing = {}
            # Merge: fallback là kết quả từng-line (thường 1 line), KHÔNG được xoá
            # các line khác đang cache — nếu không route drawer/download báo nhầm
            # "không có bill" cho line kế tiếp (bug mất bill 2026-07-10).
            _bill_assets_cache["assets_by_line"] = {**existing, **fallback}
            _bill_assets_cache["expires_at"] = now + _BILL_STORAGE_CACHE_TTL_SECONDS
        return fallback
```

- [ ] **Step 4: Chạy test để xác nhận PASS**

Run: `cd backend && python -m pytest tests/test_health_check_and_bill_column.py -v`
Expected: cả 5 test PASS

- [ ] **Step 5: Commit**

```bash
git add backend/payment_request_routes.py backend/tests/test_health_check_and_bill_column.py
git commit -m "fix(bill-cache): merge cache single-line thay vi ghi de (chong mat bill o drawer/download)"
```

---

## Guardrails (kiểm trước khi merge main)

- [ ] **Toàn bộ test backend xanh:** `cd backend && python -m pytest -q` — không hồi quy (đặc biệt `test_supabase_singleton.py`, `test_pr_multi_child.py`, `test_orders_scope.py`, các `test_zalo_*`/`test_refresh_content_endpoint.py` liên quan bill).
- [ ] **Backfill đã chạy prod + sandbox, `gap = 0` (Task 3 Step 3/4) TRƯỚC khi deploy code.** Đây là guardrail sống-còn: deploy code trước backfill = 50 line mất bill.
- [ ] **Không còn caller Storage-listing trong đường-danh-sách:** `grep -n "_fetch_bill_assets_fast" backend/payment_request_routes.py` — mọi hit còn lại phải nằm trong route MỘT-line (upload/delete/download/refresh), KHÔNG có trong `list_payment_requests`.
- [ ] **`/healthz` không còn nhánh DB:** `grep -n "_supabase\|\.execute()" backend/main.py` quanh hàm `health()` — trống; DB ping chỉ còn ở `health_deep()`.
- [ ] **Render vẫn trỏ health check đúng:** `render.yaml` giữ `healthCheckPath: /healthz` (không đổi) — giờ endpoint trả tức thì.
- [ ] **Soak sandbox** theo skill `deploying-gmv`: mở bảng PR (phải nhanh, không còn 10–25s), upload 1 bill line A rồi mở line B (line B vẫn thấy bill — test merge cache), xem `/healthz` phản hồi <200ms.

## Đánh giá theo 4 tiêu chí

1. **Triệt để (root cause):** ✅ Xoá hẳn thao-tác-chi-phí-theo-tổng-bill khỏi đường nóng (route danh sách + health check), không phải nới timeout hay tăng RAM. Health check tách trách nhiệm đúng bản chất (liveness ≠ dependency check).
2. **Không lỗi con:** ✅ Backfill idempotent chạy trước (không mất bill); `_bill_fields` vốn đã ưu tiên cột; merge-cache vá luôn bug mất bill sẵn có; FE không đọc `/healthz` (đã grep, 0 hit) nên tách endpoint không phá client. Test hồi quy phủ cả 3 đường.
3. **Không tăng gánh hạ tầng / giảm hiệu năng:** ✅ Ngược lại — bỏ 111 HTTP-list/trang (còn 0), cột `bill_images` đã nằm trong `select("*")` sẵn có nên **0 query thêm**; chi phí route đổi từ O(tổng bill) sang O(trang≈100), phẳng khi scale 10k–100k bill. Ảnh thật vẫn khách tự tải từ CDN, server gánh 0.
4. **Tiết kiệm quota (thực thi):** ✅ Fix gọn 3 file code + 1 migration + 1 file test; không cần fan-out subagent. Nếu chạy subagent-driven: tối đa 1 subagent/task, scope rõ theo checkbox, không mở rộng ngoài plan.

## Ngoài phạm vi (ghi nhận, KHÔNG làm lần này)

- **Phân trang sâu** (`offset` lớn khi ~100k PR) → keyset pagination — chỉ cắn ở quy mô rất lớn, độc lập với bill.
- **Chỉ mục tìm "PR thiếu bill" toàn hệ thống** → index DB, thêm khi có nhu cầu.
- **Route drawer/download/delete vẫn liệt kê Storage 1-line** để lấy `path`/`name` (cột chỉ lưu URL) — chấp nhận: mỗi thao tác 1 line, không storm; chuyển hẳn sang cột cần lưu thêm `path` metadata, để sau.

## Rollback

- Code: revert 3 commit Task 1/2/4 (`git revert <sha>`) → route quay lại đọc Storage; an toàn vì cột vẫn còn (backfill không phá gì).
- Migration: không cần rollback — chỉ điền thêm cột rỗng, dữ liệu Storage/`bill_image` cũ nguyên vẹn.
