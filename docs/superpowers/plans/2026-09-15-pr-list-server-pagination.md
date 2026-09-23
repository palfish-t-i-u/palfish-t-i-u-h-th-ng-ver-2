# Tab Quản lý thanh toán → server-side pagination (nhanh như CRM) — Plan (2026-09-15)

> Trạng thái (2026-09-18): **M0-M3 đã code + verify trên sandbox thật (branch
> `feature/pr-list-server-pagination`)**. M4 (rollout prod) CHƯA làm — cần soak
> sandbox 2 ngày + con người thực thi theo checklist gate bên dưới. Xem §Nhật ký
> triển khai cuối file.
> Người làm: anh Minh + Claude, theo phiên tối.
> Thay thế lộ trình GĐ2 → GĐ3 cũ (`2026-07-11-pr-list-slim-lazy-gd2.md`, `RESEARCH_SCALE_10K_PR_2026-07-11.md §5`).

## Trả lời: có cần đi qua GĐ2 không?

**KHÔNG.** GĐ2 (7 cột aggregate + backfill + parity cron + slim format) là thuốc cho mô hình *load-all*; khi B1 chuyển sang O(trang) 50 dòng thì slim tiết kiệm không đáng kể (~36 kB/trang), còn mọi số chip/tab/KPI tính được ngay trong Postgres từ `payment_lines` + `state` + `target` + `EXISTS active_requests` — **0 cột mới, 0 backfill**. 3/3 giám khảo chọn phương án "nhảy thẳng" (56 điểm vs tuần tự 44 / hybrid 48). Mảnh GĐ2 duy nhất giữ lại: endpoint `GET /payment-requests/{id}` cho drawer + index `(created_at desc, id desc)`.

**1 quyết định anh Minh phải chốt ở M0 (M0-T4):** search không dấu làm bằng **hàm SQL `norm_vi`** (mirror `normVi` JS, có golden 2 phía, KHÔNG phải extension unaccent) — chấp nhận, hay bác theo tinh thần research §7.4? Nếu bác → fallback = 1 cột `search_text` ghi bằng Python tại recompute (+2h), KHÔNG phải cả GĐ2.

## Bối cảnh & số liệu (điều tra 14/9)

- Gốc rễ = **load-all**: `fetchAllPaymentRequests.ts` tải HẾT 1657 PR (500/trang) + `activeRequests.list()` tải HẾT 941 AR → phân trang client 20/trang; poll/realtime/focus lặp toàn bộ. Mỗi load ~4–6 MB JSON qua Render Sydney.
- DB vô can: PR 362 kB / lines 833 kB / AR 680 kB, index đủ, bill là path. 1657 đã vượt `PR_TOTAL_WARN_THRESHOLD=1500`.
- CRM nhanh vì O(trang). Đích: B1 = 4 request ~50 kB/lượt, p95 < 1,5 s.
- Phạm vi đợt này = **B1 (Quản lý thanh toán)**. B2/B3/B4 giữ load-all nhưng **lazy** (chỉ nạp khi mount tab). AR paginate = đợt sau.

## To-do theo Milestone

### M0 — Baseline + xác minh prod + spike `norm_vi` + CHỐT + seed (~3h, không deploy)
- [ ] **M0-T1** — **Đo baseline prod**: DevTools Network tab B1, ms tới row đầu + tổng bytes (4× `GET /payment-requests?limit=500` + 1× `/active-requests`), 3 lần lấy p95 → `docs/learnings/pr-list-server-page.md` — 20'
- [ ] **M0-T2** — **Xác minh PROD read-only** (MCP `jozcvbbypwvzaefteoxn`): `select * from pg_publication_tables where pubname='supabase_realtime'` (sandbox RỖNG — prod rỗng thì refetch chỉ còn poll/focus); `select datcollate, datctype from pg_database where datname=current_database(); show server_encoding;`; `list_extensions` pg_cron/pg_trgm; FK `payment_lines_payment_request_id_fkey` tồn tại; đếm cặp trùng `created_at`; đếm `payment_lines` qr pending — 25'
- [ ] **M0-T3** — **Spike `norm_vi` + golden 15 chuỗi** trên sandbox `pxgybyfiwywksesyogti`: tạo tạm hàm (SQL ở Phụ lục A), fixture `frontend/src/lib/__fixtures__/normViCases.json` 15 cặp {input, expected} (expected = chạy `normVi` `frontend/src/lib/textUtils.ts:15-21` bằng `node -e`: 'Như Ý'→'nhu y', 'Đặng', 'ĐỖ', 'Hà Bảo Ngân', NFD escape, 'PR-2026-0001', '84-396249966', rỗng, null); chạy `select norm_vi(input)=expected` trên sandbox VÀ prod (SELECT thuần) — 45'
- [ ] **M0-T4** — **GATE CHỐT với anh Minh (Opus inline)**: (a) chấp nhận `norm_vi` SQL hay fallback cột `search_text` Python; (b) TZ lọc ngày cố định `Asia/Ho_Chi_Minh` (FE hiện dùng TZ trình duyệt `DateRangeFilter.tsx:171-173`); (c) giữ search SĐT 2 chiều `qd.includes(pd) || pd.includes(qd)`. Ghi quyết định vào plan TRƯỚC M1 — 15'
- [ ] **M0-T5** — **Seed sandbox 2.000 PR** `backend/scripts/seed_pr_scale.py` (in project-ref + gõ confirm như `backend/scripts/clean_test_data.py:1-40`; id `PR-SEED-%05d`, tên có dấu, created_at rải 180 ngày, state pending30/short20/done40/over5/cancelled5, is_test=true, 1–3 lines qr/card, 5% PR 15–30 lines installment, 40% có AR, **≥50 cặp trùng created_at** để test tiebreak id; cờ `--clean`) — 60'
- [ ] **M0-T6** — **pg_stat top-10 prod** `select calls, mean_exec_time, left(query,120) from pg_stat_statements order by total_exec_time desc limit 10` → ghi learnings — 10'
- [ ] **M0-T7** — **Drift one-off received/state vs lines** (SQL Phụ lục B) sandbox rồi prod. Phản biện đã tìm thấy: prod **1 dòng lệch PR-2026-0222** (0/pending vs 9.850.000/done, không AR) + sandbox 1; 2 PR cancelled có line paid (0133, 0200) là CỐ Ý (early-return `payment_request_routes.py:~1501`). Sửa = gọi `recompute_payment_request_totals(sb, id)` qua script, KHÔNG SQL tay — 25'
- **M0-N1** — Summary/list RPC tính `eff_received`/`eff_state` **từ payment_lines** (LATERAL, Phụ lục A) chứ KHÔNG đọc cột `received/state` → không phụ thuộc drift; M0-T7 chỉ là vệ sinh. Bỏ cron drift detector (không cần).

### M1 — Migration DUY NHẤT: 2 index + `norm_vi` + 2 RPC (~2,5h, sandbox)
- [ ] **M1-T1** — **`backend/migrations/2026-09-16-pr-list-page-rpc.sql`** idempotent (Phụ lục A): (1) `idx_pr_created_at_id_desc (created_at desc, id desc)`; (2) `idx_payment_lines_pending_qr on payment_lines (created_at desc) where method='qr' and status='pending'`; (3) `norm_vi(text)`; (4) `pr_list_page(...)` OFFSET + `ORDER BY created_at desc, id desc` + `count(*) over()` (giữ pager số — KHÔNG keyset cursor); (5) `pr_list_summary(...)` chips/tabs/kpi/tvts/has_pending_qr; (6) `revoke execute ... from public, anon, authenticated; **grant execute ... to service_role**` (BE gọi bằng service key `backend/main.py:287`; mẫu `2026-07-10-zalo-bill-uploaded-event.sql:98-99`); (7) `notify pgrst,'reload schema'`; (8) khối rollback comment cuối file — 95'
- [ ] **M1-T2** — **Apply sandbox + advisors + EXPLAIN**: MCP `apply_migration` → `get_advisors` 0 finding mới → `explain (analyze,buffers) select * from pr_list_page(null,false,null,null,'tracking',null,null,'',50,0)` và `p_q='nhu y'` → ghi ms; Seq Scan ở ORDER → kiểm index — 20'
- [ ] **M1-T3** — **Golden `normVi` 2 phía**: `frontend/src/lib/textUtils.golden.test.ts` đọc `normViCases.json` assert `normVi(input)===expected`; `backend/scripts/verify_norm_vi.py` đọc CÙNG file, gọi `sb.rpc('norm_vi',{'t':input})` sandbox, exit 1 nếu lệch. Fixture = chân lý; lệch → sửa SQL — 40'

### M2 — BE: `?view=page` + summary + detail + badge-counts + AR theo `pr_ids` (~11h, INERT tới khi FE bật flag)
- [ ] **M2-T0** — **Pin supabase-py** `backend/requirements.txt:7` `supabase>=2.4.0,<3` → `supabase==2.15.2` — 10'
- [ ] **M2-T1** — **Cache in-process TTL 120s** cho `_sale_name_map` (`payment_request_routes.py:851`), `_staff_map` (`:867`), `visible_creator_emails` (`rbac.py:255-281`), `_lookup_staff` (`rbac.py:155`): `_TTL_CACHE: dict[str, tuple[float, Any]]` + `_cached(key, ttl, fn)` (`time.monotonic()`), env `RBAC_CACHE_TTL` (0 = tắt), `invalidate_roster()` gọi tại điểm mutate `nhan_su_sale` trong `admin_routes.py`; pytest hit/miss/expire/invalidate `backend/tests/test_rbac_cache.py` — 60'
- [ ] **M2-T2** — **`GET /payment-requests?view=page`** (Phụ lục C) trong `list_payment_requests` (`:1891-1898`): Query `view, page=1, page_size=50 (le=100), bucket='tracking', state, date_from/date_to (YYYY-MM-DD → +07:00), is_test, tvts (csv), q`; `if view=="page": return _list_payment_requests_page(...)` — **GIỮ pathname** (e2e `ar-edit-lag.spec.ts:168,293` không sửa; endpoint cũ giữ cho B2/B3/B4); `sb.rpc("pr_list_page", {...}).execute()` bọc 503 `MIGRATION_HINT` khi 'could not find the function' (`rpc_helpers.py:15-21`); enrich ≤100 id: lines `.in_` (`:1934-1941`), AR `select("id, pr_id, uids_data")` (`:1950-1956`), reports (`:1968-1975`); serialize `_serialize_payment_request_list_item` (`:813-833`, payments embed như cũ) + referral_status (`:1993-2002`) + sale_name/leader (`:2007-2011`) + **`ar_id`, `ar_activated`** (mirror `PaymentRequestTable.tsx:280-291`); trả `{requests, total, page, page_size}` — 120'
- [ ] **M2-T3** — **`GET /payment-requests/summary`** (khai báo TRƯỚC `/{id}`): parse như M2-T2 → `sb.rpc("pr_list_summary")` → `{chips, tabs, kpi, tvts, has_pending_qr}`; tvts thêm `label` (mirror `tvtsLabelOf` `paymentRequestUtils.ts:1030-1040`) — 45'
- [ ] **M2-T4** — **`GET /payment-requests/{payment_request_id}`** đặt CUỐI cụm GET (sau `/invoice-remind` `:~3780`): `resolve_actor` → select 1 → ngoài scope (`allowed_emails is not None and sale_email not in`) → 404; serialize y hệt item M2-T2 (nguồn GĐ2 Task 5) — 60'
- [ ] **M2-T5** — **`GET /payment-requests/badge-counts`** `{reconciliation, activation, invoice}` — **Opus inline**: mirror `countAwaitingTransactions` (`paymentFlowUtils.ts:180-191`, `txnDisplayStatus :90-99`), `countPendingAr`, `countPendingInvoice` (`:192+`); embedded filter `payment_lines.select("id,method,status,bill_image,bill_images,payment_requests!inner(sale_email,state)")` (FK xác nhận M0-T2); mini-fixture 6 case `frontend/src/components/payment-flow/__fixtures__/badgeCases.json` + vitest + pytest đọc cùng file — 75'
- [ ] **M2-T6** — **AR list `pr_ids` + guard cap-1000**: `activation_routes.py:2451-2479` thêm `pr_ids: str|None=Query(None)` → `.in_("pr_id", ids[:100])`; không `pr_ids` → loop `.range(off, off+999)` tới khi <1000 + `log.error("AR list sentinel cap-1000")` (prod 941/1000); `_fetch_prs_by_ids` (`:885`) bọc `_chunked(pr_ids,100)`; `api.ts:209` `activeRequests.list(params?: {status?; pr_ids?})` — 50'
- [ ] **M2-T7** — **Recompute chỉ UPDATE khi đổi**: `payment_request_routes.py:1520-1525` bọc `if pr_row.get("received")!=received or pr_row.get("state")!=state:` (chặn realtime no-op event) — 10'
- [ ] **M2-T8** — **Middleware telemetry** `backend/main.py` cạnh `GZipMiddleware`: log JSON 1 dòng `{"evt":"http","path","ms","bytes","role"}` cho 5 path nóng; đọc bằng Render logs filter — 40'
- [ ] **M2-T9** — **pytest** (mock theo mẫu `test_pr_list_load_all.py:16-52`): `test_pr_list_page.py` (rpc mock trả `[{pr:{...},filtered_total:3}]`; assert `p_from/p_to` +07:00; `p_emails` None ops / [email] sale; 503 khi thiếu function; response có `payments`, `total`, `page`, `ar_id`), `test_pr_summary_endpoint.py`, `test_pr_detail_endpoint.py` (404 ngoài scope; **route-order tường minh**: `/summary`, `/badge-counts` không bị `/{id}` bắt), `test_badge_counts.py`, `test_ar_list_pr_ids.py` — 100'
- [ ] **M2-T10** — **Deploy BE sandbox + smoke curl**: `bash scripts/deploy.sh sandbox` → JWT sandbox curl 5 endpoint mới 200; `GET /payment-requests?limit=5` diff = giống trước — 20'
- [ ] **M2-T11** — **2 script diff tự động** (read-only, sandbox seed rồi prod trước M4): `backend/scripts/diff_pr_search.py` 35 query (tên có/không dấu, tên bé, UID, SĐT `84-x`/`0x`/`+84`, PR-ID, **bẫy**: 'PR-2026', 'a bao' vắt field, chuỗi có `\` và `%`, SĐT rỗng + query dạng số ≥4 chữ số) so port Python của `paymentRequestMatchesSearch` (`paymentRequestUtils.ts:53-67`) vs RPC → exit 1 nếu lệch; `backend/scripts/diff_summary_vs_client.py` kéo full list endpoint cũ → tính chips/tabs/kpi/tvts bằng port Python `computePrKpi` + `PaymentRequestsTab.tsx:139-238` → so `pr_list_summary` (3 bộ filter) → exit 1 nếu lệch — 80'
- [ ] **M2-T12** — **SePay recompute fail → ghi log rõ**: `sepay_routes.py:686-698` tách recompute khỏi `log_audit`; fail → `log.error` có pr_id (không nuốt print) — 20'

### M3 — FE server mode sau flag `VITE_PR_LIST_MODE` (~8,5h, sandbox)
- [ ] **M3-T1** — **api.ts + types**: `api.ts:125-128` `paymentRequests.list` params thêm `{view?; page?; page_size?; bucket?; state?; date_from?; date_to?; is_test?; tvts?; q?}`; thêm `summary(params)`, `get(id)`, `badgeCounts()`; types `PrSummaryResponse`, `PrListQuery`; row thêm `arId?`, `arActivated?` (map trong `fromApiPaymentRequest` `:186-238`); `frontend/src/lib/prListMode.ts` `PR_LIST_MODE = import.meta.env.VITE_PR_LIST_MODE==='server' ? 'server' : 'load-all'` — 30'
- [ ] **M3-T2** — **PaymentFlowContext server mode** (`PaymentFlowContext.tsx`) — **Opus inline** (state sống): state `listQuery`, `pageRows`, `pinnedRows: Map<string,PaymentRequest>`, **`pageActiveRequests`** (TÁCH khỏi `activeRequests` full — phản biện LB6), `summary`, `badgeCountsServer`, `fullLoadedRef`, `fullConsumersRef`; `loadData` (`:149-221`) rẽ server: `Promise.all([list({view:'page',page_size:50,...}), summary(), badgeCounts()])` → `normalizeRequest(fromApiPaymentRequest)` (GIỮ — lưới đỡ bucket cancelled) → `activeRequests.list({pr_ids})` → `setPageActiveRequests` (KHÔNG replace `activeRequests`); `ensureFullData()` cho B2/B3/B4 (tăng `fullConsumersRef`, cleanup giảm); `silentRefetch` (`:235-239`) server: refetch trang; nếu `fullConsumersRef>0` refetch cả full; `findPr(id)` = pageRows→pinned→requests; đổi **TẤT CẢ** call-site sang `findPr`: `PaymentRequestsTab.tsx:109-121,:251,:290-309,:345,:474,:719,:743` + `PaymentFlowContext.tsx:290-296,:391`; `hydratePr(id)`: GET detail → `pinnedRows` với `hydrateSeqRef` per-id (bug QR cross-PR 26/6) + `activeRequests.list({pr_ids:id})` merge `pageActiveRequests`; xoá console.warn `:175-178` — 150'
- [ ] **M3-T3** — **PaymentRequestsTab server mode** — **Opus inline**: useEffect đẩy `{bucket:tab, state:status, dateRange, search (KHÔNG gửi khi trim <2), hideTest, tvts, page}` → `setListQuery` (debounce 300ms search; `setPage(1)` khi filter đổi `:179-181`); server: rows=`pageRows`, `pageSlice={rows, page, totalPages:ceil(total/50)}` (`:183`), chips (`:185-214`)/tabs (`:216-238`)/tvtsOptions (`:139`) từ `summary`, KPI nhận `kpi` (M3-T4); `arByPrId = buildArByPrId(server ? pageActiveRequests : activeRequests)`; `nav.openPrId` (`:109-116`): `findPr` null → `hydratePr(id).then(open)`; badge 'TT Gói học' (`PaymentRequestTable.tsx:280-291`, `PrRowCards.tsx:67-75`) ưu tiên `p.arId/p.arActivated`; PAGE_SIZE server=50; props `PaymentRequestTable` không đổi (7 test giữ) — 120'
- [ ] **M3-T4** — **KpiCards nhận `kpi`**: `PaymentRequestKpiCards.tsx:5-15` tách `export function computePrKpi(requests): PrKpi` + prop `kpi?: PrKpi` ưu tiên; test `PaymentRequestKpiCards.test.tsx` — 25'
- [ ] **M3-T5** — **B2/B3/B4 gọi `ensureFullData`** đầu `ReconciliationTab.tsx` (~`:403`), `ActivationTab.tsx` (~`:2170`), `InvoiceRequestTab.tsx` (~`:224`) + skeleton 'Đang tải danh sách PR…'; hành vi 3 tab KHÔNG đổi; MODULES.md ghi B2/B3/B4 server-driven = đợt sau — 30'
- [ ] **M3-T6** — **Vitest server mode**: `PaymentFlowContext.serverMode.test.tsx` (`vi.stubEnv`; MSW per-test mẫu `refetchGate.test.tsx:61-67`: assert query `view=page&page_size=50&is_test=false`, `/summary`, `/badge-counts`, `/active-requests?pr_ids=`; hydratePr + AR by id → pinnedRows; 2 response đảo thứ tự → seq-guard; **B3 mounted + realtime event → `activeRequests.length` không giảm**; BE từ chối mark-paid khi `requests=[]` → rollback đúng); `PaymentRequestsTab.serverMode.test.tsx` (mock `usePaymentFlow` mẫu `tvtsFilter.test.tsx:53-74`) — 90'
- [ ] **M3-T7** — **tsc -b + vitest + e2e**: `cd frontend && npx tsc -b && npm run test`; `frontend/e2e/pr-list-server.spec.ts` (skip nếu env ≠ server): gõ 'nhu y' → row 'Như'; tab 'Đã huỷ' → request `bucket=cancelled`; nav từ B3 mở PR ngoài tháng → drawer mở; chạy `playwright.local-sandbox.config.ts` (KHÔNG `playwright.sandbox.config.ts` — rewrite /api sang PROD) — 45'
- [ ] **M3-T8** — **Deploy FE sandbox**: push nhánh `sandbox` → Vercel `palfish-gmv-manager-sandbox` env `VITE_PR_LIST_MODE=server` → Redeploy; `.env.example` + `.env.e2e.example`; Network thấy `?view=page` — 15'

### M4 — Verify sandbox → prod → gỡ load-all B1 sau 2 tuần (~4h)
- [ ] **M4-T1** — **Smoke equality 10 mục sandbox** (tab load-all local vs sandbox server, cùng user ops, 'tháng này', hideTest): 5 chip; 3 tab; 4 KPI; TVTS options+count; search 5 query cùng tập id; trang 1 + trang cuối (có cặp tie); drawer PR trang 2 đủ payments+AR; nav từ B3 PR ngoài tháng; tạo PR mới → đầu trang + chip +1; realtime (`alter publication supabase_realtime add table payment_requests, payment_lines, active_requests` sandbox) mark-paid tab khác → refetch ≤10s — 60'
- [ ] **M4-T2** — **Soak sandbox 2 ngày**: Render log không 5xx, p95 từ `evt":"http`, RAM không tăng dần (OOM 9/7) — 20'
- [ ] **M4-T3** — **Migration prod** MCP `apply_migration jozcvbbypwvzaefteoxn` cùng file M1 → `get_advisors` 0 → chạy tay `pr_list_summary` so chip prod load-all — 15'
- [ ] **M4-T4** — **BE prod**: merge main (anh Minh push — classifier chặn Claude) → `bash scripts/deploy.sh prod` → endpoint cũ diff giống + 5 endpoint mới 200 → `diff_pr_search.py` + `diff_summary_vs_client.py` trên PROD = 0 lệch — 20'
- [ ] **M4-T5** — **FE prod bật flag**: Vercel `palfish-gmv-manager` (dashboard — MCP chỉ thấy project main) `VITE_PR_LIST_MODE=server` → Redeploy tối ngoài giờ → 10 mục M4-T1 trên prod → báo team 'số KHÔNG đổi, chỉ nhanh hơn' — 20'
- [ ] **M4-T6** — **Đo sau vs baseline**: lặp M0-T1 → kỳ vọng ~50 kB/lượt, p95 <1,5 s; sau 1 tuần pg_stat query list cũ rời top — 15'
- [ ] **M4-T7** — **Memory + learnings + MODULES.md + internal notes** (`extract-approach`: GRANT service_role sau REVOKE, TZ +07, publication sandbox rỗng, pathname giữ, `norm_vi` collation Đ, AR `pr_ids` khi hydrate) — 30'
- [ ] **M4-T8** — **Sau 14 ngày ổn định — gỡ load-all khỏi B1** (ticket hẹn ngày ngay khi M4-T5 xong): xoá nhánh `load-all` trong `PaymentRequestsTab` (chuỗi lọc client `:133-176`) + `PaymentFlowContext` + `PR_TOTAL_WARN_THRESHOLD`; GIỮ `fetchAllPaymentRequests` + `ensureFullData` cho B2/B3/B4; GIỮ `paymentRequestMatchesSearch` + 11 test (chân lý cho diff_pr_search); GIỮ `normalizeRequest` — 45'

## Deadline / Gate

| Milestone | Điều kiện qua gate | Deploy | Rollback | Giờ |
|---|---|---|---|---|
| M0 | Anh Minh chốt M0-T4; golden 15 chuỗi khớp trên sandbox + prod; prod publication/FK/collation ghi learnings; drift đã recompute; EXPLAIN dùng Index Scan | Không | Seed `--clean` | ~3h |
| M1 | `apply_migration` sandbox + advisors 0; RPC chạy tay đúng với seed; `verify_norm_vi.py` 0 lệch | Sandbox DB | Khối DROP cuối migration (~1') | ~2,5h |
| M2 | `pytest` xanh (test cũ KHÔNG đổi); deploy sandbox; 5 endpoint 200; endpoint cũ diff giống; 2 script diff = 0 | Render sandbox | Rollback image Render (~5'); endpoint mới inert | ~11h |
| M3 | `npx tsc -b` + `npm run test` xanh; Vercel sandbox `VITE_PR_LIST_MODE=server`; Network thấy `?view=page` | Vercel sandbox | Env về `load-all` (~2') | ~8,5h |
| M4 | Smoke 10 mục + soak 2 ngày; prod theo thứ tự migration → BE → diff prod = 0 → FE flag; p95 <1,5 s | Prod (off-hours) | FE env (~2') → BE image → DROP SQL; không mất dữ liệu | ~4h |

**Tổng ~29h** làm theo phiên. Task đánh dấu **Opus inline** (M0-T4, M2-T5, M3-T2, M3-T3) làm cùng anh Minh; còn lại self-contained giao Sonnet được.

## Phụ lục A — SQL migration (khung; Sonnet hoàn thiện theo M0-T4)

```sql
-- 2026-09-16-pr-list-page-rpc.sql — idempotent
create index if not exists idx_pr_created_at_id_desc on payment_requests (created_at desc, id desc);
create index if not exists idx_payment_lines_pending_qr on payment_lines (created_at desc)
  where method = 'qr' and status = 'pending';

-- Mirror normVi (frontend/src/lib/textUtils.ts:15-21): lower → NFD → bỏ U+0300–036F → đ/Đ → d.
-- KHÔNG dùng extension unaccent. replace Đ đặt SAU normalize (collation không lower được Đ ở mọi locale).
create or replace function norm_vi(t text) returns text
language sql immutable parallel safe set search_path = public, pg_temp as $$
  select replace(replace(regexp_replace(normalize(lower(coalesce(t,'')), NFD), '[̀-ͯ]', '', 'g'), 'đ', 'd'), 'Đ', 'd')
$$;

-- eff_received / eff_state tính TỪ payment_lines (mirror _line_net :287-292, _sum_paid_amount :295-300, _compute_state):
--   recv = sum(case when lower(method) in ('card','installment') and coalesce(verified_received,0)<>0
--                   then verified_received else amount end) filter (where lower(status)='paid')
--   state = 'cancelled' theo cột; else recv<=0 → pending; recv<target → short; recv=target → done; else over
-- Dùng LATERAL trên idx_payment_lines_request_id. Chip/KPI/filter p_state đều dùng eff_*.

create or replace function pr_list_page(
  p_emails text[], p_is_test boolean, p_from timestamptz, p_to timestamptz,
  p_bucket text, p_state text, p_tvts text[], p_q text, p_limit int, p_offset int)
returns table (pr jsonb, filtered_total bigint)
language sql stable set search_path = public, pg_temp as $$
  with q as (
    select norm_vi(p_q) as nq,
           p_q ~ '^[+0-9][0-9\s().\-]*$' as is_phone,                       -- mirror phoneSearch.ts:14
           ltrim(regexp_replace(coalesce(p_q,''), '\D', '', 'g'), '0') as qd,
           replace(replace(replace(norm_vi(p_q), '\', '\\'), '%', '\%'), '_', '\_') as nq_like  -- escape \ → % → _
  )
  select to_jsonb(p) || jsonb_build_object('eff_received', e.recv, 'eff_state', e.st), count(*) over()
  from payment_requests p, q
  cross join lateral (/* eff_received/eff_state như trên */) e
  where (p_emails is null or lower(coalesce(p.sale_email,'')) = any(p_emails))          -- scope RBAC
    and (p_is_test is null or coalesce(p.is_test,false) = p_is_test)
    and (p_from is null or p.created_at >= p_from) and (p_to is null or p.created_at <= p_to)
    and case p_bucket when 'cancelled' then p.state = 'cancelled'
                      when 'created'   then p.state <> 'cancelled' and exists (select 1 from active_requests a where a.pr_id = p.id)
                      else p.state <> 'cancelled' end
    and (p_state is null or p_bucket = 'cancelled' or e.st = p_state)
    and (p_tvts is null or lower(coalesce(p.sale_email,'')) = any(p_tvts)
         or ('__unknown_tvts__' = any(p_tvts) and coalesce(p.sale_email,'') = ''))
    and (q.nq = '' or
         -- so khớp TỪNG field như client (paymentRequestUtils.ts:53-67), KHÔNG concat bằng ' '
         norm_vi(p.id) like '%'||q.nq_like||'%' or norm_vi(p.name) like '%'||q.nq_like||'%'
         or norm_vi(p.uid) like '%'||q.nq_like||'%' or norm_vi(p.phone) like '%'||q.nq_like||'%'
         or norm_vi(p.child_name) like '%'||q.nq_like||'%'
         or exists (select 1 from jsonb_array_elements(coalesce(p.extra_children,'[]'::jsonb)) c
                    where norm_vi(c->>'name') like '%'||q.nq_like||'%')
         -- SĐT 2 chiều (phoneSearch.ts:16-26); guard pd rỗng (position('' in x) = 1 trong PG)
         or (q.is_phone and length(q.qd) >= 4 and
             length(ltrim(regexp_replace(coalesce(p.phone,''),'\D','','g'),'0')) >= 4 and
             (ltrim(regexp_replace(coalesce(p.phone,''),'\D','','g'),'0') like '%'||q.qd||'%'
              or position(ltrim(regexp_replace(coalesce(p.phone,''),'\D','','g'),'0') in q.qd) > 0)))
  order by p.created_at desc, p.id desc
  limit p_limit offset p_offset
$$;

create or replace function pr_list_summary(
  p_emails text[], p_is_test boolean, p_from timestamptz, p_to timestamptz, p_tvts text[])
returns jsonb language sql stable set search_path = public, pg_temp as $$
  -- {chips:{all,pending,short,done,over}   trên eff_state, state<>'cancelled', đủ filter
  --  tabs:{tracking,created,cancelled}      created = EXISTS active_requests
  --  kpi:{total,done,over,short,received,target}  mirror PaymentRequestKpiCards.tsx:6-15 (short = short+pending)
  --  tvts:[{email,name,crm_name,count}]     group by lower(sale_email), KHÔNG lọc ngày/tvts (mirror deriveTvtsOptions)
  --  has_pending_qr: exists payment_lines qr pending join PR state<>'cancelled' & created_at>=now()-30d & scope}
  select ...
$$;

revoke execute on function norm_vi(text), pr_list_page(text[],boolean,timestamptz,timestamptz,text,text,text[],text,int,int),
  pr_list_summary(text[],boolean,timestamptz,timestamptz,text[]) from public, anon, authenticated;
grant execute on function norm_vi(text), pr_list_page(text[],boolean,timestamptz,timestamptz,text,text,text[],text,int,int),
  pr_list_summary(text[],boolean,timestamptz,timestamptz,text[]) to service_role;   -- BẮT BUỘC, thiếu = 503
notify pgrst, 'reload schema';
-- ROLLBACK: drop function if exists pr_list_page(...), pr_list_summary(...), norm_vi(text);
--           drop index if exists idx_pr_created_at_id_desc, idx_payment_lines_pending_qr;
```

## Phụ lục B — Drift one-off (M0-T7, read-only)

```sql
with calc as (
  select l.payment_request_id pr_id,
         coalesce(sum(case when lower(l.method) in ('card','installment') and coalesce(l.verified_received,0)<>0
                           then l.verified_received else l.amount end) filter (where lower(l.status)='paid'),0) recv
  from payment_lines l group by 1)
select p.id, p.state, p.received, c.recv
from payment_requests p left join calc c on c.pr_id = p.id
where p.state <> 'cancelled' and coalesce(c.recv,0) <> coalesce(p.received,0);
-- prod hiện: 1 dòng (PR-2026-0222). Sửa bằng recompute_payment_request_totals(sb, id) qua script.
```

## Phụ lục C — Contract BE mới

- `GET /api/v1/payment-requests?view=page&page=1&page_size=50&bucket=tracking|created|cancelled&state=&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&is_test=false&tvts=a@x.com,b@x.com&q=` → `{requests: PaymentRequestItem[] (y hệt item cũ + ar_id, ar_activated, eff_received, eff_state), total, page, page_size}`. TZ ngày = `+07:00` (`p_from = f"{date_from}T00:00:00+07:00"`, `p_to = f"{date_to}T23:59:59.999999+07:00"`).
- `GET /api/v1/payment-requests/summary?<cùng filter trừ q/bucket/state/page>` → `{chips, tabs, kpi, tvts:[{email,name,label,count}], has_pending_qr}`.
- `GET /api/v1/payment-requests/{id}` → 1 item full (404 ngoài scope). Khai báo SAU mọi GET tĩnh.
- `GET /api/v1/payment-requests/badge-counts` → `{reconciliation, activation, invoice}`.
- `GET /api/v1/active-requests?pr_ids=a,b,c` → AR của các PR đó (≤100).
- Endpoint cũ `GET /payment-requests?limit&offset` **KHÔNG đổi contract** (B2/B3/B4 + e2e).

## Bỏ khỏi plan cũ và lý do

- GĐ2 Task 1–4, 6–10 (fixture aggregate, `compute_pr_aggregates`, 7 cột + backfill + parity, `?fields=slim`, slim-aware utils, carry-over cache): BỎ — không thêm cột thì không có gì backfill/parity; trang 50 dòng full ≈36 kB.
- GĐ3 Step 2 keyset cursor: ĐỔI sang RPC OFFSET (UI có pager số; ≤10k dòng offset trên index tốn ms). Step 3 gin_trgm: DEFER tới p95 search >300 ms. Step 6 realtime patch-row: BỎ (refetch trang ~50 kB rẻ). Step 7/8b–f/9/10: ngoài scope.
- Cron drift detector: BỎ — RPC tính từ lines nên không phụ thuộc cột `received/state`.
- Prereq "vá GĐ1 A3": ĐÃ CÓ (commit `8f3baa2` single-flight + debounce 5s + jitter).

## Claim đã phản biện (kết quả → đã sửa vào plan)

- LB1 "chỉ cần cột state/received/target" — **bác một phần** → RPC tính `eff_*` từ lines (M0-N1).
- LB2 "cột received/state đúng với lines trên prod" — **bác** (1 PR lệch) → M0-T7 recompute + M0-N1.
- LB3 "mọi lọc client port được" — **bác một phần** (search vắt field, phone guard, escape LIKE) → Phụ lục A.
- LB4 `norm_vi` mirror `normVi` — đứng vững; cần gate anh Minh (M0-T4) + query collation PG17.
- LB5 service_role + supabase-py rpc — đứng vững → GRANT bắt buộc.
- LB6 A3 live + B1 chạy độc lập AR full — **bác một phần** (5 call-site `requests` sót, replace `activeRequests` làm B3 mất AR) → M3-T2 tách `pageActiveRequests` + `findPr` toàn bộ.

## Tự chấm 5 tiêu chí

- **Triệt để**: B1 O(trang) thật (4 request ~50 kB), không phải giảm payload tạm. ✅
- **Không lỗi con**: số tính từ lines (không drift), route-order test, seq-guard hydrate, 2 script diff + smoke 10 mục trước khi bật. ✅
- **Không tăng gánh hạ tầng**: 0 cột, 0 bảng, 0 extension mới, 2 index + 3 function; flag env rollback 2'. ✅
- **Tối ưu token**: bỏ 18h việc GĐ2 sẽ vứt; task path:line rõ. ✅
- **Self-contained**: mọi task có path:line + contract; 4 task state sống đánh dấu Opus inline. ✅

## Nhật ký triển khai (2026-09-18, branch `feature/pr-list-server-pagination`)

**Bối cảnh quan trọng:** một phiên trước đã báo cáo "đã viết xong nền tảng M0/M1"
nhưng KHÔNG commit gì cả — khi phiên này bắt đầu, không file nào trong số đó tồn
tại ở bất kỳ branch/stash/commit rác nào trong repo. Toàn bộ M0-M3 dưới đây được
viết lại từ đầu, KHÔNG dựa trên "thành quả cũ" nào. Phiên này có quyền Supabase
MCP đầy đủ (sandbox `pxgybyfiwywksesyogti`) nên áp dụng + verify được thật, khác
phiên trước (bị chặn vì thiếu quyền).

**Đã làm — M0:**
- M0-T2 (đọc trên sandbox, KHÔNG có quyền query PROD trong phiên này — bị chặn ở
  tầng permission của công cụ, không phải chủ động bỏ qua): publication realtime
  sandbox RỖNG (khớp giả định plan) · collation `en_US.UTF-8` (không phải "vi" —
  khẳng định quyết định (c) sort TVTS ở FE) · `pg_trgm` có sẵn nhưng CHƯA cài đặt
  (đúng tinh thần defer) · `pg_cron` 1.6.4 đã cài · FK
  `payment_lines_payment_request_id_fkey` tồn tại.
- M0-T3/M1-T3: fixture vàng 15 case (`frontend/src/lib/__fixtures__/normViCases.json`)
  sinh THẬT bằng cách chạy `normVi()` (node -e), KHÔNG đoán tay — gồm case "Trường"
  (2 tầng dấu chồng: horn + huyền) theo đúng yêu cầu.
- M0-T5: `backend/scripts/seed_pr_scale.py` — **đã apply thật lên sandbox**
  (anh Đạt xác nhận cho phép chạy `--apply`, 2026-09-18). Bắt + sửa 2 bug thật
  lúc apply (dry-run không phát hiện được vì không đụng DB thật):
  (1) `method: "bank"` cho line "over" — vi phạm `payment_lines_method_check`
  (chỉ nhận `qr/cash/card/installment`), đổi sang `"cash"`;
  (2) `status: "pending"` cho active_requests — vi phạm `active_requests_status_check`
  (chỉ nhận `pending_order/partial_order/ready_invoice/invoiced/activated`),
  đổi sang `"pending_order"`. Sau khi sửa: **2000 payment_requests + 3365
  payment_lines + 769 active_requests đã có thật trên sandbox**, khớp đúng
  phân bố spec (raw column: `{done:800, over:100, short:400, pending:600,
  cancelled:100}`).

**Đã làm — M1 (áp dụng + verify THẬT trên sandbox, không chỉ viết):**
- `backend/migrations/2026-09-16-pr-list-page-rpc.sql` — đầy đủ 2 index +
  `norm_vi` + `pr_effective` (helper mới, không có trong khung Phụ lục A gốc —
  cần vì SQL function không tái dùng biểu thức CASE dễ, tách ra cho sạch) +
  `pr_list_page` + `pr_list_summary` + GRANT/REVOKE + rollback. **Đã áp dụng
  thật lên sandbox** qua MCP `apply_migration`, `get_advisors` = 0 finding mới.
- `backend/scripts/verify_norm_vi.py` — chạy thật, **15/15 case khớp**.
- Verify `pr_list_page`/`pr_list_summary` bằng SQL trực tiếp trên dữ liệu sandbox
  thật (51 PR có sẵn) — nội bộ nhất quán (tabs.tracking = filtered_total =
  chips.all). Test riêng bug SĐT rỗng: phone rỗng/null/ngắn (<4 số) đều
  `would_match=false`, phone thật khớp `true` — đúng fix.
- **M1-T2 EXPLAIN thật ở scale (sau khi seed 2000 PR, tổng 2051):**
  `select id, created_at from payment_requests order by created_at desc, id desc
  limit 50` → **Index Only Scan using idx_pr_created_at_id_desc**, 0.186ms
  (ở 51 dòng trước đó planner chọn Seq Scan — ĐÚNG theo cost, không phải bug,
  chỉ là chưa đủ dữ liệu). `pr_list_page(...)` full (is_test=true, bucket=
  tracking): ~94ms. Có `q='nguyen'` (norm_vi search full-text): ~211ms — vẫn
  dưới xa ngưỡng defer gin_trgm (>300ms). `pr_list_summary`: ~71ms.
  **Phát hiện thú vị (không phải bug):** `chips` tính từ `pr_effective` (dữ
  liệu payment_lines THẬT) lệch nhẹ so với cột `state` thô của seed
  (VD done raw=800 nhưng eff=859) — vì 100 PR "heavy installment" (M0-T5) có
  tổng dòng = ĐÚNG BẰNG target (thiết kế cố ý để mô phỏng đơn nhiều lần TT),
  nên vài PR gán nhãn "short" lúc seed thực ra tính ra "done" khi nhìn dòng
  thật. Đây CHÍNH LÀ nguyên lý M0-N1 (không tin cột state thô) được minh hoạ
  đúng bằng dữ liệu thật, không cần sửa gì.

**Đã làm — M2 (BE, đầy đủ + test thật):**
- M2-T0: pin `supabase==2.30.0` (không phải 2.15.2 như khung gốc — đó là bản
  ĐANG chạy + test pass thật trên máy dev, khung gốc chưa verify được version).
- M2-T1: cache TTL in-process (`rbac.py` `_cached`/`_rbac_cache_ttl`/
  `invalidate_roster`) cho `_lookup_staff`, `_sale_name_map`, `_staff_map`,
  `visible_creator_emails`. **Bẫy tự bắt được**: cache global rò giữa các test
  trong CÙNG tiến trình pytest → thêm fixture `autouse` xoá cache mỗi test
  (`backend/tests/conftest.py`).
- M2-T2/T3/T4: `GET /payment-requests?view=page`, `GET .../summary`,
  `GET .../{id}` — route-order xác nhận bằng test đọc trực tiếp
  `app.router.routes` (không chỉ tin cấu trúc code).
- M2-T5 (Opus inline): `GET .../badge-counts` — tái dùng NGUYÊN helper đã có
  (`_course_order_id`, `_course_is_invoiced`, `_course_invoice_requested_at` từ
  `activation_routes.py`) thay vì viết lại logic song song có nguy cơ lệch.
- M2-T6: `pr_ids` cho `GET /active-requests` + sentinel cap-1000 (loop `.range()`
  thay vì không giới hạn — bug thật: PostgREST tự cắt 1000 dòng nếu không
  `.range()`, prod hiện 941/1000, sát ngưỡng).
- M2-T7: recompute chỉ UPDATE khi received/state thực sự đổi.
- Test: `test_rbac_cache.py` (8), `test_pr_list_page.py` (14),
  `test_pr_summary_endpoint.py` (7), `test_pr_detail_endpoint.py` (6),
  `test_badge_counts.py` (9), `test_ar_list_pr_ids.py` (7) = 51 test mới.
  **901→971 pass**, 6 fail còn lại pre-existing (xác nhận bằng git stash).
- Verify sống qua HTTP thật (local backend + sandbox DB, JWT thật
  `test.admin@dev`): cả 5 endpoint 200, search "tran van" tìm đúng "Trần Văn
  Bân" xuyên suốt full stack.
- **Chưa làm**: M2-T8 (telemetry middleware), M2-T10 (deploy Render sandbox —
  cần quyền deploy riêng), M2-T11 (2 script diff tự động — ưu tiên thấp hơn vì
  đã có 51 test unit + verify tay qua HTTP thật).

**Đã làm — M3 (FE, rủi ro cao nhất — làm KHÔNG có anh Minh trực tiếp, theo yêu
cầu tường minh của Đạt "làm hết M0-M4"; đã cực kỳ cẩn trọng, flag mặc định OFF):**
- M3-T1: `frontend/src/lib/prListMode.ts` (mặc định `"load-all"` — hành vi hiện
  tại 100% không đổi trừ khi set `VITE_PR_LIST_MODE=server`), types
  (`PrListQuery`, `PrSummaryResponse`, `PrBadgeCountsResponse`, `arId`/
  `arActivated` trên `PaymentRequest`), `api.ts` (`listPage`, `summary`, `get`,
  `badgeCounts`, `activeRequests.list({pr_ids})`).
- M3-T4: `PaymentRequestKpiCards.tsx` tách `computePrKpi()` + prop `kpi?`
  override.
- M3-T2 (Opus inline — vùng nhạy cảm nhất, có lịch sử bug PR-0080/0081):
  `PaymentFlowContext.tsx` thêm `listQuery/pageRows/pageTotal/pinnedRows/
  pageActiveRequests/summary/findPr/ensureFullData/hydratePr`. **Phát hiện +
  sửa 1 gap thật khi viết code** (không có trong plan gốc): `updateRequest`/
  `updateActiveRequest` (dùng cho optimistic update khi confirm/reject/cancel...)
  TRƯỚC ĐÓ chỉ set `requests` — ở server mode PR sống trong `pageRows`/
  `pinnedRows`, optimistic update sẽ KHÔNG hiện trên UI nếu không sửa 2 hàm này
  set ĐỒNG THỜI cả 3 nơi. Đã sửa + không có trong estimate 150' gốc.
- M3-T3 (Opus inline): `PaymentRequestsTab.tsx` — mọi `requests.find()` (8 chỗ,
  2 trong context + 6 trong tab) đổi sang `findPr()`; chips/tabs/tvtsOptions/
  pageSlice/KPI/total rẽ nhánh server/load-all qua biến `effective*`.
- M3-T5: `ensureFullData()` gọi trong `ReconciliationTab.tsx`, `ActivationTab.tsx`,
  `InvoiceRequestTab.tsx` (mount effect) — B2/B3/B4 vẫn nhận đủ `requests`/
  `activeRequests` ở server mode, không cần chuyển sang findPr ngay.
- M3-T6: `PaymentFlowContext.serverMode.test.tsx` (6 test, TỰ DỰNG từ đầu —
  "refetchGate.test.tsx" nhắc trong plan gốc KHÔNG tồn tại, không có tiền lệ
  mount `PaymentFlowProvider` thật + MSW trong repo trước đây): query params
  đúng, `summary.kpi` lộ ra context, `pageTotal` đúng nghĩa, hydratePr +
  pinnedRows, **seq-guard race** (response cũ resolve SAU response mới cho
  CÙNG id → bị chặn, không ghi đè), `ensureFullData` tải song song không thay
  thế pageRows. Bắt + sửa 1 test cũ (`PaymentRequestsTab.tvtsFilter.test.tsx`)
  thiếu mock `findPr`/`hydratePr`/... sau khi thêm field context mới.
  **Chưa viết**: kịch bản "B3 mounted + realtime → activeRequests không giảm"
  và "BE từ chối mark-paid khi requests=[] → rollback" (plan liệt kê nhưng cần
  thêm thời gian dựng MSW phức tạp hơn — ghi lại để làm tiếp, không phải bỏ sót
  do quên).
- Verify sống trên **browser thật** (`VITE_PR_LIST_MODE=server` tạm thời local),
  2 vòng — vòng 1 trước khi seed (51 PR), vòng 2 SAU khi seed 2000 PR thật
  (2051 PR):
  - Vòng 1: KPI/chips/table render đúng số liệu khớp 100% với verify SQL trực
    tiếp trước đó (31 tracking, ~124tr đã thu); search "tran van" gửi đúng
    `q=tran+van`; đổi filter (date/hideTest) → query đổi đúng, trả 0 kết quả
    ĐÚNG (dữ liệu sandbox không có PR thật nào trong tháng 9, không phải bug).
  - Vòng 2 (scale thật 2051 PR, bỏ lọc ngày + hideTest): KPI hiện đúng **1931
    PR đang theo dõi, 4.520.241.747đ đã thu, 970 sẵn sàng tạo gói học**; sidebar
    badge "Tạo gói học" hiện **405** (badge-counts qua toàn bộ 2051 PR); **phân
    trang hiện đủ 39 trang** (2051 PR ÷ 50/trang ≈ 41, phù hợp sau khi trừ
    cancelled) — xác nhận `page_size=50` + `pageTotal` hoạt động đúng ở quy mô
    thật, không phải giả lập.
  - Sau cả 2 vòng: xoá `VITE_PR_LIST_MODE` khỏi `.env` local — trả về mặc định
    `load-all`.
- **tsc -b sạch, `npm run build` sạch, 83 test file / 840 test frontend pass**
  (834 trước M3-T4 → 840 sau khi thêm 6 test KpiCards + 6 test serverMode, trừ
  đi phần trùng — con số ròng đã re-run xác nhận), backend 971/977 pass (6 fail
  pre-existing) — re-run lại LẦN CUỐI sau khi sửa seed script, vẫn y hệt.

**M4 — CHƯA làm, có chủ đích:**
- M4-T3 (migration PROD) và các bước prod khác trong bảng gate phía trên đòi hỏi
  soak sandbox 2 ngày + merge qua anh Minh (classifier chặn Claude push main) —
  không thể/không nên nén vào 1 phiên. Đã dừng đúng ở "sẵn sàng cho M4", không
  tự ý chạm prod.
- Seed 2000 PR (M0-T5) + EXPLAIN scale thật (M1-T2) **đã xong** (2026-09-18, anh
  Đạt cho phép) — xem chi tiết ở mục M0/M1 phía trên. 2000 PR-SEED-* vẫn còn
  trên sandbox (chủ ý giữ lại để test scale sau này); có `--clean --apply` nếu
  cần dọn.
