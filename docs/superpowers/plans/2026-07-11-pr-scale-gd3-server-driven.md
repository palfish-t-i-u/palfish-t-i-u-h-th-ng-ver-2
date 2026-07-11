# GĐ3 — PR Server-Driven (Postgres tính, app đọc kết quả) — Design Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> ⚠️ **Đây là plan mức THIẾT KẾ (design-level).** GĐ3 chưa khởi công — chi tiết TDD (failing test → implement → pass → commit) sẽ viết thành plan con cho từng step KHI trigger chạm. Plan này phải đủ cụ thể để 1 dev viết plan chi tiết mà không cần đọc lại toàn bộ báo cáo. Nguồn chân lý (đã qua judge panel): `docs/RESEARCH_SCALE_10K_PR_2026-07-11.md` (mục 5, 6, 7).

**Goal:** Đưa list PR + search + summary/KPI + báo cáo (dashboard, BC01-03, ledger) về server-driven: keyset pagination, search index trgm, summary RPC 1 round-trip, realtime patch-row, RPC báo cáo — scale tới 10.000 PR **không nâng plan Render/Supabase** (nếu phải nâng trước khi Steps 7-8 ship thì đó là bug thiết kế).

**Architecture:** Bản thắng judge panel: **ops-first** (thứ tự đúng, rollback từng bước tính bằng phút, trigger có lead-time, estimates trung thực), graft: search_text-từ-GĐ2 + normalize-1-implementation + diff-search-trước-khi-bật (api-first); format-field tường minh + index-gộp-vào-GĐ2 (db-first); Step 8 phủ đủ 6 endpoint (db-first). Đã bỏ khỏi bản gốc ops-first: soft-archive `archived_at` (thay bằng date-window filter Step 9), CAS spec cũ (đã sửa ở quick win #5 mục 3 báo cáo).

**Tech Stack:** FastAPI + supabase-py, Postgres (Supabase — extension sẵn catalog: pg_trgm, pg_cron, hypopg, index_advisor), React 19 + Vite, Vitest, pytest.

**Tham chiếu chéo hạ tầng GĐ2 (KHÔNG tạo lại ở GĐ3, chỉ dùng):**
- Cột `search_text` — đã ghi tại recompute GĐ2 bằng MỘT hàm normalize Python duy nhất + đã backfill (sửa đổi GĐ2 #3). GĐ3 Step 3 chỉ còn `CREATE INDEX` gin_trgm.
- Index keyset `(created_at DESC, id DESC)` — đã nằm trong migration GĐ2 revised (sửa đổi GĐ2 #9).
- Partial index `(created_at DESC) WHERE has_pending_qr = true` — đã nằm trong migration GĐ2 revised (sửa đổi GĐ2 #9). GĐ3 Step 6 chỉ xây endpoint đọc lên nó.
- 5+2 cột aggregate (`done_count`, `total_count`, `display_received`, `has_pending_qr`, `has_unverified_installment`, `referral_status`, `search_text`) + golden fixture + parity cron nightly — tất cả từ GĐ2 revised.

---

## Trigger kích hoạt

Đo bằng **telemetry BE từ vá GĐ1 #4** (log JSON + ghi bảng `notifications` throttle 1 lần/ngày, nối DingTalk outbox) — **không phải cảm giác, không phải sự cố**. Đó là khác biệt duy nhất giữa "nâng cấp theo kế hoạch" và "lặp lại sự cố OOM 9/7".

Bắt buộc khởi động **Steps 2-6** khi chạm **BẤT KỲ** điều kiện nào:

1. Tổng PR ≥ **4.000** (~40% trần GĐ2, chừa 2-3 tháng dev; hạ xuống **2.500** nếu số user tăng gấp đôi — tải nhân theo user × mutation, không chỉ theo PR)
2. p95 load list > **3s** hoặc payload 1 lượt nạp > **4MB gzip**
3. Render RAM p95 > **70%** (~358MB) kéo dài **7 ngày**
4. Nhóm query list PR lọt **top-3 total_exec_time** trên `pg_stat_statements`

**KHÔNG chờ trigger — làm ngay sau khi GĐ2 ổn định:** **Step 0, Step 1, Step 7** (đang sửa lỗi hiện hữu: RBAC bão query ~890k/tuần, báo cáo undercount, ledger mang hình dáng OOM 9/7 — không phụ thuộc scale).

---

## Tư tưởng

Đảo mô hình từ **"kéo hết về client/Python rồi tính"** sang **"Postgres tính, app chỉ đọc kết quả"**:

- List: cursor keyset + filter server-side thay vì nạp toàn bộ rồi lọc client.
- Search: index trgm trên cột đã normalize thay vì scan mảng trong JS.
- KPI/chip/bucket: 1 RPC `COUNT(*) FILTER`/`SUM` trên cột aggregate thay vì reduce client trên vạn row.
- Báo cáo: RPC JOIN/GROUP BY thay vì loop Python O(lines×staff) kéo 50k dòng vào RAM.
- Realtime: patch 1 row thay vì refetch cả list.

**Không hạ tầng mới** ngoài extension đã sẵn trong catalog Supabase (`pg_trgm`, `pg_cron`, `hypopg`, `index_advisor`). Không thêm service, không thêm lib, không nâng plan. Mọi thay đổi có **đường lùi tính bằng phút**: env flag / `DROP INDEX` / `DROP FUNCTION` / `cron.unschedule`.

---

## Steps

Tổng **~20 ngày-dev** trên team 3 dev, mọi task ≤ 3 ngày (ràng buộc dev-timeline). Steps 1 và 7 làm được ngay sau GĐ2 ổn định; Step 10 chạy song song từ Step 2.

### Step 0: Seed sandbox 10k PR + đo baseline

- [ ] **Step 0: Seed sandbox 10k PR + đo baseline** — không chờ trigger

**What:**
- Seed sandbox (`pxgybyfiwywksesyogti`) 10.000 PR + 30-40k `payment_lines` sao **PHÂN BỐ THẬT từ prod**: 5% PR có 15-30 line trả góp, tỷ lệ cancelled thật — KHÔNG seed uniform (uniform che mất tail latency của PR trả góp dài).
- Cài `hypopg` + `index_advisor` trên sandbox (extension sẵn catalog, chỉ `CREATE EXTENSION`).
- `EXPLAIN (ANALYZE, BUFFERS)` 6 query nóng: list keyset, search trgm, summary, dashboard QR, BC03, ledger team-filter — lưu output làm bằng chứng cho mọi quyết định index ở steps sau.
- Snapshot `pg_stat_statements` prod làm baseline rồi `pg_stat_statements_reset()`.

**Why:** Mọi quyết định index/RPC ở Steps 2-7 phải có số EXPLAIN chứng minh trên phân bố dữ liệu thật — không đoán, không cargo-cult index.

**Effort:** 1 ngày. **Prereq:** GĐ2 chạy trên sandbox.

**Rollback:** Chỉ đụng sandbox — xóa data seed / reset sandbox, prod không ảnh hưởng (0 phút rủi ro prod).

```bash
# Sandbox only — verify extension trước khi seed
# (qua MCP execute_sql trên pxgybyfiwywksesyogti)
# CREATE EXTENSION IF NOT EXISTS hypopg; CREATE EXTENSION IF NOT EXISTS index_advisor;
# Sau seed: EXPLAIN (ANALYZE, BUFFERS) cho 6 query nóng, lưu vào docs/learnings/
```

### Step 1: RBAC cache in-process TTL 120s

- [ ] **Step 1: RBAC cache in-process** — không chờ trigger

**What:** Cache in-process **dict + timestamp, TTL 120s — không thêm lib** cho roster `nhan_su_sale` + kết quả `visible_creator_emails()`. Invalidate chủ động tại các admin routes mutate nhân sự (`admin_routes.py`). Cắt ~890k calls/tuần: 400.994 calls `nhan_su_sale WHERE email=$1` + 96.620 full-list + 393.006 đếm PR (số đo pg_stat_statements).

**Why:** RBAC app-layer đang là nguồn query lớn nhất toàn DB — lỗi hiện hữu, không phụ thuộc scale.

**Effort:** 1 ngày. **Prereq:** Không — làm ngay.

**Rollback:** Env flag `RBAC_CACHE_TTL=0` (=bypass cache) — đổi env Render ~2 phút; TTL 120s tự bảo hiểm độ stale tối đa.

```bash
# Rollback: Render dashboard → Environment → RBAC_CACHE_TTL=0 → redeploy (~2 phút)
```

### Step 2: List v2 keyset

- [ ] **Step 2: List v2 keyset** — chờ trigger

**What:**
- Endpoint list v2: cursor **(created_at, id)** qua `.or_()` PostgREST (row-value comparison giả lập: `created_at < X OR (created_at = X AND id < Y)`); filter `state`/`date`/`sale`/`q` đẩy hết server-side.
- Index `(created_at DESC, id DESC)` **ĐÃ có từ migration GĐ2 revised** — không tạo lại.
- Composite `(state, created_at)` **CHỈ thêm nếu EXPLAIN sandbox (Step 0, hypopg) chứng minh** — judge bác việc thế chỗ index keyset (vi phạm leftmost-prefix: view "tất cả" phổ biến nhất không dùng được).
- **Verify cú pháp supabase-py hiện hành trước khi viết** (cách `.or_()` encode nested and/or — đổi giữa các version; viết spike test nhỏ trên sandbox trước).
- Endpoint v2 chạy **song song** endpoint cũ — FE chưa gọi cho tới Step 5, deploy BE trước không đổi hành vi.

**Why:** Load-all GĐ1/slim GĐ2 vẫn O(n) theo tổng PR ở cả payload lẫn RAM client; keyset là O(page) và index-only.

**Effort:** 3 ngày. **Prereq:** Step 0; GĐ2 merged.

**Rollback:** FE chưa gọi v2 → 0 rủi ro; nếu lỡ thêm composite index → `DROP INDEX` ~1 phút.

```sql
-- Rollback composite (nếu đã thêm):
-- DROP INDEX IF EXISTS idx_payment_requests_state_created_at;
```

### Step 3: Search server-side

- [ ] **Step 3: Search server-side** — chờ trigger

**What:**
- Chỉ còn `CREATE INDEX ... USING gin (search_text gin_trgm_ops)` — cột `search_text` **đã được ghi + backfill từ GĐ2** bằng MỘT hàm normalize Python duy nhất (cùng hàm dịch param `q` khi query — không dùng unaccent SQL, né rủi ro lệch đ→d/NFD, xem commit 6e0c49d).
- Query: `.ilike('search_text', '%q_normalized%')` trên list v2.
- **BẮT BUỘC trước khi bật: chạy diff kết quả search client-cũ vs server-mới trên data prod** (script so sánh id-set cho các query phổ biến, đặc biệt case đ→d, "Như Ý", NFC vs NFD 'hủy/huỷ') — 0 diff mới được bật.

**Why:** Search client chỉ đúng khi client có toàn bộ data — chết cùng load-all khi chuyển keyset.

**Effort:** 1 ngày. **Prereq:** Step 2.

**Rollback:** `DROP INDEX` ~1 phút + FE flag về search client (đi cùng flag Step 5).

```sql
-- Rollback: DROP INDEX IF EXISTS idx_payment_requests_search_text_trgm;
```

### Step 4: Summary RPC

- [ ] **Step 4: Summary RPC** — chờ trigger

**What:**
- 1 function `COUNT(*) FILTER (WHERE ...)` / `SUM(...)` trên **cột aggregate GĐ2**, trả toàn bộ bucket/chip/KPI trong **1 round-trip** (thay reduce client trên toàn bộ rows).
- `REVOKE EXECUTE FROM public/anon` + `SET search_path = public, pg_temp` ngay trong cùng migration (chuẩn từ sửa đổi GĐ2 #9).
- **Golden fixture khóa semantics**: mở rộng fixture GĐ2 (`prAggregateCases.json`) thêm expected bucket/chip counts — pytest chứng minh RPC khớp fixture.
- Kèm **watermark `updated_at`** (max updated_at) trong cả response list lẫn summary — FE so 2 watermark để phát hiện list và summary lệch snapshot, lệch thì refetch.

**Why:** KPI/chip là lý do duy nhất còn lại phải nạp toàn bộ list về client.

**Effort:** 2 ngày. **Prereq:** Step 2; fixture GĐ2.

**Rollback:** `DROP FUNCTION` ~1 phút; FE (chưa bật server mode tới Step 5) vẫn tính client như cũ.

### Step 5: FE server-driven sau flag 2 chiều

- [ ] **Step 5: FE server-driven sau flag** — chờ trigger

**What:**
- Env flag 2 chiều `VITE_PR_LIST_MODE=server|load-all` — toàn bộ nhánh list/search/summary FE rẽ theo flag.
- Mode server: page **50 dòng** — không cần virtualization ở page size này.
- Response dùng field tường minh `format: "slim"|"full"` + TypeScript union type (sửa đổi GĐ2 #8) — không dựa hidden contract `raw.payments === undefined`.
- **Gỡ mode load-all sau 2 tuần ổn định — tạo ticket hẹn ngày NGAY KHI MERGE** (không để dead mode lởn vởn thành nhánh không test).

**Why:** Flag 2 chiều là rollback path của toàn bộ GĐ3 phía FE; đổi env Vercel không cần deploy code.

**Effort:** 3 ngày. **Prereq:** Steps 2-4.

**Rollback:** Đổi env Vercel `VITE_PR_LIST_MODE=load-all` → redeploy (~2 phút).

```bash
# Rollback: Vercel dashboard → Env → VITE_PR_LIST_MODE=load-all → redeploy (~2 phút)
# Ticket gỡ load-all: tạo ngay khi merge, due date = merge + 14 ngày
```

### Step 6: Realtime patch-row + poll rẻ

- [ ] **Step 6: Realtime patch-row + poll rẻ** — chờ trigger

**What:**
- Realtime event → `GET /payment-requests/{id}` (endpoint detail GĐ2) → **patch đúng 1 row** trong state + debounce/jitter/coalesce (không refetch cả list mỗi event).
- Poll QR 30s → endpoint mới `pending-qr-ids` trả riêng danh sách id: **index-only scan trên partial index `has_pending_qr` từ GĐ2**, payload vài chục byte.
- Heartbeat reconnect (realtime đứt) → refetch **trang hiện tại**, không refetch toàn bộ.

**Why:** Ở 10k PR, mỗi event realtime kéo cả list = tự DDoS; poll QR hiện tại quét toàn list.

**Effort:** 3 ngày. **Prereq:** Step 5.

**Rollback:** Flag FE quay về hành vi refetch-list (đi cùng flag Step 5, ~2 phút); endpoint `pending-qr-ids` vô hại nếu không ai gọi.

### Step 7: Dashboard + BC01-03 + ledger xuống RPC

- [ ] **Step 7: Dashboard + BC01-03 + ledger xuống RPC** — không chờ trigger

**What:** Mẫu sẵn có: RPC `get_top_sales`. Tách 3 task × 1 ngày, 3 dev song song:
1. `revenue_summary` RPC — thay các đường đọc `so_doanh_thu`/`don_hang` không paginate ở BC03/"Doanh thu thực thu".
2. `dashboard_qr_collected` RPC — **JOIN thay loop Python O(lines×staff)**.
3. Ledger team filter: `.eq('team', ...)` đẩy xuống DB (index sẵn có) — Python chỉ đọc kết quả, **xóa vĩnh viễn hình dáng OOM 9/7** (hiện kéo tới 50k dòng full-column vào RAM mỗi page view, `revenue_routes.py:1296-1309, 574-584`).

Mọi function mới: `REVOKE EXECUTE` + `SET search_path` cùng migration; EXPLAIN trên seed Step 0 trước khi merge.

**Why:** Đây là các lỗi hiện hữu (undercount báo cáo sếp + bản sao pattern OOM 9/7) — sửa ngay sau GĐ2 ổn định, không phụ thuộc scale.

**Effort:** 3 ngày (3 task × 1 ngày song song). **Prereq:** Step 0 (seed + EXPLAIN); **không chờ trigger**.

**Rollback:** Mỗi endpoint giữ code path Python cũ sau env flag BE per-endpoint (đổi env Render ~2 phút) hoặc rollback deploy Render về image trước (~5 phút); `DROP FUNCTION` ~1 phút.

### Step 8: Convention rollout đủ 6 endpoint

- [ ] **Step 8: Convention rollout 6 endpoint** — chờ trigger (sau Step 2)

**What:** Nhân convention từ Step 2 (paginate/slim/chunk/limit) ra 6 endpoint còn cap-1000 tiềm ẩn — 2 PR:
- (a) Active requests: paginate + slim + chunk `in_()` qua `_chunked`.
- (b) Guard order_id trùng → **bảng phẳng `ar_course_order_ids(order_id UNIQUE)`** — UNIQUE constraint là guard tuyệt đối tại DB, hết race, thay quét full-table `active_requests`.
- (c) Invoice m3/m4: limit + date-range mặc định 90 ngày.
- (d) Gateway dedup: `.in_('payment_line_id', line_ids)` + counts exact.
- (e) `/payos/transactions`: RBAC filter TRƯỚC limit (hiện limit trước → sale thấy thiếu).
- (f) `invoice_reminders` lưu `requested_by_email` lúc ghi — bỏ `list_users()` (full scan auth).
- Kèm **audit regex PR-id `PR-\d{4,}`** toàn codebase (FE+BE) + test seed sequence 9999 — PR thứ 10.000 sinh 5 chữ số (`lpad(seq,4,'0')` tràn), regex `PR-\d{4}-\d{4}` cứng sẽ rơi fallback.

**Why:** Cap-1000 là sai số **im lặng**; mỗi endpoint quên convention là một quả bom hẹn giờ theo data growth.

**Effort:** 3 ngày (2 PR). **Prereq:** Step 2 (convention mẫu).

**Rollback:** `git revert` từng PR + redeploy (~5 phút); bảng `ar_course_order_ids` → `DROP TABLE` sau khi gỡ code (~1 phút).

### Step 9: Data lifecycle nhẹ

- [ ] **Step 9: Data lifecycle nhẹ** — chờ trigger (sau Step 5)

**What:**
- Default **date-window filter 6 tháng** server-side trên list + UI nút "Xem tất cả" — **0 schema change** (thay thế soft-archive `archived_at` đã bị judge bác — xem mục KHÔNG làm #2).
- Nhân rộng cron retention 30 ngày (pg_cron, mẫu sẵn có) sang `dingtalk_outbox` + `notifications` đã đọc.

**Why:** 95% thao tác nằm trong 6 tháng gần nhất; window filter cho hiệu quả của archive mà không có rủi ro "endpoint quên archived-scope = sai số tài chính im lặng".

**Effort:** 1 ngày. **Prereq:** Step 5.

**Rollback:** Đổi default window về "tất cả" (env/const, ~2 phút); `SELECT cron.unschedule('<job>')` ~1 phút.

```sql
-- Rollback cron: SELECT cron.unschedule('retention_dingtalk_outbox');
```

### Step 10: Ops guardrails

- [ ] **Step 10: Ops guardrails** — chạy SONG SONG từ Step 2

**What:**
- Middleware đo **p95 + payload size** cho 5 endpoint nóng (list PR, detail, summary, dashboard, ledger) — log JSON, nguồn số cho bảng Monitoring.
- **Render mem alert**: `/healthz` trả RSS + Render notification native khi vượt ngưỡng.
- **Runbook rollback từng step** (env flag FE/BE, `DROP INDEX`, `DROP FUNCTION`, `cron.unschedule`) — 1 trang, dev nào cũng thao tác được trong <5 phút.
- **Checklist migration cố định**: sandbox `execute_sql` → `apply_migration` prod → `get_advisors` (0 finding mới = xong).

**Why:** GĐ3 đổi nhiều tầng cùng lúc — không có số đo và đường lùi viết sẵn thì mọi sự cố thành phiên debug mù.

**Effort:** 2 ngày. **Prereq:** Không.

**Rollback:** Middleware sau env flag tắt (~2 phút); alert/cron `unschedule` ~1 phút.

---

## Monitoring & ngưỡng

(Nguyên bảng mục 6 báo cáo — nguồn số: telemetry vá GĐ1 #4 + middleware Step 10.)

| Chỉ số | Ngưỡng | Hành động |
|---|---|---|
| Tổng PR (telemetry BE daily) | WARN ≥3.000 / CRIT ≥4.000 | Chuẩn bị / **bắt buộc khởi động GĐ3 steps 2-6** |
| p95 load list + payload/lượt | WARN >2s / CRIT >3s hoặc >4MB gzip | Chạm CRIT = trigger GĐ3 bất kể số PR |
| Render RAM | WARN p95 >70% 15 phút / CRIT >85% | Điều tra; **chỉ bàn nâng plan nếu vẫn chạm SAU steps 7-8** |
| Parity aggregate (pg_cron nightly) | Lệch >0 | Alert ngay; 3 đêm liên tiếp → truy write-path lậu |
| Sentinel cap-1000 (fetch trả đúng 1000 rows) | >0/ngày | Log ERROR + alert — bắt endpoint mới quên convention |
| `bank_transactions` unmatched tuổi >24h | >5 | Alert — tiền về không match là silent failure đắt nhất |
| Pending QR lines (count trên partial index) | >500 | WARN — lines mồ côi cần quy trình hủy/TTL |
| Outbox (zalo+dingtalk) | Row pending cũ nhất >10 phút hoặc dead-letter | Alert worker chết |
| Dead tuple ratio `payment_requests` | >50% kéo dài (hiện 39%) | Hạ autovacuum_scale_factor riêng bảng (0.05) |
| pg_stat_statements | Review thủ công 5 phút đầu tháng qua MCP; mean >50ms đường nóng → điều tra; reset sau mỗi đợt tối ưu | (không dựng bảng snapshot riêng — judge bác) |
| `get_advisors` | Sau MỌI migration | 0 finding mới = migration xong |
| pg_stat_user_indexes | Mỗi quý | idx_scan=0 sau 90 ngày → drop kỳ tới (hiện có ~27 unused) |

---

## Những gì KHÔNG làm

Đồng thuận judge panel (mục 7 báo cáo) — liệt kê để **khỏi bàn lại**:

1. **Trigger DB thay recompute app-layer** — tạo implementation thứ 3 (regex 'hủy' + freeze-cancelled + parse jsonb trong plpgsql) phải parity vĩnh viễn, còn lặng lẽ đổi hành vi so với GĐ2 đã duyệt; app-layer + parity cron = ~90% giá trị, 10% rủi ro.
2. **Soft-archive `archived_at` + cron + partial index toàn hệ** — over-engineering ở 10k rows/năm; endpoint nào quên archived-scope là sai số báo cáo tài chính im lặng. Thay bằng date-window (Step 9); xem lại khi ≥50-100k rows.
3. **CAS claim bằng `.eq('status','pending')`** — sai schema (outbox KHÔNG có cột status) và thiếu predicate `next_retry_at` → vẫn double-send; dùng bản đã sửa ở quick win #5.
4. **unaccent SQL cho search_text** — đ là chữ cái riêng, rủi ro lệch với normalize JS (commit 6e0c49d); một hàm Python duy nhất cho cả ghi lẫn query.
5. **Ghép tên sale vào search_text** — join ngoài bảng = stale ngay khi đổi tên trong `nhan_su_sale`; tìm theo sale dùng filter `sale_email` sẵn có.
6. **Composite `(state, created_at, id)` thế chỗ index keyset** — vi phạm leftmost-prefix: view "tất cả" (phổ biến nhất) không dùng được; composite state chỉ thêm khi EXPLAIN chứng minh (Step 2).
7. **Partial index `payment_lines(status, created_at) WHERE status='pending'`** — cột status trong key là dead weight (predicate đã cố định); dạng đúng: `(created_at) WHERE status='pending'`.
8. **ETag/304 cho detail endpoint** — đường nóng là GET-sau-event nên row vừa đổi, ETag gần như luôn miss; xem lại khi có số đo hotspot.
9. **Bảng snapshot pg_stat hằng tuần + endpoint telemetry realtime riêng** — monitoring không ai đọc là gánh nặng thuần với team 3 dev; review tay đầu tháng đủ.
10. **Ops alert qua zalo_outbox** — kênh nghiệp vụ khách hàng, nhét ops alert dễ sinh lỗi con đúng chỗ nhạy nhất; dùng `notifications` / `dingtalk_outbox`.
11. **Sentinel "tách chunk 50 retry"** — không deterministic; dùng loop `.range()` nội bộ (đã fix ở vá GĐ1 #2).
12. **Partition, đổi PK UUIDv7, advisory lock, GIN jsonb, declarative schemas** — đã loại từ khảo sát (not_applicable ở quy mô này), giữ nguyên kết luận.

---

## Prerequisite

Trước khi viết plan TDD chi tiết cho bất kỳ step nào (kể cả Steps 0/1/7 không chờ trigger):

1. **GĐ2 (bản revised 2026-07-11) merged + chạy ổn định** — plan `2026-07-11-pr-list-slim-lazy-gd2.md` đã nhập đủ 10 sửa đổi mục 4 báo cáo (đặc biệt: cột `search_text` + `referral_status`, index keyset + partial `has_pending_qr` gộp trong migration, parity pg_cron nightly chạy từ ngày đầu, field `format: "slim"|"full"`). Parity nightly 0 mismatch liên tục ≥1 tuần.
2. **Vá GĐ1 deployed** (4 điểm mục 4 báo cáo) — đặc biệt #4 telemetry BE (nguồn số đo cho toàn bộ trigger GĐ3) và #3 single-flight `loadData()` (điều kiện sống của realtime/backfill).
3. **Quick wins mục 3 báo cáo done** — migration bảo mật RLS, đảo hướng match webhook, vá 4 chỗ cap-1000, index đợt 1, CAS claim outbox, `count='exact'` chỉ offset==0, 2 migration DingTalk đã áp prod, batch search_path 23 function, diệt N+1 exchange rate.

---

## Guardrails tổng hợp (recap)

| Guardrail | Cơ chế | Ở đâu |
|---|---|---|
| Trigger bằng số đo, không bằng cảm giác/sự cố | 4 ngưỡng đo được (PR ≥4.000 / p95 >3s hoặc >4MB gzip / RAM p95 >70% 7 ngày / top-3 pg_stat) từ telemetry vá GĐ1 #4 | Trigger kích hoạt |
| Mọi thay đổi có đường lùi tính bằng phút | env flag (FE Vercel, BE Render) / DROP INDEX / DROP FUNCTION / cron.unschedule — ghi trong từng step + runbook | Mỗi step; Step 10 |
| Không tạo lại hạ tầng GĐ2 | search_text + index keyset + partial has_pending_qr chỉ DÙNG, không tạo; Step 3 chỉ còn CREATE INDEX gin_trgm | Header; Steps 2, 3, 6 |
| Index mới phải có bằng chứng | EXPLAIN (ANALYZE, BUFFERS) trên seed phân-bố-thật + hypopg trước khi CREATE; composite state chỉ khi EXPLAIN chứng minh | Steps 0, 2 |
| Search không đổi kết quả khi chuyển server | Diff id-set client-cũ vs server-mới trên data prod (đ→d, NFC/NFD) — 0 diff mới bật | Step 3 |
| Semantics số không lệch FE↔BE↔RPC | Golden fixture GĐ2 mở rộng + watermark `updated_at` list vs summary + parity cron nightly | Step 4 |
| Rollback FE toàn cục ~2 phút | Flag 2 chiều `VITE_PR_LIST_MODE=server\|load-all` | Step 5 |
| Không để dead mode | Ticket gỡ load-all hẹn ngày (merge + 14 ngày) tạo ngay khi merge | Step 5 |
| Migration an toàn | sandbox → apply_migration prod → `get_advisors` 0 finding mới; REVOKE + SET search_path cho mọi function mới | Steps 4, 7; Step 10 checklist |
| Bắt endpoint mới quên convention | Sentinel cap-1000 (fetch trả đúng 1000 rows → log ERROR + alert) | Monitoring; Step 8 |
| Không nâng plan hạ tầng vô căn cứ | Mọi đề xuất nâng plan Render/Supabase phải kèm số đo chứng minh SAU khi Steps 7-8 đã ship | Tư tưởng; Monitoring |
| Task vừa sức team | Mọi step ≤3 ngày, tổng ~20 ngày-dev / 3 dev; Step 7 tách 3 task × 1 ngày song song | Steps |
