# Biên bản họp — Thống nhất một nguồn dữ liệu GMV

**Ngày:** 18/09/2026 · **Dự họp:** Josh, anh Hiếu, Chung, Minh

## Tóm tắt

Hiện có ba nơi cùng lưu số GMV nhưng lại không khớp nhau. Nguyên nhân: hai nơi dùng để phân tích — bảng BigQuery của anh Hiếu và kho dữ liệu của Eric — chỉ là **bản sao cũ** của All File, trong khi All File vẫn được chị Thu Hiền sửa tay mỗi ngày, nên càng để lâu càng lệch.

Cuộc họp thống nhất hướng xử lý từ gốc: **để All File tự cập nhật từ hai bảng gốc trên DingTalk** (bỏ khâu nhập tay), rồi gộp All File với dữ liệu GMV App thành **một bảng trung gian duy nhất** để cả BigQuery lẫn kho của Eric cùng lấy về. Việc cần làm ngay trong hôm nay là bắt đầu nối hai bảng DingTalk vào All File.

## Ba nơi đang lưu số GMV

- **All File** — Google Sheet của chị Thu Hiền. Đầy đủ nhất, nhưng hiện điền tay.
- **Bảng BigQuery của anh Hiếu** — dựng từ tháng 5/2026, chép từ All File một lần rồi không cập nhật lại.
- **Kho của Eric** — bảng Minh đẩy lên server. Thực chất đây là bản sao **sổ doanh thu của GMV App**, không phải chép thẳng từ All File.

## Vì sao lệch

Cả bảng BigQuery lẫn bảng của Eric đều chỉ chụp All File tại một thời điểm rồi đứng yên, còn All File thì vẫn được sửa số, sửa ngày, sửa nguồn liên tục. Khoảng cách vì thế lớn dần theo thời gian.

Riêng bảng của Eric còn một tầng dễ gây hiểu nhầm: nó là **sổ của GMV App**, mà sổ này lấy lịch sử từ All File bằng một lần nhập gộp hồi cuối tháng 5, sau đó chỉ thêm đơn mới chứ không sửa hay xóa đơn cũ. Nói cách khác, Eric đang so All File "sống" với một bản sao đã đông cứng — lệch là điều đương nhiên.

Về độ lệch thật: khi đối chiếu toàn bộ lịch sử, phần lớn "khác biệt" không phải là tiền mà chỉ khác nhãn đội sale hoặc khác định dạng ô; chênh doanh thu thật chỉ khoảng 0,4%.

Điểm mấu chốt: ngay cả All File cũng đang phụ thuộc vào việc nhập tay của một người — vừa chậm, vừa dễ sai. Nên giải pháp không dừng ở việc đồng bộ lại các bản sao, mà phải sửa từ gốc.

## Hướng đi đã thống nhất

```
   ┌─────────────────┐   ┌─────────────────┐
   │ Bảng DingTalk #1 │   │ Bảng DingTalk #2 │     ← dữ liệu gốc
   └────────┬─────────┘   └────────┬────────┘
            └──────────┬───────────┘
                       ▼
              ┌──────────────────┐
              │    ALL FILE      │             ← tự cập nhật, không nhập tay
              └────────┬─────────┘
                       │  (+ dữ liệu GMV App)
                       ▼
            ┌─────────────────────┐
            │   BẢNG TRUNG GIAN    │            ← nguồn chính thống duy nhất
            └──────────┬──────────┘
            ┌──────────┴──────────┐
            ▼                     ▼
      ┌──────────┐          ┌──────────┐
      │ BQ Hiếu  │          │ Kho Eric │
      └──────────┘          └──────────┘
```

1. Hai bảng trên DingTalk là dữ liệu gốc, tự động đổ về All File. Từ nay chỉ cần sửa trên DingTalk là All File tự cập nhật theo, không còn phụ thuộc chị Thu Hiền nhập tay.
2. All File cùng dữ liệu GMV App được gộp thành một bảng trung gian — đây là nguồn chính thống duy nhất.
3. BigQuery của anh Hiếu và kho của Eric đều lấy từ bảng trung gian này, không tự đi lấy chỗ khác nữa.

**Cách bảng trung gian lấy dữ liệu:** các ngày đã qua lấy theo All File (đã chốt, đầy đủ); dữ liệu trong ngày lấy theo GMV App (cập nhật tức thời). Cuối ngày so hai bên — bên nào đầy đủ hơn thì lấy bên đó; nếu cả hai đều thiếu mà bù được cho nhau thì ghép lại cho đủ.

## Ai làm gì

- **Minh** — kết nối các bảng và dựng cơ chế cập nhật liên tục: nối hai bảng DingTalk vào All File, dựng bảng trung gian, rồi trỏ BigQuery và kho Eric về bảng trung gian đó.
- **Chung** — đối soát dữ liệu: sau khi có bảng trung gian, kiểm tra ba nguồn (All File, BigQuery, kho Eric) đã khớp nhau chưa và xử lý phần còn lệch.
- **Anh Hiếu** — chuyển bảng BigQuery sang đọc bảng trung gian, bỏ bản import từ tháng 5.

## Bước tiếp theo

Ngay hôm nay: lấy link hai bảng DingTalk, xem cấu trúc dữ liệu rồi chốt cách nối vào All File. Quyền ghi All File đã có sẵn; phần dựng đồng bộ liên tục sẽ làm ngay sau khi xem xong hai bảng.

---

## Phụ lục kỹ thuật (nội bộ)

- **All File:** Google Sheet `1sEthbH-zcMavoQ1qi9J_CNnHAJoyt0gfsE-xsMW0LCc`, tab **SM Hanoi** + **HCM REV**. Quyền ghi đã có.
- **Hai bảng DingTalk:** dạng bảng tính thông minh (智能表格 / smart sheet) — đọc qua DingTalk Open API (`listRecords`, cần `workbookId` + `sheetId` + `operatorId`; có sự kiện file-change để cập nhật gần real-time). *Cần link 2 bảng để xem cấu trúc.*
- **Kho của Eric (ECS `47.237.174.122`, schema `raw`):**
  - `raw.so_doanh_thu` = mirror của Supabase `so_doanh_thu` (sổ GMV App), nạp bằng `/root/etl/gmv_app_load.py`. **Không phải bản chụp trực tiếp All File.**
  - `raw.hcm_revenue` = mirror tab HCM REV.
  - `raw.gmv_all` = VIEW trên ECS = `so_doanh_thu` (non-HCM) ∪ `raw.hcm_revenue`.
  - ETL chính (`etl_load.py`, 3×/ngày) còn đẩy thẳng sheet All File + Level HCM + CRM + payroll.
  - Eric đối chiếu (17/9) là All File ↔ `raw.so_doanh_thu`. ⏳ Cần xác nhận Eric hiện query bảng/view nào.
- **GMV App:** Supabase `so_doanh_thu` (prod `jozcvbbypwvzaefteoxn`).
- **Số neo tự-kiểm:** All File 183,03 tỷ vs kho dữ liệu 182,31 tỷ → chênh 720M (0,4%); undated sheet = 6.545.026.066 (khớp Eric).
- Chi tiết điều tra chênh lệch: `palfish-internal-notes/gmv-resync-handoff/HANDOFF.md`.
