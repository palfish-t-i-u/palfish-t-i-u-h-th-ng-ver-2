# PLAN — Bảng phụ `gmv_ledger_order_id` nhảy theo `gmv_ledger` (2026-10-03)

> Mục tiêu 1 câu: bảng phụ `raw.gmv_ledger_order_id` đang dựng lại **1 lần/ngày (9h10)** rồi
> đông cứng → đổi thành **khớp lại mỗi 10 phút**, để đơn mới trong ngày có `order_id` sớm thay
> vì chờ sáng mai — **không tốn thêm phí BigQuery, không mất GRANT, không phá đơn app**.
>
> Yêu cầu gốc (Chung, Zalo 3/10): "khi gmv ledger thay đổi thì bảng phụ cũng cập nhật lại 1 lần
> (không quan tâm REM real-time), chậm hơn chút cũng được."

---

## ĐỌC TRƯỚC KHI LÀM (chống context-loss)

**Ai làm:** Phạm Anh Minh hoặc Chung (có quyền SSH ECS). Claude **không SSH được** (classifier chặn) —
mọi lệnh server do người chạy. Claude chỉ soạn diff + review.

**Server:** ECS Eric `47.237.174.122` (giờ CST = VN+1), Postgres `pf_raw` schema `raw`, SSH key `ecs.pem`.
Scripts ở `/root/etl/`. Cron ở crontab root (giờ CST).

**File phải mở lại trên server trước khi sửa (ground truth):**
1. `/root/etl/match_order_id.py` — dựng bảng phụ (khớp allfile × REM).
2. `/root/etl/build_gmv_intermediate.py` — dán order_id từ bảng phụ vào `gmv_ledger` (mỗi 2 phút).
3. `crontab -l` (root) — xem 2 dòng cron của 2 file trên + lịch REM.

**Invariant TOP phải giữ (chi tiết mục GUARDRAILS):**
- GRANT SELECT bảng phụ cho `da_viewer` (Chung) + `eric_reader` (Eric) **không được mất**.
- Đơn **app** (`confidence='app_crm'`) giữ nguyên order_id, không bị khớp đè/xóa.
- Phí BigQuery **không tăng** (REM vẫn chỉ đọc 6h/lần, không đọc mỗi lần khớp).

**STOP — dừng và hỏi nếu:**
- Code thực trên server **khác** snippet giả định trong plan (drift) → dừng, báo, không sửa mù.
- `match_order_id.py` đang nạp allfile **trực tiếp từ Google Sheet** (xem B0-Q1) — nếu vậy chạy
  10 phút/lần sẽ đụng rate-limit Sheet API → đổi approach, hỏi trước.
- Sau khi bật, 1 lần khớp chạy **> 60 giây** → giãn nhịp (mục Rollback), hỏi.

---

## B0 — GROUND TRUTH phải xác minh trên server (làm TRƯỚC, chép kết quả vào đây)

Local chỉ có `data/_patch_bangphu_0210.py` (lộ code OLD/NEW của 2 file sau patch 2/10). Các điểm sau
**chưa chắc**, phải mở file thật xác nhận:

| # | Câu hỏi cần trả lời (mở file đọc) | Vì sao quan trọng |
|---|-----------------------------------|-------------------|
| Q1 | `match_order_id.py` nạp **allfile (`grec`)** từ đâu? Từ `raw.gmv_ledger` (Postgres) hay gọi Google Sheet API? | Nếu từ Postgres → chạy 10′/lần rẻ, OK. Nếu từ Sheet API → **STOP**, rate-limit. |
| Q2 | Đoạn **query REM** nằm ở đâu trong `match_order_id.py`? Nó query BigQuery (`sa.json`, dataset `remaining_lesson_vn`) hay đã đọc bảng local? | Để tách ra `refresh_rem_cache.py`. |
| Q3 | Bảng phụ hiện dựng bằng **DROP+CREATE** hay TRUNCATE? Chép nguyên câu lệnh tạo bảng + GRANT. | Phải đổi sang TRUNCATE để giữ GRANT. |
| Q4 | `crontab -l` root: dòng cron của `match_order_id.py` (giả định `10 10 * * *` = 9h10 VN) và `build_gmv_intermediate.py` (giả định `*/2`). Chép nguyên. | Để sửa lịch đúng. |
| Q5 | Lịch REM sync về (6h/lần?) — xem note Fivetran→BQsync. REM thực đổi mấy lần/ngày? | Chốt nhịp cache REM. |

**Lệnh gợi ý (người chạy):**
```bash
ssh -i ecs.pem root@47.237.174.122
sed -n '1,80p' /root/etl/match_order_id.py      # tìm chỗ nạp grec + query REM
grep -n "sheet\|gspread\|bigquery\|remaining_lesson\|DROP TABLE\|CREATE TABLE\|GRANT\|source='app'" /root/etl/match_order_id.py
crontab -l
psql -d pf_raw -c "\dp raw.gmv_ledger_order_id"  # xem GRANT hiện có
```
**✅ ĐÃ VERIFY 3/10 (dump server thật, không drift):**
- **Q1:** `load_gmv()` đọc `select ... from raw.gmv_ledger where source='allfile'` (Postgres, KHÔNG Sheet) → 10′ an toàn.
- **Q2:** `load_rem(bq)` query BigQuery `remaining_lesson_vn`; transform `_money=int(float(Order_Price_VND))*100`, cắt `.0` ở Order_ID, `to_ts(Purchase_Time)`, `toks(Package_Name)`, `nname(Order_Sale)`.
- **Q3:** `DROP TABLE IF EXISTS` + `CREATE TABLE` + `GRANT SELECT ... TO da_viewer, eric_reader`. → đổi TRUNCATE.
- **Q4:** cron `10 10 * * * cd /root/etl && set -a && . /root/etl/gmv.env && ./venv/bin/python match_order_id.py --write ...`; build qua `*/2 build_only.sh`. **Lưu ý: dùng `--write` + `venv` + `gmv.env`.**
- **Q5:** REM sync BQ ~6h/lần → cache 6h hợp lý.

---

## B1 — Approach + bảng 5-criteria

**Approach A (CHỌN): Cache REM xuống ECS + khớp lại mỗi 10 phút + TRUNCATE thay DROP.**

3 thay đổi:
1. **Thêm bảng `raw.gmv_rem_cache`** trên ECS = bản sao REM. Script mới `refresh_rem_cache.py` kéo REM
   từ BigQuery → TRUNCATE+INSERT vào bảng này. Cron **mỗi 6h** (bám lịch REM sync).
2. **Sửa `match_order_id.py`**: (a) đọc REM từ `raw.gmv_rem_cache` thay vì query BigQuery;
   (b) ghi bảng phụ bằng **TRUNCATE + INSERT** thay vì DROP+CREATE.
3. **Đổi cron `match_order_id.py`**: 1 lần/ngày → **`*/10`** (mỗi 10 phút), bọc `flock` chống chồng.

`build_gmv_intermediate.py` **không đụng** — nó vẫn dán order_id từ bảng phụ mỗi 2 phút như cũ.

Luồng sau sửa:
```
BigQuery REM ──(6h/lần, refresh_rem_cache.py)──► raw.gmv_rem_cache (trên ECS)
                                                        │
gmv_ledger (rebuild mỗi 2′) ──┐                         │
                              ├─(match_order_id.py, mỗi 10′: allfile×cache + đơn app)─► raw.gmv_ledger_order_id
                              │                                                              │ (TRUNCATE+INSERT)
build_gmv_intermediate.py (mỗi 2′) ◄──────── đọc order_id ─────────────────────────────────┘
   └─► dán order_id vào gmv_ledger
```

**Loại bỏ:**
- *Approach B* (nhét khớp vào build_only.sh chạy mỗi 2′): real-time hơn nhưng nặng + đảo cấu trúc build
  → rủi ro cao, tăng tải. Bỏ.
- *Approach C* (giữ query BigQuery, chạy 10′/lần): +144 lượt đọc BigQuery/ngày = tốn phí. Phá tiêu chí 3. Bỏ.

### Bảng 5-criteria (Approach A)

| # | Tiêu chí | Đạt? | Ghi chú |
|---|----------|------|---------|
| 1 | Triệt để (gốc, không vá) | ✅ | Gốc là "chỉ chạy 1 lần/ngày". Chạy 10′/lần = sửa đúng gốc. |
| 2 | Không tạo lỗi con / regression | ✅ | Có guardrail: TRUNCATE giữ GRANT, giữ đơn app, bọc transaction chống race, REM ổn định nên order_id không nhảy lung tung. |
| 3 | Không tăng tải hạ tầng / giảm hiệu năng | ✅ | BigQuery vẫn 6h/lần (không tăng). Khớp là CPU thuần ~18k dòng (~vài giây) trên ECS. `flock` chống chồng. |
| 4 | Tiết kiệm token | ✅ | Thay đổi nhỏ, không fan-out subagent. Claude soạn diff + review inline. |
| 5 | Kiểm chứng được | ⚠️ | Không có test harness cho script server → verify **thủ công** trên server (mục B4). Đây là điểm yếu duy nhất. |

**Điểm: 4.5/5** (pass ≥4). Trade-off tiêu chí 5: không unit-test được script ECS; bù bằng checklist verify thủ công bắt buộc + chạy thử 1 vòng trước khi gắn cron.

---

## B2 — GUARDRAILS (invariant PHẢI GIỮ)

| Guardrail | Nguồn | Cách kiểm |
|-----------|-------|-----------|
| **G1. GRANT SELECT bảng phụ không mất** (da_viewer=Chung, eric_reader=Eric). DROP TABLE xoá GRANT; **phải TRUNCATE**. | memory `reference_ecs_server_access` | `\dp raw.gmv_ledger_order_id` sau khi chạy → vẫn thấy 2 role. |
| **G2. Đơn app giữ order_id.** Dòng `source='app'` append vào bảng phụ với `confidence='app_crm'`, order_id lấy sẵn từ CRM — khớp REM **không được đụng** chúng. | `_patch_bangphu_0210.py` dòng 39-44 | Đếm `WHERE confidence='app_crm'` trước/sau = bằng; order_id khớp CRM. |
| **G3. build_gmv_intermediate.py bỏ qua app_crm khi dán** (`WHERE confidence IS DISTINCT FROM 'app_crm'`) và chỉ dán khi `order_id IS NOT NULL`. **Không đổi logic này.** | `_patch_bangphu_0210.py` dòng 51-61 | So diff build_gmv_intermediate.py = chỉ như patch 2/10, không thêm. |
| **G4. Phí BigQuery không tăng.** REM chỉ đọc trong `refresh_rem_cache.py` (6h/lần). `match_order_id.py` **không còn** câu query BigQuery nào. | Approach A | `grep -n "bigquery\|sa.json\|remaining_lesson" match_order_id.py` → rỗng sau sửa. |
| **G5. Bảng phụ chứa TOÀN BỘ đơn** (khớp→order_id+confidence; chưa khớp→trống), giữ nguyên hành vi patch 2/10. | note 2/10 | Số dòng bảng phụ ≈ allfile + đơn app (không tụt). |
| **G6. Ghi bảng phụ nguyên tử** (TRUNCATE+INSERT trong **1 transaction**) để build đang đọc không thấy bảng rỗng giữa chừng. | race 10′ vs 2′ | Chạy build lặp trong lúc match chạy → không có vòng nào order_id bị trống hàng loạt. |
| **G7. Không hai tiến trình match chồng nhau** (nếu 1 lần >10′). | cron `*/10` | Bọc `flock -n`; lần sau bị khoá thì bỏ qua, không xếp hàng. |
| **G8. order_id đã khớp không nhảy lung tung giữa ngày.** REM-cache đứng yên giữa 2 lần sync 6h → khớp cho kết quả ổn định. | tiêu chí 2 | So order_id 1 đơn High qua nhiều vòng match trong cùng chu kỳ 6h = không đổi. |

---

## B3 — Task nguyên tử

### Task 1 — Tạo bảng `raw.gmv_rem_cache` + script `refresh_rem_cache.py`  — **người chạy: Minh/Chung** (Opus soạn, inline)
- **Mục tiêu:** có bản REM local trên ECS, refresh 6h/lần, để khớp khỏi đụng BigQuery.
- **Làm:**
  1. Tạo bảng khớp schema REM đang dùng trong match (xem Q2) — tối thiểu cột join: `order_id`, `uid`, số tiền, ngày, loại gói, sale (đúng các cột `match_order_id.py` đang đọc từ REM).
  2. `refresh_rem_cache.py`: dùng đúng đoạn query BigQuery **đang có** trong `match_order_id.py` (Q2) → ghi vào `raw.gmv_rem_cache` bằng **TRUNCATE+INSERT trong 1 transaction**.
  3. GRANT SELECT bảng mới cho `da_viewer`, `eric_reader` (đồng bộ bảng phụ).
- **Guardrail liên quan:** G4 (đây là chỗ DUY NHẤT còn đọc BigQuery).
- **Verify:** chạy tay `python3 refresh_rem_cache.py` → `SELECT count(*) FROM raw.gmv_rem_cache` ≈ số dòng REM BigQuery.

### Task 2 — Sửa `match_order_id.py`: đọc REM từ cache + ghi bảng phụ bằng TRUNCATE  — **⚠️ ESCALATE OPUS** (logic khớp tiền tinh vi, nhiều invariant), người chạy: Minh/Chung
- **Mục tiêu:** khớp đọc từ `raw.gmv_rem_cache`, ghi bảng phụ không mất GRANT.
- **Làm:**
  1. Thay đoạn query BigQuery (Q2) bằng `SELECT ... FROM raw.gmv_rem_cache`. Giữ **y nguyên** thuật toán khớp (TOL_ABS, TOL_REL, MONEY_FLOOR, tie-break, 1-to-1, confidence) — chỉ đổi NGUỒN REM.
  2. Đổi phần ghi bảng phụ từ `DROP TABLE ... CREATE TABLE ...` → `TRUNCATE raw.gmv_ledger_order_id;` rồi `INSERT`. **Giữ các dòng app append** (patch 2/10). Toàn bộ trong **1 transaction** (G6).
  3. Giữ GRANT: vì TRUNCATE không xoá GRANT, **không cần** chạy lại GRANT. (Nếu Q3 cho thấy đang DROP → sau khi đổi TRUNCATE, chạy GRANT 1 lần cuối để chắc.)
- **Guardrail:** G1, G2, G4, G5, G6, G8.
- **Verify:** chạy tay `python3 match_order_id.py` → kiểm số dòng (G5), đếm app_crm (G2), `\dp` GRANT (G1), `grep bigquery` rỗng (G4).

### Task 3 — Cron: REM-cache 6h + match 10 phút (có flock)  — người chạy: Minh/Chung (inline)
- **Mục tiêu:** tự động hoá nhịp mới.
- **Làm (crontab root, giờ CST). BẮT BUỘC giữ `--write`, `set -a && . gmv.env`, `./venv/bin/python` giống dòng cũ (dòng 542 dump):**
  ```cron
  # REM cache: mỗi 6h (canh sau lịch REM sync về BigQuery)
  5 */6 * * * cd /root/etl && set -a && . /root/etl/gmv.env && flock -n /tmp/rem_cache.lock ./venv/bin/python refresh_rem_cache.py >> /root/etl/logs/rem_cache.log 2>&1
  # Khớp order_id: mỗi 10 phút, chống chồng (giữ --write!)
  */10 * * * * cd /root/etl && set -a && . /root/etl/gmv.env && flock -n /tmp/match_oid.lock ./venv/bin/python match_order_id.py --write >> /root/etl/logs/match_order_id.log 2>&1
  ```
  - **Xoá** dòng cron cũ: `10 10 * * * cd /root/etl && set -a && . /root/etl/gmv.env && ./venv/bin/python match_order_id.py --write >> /root/etl/logs/match_order_id.log 2>&1`
  - `build_gmv_intermediate.py` (qua `build_only.sh`) giữ nguyên dòng `*/2`.
- **Guardrail:** G7 (flock).
- **Verify:** `grep CRON /var/log/syslog | tail`; theo dõi `match_order_id.log` chạy đều 10′, không chồng.

---

## B4 — Test / Verify (thủ công trên server — bắt buộc trước khi coi là xong)

Không có test harness cho script ECS → verify tay. Chạy **trên dữ liệu thật server**, sau khi chạy
tay 1 vòng đầy đủ (chưa gắn cron):

| # | Kịch bản | Kỳ vọng | Guardrail canh |
|---|----------|---------|----------------|
| T1 | `\dp raw.gmv_ledger_order_id` sau khi match chạy | Vẫn thấy `da_viewer` + `eric_reader` SELECT | G1 |
| T2 | `SELECT count(*) FROM raw.gmv_ledger_order_id WHERE confidence='app_crm'` trước vs sau | Bằng nhau; order_id = order_id CRM | G2 |
| T3 | `grep -n "bigquery\|sa.json\|remaining_lesson" match_order_id.py` | Rỗng (REM đã ra cache) | G4 |
| T4 | `SELECT count(*) FROM raw.gmv_ledger_order_id` | ≈ allfile + đơn app, không tụt so hôm trước | G5 |
| T5 | **Regression bug gốc:** chọn 1 đơn allfile hôm nay đã kích hoạt (có trong REM-cache) nhưng sáng nay chưa có order_id. Chạy 1 vòng match. | Đơn đó **có order_id ngay vòng này**, không phải chờ 9h10 mai | mục tiêu plan |
| T6 | Chạy `build_gmv_intermediate.py` lặp 3-4 lần **trong lúc** match đang chạy | Không vòng nào order_id trống hàng loạt (transaction nguyên tử) | G6 |
| T7 | Đo thời gian 1 vòng match: `time python3 match_order_id.py` | < 60 giây (nếu không → giãn nhịp, mục Rollback) | G7/hiệu năng |
| T8 | So order_id 1 đơn High qua 3 vòng match liên tiếp (cùng chu kỳ 6h REM) | Không đổi | G8 |

---

## B5 — Rollback + Definition of Done

**Rollback (gỡ nhanh nếu hỏng):**
- Khôi phục file: `cp match_order_id.py.bak_1003 match_order_id.py` (tạo `.bak_1003` TRƯỚC khi sửa).
- Khôi phục cron: đổi lại dòng `10 10 * * *` cho match, xoá 2 dòng mới. build không đổi nên không cần.
- Nếu chỉ nặng/chồng: **giãn nhịp** match `*/10` → `*/30` (không cần rollback code).
- `raw.gmv_rem_cache` và `refresh_rem_cache.py` để lại vô hại kể cả khi rollback match (chỉ là bảng thừa).

**Definition of Done:**
- [ ] B0 Q1–Q5 đã verify, chép kết quả vào plan; code thật khớp giả định (không drift).
- [ ] Task 1-2-3 xong, có `.bak_1003`.
- [ ] T1–T8 pass (đặc biệt **T5** regression + **T7** hiệu năng).
- [ ] G1–G8 còn giữ.
- [ ] Chạy tay 1 vòng sạch TRƯỚC khi gắn cron; sau gắn cron theo dõi log 1-2 nhịp ổn.
- [ ] Báo Chung: bảng phụ giờ cập nhật 10′/lần, đơn kích hoạt trong ngày có order_id trong ~10-16 phút (10′ match + 2′ build).

---

## Phụ lục — đổi với thiết kế cũ (nói rõ cho sếp)

- **Bỏ "đông cứng cả ngày".** Trước Hiếu muốn freeze bảng phụ để downstream ổn định; giờ Chung cần
  live → chốt theo Chung. Đánh đổi nhỏ: nếu lần REM-sync sau (6h) sửa 1 match thì mapping có thể đổi
  giữa ngày — hiếm vì REM đổi rất ít; số đã khớp giữa 2 lần sync vẫn ổn định (G8).
- Đơn **app** không dính nút này — vẫn mang order_id real-time từ CRM như trước.
- Trần real-time cuối cùng vẫn là **ngày tiền về điền tay** của chị Thu Hiền (xem note 1/10) — ngoài phạm vi plan này.
