# Bảng quy đổi tên sản phẩm trên hóa đơn — kính nhờ chị Thu Hiền duyệt

**Ngày lập:** 06/09/2026
**Người lập:** Minh
**Kính gửi:** Chị Thu Hiền

## Bối cảnh

Hiện tại khi xuất hóa đơn, phần mềm đang in nguyên tên gói theo mã nội bộ, ví dụ `2/W- NEW 24 PHI+2 HN`. Đây là tên kỹ thuật, khách hàng và cơ quan thuế đọc sẽ không hiểu.

Kế toán mong muốn tên sản phẩm trên hóa đơn được ghi theo dạng dễ hiểu, ví dụ *"Khóa học tiếng Anh 3 tháng giáo viên Philippines"*. Để phần mềm tự động chuyển đổi được, em cần một danh sách chuẩn: mỗi loại gói tương ứng với bao nhiêu tháng và tên sản phẩm ghi ra sao.

Em đã tự suy ra số tháng của từng gói dựa trên quy luật đặt tên (giải thích bên dưới) và đối chiếu với "Bảng giá triển khai gói Discovery 4M". Tuy nhiên, đây là chứng từ pháp lý nên em rất mong chị soát và xác nhận giúp trước khi em cho áp dụng.

## Cách em suy ra số tháng (để chị soát cho nhanh)

Tên gói nội bộ có hai kiểu đặt tên:

1. **Kiểu `X/W`** — chữ "W" là tuần, số đứng trước "W" là **số buổi học mỗi tuần**. Con số ở giữa tên là **số buổi học có trả phí**. Số tháng được tính bằng: **số buổi chia cho (số buổi mỗi tuần × 4 tuần)**.
   - Ví dụ: `2/W- NEW 48...` nghĩa là học 2 buổi/tuần, tổng 48 buổi → 48 ÷ (2 × 4) = **6 tháng**.

2. **Kiểu `N/M`** — chữ "M" là tháng, số đứng trước "M" **chính là số tháng của gói**, lấy thẳng con số đó.
   - Ví dụ: `12/M...` là gói **12 tháng**, `8/M...` là gói **8 tháng**. Ở kiểu này, số buổi chỉ thể hiện mức độ học dày hay thưa, không dùng để suy ra số tháng.

Hai lưu ý chung:
- **Số buổi tặng không được tính vào số tháng.** Phần cộng thêm như `+2`, `+5`, `+20`... là buổi khuyến mãi, em chỉ lấy số buổi trả phí để tính.
- **Về giáo viên:** ký hiệu `PHI` là giáo viên Philippines; ký hiệu `US-UK` là giáo viên bản ngữ (Âu – Mỹ).

## Bảng cần chị duyệt

Cột **"Số tháng đúng (chị Thu Hiền xác nhận)"** em xin để trống. Nhờ chị ghi **"OK"** nếu số tháng của em đúng, hoặc ghi lại con số đúng nếu em suy sai.

| STT | Loại gói (số buổi trả phí) | Giáo viên | Số tháng (Minh hiểu) | Số tháng đúng (chị Thu Hiền xác nhận) | Tên sản phẩm đề xuất ghi trên hóa đơn |
|-----|---------------------------|-----------|----------------------|----------------------------------------|----------------------------------------|
| 1  | 2/W · 24 buổi              | Philippines | 3  |  | Khóa học tiếng Anh 3 tháng giáo viên Philippines        |
| 2  | 2/W · 24 buổi              | Âu – Mỹ     | 3  |  | Khóa học tiếng Anh 3 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 3  | 2/W · 32 buổi              | Philippines | 4  |  | Khóa học tiếng Anh 4 tháng giáo viên Philippines        |
| 4  | 2/W · 32 buổi              | Âu – Mỹ     | 4  |  | Khóa học tiếng Anh 4 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 5  | 2/W · 48 buổi              | Philippines | 6  |  | Khóa học tiếng Anh 6 tháng giáo viên Philippines        |
| 6  | 2/W · 48 buổi              | Âu – Mỹ     | 6  |  | Khóa học tiếng Anh 6 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 7  | 2/W · 72 buổi *(xem mục hỏi 1)* | Philippines | 9  |  | Khóa học tiếng Anh 9 tháng giáo viên Philippines        |
| 8  | 2/W · 72 buổi *(xem mục hỏi 1)* | Âu – Mỹ     | 9  |  | Khóa học tiếng Anh 9 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 9  | 2/W · 96 buổi              | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 10 | 2/W · 96 buổi              | Âu – Mỹ     | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên bản ngữ (Âu – Mỹ) |
| 11 | 2/W · 144 buổi            | Philippines | 18 |  | Khóa học tiếng Anh 18 tháng giáo viên Philippines       |
| 12 | 2/W · 192 buổi            | Philippines | 24 |  | Khóa học tiếng Anh 24 tháng giáo viên Philippines       |
| 13 | 12/M · 30 buổi            | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 14 | 12/M · 60 buổi            | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 15 | 12/M · 90 buổi            | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 16 | 12/M · 120 buổi           | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 17 | 12/M · 150 buổi           | Philippines | 12 |  | Khóa học tiếng Anh 12 tháng giáo viên Philippines       |
| 18 | 8/M · 30 buổi             | Âu – Mỹ     | 8  |  | Khóa học tiếng Anh 8 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 19 | 8/M · 60 buổi             | Âu – Mỹ     | 8  |  | Khóa học tiếng Anh 8 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 20 | 8/M · 120 buổi            | Âu – Mỹ     | 8  |  | Khóa học tiếng Anh 8 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 21 | 3/W · 24 buổi             | Philippines | 2  |  | Khóa học tiếng Anh 2 tháng giáo viên Philippines        |
| 22 | 3/W · 48 buổi             | Philippines | 4  |  | Khóa học tiếng Anh 4 tháng giáo viên Philippines        |
| 23 | 3/W · 96 buổi             | Philippines | 8  |  | Khóa học tiếng Anh 8 tháng giáo viên Philippines        |
| 24 | 3/W · 48 buổi (gói Combo) | Âu – Mỹ     | 4  |  | Khóa học tiếng Anh 4 tháng giáo viên bản ngữ (Âu – Mỹ)  |
| 25 | 3/W · 120 buổi            | Âu – Mỹ     | 10 |  | Khóa học tiếng Anh 10 tháng giáo viên bản ngữ (Âu – Mỹ) |
| 26 | 5/W · 96 buổi (gói VIP) *(xem mục hỏi 3)* | Âu – Mỹ | Chưa chắc (khoảng 5) |  | *(chờ chị cho số tháng)* |

## Bốn điểm em chưa chắc, kính nhờ chị cho ý kiến

1. **Gói 72 buổi (2/W) — có phải 9 tháng không?**
   Theo công thức thì ra 9 tháng, nhưng trong bảng giá chính thức em không thấy có mốc gói 9 tháng. Không rõ đây là gói 9 tháng thật hay là một gói cũ/đặc biệt. Nhờ chị xác nhận giúp.

2. **Các gói kiểu `/M` — có lấy số đầu làm số tháng không?**
   Em hiểu `12/M` là 12 tháng và `8/M` là 8 tháng, còn số buổi chỉ thể hiện mức độ học. Nhờ chị xác nhận cách hiểu này có đúng không.

3. **Gói VIP `5/W · 96 buổi` ra số lẻ.**
   Nếu áp dụng công thức thì ra 4,8 tháng — con số lẻ, chắc chắn không đúng để ghi hóa đơn. Nhờ chị cho em số tháng chính xác của gói này.

4. **Cách viết tên sản phẩm — nhờ chị chốt giúp câu chữ:**
   - Với giáo viên `US-UK`, em đang tạm ghi là **"giáo viên bản ngữ (Âu – Mỹ)"**. Nếu chị muốn dùng cách gọi khác (ví dụ "giáo viên Âu Mỹ", "giáo viên bản xứ"...) thì nhờ chị sửa lại giúp.
   - Số tháng nên ghi là **"3 tháng"** hay **"03 tháng"** (hai chữ số)? Nhờ chị chọn định dạng thống nhất.

## Sau khi chị duyệt

Sau khi chị xác nhận số tháng và chốt câu chữ tên sản phẩm, em sẽ dùng bảng này làm danh sách chuẩn để phần mềm tự động đổi tên gói khi xuất hóa đơn.

Với những gói không có trong bảng (ví dụ tên gói nhập sai, gói lạ), phần mềm sẽ để trống ô tên sản phẩm để kế toán tự điền tay, tránh việc phần mềm đoán sai gây in nhầm trên chứng từ pháp lý.

Em cảm ơn chị đã hỗ trợ.
