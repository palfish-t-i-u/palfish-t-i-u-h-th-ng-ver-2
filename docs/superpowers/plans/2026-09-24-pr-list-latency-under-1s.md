# PLAN — Tab Quản lý thanh toán mượt <1s + drawer lag ~0

**Ngày:** 24/9/2026 · **Bàn giao:** Đức & Đạt (+ Minh duyệt) · **Branch:** mới từ `main` (vd `perf/pr-tab-under-1s`)
**Mục tiêu:** mọi thao tác tab Quản lý thanh toán delay thấp nhất (<1s lý tưởng); mở drawer PR lag ~0.
**Trạng thái nền:** server-pagination đã LIVE (flag `VITE_PR_LIST_MODE=server`). RPC DB đã nhanh (page 102ms, summary 70ms, badge 25ms). Nút cổ chai còn lại nằm ở **tầng BE per-request**, không phải DB/network.

---

## 0. CHẨN ĐOÁN (đo thật: HAR prod + Supabase MCP + đọc code)

HAR (1 phiên thao tác, 45 request API). **100% thời gian là `wait`/TTFB = server compute**, `receive` chỉ 4-165ms → KHÔNG phải network/payload:

| endpoint | count | max | avg | TTFB | RPC DB thật |
|---|---|---|---|---|---|
| active-requests?pr_ids | 11 | 2.3s | 1.7s | 2.3s | — (không dùng RPC) |
| payment-requests(page) | 12 | 1.9s | 1.3s | 1.7s | pr_list_page = **102ms** |
| badge-counts | 6 | 2.0s | 1.1s | 1.1s | pr_badge_counts = **25ms** |
| summary | 12 | 1.0s | 0.7s | 0.9s | pr_list_summary = **70ms** |
| notifications | 4 | 0.9s | 0.7s | 0.9s | (query đơn giản) |

**3 gốc rễ:**
- **(A) Auth per-request gọi Supabase Auth API — SÀN ~400-900ms MỌI request.** `rbac.py:174 resolve_actor` → `_auth_user_from_jwt(token)` (`rbac.py:133-142`) HTTP GET Supabase Auth verify JWT **mỗi request, KHÔNG cache** (chỉ `_lookup_staff` cache). Bằng chứng: `notifications`/`summary` gần như không logic (RPC 70ms) mà vẫn 0.9s TTFB → overhead chung = bước verify token.
- **(B) 1 uvicorn worker** (`backend/Dockerfile` CMD không `--workers`) → FE bắn 4-5 request/lần load → **xếp hàng serial** → cùng endpoint dao động 543ms↔2.3s tùy vị trí hàng đợi. Nhân với (A): mỗi request +400ms auth × queue.
- **(C) Enrich sau RPC nặng:** `page` 1.7s dù RPC 102ms → `_list_payment_requests_page` fetch thêm payment_lines + pr_completion_reports + active_requests(referral) + `_sale_name_map` + `_staff_map` rồi serialize per row. `active-requests?pr_ids` 2.3s = enrich per-AR (chưa đọc kỹ — G3).
- **(D) Quá nhiều request:** badge 6× / page 12× / summary 12× / active 11× trong 1 phiên → double-fetch (F5 chưa fix) + poll/realtime refire. Mỗi request cõng (A)+(B).

---

## G1 — AUTH: verify JWT LOCAL, bỏ ~400ms/request [BE — ĐÒN BẨY LỚN NHẤT]

**File:** `backend/rbac.py` (`_auth_user_from_jwt` ~133, `resolve_actor` ~174).
**Vấn đề:** verify token = HTTP call Supabase Auth mỗi request. **Áp lên MỌI endpoint** → xoá cái này là nhanh toàn app, không chỉ tab này.

**⚠️ Đã xác nhận 24/9:** project dùng JWT signing key **ECC P-256 (bất đối xứng, ES256)** — KHÔNG phải HS256 shared secret. Nên verify bằng **public key (JWKS)**, KHÔNG có secret để set.

**Cách (ưu tiên) — verify LOCAL bằng JWKS (public key), 0 network sau lần đầu:**
Token ký bằng private key phía Supabase; verify bằng **public key** lấy từ JWKS URL:
`https://jozcvbbypwvzaefteoxn.supabase.co/auth/v1/.well-known/jwks.json` (sandbox đổi ref tương ứng).
`pyjwt`+`PyJWKClient` fetch JWKS 1 lần + cache (key hiếm đổi) → verify ES256 offline (~1ms). Giữ `_lookup_staff` (cache) cho role/team.
```python
# rbac.py — verify ES256 local qua JWKS:
import jwt
from jwt import PyJWKClient
_JWKS = PyJWKClient(f"{os.environ['SUPABASE_URL']}/auth/v1/.well-known/jwks.json", cache_keys=True)
def _auth_user_from_jwt(token: str) -> dict[str, Any] | None:
    try:
        key = _JWKS.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["ES256"], audience="authenticated")
        return {"id": claims.get("sub"), "email": claims.get("email"), "claims": claims}
    except Exception:
        return _auth_user_from_jwt_remote(token)  # fallback: token legacy HS256 / JWKS lỗi -> API cũ
```
**Env:** chỉ `SUPABASE_URL` (đã có). **KHÔNG cần copy key/secret** — JWKS là public. Nếu `supabase-py` 2.30 có `auth.get_claims()` (verify JWKS sẵn) thì dùng thẳng, khỏi tự PyJWKClient.
**Token legacy HS256** (tab "Legacy JWT Secret"): token sống ~1h nên gần như đã hết → fallback `_auth_user_from_jwt_remote` (giữ đúng logic API cũ hiện tại) lo nốt ca hiếm.

**Guardrail:** verify chữ ký ES256 + exp + audience; test token hợp lệ / hết hạn / sai chữ ký / token HS256 cũ (rơi vào fallback). KHÔNG nới lỏng bảo mật. `PyJWKClient` phải cache (không fetch JWKS mỗi request).
**Verify:** sau deploy, TTFB `notifications`/`summary` phải rớt từ ~900ms → ~150-250ms.

---

## G2 — CONCURRENCY: cho phép chạy song song [BE/infra]

**File:** `backend/Dockerfile` CMD.
1 worker → request serialize. Sau G1 (mỗi request nhẹ hơn nhiều) + G4 (ít request hơn) thì bớt nghẽn, nhưng cân nhắc:
- **Nếu handler là `def` (sync):** FastAPI chạy trong threadpool → đã có ~40 luồng đồng thời; nghẽn có thể do CPU/GIL + Supabase client blocking. Kiểm: `grep -c "async def" vs "def " ` trong routes.
- **Tăng worker:** `uvicorn main:app --workers 2` (Render Starter 512MB — đo RAM, mỗi worker ~150-250MB). **BẪY:** cache RBAC in-process (rbac.py `_TTL_CACHE`) KHÔNG chia sẻ giữa worker → roster stale tới TTL 120s (đã note ở Dockerfile). Chấp nhận được, hoặc chuyển cache sang Redis nếu >1 worker (overkill giờ).
- **Ưu tiên thấp hơn G1/G3/G4** — làm sau khi đo lại; có thể không cần nếu G1+G4 đủ.

---

## G3 — LÀM GỌN 2 ENDPOINT NẶNG [BE]

### G3a. `active-requests?pr_ids` 2.3s → ~300ms
**File:** `backend/activation_routes.py` (list endpoint, nhánh `pr_id_list is not None` ~2320-2333 + phần serialize sau đó). **Điều tra (đọc ~100 dòng serialize):** nghi N+1 hoặc enrich per-AR nặng (course_budget, referral, sale name, uids_data lớn). Hướng: select đúng cột cần (không `*` nếu uids_data khổng lồ), gom name_map/staff_map (đã cache) 1 lần, tránh query trong vòng lặp.
> **Ý tưởng triệt để:** cho `pr_list_page` trả kèm `ar_id`/`ar_activated` (đã có) + FE B1 grid CHỈ cần cột "TT gói học" → có thể **bỏ hẳn call active-requests?pr_ids ở B1** nếu summary/page cấp đủ trạng thái AR. Kiểm FE dùng `pageActiveRequests` cho gì ở B1 (ngoài B3/B4). Nếu chỉ cần badge/label → tính trong RPC page.

### G3b. `payment-requests(page)` 1.7s → ~400ms
**File:** `payment_request_routes.py` `_list_payment_requests_page` (~2040-2140). Sau RPC (102ms) còn fetch payment_lines + pr_completion_reports + active_requests + name_map + staff_map. Hướng: RPC `pr_list_page` đã trả `to_jsonb(filtered)` gồm PR core — cân nhắc **RPC trả kèm payments (lines) + referral_status** để bỏ vòng fetch lines/reports/AR riêng. name_map/staff_map đã cache (M2-T1) — xác nhận cache hit thật.

---

## G4 — GIẢM SỐ REQUEST [FE]

**File:** `PaymentRequestsTab.tsx` + `PaymentFlowContext.tsx`.
1. **Fix double-fetch (F5):** đổi filter ở page>1 push `listQuery` 2 lần (page cũ→1). Gộp reset page vào cùng handler set filter (1 lần push). HAR: page 12× cho 1 phiên là quá nhiều.
2. **Xác nhận badge chỉ mount+realtime:** HAR thấy badge 6× — kiểm có còn bắn theo filter không (đáng lẽ chỉ mount + silentRefetch). Nếu poll/realtime bắn badge quá dày → throttle refreshBadge (vd tối đa 1 lần/30s).
3. **Gộp AR vào page** (nếu làm G3a triệt để) → bớt hẳn 1 request/lần load.

---

## G5 — DRAWER LAG ~0 [FE — ĐÃ ĐO, chẩn đoán chắc]

**Đo từ Performance trace prod (Trace-20260924T104146.json):** INP mở drawer = **772ms**. Chuỗi critical path lúc bấm (t≈11.3s):
1. **click handler ~58ms** (EventDispatch click 58.8ms) — xử lý đồng bộ lúc click (setState pinPr + open).
2. **React render ~151ms** (FunctionCall 151ms) — render toàn bộ nội dung drawer.
3. **Forced reflow Layout ~113ms** (1 Layout đơn lẻ 113ms ngay sau render) — chèn DOM to → layout đồng bộ.
+ paint + input/presentation delay → 772ms. (Chrome Insights tự flag "Forced reflow" + "Optimize DOM size" — khớp.)

**Gốc rễ:** `PaymentRequestDetailDrawer` render **toàn bộ nội dung eagerly** (mọi payment line + mini-card AR + form + ảnh bill) + chèn 1 khối DOM lớn → React render 151ms + reflow 113ms. KHÔNG phải network (drawer dùng `selected`/`findPr` đã có sẵn).

**Fixes (làm theo tác động):**
1. **Cắt render React 151ms:** `React.memo` các subtree drawer (payment list, AR mini-card, form) để mở không re-render lại từ đầu; **lazy-render** phần dưới màn (payment history, bill preview) — chỉ render khi cuộn tới / bấm mở section. Nếu drawer là 1 component khổng lồ → tách + memo.
2. **Cắt reflow 113ms:** giảm DOM chèn 1 lúc — **ảnh bill `loading="lazy"`** + kích thước cố định (tránh reflow khi ảnh load); nếu list payment/AR dài → virtualize hoặc render dần. **Rà đọc layout đồng bộ** (offsetHeight/getBoundingClientRect/scrollIntoView) trong lúc mở → gây forced reflow; hoãn qua `requestAnimationFrame`.
3. **click 58ms:** mở drawer qua CSS transform (GPU, không đụng layout); tách công việc nặng khỏi handler click (defer sau paint).
**Verify:** record lại Performance → INP < 200ms; Layout đơn lẻ < 20ms; FunctionCall lúc mở < 50ms.
**Lưu ý:** prod build minified nên CPU profile không tên component rõ — dùng React Profiler ở **local dev** (`npm run dev`) nếu cần chỉ đích danh subtree nặng.

---

## G-DIAG — Bật self-serve đo lường [BE, làm TRƯỚC để đo G1-G4]

Thêm middleware trả **`Server-Timing`/`X-Process-Time` header** cho mỗi response (thời gian handler + sub-mốc auth/db). → Network/HAR hiện luôn thời gian SERVER per-request → lần sau chỉ cần Export HAR là biết chính xác server tốn bao nhiêu ở đâu, khỏi đoán.
```python
# main.py middleware
@app.middleware("http")
async def timing(request, call_next):
    t = time.perf_counter()
    resp = await call_next(request)
    resp.headers["Server-Timing"] = f"app;dur={ (time.perf_counter()-t)*1000:.0f }"
    return resp
```

---

## Thứ tự & mục tiêu
1. **G-DIAG** (đo) → **G1 auth local** (đòn lớn nhất, toàn app) → **G4 giảm request** → **G3 lean endpoint** → đo lại → **G2 worker** nếu còn nghẽn → **G5 drawer**.
2. Kỳ vọng sau G1+G4: sàn per-request ~200ms, load ~1-1.5s, filter ~0.7s. G3 đưa về <1s. G5 lo drawer.

## Đánh giá 5 tiêu chí
1. **Triệt để** ✅ đánh đúng gốc (auth per-request + queue + enrich), không vá triệu chứng.
2. **Không lỗi con** ✅ G1 giữ verify exp+signature; mỗi milestone có verify + guardrail.
3. **Không tăng hạ tầng** ✅ G1 GIẢM tải (bỏ 1 API call/request); G2 chỉ +1 worker nếu cần.
4. **Tối ưu token** ✅ diagnosis đã đo sẵn, task cô đọng.
5. **Bền qua compact** ✅ path:line + số đo + code mẫu + env cần.

## Phân bổ
| Task | File | ~ | Người |
|---|---|---|---|
| G-DIAG | main.py | 0.5h | Đạt |
| G1 auth local | rbac.py + env | 2h | Đạt (BE) |
| G4 giảm request | Tab + Context | 1.5h | Đức (FE) |
| G3a active-requests | activation_routes.py | 2h | Đạt |
| G3b page | payment_request_routes.py | 2h | Đạt |
| G2 worker | Dockerfile | 0.5h + đo | Đạt |
| G5 drawer | drawer component | 2h | Đức (FE) |

---

## Cần gì để diagnose tiếp / SETUP cho Claude tự mày mò
- **Endpoint latency:** ✅ đã đủ — **Export HAR** (nút ⬇ trong Network) → gửi Claude path file `.har`; Claude parse bằng PowerShell (`ConvertFrom-Json`, không đọc cả file vào context). Sau G-DIAG thì HAR có luôn Server-Timing = biết server tốn ở đâu.
- **DB/RPC timing:** ✅ Claude tự đo qua Supabase MCP (`explain analyze`), không cần user.
- **Drawer/FE render:** cần **React DevTools Profiler** — cài extension "React Developer Tools" (Chrome) → tab **Profiler** → bấm ⏺ record → mở drawer 1 PR → ⏹ stop → **Export** (nút save) ra file `.json` → gửi Claude path. Hoặc Chrome **Performance** tab → record mở drawer → Save profile → gửi path.
- **Muốn Claude tự gọi API prod để đo** (không qua ảnh): cần 1 JWT hợp lệ — NHƯNG token là credential, Claude không nên cầm. Thay vào đó dùng HAR (đã có token trong request, Claude chỉ đọc timing). Đủ dùng.
