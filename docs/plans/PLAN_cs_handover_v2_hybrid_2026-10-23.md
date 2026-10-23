# PLAN — Sale→CS handover v2: hybrid upsert (append + match), trigger lúc báo đơn

Người soạn: Minh (+Claude) · Ngày: 23/10/2026 · Trạng thái: ĐÃ DUYỆT 23/10 — G1–G5 xong, G6 dry-run OK (xem §7) · Áp dụng: CẢ 4 team (Offline / HCM / IH1 / IH2)

## 0. Quyết định nền (thay thế note 16/10 "chỉ khi có Order ID")
- Tín hiệu hoàn thành của **bàn giao** = sale điền đủ 3 ô (Kênh chăm sóc, Contact ID, Note) **lúc báo đơn (B3)**. KHÔNG chờ order_id / kích hoạt CRM. (order_id vẫn là tín hiệu hoàn thành của *tạo gói* — learning `bao-don-completion-signal-order-id.md` giữ nguyên cho phạm vi đó; sửa câu "chỉ khi có Order ID" trong memory + plan cũ.)
- App **append** dòng mới khi sheet chưa có đơn; **match + điền ô trống** khi team đã điền; trùng (app + team) → giữ dòng "đầy đủ hơn" theo quy tắc §1 G4-T2.
- Nguồn sự thật dedup/claim = bảng DB `cs_handover_log` (KHÔNG dùng cờ trong JSONB `uids_data` nữa).

Bằng chứng lỗi hiện tại (23/10):
- AR-1740 push đôi: worker 03:50:16 + hook per-course 03:50:18 → 2 dòng y hệt 854/855 tab " Bàn giao KH gia hạn" IH1.
- AR-1731: dòng app bị team đè 4 phút sau (3564 mất UID, U=09:29 vs push 09:24).
- AR-1701: app lưu NET 17.778.324, team ghi 17.820.000 → match theo tiền sai.
- 6 course care=NULL (1652/1694/1701/1706/1715/1724) bị đẩy dòng rỗng handover khi order_id được điền sau deploy.
- App ghi Sale = full name → sheet báo "Không hợp lệ" (dropdown mã ngắn).
- Dòng app rơi xuống **dưới khoảng trống lớn** (Ms Trinh 23/10, 84-377422233): `_next_empty_row` = `len(values)+1` → 1 ô dropdown "Und…" nháp ở cột N phía dưới kéo điểm append xuống; team luôn điền ngay sau dòng dữ liệu cuối → app và team lệch vị trí, khó thấy, góp phần sinh trùng.

Learnings áp dụng: `dual-channel-race-match-only-pending.md` (mọi kênh phải có nhánh "đã được kênh khác xử lý"), `outbox-snapshot-stale-mutable-asset.md` (re-fetch nguồn sự thật lúc ghi), `gsheet-append-protected-column.md` (né cột khoá, không append INSERT_ROWS).

## 1. Milestones & tasks

### G1 — Chống race + nguồn sự thật mới (P0)
- G1-T1 Migration `backend/migrations/2026-10-23-cs-handover-log.sql`: tạo bảng `cs_handover_log` (§2) + **seed** từ JSONB cũ (course có `handover_pushed_at` → status=done) để KHÔNG re-push 19 course đã đẩy.
- G1-T2 Module mới `backend/cs_handover_store.py`: `claim(sb, course_code, ar_id, team, sheet, tab) -> bool` (INSERT … ON CONFLICT DO NOTHING; reclaim khi `status='claimed'` và `claimed_at` > 10 phút), `mark(sb, course_code, status, **fields)`, `fetch_statuses(sb, course_codes) -> dict`.
- G1-T3 `backend/cs_handover_sheet.py:556` `maybe_push_cs_handover(sb, ar_row, course_code)` → chữ ký mới `maybe_push_cs_handover(sb, ar_ref, course_code)`: `ar_ref` = str id **hoặc** dict; luôn **re-fetch AR mới** từ DB trước khi làm. Thứ tự: gate → claim (DB) → ghi sheet → mark. Không claim được → outcome `claimed_elsewhere`, không ghi.
- G1-T4 Bỏ mọi ghi JSONB từ handover: xoá `_set_course_ts` / `_mark_handover_pushed` (`cs_handover_sheet.py:428-441`) + cờ `l8_order_pushed_at`; dedup đọc `cs_handover_log`.
- G1-T5 3 điểm hook `backend/activation_routes.py` (2945, 2988 full-PATCH; 3305 per-course): truyền `ar_id` (str) thay vì `row`/`merged` để hàm tự re-fetch.
- G1-T6 Hook mới lúc **báo đơn**: `activation_routes.py:3144-3148` (ngay sau `_sync_ledger_courses_from_uids`) → với mỗi course trong `saved["uids_data"]` có handover → `maybe_push_cs_handover(sb, saved["id"], code)` (non-fatal). Đường `POST …/append` (3150, báo đơn bổ sung) KHÔNG hook (không thu 3 ô — chấp nhận).

### G2 — Gate + khoá match đúng (P0/P1)
- G2-T1 `maybe_push` bỏ gate `if not _course_order_id(course)` (572) và `if course.get("handover_pushed_at")` (574); thêm gate `has_handover = care_channel or care_contact_id` → false ⇒ mark `skipped_no_handover`, không đụng sheet.
- G2-T2 Khoá match mới, helper `_match_key_rows(header, rows, *, phone_intl, child_name, uid, amount) -> list[int]`: **phone9** (9 số cuối sau `re.sub(r"\D","")`) **+ tên bé** (fold dấu, lower, bỏ tiền tố "bé/be/con/anh/chị"); tiebreak 1 = UID nếu dòng có UID; tiebreak 2 = tiền ±3% (`_amount_key`); vẫn ≥2 ⇒ `ambiguous` (không ghi).
- G2-T3 `_FIELD_HEADERS` (54) thêm `"app_order_id": ["App Order ID"]`; append luôn ghi marker = `course_code` (cột cuối tab, G5-T1). IH2 L8: `backend/cs_l8_order.py:134,153,175-257` đổi `order_id` → `course_code` làm W (đọc chấp nhận legacy W = order_id CRM).

### G3 — Upsert cho IH1 / Offline / HCM (thay append-only)
- G3-T1 Nhánh append-team trong `maybe_push`: đọc tab (A..cột cuối) **1 lần** → `_match_key_rows` → **1 khớp** ⇒ `_fill_empty_cells(sheet_row, {Kênh liên hệ, Contact ID, Ghi chú/Note (ô sale, match đầu tiên), UID})` CHỈ ô trống → mark `matched`; **0 khớp** ⇒ `_append_row` (258) + marker → mark `appended` + `sheet_row`; **≥2** ⇒ `ambiguous`.
- G3-T2 Verify-after-write: ngay sau append đọc lại `sheet_row` kiểm marker; lệch ⇒ mark `verify_failed` (worker xử lại như chưa push → sẽ match vào dòng team nếu họ đã đè).
- G3-T3 Dropdown-aware: đọc `dataValidation` cột Sale + Kênh liên hệ của tab (ONE_OF_LIST / ONE_OF_RANGE; cache 1h; kiểm theo dải dòng vì DV có thể không áp cả cột). Sale = mã ngắn từ TVTS List 2 cột J (bỏ tiền tố `"XX - "`) nếu ∈ list, else full name; Kênh = giá trị list khớp case-insensitive/strip (`zalo `→`Zalo`, `Kakao`→`Kakao Talk` nếu có), else ghi nguyên.
- G3-T4 **Neo "hàng trống kế tiếp" theo cột dữ liệu**, thay `_next_empty_row` (`cs_handover_sheet.py:245`, `len(values)+1`): `last_data_row` = dòng cuối có bất kỳ ô **khoá** non-empty (Tên KH / SĐT KH / UID — các cột BẮT BUỘC ĐIỀN, map theo header); target = dòng đầu tiên > `last_data_row` mà **mọi cột app sở hữu đều trống** (bỏ qua ô nháp ở cột không sở hữu như Tạo nhóm/N). Không bao giờ ghi vào dòng ≤ header. Áp dụng cho cả `_append_row` (3 team) và `_append_l8` (`cs_l8_order.py`). Giữ nguyên fix cũ "không dùng `append` API" (bẫy ghi vào row 1 do merged banner).

### G4 — Reconcile trùng (worker, quét sheet)
- G4-T1 `backend/cs_handover_reconcile_worker.py`: mỗi tick, với mỗi tab có route: đọc **1 lần** (cache per tick); lấy dòng có "Ngày bàn giao" trong 14 ngày (fallback 400 dòng cuối); nhóm theo (phone9, tên bé); nhóm có ≥1 dòng **có marker** + ≥1 **không marker** ⇒ ứng viên trùng.
- G4-T2 Quy tắc giữ: điểm CS = số ô có data trong cột CS-owned (GVCN, Tình trạng chăm sóc, Ngày tiếp nhận, Tạo nhóm GV, Ghi chú-CS). Dòng marker **điểm CS = 0** ⇒ merge ô handover (fill-empty) vào dòng team → re-read xác nhận marker còn đúng → `deleteDimension` dòng marker → mark `merged`. Dòng marker **có CS data** ⇒ KHÔNG xoá, mark `dup_manual` + log (người xử).
- G4-T3 Worker filter (73-75): bỏ `_course_order_id(c)`; pending = có handover AND (chưa có log OR status ∈ {not_found, verify_failed, pending_retry}); lookback 14 ngày giữ nguyên; lịch phân tầng giữ nguyên.

### G5 — Sheet ops + dọn dữ liệu
- G5-T1 Thêm header "App Order ID" ở **cột trống cuối** 4 tab: IH1 "Bàn giao KH mới" (sau X), IH1 " Bàn giao KH gia hạn" (sau N), Offline, HCM (đọc header lúc làm; R2 21/10 đã cho phép thêm cột cuối). Team 2 không cần (tab bàn giao là QUERY; marker IH2 = W trên L8). Báo Chung: sync BQ đọc theo tên cột, không ảnh hưởng.
- G5-T2 Script `backend/scripts/cs_handover_cleanup_20261023.py` (dry-run mặc định, `--apply` mới ghi): xoá IH1 gia hạn dòng 855 (xác minh ≡ 854); audit AR-1694 / AR-1724 (dòng app có bị đè?) → báo cáo.
- G5-T3 Sau deploy: chạy worker 1 vòng; kiểm `cs_handover_log` không có `appended` cho 19 course seed.
- G5-T4 **Dời dòng app rơi dưới khoảng trống** (cùng script G5-T2, dry-run): với mỗi tab route, tìm dòng có dữ liệu nằm sau ≥5 dòng trống liên tiếp kể từ `last_data_row` (theo cột khoá) và có dấu hiệu app (Ngày bàn giao ≥ 22/10 + đúng SĐT một course trong `cs_handover_log`/JSONB cũ) → copy toàn bộ ô có giá trị lên `last_data_row+1` (chỉ ô trống đích), xác minh đọc lại, rồi xoá dòng cũ. Đã biết: Ms Trinh 84-377422233 (IH1 "Bàn giao KH mới"). Báo lại Ms Trinh sau khi dời.

### G6 — Test + verify
- G6-T1 Unit mới `backend/tests/test_cs_handover_v2.py`: phone9 + child-norm; `_match_key_rows` (1/0/≥2, tiebreak UID, tiền ±3%); fill-empty không đè; claim ON CONFLICT (fake sb); worker filter không cần order_id; reconcile (marker CS=0 → merged; có CS → dup_manual); dropdown map; L8 W=course_code + legacy order_id.
- G6-T2 Sửa test cũ: `test_cs_handover_sheet.py` TestOrchestration (dedup qua log, không JSONB); `test_cs_l8_order.py` (course_code).
- G6-T3 Dry-run đơn thật mỗi team (flag `dry_run=True` xuyên suốt) trước khi bật.

## 2. Bảng `cs_handover_log`
```sql
create table if not exists cs_handover_log (
  course_code text primary key,
  ar_id text not null,
  team text, spreadsheet_id text, tab text,
  status text not null default 'claimed',
  -- claimed|appended|matched|merged|done|not_found|ambiguous|verify_failed|dup_manual|skipped_no_handover|pending_retry|failed
  marker text, sheet_row int, l8_status text,
  claimed_at timestamptz not null default now(),
  pushed_at timestamptz, updated_at timestamptz not null default now(),
  attempts int not null default 0, last_error text
);
create index if not exists idx_cs_handover_log_status on cs_handover_log(status);

-- seed: course đã đẩy theo cơ chế cũ → done (không re-push)
insert into cs_handover_log(course_code, ar_id, status, pushed_at, marker)
select c->>'code', ar.id, 'done', (c->>'handover_pushed_at')::timestamptz, c->>'code'
from active_requests ar
cross join lateral jsonb_array_elements(ar.uids_data) ub
cross join lateral jsonb_array_elements(ub->'courses') c
where c->>'handover_pushed_at' is not null
on conflict (course_code) do nothing;
```
Claim = `insert … on conflict (course_code) do nothing returning course_code` → rỗng = kênh khác đang giữ (nhánh "đã được kênh khác xử lý"). Reclaim = `update … set claimed_at=now(), attempts=attempts+1 where course_code=? and status='claimed' and claimed_at < now()-interval '10 min'`.

## 3. Guardrail
- Không bao giờ đè ô team đã có data; không xoá dòng có CS data; không ghi JSONB `uids_data` từ code handover.
- Mọi ghi sheet đi SAU claim DB; mọi hook re-fetch AR; worker + hook chạy song song an toàn nhờ ON CONFLICT.
- Match: phone9 + tên bé; ≥2 ⇒ không đoán. Tiền KHÔNG là điều kiện cứng (đơn thẻ NET ≠ niêm yết).
- Pre-feature (không handover) ⇒ `skipped_no_handover`, không đẩy dòng rỗng. Báo đơn bổ sung ⇒ không hook (chấp nhận).
- 3 team đang live: nâng append→upsert, giữ `_append_row` + `_protected_cols` + `_next_empty_row`; IH2 giữ L8 upsert + bàn giao match.
- Sửa handover trên app sau khi push: KHÔNG sync lại (chấp nhận, ghi rõ trong HDSD).
- Vị trí append: luôn ngay sau dòng dữ liệu cuối (neo cột khoá), KHÔNG neo theo ô nháp lẻ ở cột khác; sau append đọc lại xác minh `sheet_row` (G3-T2). SLA: điền **ngay lúc báo đơn** qua hook G1-T6; worker chỉ là dự phòng/dọn.

## 4. Rollout
1) Merge + apply migration (bảng + seed) → 2) deploy BE (worker đang ON) → 3) kiểm log: không re-push 19 course → 4) G5-T1 thêm cột marker 4 tab → 5) dry-run 1 đơn / team → 6) theo dõi 1 ngày làm việc → 7) G5-T2 dọn (855, 1694/1724).

## 5. Verify
- `python -m py_compile backend/cs_handover_sheet.py backend/cs_handover_store.py backend/cs_handover_reconcile_worker.py backend/cs_l8_order.py backend/activation_routes.py` → OK.
- Shim runner: `tests/test_cs_handover_v2.py` + `test_cs_handover_sheet.py` + `test_cs_l8_order.py` → 0 failed.
- Prod: log `[cs_handover] … appended|matched|merged`, không còn 2 dòng `pushed` cho cùng course; `select status, count(*) from cs_handover_log group by 1`.

## 7. Thực hiện 23/10 (sau duyệt)
- G1–G4 code xong, 103 test pass (shim runner). Khác plan: `skipped_no_handover` KHÔNG ghi row (sẽ chặn vĩnh viễn khi sale điền Kênh sau); thêm status `held` (người vận hành giữ). Khoá match mở rộng: {SĐT, Contact ID} hai phía ∩ (AR-1731 team ghi SĐT = số Zalo).
- G5 đã làm trên sheet thật: migration + seed 21 course `done`; header "App Order ID" 4 tab (IH1 KH mới đặt X thay header giả "Column 3", gia hạn O, Offline W, HCM V); IH1 gia hạn: STT điền sẵn tới 847 là lý do app rơi xuống 848+ → xoá 855 (≡854), merge 851→526, dời 6 dòng lên 527–532; KH mới: dời 3599→3567 (Ms Trinh); 5 ô Sale đổi sang mã dropdown. Audit 1694/1724: không còn dòng app trùng.
- G6 dry-run đơn thật (`scripts/cs_handover_dryrun.py --fresh --dedup`): IH1 gia hạn append 533 Sale=ThanhHT; 527/3567 → matched; IH2 L8 appended + bàn giao; dedup 0 cặp. AR-1736 (contact "ewf"/"4t6") giữ `held` chờ Minh.
- Offline/HCM chưa có đơn nào điền Kênh/Contact từ 21/10 → chưa dry-run được nhánh thật; theo dõi sau deploy.

## 6. Phân bổ
Fable inline (logic chéo 6 file + migration + sheet ops, đụng feature đang live) — không delegate Sonnet. Làm theo thứ tự G1 → G2 → G3 → G4 → G6 → G5, verify sau mỗi G.
