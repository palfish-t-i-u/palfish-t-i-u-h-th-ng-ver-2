# HANDOFF — REV-01 (Đức): Lọc đơn test + Gom 1 mốc thời gian cho mọi báo cáo

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền 29/7) + rà code app 29–30/7. Master plan: `docs/superpowers/plans/2026-07-29-revenue-definition-alignment.md` (Việc 7 + Việc 2a).

**Quyết định đã chốt:** App phải là nguồn số duy nhất thay All File. Bước đầu: làm app **tự khớp với chính nó** — mọi báo cáo doanh thu dùng CHUNG 1 cột thời gian + CHUNG 1 bộ lọc. Đây là điều kiện để đối chiếu Sổ ↔ All File có nghĩa.

**Estimated effort:** ~1.5 ngày. BE-only (FE toggle "Hiện đơn test" do Minh làm). **Không migration.**

**Hạn:** không deadline cố định (Đức đang đi viện, chưa vào việc ngay). Trần: xong trong **nửa đầu tháng 8 — muộn nhất 15/8**.

---

## Bối cảnh (ĐÃ verify — grep 30/7 trên nhánh `sandbox`)

Số dòng dưới đây verify lại 30/7 (đã **lệch ~10 dòng** so master plan — dùng số này):

**`backend/revenue_routes.py`:**
- `_row_pay_date` (BC02 day bucket) — **190–192**: `return _parse_date(row.get("pay_time")) or _parse_date(row.get("ngay_tien_ve"))` → đang ưu tiên `pay_time`.
- `_row_month_date` (BC01 month bucket) — **195–197**: `return _parse_date(row.get("ngay_tien_ve"))` → đã đúng `ngay_tien_ve`.
- `_ledger_query` (Sổ list) — def **510**; docstring **521** ("Lọc theo Pay Time"); `.order("pay_time"...)` **526**; `.gte("pay_time"...)` **528**; `.lte("pay_time"...)` **530**; lọc `loai_nhap` **531–532**. → đang lọc/sắp theo `pay_time`.
- `is_test` **đã được ghi đúng** vào Sổ: **982** (auto ar_course, `pr.get("is_test")`), **1175** (auto m3, `_is_test_email(actor_email)`), **1455** (nhập tay, `_is_test_email(actor.email)`). Helper `_is_test_email` **161**. → chỉ THIẾU bộ lọc đọc, KHÔNG cần backfill.
- GET `/revenue/ledger` — **1271** (endpoint list, có `loai_nhap: str | None = Query(None)` **1276**).
- BC01 `/revenue/pivot/sales-performance` — route **1565**; fetch `.select("pay_time, ngay_tien_ve, gmv_rmb, ...")` **1579**. **Query riêng, KHÔNG qua `_ledger_query`.**
- BC02 `/revenue/pivot/key-data` — route **1592**; fetch `.select(...)` **1606**. **Query riêng, KHÔNG qua `_ledger_query`.**

**`backend/report_routes.py`:**
- BC03 `_load_ledger_revenue` — def **231**; `.select("... ngay_tien_ve")` **238**; `.gte("ngay_tien_ve", d_start)` **239**; `.lte("ngay_tien_ve", d_end)` **240**. → đã đúng `ngay_tien_ve`; **KHÔNG có** `.eq("is_test", ...)`.

**Cột `so_doanh_thu` liên quan:** `ngay_tien_ve` (date, trụ kỳ) · `pay_time` (timestamptz — auto-sync ghi `{ngày}T00:00:00`, nửa đêm, mất giờ thực; **963**/**1156**) · `is_test` (bool, đã có) · `loai_nhap` (`tu_dong`/`tay`/`import:*`).

---

## Scope

### IN scope
1. **Việc 7 — lọc đơn test** khỏi Sổ + BC01 + BC02 + BC03.
2. **Việc 2a — gom 1 cột thời gian**: mọi báo cáo bucket/lọc theo `ngay_tien_ve` (bỏ `pay_time`).

### OUT of scope (KHÔNG làm)
- **KHÔNG** đụng luật mốc 22h / giờ thực / backfill `ngay_tien_ve` — đó là **Việc 2b, đợt 2**, không phải bây giờ.
- **KHÔNG** sửa Dashboard (`dashboard_routes.py`) — đã lọc `is_test` sẵn (:487), đọc `payment_lines` không đọc Sổ.
- **KHÔNG** đổi cách ghi `is_test` (đã đúng) → không backfill.
- **KHÔNG** thêm/sửa route refund (đó là Đạt, REV-02).
- **KHÔNG** làm toggle FE — Minh làm.

---

## Việc cụ thể

### A. 2 hàm dùng chung (nguyên tắc "sửa 1 chỗ, cả hệ đổi")
Thêm vào `revenue_routes.py` (gần đầu vùng helper, cạnh `_row_pay_date`):

```python
def apply_revenue_filters(query, *, include_test: bool = False):
    """Bộ lọc doanh thu dùng chung cho Sổ + BC01/02/03. Mặc định loại đơn test.
    (Chừa chỗ mở rộng NON_VN_TEAMS sau — đợt khác.)"""
    if not include_test:
        query = query.eq("is_test", False)
    return query

def ky_doanh_thu(row: dict) -> date | None:
    """Kỳ doanh thu chuẩn = ngay_tien_ve. Việc 2b (đợt 2) chỉ sửa hàm này."""
    return _parse_date(row.get("ngay_tien_ve"))
```

### B. Việc 7 — gắn lọc `is_test` vào 4 điểm đọc Sổ
1. `_ledger_query` (**510**): thêm tham số `include_test: bool = False`; áp `query = apply_revenue_filters(query, include_test=include_test)` trước khi trả.
2. GET `/revenue/ledger` (**1271**): thêm `include_test: bool = Query(False)`; truyền xuống `_ledger_query`. (Màn admin/audit gọi `?include_test=true` để xem đơn test.)
3. BC01 fetch (**1579**) và BC02 fetch (**1606**): 2 query **riêng**, không qua `_ledger_query` → gọi trực tiếp `apply_revenue_filters(q)` (mặc định loại test).
4. BC03 `_load_ledger_revenue` (`report_routes.py` **238–240**): thêm `.eq("is_test", False)` vào chuỗi query.

### C. Việc 2a — chuyển mọi báo cáo sang `ngay_tien_ve`
1. `_ledger_query` (**526/528/530**): đổi `pay_time` → `ngay_tien_ve` cho cả `.order` lẫn `.gte/.lte`. Sửa docstring **521**.
2. `_row_pay_date` (**190–192**): trả `ky_doanh_thu(row)` (bỏ nhánh ưu tiên `pay_time`). BC02 từ đó bucket theo `ngay_tien_ve`.
3. BC01 (`_row_month_date` 195–197) + BC03 (239–240): đã `ngay_tien_ve` → giữ; xác minh không còn nhánh `pay_time` nào trong đường báo cáo.

### D. Guardrail bắt buộc TRƯỚC khi đổi cột (chống lỗi con)
Chạy trên Supabase SQL Editor, **báo Minh con số này** trước khi đổi Sổ query:
```sql
SELECT count(*) FROM so_doanh_thu WHERE pay_time::date <> ngay_tien_ve;
```
Auto-sync ghi `pay_time = ngay_tien_ve` lúc nửa đêm (963/1156) → auto rows khớp. Lệch chỉ ở dòng import/tay cũ. Tổng THÁNG gần như không đổi, chỉ ngày-trong-tháng dịch. Nếu lệch nhiều bất thường → dừng, hỏi Minh.

---

## Acceptance criteria
1. Cùng bộ dữ liệu trên sandbox → **BC01 = BC02 = BC03 = tổng Sổ** cho cùng kỳ + cùng bộ lọc.
2. Đơn `@dev` (`test.user@dev`...) KHÔNG xuất hiện trong tổng của bất kỳ báo cáo nào; `?include_test=true` vẫn xem được.
3. Dòng `import:*` / `tay` thật (`is_test=false`) vẫn hiển thị đủ.
4. `python -m pytest backend/tests/test_ledger_is_test_filter.py backend/tests/test_revenue_period_bucket.py -v` PASS (chạy từ repo root).
5. Khi merge (Minh chạy): `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

## Test plan (viết mới)
`backend/tests/test_ledger_is_test_filter.py`:
1. Seed 3 dòng: 2 thật + 1 `is_test=true`. `/revenue/ledger` mặc định trả 2, tổng bỏ dòng test.
2. `?include_test=true` → trả 3.
3. BC01/BC02/BC03 tổng loại trừ dòng test.
4. Dòng `import:*` `is_test=false` vẫn xuất hiện.

`backend/tests/test_revenue_period_bucket.py`:
1. Cùng bộ dòng → BC01/BC02/BC03/Sổ trả **cùng kỳ** cho mỗi dòng.
2. Dòng có `pay_time::date` lệch `ngay_tien_ve` → rơi kỳ theo `ngay_tien_ve` ở mọi báo cáo.

---

## Anti-patterns (đừng làm)
1. Đừng lọc `is_test` bằng cách sửa từng query rời rạc — gom qua `apply_revenue_filters` để không sót báo cáo thứ 5 sau này.
2. Đừng đụng luật 22h/giờ thực — đó là 2b đợt 2. Việc này chỉ gom cột + lọc test.
3. Đừng backfill `is_test` — cột đã đúng dữ liệu.
4. Đừng nâng `MAX_ANALYTICS_ROWS` (`analytics_limits.py`) — không liên quan; cap giữ nguyên.
5. **Đừng sửa vùng cuối file quanh route `/revenue/ledger/sync-gsheet` (~1710) — Đạt (REV-02) thêm route refund ở đó.** Đức merge trước, Đạt rebase sau.
