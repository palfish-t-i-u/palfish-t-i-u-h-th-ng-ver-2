# PLAN — Fix tốc độ server-pagination (badge-counts) trước khi bật flag lần 2

**Ngày:** 24/9/2026 · **Bàn giao:** Đức & Đạt · **Branch áp fix:** tạo nhánh mới từ `main` (đã merge server-pagination) — vd `fix/pr-badge-perf`
**Bối cảnh:** Đêm 23→24/9 đã deploy server mode lên prod (Đường B): merge main + migration prod + deploy BE + bật env `VITE_PR_LIST_MODE=server`. **Correctness đúng 100%** (số khớp tuyệt đối, 34 trang server-side). **Đã REVERT về `load-all`** vì latency: `/badge-counts` **6.9–13.2s** + refetch mỗi lần đổi filter → regression. Migration + BE mới **vẫn nằm trên prod** (additive, idle ở load-all). Fix xong chỉ cần set lại env `server`.

---

## 0. Chẩn đoán (đã đo thật, Network/HAR prod 1697 PR)

| Request | Latency | Vấn đề |
|---|---|---|
| `pr_list_page` (RPC DB) | **102ms** | DB KHÔNG phải thủ phạm |
| `pr_list_summary` (RPC DB) | **70ms** | DB KHÔNG phải thủ phạm |
| `/payment-requests?view=page` | ~1.3s | chấp nhận (network + serialize) |
| `/payment-requests/summary` | ~0.6s | ok |
| **`/payment-requests/badge-counts`** | **6.9–13.2s** 🔴 | **GỐC RỄ** |
| `/active-requests?pr_ids` | ~2.5s | chậm bất thường cho 50 PR |

**Gốc rễ `/badge-counts`:** `_compute_badge_counts` (`backend/payment_request_routes.py` ~1961) load hết `pr_ids` (1697) rồi `_chunked(pr_ids, 100)` → **~36 round-trip Supabase TUẦN TỰ** (2 batch PR + 17 chunk `payment_lines` + 17 chunk `active_requests`). Fix F1 (`.range()`) làm nó xử lý cả 1697 thay vì cắt 1000 → nặng thêm. **Và badge-counts filter-INDEPENDENT** (đếm badge sidebar trên TOÀN BỘ PR) nhưng FE gọi lại nó **mỗi lần đổi filter** → filter nào cũng 6–30s.

---

## G1 — RPC `pr_badge_counts`: gộp 36 round-trip → 1 SQL (~100ms) [BE, migration]

**File mới:** `backend/migrations/2026-09-24-pr-badge-counts-rpc.sql`
Mirror đúng logic Python: `reconciliation` = count `payment_lines` status='pending' trên PR non-cancelled (scope emails); `activation` = count AR `pending_order` (mirror `_ar_status_is_pending_order`); `invoice` = count COURSE có `invoice_requested_at` mà chưa `invoiced` (mirror `_course_invoice_requested_at` + `_course_is_invoiced`; `_course_order_id` = `order_id` ?? `orderId`).

```sql
-- pr_badge_counts(p_emails): 3 badge sidebar trong 1 SQL. p_emails null = admin/ops (mọi PR).
-- Mirror _compute_badge_counts (payment_request_routes.py) + _ar_status_is_pending_order
-- + _course_order_id/_course_is_invoiced/_course_invoice_requested_at (activation_routes.py).
create or replace function pr_badge_counts(p_emails text[])
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with scoped_pr as (
    select id
    from payment_requests
    where state <> 'cancelled'
      and (p_emails is null or lower(coalesce(sale_email, '')) = any(p_emails))
  ),
  recon as (
    select count(*) as n
    from payment_lines l
    where l.status = 'pending'
      and l.payment_request_id in (select id from scoped_pr)
  ),
  ar as (
    select a.id, a.uids_data
    from active_requests a
    where a.pr_id in (select id from scoped_pr)
  ),
  course_flat as (
    -- cross join: AR không có course sẽ KHÔNG sinh dòng ở đây (n_courses=0 tính ở ar_agg qua left join)
    select ar.id as ar_id, c.course
    from ar
    cross join lateral jsonb_array_elements(coalesce(ar.uids_data, '[]'::jsonb)) u
    cross join lateral jsonb_array_elements(coalesce(u -> 'courses', '[]'::jsonb)) c(course)
  ),
  course_pred as (
    select
      ar_id,
      (nullif(trim(coalesce(course ->> 'order_id', course ->> 'orderId', '')), '') is not null) as has_order,
      (case jsonb_typeof(course -> 'invoiced')
         when 'boolean' then (course ->> 'invoiced')::boolean
         when 'number'  then (course ->> 'invoiced')::numeric <> 0
         when 'string'  then lower(trim(course ->> 'invoiced')) in ('1', 'true', 'yes', 'y')
         else false end) as is_invoiced,
      (trim(coalesce(course ->> 'invoice_requested_at', '')) <> '') as inv_requested
    from course_flat
  ),
  ar_agg as (
    select
      ar.id as ar_id,
      count(cp.ar_id) as n_courses,
      coalesce(bool_and(cp.is_invoiced), false) as all_invoiced,
      coalesce(bool_and(cp.has_order), false) as all_ordered
    from ar
    left join course_pred cp on cp.ar_id = ar.id
    group by ar.id
  ),
  activation as (
    -- pending_order = không có course HOẶC (chưa all invoiced VÀ chưa all ordered)
    select count(*) as n
    from ar_agg
    where n_courses = 0 or (not all_invoiced and not all_ordered)
  ),
  invoice as (
    select count(*) as n
    from course_pred
    where inv_requested and not is_invoiced
  )
  select jsonb_build_object(
    'reconciliation', (select n from recon),
    'activation',     (select n from activation),
    'invoice',        (select n from invoice)
  )
$$;

revoke execute on function pr_badge_counts(text[]) from public, anon, authenticated;
grant execute on function pr_badge_counts(text[]) to service_role;
notify pgrst, 'reload schema';

-- ROLLBACK: drop function if exists pr_badge_counts(text[]); notify pgrst, 'reload schema';
```

**Verify SQL (chạy tay trên prod SAU khi apply, đối chiếu số cũ):** `select pr_badge_counts(null);` → `reconciliation` phải = **89** (đã đo đêm 24/9: `count payment_lines pending join PR non-cancelled` = 89). `activation`/`invoice` so với badge cũ khi ở load-all.

---

## G2 — BE endpoint gọi RPC thay 36 round-trip [BE]

**File:** `backend/payment_request_routes.py`, hàm `_compute_badge_counts` (~1961–2010).
Thay TOÀN BỘ thân hàm (phần load pr_ids + 2 vòng `_chunked` reconciliation/activation/invoice) bằng 1 lời gọi RPC:

```python
def _compute_badge_counts(sb, allowed_emails: list[str] | None) -> dict[str, int]:
    """3 badge B2/B3/B4 — 1 RPC pr_badge_counts (thay ~36 round-trip chunk cũ, xem
    migration 2026-09-24). Latency 6-13s -> ~100ms."""
    try:
        res = sb.rpc("pr_badge_counts", {"p_emails": allowed_emails}).execute()
        data = res.data if isinstance(res.data, dict) else (res.data or {})
    except Exception as exc:
        raise HTTPException(500, f"Khong doc duoc badge-counts: {exc}") from exc
    return {
        "reconciliation": int(data.get("reconciliation") or 0),
        "activation": int(data.get("activation") or 0),
        "invoice": int(data.get("invoice") or 0),
    }
```
> Giữ nguyên chữ ký + route `/payment-requests/badge-counts`. Xoá các helper giờ không dùng NẾU không nơi nào khác gọi (grep `_ar_status_is_pending_order` — nếu chỉ badge dùng thì xoá; nếu nơi khác dùng thì để). `_course_*` giữ nguyên (badge RPC + activation_routes vẫn dùng).
**Guardrail:** `sb.rpc(...)` dùng service client (đã có GRANT service_role). Test: sửa `backend/tests/test_badge_counts.py` — mock `sb.rpc` trả dict thay vì mock chuỗi table; giữ case >1000 (giờ RPC lo, test chỉ cần assert BE map đúng dict → int).

---

## G3 — FE: badge KHÔNG theo filter + song song + không chặn render [FE, PaymentFlowContext.tsx — VÙNG NHẠY, làm cẩn thận]

**File:** `frontend/src/contexts/PaymentFlowContext.tsx`, nhánh `if (PR_LIST_MODE === "server")` trong `loadData` (~255–320).

1. **Bỏ badge-counts khỏi `loadData`.** Xoá đoạn `let nextBadge...; try { nextBadge = await badgeCounts() } catch {}` và `if (nextBadge) setBadgeCountsServer(nextBadge)`.
2. **Tách `refreshBadge` riêng, không phụ thuộc `listQuery`:**
```ts
const refreshBadge = useCallback(() => {
  if (PR_LIST_MODE !== "server") return;
  void endpoints.paymentRequests.badgeCounts()
    .then((r) => setBadgeCountsServer(r.data))
    .catch(() => { /* badge lỗi không chặn tab */ });
}, []);
```
   - Gọi `refreshBadge()` **1 lần lúc mount** (trong effect mount server mode, cạnh chỗ gọi `loadData` đầu — KHÔNG trong effect `[listQuery]`).
   - Gọi `refreshBadge()` trong callback **realtime** (`useRealtimeTable` cho payment_requests/lines/active_requests) để badge tươi khi data thật đổi — KHÔNG theo đổi filter.
3. **Song song hoá + không chặn bảng:** trong `loadData` server, đổi 3 await tuần tự (page → summary → AR) thành:
```ts
const [pageRes, sumRes] = await Promise.allSettled([
  endpoints.paymentRequests.listPage({ ...listQuery, page_size: PR_SERVER_PAGE_SIZE }),
  endpoints.paymentRequests.summary(listQuery),
]);
// set pageRows + summary + setLoading(false) NGAY (bảng render) — seq-guard giữ nguyên
// AR của trang tải SAU, không chặn: void loadPageArs(pageRows ids).then(setPageActiveRequests)
```
   Giữ nguyên seq-guard (`loadDataSeqRef`) + logic `pinnedRows` kept + `fetchFullData` khi có consumer.
4. **Bỏ double/triple-fetch:** effect đổi filter (PaymentRequestsTab.tsx ~106 + ~230) — gộp reset `page` vào cùng chỗ set filter để chỉ push `listQuery` 1 lần (đã note ở review F5, giờ làm thật).

**Guardrail:** nhánh `load-all` (default) KHÔNG đổi. `refreshBadge` chỉ chạy server mode. Không phá seq-guard / optimistic 3-nơi / pin drawer (G1-T2 trước đó).
**Test:** `PaymentFlowContext.serverMode.test.tsx` — thêm case: đổi `listQuery` KHÔNG gọi badge-counts (spy endpoint); `refreshBadge` gọi độc lập; `Promise.allSettled` 1 nhánh fail vẫn render nhánh kia.

---

## G4 — Soi `/active-requests?pr_ids` 2.5s [điều tra, BE]

Đọc HAR `C:\Users\Anh Minh\Downloads\gmv.palfish.vn.har` (request `active-requests?pr_ids=...`) + endpoint list AR trong `activation_routes.py` (~2280–2420, nhánh `pr_id_list is not None`). Giả thuyết: enrich nặng per-AR (sale name / uids_data / N+1). Với 50 PR (≤50 AR) không nên 2.5s. **Task:** tìm chỗ chậm (thường: gọi `_sale_name_map`/`_staff_map` chưa cache, hoặc select `*` kéo uids_data lớn, hoặc loop enrich). Fix nếu rẻ; nếu không, để riêng — sau G1–G3 tổng còn ~2 request/lần load nên chấp nhận được tạm.

---

## Verify trước khi bật flag lần 2 (làm BAN NGÀY)
1. `cd frontend && npx tsc -b` = 0; `npx vitest run PaymentFlowContext.serverMode` pass.
2. `cd backend && py -m pytest tests/test_badge_counts.py -q` pass.
3. Apply migration G1 lên **sandbox** trước → `select pr_badge_counts(null)` khớp; rồi prod.
4. Deploy BE + set env `server` + redeploy FE → **mở Network tab prod**: `badge-counts` < 200ms, đổi filter KHÔNG bắn badge-counts, load tổng ~1s. Đối chiếu số badge với load-all.
5. Hỏng → revert env `load-all` (tức thì).

## Đánh giá 5 tiêu chí
1. **Triệt để** ✅ diệt gốc (36 round-trip → 1 SQL) + gốc refetch-per-filter.
2. **Không lỗi con** ✅ RPC mirror đúng JSON logic; seq-guard/pin/optimistic giữ nguyên; có test.
3. **Không tăng hạ tầng** ✅ 1 RPC additive, 0 bảng mới, giảm tải BE (36→1 call).
4. **Tối ưu token** ✅ fix cục bộ, không refactor rộng.
5. **Bền qua compact** ✅ self-contained: RPC SQL nguyên văn + path:line + code BE/FE + test + verify.

## Phân bổ
| Task | File | ~ | Người |
|---|---|---|---|
| G1 RPC | migration mới | 1h | Đạt (BE) |
| G2 BE endpoint | payment_request_routes.py | 0.5h | Đạt |
| G3 FE loadData | PaymentFlowContext.tsx + Tab | 2.5h | Đức (vùng nhạy) |
| G4 điều tra AR | activation_routes.py + HAR | 1h | ai rảnh |

Thứ tự: G1→G2 (BE, xong test) ‖ G3 (FE) song song → G4 → verify → bật flag ban ngày.
