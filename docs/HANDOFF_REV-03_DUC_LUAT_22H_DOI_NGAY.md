# HANDOFF — REV-03 (Đức): Luật mốc 22h — đổi ngày ghi nhận doanh thu

**Origin:** Bảng chốt định nghĩa doanh thu (Thu Hiền 29/7), mục 2. Master plan: `docs/superpowers/plans/2026-07-29-revenue-definition-alignment.md` (Việc 2b).

**Quyết định đã chốt (Thu Hiền 29/7):** "Chốt doanh thu báo cáo theo ngày lấy mốc 22h, sau 22h tính doanh thu vào ngày kế tiếp. Riêng ngày cuối tháng chốt tới 00h." → Luật:
- Giao dịch **từ 22:00 giờ VN trở đi → tính sang NGÀY HÔM SAU**.
- **Ngoại lệ ngày cuối tháng:** ngưỡng nới tới **00:00** — tiền 22:00–24:00 ngày cuối tháng **giữ nguyên ngày/tháng đó** (không đẩy sang tháng mới).

**Estimated effort:** ~1.5–2 ngày. BE-only. **Có backfill** (không migration cột mới).

**Hạn:** không deadline cố định (Đức đang đi viện). Trần: xong trong **nửa đầu tháng 8 — muộn nhất 15/8**.

**⚠️ Thứ tự bắt buộc:** REV-03 làm **SAU REV-01** (việc 2a). REV-01 đẻ ra hàm `ky_doanh_thu(row)`; REV-03 sửa cách sinh `ngay_tien_ve` để hàm đó áp luật 22h. Làm ngược = sửa 2 lần. Rebase REV-03 trên nhánh REV-01 đã merge.

---

## Bối cảnh (ĐÃ verify — grep 30/7 trên nhánh `sandbox`)

**Vì sao chưa áp được luật 22h từ dữ liệu hiện có:** `pay_time` auto-sync ghi **nửa đêm** của `ngay_tien_ve` (`{ngay.isoformat()}T00:00:00`), **mất giờ thực** → không biết giao dịch xảy ra trước/sau 22h. Phải lấy lại **giờ thực** rồi mới cắt mốc.

**`backend/revenue_routes.py`:**
- Auto-sync ghi `pay_time` = nửa đêm: **963** (đường ar_course/PR) và **1156** (đường M3). Cả 2: `"pay_time": f"{ngay.isoformat()}T00:00:00"`.
- Nguồn **giờ thực** đã có sẵn, nhưng đang bị ép về `date` (mất giờ):
  - `_resolve_payment_date(sb, order_row)` **384–406**: đọc `giao_dich.thoi_gian_giao_dich` (**390**), trả `_parse_date(...)` → **date**. Fallback `m3_approved_at`/`updated_at`/`created_at`.
  - `_resolve_payment_date_from_pr(sb, pr_id)` **839–857**: đọc `payment_lines.paid_at` (**843**), status=paid, trả `_parse_date(...)` → **date**. Fallback `created_at`.
- `ngay` truyền vào 2 điểm insert (963/1156) đến từ 2 resolver trên.
- `revenue_routes.py` **chưa import** `ZoneInfo` (grep: không có `from zoneinfo`). Phải thêm.

**Cột `so_doanh_thu`:** `pay_time` (timestamptz) · `ngay_tien_ve` (date, trụ kỳ). REV-03 **không** thêm cột — chỉ đổi giá trị ghi vào 2 cột này.

---

## Scope

### IN scope
1. Lấy **giờ thực** giao dịch (giờ VN) thay cho nửa đêm.
2. Ghi `pay_time` = giờ thực; sinh `ngay_tien_ve` theo luật 22h + ngoại lệ cuối tháng.
3. Hàm `ky_doanh_thu` (REV-01 tạo) áp luật này khi map row → kỳ.
4. Backfill `ngay_tien_ve` cho dòng auto lịch sử (dòng có truy được giờ thực).
5. Test pytest.

### OUT of scope (KHÔNG làm)
- **KHÔNG** đụng việc 7 / việc 3 / việc 6 — REV-01 (đã có `apply_revenue_filters`, `ky_doanh_thu` bản `ngay_tien_ve`), REV-04 (net phí), REV-02 (hoàn/hủy).
- **KHÔNG** đổi `ngay_tien_ve` của dòng `import:*` / `tay` (không có giờ thực → giữ nguyên; backfill chỉ chạm dòng `loai_nhap='tu_dong'` truy được giờ).
- **KHÔNG** thêm cột mới vào `so_doanh_thu`.
- **KHÔNG** đụng Dashboard (đọc `payment_lines`, không đọc Sổ).

---

## Việc cụ thể

### A. Hàm luật 22h (viết mới, cạnh `ky_doanh_thu`)
```python
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, date
import calendar

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")

def ky_tu_gio_thuc(dt: datetime) -> date:
    """Kỳ doanh thu theo luật Thu Hiền: sau 22h VN → ngày sau;
    ngoại lệ ngày cuối tháng (22h–24h giữ nguyên ngày/tháng đó)."""
    local = dt.astimezone(VN_TZ)
    last_day = calendar.monthrange(local.year, local.month)[1]
    is_last_day = local.day == last_day
    if local.hour >= 22 and not is_last_day:
        return (local + timedelta(days=1)).date()
    return local.date()
```
- `dt` phải là **tz-aware**. Nếu nguồn trả naive → coi là giờ VN (`.replace(tzinfo=VN_TZ)`), KHÔNG coi là UTC (dữ liệu giao dịch là giờ VN).

### B. Resolver trả giờ thực (đổi 2 hàm, giữ chữ ký cũ + thêm hàm `*_time`)
Đừng đổi kiểu trả của `_resolve_payment_date*` (nhiều nơi gọi) — **thêm** biến thể trả datetime:
1. `_resolve_payment_time(sb, order_row) -> datetime | None`: như `_resolve_payment_date` (384–406) nhưng trả `thoi_gian_giao_dich` dạng **datetime tz-aware** (parse full timestamp, không cắt ngày). Fallback về datetime của `m3_approved_at`... nếu có giờ; không có giờ → None.
2. `_resolve_payment_time_from_pr(sb, pr_id) -> datetime | None`: như 839–857 nhưng trả `paid_at` **datetime tz-aware**.

### C. Ghi pay_time = giờ thực + ngay_tien_ve theo luật (963 & 1156)
Tại mỗi điểm insert:
- Lấy `t = _resolve_payment_time*(...)`.
- Nếu `t` có: `pay_time = t.isoformat()` (giờ thực, tz-aware); `ngay_tien_ve = ky_tu_gio_thuc(t)`.
- Nếu `t` None (không truy được giờ): giữ hành vi cũ — `pay_time = f"{ngay}T00:00:00"`, `ngay_tien_ve = ngay` (resolver date cũ). Không bịa giờ.

### D. `ky_doanh_thu` (REV-01) — dùng lại pay_time có giờ
Sau REV-03, `pay_time` mang giờ thực. `ky_doanh_thu(row)` (do REV-01 tạo, đang trả `ngay_tien_ve`) **giữ trả `ngay_tien_ve`** — vì `ngay_tien_ve` giờ đã được C tính đúng luật lúc ghi. KHÔNG tính lại luật 22h khi đọc (tránh double-apply). Chỉ xác minh: dòng mới ghi có `ngay_tien_ve` = `ky_tu_gio_thuc(pay_time)`.

### E. Backfill (script `backend/scripts/backfill_ngay_tien_ve_22h.py`, dry-run mặc định)
> **Backup `so_doanh_thu` TRƯỚC** (doctrine so-doanh-thu-revenue).
- Duyệt dòng `loai_nhap='tu_dong'` (chỉ dòng auto — có `don_hang_id`/link PR để truy giờ thực).
- Truy giờ thực qua `giao_dich.thoi_gian_giao_dich` / `payment_lines.paid_at` theo `don_hang_id`/PR.
- Tính `ngay_tien_ve_moi = ky_tu_gio_thuc(giờ thực)` và `pay_time = giờ thực`.
- Chỉ update dòng có `ngay_tien_ve_moi <> ngay_tien_ve` hiện tại. **Báo Minh số dòng bị đổi + tổng VND dịch giữa các ngày** trước khi `--apply`.
- Dòng không truy được giờ → **giữ nguyên**, đếm vào nhóm "skip_no_time".

---

## Acceptance criteria
1. Dòng auto mới: giao dịch 21:59 VN → `ngay_tien_ve` = ngày N; 22:01 → N+1.
2. Cuối tháng: 22:30 ngày cuối tháng M → vẫn tháng M (không nhảy M+1); 00:30 ngày 1 tháng mới → tháng mới.
3. Timezone: 23:30 giờ VN (=16:30 UTC) rơi đúng ngày VN, không lệch 1 ngày.
4. Dòng không có giờ thực → `ngay_tien_ve` giữ nguyên (không bị bịa).
5. `python -m pytest backend/tests/test_revenue_22h_rule.py -v` PASS (từ repo root).
6. Khi merge (Minh chạy): `cd frontend && npx tsc -b` PASS; `npm run test` PASS.

## Test plan (`backend/tests/test_revenue_22h_rule.py`)
1. `ky_tu_gio_thuc`: 21:59→N; 22:00→N+1; 22:00 ngày cuối tháng→giữ ngày cuối tháng; 00:30 mùng 1→mùng 1; input UTC 16:30→ngày VN đúng.
2. Auto-sync path: mock giao_dich giờ 22:30 → row Sổ có `ngay_tien_ve` = N+1, `pay_time` mang giờ thực.
3. Không truy được giờ → fallback nửa đêm, `ngay_tien_ve` = ngày resolver cũ.

---

## Anti-patterns (đừng làm)
1. Đừng áp luật 22h **cả lúc ghi lẫn lúc đọc** — chỉ áp 1 lần lúc ghi (C). `ky_doanh_thu` đọc thẳng `ngay_tien_ve`, không tính lại.
2. Đừng coi giờ naive là UTC — dữ liệu giao dịch là giờ VN. Sai tz = lệch nguyên 1 ngày quanh nửa đêm.
3. Đừng đổi kiểu trả của `_resolve_payment_date*` cũ — nhiều nơi gọi; thêm biến thể `*_time`.
4. Đừng backfill dòng `import:*`/`tay` — không có giờ thực, đụng vào = phá số lịch sử.
5. Đừng chạy backfill khi chưa backup `so_doanh_thu`.
6. Đừng làm REV-03 trước REV-01 — cần `ky_doanh_thu` + cột thời gian đã gom về `ngay_tien_ve`.
