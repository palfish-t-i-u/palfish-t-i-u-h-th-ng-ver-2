# Hướng dẫn IT: Lấy dữ liệu đối chiếu số điện thoại Lead cho App

**Dự án BigQuery:** `daily-report-smai-to-openclaw`
**Region:** `US` (toàn bộ dataset)
**Cập nhật:** 18/08/2026

---

## ⚠️ LƯU Ý QUAN TRỌNG — ĐỌC TRƯỚC KHI LÀM

| # | Lưu ý | Vì sao |
|---|---|---|
| 1 | **Không sửa, không tạo, không xoá bất cứ thứ gì trong dataset `crm_leads`** | Đây là nơi chứa logic đối chiếu gốc (`leads_all`, `gmv_new`). Sửa một dòng SQL ở đây làm sai toàn bộ báo cáo ROI của công ty. App chỉ được đọc dataset `app_lookup` |
| 2 | **App không được query trực tiếp view `crm_leads.leads_all`** | Đó là view union 2 bảng + 4 join. Mỗi lần gọi quét ~24 MB, mất vài giây. Không dùng được cho tra cứu realtime. Phải query bảng phẳng `app_lookup.lead_phone_lookup` |
| 3 | **Chuẩn hoá số điện thoại phải giống hệt công thức ở Mục 6** | Nếu app chuẩn hoá khác `gmv_new`, sẽ có đơn app báo "đã khớp" nhưng báo cáo lại tính "chưa khớp" — vô hiệu hoá toàn bộ tính năng |
| 4 | **Bắt buộc tra cả số điện thoại nằm trong cột `note`, không chỉ cột `phone`** | Có **1.282 số điện thoại chỉ tồn tại trong ghi chú** của sale. Bỏ qua nhóm này thì app sẽ báo "không tìm thấy" sai cho khoảng 1.300 khách |
| 5 | **Một số điện thoại có thể trỏ tới nhiều lead** | 4,4% số điện thoại trong kho khớp với từ 2 lead trở lên. Giao diện bắt buộc phải cho sale chọn, không được tự động lấy lead đầu tiên |
| 6 | **Chỉ lấy lead có kênh và có ngày trước ngày đơn** | Điều kiện: `crm_code IS NOT NULL` và `lead_date <= ngày thanh toán`. Lead phát sinh sau ngày đơn không thể là nguồn của đơn đó |
| 7 | **Dữ liệu này là thông tin cá nhân khách hàng (PII)** | Không ghi số điện thoại vào log ứng dụng, không đưa API ra internet công khai, bắt buộc có xác thực người dùng nội bộ |
| 8 | **Không cache kết quả quá 1 giờ** | Bảng tra cứu được làm mới mỗi giờ. Cache lâu hơn sẽ báo "không tìm thấy" với lead mới về |
| 9 | **Mọi dataset mới phải tạo ở region `US`** | Tạo nhầm region thì không join được với dữ liệu gốc, BigQuery báo lỗi cross-region |
| 10 | **Không cấp và không yêu cầu quyền `Editor`, `Owner`, `bigquery.admin`, `bigquery.dataEditor`** | Các quyền này cho phép sửa/xoá logic gốc. Xem Mục 3 để biết đúng quyền cần dùng |

---

## 1. Bối cảnh và mục tiêu

**Vấn đề:** Nhiều đơn bán mới đến từ quảng cáo, nhưng số điện thoại khách dùng lúc thanh toán khác với số khách để lại lúc đăng ký quảng cáo. Hệ thống không nối được 2 số này nên đơn bị tính là "không rõ nguồn" → ROI quảng cáo bị tính sai.

**Giải pháp:** Thêm khối kiểm tra lead vào app. Khi sale tạo đơn, app tra ngay số điện thoại xem có trong kho lead marketing không:
- Có → hiện thông tin lead để sale xác nhận
- Không có → yêu cầu sale nhập số điện thoại gốc khách đã dùng, hoặc chọn lý do

**Kết quả mong đợi:** Tăng tỷ lệ khớp đơn ↔ lead, và lần đầu tiên đo được tỷ lệ đơn bị gán nhầm nguồn.

---

## 2. Kiến trúc dữ liệu

```
crm_leads.leads_history  ─┐
                          ├─→  crm_leads.leads_all  ──→  crm_leads.gmv_new
crm_leads.leads_monthly  ─┘         (view gốc)              (báo cáo ROI)
                                        │
                                        │  Scheduled query, chạy mỗi giờ
                                        ▼
                          app_lookup.lead_phone_lookup   ←── APP ĐỌC (chỉ đọc)
                                                             (bảng phẳng, ~68k dòng)

                          app_write.lead_phone_manual    ←── APP GHI (chỉ thêm dòng)
                                        │
                                        └──→ về sau nối vào gmv_new làm khoá khớp thứ 4
```

| Đối tượng | Dataset | App được làm gì |
|---|---|---|
| `leads_all`, `gmv_new`, `gmv_master`… | `crm_leads` | **Không truy cập** |
| `lead_phone_lookup` | `app_lookup` | Chỉ đọc |
| `lead_phone_manual` | `app_write` | Chỉ đọc và thêm dòng |

Cách tách này bảo đảm 2 việc cùng lúc: app không sửa được logic gốc, và app không đọc được toàn bộ kho số điện thoại + doanh thu của công ty.

---

## 3. Quyền truy cập cần cấp

Cấp cho **service account riêng của app**, không dùng tài khoản cá nhân.

| # | Quyền | Cấp ở đâu | Dùng để |
|---|---|---|---|
| 1 | `roles/bigquery.jobUser` | Cấp project | Chạy được câu query (chỉ tạo job, không đụng dữ liệu) |
| 2 | `roles/bigquery.dataViewer` | Dataset `app_lookup` | Đọc bảng tra cứu |
| 3 | Custom role `appLeadPhoneWriter` | Dataset `app_write` | Thêm dòng vào bảng ghi, nhưng **không xoá được bảng** |

### Lệnh tạo (người có quyền quản trị chạy)

```bash
PROJECT=daily-report-smai-to-openclaw
SA=app-lead-match@$PROJECT.iam.gserviceaccount.com

# Tạo service account
gcloud iam service-accounts create app-lead-match \
  --display-name="App doi chieu SDT lead" --project=$PROJECT

# Quyền chạy query, cấp ở project
gcloud projects add-iam-policy-binding $PROJECT \
  --member="serviceAccount:$SA" \
  --role="roles/bigquery.jobUser"

# Custom role chỉ cho phép ghi thêm, không cho xoá bảng
gcloud iam roles create appLeadPhoneWriter --project=$PROJECT \
  --title="App Lead Phone Writer" \
  --permissions=bigquery.tables.get,bigquery.tables.getData,bigquery.tables.updateData
```

Quyền ở **cấp dataset** cấp bằng giao diện cho nhanh:
BigQuery → chọn dataset `app_lookup` → **Sharing** → **Permissions** → **Add principal** → dán email service account → chọn role `BigQuery Data Viewer`. Làm tương tự với `app_write` nhưng chọn role `appLeadPhoneWriter`.

### Nếu IT cần vào Console để kiểm tra

Cấp cho **tài khoản cá nhân** của IT: `roles/bigquery.dataViewer` trên đúng 2 dataset `app_lookup` và `app_write`, cộng `roles/bigquery.jobUser` ở cấp project.

> **Lưu ý về màn hình Datasets trống:** BigQuery yêu cầu quyền cấp project mới hiện được danh sách dataset. Nếu chỉ được cấp quyền ở cấp dataset, trang Datasets sẽ hiện "No rows to display" mà **không báo lỗi**. Khi đó vào thẳng dataset bằng đường dẫn, hoặc dùng ô Search để tìm tên dataset.

---

## 4. Hạ tầng cần tạo (chạy 1 lần)

Phần này **do người quản trị dữ liệu chạy, không phải IT**. IT chỉ cần biết kết quả để viết app.

### 4.1 Tạo 2 dataset

```sql
CREATE SCHEMA IF NOT EXISTS `daily-report-smai-to-openclaw.app_lookup`
OPTIONS (location = 'US', description = 'Bang tra cuu cho app - chi doc');

CREATE SCHEMA IF NOT EXISTS `daily-report-smai-to-openclaw.app_write`
OPTIONS (location = 'US', description = 'Bang nhan du lieu sale nhap tu app');
```

### 4.2 Tạo bảng ghi ngược

```sql
CREATE TABLE IF NOT EXISTS `daily-report-smai-to-openclaw.app_write.lead_phone_manual` (
  pr_id             STRING  NOT NULL OPTIONS(description="Ma don / PR-ID tren app"),
  uid_crm           STRING           OPTIONS(description="UID CRM neu da co"),
  phone_thanh_toan  STRING           OPTIONS(description="SDT khach dung luc thanh toan, dang 84-xxxxxxxxx"),
  phone_lead_nhap   STRING           OPTIONS(description="SDT goc sale nhap tay, giu nguyen dinh dang goc"),
  phone9            STRING           OPTIONS(description="9 so cuoi cua phone_lead_nhap, app tu tinh"),
  ly_do_code        STRING           OPTIONS(description="Ma ly do khi khong tim thay lead"),
  ly_do_text        STRING           OPTIONS(description="Nhan hien thi cua ly do"),
  crm_code_chon     STRING           OPTIONS(description="Kenh cua lead sale da chon khi co nhieu lead"),
  lead_date_chon    DATE             OPTIONS(description="Ngay lead sale da chon"),
  ec_nhap           STRING           OPTIONS(description="Ma sale thao tac"),
  nguon_kh          STRING           OPTIONS(description="Nguon KH tren form"),
  ghi_chu           STRING,
  created_at        TIMESTAMP NOT NULL OPTIONS(description="Thoi diem ghi, dung CURRENT_TIMESTAMP()")
)
PARTITION BY DATE(created_at)
CLUSTER BY phone9;
```

### 4.3 Tạo scheduled query làm mới bảng tra cứu

Câu SQL đầy đủ ở **Phụ lục A**. Cấu hình:

| Thông số | Giá trị |
|---|---|
| Tần suất | Mỗi 1 giờ |
| Region | US |
| Tài khoản sở hữu | Tài khoản quản trị dữ liệu (**không phải** tài khoản IT) |
| Đích | `app_lookup.lead_phone_lookup`, ghi đè toàn bộ |

> Scheduled query phải đứng tên tài khoản quản trị. Nếu đứng tên IT, IT có thể sửa điều kiện lọc trong câu refresh — tức là gián tiếp đổi được logic.

---

## 5. Bảng `app_lookup.lead_phone_lookup` — mô tả cột

Khoảng **67.700 dòng**, **64.300 số điện thoại duy nhất**.

| Cột | Kiểu | Ý nghĩa | Dùng ở đâu trên giao diện |
|---|---|---|---|
| `phone9` | STRING | 9 số cuối đã chuẩn hoá. **Khoá tra cứu duy nhất** | Không hiện |
| `match_source` | STRING | `phone` = lấy từ cột SĐT chính thức; `note` = trích từ ghi chú sale | Không hiện (dùng để debug) |
| `phone_goc` | STRING | Số điện thoại nguyên gốc trong hệ thống | Hiện ở dòng "SĐT đăng ký" |
| `name` | STRING | Tên khách trên lead | Tiêu đề "Khớp lead: …" |
| `lead_date` | DATE | Ngày lead xuất hiện | "15/07/2026" |
| `crm_code` | STRING | Mã kênh 6 số, ví dụ `300265` | Nhãn kênh |
| `ec` | STRING | Mã sale phụ trách lead | "sale EC042" |
| `status` | STRING | Trạng thái rút gọn: `L1`…`L8` | "trạng thái L4" |
| `status_2` | STRING | Nhãn đầy đủ, ví dụ `L4 Học thử xong chờ gọi` | Tooltip |
| `nation` | STRING | Quốc gia khách | Phân biệt khách trong nước / nước ngoài |
| `uid` | STRING | UID CRM của lead | Đối chiếu chéo |
| `source_name` | STRING | Tên nguồn gốc | Debug |

### Giá trị trạng thái

| `status` | Ý nghĩa | Số lượng |
|---|---|---|
| L1 | Chờ gọi / không nghe máy | ~13.600 |
| L2 | Đã liên lạc, chưa học thử | ~12.700 |
| L3 | Không vào học thử (L3.1–L3.4) | ~6.200 |
| L4 | Học thử xong, chờ gọi | ~17.900 |
| L5 | Đã gọi trả lộ trình | ~8.500 |
| L8 | Đã nộp đủ học phí | ~4.000 |

> Hệ thống L là **cộng dồn**: lead ở L4 đã đi qua L1–L3. Không được hiểu là các trạng thái loại trừ nhau.

---

## 6. Quy tắc chuẩn hoá số điện thoại (bắt buộc)

Chỉ dùng **9 chữ số cuối** làm khoá so khớp. Công thức gốc trên BigQuery:

```sql
RIGHT(REGEXP_REPLACE(phone, r'[^0-9]', ''), 9)
```

Diễn giải cho app: **xoá toàn bộ ký tự không phải chữ số, rồi lấy 9 ký tự cuối cùng.**

```javascript
function chuanHoaSdt(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;  // dưới 9 số coi như không hợp lệ
}
```

### Bảng ví dụ

| Sale nhập | Sau khi xoá ký tự lạ | `phone9` | Ghi chú |
|---|---|---|---|
| `0912 345 678` | `0912345678` | `912345678` | Dạng phổ biến nhất |
| `+84 912 345 678` | `84912345678` | `912345678` | Khớp với dòng trên — đúng |
| `84-912345678` | `84912345678` | `912345678` | Định dạng lưu trong hệ thống |
| `(091) 234-5678` | `0912345678` | `912345678` | |
| `81 90 1234 5678` (Nhật) | `819012345678` | `012345678` | ⚠️ Xem cảnh báo dưới |
| `12345678` | `12345678` | `null` | Dưới 9 số, không tra được |

### ⚠️ Hai nhóm rủi ro

| Nhóm | Số lượng | Rủi ro | Cách xử lý trên app |
|---|---|---|---|
| Số **dưới 9 chữ số** | 771 dòng | Không tạo được khoá tra cứu | Hiện thông báo "số không hợp lệ", không chạy tra cứu |
| Số **từ 12 chữ số trở lên** (khách nước ngoài) | 6.993 dòng | Lấy 9 số cuối của số quốc tế có thể trùng nhầm với số khác | Vẫn tra bình thường, nhưng bắt buộc cho sale xác nhận tên khách trước khi lưu |

---

## 7. API 1 — Tra cứu lead theo số điện thoại

### Đầu vào

| Tham số | Bắt buộc | Mô tả |
|---|---|---|
| `phone9` | Có | 9 số đã chuẩn hoá |
| `ngay_don` | Có | Ngày tạo đơn, dạng `YYYY-MM-DD` |
| `ec_sale` | Không | Mã sale đang thao tác, dùng để ưu tiên sắp xếp |

### Câu query

```sql
SELECT
  phone9, match_source, phone_goc, name, lead_date,
  crm_code, ec, status, status_2, nation, uid
FROM `daily-report-smai-to-openclaw.app_lookup.lead_phone_lookup`
WHERE phone9 = @phone9
  AND (lead_date IS NULL OR lead_date <= @ngay_don)
ORDER BY
  IF(lead_date IS NULL, 1, 0) ASC,      -- lead có ngày lên trước
  IF(ec = @ec_sale, 0, 1) ASC,          -- lead cùng sale lên trước
  lead_date DESC                         -- lead mới nhất lên trước
LIMIT 10;
```

> Thứ tự `ORDER BY` này sao chép đúng logic xếp hạng của `gmv_new`. **Không được đổi thứ tự** — nếu đổi, lead app hiện cho sale sẽ khác lead mà báo cáo chọn.

### Đầu ra — 3 trạng thái

| Trạng thái | Điều kiện | Giao diện |
|---|---|---|
| `MATCHED_ONE` | Trả về đúng 1 dòng | Khối xanh: "✓ Khớp lead: {name}" kèm ngày, kênh, sale, trạng thái L |
| `MATCHED_MANY` | Trả về từ 2 dòng trở lên | Khối xanh + danh sách radio để sale chọn. **Không được tự chọn dòng đầu** |
| `NOT_FOUND` | Không có dòng nào | Khối vàng: "⚠ Không tìm thấy số này trong dữ liệu marketing" + ô nhập số gốc + dropdown lý do |

### Ràng buộc chặn lưu

Ở trạng thái `NOT_FOUND`, **không cho bấm nút lưu** cho tới khi sale làm một trong hai việc: nhập số điện thoại gốc, hoặc chọn lý do. Thông báo lỗi: *"Chọn lý do hoặc nhập SĐT gốc trước khi lưu"*.

---

## 8. API 2 — Ghi lại số gốc / lý do sale nhập

### Câu lệnh ghi

```sql
INSERT INTO `daily-report-smai-to-openclaw.app_write.lead_phone_manual`
(pr_id, uid_crm, phone_thanh_toan, phone_lead_nhap, phone9,
 ly_do_code, ly_do_text, crm_code_chon, lead_date_chon,
 ec_nhap, nguon_kh, ghi_chu, created_at)
VALUES
(@pr_id, @uid_crm, @phone_thanh_toan, @phone_lead_nhap, @phone9,
 @ly_do_code, @ly_do_text, @crm_code_chon, @lead_date_chon,
 @ec_nhap, @nguon_kh, @ghi_chu, CURRENT_TIMESTAMP());
```

Với lượng vài trăm đơn/ngày thì `INSERT` thường là đủ. Nếu sau này vượt 1.000 lượt ghi/ngày, chuyển sang **BigQuery Storage Write API** để tránh chạm giới hạn số lệnh DML.

### Bảng mã lý do

| Giá trị dropdown trên giao diện | `ly_do_code` | Ý nghĩa phân tích |
|---|---|---|
| Khách tự tìm đến, không qua quảng cáo | `TU_TIM_DEN` | Đơn không thuộc quảng cáo — phải loại khỏi ROI |
| Người quen giới thiệu | `NGUOI_QUEN_GT` | Thực chất là đơn Referral |
| Khách cũ mua lại | `KHACH_CU_MUA_LAI` | Thực chất là đơn Renewal |
| Khách dùng số khác nhưng không nhớ | `SO_KHAC_KHONG_NHO` | Không xác định được |
| Khác (ghi chú vào ô Ghi chú) | `KHAC` | Đọc thêm ở cột `ghi_chu` |

> Bảng mã này chính là thứ cho phép đo lần đầu tiên tỷ lệ đơn Referral / khách tự tìm đến đang bị gán nhầm thành đơn New. Vì vậy **mã phải cố định, không được đổi tên về sau** — đổi mã là mất khả năng so sánh theo thời gian.

---

## 9. Điều kiện hiển thị khối kiểm tra lead

Khối kiểm tra chỉ hiện khi trường **Nguồn KH** thuộc nhóm có thể đến từ marketing:

| Nguồn KH | Hiện khối kiểm tra? |
|---|---|
| Quảng cáo | Có |
| Offline | Có |
| KOC | Có |
| Khác | Có |
| Giới thiệu | Không |
| Gia hạn | Không |
| Kho Chung | Không |

Khi sale đổi Nguồn KH sang nhóm "Không", phải **xoá sạch kết quả tra cứu đang hiển thị** để tránh lưu nhầm dữ liệu của lần tra trước.

---

## 10. Checklist nghiệm thu

| # | Tình huống kiểm thử | Kết quả đúng |
|---|---|---|
| 1 | Nhập số có đúng 1 lead | Hiện khối xanh, đủ 4 thông tin: tên, ngày, kênh, trạng thái L |
| 2 | Nhập số có nhiều lead | Hiện danh sách radio, **không có dòng nào được chọn sẵn ngoài dòng đầu**, sale đổi được |
| 3 | Nhập số chỉ tồn tại trong ghi chú (`match_source = 'note'`) | Vẫn phải khớp được |
| 4 | Nhập số không có trong kho | Hiện khối vàng, khoá nút lưu |
| 5 | Khối vàng, chưa nhập gì, bấm lưu | Hiện lỗi "Chọn lý do hoặc nhập SĐT gốc trước khi lưu" |
| 6 | Nhập `+84 912 345 678` và `0912345678` | Cho ra **cùng một kết quả** |
| 7 | Nhập số chỉ có 8 chữ số | Báo số không hợp lệ, không gọi API |
| 8 | Lead có ngày **sau** ngày đơn | Không được hiện ra |
| 9 | Đổi Nguồn KH sang "Gia hạn" | Khối kiểm tra biến mất và kết quả cũ bị xoá |
| 10 | Lưu đơn ở trạng thái không khớp | Kiểm tra bảng `lead_phone_manual` có đúng 1 dòng mới, `created_at` đúng giờ |
| 11 | Số điện thoại xuất hiện trong log ứng dụng | **Không được có** |

---

## 11. Lỗi thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Danh sách Datasets trống, không báo lỗi | Thiếu quyền cấp project | Cấp `bigquery.jobUser` ở cấp project, hoặc vào thẳng dataset bằng đường dẫn |
| `Access Denied: BigQuery: Permission denied` | Thiếu `bigquery.jobUser` | Xem Mục 3 |
| `Not found: Dataset ... was not found in location asia-southeast1` | Query chạy sai region | Đặt location = `US` |
| Tra số nào cũng "không tìm thấy" | Chuẩn hoá sai — quên xoá ký tự lạ hoặc lấy 10 số thay vì 9 | Đối chiếu lại Mục 6 |
| Lead mới về không tra được | Scheduled query chưa chạy, hoặc app cache quá lâu | Kiểm tra lịch refresh, giảm thời gian cache xuống ≤ 1 giờ |
| Tra được nhưng báo cáo vẫn tính "chưa khớp" | Thứ tự `ORDER BY` bị sửa | Khôi phục đúng thứ tự ở Mục 7 |

---

## 12. Những việc tuyệt đối không làm

1. Không chạy `CREATE`, `ALTER`, `DROP`, `UPDATE`, `DELETE` trên dataset `crm_leads`
2. Không sửa câu SQL của view `leads_all` và `gmv_new`
3. Không đổi công thức chuẩn hoá số điện thoại nếu chưa thống nhất với bộ phận dữ liệu
4. Không đổi tên hoặc bỏ mã trong bảng mã lý do
5. Không dùng tài khoản cá nhân làm tài khoản kết nối của app
6. Không xuất toàn bộ bảng tra cứu ra file hoặc hệ thống bên ngoài
7. Không ghi số điện thoại vào log, không gửi qua kênh chat công khai

---

## Phụ lục A — SQL tạo bảng tra cứu

Câu này đã chạy thử trên dữ liệu thật: cho ra **67.727 dòng / 64.349 số điện thoại duy nhất**, trong đó **1.423 dòng** đến từ ghi chú.

```sql
CREATE OR REPLACE TABLE `daily-report-smai-to-openclaw.app_lookup.lead_phone_lookup`
CLUSTER BY phone9 AS
WITH src AS (
  -- Nguồn 1: cột số điện thoại chính thức
  SELECT
    RIGHT(REGEXP_REPLACE(l.phone, r'[^0-9]',''), 9) AS phone9,
    'phone' AS match_source,
    l.phone AS phone_goc, l.name, l.uid, TRIM(l.ec) AS ec,
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared) AS lead_date,
    l.CRM_code_2 AS crm_code, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.phone,'') != ''

  UNION ALL

  -- Nguồn 2: số điện thoại sale ghi tay trong ghi chú
  SELECT pk9, 'note', l.phone, l.name, l.uid, TRIM(l.ec),
    SAFE.PARSE_DATE('%Y-%m-%d', l.date_leads_appeared),
    l.CRM_code_2, l.source_name, l.status, l.status_2, l.nation
  FROM `daily-report-smai-to-openclaw.crm_leads.leads_all` l
  CROSS JOIN UNNEST(ARRAY_CONCAT(
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9][0-9\.\-\(\)\+]{8,18}[0-9]')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15
            AND NOT REGEXP_CONTAINS(x, r'^[0-9]{1,3}(?:\.[0-9]{3})+$')),
    ARRAY(SELECT RIGHT(REGEXP_REPLACE(x, r'[^0-9]',''), 9)
          FROM UNNEST(REGEXP_EXTRACT_ALL(l.note, r'[0-9]{2,4}(?: [0-9]{2,8}){1,4}')) x
          WHERE LENGTH(REGEXP_REPLACE(x, r'[^0-9]','')) BETWEEN 9 AND 15)
  )) AS pk9
  WHERE l.CRM_code_2 IS NOT NULL AND COALESCE(l.note,'') != ''
)
SELECT * EXCEPT(rn) FROM (
  SELECT s.*,
    ROW_NUMBER() OVER (
      PARTITION BY phone9, COALESCE(uid,''),
                   COALESCE(CAST(lead_date AS STRING),''), crm_code
      ORDER BY IF(match_source='phone', 1, 2)   -- ưu tiên số chính thức hơn số trong ghi chú
    ) AS rn
  FROM src s
  WHERE LENGTH(phone9) = 9
)
WHERE rn = 1;
```

Hai điều kiện `WHERE` quan trọng, **không được bỏ**:
- `CRM_code_2 IS NOT NULL` — lead không xác định được kênh thì không dùng để quy nguồn
- `LENGTH(phone9) = 9` — loại số rác không đủ độ dài

---

## Phụ lục B — Thông số kho dữ liệu (18/08/2026)

| Chỉ số | Giá trị |
|---|---|
| Tổng lead trong `leads_all` | 67.247 |
| Lead có số điện thoại | 67.179 |
| Lead đủ điều kiện đối chiếu (có kênh + có ngày) | 67.224 |
| Số điện thoại duy nhất trong bảng tra cứu | 64.349 |
| Số điện thoại trỏ tới từ 2 lead trở lên | 2.806 (4,4%) |
| Số điện thoại **chỉ** tìm thấy trong ghi chú | 1.282 |
| Dòng có số dưới 9 chữ số | 771 |
| Dòng có số từ 12 chữ số trở lên (khách nước ngoài) | 6.993 |

---

## Liên hệ

Mọi thay đổi liên quan tới công thức chuẩn hoá số điện thoại, điều kiện lọc lead, hoặc thứ tự xếp hạng lead đều phải thống nhất với bộ phận dữ liệu marketing trước khi triển khai. Đây là các điểm mà app và báo cáo ROI bắt buộc phải giống hệt nhau.
