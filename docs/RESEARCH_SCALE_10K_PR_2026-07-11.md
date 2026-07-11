# Báo cáo tổng hợp: Kế hoạch scale PalFish GMV Reconciliation (190 → 10.000 PR)

> Khảo sát DB prod (jozcvbbypwvzaefteoxn) qua Supabase MCP **thành công, 100% read-only** — mọi số liệu dưới đây là số đo thật, không phỏng đoán.

---

## 1. TL;DR

- **DB chưa phải bottleneck** (bảng lớn nhất 20MB, mọi query <2ms) — rủi ro nằm ở **pattern**: cap 1000 rows của PostgREST đang chờ làm sai số **im lặng** ở ~6 chỗ, nguy hiểm nhất là **webhook tiền về không match được** khi pending lines >1000.
- **Gãy trước tiên không phải list PR** mà là: (a) 2 lỗ bảo mật CRITICAL (anon key đọc/ghi được tỷ giá GMV), (b) hạ tầng DingTalk **chưa tồn tại trên prod** trong khi code đang sửa dở, (c) các số báo cáo sếp (BC03, dashboard) undercount khi vượt 1000 dòng/kỳ.
- **Thứ tự làm**: tuần này ~2,5 ngày-dev quick wins (bảo mật + webhook + cap-1000 + index) → nhập 10 sửa đổi vào plan GĐ2 **trước khi khởi công** → GĐ3 theo bản thiết kế ops-first (thắng 2/3 judge) đã graft ý hay từ 2 bản kia, kích hoạt bằng **số đo** (4.000 PR / p95 3s / RAM 70%), không bằng sự cố.
- **Không nâng plan Render/Supabase** ở bất kỳ mốc nào tới 10k PR — nếu phải nâng trước khi GĐ3 steps 7-8 ship thì đó là bug thiết kế.

---

## 2. Phát hiện quan trọng từ khảo sát (facts đáng hành động)

### Bảo mật (advisor Supabase, mức CRITICAL/WARN)
| Fact | Evidence |
|---|---|
| **RLS TẮT trên `app_settings`** — anon key đọc/GHI được `gmv_exchange_rate`, `gmv_cutoff_at` | `list_tables`: rls_enabled=false; advisor CRITICAL |
| RLS tắt trên `so_doanh_thu_dedup_backup_20260620`; cả 2 bảng backup không có PK | advisor rls_disabled + no_primary_key |
| Policy `exchange_rates_service_all` và `notifications_service_all` là `USING(true)` cho **mọi role** — client authenticated sửa được tỷ giá | pg_policies + advisor rls_policy_always_true |
| 23 function public (nhiều SECURITY DEFINER trên pipeline thanh toán/Zalo) có search_path mutable | advisor function_search_path_mutable |

### Vận hành / triển khai
| Fact | Evidence |
|---|---|
| **Toàn bộ hạ tầng DingTalk KHÔNG tồn tại trên prod** — 2 migration chưa chạy, trong khi `dingtalk_notifier.py`/`dingtalk_outbox_worker.py` đang modified trong working tree | `list_tables` không có `dingtalk_*`; pg_proc không có `fn_*_dingtalk_notify`; files: `backend/migrations/2026-06-26-dingtalk-tables.sql`, `2026-07-11-dingtalk-enterprise-robot.sql` |
| Outbox worker **gửi trước, mark sau** — không claim → Render zero-downtime deploy (2 instance song song) có thể double-send thông báo | `backend/dingtalk_outbox_worker.py:79-89` (verified: mark bằng `sent_at`, **không có cột status**) |

### Điểm gãy im lặng do cap 1000 rows PostgREST
| Fact | Evidence |
|---|---|
| **Webhook SePay/PayOS fetch TOÀN BỘ pending QR lines rồi scan Python** — pending >1000 là tiền về thật không match, phiếu kẹt vĩnh viễn, không error | `backend/sepay_routes.py:244-261`; `backend/payment_request_routes.py:1485-1496` |
| Dashboard đọc `crm_sales_data` 1 lần `.execute()` — 200 sale × 30 ngày = 6.000 dòng/tháng → KPI tính trên ~1/6 dữ liệu | `backend/dashboard_routes.py:1160-1169` (helper paginate đúng `fetch_crm_sales_rows` đã có tại `crm_metrics.py:657` nhưng không dùng) |
| BC03 + "Doanh thu thực thu" đọc `so_doanh_thu`/`don_hang` không paginate → undercount số báo cáo sếp | `backend/report_routes.py:236-244, 269-276`; `backend/dashboard_routes.py:482-490` |
| Active requests list không paginate + guard order_id trùng quét full-table → B3/B4 mất phiếu, order_id trùng lọt lưới khi AR >1000 | `backend/activation_routes.py:1530-1539, 390, 477, 521` |
| Ledger team-filter kéo tới 50k dòng full-column vào RAM mỗi page view — **bản sao chính xác pattern OOM 9/7** | `backend/revenue_routes.py:1296-1309, 574-584` |

### Index & query (pg_stat_statements đang bật)
| Fact | Evidence |
|---|---|
| `payment_requests` **không có index `created_at`** dù list query chính ORDER BY created_at DESC → **495.028 seq scan** vs 145.321 idx scan | pg_indexes + pg_stat_user_tables |
| RBAC app-layer bắn ~890k query không cache: 400.994 calls `nhan_su_sale WHERE email=$1` + 96.620 full-list + 393.006 đếm PR | pg_stat_statements top-20 |
| `count='exact'` chạy trên **MỌI** page request của loop load-all GĐ1 | `backend/payment_request_routes.py:1647` |
| 2 index **trùng hệt nhau** trên bảng lớn nhất (`crm_sales_data`, 20MB, ghi hàng ngày) + ~27 index unused toàn DB | advisor duplicate_index + unused_index |
| N+1 exchange rate: mỗi dòng ledger null tỷ giá = 1 query — trang 60 dòng có thể bắn 60 query | `backend/revenue_routes.py:775` (gọi từ `:742`) |
| 5 FK không index (bank_transactions.matched_payment_id, gateway_transactions.parent_txn_id, ...) | advisor unindexed_foreign_keys |
| Extension hữu ích **sẵn trong catalog nhưng chưa cài**: pg_trgm, unaccent, pg_cron, hypopg, index_advisor | `list_extensions` |
| PR id `lpad(seq,4,'0')` → PR thứ 10.000 sinh 5 chữ số, regex `PR-\d{4}-\d{4}` cứng sẽ rơi fallback | `payment_request_routes.py:1068` |

---

## 3. Quick wins tuần này (~2,5 ngày-dev + ~2h thao tác)

Tất cả đã sống sót qua judge panel; SQL chạy sandbox `pxgybyfiwywksesyogti` bằng `execute_sql` → `apply_migration` prod → `get_advisors`.

| # | Việc | SQL / file sửa | Effort | Nguồn practice |
|---|---|---|---|---|
| 1 | **Migration bảo mật**: ENABLE RLS `app_settings` (+ policy SELECT authenticated nếu FE đọc trực tiếp) + backup_20260620; siết 2 policy `USING(true)` về `TO service_role` | 1 file .sql | 45 phút | supabase SKILL Core Principle 5 + advisor CRITICAL |
| 2 | **Index đợt 1**: `CREATE INDEX payment_requests(created_at DESC)`; `DROP INDEX idx_crm_sales_date`; partial `payment_lines(transfer_code) WHERE status='pending'` | 1 file .sql | 20 phút | query-missing-indexes + query-partial-indexes + advisor duplicate_index |
| 3 | **Đảo hướng match webhook**: extract token `[0-9A-Z]{5}` từ content → `.in_('transfer_code', tokens).eq('status','pending')` | `sepay_routes.py:244-261`, `payment_request_routes.py:1485-1496` | 0,5 ngày | Đồng thuận cả 3 lens — diệt điểm gãy nghiệp vụ sống còn |
| 4 | **Vá 4 chỗ cap-1000** bằng helper CÓ SẴN: `fetch_crm_sales_rows` + `fetch_rows_capped` | `dashboard_routes.py:1160, 482`; `report_routes.py:236, 269` | 0,5 ngày | queries findings HIGH; hạ tầng paginate đã tồn tại trong repo |
| 5 | **CAS claim outbox** (spec đã sửa qua judge): `UPDATE next_retry_at=now()+120s WHERE id=x AND sent_at IS NULL AND (next_retry_at IS NULL OR next_retry_at <= now())` → kiểm row trả về mới gửi. Áp cả zalo + dingtalk worker. **Lưu ý: bảng KHÔNG có cột status** | `dingtalk_outbox_worker.py:79-89` + zalo worker + tests | 0,5 ngày | lock-skip-locked (CAS lease) — bản duy nhất khớp schema thật |
| 6 | `count='exact'` **chỉ khi offset==0** | `payment_request_routes.py:1647` | 1-2h | planrev gd1_gap #1 |
| 7 | **Áp 2 migration DingTalk lên prod** đúng thứ tự (06-26 → 07-11) TRƯỚC khi deploy code; export CSV + DROP 2 bảng backup sau khi chị Hiền xác nhận | thao tác MCP | ~45 phút | schemaInfo finding HIGH |
| 8 | Batch `ALTER FUNCTION ... SET search_path = public, pg_temp` cho 23 function | 1 file .sql (generate từ advisor) | 1h | advisor function_search_path_mutable |
| 9 | **Diệt N+1 exchange rate**: load bảng nhỏ 1 lần thành dict date→rate | `revenue_routes.py:775, 742` | 2-3h | data-n-plus-one |

Thủ tục cố định từ nay: **mỗi migration xong phải chạy `get_advisors`** (2 phút) — 0 finding mới thì mới coi là xong.

---

## 4. Vá GĐ1 + sửa plan GĐ2 (nhập TRƯỚC khi GĐ2 khởi công)

### Vá GĐ1 (đã merge main) — ~1,5 ngày-dev
1. **Trần concurrency 4-6 request** song song + retry backoff jitter (thay retry-ngay-1-lần); trang fail 3 lần → giữ trang đã nạp + banner "tải lại", không để list trống toàn bộ.
2. **Guard silent-truncate**: chunk `in_()` trả về đúng 1000 rows → **loop `.range()` nội bộ lấy nốt** (không phải tách chunk 50 — judge bác vì PR trả góp 20-50 line vẫn vượt trần) + log ERROR server-side.
3. **Single-flight + debounce 2s cho `loadData()`** — poll 30s, realtime 3 bảng, refetch-on-focus đi chung 1 guard. *Bắt buộc deploy trước backfill GĐ2* (mitigation bão realtime).
4. **Thay `console.warn` total>1500** bằng telemetry BE (log JSON + ghi bảng `notifications` throttle 1 lần/ngày; nối DingTalk outbox sau khi migration #7 đã áp). Không dùng zalo_outbox làm kênh ops (judge bác — kênh nghiệp vụ khách hàng).

### Sửa plan GĐ2 (10 điểm, giữ kiến trúc recompute **app-layer** — KHÔNG đổi sang trigger DB)
1. **5 cột aggregate add NULLABLE + FE fallback-if-null** (null → tự tính từ payments như cũ) — xóa cả class lỗi thứ-tự-deploy Vercel/Render (KPI sập về 0), đồng thời là rollback path. *Graft từ ops-first, cả 3 judge khen.*
2. **Thêm cột thứ 6: `referral_status`** (ghi tại mutation active_requests) — nếu không, nhánh slim vẫn parse `uids_data` per-request = hotspot mới trên Render.
3. **Thêm cột thứ 7: `search_text`** — ghi ngay tại recompute GĐ2 bằng **MỘT hàm normalize Python duy nhất** (cùng hàm dịch param `q` sau này; không dùng unaccent SQL → né rủi ro lệch đ→d/NFD). Backfill search_text chạy Python batch. GĐ3 chỉ còn việc `CREATE INDEX`. *Graft từ api-first — tiết kiệm nguyên 1 vòng backfill.*
4. **Backfill set-based batched**: `UPDATE ... WHERE id IN (SELECT ... WHERE done_count IS NULL LIMIT 500)` loop tới hết (resume tự nhiên) + `ANALYZE payment_requests` cuối + **script bắt buộc in project-ref và confirm** trước khi ghi. Chạy off-hours. Lưu ý judge sửa fact: set-based **vẫn bắn event realtime per-row** — vì vậy single-flight FE (vá GĐ1 #3) phải deploy trước.
5. **Recompute chỉ UPDATE khi giá trị thực đổi** (so sánh trước khi ghi) — chặn realtime event no-op. *Graft từ db-first.*
6. **Parity pg_cron nightly nằm TRONG scope GĐ2** (không đợi GĐ3): so cột aggregate vs SUM(payment_lines), mismatch → bảng drift + alert qua outbox. Cài pg_cron ngay. Đây là lưới đỡ thay cho trigger DB đã bị bác.
7. **Golden fixture bổ sung 2 case hổng**: (a) line `status=paid + cancelled=true` (khối cộng display_received hiện nằm NGOÀI `if not cancelled` — phải chốt semantics FE=BE trước backfill); (b) 'hủy' NFC vs NFD.
8. **Field tường minh `format: "slim"|"full"`** trong response + TypeScript union type — thay hidden contract `raw.payments === undefined`. *Graft từ db-first.*
9. **Gộp index vào migration GĐ2** (1 lần deploy): `(created_at DESC, id DESC)` cho keyset GĐ3; partial `(created_at DESC) WHERE has_pending_qr = true` cho poll QR; 2 FK index bank/gateway. Mọi function mới kèm REVOKE EXECUTE + SET search_path; ADD CONSTRAINT bọc DO-block idempotent.
10. **Thứ tự deploy**: migration → backfill → FE (nhưng nhờ #1, thứ tự sai cũng không sập).

---

## 5. GĐ3 — thiết kế được chọn

**Bản thắng: ops-first** (2/3 judge chấm nhất — điểm mạnh: thứ tự đúng, rollback từng bước tính bằng phút, trigger có lead-time, estimates trung thực). **Graft**: search_text-từ-GĐ2 + normalize-1-implementation + diff-search-trước-khi-bật (api-first); format-field + index-gộp (db-first); step 8 mở rộng phủ đủ 6 endpoint (db-first). **Bỏ khỏi bản gốc ops-first**: soft-archive `archived_at` (thay bằng date-window filter), CAS spec cũ (đã sửa ở quick win #5).

**Tư tưởng**: đảo mô hình từ "kéo hết về client/Python rồi tính" sang "Postgres tính, app chỉ đọc kết quả". Không hạ tầng mới ngoài extension sẵn trong catalog Supabase.

### Trigger kích hoạt (đo bằng telemetry từ vá GĐ1, không phải cảm giác)
Bắt buộc khởi động steps 2-6 khi chạm **BẤT KỲ**:
- Tổng PR ≥ **4.000** (~40% trần GĐ2, chừa 2-3 tháng dev; hạ xuống 2.500 nếu số user tăng gấp đôi — tải nhân theo user × mutation, không chỉ theo PR)
- p95 load list > **3s** hoặc payload 1 lượt nạp > **4MB gzip**
- Render RAM p95 > **70%** (~358MB) kéo dài 7 ngày
- Nhóm query list PR lọt **top-3** total_exec_time trên pg_stat_statements

**Không chờ trigger**: Step 0, Step 1, Step 7 (đang sửa lỗi hiện hữu, không phụ thuộc scale).

### Steps

| # | Step | Effort | Prereq |
|---|---|---|---|
| 0 | **Seed sandbox 10k PR + 30-40k lines sao PHÂN BỐ THẬT từ prod** (5% PR có 15-30 line trả góp, tỷ lệ cancelled thật); cài hypopg/index_advisor; EXPLAIN (ANALYZE, BUFFERS) 6 query nóng; snapshot pg_stat prod làm baseline rồi reset | 1 ngày | GĐ2 chạy trên sandbox |
| 1 | **RBAC cache in-process** TTL 120s (dict + timestamp, không thêm lib) cho roster `nhan_su_sale` + `visible_creator_emails()`; invalidate tại admin routes mutate nhân sự. Cắt ~890k calls/tuần | 1 ngày | Không — làm ngay |
| 2 | **List v2 keyset**: cursor (created_at, id) qua `.or_()` PostgREST + filter state/date/sale/q server-side; index `(created_at DESC, id DESC)` đã có từ GĐ2. Composite `(state, created_at)` **chỉ thêm nếu EXPLAIN sandbox chứng minh** (judge bác việc thế chỗ index keyset). Verify cú pháp supabase-py hiện hành trước khi viết | 3 ngày | Step 0; GĐ2 merged |
| 3 | **Search server-side**: chỉ còn `CREATE INDEX gin_trgm_ops` trên search_text (đã ghi từ GĐ2) + `.ilike('%q%')`; **chạy diff kết quả search client-cũ vs server-mới trên data prod** trước khi bật | 1 ngày | Step 2 |
| 4 | **Summary RPC**: 1 function `COUNT(*) FILTER`/SUM trên cột aggregate GĐ2, trả toàn bộ bucket/chip/KPI trong 1 round-trip; REVOKE + search_path cùng migration; golden fixture khóa semantics; kèm watermark `updated_at` trong list + summary để FE phát hiện lệch | 2 ngày | Step 2, fixture GĐ2 |
| 5 | **FE server-driven sau flag 2 chiều** `VITE_PR_LIST_MODE=server\|load-all` (rollback = đổi env Vercel ~2 phút); page 50 dòng, không cần virtualization; **gỡ mode load-all sau 2 tuần, ticket hẹn ngày ngay khi merge** | 3 ngày | Steps 2-4 |
| 6 | **Realtime patch-row + poll rẻ**: event → GET detail → patch 1 row + debounce/jitter/coalesce; poll QR 30s → endpoint `pending-qr-ids` (index-only scan trên partial index GĐ2, vài chục byte); heartbeat reconnect → refetch trang hiện tại | 3 ngày | Step 5 |
| 7 | **Dashboard + BC01-03 + ledger xuống RPC** (mẫu `get_top_sales` có sẵn): revenue_summary, dashboard_qr_collected (JOIN thay loop O(lines×staff)), ledger team filter `.eq('team')` dùng index sẵn — Python chỉ đọc kết quả. Xóa vĩnh viễn hình dáng OOM 9/7 | 3 ngày (tách 3 task × 1 ngày, 3 dev song song) | Step 0; **không chờ trigger** |
| 8 | **Convention rollout đủ 6 endpoint**: (a) AR paginate + slim + chunk `_chunked`; (b) guard order_id → bảng phẳng `ar_course_order_ids(order_id UNIQUE)` — constraint là guard tuyệt đối, hết race; (c) invoice m3/m4 limit + date-range 90 ngày; (d) gateway dedup `.in_('payment_line_id', line_ids)` + counts exact; (e) `/payos/transactions` RBAC trước limit; (f) invoice_reminders lưu `requested_by_email`, bỏ `list_users()`. Kèm audit regex `PR-\d{4,}` + test seed sequence 9999 | 3 ngày (2 PR) | Step 2 (convention mẫu) |
| 9 | **Data lifecycle nhẹ**: default date-window filter 6 tháng server-side (UI "Xem tất cả") — **0 schema change, thay soft-archive bị bác**; nhân rộng cron retention 30 ngày sang dingtalk_outbox + notifications đã đọc | 1 ngày | Step 5 |
| 10 | **Ops guardrails** (chạy SONG SONG từ step 2): middleware p95 + payload log 5 endpoint nóng; Render mem alert (/healthz RSS + notification native); runbook rollback từng step (flag FE, DROP INDEX, cron.unschedule); checklist migration cố định | 2 ngày | Không |

**Tổng ~20 ngày-dev** trên team 3 dev, mọi task ≤3 ngày. Steps 1, 7 làm được ngay sau GĐ2 ổn định.

---

## 6. Monitoring & ngưỡng

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

## 7. Những gì KHÔNG làm (đồng thuận judge panel — để khỏi bàn lại)

1. **Trigger DB thay recompute app-layer** (db-first) — cả 3 judge bác: nhét regex 'hủy' tiếng Việt + freeze-cancelled + parse jsonb vào plpgsql tạo implementation **thứ 3** phải parity vĩnh viễn, còn lặng lẽ đổi hành vi freeze-cancelled so với plan GĐ2 đã duyệt; fixture 3 chiều buộc CI phụ thuộc sandbox live (flaky). App-layer + parity cron nightly = ~90% giá trị, 10% rủi ro.
2. **Soft-archive `archived_at` + cron + partial index toàn hệ** — over-engineering ở 10k rows/năm; trap tự thừa nhận: endpoint nào quên khai báo archived-scope là sai số báo cáo tài chính im lặng. Thay bằng date-window filter (GĐ3 step 9). Xem lại khi ≥50-100k rows.
3. **CAS claim bằng `.eq('status','pending')`** — sai schema (outbox không có cột status); và spec ops-first gốc thiếu predicate `next_retry_at` → vẫn double-send. Dùng bản đã sửa ở quick win #5.
4. **unaccent SQL cho search_text** — đ là chữ cái riêng, rủi ro lệch normalize JS (commit 6e0c49d). Một hàm Python duy nhất cho cả ghi lẫn query.
5. **Ghép tên sale vào search_text** — join ngoài bảng = stale ngay khi đổi tên trong `nhan_su_sale`; tìm theo sale dùng filter `sale_email` sẵn có.
6. **Composite `(state, created_at, id)` thế chỗ index keyset** — vi phạm leftmost-prefix: view "tất cả" (phổ biến nhất) không dùng được. Giữ `(created_at DESC, id DESC)`; composite state chỉ khi EXPLAIN chứng minh.
7. **Partial index `payment_lines(status, created_at) WHERE status='pending'`** — cột status trong key là dead weight (predicate đã cố định); dạng đúng: `(created_at) WHERE status='pending'` / partial `has_pending_qr` trên payment_requests.
8. **ETag/304 cho detail endpoint** — defer: đường nóng là GET-sau-event nên row vừa đổi, ETag gần như luôn miss; sửa bằng điều-kiện-hóa effect hydrate. Xem lại khi có số đo hotspot.
9. **Bảng snapshot pg_stat hằng tuần + endpoint telemetry realtime riêng** — monitoring không ai đọc là gánh nặng thuần với team 3 dev; review tay đầu tháng đủ.
10. **Ops alert qua zalo_outbox** — kênh nghiệp vụ khách hàng, nhét ops alert dễ sinh lỗi con đúng chỗ nhạy nhất. Dùng `notifications` / dingtalk_outbox (sau khi migration đã áp).
11. **Sentinel "tách chunk 50 retry"** — không deterministic; dùng loop `.range()` nội bộ.
12. Partition, đổi PK UUIDv7, advisory lock, GIN jsonb, declarative schemas — đã loại từ khảo sát (not_applicable), giữ nguyên kết luận.

---

## 8. Lộ trình theo mốc

| Mốc | Việc | Hạ tầng |
|---|---|---|
| **Hiện tại (190 PR)** | Quick wins tuần này (mục 3) + vá GĐ1 (mục 4). Nhập 10 sửa đổi vào plan GĐ2, duyệt lại rồi mới khởi công | Plan hiện tại thừa; DB <50MB |
| **~1.000 PR** (dự kiến vài tháng) | GĐ2 (bản đã sửa) ship: 7 cột + slim + detail endpoint + backfill batched + **parity cron chạy từ ngày đầu**. GĐ3 Step 1 (RBAC cache) + Step 7 (RPC báo cáo) làm luôn — sửa lỗi hiện hữu | Không đổi plan; DB <100MB |
| **~3.000-4.000 PR** (trigger) | GĐ3 Steps 0, 2-6: seed đo đạc → list keyset → search server → summary RPC → FE flag → realtime patch-row. Gỡ mode load-all sau 2 tuần ổn định | Supabase Pro + Render 512MB **đủ**; DB ~300-500MB |
| **5.000-10.000 PR** | GĐ3 Steps 8-10 hoàn tất: convention 6 endpoint + date-window + guardrails. Dọn index unused theo pg_stat_user_indexes. Audit regex PR-id trước khi sequence chạm 9999 | DB ~1GB; **không nâng plan nào nếu thiết kế được thực thi** — mọi đề xuất nâng plan phải kèm số đo chứng minh đã tối ưu hết (tiêu chí 3) |

**Điều kiện ràng buộc xuyên suốt**: (1) mọi thay đổi có đường lùi tính bằng phút (env flag / DROP INDEX / cron.unschedule / UPDATE đảo); (2) mọi migration đi sandbox → advisors → prod; (3) trigger GĐ3 bám số đo, không bám cảm giác — đó là khác biệt duy nhất giữa "nâng cấp theo kế hoạch" và "lặp lại sự cố 9/7".