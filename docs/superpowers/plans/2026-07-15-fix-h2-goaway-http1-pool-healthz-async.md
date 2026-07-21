# Fix HTTP/2 GOAWAY Storm + Healthz Threadpool Starvation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ngừng vòng "Instance failed: HTTP health check timed out" (14–15/07) bằng cách (1) ép postgrest client của singleton Supabase dùng HTTP/1.1 connection pool thay vì multiplex mọi query qua 1 connection HTTP/2, và (2) chuyển `/healthz` sang `async def` để miễn nhiễm threadpool đầy.

**Architecture:** supabase-py kéo theo `httpx[http2]` và postgrest sync client tạo `httpx.Client(http2=True)` → toàn bộ query DB của MỌI request đi qua **1 connection HTTP/2 duy nhất** (singleton từ fix OOM 09/07). HTTP/2 có trần ~100 concurrent streams/connection; FE load-all PR (3 trang `limit=500` song song × nhiều user × poll 30s) + mỗi request `/payment-requests` chạy ~12 query tuần tự → vượt trần → server gửi GOAWAY (`ConnectionTerminated error_code:1, last_stream_id:99`) → mọi query đang bay chết cùng lúc → 500 + threads kẹt retry → threadpool (40, anyio default) đầy → `/healthz` (sync def, phải xếp hàng threadpool) trễ >5s → Render kill instance → user reconnect → storm lặp lại.

Fix: HTTP/1.1 **không có trần stream** — mỗi query lấy 1 connection từ pool, vượt pool thì xếp hàng vài chục ms thay vì chết hàng loạt. `/healthz` async chạy thẳng trên event loop, không phụ thuộc threadpool. Giữ nguyên singleton (KHÔNG đụng fix memory-leak 09/07 — xem `test_supabase_singleton.py`).

**Tech Stack:** Python 3.12 / FastAPI, supabase-py ≥2.4, httpx, pytest.

---

## Bối cảnh chẩn đoán (đọc trước khi code)

- Log Render 15/07 03:35:29Z: `Khong doc duoc active_requests for PR referral_status: <ConnectionTerminated error_code:1, last_stream_id:99, additional_data:None>` ngay trước 500 trên `/payment-requests` → xác nhận h2 GOAWAY (chỉ xảy ra khi HTTP/2 active).
- `ConnectionTerminated` là exception của package `h2` — `postgrest` declare dependency `httpx[http2]` nên h2 luôn được cài, không gỡ được bằng requirements.
- Đây là **round 2** của health-check storm. Round 1 (10/07, plan `2026-07-10-fix-health-check-storm-bill-column.md`) đã sửa `/healthz` khỏi ping DB — nhưng `/healthz` vẫn là **sync def** nên vẫn chết khi threadpool bị starve bởi đường khác.
- `rbac.py:12` dùng `_http = httpx.Client(timeout=15)` riêng (mặc định HTTP/1.1) cho auth-check → **KHÔNG** đi qua connection h2, không cần sửa.
- Hot path storm = postgrest (`.table()...execute()`). Storage/auth/functions sub-client có thể cũng h2 nhưng volume thấp (single-line routes) → ngoài phạm vi.
- Đường tạo client: `backend/main.py:222-249` hàm `_supabase()`, singleton `_sb_instance` + `_sb_lock`.
- ⚠️ **Bẫy test env:** repo có thư mục `supabase/` shadow package Python trên sys.path khi chạy pytest (xem comment `test_supabase_singleton.py:21-23`) → test KHÔNG được gọi `create_client` thật; phải mock, và logic override phải tách thành hàm riêng test được với fake client.
- ⚠️ **Bẫy test cũ:** `test_health_check_and_bill_column.py:29` gọi `main.health()` trực tiếp — đổi sang `async def` mà không sửa test này thì nó nhận coroutine và FAIL (`res["status"]` → TypeError).
- ⚠️ **Môi trường local:** `python`/`pip` không có trên PATH máy này (`run.ps1` hardcode miniconda của user khác). Thử `py -3 -m pytest`, hoặc tìm python qua `Get-Command py, python3`, hoặc conda env. Nếu tuyệt đối không có python local → đẩy lên nhánh sandbox và verify bằng Render sandbox logs + `/healthz/deep` (ghi rõ trong báo cáo là test chưa chạy local).

## File Structure

- `backend/main.py` — (1) thêm hàm module-level `_force_http1_session(sb) -> bool` ngay trên `_supabase()`; (2) gọi nó trong `_supabase()` sau `create_client` (~dòng 245); (3) `health()` ~dòng 603-609 → `async def`. **Không sửa gì khác.**
- `backend/requirements.txt` — pin upper bound `supabase>=2.4.0,<3` (guardrail: override đụng internal attr `postgrest.session`, chặn major-version breaking khi Render build lại).
- `backend/tests/test_http1_pool_and_async_healthz.py` — **Create.** 5 test.
- `backend/tests/test_health_check_and_bill_column.py` — **Modify.** Sửa `test_healthz_never_touches_db` gọi qua `asyncio.run()`.

---

### Task 1: Ép postgrest session sang HTTP/1.1 connection pool

**Files:**
- Modify: `backend/main.py` (hàm mới `_force_http1_session` + 1 lời gọi trong `_supabase()`)
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_http1_pool_and_async_healthz.py`

- [ ] **Step 1: Viết test thất bại**

Tạo `backend/tests/test_http1_pool_and_async_healthz.py`:

```python
"""HTTP/2 GOAWAY storm + healthz threadpool starvation (2026-07-15).

Plan: docs/superpowers/plans/2026-07-15-fix-h2-goaway-http1-pool-healthz-async.md
Sự cố: singleton postgrest dùng 1 connection HTTP/2, trần ~100 streams →
GOAWAY (ConnectionTerminated last_stream_id:99) → 500 + threads kẹt →
/healthz (sync) xếp hàng threadpool >5s → Render kill instance.
Fix: postgrest session → httpx HTTP/1.1 pool; /healthz → async def.
"""
from __future__ import annotations

import inspect
import os
import sys
from types import SimpleNamespace

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _fake_sb_with_session():
    """Fake supabase client mang postgrest.session là httpx.Client thật
    (KHÔNG gọi create_client thật — package bị thư mục supabase/ của repo
    shadow trong test env, xem test_supabase_singleton.py)."""
    old = httpx.Client(
        base_url="https://example.supabase.co/rest/v1",
        headers={"apikey": "k-test", "Authorization": "Bearer k-test",
                 "Accept-Profile": "public"},
        timeout=httpx.Timeout(20),
    )
    return SimpleNamespace(postgrest=SimpleNamespace(session=old)), old


def test_force_http1_replaces_session_and_preserves_params():
    import main

    sb, old = _fake_sb_with_session()
    assert main._force_http1_session(sb) is True
    new = sb.postgrest.session
    assert new is not old, "session phải được thay mới"
    assert old.is_closed, "session h2 cũ phải được đóng (tránh leak pool)"
    # Headers/base_url/timeout copy nguyên — thiếu apikey/Accept-Profile là chết mọi query
    assert new.headers["apikey"] == "k-test"
    assert new.headers["authorization"] == "Bearer k-test"
    assert new.headers["accept-profile"] == "public"
    assert str(new.base_url).rstrip("/") == "https://example.supabase.co/rest/v1"
    assert new.timeout == old.timeout


def test_force_http1_source_disables_http2():
    """Structural guard (cùng kiểu test_supabase_lock_exists): hàm override
    phải tạo client http2=False — trần ~100 streams/connection của HTTP/2
    chính là gốc GOAWAY storm."""
    import main

    src = inspect.getsource(main._force_http1_session)
    assert "http2=False" in src
    assert "max_connections" in src, "phải set httpx.Limits cho pool"


def test_force_http1_failure_keeps_old_session():
    """Guardrail: internals postgrest đổi (không còn .session) → KHÔNG crash,
    giữ nguyên client cũ (app chạy tiếp như hiện tại, chỉ log warning)."""
    import main

    sb = SimpleNamespace(postgrest=SimpleNamespace())  # không có .session
    assert main._force_http1_session(sb) is False

    sb2 = SimpleNamespace(postgrest=SimpleNamespace(session="not-a-client"))
    assert main._force_http1_session(sb2) is False


def test_supabase_singleton_calls_force_http1(monkeypatch):
    """_supabase() phải gọi _force_http1_session đúng 1 lần cho instance mới."""
    import main
    import supabase

    main._sb_instance = None
    sentinel = object()
    called = {"n": 0, "arg": None}

    monkeypatch.setattr(supabase, "create_client",
                        lambda url, key: sentinel, raising=False)

    def _fake_force(sb):
        called["n"] += 1
        called["arg"] = sb
        return True

    monkeypatch.setattr(main, "_force_http1_session", _fake_force)
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "eyJ" + "x" * 60)

    a = main._supabase()
    b = main._supabase()
    assert a is sentinel and b is sentinel
    assert called["n"] == 1, "chỉ override 1 lần khi tạo singleton"
    assert called["arg"] is sentinel
    main._sb_instance = None
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && py -3 -m pytest tests/test_http1_pool_and_async_healthz.py -v` (thay `py -3` bằng python tìm được — xem Bối cảnh)
Expected: FAIL với `AttributeError: module 'main' has no attribute '_force_http1_session'`.

- [ ] **Step 3: Thêm `_force_http1_session` vào `backend/main.py`**

Đặt ngay TRÊN hàm `_supabase()` (~dòng 220):

```python
def _force_http1_session(sb) -> bool:
    """Thay session HTTP/2 của postgrest bằng httpx HTTP/1.1 pool.

    postgrest (supabase-py) tạo httpx.Client(http2=True) → mọi query của
    singleton multiplex qua 1 connection, trần ~100 streams → server GOAWAY
    (ConnectionTerminated last_stream_id:99) giết hàng loạt query đang bay,
    threads kẹt → /healthz trễ >5s → Render kill instance (storm 14-15/07).
    HTTP/1.1 pool: vượt pool thì query xếp hàng, không bao giờ chết chùm.

    Trả False (và giữ nguyên session cũ) nếu internals postgrest đổi —
    app khi đó chạy tiếp như trước, chỉ mất tối ưu. requirements.txt pin
    supabase<3 để internals không trôi bất ngờ.
    """
    try:
        old = getattr(getattr(sb, "postgrest", None), "session", None)
        if not isinstance(old, httpx.Client):
            print("[supabase] _force_http1_session: postgrest.session không phải httpx.Client — giữ nguyên HTTP/2")
            return False
        new = httpx.Client(
            base_url=old.base_url,
            headers=dict(old.headers),
            timeout=old.timeout,
            follow_redirects=old.follow_redirects,
            http2=False,
            # 40 = trần threadpool sync endpoints (anyio default) → pool không bao giờ PoolTimeout
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )
        sb.postgrest.session = new
        old.close()
        print("[supabase] postgrest qua HTTP/1.1 pool (max=40, keepalive=20) — chống GOAWAY storm")
        return True
    except Exception as exc:
        print(f"[supabase] _force_http1_session failed, giữ HTTP/2: {exc}")
        return False
```

- [ ] **Step 4: Gọi trong `_supabase()`**

Trong `_supabase()` (~dòng 245), sau `_sb_instance = create_client(url, key)` và TRƯỚC `return _sb_instance`:

```python
            _sb_instance = create_client(url, key)
            _force_http1_session(_sb_instance)
            return _sb_instance
```

- [ ] **Step 5: Pin upper bound supabase trong `backend/requirements.txt`**

Đổi dòng `supabase>=2.4.0` thành:

```
supabase>=2.4.0,<3
```

- [ ] **Step 6: Chạy test xác nhận PASS + không vỡ singleton tests**

Run: `cd backend && py -3 -m pytest tests/test_http1_pool_and_async_healthz.py tests/test_supabase_singleton.py -v`
Expected: tất cả PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/main.py backend/requirements.txt backend/tests/test_http1_pool_and_async_healthz.py
git commit -m "fix(supabase): ep postgrest session sang HTTP/1.1 pool — chong GOAWAY storm giet query hang loat (ConnectionTerminated last_stream_id:99)"
```

---

### Task 2: `/healthz` → `async def` (miễn nhiễm threadpool starvation)

**Files:**
- Modify: `backend/main.py:603-609` (hàm `health()`)
- Modify: `backend/tests/test_health_check_and_bill_column.py` (test cũ gọi `main.health()` trực tiếp)
- Test: `backend/tests/test_http1_pool_and_async_healthz.py`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `backend/tests/test_http1_pool_and_async_healthz.py`:

```python
def test_healthz_is_async():
    """/healthz phải là async def — sync def xếp hàng threadpool (40 slot);
    khi storm làm threads kẹt, health check trễ >5s → Render kill instance
    dù app còn sống (round 2 của storm 10/07, lần này 14-15/07)."""
    import main

    assert inspect.iscoroutinefunction(main.health)
```

- [ ] **Step 2: Chạy test để xác nhận FAIL**

Run: `cd backend && py -3 -m pytest tests/test_http1_pool_and_async_healthz.py::test_healthz_is_async -v`
Expected: FAIL (hàm hiện là sync def).

- [ ] **Step 3: Đổi `health()` sang async**

Trong `backend/main.py` (~dòng 603), thay:

```python
@app.get("/healthz")
def health():
    """Liveness probe cho Render — PHẢI trả lời tức thì, KHÔNG chạm DB.
    Render giết instance nếu health check không đáp trong 5s; việc ping Supabase
    ở đây gây restart storm dưới tải cao (2026-07-10). Chẩn đoán sâu (ping DB,
    format key, ...) chuyển sang /healthz/deep."""
    return {"status": "ok", "app_env": app_env(), "sandbox": is_sandbox_env()}
```

bằng:

```python
@app.get("/healthz")
async def health():
    """Liveness probe cho Render — PHẢI trả lời tức thì, KHÔNG chạm DB.
    Render giết instance nếu health check không đáp trong 5s; ping Supabase
    ở đây gây restart storm dưới tải (2026-07-10). PHẢI là async def: sync def
    xếp hàng threadpool (40 slot) — khi threads kẹt vì DB storm, health check
    trễ >5s → Render kill instance dù app còn sống (2026-07-15). Chẩn đoán
    sâu (ping DB, format key, ...) ở /healthz/deep."""
    return {"status": "ok", "app_env": app_env(), "sandbox": is_sandbox_env()}
```

(`/healthz/deep` giữ nguyên sync — nó cố ý chạm DB, ít được gọi.)

- [ ] **Step 4: Sửa test cũ đang gọi `main.health()` trực tiếp**

Trong `backend/tests/test_health_check_and_bill_column.py`, hàm `test_healthz_never_touches_db` (~dòng 29), thay:

```python
    res = main.health()
```

bằng:

```python
    import asyncio

    res = asyncio.run(main.health())
```

- [ ] **Step 5: Chạy TOÀN BỘ test backend xác nhận PASS**

Run: `cd backend && py -3 -m pytest -q`
Expected: tất cả PASS, đặc biệt `test_health_check_and_bill_column.py` + `test_supabase_singleton.py` + file test mới.

- [ ] **Step 6: Commit**

```bash
git add backend/main.py backend/tests/test_health_check_and_bill_column.py backend/tests/test_http1_pool_and_async_healthz.py
git commit -m "fix(healthz): async def — mien nhiem threadpool starvation, Render khong the kill instance con song (round 2 storm 14-15/07)"
```

---

## Guardrails (kiểm trước khi merge main)

- [ ] **Toàn bộ test backend xanh:** `cd backend && py -3 -m pytest -q` — không hồi quy (`test_supabase_singleton.py` sống còn: singleton là fix OOM 09/07, KHÔNG được vỡ).
- [ ] **Fallback không phá app:** `_force_http1_session` fail → return False + log, `_supabase()` vẫn trả client (test `test_force_http1_failure_keeps_old_session` cover). App tệ nhất = như hiện tại.
- [ ] **Headers copy đủ:** apikey, Authorization, Accept-Profile phải có trong session mới (test cover) — thiếu 1 cái là MỌI query DB chết → còn tệ hơn bug gốc.
- [ ] **Không tạo client mới per-request:** override chỉ chạy 1 lần trong lock của `_supabase()` (test `test_supabase_singleton_calls_force_http1` cover) — tránh tái sinh memory leak 09/07.
- [ ] **Deploy sandbox TRƯỚC, soak, rồi mới main:** đẩy nhánh `sandbox` → Render sandbox BE tự deploy. Verify trên sandbox:
  1. Log khởi động có dòng `[supabase] postgrest qua HTTP/1.1 pool (max=40, keepalive=20)` — nếu thấy dòng `failed, giữ HTTP/2` thì DỪNG, không merge main, báo user (internals supabase-py trên Render khác dự kiến).
  2. `GET /healthz` trả `{"status":"ok",...}` <200ms; `GET /healthz/deep` có `supabase_db_reachable: true`.
  3. Mở app sandbox, vào tab Quản lý thanh toán → danh sách PR load bình thường (bill, TVTS, referral_status hiển thị đủ — xác nhận headers/schema copy đúng).
- [ ] **Sau deploy main: theo dõi Render Events 24h** — success = 0 event "Instance failed", và search log `ConnectionTerminated` = 0 hit trong giờ cao điểm (sáng 10-11h là khung giờ fail của 14-15/07).
- [ ] **MODULES.md:** thêm file test mới vào index nếu mục backend tests có liệt kê từng file.

## Đánh giá theo 4 tiêu chí

1. **Triệt để:** ✅ Xóa cả 2 mắt xích gây chết ở tầng gốc: (a) GOAWAY chỉ tồn tại vì trần streams của HTTP/2 — HTTP/1.1 pool không có trần, vượt pool là xếp hàng chứ không chết chùm, không phụ thuộc số user/tab; (b) healthz async không thể bị threadpool starve — mọi storm tương lai (kể cả loại chưa biết) không giết được instance. So sánh: RPC gộp query chỉ lùi ngưỡng (~4 user → ~13 user), không triệt để.
2. **Không lỗi con:** ✅ Không đụng business logic / RBAC / serialization / FE. Rủi ro duy nhất (internals postgrest đổi) được chặn 3 lớp: feature-detect `isinstance(old, httpx.Client)`, try/except giữ session cũ, pin `supabase<3`. Test cover cả happy path lẫn failure path; bẫy test-cũ-gọi-health()-trực-tiếp đã xử lý trong plan.
3. **Không tăng gánh nặng hạ tầng:** ✅ 0 migration, 0 config Render, 0 service mới, 0 RPC phải maintain ×2 project. Chi phí runtime: ~40 socket keepalive thay vì 1 (không đáng kể so với 512MB RAM; round 1 đo RAM chỉ ~160MB).
4. **Tối ưu token:** ✅ 2 task, diff ~40 dòng code + 1 file test, cùng 1 file `main.py`. Executor không cần đọc lại codebase — mọi vị trí đã có path:line, mọi bẫy đã ghi rõ. Không fan-out subagent; nếu subagent-driven thì tối đa 1 subagent/task, scope theo checkbox.

## Ngoài phạm vi (ghi nhận, KHÔNG làm lần này)

- **RPC/JOIN gộp 12 query → 2 của `/payment-requests`** — chỉ là tối ưu hiệu năng sau khi hết chết chùm; cân nhắc khi PR tăng (đã có warn threshold 1500).
- **GĐ2 slim list (FE pagination)** — theo roadmap scale, trigger = console warn `PR_TOTAL_WARN_THRESHOLD` 1500 PR; plan riêng đã có (`2026-07-11-pr-list-slim-lazy-gd2.md`).
- **Storage/auth/functions sub-client vẫn HTTP/2** — volume thấp (single-line routes), không đủ tạo storm; nếu sau này thấy ConnectionTerminated từ storage thì mở rộng override.
- **Uvicorn nhiều worker / tăng threadpool** — tăng RAM footprint trên instance 512MB, không cần khi đã hết chết chùm.

## Rollback

- Code: `git revert` 2 commit — stateless, không migration, không đổi config. Session HTTP/2 quay lại như cũ (app chạy được, chỉ còn nguy cơ storm như hiện tại).

## Sau khi xong

- Chạy skill `extract-approach` — learning: "health-check storm round 2: round 1 sửa symptom (healthz ping DB), round 2 mới ra gốc (h2 stream ceiling + sync-def healthz). Bài học: singleton client + HTTP/2 multiplex = trần streams ẩn; endpoint liveness phải async."
