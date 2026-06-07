# Thanh tìm kiếm Sổ doanh thu + Sửa cách tra team đơn hàng

**Ngày:** 2026-06-04
**Phạm vi:** Frontend (SoDoanhThuTab) + Backend (revenue_routes, dashboard_routes, report_routes)

---

## 1. Thanh tìm kiếm Sổ doanh thu

### Mục đích

Thu Hiền cần tra cứu nhanh trong Sổ doanh thu theo UID, SĐT, tên khách, tên sale, mã đơn hàng, nội dung chuyển khoản. Hiện tại chỉ có bộ lọc ngày/nguồn dòng/team, không có ô tìm kiếm.

### Giao diện

- **1 ô tìm kiếm full-width** đặt ngay phía trên bảng dữ liệu (giữa thẻ tổng hợp summary cards và dòng "Hiển thị X / Y dòng")
- Icon kính lúp bên trái
- Placeholder: `Tìm theo tên khách, SĐT, UID, sale, mã đơn...`
- Nút X bên phải để xóa nhanh từ khóa
- Khi có từ khóa, dòng đếm đổi thành: `Tìm thấy X dòng cho "từ khóa"` (hoặc `Không tìm thấy dòng nào cho "từ khóa"`)

### Cách hoạt động

- Gõ từ khóa → đợi 400ms sau khi ngừng gõ → gửi request
- Tìm kiếm **kết hợp** với bộ lọc đang có (ngày, nguồn dòng, team)
- Không phân biệt hoa/thường, không phân biệt có dấu/không dấu (dùng `ilike` của Postgres)
- Xóa ô tìm → quay về danh sách bình thường
- Cuộn xuống tải thêm vẫn hoạt động trong kết quả tìm kiếm
- Thẻ tổng hợp (summary cards) **không bị ảnh hưởng** bởi từ khóa — vẫn tính theo bộ lọc ngày/team

### Các trường được tìm

| Cột hiển thị | Trường DB (`so_doanh_thu`) |
|---|---|
| User Name | `ten_khach` |
| Phone | `sdt` |
| UID | `uid` |
| Sales | `sale_crm_name` |
| ID đơn hàng | `crm_order_id`, `ma_don_hang` |
| Nội dung CK | `info_code` |

Tìm kiếm dạng "chứa" (contains), ví dụ gõ "0912" sẽ ra tất cả SĐT chứa "0912".

### Backend: `GET /revenue/ledger`

Thêm query parameter `search` (optional string).

Khi `search` có giá trị, thêm filter OR trên 6 trường:

```
ten_khach ilike %search%
OR sdt ilike %search%
OR uid ilike %search%
OR sale_crm_name ilike %search%
OR crm_order_id ilike %search%
OR ma_don_hang ilike %search%
OR info_code ilike %search%
```

Filter search áp dụng **sau** các filter hiện có (from/to, loai_nhap, team). Pagination vẫn hoạt động bình thường.

Hàm `_ledger_query()` cần được mở rộng để nhận `search` parameter. Hàm `_count_so_doanh_thu()` cũng cần nhận `search` để đếm đúng.

Supabase PostgREST hỗ trợ `.or()` filter cho OR across columns.

### Frontend: `SoDoanhThuTab.tsx`

- Thêm state: `draftSearch`, `appliedSearch` (giống pattern draft/applied hiện có)
- Debounce 400ms: khi `draftSearch` thay đổi, sau 400ms tự động set `appliedSearch` và trigger reload
- `appliedSearch` được gửi qua `endpoints.revenue.listLedger({ ..., search })` 
- `api.ts`: thêm `search?: string` vào params của `listLedger`
- Nút "Reset bộ lọc" cũng xóa ô tìm kiếm
- Summary cards (`ledgerSummary`) **không** nhận `search` param — giữ nguyên

### Tối ưu tốc độ tìm kiếm

Thêm index trên Supabase cho các trường tìm kiếm thường dùng nhất:

```sql
CREATE INDEX IF NOT EXISTS idx_sdt_uid_search
  ON so_doanh_thu (uid, sdt);
```

Với ~15.000 dòng hiện tại, `ilike` đã đủ nhanh (<100ms) kể cả không có index đặc biệt. Index này là phòng xa khi dữ liệu tăng.

---

## 2. Sửa cách tra team cho Đơn hàng (batch thay vì từng dòng)

### Mục đích

Khi lọc Dashboard theo team, hệ thống cần biết mỗi đơn hàng thuộc team nào. Hiện tại hệ thống hỏi danh sách nhân sự **từng sale một** — 100 đơn = 100 lần hỏi riêng. Cần đổi thành hỏi 1 lần duy nhất rồi tra bảng.

### Phân tích dữ liệu hiện tại

| Bảng | Có cột `team`? | Cần tra ngược? |
|---|---|---|
| `so_doanh_thu` | Có — team ghi sẵn lúc nhập sổ | Không |
| `don_hang` | Không — chỉ có `sale_crm_name` | Có — chỗ cần sửa |

### Xử lý trùng tên sale

**Tình huống 1 — 1 nghỉ, 1 đang làm:**
→ Batch chỉ load `is_active = true` → tự loại sale đã nghỉ.

**Tình huống 2 — Cả 2 đang làm, cùng tên:**
→ CRM phân biệt bằng hậu tố số ("Hoang Thi Hong Tham" vs "Hoang Thi Hong Tham 1") → `crm_name` trên hệ thống đã khác nhau → không va chạm khi tra bảng.

**Tình huống 3 — Cùng sale chuyển team:**
→ `don_hang` không lưu team → khi tra bảng sẽ trả team **hiện tại** của sale, không phải team tại thời điểm tạo đơn. Đây là hạn chế đã có từ trước (cả cách cũ lẫn cách mới đều như vậy). Ghi nhận để xử lý riêng nếu cần sau.

### Các hàm cần sửa

**1. `_load_qr_created_maps()` — `dashboard_routes.py:507`**

Hiện tại (N+1):
```
Mỗi đơn hàng → hỏi nhan_su_sale 1 lần riêng
```

Sửa thành (batch):
```
Bước 1: Load toàn bộ nhan_su_sale (is_active=true) → tạo bảng tra {crm_name → team}
Bước 2: Mỗi đơn hàng → tra bảng trong bộ nhớ (không hỏi DB lại)
```

Output không đổi: vẫn trả `(total_vnd: int, count: int)`.

**2. `_load_m2_revenue()` — `report_routes.py:264`**

Cùng pattern N+1 (line 284-298). Sửa giống hệt cách trên.

Output không đổi: vẫn trả `dict[str, dict]`.

**3. Tái sử dụng pattern từ `gsheet_ledger_import.py`**

Đã có `TeamLookupCache` class làm đúng batch load. Tuy nhiên class này nằm trong module import, không được dùng ở dashboard/report. Cần tách ra thành 1 hàm dùng chung.

Tạo hàm `load_team_map(sb) -> dict[str, str]` đặt ở `report_routes.py` (hoặc utility chung) với logic:
- Load `nhan_su_sale` where `is_active = true`
- Chọn columns `crm_name, team`
- Build dict `{crm_name.strip(): team.strip()}`
- Nếu trùng `crm_name` (cả 2 active), giữ record đầu tiên (nhất quán với `.limit(1)` hiện tại)

### Nơi gọi hàm mới

| Caller | File | Hiện tại | Sau khi sửa |
|---|---|---|---|
| `_load_qr_created_maps` | `dashboard_routes.py:507` | N+1 query | `load_team_map()` 1 lần |
| `_load_m2_revenue` | `report_routes.py:264` | N+1 query | `load_team_map()` 1 lần |

Cả 2 caller chỉ cần team map khi parameter `team` filter được truyền vào. Khi không lọc team → không cần tra team → không gọi `load_team_map()`.

### Không thay đổi

- `_load_ledger_revenue()` — dùng `so_doanh_thu` đã có cột `team`, không tra ngược
- `_load_staff_maps()` — dùng cho gamification, logic khác (lookup by email + crm_name cho BXH)
- `TeamLookupCache` trong `gsheet_ledger_import.py` — giữ nguyên, chỉ dùng khi sync sheet
- Mọi API response shape — không đổi
- Mọi frontend component — không đổi

---

## 3. Kiểm tra sau khi triển khai

### Thanh tìm kiếm

- [ ] Gõ UID → ra đúng dòng có UID đó
- [ ] Gõ SĐT một phần (vd "0912") → ra tất cả SĐT chứa "0912"
- [ ] Gõ tên khách → ra đúng
- [ ] Kết hợp filter ngày + tìm kiếm → kết quả chỉ trong khoảng ngày đã lọc
- [ ] Kết hợp filter team + tìm kiếm → kết quả chỉ trong team đã lọc
- [ ] Xóa ô tìm → quay về danh sách đầy đủ
- [ ] Cuộn xuống tải thêm trong kết quả tìm kiếm
- [ ] Thẻ tổng hợp không thay đổi khi tìm kiếm
- [ ] Reset bộ lọc cũng xóa ô tìm kiếm
- [ ] Tìm không ra kết quả → hiện "Không tìm thấy dòng nào"

### Batch team lookup

- [ ] Dashboard Sale lọc theo team HCM → kết quả giống trước khi sửa
- [ ] BC03 report lọc theo team → kết quả giống trước khi sửa
- [ ] Sale có tên trùng (1 active, 1 inactive) → lấy đúng team của sale active
- [ ] Không lọc team → hệ thống không gọi load danh sách nhân sự (tối ưu)

---

## 4. Rủi ro đã đánh giá

| Rủi ro | Mức | Cách phòng |
|---|---|---|
| Kết quả tìm kiếm sai do `ilike` match quá rộng | Thấp | Tìm "chứa" là đúng nhu cầu Thu Hiền; user có thể kết hợp filter ngày để thu hẹp |
| Batch team lookup trả team khác với N+1 cũ (do trùng tên) | Thấp | Chỉ load `is_active=true`, giữ record đầu tiên — nhất quán hơn cách cũ |
| Sale chuyển team → đơn cũ bị gán team mới | Đã có từ trước | Ghi nhận, không thay đổi — `don_hang` không lưu team tại thời điểm tạo |
| Sửa `_load_m2_revenue` ảnh hưởng BC03 | Thấp | Output shape không đổi, chỉ thay cách tra team |
| Search param làm chậm query khi dữ liệu lớn | Thấp | 15K rows + index → <100ms; monitor nếu tăng quá 100K |
